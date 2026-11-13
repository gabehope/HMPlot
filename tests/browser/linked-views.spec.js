import { test, expect } from "./fixtures.js";

// TODO 145.6: skills/hmplot/svelte.md's linked-views program works as written: a plain drag on
// the histogram brushes; the Title's count, the TableView of the brushed rows' Group and the
// route widths joined from it follow the brush.
test("the skill's linked-views program follows a plain-drag brush", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/linked-views");
  await page.waitForFunction(() => window.linkedViews?.map);
  await expect(page.locator('[data-name="routes"] tbody tr')).toHaveCount(4);
  const table = () => page.locator('[data-name="routes"] tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((td) => td.textContent.trim())));
  expect(await table()).toEqual([["a", "100"], ["b", "100"], ["c", "100"], ["d", "100"]]);
  const count = () => page.locator('[data-name="flights-count"]').textContent();
  await expect.poll(count).toContain("400");
  // A plain drag over hours 0-5 (no Shift).
  const box = await page.locator(".canvas").first().boundingBox();
  const at = (x) => page.evaluate((x) => window.linkedViews.hours.getScreenMapping().project({ x, y: 1 }), x);
  const [a, b] = [await at(0.2), await at(5.8)];
  await page.mouse.move(box.x + a.x, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + b.x, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  // The brushed rows, from the brush's bounds on dep_hour = 7i mod 24.
  await expect.poll(() => page.evaluate(() => window.linkedViews.hours.getBrush().getConstraints().length)).toBe(1);
  const [lo, hi] = await page.evaluate(() => window.linkedViews.hours.getBrush().getConstraints()[0].bounds);
  const rows = Array.from({ length: 400 }, (_, i) => i).filter((i) => (i * 7) % 24 >= lo && (i * 7) % 24 <= hi);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThan(400);
  await expect.poll(count).toContain(String(rows.length));
  const per = {};
  for (const i of rows) per["abcd"[i % 4]] = (per["abcd"[i % 4]] ?? 0) + 1;
  const expected = Object.entries(per).sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0])).map(([r, f]) => [r, String(f)]);
  await expect.poll(async () => (await table()).map(([r, f]) => `${r}:${f}`).sort()).toEqual(expected.map(([r, f]) => `${r}:${f}`).sort());
  const flights = await page.evaluate(async () => (await window.linkedViews.stats.read()).columns);
  expect(Array.from(flights.flights).reduce((s, v) => s + v, 0)).toBe(rows.length);
  expect(errors).toEqual([]);
});
