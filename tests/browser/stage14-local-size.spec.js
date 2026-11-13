import { test, expect } from "./fixtures.js";

const sample = (page, key) => page.evaluate(async (key) => {
  const plot = window.stage14LocalSize[key];
  await plot.whenSettled();
  const output = await plot.exportSVG({ mode: "vector" });
  const svgDocument = new DOMParser().parseFromString(await output.blob.text(), "image/svg+xml");
  const circles = [...svgDocument.querySelectorAll("circle")].map((circle) => ({
    fill: circle.getAttribute("fill"), x: Number(circle.getAttribute("cx")),
    y: Number(circle.getAttribute("cy")), radius: Number(circle.getAttribute("r")),
  }));
  const bitmap = await createImageBitmap(await plot.exportPNG());
  const canvas = document.createElement("canvas");
  // SVG glyph positions/radii and scan margins are CSS pixels, even at browser DPR 2.
  const svgRoot = svgDocument.documentElement;
  canvas.width = Number(svgRoot.getAttribute("width")); canvas.height = Number(svgRoot.getAttribute("height"));
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const run = (circle) => {
    const color = circle.fill;
    let widest = 0;
    for (let y = Math.max(0, Math.round(circle.y) - 2);
      y <= Math.min(canvas.height - 1, Math.round(circle.y) + 2); y++) {
      let count = 0;
      for (let x = Math.max(0, Math.round(circle.x - circle.radius - 3));
        x <= Math.min(canvas.width - 1, Math.round(circle.x + circle.radius + 3)); x++) {
        const i = (y * canvas.width + x) * 4,
          r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        if (color === "#20aa42" ? g > 95 && g > r * 1.5 && g > b * 1.2
          : b > 110 && b > r * 1.5 && b > g * 1.2) count++;
      }
      widest = Math.max(widest, count);
    }
    return widest;
  };
  return { circles: circles.map((circle) => ({ ...circle, rasterWidth: run(circle) })),
    error: plot.getRenderError(), image: !!svgDocument.querySelector("image") };
}, key);

test("curved and warped data-unit glyphs use each row's local source-X scale", async ({ page }) => {
  await page.goto("/test/stage14-local-size");
  await page.waitForFunction(() => window.stage14LocalSize?.polar?.whenSettled &&
    window.stage14LocalSize?.globe?.whenSettled && window.stage14LocalSize?.warped?.whenSettled &&
    window.stage14LocalSize?.largePolar?.whenSettled);
  await expect(page.locator("canvas")).toHaveCount(4);
  await expect.poll(() => page.evaluate(async () => {
    try {
      await window.stage14LocalSize.polar.exportSVG({ mode: "vector" });
      await window.stage14LocalSize.globe.exportSVG({ mode: "vector" });
      await window.stage14LocalSize.warped.exportSVG({ mode: "vector" });
      await window.stage14LocalSize.largePolar.exportSVG({ mode: "vector" });
      return true;
    } catch { return false; }
  })).toBe(true);
  const polar = await sample(page, "polar");
  expect(polar.error).toBe("");
  expect(polar.image).toBe(false);
  expect(polar.circles.map((circle) => circle.fill).sort()).toEqual(["#20aa42", "#2468c0"]);
  const small = polar.circles.find((circle) => circle.fill === "#20aa42"),
    large = polar.circles.find((circle) => circle.fill === "#2468c0");
  expect(large.radius / small.radius).toBeGreaterThan(1.9);
  expect(large.radius / small.radius).toBeLessThan(2.1);
  expect(Math.abs(small.rasterWidth - 2 * small.radius)).toBeLessThan(4);
  expect(Math.abs(large.rasterWidth - 2 * large.radius)).toBeLessThan(4);

  const globe = await sample(page, "globe");
  expect(globe.error).toBe("");
  expect(globe.image).toBe(false);
  expect(globe.circles.map((circle) => circle.fill).sort()).toEqual(["#20aa42", "#2468c0"]);
  const equator = globe.circles.find((circle) => circle.fill === "#20aa42"),
    latitude60 = globe.circles.find((circle) => circle.fill === "#2468c0");
  expect(latitude60.radius / equator.radius).toBeGreaterThan(0.45);
  expect(latitude60.radius / equator.radius).toBeLessThan(0.55);
  expect(Math.abs(equator.rasterWidth - 2 * equator.radius)).toBeLessThan(4);
  expect(Math.abs(latitude60.rasterWidth - 2 * latitude60.radius)).toBeLessThan(4);
  await page.evaluate(() => window.stage14LocalSize.globe.setViewport({ center: [30, 0] }));
  const rotated = await sample(page, "globe");
  const movedEquator = rotated.circles.find((circle) => circle.fill === "#20aa42");
  expect(movedEquator.radius / equator.radius).toBeGreaterThan(0.8);
  expect(movedEquator.radius / equator.radius).toBeLessThan(0.95);
  expect(Math.abs(movedEquator.rasterWidth - 2 * movedEquator.radius)).toBeLessThan(4);

  const warped = await sample(page, "warped");
  expect(warped.error).toBe("");
  expect(warped.image).toBe(false);
  const inner = warped.circles.find((circle) => circle.fill === "#20aa42"),
    outer = warped.circles.find((circle) => circle.fill === "#2468c0");
  expect(inner).toBeDefined();
  expect(outer).toBeDefined();
  expect(outer.radius / inner.radius).toBeGreaterThan(1.9);
  expect(outer.radius / inner.radius).toBeLessThan(2.1);
  expect(Math.abs(inner.rasterWidth - 2 * inner.radius)).toBeLessThan(4);
  expect(Math.abs(outer.rasterWidth - 2 * outer.radius)).toBeLessThan(4);
  const largePolar = await sample(page, "largePolar");
  expect(largePolar.error).toBe("");
  expect(largePolar.circles).toHaveLength(1);
  expect(largePolar.circles[0].rasterWidth).toBeGreaterThan(8);
  expect(Math.abs(largePolar.circles[0].rasterWidth -
    2 * largePolar.circles[0].radius)).toBeLessThan(4);
});
