import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

// Every plot is 400×400 CSS pixels. Fixed probes below use that logical frame;
// self-calibrating globe/extent tests retain their native physical pixel frame.
async function open(page, scene) {
  await page.goto(`/test/stage14-heatmap?scene=${scene}`);
  await page.waitForFunction(() => window.stage14Heatmap?.plot?.whenSettled);
  await page.locator("canvas").first().waitFor();
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false")))
    .toBe(true);
}

/** The exported PNG as a color lookup, with the render error (`which`: the page's reference plot). */
async function capture(page, which = "plot") {
  const result = await page.evaluate(async (which) => {
    const plot = window.stage14Heatmap[which];
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    const scene = new URL(location.href).searchParams.get("scene");
    const physical = ["chart-in-polar", "on-globe", "on-map", "root-globe"].includes(scene);
    canvas.width = physical ? image.width : 400; canvas.height = physical ? image.height : 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    return { width: canvas.width, height: canvas.height, error: plot.getRenderError(),
      data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
  }, which);
  result.color = (x, y) => {
    const [px, py] = [Math.round(x), Math.round(y)];
    if (px < 0 || py < 0 || px >= result.width || py >= result.height) return [255, 255, 255, 255];
    const i = (py * result.width + px) * 4;
    return result.data.slice(i, i + 4);
  };
  // The bounding box of every non-white pixel.
  result.extent = () => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < result.data.length; i += 4)
      if (result.data[i] < 240 || result.data[i + 1] < 240 || result.data[i + 2] < 240) {
        const x = (i / 4) % result.width, y = Math.floor(i / 4 / result.width);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    return { minX, maxX, minY, maxY };
  };
  return result;
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const same = (a, b) => distance(a, b) < 30;
const white = [255, 255, 255];
const degrees = Math.PI / 180;

/** Every point's color equals the first; the colors across a boundary differ. */
function expectCell(result, points) {
  const reference = result.color(...points[0]);
  expect(same(reference, white), JSON.stringify(points[0])).toBe(false);
  for (const point of points.slice(1))
    expect(same(result.color(...point), reference), JSON.stringify([point, result.color(...point), reference])).toBe(true);
  return reference;
}

test("a polar root Image draws annular cells whose edges are circles and rays", async ({ page }) => {
  await open(page, "polar-root");
  const result = await capture(page);
  expect(result.error).toBe("");
  // Radius 2 of [0, 2] is 200 pixels about (200, 200); angle 0 is right and
  // each of the four columns spans 90 degrees counterclockwise. Image row 0
  // is its top: the outer ring.
  const at = (angle, r) => [200 + 100 * r * Math.cos(angle * degrees), 200 - 100 * r * Math.sin(angle * degrees)];
  const palette = [];
  for (let column = 0; column < 4; column++) for (const [lo, hi] of [[1, 2], [0, 1]]) {
    const a = 90 * column;
    palette.push(expectCell(result, [at(a + 45, (lo + hi) / 2), at(a + 8, lo + 0.1), at(a + 82, hi - 0.1),
      at(a + 45, lo + 0.05), at(a + 45, hi - 0.05)]));
  }
  for (let i = 0; i < palette.length; i++) for (let j = 0; j < i; j++)
    expect(same(palette[i], palette[j]), `${i} ${j}`).toBe(false);
  // The ring edge at radius 1 is a circle within 3 pixels at every angle: an
  // 8-chord mesh would miss it by 7.6 pixels mid-chord.
  for (const angle of [5, 22.5, 40, 67.5, 112.5, 200, 292.5]) {
    const column = Math.floor(angle / 90);
    expect(same(result.color(...at(angle, 0.97)), palette[column * 2 + 1]), `${angle} inner`).toBe(true);
    expect(same(result.color(...at(angle, 1.03)), palette[column * 2]), `${angle} outer`).toBe(true);
    expect(same(result.color(...at(angle, 1.98)), palette[column * 2]), `${angle} rim`).toBe(true);
    expect(same(result.color(...at(angle, 2.03)), white), `${angle} outside`).toBe(true);
  }
});

test("a polar Heatmap picks the source angle and radius under the pointer", async ({ page }) => {
  await open(page, "polar-heatmap");
  expect((await capture(page)).error).toBe("");
  const canvas = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(canvas.x + 200 + 150 * Math.cos(45 * degrees), canvas.y + 200 - 150 * Math.sin(45 * degrees));
  await expect.poll(() => page.evaluate(() => window.stage14Heatmap.lastPick?.axisValue?.x)).toBeGreaterThan(0);
  const { axisValue } = await page.evaluate(() => window.stage14Heatmap.lastPick);
  expect(Math.abs(axisValue.x - 3)).toBeLessThan(0.05);
  expect(Math.abs(axisValue.y - 1.5)).toBeLessThan(0.02);
});

test("an Image in a linear child of log/log parents puts its cell edges on the logs", async ({ page }) => {
  await open(page, "log-parent");
  const result = await capture(page);
  expect(result.error).toBe("");
  // Child [0, 1] fills parent [10, 90]; the parent maps log10 [1, 100] to 400 px.
  const x = (u) => 200 * Math.log10(10 + 80 * u), y = (v) => 400 - 200 * Math.log10(10 + 80 * v);
  const cells = [];
  for (let column = 0; column < 4; column++) for (const [lo, hi] of [[0.5, 1], [0, 0.5]]) {
    const [u0, u1] = [column / 4, (column + 1) / 4];
    cells.push(expectCell(result, [[(x(u0) + x(u1)) / 2, (y(lo) + y(hi)) / 2],
      [x(u0) + 2, y(lo) - 2], [x(u1) - 2, y(hi) + 2], [x(u0) + 2, y(hi) + 2], [x(u1) - 2, y(lo) - 2]]));
  }
  for (let i = 0; i < cells.length; i++) for (let j = 0; j < i; j++) expect(same(cells[i], cells[j])).toBe(false);
  // Outside the child's range is blank.
  for (const point of [[x(0) - 3, y(0.5)], [x(1) + 3, y(0.5)], [x(0.5), y(1) - 3], [x(0.5), y(0) + 3]])
    expect(same(result.color(...point), white), JSON.stringify(point)).toBe(true);
});

test("a chart bent by a polar parent draws its Image as an annular half-ring", async ({ page }) => {
  await open(page, "chart-in-polar");
  const result = await capture(page);
  expect(result.error).toBe("");
  // Child x [0, 1] spans angles 0..180 and child y [0, 1] spans radii 1..2 of
  // the parent. The half-ring's extent fixes the parent's center and scale:
  // its flat bottom is the center row and its width is two outer radii.
  const box = result.extent(), scale = (box.maxX - box.minX + 1) / 4,
    center = [(box.minX + box.maxX + 1) / 2, box.maxY + 1];
  expect(Math.abs(box.maxY - box.minY + 1 - 2 * scale)).toBeLessThan(2);
  const at = (angle, r) => [center[0] + scale * r * Math.cos(angle * degrees), center[1] - scale * r * Math.sin(angle * degrees)];
  const palette = [];
  for (let column = 0; column < 4; column++) for (const [lo, hi] of [[1.5, 2], [1, 1.5]]) {
    const a = 45 * column;
    palette.push(expectCell(result, [at(a + 22.5, (lo + hi) / 2), at(a + 5, lo + 0.06), at(a + 40, hi - 0.06)]));
  }
  for (let i = 0; i < palette.length; i++) for (let j = 0; j < i; j++) expect(same(palette[i], palette[j])).toBe(false);
  for (const angle of [10, 30, 60, 100, 170]) {
    const column = Math.floor(angle / 45);
    expect(same(result.color(...at(angle, 1.47)), palette[column * 2 + 1]), `${angle}`).toBe(true);
    expect(same(result.color(...at(angle, 1.53)), palette[column * 2]), `${angle}`).toBe(true);
    expect(same(result.color(...at(angle, 0.95)), white)).toBe(true);
    expect(same(result.color(...at(angle, 2.05)), white)).toBe(true);
  }
  expect(same(result.color(...at(270, 1.5)), white)).toBe(true);
});

test("an Image in a pixel-anchored inset fills the same box as a Rect", async ({ page }) => {
  await open(page, "placed");
  const result = await capture(page);
  expect(result.error).toBe("");
  // Both 120 × 80 insets: the Image centered at (200, 200), the Rect at (200, 320).
  for (const [dx, dy] of [[-58, -38], [58, -38], [58, 38], [-58, 38]]) {
    expect(same(result.color(200 + dx, 200 + dy), white), `${dx} ${dy}`).toBe(false);
    expect(same(result.color(200 + dx, 320 + dy), white), `${dx} ${dy}`).toBe(false);
  }
  for (const [dx, dy] of [[-63, 0], [63, 0], [0, -43], [0, 43]]) {
    expect(same(result.color(200 + dx, 200 + dy), white), `${dx} ${dy}`).toBe(true);
    expect(same(result.color(200 + dx, 320 + dy), white), `${dx} ${dy}`).toBe(true);
  }
  // Four 30-pixel columns and two 40-pixel rows.
  const cells = [];
  for (let column = 0; column < 4; column++) for (const row of [0, 1]) {
    const x0 = 140 + 30 * column, y0 = 160 + 40 * row;
    cells.push(expectCell(result, [[x0 + 15, y0 + 20], [x0 + 2, y0 + 2], [x0 + 28, y0 + 38]]));
  }
  for (let i = 0; i < cells.length; i++) for (let j = 0; j < i; j++) expect(same(cells[i], cells[j])).toBe(false);
});

test("an Image on a chart warped onto a globe is cut at its limbs and turns warm", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page, "on-globe");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The dark Line along the middle row (latitude 0, longitude -150..150) is
  // cut at both limbs: its extent is the disk's diameter and center row.
  const dark = [];
  for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++) {
    const [r, g, b] = result.color(x, y);
    if (r < 60 && g < 60 && b < 60) dark.push([x, y]);
  }
  const xs = dark.map(([x]) => x), ys = dark.map(([, y]) => y);
  const R = (Math.max(...xs) - Math.min(...xs) + 1) / 2,
    center = [(Math.max(...xs) + Math.min(...xs) + 1) / 2, ys.reduce((a, b) => a + b) / ys.length];
  const at = (lon, lat, c = 0) => [center[0] + R * Math.cos(lat * degrees) * Math.sin((lon - c) * degrees),
    center[1] - R * Math.sin(lat * degrees)];
  // Columns span 75 degrees from -150; rows are latitudes 0..40 (top) and -40..0.
  const top = [-112.5, -37.5, 37.5, 112.5].map((lon) => at(lon, 20)),
    visible = [expectCell(result, [top[1], at(-70, 35), at(-5, 5)]), expectCell(result, [top[2], at(5, 35), at(70, 5)]),
      expectCell(result, [at(-37.5, -20), at(-70, -35), at(-5, -5)]), expectCell(result, [at(37.5, -20), at(5, -35), at(70, -5)])];
  for (let i = 0; i < visible.length; i++) for (let j = 0; j < i; j++) expect(same(visible[i], visible[j])).toBe(false);
  // The outer columns show only their 15 degrees before the limb.
  const sliver = result.color(...at(-84, 20));
  expect(same(sliver, white) || same(sliver, visible[0])).toBe(false);
  const outside = [];
  for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++)
    if (!same(result.color(x, y), white) && Math.hypot(x - center[0], y - center[1]) > R + 1.5) outside.push([x, y]);
  expect(outside, JSON.stringify(outside.slice(0, 4))).toEqual([]);
  // Turned 60 east, the last column faces the viewer and the first is hidden.
  await page.evaluate(() => window.stage14Heatmap.setCenter([30, 0]));
  await capture(page);
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14Heatmap.setCenter([60, 0]));
  await expect.poll(async () => same((await capture(page)).color(...at(112.5, 20, 60)), white)).toBe(false);
  const turned = await capture(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(turned.error).toBe("");
  expectCell(turned, [at(112.5, 20, 60), at(80, 35, 60), at(135, 10, 60)]);
  expect(same(turned.color(...at(112.5, 20, 60)), visible[0])).toBe(false);
  // The hidden first column (longitudes -150..-75) projects, unclipped, onto
  // the visible second one; the horizon cut keeps it from painting there.
  expect(same(turned.color(...at(37.5, 20, 60)), visible[1])).toBe(true);
  expect(same(turned.color(...at(-15, 20, 60)), visible[0])).toBe(true);
  const beyond = [];
  for (let y = 0; y < turned.height; y++) for (let x = 0; x < turned.width; x++)
    if (!same(turned.color(x, y), white) && Math.hypot(x - center[0], y - center[1]) > R + 1.5) beyond.push([x, y]);
  expect(beyond, JSON.stringify(beyond.slice(0, 4))).toEqual([]);
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys, existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter((key) => !existing.has(key)).length;
  }, before.renderKeys);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

test("a Heatmap in a chart on a root flat map spans the chart's longitudes and latitudes", async ({ page }) => {
  await open(page, "on-map");
  const result = await capture(page);
  expect(result.error).toBe("");
  // Equirectangular is linear: the chart's 120 x 60 degrees draw twice as wide as tall.
  const box = result.extent(), width = box.maxX - box.minX + 1, height = box.maxY - box.minY + 1;
  expect(height).toBeGreaterThan(20);
  expect(Math.abs(width / height - 2)).toBeLessThan(0.06);
});

test("a chart across a root map's antimeridian stays one piece, and repeats like the map", async ({ page }) => {
  await open(page, "on-map-seam");
  // Centered near 180 degrees: the chart's 60 x 60 degrees are one whole
  // square of four columns and two rows of cells.
  await page.evaluate(() => window.stage14Heatmap.plot.setViewport({ x: 1, y: 0.5, zoom: 1 }));
  await expect.poll(async () => {
    const box = (await capture(page)).extent();
    return box.minX > 100 && box.maxX < 300;
  }).toBe(true);
  const centered = await capture(page);
  expect(centered.error).toBe("");
  const box = centered.extent(), size = box.maxX - box.minX + 1;
  expect(Math.abs(size - (box.maxY - box.minY + 1))).toBeLessThan(3);
  const cell = (column, row) => [box.minX + (column + 0.5) * size / 4, box.minY + (row + 0.5) * size / 2];
  const colors = [0, 1, 2, 3].flatMap((column) => [0, 1].map((row) => expectCell(centered, [
    cell(column, row), cell(column + 0.2, row + 0.2), cell(column - 0.2, row - 0.2)])));
  for (let i = 0; i < colors.length; i++) for (let j = 0; j < i; j++) expect(same(colors[i], colors[j])).toBe(false);
  // Centered on 0 degrees, the chart shows at both edges, each side a copy
  // of the other, as every mark on the repeating map does.
  await page.evaluate(() => window.stage14Heatmap.plot.setViewport({ x: 0.5, y: 0.5, zoom: 1 }));
  await expect.poll(async () => {
    const box = (await capture(page)).extent();
    return box.maxX - box.minX > 300;
  }).toBe(true);
  const both = await capture(page);
  expect(same(both.color(200, (box.minY + box.maxY) / 2), white)).toBe(true);
});

test("a root orthographic Image shows its front hemisphere without a smear and turns warm", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page, "root-globe");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The disk fixes itself: its extent is the globe. Columns are 90 degrees of
  // longitude from -180; the top row is latitudes 0..90.
  const box = result.extent(), R = (box.maxX - box.minX + 1) / 2,
    center = [(box.minX + box.maxX + 1) / 2, (box.minY + box.maxY + 1) / 2];
  expect(Math.abs(box.maxY - box.minY + 1 - 2 * R)).toBeLessThan(2);
  const at = (lon, lat, c = 0) => [center[0] + R * Math.cos(lat * degrees) * Math.sin((lon - c) * degrees),
    center[1] - R * Math.sin(lat * degrees)];
  // Probes stay within 64 degrees of the center, clear of the limb's antialiasing.
  const front = [expectCell(result, [at(-45, 45), at(-60, 30), at(-20, 15), at(-20, 55)]),
    expectCell(result, [at(45, 45), at(60, 30), at(20, 15), at(20, 55)]),
    expectCell(result, [at(-45, -45), at(-60, -30), at(-20, -15), at(-20, -55)]),
    expectCell(result, [at(45, -45), at(60, -30), at(20, -15), at(20, -55)])];
  for (let i = 0; i < front.length; i++) for (let j = 0; j < i; j++) expect(same(front[i], front[j])).toBe(false);
  const outside = [];
  for (let y = 0; y < result.height; y++) for (let x = 0; x < result.width; x++)
    if (!same(result.color(x, y), white) && Math.hypot(x - center[0], y - center[1]) > R + 1.5) outside.push([x, y]);
  expect(outside, JSON.stringify(outside.slice(0, 4))).toEqual([]);
  // Turned 90 east, the last column comes into view; the hidden first one
  // never paints over the second it would project onto.
  await page.evaluate(() => window.stage14Heatmap.setCenter([45, 0]));
  await capture(page);
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14Heatmap.setCenter([90, 0]));
  await expect.poll(async () => same((await capture(page)).color(...at(135, 45, 90)), white)).toBe(false);
  const turned = await capture(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(turned.error).toBe("");
  const east = expectCell(turned, [at(135, 45, 90), at(150, 30, 90), at(110, 15, 90), at(110, 55, 90)]);
  for (const cell of front) expect(same(east, cell)).toBe(false);
  expect(same(turned.color(...at(45, 45, 90)), front[1])).toBe(true);
  expect(same(turned.color(...at(45, -45, 90)), front[3])).toBe(true);
  const beyond = [];
  for (let y = 0; y < turned.height; y++) for (let x = 0; x < turned.width; x++)
    if (!same(turned.color(x, y), white) && Math.hypot(x - center[0], y - center[1]) > R + 1.5) beyond.push([x, y]);
  expect(beyond, JSON.stringify(beyond.slice(0, 4))).toEqual([]);
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys, existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter((key) => !existing.has(key)).length;
  }, before.renderKeys);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

test("a root equal-earth Image fills the outline, cut at the seam through a cell", async ({ page }) => {
  await open(page, "root-equal-earth");
  const result = await capture(page);
  expect(result.error).toBe("");
  // Equal Earth's outline (±2.7066 by ±1.3174) fits the 400 pixels' width about (200, 200).
  const { jointForward } = await import("../../src/lib/plot/utils/mapProjections.js");
  const k = 200 / 2.7066299836960748;
  const at = (lambda, lat) => {
    const [x, y] = jointForward("equal-earth", lambda * degrees, lat * degrees);
    return [200 + k * x, 200 - k * y];
  };
  // Centered at 45°: the seam at -135° cuts the first column [-180°, -90°], which shows at
  // both edges; the other columns sit whole around the center.
  const leftRed = expectCell(result, [at(-160, 40), at(-170, 20), at(-150, 60)]);
  const rightRed = expectCell(result, [at(160, 40), at(170, 20), at(150, 60)]);
  expect(same(leftRed, rightRed)).toBe(true);
  const columns = [at(-90, 40), at(0, 40), at(90, 40)].map((point) => expectCell(result, [point]));
  for (const color of columns) expect(same(color, leftRed)).toBe(false);
  // Outside the curved outline: the map box's corners stay empty.
  for (const corner of [[3, 200 - k * 1.3], [397, 200 + k * 1.3]]) expect(same(result.color(...corner), white)).toBe(true);
});

test("a root Mercator Image still spans the map with its cells on the projection", async ({ page }) => {
  await open(page, "root-mercator");
  const result = await capture(page);
  expect(result.error).toBe("");
  // 400 pixels span 2π: 200 / π pixels per radian about (200, 200). Columns
  // are 90 degrees of longitude; rows meet at the equator; the map ends at
  // the Mercator images of ±80 degrees.
  const k = 200 / Math.PI, y = (lat) => 200 - k * Math.log(Math.tan(Math.PI / 4 + lat * degrees / 2));
  const box = result.extent();
  expect(Math.abs(box.minY - y(80))).toBeLessThan(1.5);
  expect(Math.abs(box.maxY + 1 - y(-80))).toBeLessThan(1.5);
  expect([box.minX, box.maxX]).toEqual([0, 399]);
  const cells = [];
  for (let column = 0; column < 4; column++) for (const [lo, hi] of [[0, 80], [-80, 0]]) {
    const x0 = 100 * column;
    cells.push(expectCell(result, [[x0 + 50, (y(lo) + y(hi)) / 2], [x0 + 3, y(hi) + 3], [x0 + 97, y(lo) - 3]]));
  }
  for (let i = 0; i < cells.length; i++) for (let j = 0; j < i; j++) expect(same(cells[i], cells[j])).toBe(false);
});

test("an Image in its own orthographic child shows the front hemisphere and turns warm", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page, "globe-child");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The disk is x in [-0.8, 0.8] of a [-1, 1] root: radius 160 about (200, 200).
  const R = 160, at = (lon, lat, c = 0) => [200 + R * Math.cos(lat * degrees) * Math.sin((lon - c) * degrees),
    200 - R * Math.sin(lat * degrees)];
  const front = [expectCell(result, [at(-45, 45), at(-60, 30), at(-20, 15)]),
    expectCell(result, [at(45, 45), at(60, 30), at(20, 15)]),
    expectCell(result, [at(-45, -45), at(-60, -30), at(-20, -15)]),
    expectCell(result, [at(45, -45), at(60, -30), at(20, -15)])];
  for (let i = 0; i < front.length; i++) for (let j = 0; j < i; j++) expect(same(front[i], front[j])).toBe(false);
  const outside = (image) => {
    const found = [];
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++)
      if (!same(image.color(x, y), white) && Math.hypot(x - 200, y - 200) > R + 1.5) found.push([x, y]);
    return found;
  };
  expect(outside(result)).toEqual([]);
  // Turned 90 east, the east column comes into view; nothing compiles or rebuilds.
  await page.evaluate(() => window.stage14Heatmap.setCenter([45, 0]));
  await capture(page);
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14Heatmap.setCenter([90, 0]));
  await expect.poll(async () => same((await capture(page)).color(...at(135, 45, 90)), white)).toBe(false);
  const turned = await capture(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  const east = expectCell(turned, [at(135, 45, 90), at(150, 30, 90), at(110, 15, 90)]);
  for (const cell of front) expect(same(east, cell)).toBe(false);
  expect(same(turned.color(...at(45, 45, 90)), front[1])).toBe(true);
  expect(outside(turned)).toEqual([]);
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys, existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter((key) => !existing.has(key)).length;
  }, before.renderKeys);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

test("an Image in a placed map inset spans its map with cells at 90-degree longitudes", async ({ page }) => {
  await open(page, "map-inset");
  const result = await capture(page);
  expect(result.error).toBe("");
  // A 100-pixel placement spans the map's 360 degrees about (200, 200).
  const x = (lon) => 200 + lon * 100 / 360, y = (lat) => 200 - lat * 100 / 360;
  const box = result.extent();
  expect(Math.abs(box.minX - x(-180))).toBeLessThan(1.5);
  expect(Math.abs(box.maxX + 1 - x(180))).toBeLessThan(1.5);
  expect(Math.abs(box.minY - y(90))).toBeLessThan(1.5);
  expect(Math.abs(box.maxY + 1 - y(-90))).toBeLessThan(1.5);
  const cells = [];
  for (let column = 0; column < 4; column++) for (const [lo, hi] of [[0, 90], [-90, 0]]) {
    const lon0 = -180 + 90 * column;
    cells.push(expectCell(result, [[x(lon0 + 45), y((lo + hi) / 2)], [x(lon0) + 3, y(hi) + 3], [x(lon0 + 90) - 3, y(lo) - 3]]));
  }
  for (let i = 0; i < cells.length; i++) for (let j = 0; j < i; j++) expect(same(cells[i], cells[j])).toBe(false);
});

test("a chart across a placed map inset's antimeridian wraps to its west edge", async ({ page }) => {
  // The inset is 360 x 180 pixels about (200, 200), one pixel per degree. The
  // chart's columns span 150..165, 165..180, 180..195 and 195..210 degrees:
  // the last two wrap to -180..-165 and -165..-150.
  await open(page, "inset-seam");
  const result = await capture(page);
  expect(result.error).toBe("");
  const x = (lon) => 200 + lon, y = (lat) => 200 - lat;
  const column = (lon) => [0, 1].map((row) => expectCell(result, [[x(lon), y(row ? -15 : 15)],
    [x(lon) - 4, y(row ? -15 : 15) - 4], [x(lon) + 4, y(row ? -15 : 15) + 4]]));
  const cells = [column(157.5), column(172.5), column(-172.5), column(-157.5)].flat();
  for (let i = 0; i < cells.length; i++) for (let j = 0; j < i; j++) expect(same(cells[i], cells[j])).toBe(false);
  // Nothing between the two pieces, and nothing past the inset's edges.
  for (const lon of [-120, 0, 120]) expect(same(result.color(x(lon), 200), white)).toBe(true);
  expect(same(result.color(x(-185), 200), white)).toBe(true);
  expect(same(result.color(x(185), 200), white)).toBe(true);
});


// TODO 51: grid tables. Each scene's plots are 400 x 400 CSS pixels with no axes.
test("a Heatmap of uneven latitudes draws the field its evenly gridded twin does, flat and on the globe", async ({ page }) => {
  for (const scene of ["grid-uneven", "grid-uneven-globe"]) {
    await open(page, scene);
    const [uneven, even] = [await capture(page), await capture(page, "reference")];
    expect([uneven.error, even.error]).toEqual(["", ""]);
    // The field is its latitude (colors saturate past 80 degrees): where both draw, the colors
    // agree. Without the remap the uneven rows' values would sit evenly, up to 20 degrees off.
    let compared = 0, worst = 0;
    for (let y = 30; y < 370; y += 7) for (let x = 20; x < 380; x += 40) {
      const a = uneven.color(x, y), b = even.color(x, y);
      if (same(a, white) || same(b, white)) continue;
      compared++;
      worst = Math.max(worst, distance(a, b));
    }
    expect(compared, scene).toBeGreaterThan(scene === "grid-uneven" ? 400 : 100);
    expect(worst, scene).toBeLessThan(16);
  }
});

test("a curvilinear grid draws its own cells: a sheared grid is a parallelogram", async ({ page }) => {
  await open(page, "grid-curvilinear");
  const result = await capture(page);
  expect(result.error).toBe("");
  // x [-1, 5] and y [-1, 3] over 400 px. The corners are the centres extended half a cell:
  // bottom edge y = -0.5 from x = -0.75, top edge y = 2.5 from x = 0.75, each 3 wide.
  const at = (x, y) => [(x + 1) / 6 * 400, (3 - y) / 4 * 400];
  for (const [x, y] of [[0.75, 0], [2, 1], [3, 2.2], [1, 2.3]]) expect(same(result.color(...at(x, y)), white), `${x}, ${y}`).toBe(false);
  // Inside the bounding box, outside the parallelogram.
  for (const [x, y] of [[0, 2.2], [3.4, 0], [-0.5, 1.5], [3.5, 1]]) expect(same(result.color(...at(x, y)), white), `${x}, ${y}`).toBe(true);
});

test("a Filter hides cells of a gridded Heatmap: they draw nothing and show no tooltip", async ({ page }) => {
  await open(page, "grid-filter");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The kept row (v 3 and 4, latitudes 1 to 2) draws; the hidden row (0 to 1) is white.
  for (const x of [0.125, 0.875]) {
    expect(same(result.color(x * result.width, 0.25 * result.height), white)).toBe(false);
    expect(same(result.color(x * result.width, 0.75 * result.height), white)).toBe(true);
  }
  // A kept cell's tooltip names its coordinates and value; a hidden cell has none.
  const box = await page.locator("canvas").first().boundingBox();
  const tooltip = () => page.evaluate(() => document.querySelector(".plot-tooltip")?.innerText ?? null);
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await expect.poll(tooltip).toBe("lon\t0.5\nlat\t1.5\nv\t3");
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75);
  await expect.poll(tooltip).toBe(null);
});

test("an Image of { r, g, b } columns on a grid table draws its data= twin", async ({ page }) => {
  await open(page, "grid-image");
  const [grid, twin] = [await capture(page), await capture(page, "reference")];
  expect([grid.error, twin.error]).toEqual(["", ""]);
  for (const [x, y] of [[65, 100], [200, 100], [335, 100], [65, 300], [200, 300], [335, 300]]) {
    expect(same(grid.color(x, y), white)).toBe(false);
    expect(same(grid.color(x, y), twin.color(x, y)), `${x}, ${y}`).toBe(true);
  }
});

test("longitudes a Calculate wrapped to -180..180 draw the unwrapped field, shifted", async ({ page }) => {
  await open(page, "grid-wrap");
  const [wrapped, unwrapped] = [await capture(page), await capture(page, "reference")];
  expect([wrapped.error, unwrapped.error]).toEqual(["", ""]);
  // Each plot spans 360 degrees over 400 px: the wrapped from -135, the unwrapped from -45.
  const px = (lon, start) => (lon - start) / 360 * 400;
  for (const lon of [-90, -60, 0, 45, 90, 135, 180])
    expect(same(wrapped.color(px(lon, -135), 200), unwrapped.color(px(lon < -45 ? lon + 360 : lon, -45), 200)), String(lon)).toBe(true);
});

test("a Slice through time over a grid table blends two steps per move, with no readback", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page, "grid-slice");
  const colorAt = async () => (await capture(page)).color(100, 300);
  await page.evaluate(() => window.stage14Heatmap.setAt(0));
  await page.evaluate(() => window.stage14Heatmap.plot.whenSettled());
  const first = await colorAt();
  expect(same(first, white)).toBe(false);
  await page.waitForTimeout(150);
  const before = await gpuCounters(page);
  // Moving `at` (a Playback would, every frame): one blend of two slabs, nothing read back.
  for (const at of [0.25, 0.5, 0.75, 1, 1.5]) {
    await page.evaluate((at) => window.stage14Heatmap.setAt(at), at);
    await page.evaluate(() => window.stage14Heatmap.plot.whenSettled());
  }
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.readbackKinds.jax).toBe(0);
  const last = await colorAt();
  expect(same(first, last)).toBe(false);
});

test("a small plain grid draws sharp cells on its indices, row 0 at the bottom (TODO 134.15)", async ({ page }) => {
  await open(page, "matrix");
  const [sharp, blended] = [await capture(page), await capture(page, "reference")];
  expect([sharp.error, blended.error]).toEqual(["", ""]);
  const bounds = await page.evaluate(() => {
    const frame = window.stage14Heatmap.plot.getAxes()[0].getFrameOptions();
    return [frame.get("xbounds"), frame.get("ybounds")];
  });
  expect(bounds).toEqual([[-0.5, 3.5], [-0.5, 3.5]]);
  // Each cell is 100 px square: column j from x = 100 j, row i up from the bottom.
  const at = (row, column, dx = 0, dy = 0) => [50 + 100 * column + dx, 350 - 100 * row + dy];
  const gray = (result, ...point) => result.color(...point)[0];
  for (const [row, column] of [[0, 0], [1, 2], [3, 3]]) {
    const centre = gray(sharp, ...at(row, column));
    for (const [dx, dy] of [[-46, 0], [46, 0], [0, -46], [0, 46], [45, 45]])
      expect(Math.abs(gray(sharp, ...at(row, column, dx, dy)) - centre), JSON.stringify([row, column, dx, dy])).toBeLessThan(3);
  }
  // Brighter rightwards and upwards, stepping at the cells' edges.
  expect(gray(sharp, 197, 350)).toBeLessThan(gray(sharp, 203, 350) - 4);
  expect(gray(sharp, 50, 203)).toBeLessThan(gray(sharp, 50, 197) - 4);
  expect(gray(sharp, ...at(3, 3))).toBeGreaterThan(gray(sharp, ...at(0, 0)) + 100);
  // pixelated={false} blends: a cell's edge is between its centre and its neighbor's.
  expect(Math.abs(gray(blended, 50, 205) - gray(blended, ...at(1, 0)))).toBeGreaterThan(4);
});

test("a plain grid beside a far mark keeps its cells on their indices (TODO 134.15)", async ({ page }) => {
  await open(page, "matrix-far");
  const result = await capture(page);
  expect(result.error).toBe("");
  const [lo, hi] = await page.evaluate(() => window.stage14Heatmap.plot.getAxes()[0].getFrameOptions().get("xbounds"));
  expect(hi).toBeGreaterThanOrEqual(10);
  const px = (x) => (400 * (x - lo)) / (hi - lo), gray = (x) => result.color(px(x), 350)[0];
  // Row 0's column j (gray 17 j) at x = j, and nothing past the last cell's edge at 3.5.
  for (const column of [0, 1, 2, 3]) expect(Math.abs(gray(column) - 17 * column), String(column)).toBeLessThan(6);
  expect(result.color(px(5), 350).slice(0, 3)).toEqual([255, 255, 255]);
  // The Rect drawn on the grid at (2, 2) sits on cell (2, 2): red there, the grid's gray beside it.
  const [ylo, yhi] = await page.evaluate(() => window.stage14Heatmap.plot.getAxes()[0].getFrameOptions().get("ybounds"));
  const red = (x) => result.color(px(x), (400 * (yhi - 2)) / (yhi - ylo));
  expect(red(2)[0] - red(2)[1]).toBeGreaterThan(150);
  expect(Math.abs(red(1)[0] - red(1)[1])).toBeLessThan(6);
});


test.describe("categorical matrix cell identity", () => {
  test.use({ deviceScaleFactor: 2 });
  for (const inverted of [false, true]) test(`matrix cells match labeled row and column indices, inverted=${inverted}`, async ({ page }) => {
    await open(page, "matrix-categorical" + (inverted ? "&invert" : ""));
    const [matrix, rectangles] = [await capture(page), await capture(page, "reference")];
    expect([matrix.error, rectangles.error]).toEqual(["", ""]);
    const layout = await page.evaluate(() => window.stage14Heatmap.plot.getAxisLayout());
    for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
      const x = layout.left + (column + .5) / 4 * (layout.right - layout.left);
      const y = layout.top + (row + .5) / 4 * (layout.bottom - layout.top);
      expect(distance(matrix.color(x, y), rectangles.color(x, y)), `cell ${row},${column}`).toBeLessThan(8);
    }
  });
});
