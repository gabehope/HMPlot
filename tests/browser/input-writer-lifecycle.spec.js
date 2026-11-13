import { test, expect } from "./fixtures.js";

// TODO 145.2 review findings: input writers' lifecycle.
async function open(page) {
  await page.goto("/test/input-writer-lifecycle");
  await page.waitForFunction(() => window.lifecycle?.context && window.lifecycle?.plot);
  await expect(page.locator('[data-name="grouped"] tbody tr')).toHaveCount(2);
  await page.evaluate(() => window.lifecycle.plot.whenSettled());
}
const values = (page) => page.evaluate(() => window.lifecycle.context.getValues());

test("a hovering writer that goes restores the committed value", async ({ page }) => {
  await open(page);
  const local = await page.evaluate(() => window.lifecycle.plot.getScreenMapping().project({ x: 3, y: 1 }));
  const box = await page.locator(".canvas").first().boundingBox();
  await page.mouse.move(box.x + local.x, box.y + local.y);
  await expect.poll(async () => (await values(page)).focus).toBe("q");
  await page.evaluate(() => window.lifecycle.hideHover());
  await expect.poll(async () => (await values(page)).focus).toBe("committed");
});

test("writers of one input take its one default, in either registration order", async ({ page }) => {
  await open(page);
  const { first, second } = await values(page);
  expect([first, second]).toEqual(["root", "root"]);
});

test("a TableView's renamed input releases the old one", async ({ page }) => {
  await open(page);
  expect(Object.keys(await values(page))).toContain("a");
  await page.evaluate(() => window.lifecycle.renameTableInput("b"));
  await expect.poll(async () => Object.keys(await values(page))).toContain("b");
  await expect.poll(async () => Object.keys(await values(page))).not.toContain("a");
});

test("a TableView hover whose source rows a leave overtakes stays withdrawn", async ({ page }) => {
  await open(page);
  // Enter and leave in one task: the enter's source-row read (an aggregate's contributors, on the
  // GPU) resolves after the leave.
  await page.evaluate(() => {
    const row = document.querySelector('[data-name="grouped"] tbody tr');
    row.dispatchEvent(new PointerEvent("pointerenter"));
    row.dispatchEvent(new PointerEvent("pointerleave"));
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.lifecycle.data.getHover().status().previewActive)).toBe(false);
  // A hover that stays still marks the group's rows.
  await page.locator('[data-name="grouped"] tbody tr').first().hover();
  await expect.poll(() => page.evaluate(() => window.lifecycle.data.getHover().status().previewActive)).toBe(true);
});
