import { test, expect } from "./fixtures.js";

// TODO 145.4: TableView shows the rows of the data around it and follows them; a row click or hover
// writes an input or a selection.
async function open(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/table-view");
  await expect(page.locator('[data-name="top"] tbody tr')).toHaveCount(3);
  return errors;
}
const rows = (page, name) => page.locator(`[data-name="${name}"] tbody tr`).evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((td) => td.textContent.trim())));

test("a TableView shows the sorted rows of a Filter, the first limit of them, and follows a brush", async ({ page }) => {
  const errors = await open(page);
  expect(await rows(page, "top")).toEqual([["Model 3", "132"], ["Leaf", "111"], ["Prius", "52"]]);
  await expect(page.locator('[data-name="top"] th')).toHaveText(["model", "MPG"]);
  await expect(page.locator('[data-name="top"] .hm-table-more')).toHaveText("5 more rows");
  await expect(page.locator('[data-name="top"] figcaption')).toHaveText("Most efficient");
  // Brush the light cars (weight 1200-1400): Civic, Corolla, Golf, Prius.
  const box = await page.locator(".canvas").first().boundingBox();
  const at = (x, y) => page.evaluate(({ x, y }) => window.tablePage.plot.getScreenMapping().project({ x, y }), { x, y });
  const [a, b] = [await at(1200, 130), await at(1400, 5)];
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + a.x, box.y + a.y); await page.mouse.down();
  await page.mouse.move(box.x + b.x, box.y + b.y, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => rows(page, "top")).toEqual([["Prius", "52"], ["Civic", "36"], ["Corolla", "34"]]);
  await expect(page.locator('[data-name="top"] .hm-table-more')).toHaveText("1 more row");
  expect(errors).toEqual([]);
});

test("a row click writes an input (a second click restores its default) and a hover previews one", async ({ page }) => {
  await open(page);
  const values = () => page.evaluate(() => window.tablePage.context.getValues());
  await page.locator('[data-name="top"] tbody tr').nth(1).click();
  await expect.poll(async () => (await values()).model).toBe("Leaf");
  await page.locator('[data-name="top"] tbody tr').nth(1).click();
  await expect.poll(async () => (await values()).model).toBe(null);
  await page.locator('[data-name="origins"] tbody tr').filter({ hasText: "Europe" }).hover();
  await expect.poll(async () => (await values()).origin).toBe("Europe");
  await page.mouse.move(1, 1);
  await expect.poll(async () => (await values()).origin).toBe(null);
});

test("select on a Group's row selects its source rows, which a plot of the same data responds to", async ({ page }) => {
  await open(page);
  await page.locator('[data-name="origins"] tbody tr').filter({ hasText: "USA" }).click();
  const selected = () => page.evaluate(() => [...window.tablePage.plot.getSelection().rows()].sort((a, b) => a - b));
  await expect.poll(selected).toEqual([3, 5, 6]);
  await page.locator('[data-name="origins"] tbody tr').filter({ hasText: "USA" }).click();
  await expect.poll(selected).toEqual([]);
});
