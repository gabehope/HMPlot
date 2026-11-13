import { test, expect } from "./fixtures.js";

/** The exported PNG's red, green and blue marker centroids in CSS pixels. */
function markers(page, scale = 1) {
  return page.evaluate(async (scale) => {
    const plot = window.stage14Placements.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG({ scale }));
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    // Export scale multiplies native pixels; normalize actual output dimensions, including DPR.
    const sx = canvas.width / 600, sy = canvas.height / 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data, sums = { r: [0, 0, 0], g: [0, 0, 0], b: [0, 0, 0] };
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % canvas.width, y = Math.floor(i / 4 / canvas.width), [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const key = r > 180 && g < 80 && b < 80 ? "r" : g > 150 && r < 80 && b < 80 ? "g" : b > 180 && r < 80 && g < 80 ? "b" : null;
      if (key) { sums[key][0] += x; sums[key][1] += y; sums[key][2]++; }
    }
    return { error: plot.getRenderError(),
      ...Object.fromEntries(Object.entries(sums).map(([key, [x, y, n]]) => [key, n ? [x / n / sx, y / n / sy] : null])) };
  }, scale);
}

// The outer 200 x 150 px inset is centered in the 600 x 400 plot and turned
// 30 degrees; the inner 60 x 40 px inset sits at its local (0.75, 0.5) and
// turns 20 more. Corners (0, 0), (1, 0), (0, 1) of the inner inset, in pixels.
const degrees = Math.PI / 180;
function expected() {
  const rotate = ([x, y], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  const [ox, oy] = rotate([50, 0], 30 * degrees), center = [300 + ox, 200 - oy];
  const corner = (u, v) => {
    const [dx, dy] = rotate([(u - 0.5) * 60, (v - 0.5) * 40], 50 * degrees);
    return [center[0] + dx, center[1] - dy];
  };
  return { r: corner(0, 0), g: corner(1, 0), b: corner(0, 1) };
}
const near = (a, b, tolerance = 1.5) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tolerance;

test("a turned inset inside a turned inset keeps its pixel size and angles in a wide plot", async ({ page }) => {
  await page.goto("/test/stage14-placements?scene=nested-rotation");
  await page.waitForFunction(() => window.stage14Placements?.plot?.whenSettled);
  const at = await markers(page), want = expected();
  expect(at.error).toBe("");
  for (const key of ["r", "g", "b"]) expect(near(at[key], want[key]), `${key} ${JSON.stringify([at[key], want[key]])}`).toBe(true);
  // The inset stays a 60 x 40 px rectangle: no shear from the plot's aspect.
  const edge = (p, q) => [q[0] - p[0], q[1] - p[1]], u = edge(at.r, at.g), v = edge(at.r, at.b);
  expect(Math.abs(Math.hypot(...u) - 60)).toBeLessThan(1.5);
  expect(Math.abs(Math.hypot(...v) - 40)).toBeLessThan(1.5);
  expect(Math.abs(u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))).toBeLessThan(0.03);
});

test("export at another size and the minimap leave the live placement unchanged", async ({ page }) => {
  await page.goto("/test/stage14-placements?scene=nested-rotation");
  await page.waitForFunction(() => window.stage14Placements?.plot?.whenSettled);
  const first = await markers(page), want = expected();
  // A 2x export resolves placement for its own camera and size, in the same CSS geometry.
  const doubled = await markers(page, 2);
  for (const key of ["r", "g", "b"]) expect(near(doubled[key], want[key]), key).toBe(true);
  // The minimap renders its own pass; the live placement does not move.
  await page.evaluate(() => window.stage14Placements.setOverview(true));
  await page.waitForTimeout(300);
  const again = await markers(page);
  expect(again.error).toBe("");
  for (const key of ["r", "g", "b"]) expect(near(again[key], first[key], 0.5), key).toBe(true);
});
