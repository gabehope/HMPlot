import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

// Every plot is 400×400 CSS pixels; convert PNG positions back from device pixels.
async function open(page, scene) {
  await page.goto(`/test/stage14-geojson?scene=${scene}`);
  await page.waitForFunction(() => window.stage14GeoJSON?.plot?.whenSettled);
  await page.locator("canvas").first().waitFor();
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false")))
    .toBe(true);
}

/** The auto SVG export's stroke polylines by color, and whether it holds an image. */
function strokes(page) {
  return page.evaluate(async () => {
    const output = await window.stage14GeoJSON.plot.exportSVG({ mode: "auto" });
    const doc = new DOMParser().parseFromString(await output.blob.text(), "image/svg+xml"), byColor = {};
    for (const path of doc.querySelectorAll("path")) {
      const stroke = path.getAttribute("stroke");
      if (!stroke || stroke === "none") continue;
      const parts = (path.getAttribute("d") ?? "").split("M").filter(Boolean).map((part) =>
        [...("M" + part).matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)].map((m) => [+m[1], +m[2]]));
      (byColor[stroke] ??= []).push(...parts);
    }
    return { byColor, outcomes: output.report.markOutcomes };
  });
}

/** Colored PNG pixels, the render error and the auto export's report. */
function capture(page) {
  return page.evaluate(async () => {
    const plot = window.stage14GeoJSON.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const green = [], blue = [], red = [];
    const sx = 400 / canvas.width, sy = 400 / canvas.height;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] < 128) continue;
      if (g > 110 && g > r * 1.5 && g > b * 1.2) green.push([x * sx, y * sy]);
      else if (b > 120 && b > r * 1.8 && b > g * 1.2) blue.push([x * sx, y * sy]);
      else if (r > 150 && g < 100 && b < 100) red.push([x * sx, y * sy]);
    }
    return { size: [canvas.width, canvas.height], green, blue, red, error: plot.getRenderError() };
  });
}

const near = (pixels, [x, y], radius = 2) =>
  pixels.some(([px, py]) => Math.abs(px - x) <= radius && Math.abs(py - y) <= radius);
const degrees = Math.PI / 180;

test("a 2D GeoJSON projection keeps drawing while its center is scrubbed", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, deviceScaleFactor: 2 }), page = await context.newPage();
  try {
    await open(page, "root-limb");
    const before = await capture(page);
    const frames = await page.evaluate(async () => {
      const fixture = window.stage14GeoJSON, start = fixture.plot.getDiagnostics().completedFrame;
      for (let i = 1; i <= 40; i++) {
        fixture.setCenter([60 * i / 40, 0]);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return fixture.plot.getDiagnostics().completedFrame - start;
    });
    expect(frames).toBeGreaterThan(8);
    const after = await capture(page);
    expect(after.green.length).toBeGreaterThan(before.green.length * 1.5);
    expect(after.error).toBe("");
  } finally { await context.close(); }
});

test("a root orthographic GeoJSON polygon ends at the horizon without a smear", async ({ page }) => {
  await open(page, "root-limb");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The Line along latitude 20 from longitude 60 is cut at the horizon: its
  // exported vertices fix the disk (R sin 60 cos 20 to R cos 20 east of the
  // center, R sin 20 above it).
  const exported = await strokes(page), line = exported.byColor["#d43735"].flat();
  const xs = line.map(([x]) => x), ys = line.map(([, y]) => y);
  const east = Math.max(...xs), west = Math.min(...xs), row = ys.reduce((a, b) => a + b) / ys.length;
  const radius = (east - west) / Math.cos(20 * degrees) / (1 - Math.sin(60 * degrees)),
    center = [east - radius * Math.cos(20 * degrees), row + radius * Math.sin(20 * degrees)];
  // Longitudes 60..90 at latitudes -20..20: a crescent against the limb.
  const outside = result.green.filter(([x, y]) => Math.hypot(x - center[0], y - center[1]) > radius + 1.5);
  expect(outside, JSON.stringify(outside.slice(0, 4))).toEqual([]);
  expect(near(result.green, [center[0] + radius - 2, center[1]])).toBe(true);
  expect(Math.min(...result.green.map(([x]) => x)))
    .toBeGreaterThan(center[0] + radius * Math.sin(60 * degrees) * Math.cos(20 * degrees) - 3);
  const [top, bottom] = [Math.min(...result.green.map(([, y]) => y)), Math.max(...result.green.map(([, y]) => y))];
  // The polygon's GeoJSON without fill boundary exports as vector paths on its pixels,
  // cut at the limb: no vertex leaves the disk, and the cut ends reach it.
  const boundary = exported.byColor["#1a5fd0"];
  expect(exported.outcomes.find((outcome) => outcome.kind === "geo-segments").rendering).toBe("vector");
  const vertices = boundary.flat();
  expect(vertices.length).toBeGreaterThan(10);
  for (const point of vertices) {
    expect(Math.hypot(point[0] - center[0], point[1] - center[1]), JSON.stringify(point)).toBeLessThan(radius + 1.5);
    // The red Line runs over the north edge.
    expect(near(result.blue, point, 4) || near(result.red, point, 4), JSON.stringify(point)).toBe(true);
  }
  expect(Math.max(...vertices.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1])))).toBeGreaterThan(radius - 3);
  // The disk is estimated from an antialiased 2-pixel Line: allow 3 pixels.
  expect(Math.abs(top - (center[1] - radius * Math.sin(20 * degrees)))).toBeLessThan(3);
  expect(Math.abs(bottom - (center[1] + radius * Math.sin(20 * degrees)))).toBeLessThan(3);
});

test("GeoJSON in a nested orthographic child maps through the chain, cuts at its horizon and picks features", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page, "child");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The disk is x in [-0.8, 0.8] of a [-1, 1] root: radius 160 about (200, 200).
  const R = 160, at = (lon, lat, center = 0) => [200 + R * Math.cos(lat * degrees) * Math.sin((lon - center) * degrees),
    200 - R * Math.sin(lat * degrees)];
  const outside = result.green.filter(([x, y]) => Math.hypot(x - 200, y - 200) > R + 1.5);
  expect(outside, JSON.stringify(outside.slice(0, 4))).toEqual([]);
  // The square (-30..30, -20..20): its corners and center are filled; its
  // GeoJSON without fill outline runs through the corners.
  for (const corner of [at(-30, 20), at(30, 20), at(30, -20), at(-30, -20)]) {
    expect(near(result.green, corner, 3), JSON.stringify(corner)).toBe(true);
    expect(near(result.blue, corner, 3), JSON.stringify(corner)).toBe(true);
  }
  expect(near(result.green, [200, 200], 1)).toBe(true);
  // The limb polygon (60..120) is visible from longitude 60 to the limb.
  expect(near(result.green, at(75, 0), 1)).toBe(true);
  expect(near(result.green, [200 + R - 2, 200], 1)).toBe(true);
  expect(near(result.green, at(45, 0), 3)).toBe(false);
  // Its north-edge Line ends at the horizon: R cos 20 east of the center.
  expect(Math.abs(Math.max(...result.red.map(([x]) => x)) - (200 + R * Math.cos(20 * degrees)))).toBeLessThan(2);
  // Its GeoJSON without fill outline exports as vector paths through the corners.
  const exported = await strokes(page), outline = exported.byColor["#1a5fd0"].flat();
  for (const corner of [at(-30, 20), at(30, 20), at(30, -20), at(-30, -20)])
    expect(outline.some((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1]) < 0.5), JSON.stringify(corner)).toBe(true);
  for (const point of outline) expect(near(result.blue, point, 4), JSON.stringify(point)).toBe(true);
  // A click on the square picks its feature.
  const canvas = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(canvas.x + 200, canvas.y + 200);
  await expect.poll(() => page.evaluate(() => window.stage14GeoJSON.lastPick?.featureIndex)).toBe(0);
  // Turned 60 east: the limb polygon faces the viewer and the square's west
  // edge reaches the horizon. Nothing is prepared again, compiled or rebuilt.
  const prepared = await page.evaluate(() => window.stage14GeoJSON.probe.getDiagnostics().geometryPreparations);
  await page.evaluate(() => window.stage14GeoJSON.setCenter([30, 0]));
  await capture(page);
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14GeoJSON.setCenter([60, 0]));
  await expect.poll(async () => near((await capture(page)).green, at(90, 0, 60), 1)).toBe(true);
  const turned = await capture(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(turned.error).toBe("");
  for (const point of [at(60, 0, 60), at(120, 20, 60), at(120, -20, 60), at(0, 0, 60), at(-29, 0, 60)])
    expect(near(turned.green, point, 3), JSON.stringify(point)).toBe(true);
  // Between the square (to longitude 30) and the limb polygon (from 60).
  expect(near(turned.green, at(45, 0, 60), 3)).toBe(false);
  const beyond = turned.green.filter(([x, y]) => Math.hypot(x - 200, y - 200) > R + 1.5);
  expect(beyond).toEqual([]);
  expect(await page.evaluate(() => window.stage14GeoJSON.probe.getDiagnostics().geometryPreparations)).toBe(prepared);
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys, existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter((key) => !existing.has(key)).length;
  }, before.renderKeys);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
  // Fills export through the raster layer, honestly reported; strict vector refuses.
  const report = await page.evaluate(async () =>
    (await window.stage14GeoJSON.plot.exportSVG({ mode: "auto" })).report);
  expect(report.markOutcomes.filter((outcome) => outcome.kind === "geo-faces")
    .every((outcome) => outcome.rendering === "raster")).toBe(true);
  await expect(page.evaluate(() => window.stage14GeoJSON.plot.exportSVG({ mode: "vector" }))).rejects.toThrow();
});

test("a placed flat map splits GeoJSON at its seam instead of bridging it", async ({ page }) => {
  await open(page, "inset-map");
  const result = await capture(page);
  expect(result.error).toBe("");
  // A 100-pixel placement spans the map's 360 degrees: x = 200 + λ / 3.6. The
  // polygon 150..210 is 150..180 on the east edge and -180..-150 on the west.
  const pixel = (longitude) => 200 + longitude * 100 / 360;
  const columns = result.green.map(([x]) => x);
  expect(Math.abs(Math.max(...columns) - pixel(180))).toBeLessThan(2);
  expect(Math.abs(Math.min(...columns) - pixel(-180))).toBeLessThan(2);
  expect(result.green.filter(([x]) => x > pixel(-149) && x < pixel(149))).toEqual([]);
  expect(near(result.green, [pixel(165), 200])).toBe(true);
  expect(near(result.green, [pixel(-165), 200])).toBe(true);
  // Latitudes ±20 at the same scale.
  const rows = result.green.map(([, y]) => y);
  expect(Math.abs(Math.min(...rows) - (200 - 20 * 100 / 360))).toBeLessThan(2);
  expect(Math.abs(Math.max(...rows) - (200 + 20 * 100 / 360))).toBeLessThan(2);
});

// TODO 64: GeoJSON without fill colored by a property column draws each feature in its category's color,
// a polygon's boundary too; a numeric column (it threw from inside, then was refused) maps
// through the column's extent (TODO 64.9: GeoJSON's colors read [0, 1]), here onto two colors.
test("GeoJSON without fill colors its lines and polygon boundaries by a category or numeric column", async ({ page }) => {
  for (const scene of ["line-colors", "line-numbers"]) {
    await open(page, scene);
    const drawn = await capture(page);
    expect(drawn.error, scene).toBe("");
    expect(drawn.red.length, scene).toBeGreaterThan(200);
    expect(drawn.blue.length, scene).toBeGreaterThan(200);
    // The road (red) runs at latitude 40, above the polygon (blue) below latitude 20.
    expect(Math.max(...drawn.red.map(([, y]) => y))).toBeLessThan(Math.min(...drawn.blue.map(([, y]) => y)));
  }
});

test("GeoJSON maps its heights through heightScale", async ({ page }) => {
  // TODO 73.4: heights 5 and 10 over a heightScale from [0, 10] onto [0, 1] stand 0.5 and 1 tall, seen from the
  // front; ignored, the default domain [0, 1] clamped both to 1.
  await open(page, "extrusion");
  const drawn = await capture(page);
  expect(drawn.error).toBe("");
  const extent = (pixels) => Math.max(...pixels.map(([, y]) => y)) - Math.min(...pixels.map(([, y]) => y)) + 1;
  const left = drawn.green.filter(([x]) => x < 200), right = drawn.green.filter(([x]) => x >= 200);
  expect(left.length).toBeGreaterThan(200);
  expect(extent(right) / extent(left)).toBeGreaterThan(1.85);
  expect(extent(right) / extent(left)).toBeLessThan(2.15);
});


test("GeoJSON switches between polygon fill and boundary-only drawing", async ({ page }) => {
  await open(page, "line-colors");
  const boundary = await capture(page);
  expect(boundary.green).toHaveLength(0);
  expect(boundary.blue.length).toBeGreaterThan(100);
  await page.evaluate(() => window.stage14GeoJSON.setFill("#13bd4e"));
  await expect.poll(async () => (await capture(page)).green.length).toBeGreaterThan(1000);
  await page.evaluate(() => window.stage14GeoJSON.setFill(null));
  await expect.poll(async () => (await capture(page)).green.length).toBe(0);
  const restored = await capture(page);
  expect(restored.blue.length).toBeGreaterThan(100);
  expect(restored.error).toBe("");
});
