import { test, expect } from "./fixtures.js";

// TODO 23.0b: hmplot bundles its own jax-js (hmplot/jax). Arrays from a second jax-js
// copy (upstream @jax-js/jax, as in an app without the hmplot/vite plugin) are another
// Array class on another GPU device; they are copied through the host. Fixture /test/foreign-jax
// draws the same points from hmplot/jax arrays and from upstream arrays, as mark channels
// and as data-table columns.
const pixels = (page, name) => page.evaluate(async (name) => {
  await window.foreignJax.settle();
  const png = await window.foreignJax[name].exportPNG(), bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0); bitmap.close();
  return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
}, name);
const differing = (a, b) => {
  let count = 0;
  for (let i = 0; i < a.length; i += 4)
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]) > 12) count++;
  return count;
};
const drawn = (a) => {
  let count = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 40 && a[i + 2] > a[i] + 40) count++; // the blue fill
  return count;
};
const ready = (page) => page.waitForFunction(() => window.foreignJax?.foreignTable && window.foreignJax?.ownTable);

test("arrays from another jax-js copy draw like hmplot's own, with one warning", async ({ page }) => {
  await page.goto("/test/foreign-jax");
  await ready(page);
  const own = await pixels(page, "own"), foreign = await pixels(page, "foreign");
  const ownTable = await pixels(page, "ownTable"), foreignTable = await pixels(page, "foreignTable");
  expect(drawn(own)).toBeGreaterThan(40);
  expect(drawn(ownTable)).toBeGreaterThan(40);
  expect(foreign.length).toBe(own.length);
  expect(differing(own, foreign)).toBe(0);
  expect(differing(ownTable, foreignTable)).toBe(0);
  const warnings = await page.evaluate(() => window.foreignJax.warnings.filter((w) => /another jax-js copy/.test(w)));
  expect(warnings).toHaveLength(1);
});

test("copies of replaced foreign arrays are released", async ({ page }) => {
  await page.goto("/test/foreign-jax");
  await ready(page);
  await page.evaluate(() => window.foreignJax.settle());
  // Copies go when the app's arrays are collected: collect, then let finalizers run. A mark
  // holds its last inputs a while (updates in flight, the values it retargets from), so the
  // count after 10 replacements and after 40 more must be the same, not back to the start.
  const cdp = await page.context().newCDPSession(page);
  const liveAfterCollecting = async () => {
    let live = Infinity;
    for (let i = 0; i < 10; i++) {
      await cdp.send("HeapProfiler.collectGarbage");
      await page.waitForTimeout(100);
      live = Math.min(live, await page.evaluate(() => window.foreignJax.liveForeignCopies()));
    }
    return live;
  };
  await page.evaluate(() => window.foreignJax.replace(10));
  const warm = await liveAfterCollecting();
  await page.evaluate(() => window.foreignJax.replace(40));
  const later = await liveAfterCollecting();
  expect(warm).toBeGreaterThan(0);
  expect(later).toBeLessThanOrEqual(warm);
});
