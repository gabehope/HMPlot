import { test, expect } from "./fixtures.js";

// A connector on a globe gathers its endpoints in the globe's longitude and
// latitude and draws them like a spherical Line: great circles, cut at the horizon.
async function open(page, scene) {
  await page.goto(`/test/stage14-globe-connect?scene=${scene}`);
  await page.waitForFunction(() => window.stage14GlobeConnect?.plot?.whenSettled);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false")))
    .toBe(true);
}

/** Red, violet and blue PNG pixels, and the strict-vector polylines of each stroke color. */
function capture(page) {
  return page.evaluate(async () => {
    const plot = window.stage14GlobeConnect.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    // Compare native DPR pixels with SVG vertices in the 400 CSS-pixel frame.
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    const red = [], violet = [], blue = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], at = [(i / 4) % width, Math.floor(i / 4 / width)];
      if (r > 150 && g < 100 && b < 100) red.push(at);
      else if (b > 150 && r > 90 && r < 180 && g < 90) violet.push(at);
      else if (b > 150 && r < 80 && g < 140) blue.push(at);
    }
    const output = await plot.exportSVG({ mode: "vector" }), svg = await output.blob.text();
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml"), strokes = {}, fills = {};
    for (const path of doc.querySelectorAll("path")) {
      const stroke = path.getAttribute("stroke"), fill = path.getAttribute("fill");
      const points = [...path.getAttribute("d").matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)].map((m) => [+m[1], +m[2]]);
      if (stroke && stroke !== "none") (strokes[stroke] ??= []).push(...points);
      else if (fill && fill !== "none") (fills[fill] ??= []).push(...points);
    }
    return { error: plot.getRenderError(), image: svg.includes("<image"), red, violet, blue, strokes, fills };
  });
}

const near = (pixels, [x, y], radius = 3) =>
  pixels.some(([px, py]) => Math.abs(px - x) <= radius && Math.abs(py - y) <= radius);

/** Every exported connector vertex lies on the reference great circle's pixels
 *  (or, at its ends, on the endpoint's point drawn over them). */
const onReference = (result, point) => near(result.red, point) || near(result.blue, point);
function expectOnReference(result) {
  const connector = result.strokes["#13bd4e"];
  expect(connector?.length, "connector vertices").toBeGreaterThan(4);
  const off = connector.filter((point) => !onReference(result, point));
  expect(off, JSON.stringify(off.slice(0, 3))).toEqual([]);
}

test("a connector on a globe follows the great circle between its endpoints", async ({ page }) => {
  await open(page, "root");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  expectOnReference(result);
  // The connector to a point behind the horizon stops at the limb (radius 200
  // about the center of the 400 px globe), with no head at the hidden end. An
  // Arrows3D exports as filled quads in world units (TODO 64.4), 0.03 (6 px) wide.
  const arrow = result.fills["#8a2be2"] ?? [];
  expect(arrow.length).toBeGreaterThan(2);
  for (const [x, y] of arrow) expect(Math.hypot(x - 200, y - 200)).toBeLessThanOrEqual(203.2);
  expect(result.violet.every(([x, y]) => Math.hypot(x - 200, y - 200) <= 206)).toBe(true);
  // Turning the globe moves the endpoints and the connector together; nothing is re-matched.
  await page.evaluate(() => window.stage14GlobeConnect.setCenter([30, 10]));
  await expect.poll(async () => {
    const turned = await capture(page);
    return turned.strokes["#13bd4e"]?.every((point) => onReference(turned, point)) ?? false;
  }).toBe(true);
});

test("a connector from a chart on the globe to a point on it follows their great circle", async ({ page }) => {
  await open(page, "chart");
  const result = await capture(page);
  expect(result.error).toBe("");
  expectOnReference(result);
});

test("an endpoint in a pixel-placed inset on a globe is reported", async ({ page }) => {
  await open(page, "placed");
  await expect.poll(() => page.evaluate(() => window.stage14GlobeConnect.plot.getRenderError()))
    .toMatch(/pixel-anchored Frame/);
});
