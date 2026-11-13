import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

/**
 * Runs in the page: the plot's exported pixels of the four fixture colors, each counted only in
 * its quadrant (`quadrants`: color -> [sign of dx, sign of dy] from the center, y down), with
 * their centroids, their farthest distance from the center, the vector SVG and the plot's error.
 */
async function quadrantColors(quadrants) {
  const plot = window.stage14PolarSectors.plot;
  await plot.whenSettled();
  const image = await createImageBitmap(await plot.exportPNG());
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0); image.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const counts = { red: 0, green: 0, blue: 0, orange: 0 }, centroids = {}, reach = {};
  const isPie=window.stage14PolarSectors.pie != null,l=plot.getAxisLayout(),scale=canvas.width/400;
  const center=isPie?[(l.left+l.right)*scale/2,(l.top+l.bottom)*scale/2]:[canvas.width/2,canvas.height/2];
  const at = (color, dx, dy) => dx * quadrants[color][0] > 20 && dy * quadrants[color][1] > 20;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const offset = (y * canvas.width + x) * 4,
      r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2],
      dx = x - center[0], dy = y - center[1];
    let color;
    if (r > 120 && r > g * 1.5 && r > b * 1.5 && g < 90) color = "red";
    else if (g > 90 && g > r * 1.3 && g > b * 1.1) color = "green";
    else if (b > 110 && b > r * 1.4 && b > g * 1.2) color = "blue";
    else if (r > 130 && g > 60 && r > b * 1.5) color = "orange";
    if (color && at(color, dx, dy)) {
      counts[color]++;
      const centroid = centroids[color] ??= [0, 0];
      centroid[0] += x; centroid[1] += y;
      reach[color] = Math.max(reach[color] ?? 0, Math.hypot(dx + 0.5, dy + 0.5));
    }
  }
  for (const color of Object.keys(centroids)) centroids[color] = centroids[color].map((v) => v / counts[color]);
  const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
  return { counts, centroids, reach, svg, error: plot.getRenderError(), size: [canvas.width, canvas.height], radius:isPie?Math.min(l.right-l.left,l.bottom-l.top)*.45:180 };
}
const ready = (page) => page.waitForFunction(() => window.stage14PolarSectors?.plot?.whenSettled &&
  [...document.querySelectorAll(".canvas")].some((element) => element.getAttribute("aria-busy") === "false"));

test("polar Rect sectors render four quadrants, pick source values and export vector paths", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/stage14-polar-sectors");
  await page.waitForFunction(() => window.stage14PolarSectors?.plot?.whenSettled);
  await page.locator("canvas").first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].some((element) => element.getAttribute("aria-busy") === "false"));
  const guides = page.locator('svg[aria-label="Polar coordinate axes"]');
  await expect(guides).toHaveCount(1);
  expect(await guides.locator("ellipse").count()).toBeGreaterThanOrEqual(3);
  expect(await guides.locator("line").count()).toBeGreaterThanOrEqual(4);
  const spokes = await guides.evaluate((svg) => {
    const ring = svg.querySelector("ellipse"), cx = Number(ring.getAttribute("cx")), cy = Number(ring.getAttribute("cy"));
    return [...svg.querySelectorAll("line")].filter((line) =>
      Math.abs(Number(line.getAttribute("x1")) - cx) < 1 &&
      Math.abs(Number(line.getAttribute("y1")) - cy) < 1).map((line) =>
      [Number(line.getAttribute("x2")) - cx, Number(line.getAttribute("y2")) - cy]);
  });
  expect(spokes.some(([x, y]) => Math.abs(x) < 2 && y < -60)).toBe(true);
  expect(spokes.some(([x, y]) => x > 60 && Math.abs(y) < 2)).toBe(true);
  const result = await page.evaluate(quadrantColors, {
    // Polar angles run counter-clockwise from east: red, green, blue and orange quadrants.
    red: [1, -1], green: [-1, -1], blue: [-1, 1], orange: [1, 1],
  });
  expect(result.error).toBe("");
  for (const count of Object.values(result.counts)) expect(count).toBeGreaterThan(100);
  expect((result.svg.match(/<path\b/g) ?? []).length).toBeGreaterThanOrEqual(4);
  expect(result.svg).not.toContain("<image");
  const bounds = await page.locator("canvas").first().boundingBox();
  const [x, y] = result.centroids.red;
  await page.mouse.click(bounds.x + x * bounds.width / result.size[0],
    bounds.y + y * bounds.height / result.size[1]);
  await expect.poll(() => page.evaluate(() => window.stage14PolarSectors.pick?.quadrant)).toBe("red");
  const picked = await page.evaluate(() => window.stage14PolarSectors.pick.axisValue);
  expect(picked.x).toBeGreaterThan(0);
  expect(picked.x).toBeLessThan(6);
  expect(picked.y).toBeGreaterThan(1);
  expect(picked.y).toBeLessThan(2);
  await expect(page.evaluate(() => window.stage14PolarSectors.plot.exportSVG({
    mode: "vector", primitiveBudget: 5,
  }))).rejects.toThrow(/a vector export of .* needs more than [\d,]+ primitives/);
  const budgeted = await page.evaluate(async () => {
    const output = await window.stage14PolarSectors.plot.exportSVG({ mode: "auto", primitiveBudget: 5 });
    return { svg: await output.blob.text(), warnings: output.report.warnings };
  });
  expect(budgeted.svg).toContain("<image");
  expect(budgeted.warnings.some((warning) => warning.includes("vector primitive budget"))).toBe(true);

  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14PolarSectors.setPeriod(48));
  await expect.poll(() => page.evaluate(() => window.stage14PolarSectors.period)).toBe(48);
  await page.evaluate(async () => {
    await window.stage14PolarSectors.plot.whenSettled();
    await window.stage14PolarSectors.plot.exportPNG();
  });
  const work = await countersDelta(page, before, await gpuCounters(page));
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys,
      existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter(key => !existing.has(key)).length;
  }, before.renderKeys);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

// TODO 39.4: a Pie in a Cartesian Plot places its own polar Frame. Its sectors run clockwise
// from 12 o'clock (d3.pie's convention): North, East, South, West fill the top-right,
// bottom-right, bottom-left and top-left quadrants, and a click reports the row.
test("a Pie in a Cartesian Plot draws its sectors clockwise from 12 o'clock and picks their rows", async ({ page }) => {
  await page.goto("/test/stage14-polar-sectors?scene=pie");
  await ready(page);
  const result = await page.evaluate(quadrantColors, { red: [1, -1], green: [1, 1], blue: [-1, 1], orange: [-1, -1] });
  expect(result.error).toBe("");
  for (const count of Object.values(result.counts)) expect(count, JSON.stringify(result.counts)).toBeGreaterThan(5000);
  // The disk spans 90% of the plot's 400 CSS pixels (radius 180), centered: every quadrant's
  // color reaches that far from the center (the export has the screen's pixel ratio).
  const scale = result.size[0] / 400;
  for (const reach of Object.values(result.reach)) expect(Math.abs(reach / scale - result.radius), JSON.stringify(result.reach)).toBeLessThan(3);
  const [x, y] = result.centroids.red;
  // Vector export draws each sector in its category's color.
  for (const fill of ["#d22b2b", "#249a49", "#245cc0", "#df8e20"]) expect(result.svg).toContain(`fill="${fill}"`);
  expect(result.svg).not.toContain("<image");
  const bounds = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(bounds.x + x * bounds.width / result.size[0], bounds.y + y * bounds.height / result.size[1]);
  await expect.poll(() => page.evaluate(() => window.stage14PolarSectors.pick?.rowIndex)).toBe(0);
  // The pick is in the Pie's Frame: degrees counter-clockwise from east, radius 0 to 1.
  const picked = await page.evaluate(() => window.stage14PolarSectors.pick.axisValue);
  expect(picked.x).toBeGreaterThan(1);
  expect(picked.x).toBeLessThan(89);
  expect(picked.y).toBeGreaterThan(0);
  expect(picked.y).toBeLessThan(1);
  // Its uv: the position along the sector and across its ring, 0 to 1 (the centroid, mid-way).
  const [u, v] = await page.evaluate(() => window.stage14PolarSectors.pick.uv);
  expect(Math.abs(u - 0.5)).toBeLessThan(0.2);
  expect(v).toBeGreaterThan(0);
  expect(v).toBeLessThan(1);
});

// TODO 134.28: a large sector's rim is round at the size it is drawn. Sixteen segments a sector,
// as before, sagged 3.5 pixels between corners on North's 250 degrees.
test("a Pie's rim stays within half a pixel of a circle", async ({ page }) => {
  await page.goto("/test/stage14-polar-sectors?scene=pie");
  await ready(page);
  const rim = await page.evaluate(async () => {
    const f = window.stage14PolarSectors;
    f.setSales([7, 1, 1, 1]);
    await f.plot.whenSettled();
    await f.plot.whenAnimationsFinished();
    const image = await createImageBitmap(await f.plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const l = f.plot.getAxisLayout(), scale = canvas.width / 400;
    const center = [(l.left + l.right) * scale / 2, (l.top + l.bottom) * scale / 2],
      R = Math.min(l.right - l.left, l.bottom - l.top) * 0.45 * scale;
    // How far from white, bilinear.
    const ink = (x, y) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const at = (u, v) => { const o = (v * canvas.width + u) * 4; return 255 - Math.min(pixels[o], pixels[o + 1], pixels[o + 2]); };
      return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    };
    // Rays across North (12 o'clock to 251 degrees clockwise), the rim where the ink fades: its
    // coverage summed outward from 90% of the radius.
    const out = [];
    for (let degrees = 10; degrees <= 240; degrees += 2) {
      const t = (degrees - 90) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t),
        full = ink(center[0] + c * R * 0.9, center[1] + s * R * 0.9);
      let r = R * 0.9;
      for (let d = R * 0.9; d < R * 1.1; d += 0.25) r += 0.25 * Math.min(1, ink(center[0] + c * d, center[1] + s * d) / full);
      out.push([t, r / scale]);
    }
    return out;
  });
  // Least squares r = R + a cos t + b sin t (the center may be a little off): the residuals.
  const rows = rim.map(([t]) => [1, Math.cos(t), Math.sin(t)]);
  const normal = [0, 1, 2].map((i) => [0, 1, 2].map((j) => rows.reduce((sum, row) => sum + row[i] * row[j], 0))),
    right = [0, 1, 2].map((i) => rows.reduce((sum, row, k) => sum + row[i] * rim[k][1], 0));
  for (let i = 0; i < 3; i++) for (let k = i + 1; k < 3; k++) {
    const f = normal[k][i] / normal[i][i];
    for (let j = i; j < 3; j++) normal[k][j] -= f * normal[i][j];
    right[k] -= f * right[i];
  }
  const solved = [0, 0, 0];
  for (let i = 2; i >= 0; i--) solved[i] = (right[i] - [1, 2].filter((j) => j > i).reduce((sum, j) => sum + normal[i][j] * solved[j], 0)) / normal[i][i];
  const residual = rows.map((row, k) => Math.abs(rim[k][1] - row.reduce((sum, v, i) => sum + v * solved[i], 0)));
  expect(Math.max(...residual), JSON.stringify(rim)).toBeLessThan(0.5);
});

// A keyed update tweens the angles: North grows from a quarter to a half over 600 ms, its start
// angle passing through the values between, frame after frame (not one jump).
test("a keyed Pie update tweens its sectors' angles over frames", async ({ page }) => {
  await page.goto("/test/stage14-polar-sectors?scene=pie");
  await ready(page);
  const result = await page.evaluate(async () => {
    const f = window.stage14PolarSectors;
    await f.plot.whenSettled();
    const mark = f.pie.getMark(), renderer = mark.renderer, device = renderer.backend.device;
    const { markAnimation } = await import("/src/lib/plot/utils/markAnimation.js");
    for (let frame = 0; frame < 300 && !markAnimation(mark).ready; frame++)
      await new Promise((resolve) => requestAnimationFrame(resolve));
    // Each row's lower corner: [start angle, inner radius, 0, _].
    const read = async () => {
      const field = mark.fields.get("position"), count = field.count;
      const staging = device.createBuffer({ size: Math.max(16, count * 16), usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(renderer.backend.get(field.bufferNodeSource).buffer, 0, staging, 0, count * 16);
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const values = Array.from(new Float32Array(staging.getMappedRange()));
      staging.destroy();
      return Array.from({ length: count }, (_, i) => values[i * 4]);
    };
    const first = await read();
    const samples = [], started = performance.now();
    f.setSales([3, 1, 1, 1]);
    while (performance.now() - started < 1100) {
      samples.push({ frame: mark.view.lifecycle.completedFrame, north: (await read())[0] });
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await f.plot.whenAnimationsFinished();
    return { first, samples, last: await read(), error: f.plot.getRenderError() };
  });
  expect(result.error).toBe("");
  // North's sector starts at 90 - 89 = 1 degree (a 2 degree pad) and ends up at 90 - 177.
  expect(result.first[0]).toBeCloseTo(1, 3);
  expect(result.last[0]).toBeCloseTo(-87, 3);
  const between = result.samples.filter((s) => s.north < -5 && s.north > -80);
  expect(between.length, JSON.stringify(result.samples)).toBeGreaterThan(2);
  // Those values came from distinct drawn frames: the tween advanced frame by frame.
  expect(new Set(between.map((s) => s.frame)).size).toBeGreaterThan(2);
});
