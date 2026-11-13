import { test, expect } from "./fixtures.js";

test("an omitted orthographic center starts at the equator and rotates through viewport state", async ({ page }) => {
  await page.goto("/test/stage14-orthographic-default");
  await page.locator("canvas").first().waitFor();
  await page.waitForFunction(() => window.stage14OrthographicDefault?.plot?.whenSettled);
  await expect(page.locator('svg[aria-label="Orthographic geographic guides"]')).toHaveCount(1);
  const sample = () => page.evaluate(async () => {
    const plot = window.stage14OrthographicDefault.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const live = document.querySelector(".canvas canvas");
    const canvas = document.createElement("canvas");
    // The disk and axis layout are in CSS pixels; keep the rendered/exported PNG at
    // native DPR and normalize only this test's sampling surface.
    canvas.width = live.clientWidth; canvas.height = live.clientHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const layout = plot.getAxisLayout(),
      center = [(layout.left + layout.right) / 2, (layout.top + layout.bottom) / 2];
    let blue = 0, red = 0, blueX = 0, blueY = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4,
        r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
      // Guide labels also have blue pixels. The origin is centered inside the
      // axes margins, which need not be symmetric around the full canvas.
      if (Math.abs(x - center[0]) < 30 && Math.abs(y - center[1]) < 30 &&
          b > 90 && b > r * 1.3 && b > g * 1.05) { blue++; blueX += x; blueY += y; }
      if (r > 120 && r > g * 1.5 && r > b * 1.5) red++;
    }
    return { blue, red, blueCenter: [blueX / blue, blueY / blue], size: [canvas.width, canvas.height],
      viewport: plot.getViewport(), error: plot.getRenderError() };
  });
  const vectorFills = () => page.evaluate(async () => {
    const output = await window.stage14OrthographicDefault.plot.exportSVG({ mode: "vector" });
    const svg = await output.blob.text();
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    return { image: !!document.querySelector("image"),
      fills: [...document.querySelectorAll("circle")].map((circle) => circle.getAttribute("fill")) };
  });
  const initial = await sample();
  expect(initial.error).toBe("");
  expect(initial.viewport.center).toEqual([0, 0]);
  expect(initial.blue).toBeGreaterThan(50);
  expect(initial.red).toBe(0);
  expect(await vectorFills()).toEqual({ image: false, fills: ["#2468a0"] });
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(box.x + initial.blueCenter[0] * box.width / initial.size[0],
    box.y + initial.blueCenter[1] * box.height / initial.size[1]);
  await expect.poll(() => page.evaluate(() => window.stage14OrthographicDefault.pick?.x)).toBeCloseTo(0, 1);
  expect(await page.evaluate(() => window.stage14OrthographicDefault.pick?.y)).toBeCloseTo(0, 1);

  await page.evaluate(() => window.stage14OrthographicDefault.plot.setViewport({ center: [180, 0] }));
  await expect.poll(async () => (await sample()).red).toBeGreaterThan(100);
  const rotated = await sample();
  expect(rotated.blue).toBe(0);
  expect(Math.abs(rotated.viewport.center[0])).toBe(180);
  expect(await vectorFills()).toEqual({ image: false, fills: ["#c73b2b"] });
});

test("the former spherical-orthographic radial sector reports the polar migration", async ({ page }) => {
  // A Rect on a globe is now a longitude/latitude box; the old sector's radial
  // extent in z is refused with the way to draw a sector.
  await page.goto("/test/stage14-legacy-polar-rect");
  await page.waitForFunction(() => window.stage14LegacyPolarRect?.plot?.getRenderError);
  await expect.poll(() => page.evaluate(() => window.stage14LegacyPolarRect.plot.getRenderError()))
    .toMatch(/a Rect is a longitude\/latitude box at one radius[^]*coordinates="polar"/);
});
