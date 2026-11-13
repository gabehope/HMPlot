import { test, expect } from "./fixtures.js";

test("orthographic minimap follows and updates the root center", async ({ page }) => {
  await page.goto("/test/stage14-orthographic-minimap");
  await page.waitForFunction(() => window.stage14OrthographicMinimap?.minimap?.exportable());
  const colors = () => page.evaluate(async () => {
    const image = await createImageBitmap(await window.stage14OrthographicMinimap.minimap.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let blue = 0, red = 0, green = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const [r, g, b, a] = pixels.subarray(offset, offset + 4);
      if (a < 128) continue;
      if (b > 90 && b > r * 1.3 && b > g * 1.05) blue++;
      if (r > 120 && r > g * 1.5 && r > b * 1.5) red++;
      if (g > 120 && g > r * 1.5 && g > b * 1.5) green++;
    }
    return { blue, red, green };
  });
  await expect.poll(async () => (await colors()).blue).toBeGreaterThan(20);
  expect((await colors()).red).toBe(0);
  // Text stays out of the minimap (TODO 61): the plot draws its green label, the minimap does not;
  // and the minimap takes the plot's background.
  const plotGreen = () => page.evaluate(async () => {
    const image = await createImageBitmap(await window.stage14OrthographicMinimap.plot.exportPNG());
    const context = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height }).getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let green = 0;
    for (let offset = 0; offset < pixels.length; offset += 4)
      if (pixels[offset + 1] > 120 && pixels[offset + 1] > pixels[offset] * 1.5 && pixels[offset + 1] > pixels[offset + 2] * 1.5) green++;
    return green;
  });
  await expect.poll(plotGreen, { timeout: 15000 }).toBeGreaterThan(20);
  expect((await colors()).green).toBe(0);
  await expect(page.getByRole("application", { name: "Plot overview" })).toHaveCSS("background-color", "rgb(241, 232, 208)");
  await page.evaluate(() => window.stage14OrthographicMinimap.plot.setViewport({ center: [180, 0] }));
  await expect.poll(async () => (await colors()).red).toBeGreaterThan(20);
  expect((await colors()).blue).toBe(0);
  await page.evaluate(() => window.stage14OrthographicMinimap.plot.setViewport({
    center: [0, 0], zoom: 2, zoomX: 2, zoomY: 2,
  }));
  await expect.poll(async () => (await colors()).blue).toBeGreaterThan(20);
  const box = await page.getByRole("application", { name: "Plot overview" }).boundingBox();
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
  await expect.poll(() => page.evaluate(() =>
    window.stage14OrthographicMinimap.plot.getViewport().center[0])).toBeGreaterThan(10);
  await page.evaluate(() => window.stage14OrthographicMinimap.plot.setViewport({
    center: [0, 0], zoom: 2, zoomX: 2, zoomY: 2,
  }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const dragged = await page.evaluate(() => window.stage14OrthographicMinimap.plot.getViewport().center[0]);
  // 40 px across a globe filling the overview (TODO 135.5: it drew at half size, twice the turn).
  expect(dragged).toBeGreaterThan(18);
  expect(dragged).toBeLessThan(32);
  expect(await page.evaluate(() => window.stage14OrthographicMinimap.plot.getRenderError())).toBe("");
});
