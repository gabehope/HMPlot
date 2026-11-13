import { test, expect } from "./fixtures.js";

// LinkViews shares one union domain by default (TODO 136.14, 135.7), and a domain takes dates.
async function open(page, query = "") {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/test/link-domains${query}`);
  await page.waitForFunction(() => window.linkDomainsReady);
  await page.evaluate(() => window.linkDomains.settled());
  return errors;
}
const span = (page, id, axis = "x") =>
  page.evaluate(([id, axis]) => {
    const values = window.linkDomains.ticks(id, axis).map((t) => t.value);
    return values.length ? [Math.min(...values), Math.max(...values)] : null;
  }, [id, axis]);

test("linked plots show the union of their data on the linked axis", async ({ page }) => {
  const errors = await open(page);
  // First's data is 0 to 10, second's 5 to 20: both axes run from 0 to 20.
  for (const id of ["first", "second"])
    await expect.poll(() => span(page, id)).toEqual([0, 20]);
  expect(errors).toEqual([]);
});

test("a plot in two LinkViews shares each one's axes, and a plot that draws nothing takes the others' domain", async ({ page }) => {
  const errors = await open(page);
  // First (y 0 to 5) is linked to third (y 10 to 15) on y, and keeps its x link with second.
  await expect.poll(async () => (await span(page, "first", "y"))?.[1]).toBeGreaterThanOrEqual(10);
  await expect.poll(async () => (await span(page, "third", "y"))?.[0]).toBeLessThanOrEqual(0);
  await expect.poll(() => span(page, "first")).toEqual([0, 20]);
  // Third's x is linked only to the empty plot: it stays 5 to 20, and the empty plot shows that.
  await expect.poll(async () => (await span(page, "third"))?.[0]).toBeGreaterThanOrEqual(5);
  await expect.poll(async () => (await span(page, "empty"))?.[0]).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});

test("scales=\"free\" keeps each linked plot's own domain", async ({ page }) => {
  const errors = await open(page, "?free");
  await expect.poll(() => span(page, "first")).toEqual([0, 10]);
  await expect.poll(async () => (await span(page, "second"))?.[0]).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});

test("a domain of dates draws a time axis over those days", async ({ page }) => {
  const errors = await open(page);
  // The domain is January 1 to 11 (the data are January 3 to 8), counted from its start: the
  // ticks are days of the month, and reach past the data to the domain's end.
  const day = 86400000;
  await expect.poll(async () => {
    const ticks = await page.evaluate(() => window.linkDomains.ticks("dates", "x"));
    const values = ticks.map((t) => t.value);
    return ticks.length > 1 && Math.min(...values) >= 0 && Math.max(...values) >= 8 * day &&
      Math.max(...values) <= 10 * day && ticks.every((t) => String((t.value / day) + 1) === t.text);
  }).toBe(true);
  expect(errors).toEqual([]);
});
