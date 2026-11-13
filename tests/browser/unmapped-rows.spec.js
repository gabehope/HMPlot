import { test, expect } from "./fixtures.js";

// TODO 136.11: a Rect, Points and Text row a log axis cannot map draws nothing; a Rect from 0
// stretched toward the 1e20 sentinel before.
test("rows a log axis cannot map draw nothing", async ({ page }) => {
  await page.goto("/test/unmapped-rows");
  await page.waitForFunction(() => window.unmappedRows?.plots?.off?.whenSettled && window.unmappedRows.plots.msaa?.whenSettled);
  const sample = (name) => page.evaluate(async (name) => {
    const plot = window.unmappedRows.plots[name];
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const { width } = canvas, pixels = context.getImageData(0, 0, width, canvas.height).data;
    // Unmapped rows are left of x = 4 of [0, 7]; mapped ones right of it.
    const count = { left: { red: 0, blue: 0, green: 0 }, right: { red: 0, blue: 0, green: 0 } };
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const [r, g, b] = pixels.subarray(offset, offset + 4), side = (offset / 4) % width < (width * 4) / 7 ? "left" : "right";
      if (r > 150 && r > g * 2 && r > b * 2) count[side].red++;
      if (b > 150 && b > r * 1.6 && b > g * 1.1) count[side].blue++;
      if (g > 110 && g > r * 1.5 && g > b * 1.2) count[side].green++;
    }
    return { ...count, error: plot.getRenderError() };
  }, name);
  for (const name of ["msaa", "off"]) {
    await expect.poll(async () => (await sample(name)).right.blue).toBeGreaterThan(50);
    const drawn = await sample(name);
    expect(drawn.error).toBe("");
    expect(drawn.left, `${name}: ${JSON.stringify(drawn)}`).toEqual({ red: 0, blue: 0, green: 0 });
    expect(drawn.right.red, name).toBeGreaterThan(500);
    expect(drawn.right.green, name).toBeGreaterThan(20);
  }
});
