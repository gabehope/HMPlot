import { test, expect } from "./fixtures.js";

test("the polar inset gallery rotates a warped chart, tangent inset and 24-unit dial", async ({ page }) => {
  const exceptions = [];
  page.on("pageerror", error => exceptions.push(error.message));
  await page.goto("/examples/polar-inset");
  await page.waitForFunction(() => window.__examples?.plot?.whenSettled);
  await expect.poll(async () => {
    try { return await page.evaluate(async () => (await window.__examples.plot.exportPNG()).size); }
    catch { return 0; }
  }).toBeGreaterThan(1000);
  const sample = () => page.evaluate(async () => {
    const plot = window.__examples.plot;
    await plot.whenSettled();
    const blob = await plot.exportPNG(), image = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let blue = 0, orange = 0, dark = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (b > 100 && b > r * 1.3 && b > g * 1.05) blue++;
      if (r > 120 && r > g * 1.25 && r > b * 1.25) orange++;
      if (r < 80 && g < 100 && b < 130) dark++;
    }
    return { blue, orange, dark, bytes: blob.size, error: plot.getRenderError(),
      center: plot.getViewport().center };
  });
  const first = await sample();
  expect(first.error).toBe("");
  expect(first.bytes).toBeGreaterThan(1000);
  expect(first.blue).toBeGreaterThan(20);
  expect(first.orange).toBeGreaterThan(20);
  expect(first.dark).toBeGreaterThan(20);
  await page.getByLabel("Globe center").fill("25");
  await expect.poll(() => page.evaluate(() => window.__examples.plot.getViewport().center[0])).toBe(25);
  const rotated = await sample();
  expect(rotated.error).toBe("");
  expect(rotated.blue).toBeGreaterThan(20);
  expect(rotated.orange).toBeGreaterThan(20);
  await page.getByLabel("Globe center").fill("60");
  const hidden = await sample();
  expect(hidden.error).toBe("");
  expect(hidden.orange).toBe(0);
  expect(hidden.dark).toBe(0);
  expect(exceptions).toEqual([]);
  await page.getByLabel("Globe center").fill("0");
  const visibleAgain = await sample();
  expect(visibleAgain.error).toBe("");
  expect(visibleAgain.orange).toBeGreaterThan(20);
  const canvas = page.getByRole("application", { name: "Plot canvas" });
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 40,
    bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  // A drag turns the globe. The page draws the paired program's scene (TODO 69.10): its slider
  // sets the projection center but does not follow a drag (a scene runs no code of its own); the
  // slider's next move centers the globe on its value again.
  await expect.poll(() => page.evaluate(() => window.__examples.plot.getViewport().center[0])).not.toBe(0);
  const dragged = await sample();
  expect(dragged.error).toBe("");
  expect(Number(await page.getByLabel("Globe center").inputValue())).toBe(0);
  await page.getByLabel("Globe center").fill("10");
  await expect.poll(() => page.evaluate(() => window.__examples.plot.getViewport().center[0])).toBe(10);
  expect(exceptions).toEqual([]);
});
