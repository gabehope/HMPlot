import { test, expect } from "./fixtures.js";

// A domain read from the data (TODO 136.14, slice 4): extent(column, {where}) is the extent of the
// matching rows, follows the selection, and is automatic while no row matches.
const ticks = (page, fixture) =>
  page.locator(`[data-fixture="${fixture}"] .x-tick`).evaluateAll((elements) =>
    elements.map((element) => Number(element.getAttribute("data-value"))));

test("updated series domains follow their drawn paths and omit missing keys", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto("/test/data-domains");
    await page.waitForFunction(() => window.dataDomains?.seriesPlot?.whenSettled);
    await expect.poll(() => page.locator('[data-fixture="series"] .canvas').getAttribute("aria-busy")).toBe("false");
    await page.evaluate(() => window.dataDomains.seriesPlot.whenSettled());
    await page.evaluate(() => window.dataDomains.updateSeries());
    await expect.poll(async () => {
      await page.evaluate(() => window.dataDomains.seriesPlot.whenSettled());
      const values = await ticks(page, "series");
      return values.length > 1 && Math.min(...values) >= 0 && Math.max(...values) <= 2;
    }).toBe(true);
    const y = await page.locator('[data-fixture="series"] .y-tick').evaluateAll(elements =>
      elements.map(element => Number(element.getAttribute("data-value"))));
    expect(Math.max(...y)).toBeLessThanOrEqual(12);
    expect(await page.evaluate(() => window.dataDomains.seriesPlot.getRenderError())).toBe("");
  } finally {
    await context.close();
  }
});

test("extent() domains show the matching rows and follow the brush", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/data-domains");
  await page.waitForFunction(() => window.dataDomains?.matching && window.dataDomains?.overview && window.dataDomains?.detail);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  await page.evaluate(() => Promise.all(["matching", "single", "times", "overview", "detail"].map((k) => window.dataDomains[k].whenSettled())));
  // The rows with y > 30 have x from 2 to 35: the axis shows those, not 0 to 39.
  await expect.poll(async () => {
    const x = await ticks(page, "matching");
    return x.length > 1 && Math.min(...x) >= 2 && Math.max(...x) <= 35;
  }).toBe(true);
  // One matching row spans nothing: automatic, not an error.
  await expect.poll(async () => Math.max(...await ticks(page, "single"))).toBeGreaterThanOrEqual(30);
  // A datetime column's extent is a time axis over the matching days, January 3 to February 5,
  // counted from its start.
  await expect.poll(async () => {
    const t = await ticks(page, "times");
    return t.length > 1 && Math.min(...t) >= 0 && Math.max(...t) <= 33 * 86400000;
  }).toBe(true);
  expect(await page.locator('[data-fixture="times"] .x-tick').first().textContent()).toBe("7");
  // Nothing brushed: the detail's domain is automatic, all of the data.
  await expect.poll(async () => Math.max(...await ticks(page, "detail"))).toBeGreaterThanOrEqual(30);
  const area = page.locator('[data-fixture="overview"]');
  await area.scrollIntoViewIfNeeded();
  const box = await area.locator('[aria-label="Plot canvas"]').boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.9, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => page.evaluate(() => window.dataDomains.overview.getBrush().getConstraints().length)).toBeGreaterThan(0);
  const bounds = await page.evaluate(() =>
    window.dataDomains.overview.getBrush().getConstraints().find((c) => c.name === "x")?.bounds);
  await page.evaluate(() => window.dataDomains.detail.whenSettled());
  await expect.poll(async () => {
    const x = await ticks(page, "detail");
    return x.length > 1 && Math.min(...x) >= bounds[0] && Math.max(...x) <= bounds[1];
  }).toBe(true);
  // A cleared brush matches no row: automatic again.
  await page.evaluate(() => window.dataDomains.overview.clearBrush());
  await expect.poll(async () => Math.max(...await ticks(page, "detail"))).toBeGreaterThanOrEqual(30);
  expect(errors).toEqual([]);
});
