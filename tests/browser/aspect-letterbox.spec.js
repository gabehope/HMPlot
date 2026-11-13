import { test, expect } from "./fixtures.js";

// aspect="equal" letterboxes rather than widen an explicit domain (TODO 136.14, 134.14).
const ticks = (page, plot, axis) =>
  page.locator(`.${plot} .${axis}-tick`).evaluateAll((elements) =>
    elements.map((element) => Number(element.getAttribute("data-value"))));

test("an explicit domain under aspect=\"equal\" is kept: the area letterboxes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/aspect-letterbox");
  await page.waitForFunction(() => window.aspectLetterbox?.given && window.aspectLetterbox?.automatic);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  await page.evaluate(() => Promise.all([window.aspectLetterbox.given.whenSettled(), window.aspectLetterbox.automatic.whenSettled()]));
  // Given: the x axis shows [0, 1] and no more, over an area as wide as it is tall.
  await expect.poll(async () => {
    const x = await ticks(page, "given", "x");
    return x.length > 1 && Math.min(...x) >= 0 && Math.max(...x) <= 1;
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const l = window.aspectLetterbox.given.getAxisLayout();
    return Math.abs((l.right - l.left) - (l.bottom - l.top)) < 2;
  })).toBe(true);
  // Automatic: x widens past its data to keep the units equal, as before.
  await expect.poll(async () => {
    const x = await ticks(page, "automatic", "x");
    return Math.min(...x) < 2 && Math.max(...x) > 3;
  }).toBe(true);
  const automatic = await page.evaluate(() => window.aspectLetterbox.automatic.getAxisLayout());
  expect(automatic.right - automatic.left).toBeGreaterThan(automatic.bottom - automatic.top + 50);
  expect(errors).toEqual([]);
});
