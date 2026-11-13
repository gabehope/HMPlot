import { test, expect } from "./fixtures.js";
test.use({ deviceScaleFactor: 2 });

test("Shift updates the drawn coordinates while the original path stays fixed", async ({ page }) => {
  await page.goto("/test/shift");
  await expect(page.locator(".canvas")).toHaveAttribute("aria-busy", "false");
  const paths = () => page.evaluate(async () => {
    await window.shiftTest.plot.whenSettled();
    const svg = new DOMParser().parseFromString(await (await window.shiftTest.plot.exportSVG({mode:"vector"})).blob.text(), "image/svg+xml");
    return Object.fromEntries(["#2468a0", "#d34b37"].map(color => [color,
      [...svg.querySelectorAll(`path[stroke="${color}"]`)].map(path => path.getAttribute("d"))]));
  });
  const before = await paths();
  expect(before["#2468a0"].length).toBeGreaterThan(0);
  expect(before["#d34b37"]).not.toEqual(before["#2468a0"]);
  const first = await page.evaluate(() => window.shiftTest.plot.getDiagnostics().completedFrame);
  await page.evaluate(() => window.shiftTest.shift.update({interval:0}));
  const after = await paths();
  expect(after["#2468a0"]).toEqual(before["#2468a0"]);
  expect(after["#d34b37"]).toEqual(after["#2468a0"]);
  await expect.poll(() => page.evaluate(() => window.shiftTest.plot.getDiagnostics().completedFrame)).toBeGreaterThan(first);
});
