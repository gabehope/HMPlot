import { test, expect } from "./fixtures.js";

// Alignment groups (TODO 136.10 slice 5): Plots side by side in a Row share their plot area's
// top and bottom lines, and Plots stacked in a Column their left and right, on the page.
async function areas(page, query = "") {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/test/align-groups${query}`);
  await page.waitForFunction(() => window.alignGroupsReady);
  await expect.poll(() => page.evaluate(() => Object.values(window.alignGroups.areas()).every(Boolean))).toBe(true);
  await page.evaluate(() => window.alignGroups.settled());
  return { errors, read: () => page.evaluate(() => window.alignGroups.areas()) };
}
const close = (a, b) => Math.abs(a - b) < 1;

test("a Row lines up its plot areas' tops and bottoms; a Column its lefts and rights", async ({ page }) => {
  const { errors, read } = await areas(page);
  await expect.poll(async () => {
    const { titled, plain, wide, narrow } = await read();
    // The title moves the titled plot's area down; the plain one's follows it.
    return close(titled.top, plain.top) && close(titled.bottom, plain.bottom) &&
      close(wide.left, narrow.left) && close(wide.right, narrow.right);
  }).toBe(true);
  const { titled, plain, wide, narrow } = await read();
  expect(titled.left).not.toBeCloseTo(plain.left, 0);
  expect(wide.top).not.toBeCloseTo(narrow.top, 0);
  expect(errors).toEqual([]);
});

test("a pinned margin stays where it is pinned", async ({ page }) => {
  const { errors, read } = await areas(page, "?pinned");
  await expect.poll(async () => {
    const { titled, plain } = await read();
    return close(titled.top, plain.top);
  }).toBe(true);
  const { wide, narrow } = await read();
  expect(narrow.left - wide.left).toBeLessThan(-20);
  expect(errors).toEqual([]);
});


test("fixed navigation margins still reserve space requested by aligned peers", async ({ page }) => {
  await areas(page, "?fixedMargins");
  const read = () => page.evaluate(async () => { await window.alignGroups.settled(); return window.alignGroups.areas(); });
  const before = await read();
  await page.evaluate(() => window.alignGroups.zoom("narrow", { y: 0.5, zoomY: 1000 }));
  const zoomed = await read();
  expect(zoomed.narrow.left).toBeCloseTo(before.narrow.left, 1);
  await page.evaluate(() => window.alignGroups.setPeerFormat(".12f"));
  const changed = await read();
  expect(changed.narrow.left).toBeGreaterThan(before.narrow.left + 10);
  expect(changed.narrow.left).toBeCloseTo(changed.wide.left, 1);
  expect(await page.locator(".y-tick").count()).toBeGreaterThan(0);
  await areas(page, "?fixedMargins&pinned");
  const pinned = await read();
  await page.evaluate(() => window.alignGroups.setPeerFormat(".12f"));
  expect((await read()).narrow.left).toBeCloseTo(pinned.narrow.left, 1);
});
