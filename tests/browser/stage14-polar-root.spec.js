import { test, expect } from "./fixtures.js";

test("coordinate mode changes clear generated radius defaults", async ({ page }) => {
  await page.goto("/test/stage14-polar-root");
  await page.waitForFunction(() => window.stage14Polar?.root?.getFrameOptions());
  const read = () => page.evaluate(() => {
    const shorthand = window.stage14Polar.shorthand.getFrames()[0].getFrameOptions();
    const explicit = window.stage14Polar.root.getFrameOptions();
    return [shorthand, explicit].map(options => ({
      mode: options.get("coordinates"), radius: options.get("baseRadius"),
      ownsRadius: options.values.has("baseRadius"),
    }));
  });
  expect(await read()).toEqual([
    { mode: "polar", radius: 0, ownsRadius: true },
    { mode: "polar", radius: 0, ownsRadius: true },
  ]);
  await page.evaluate(() => {
    window.stage14Polar.shorthand.getFrames()[0].getFrameOptions().set("coordinates", "spherical");
    window.stage14Polar.root.getFrameOptions().set("coordinates", "spherical");
  });
  await expect.poll(read).toEqual([
    { mode: "spherical", radius: 1, ownsRadius: true },
    { mode: "spherical", radius: 1, ownsRadius: true },
  ]);
  await page.evaluate(() => {
    window.stage14Polar.shorthand.getFrames()[0].getFrameOptions().set("coordinates", "cartesian");
    window.stage14Polar.root.getFrameOptions().set("coordinates", "cartesian");
  });
  await expect.poll(read).toEqual([
    { mode: "cartesian", radius: 1, ownsRadius: false },
    { mode: "cartesian", radius: 1, ownsRadius: false },
  ]);
});

test("polar quarter turns agree for custom-period roots and extent origin", async ({ page }) => {
  await page.goto("/test/stage14-polar-root");
  await page.locator("canvas").first().waitFor();
  await page.waitForFunction(() => window.stage14Polar?.root?.getFrameOptions());
  await page.waitForFunction(() => window.stage14Polar?.extent?.whenSettled);
  const sample = () => page.evaluate(async () => {
    const result = [];
    for (const plot of [window.stage14Polar.shorthand, window.stage14Polar.explicit,
      window.stage14Polar.extent]) {
      await plot.whenSettled();
      const image = await createImageBitmap(await plot.exportPNG());
      const canvas = document.createElement("canvas");
      // All three roots use 400 CSS pixels; keep region probes and clicks in those units.
      canvas.width = 400; canvas.height = 400;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const counts = { right: 0, top: 0, left: 0, bottom: 0 };
      let topX = 0, topY = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const offset = (y * canvas.width + x) * 4,
          r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
        if (!(b > 95 && b > r * 1.3 && b > g * 1.05)) continue;
        const dx = x - canvas.width / 2, dy = y - canvas.height / 2;
        if (dx > 40 && Math.abs(dy) < 30) counts.right++;
        if (dy < -40 && Math.abs(dx) < 30) { counts.top++; topX += x; topY += y; }
        if (dx < -40 && Math.abs(dy) < 30) counts.left++;
        if (dy > 40 && Math.abs(dx) < 30) counts.bottom++;
      }
      result.push({ counts, top: [topX / counts.top, topY / counts.top], error: plot.getRenderError() });
    }
    return result;
  });
  const probes = await sample();
  expect(await page.evaluate(() => window.stage14Polar.root.getFrameOptions().frameDefinition.parent)).toBeNull();
  for (const probe of probes) {
    expect(probe.error).toBe("");
    for (const value of Object.values(probe.counts)) expect(value).toBeGreaterThan(20);
  }
  const canvas = page.locator("canvas").nth(1);
  const bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + probes[1].top[0] * bounds.width / 400,
    bounds.y + probes[1].top[1] * bounds.height / 400);
  await expect.poll(() => page.evaluate(() => window.stage14Polar.lastPick?.instanceId)).toBe(1);
  const picked = await page.evaluate(() => window.stage14Polar.lastPick.axisValue);
  expect(Math.abs(picked.x - 6)).toBeLessThan(0.15);
  expect(Math.abs(picked.y - 2)).toBeLessThan(0.15);
  await page.evaluate(() => window.stage14Polar.setDomain([0, 12]));
  await expect.poll(() => page.evaluate(() => window.stage14Polar.root.getFrameOptions().get("xbounds")?.[1])).toBe(12);
  const changed = await sample();
  expect(changed[1].error).toBe("");
  expect(changed[1].counts.top).toBeGreaterThan(20);
  expect(Math.abs(changed[1].top[0] - probes[1].top[0])).toBeLessThan(2);
  expect(Math.abs(changed[1].top[1] - probes[1].top[1])).toBeLessThan(2);
});

test("a promoted polar root rejects Cartesian interval brushing", async ({ page }) => {
  await page.goto("/test/stage14-polar-root");
  await page.waitForFunction(() => window.stage14Polar?.points);
  await page.evaluate(() => window.stage14Polar.brush(true));
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.stage14Polar?.points?.getMark())?.interaction);
  const canvas = page.getByRole("application", { name: "Plot canvas" }).nth(1);
  const bounds = await canvas.boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(bounds.x + 130, bounds.y + 130);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 280, bounds.y + 280, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const result = await page.evaluate(() => {
    const binding = ((m) => m?.view.marks.of(m))(window.stage14Polar.points.getMark())?.interaction;
    return { error: window.stage14Polar.explicit.getRenderError(),
      constraints: binding.brush?.getConstraints(binding.owner) ?? [] };
  });
  expect(result.error).toMatch(/(polar root axes do not support Cartesian interval brushing|graphical brushing supports Cartesian 2D only)/);
  expect(result.constraints).toEqual([]);
});
