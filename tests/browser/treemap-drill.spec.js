import { test, expect } from "./fixtures.js";

// TODO 145.3: root may be any node (a drill-down) and may read an input; levels={1} shows its
// children only, filling the whole area; depth counts from root; total is the summed value;
// nodes outside the subtree are hidden rows, so the drawn rectangles and the read rows agree.
async function open(page) {
  await page.goto("/test/treemap-drill");
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(4);
  await page.waitForFunction(() => window.treemapDrill?.level && window.treemapDrill?.all);
}
const rects = (page, key) => page.evaluate(async (key) => {
  const plot = window.treemapDrill[key];
  await plot.whenSettled();
  const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
  return new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("[fill='#4a6f8f'], [fill='#8f6f4a']").length;
}, key);
const rows = (page, key) => page.evaluate(async (key) => {
  const { rows } = await window.treemapDrill[key].read({ rows: true, columns: ["id", "depth", "total", "x0", "x1", "y0", "y1"] });
  return rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}, key);
const area = (list) => list.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.y1 - r.y0), 0);

test("levels={1} shows the root's children, filling the area, with their totals", async ({ page }) => {
  await open(page);
  const top = await rows(page, "level");
  expect(top.map((r) => [r.id, r.depth, r.total])).toEqual([["a", 1, 6], ["b", 1, 8]]);
  expect(area(top)).toBeCloseTo(1, 6);
  expect(await rects(page, "drill")).toBe(2);
  // Without levels the whole hierarchy is drawn, root included at depth 0.
  const whole = await rows(page, "all");
  expect(whole.map((r) => r.id)).toEqual(["a", "a1", "a2", "a3", "b", "b1", "b2", "root"]);
  expect(Object.fromEntries(whole.map((r) => [r.id, r.depth]))).toMatchObject({ root: 0, a: 1, a1: 2 });
  expect(await rects(page, "whole")).toBe(8);
});

test("setting the root input to a node drills into its subtree", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.treemapDrill.select.setValue("a"));
  await expect.poll(async () => (await rows(page, "level")).map((r) => r.id)).toEqual(["a1", "a2", "a3"]);
  const children = await rows(page, "level");
  expect(children.map((r) => [r.depth, r.total])).toEqual([[1, 1], [1, 2], [1, 3]]);
  expect(area(children)).toBeCloseTo(1, 6);
  expect(await rects(page, "drill")).toBe(3);
  await page.evaluate(() => window.treemapDrill.select.setValue("root"));
  await expect.poll(async () => (await rows(page, "level")).map((r) => r.id)).toEqual(["a", "b"]);
  expect(await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent))).toEqual([]);
});

// 2026-10-22: input("inner", { default: "a" }) resolves to "a" although its only writers are the
// Rects inside the Treemap, which mount after the layout; and a layout's error inside a Plot is
// a diagnostic the checker reports, not an alert hidden in the canvas.
test("a read's default resolves before its writers mount, and a layout's error reaches the checker", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => window.treemapDrill?.selfNodes);
  await expect.poll(async () => (await rows(page, "selfNodes")).map((r) => r.id)).toEqual(["a1", "a2", "a3"]);
  expect(await rects(page, "self")).toBe(3);
  await page.evaluate(() => window.treemapDrill.breakRoot());
  await expect(page.getByRole("alert")).toContainText("root is not present");
  const report = await page.evaluate(() => window.treemapDrill.inspect({ timeout: 5000 }));
  expect(report.ready).toBe(false);
  expect(report.errors.filter((e) => /root is not present/.test(e.message))).toHaveLength(1);
});
