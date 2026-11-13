import { test, expect } from "./fixtures.js";

test("reference rules remain above opaque marks with theme contrast and explicit styles", async ({ page }) => {
  await page.goto("/test/reference-rules");
  await page.waitForFunction(() => window.ruleFixture?.length === 2 && [...document.querySelectorAll(".canvas")].every((c) => c.getAttribute("aria-busy") === "false"));
  const results = await page.evaluate(async () => {
    const results = [];
    for (const plot of window.ruleFixture) {
      await plot.whenSettled();
      const bitmap = await createImageBitmap(await plot.exportPNG());
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const layout = plot.getAxisLayout(), y = Math.round((layout.top + layout.bottom) / 2);
      const pixels = layout.x.reference.map((rule) => {
        const x = Math.round(rule.fraction * canvas.width);
        return Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
      });
      const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      const paths = [...doc.querySelectorAll("path")];
      const styled = paths.find((p) => p.getAttribute("stroke") === "#ff0088");
      results.push({ pixels, width: styled?.getAttribute("stroke-width"), text: doc.documentElement.textContent.includes("Median") });
    }
    return results;
  });
  for (const result of results) {
    expect(result.width).toBe("3");
    expect(result.text).toBe(true);
    expect(result.pixels[1][0]).toBeGreaterThan(220);
    expect(result.pixels[1][1]).toBeLessThan(40);
  }
  // Default references follow readable axis text, not the muted grid or the green mark.
  expect(Math.max(...results[0].pixels[0])).toBeLessThan(140);
  expect(Math.min(...results[1].pixels[0])).toBeGreaterThan(160);
});


test("reference bands span the frame during pan and zoom while keeping their data bounds", async ({ page }) => {
  await page.goto("/test/reference-rules");
  await page.waitForFunction(() => window.bandFixture?.length === 2 && [...document.querySelectorAll(".canvas")].every(c => c.getAttribute("aria-busy") === "false"));
  const capture = () => page.evaluate(async () => {
    const results = [];
    for (const plot of window.bandFixture) {
      await plot.whenSettled();
      const bitmap = await createImageBitmap(await plot.exportPNG());
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixel = (x, y) => Array.from(ctx.getImageData(Math.round(x * canvas.width), Math.round(y * canvas.height), 1, 1).data).slice(0, 3);
      results.push({ center: pixel(0.5, 0.5), upper: pixel(0.5, 0.03), lower: pixel(0.5, 0.97), outside: pixel(0.2, 0.5), left: pixel(0.03, 0.3), right: pixel(0.97, 0.3) });
    }
    return results;
  });
  const before = await capture();
  const red = pixel => { expect(pixel[0]).toBeGreaterThan(230); expect(pixel[1]).toBeLessThan(25); };
  const blue = pixel => { expect(pixel[2]).toBeGreaterThan(230); expect(pixel[0]).toBeLessThan(25); };
  for (const key of ["center", "upper", "lower"]) red(before[0][key]);
  expect(before[0].outside[1]).toBeGreaterThan(100);
  blue(before[1].left); blue(before[1].right);
  // Move/zoom only the orthogonal axis: the band must still reach both visible edges.
  await page.evaluate(async () => {
    window.bandFixture[0].setViewport({ y: 0.7, zoomY: 3 }, "y");
    window.bandFixture[1].setViewport({ x: 0.7, zoomX: 3 }, "x");
  });
  const moved = await capture();
  for (const key of ["center", "upper", "lower"]) red(moved[0][key]);
  blue(moved[1].left); blue(moved[1].right);
  // The bounded dimension zooms in data coordinates: [4,6] fills more of the visible x span.
  await page.evaluate(() => window.bandFixture[0].setViewport({ x: 0.5, zoomX: 4 }, "x"));
  const zoomed = await capture();
  red(zoomed[0].outside);
});
