import { test, expect } from "./fixtures.js";

test("a log axis with bounds [0, 10] renders without ticks or a render error", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text());
  });
  await page.goto("/test/degenerate-axes");
  await page.waitForFunction(() => window.degenerateAxes?.plot?.getAxes().length);
  const state = await page.evaluate(async () => {
    const { plot } = window.degenerateAxes;
    await plot.whenSettled();
    const axes = document.querySelector('svg[aria-label="2D coordinate axes"]');
    const frame = plot.getAxes()[0].getFrameOptions();
    return {
      error: plot.getRenderError(),
      bounds: frame.get("xbounds"),
      transform: frame.get("xTransform"),
      xTicks: axes?.querySelectorAll(".x-tick").length ?? -1,
      yTicks: axes?.querySelectorAll(".y-tick").length ?? -1,
    };
  });
  expect(state.bounds).toEqual([0, 10]);
  expect(state.transform).toBe("log");
  expect(state.error).toBe("");
  expect(state.xTicks).toBe(0);
  // The linear y axis still draws, so the overlay itself rendered.
  expect(state.yTicks).toBeGreaterThan(0);
  // Hovering the degenerate axis inverts to NaN instead of throwing.
  await page.locator("canvas").first().hover();
  await page.mouse.move(300, 200);
  await page.waitForTimeout(100);
  expect(errors).toEqual([]);
});
