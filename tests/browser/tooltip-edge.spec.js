import { test, expect } from "./fixtures.js";

// TODO 135.11: near a narrow plot's right edge, a tooltip's shrink-to-fit width depended on the
// side it was placed on, and the side on the width: it flipped at frame rate while the pointer
// was still. It now measures its own width wherever it is, and stays inside the plot.
test("a tooltip near a narrow plot's edge holds still and stays inside the plot", async ({ page }) => {
  await page.goto("/test/tooltip-edge");
  await page.waitForFunction(() => window.tooltipEdge?.plot && [...document.querySelectorAll(".canvas")].every((c) => c.getAttribute("aria-busy") === "false"));
  const canvas = page.locator(".canvas").first(), box = await canvas.boundingBox();
  const tooltip = page.locator(".plot-tooltip");
  // The pointer's first move can land before the plot listens: move until the tooltip shows.
  await expect.poll(async () => {
    await page.mouse.move(box.x + box.width * 0.92 - 1, box.y + box.height * 0.5);
    await page.mouse.move(box.x + box.width * 0.92, box.y + box.height * 0.5);
    return tooltip.count();
  }).toBe(1);
  await expect(tooltip).toContainText("Highlands-06");
  await page.waitForTimeout(300);
  const changes = await page.evaluate(() => new Promise((resolve) => {
    let count = 0;
    const observer = new MutationObserver((records) => { count += records.length; });
    observer.observe(document.querySelector(".plot-tooltip"), { attributes: true, attributeFilter: ["style"] });
    setTimeout(() => { observer.disconnect(); resolve(count); }, 1000);
  }));
  expect(changes).toBe(0);
  const tip = await tooltip.boundingBox(), plotBox = await page.locator(".plot-tooltip").evaluate((node) => {
    const r = node.offsetParent.getBoundingClientRect(); return { x: r.x, width: r.width };
  });
  expect(tip.x).toBeGreaterThanOrEqual(plotBox.x - 0.5);
  expect(tip.x + tip.width).toBeLessThanOrEqual(plotBox.x + plotBox.width + 0.5);
});
