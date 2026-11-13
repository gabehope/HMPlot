import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 140: a Join of a brush-filtered Group's live output. Routes keep their rows and order; a
// brush changes their flight counts (point sizes) in the browser, the vector export draws the
// same, an unmatched route has no count, and clearing the brush restores the totals.
test("route statistics from a brushed live Group reach fixed route rows", async ({ page }) => {
  await page.goto("/test/live-join");
  await page.waitForFunction(() => window.liveJoin?.map?.whenSettled);
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(2);
  const radii = () => page.evaluate(async () => {
    const { map, stats } = window.liveJoin;
    await stats.whenSettled();
    await map.whenSettled();
    const svg = await (await map.exportSVG({ mode: "vector" })).blob.text();
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    return [...doc.querySelectorAll("circle")].map((c) => [Math.round(+c.getAttribute("cx")), Math.round(+c.getAttribute("r") * 10) / 10]).sort((a, b) => a[0] - b[0]);
  });
  const before = await radii();
  // Routes a-d drawn (e has no flights, a missing size), 15 flights each: equal sizes.
  expect(before.length).toBe(4);
  expect(new Set(before.map(([, r]) => r)).size).toBe(1);
  // Brush part of the flights.
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(async () => new Set((await radii()).map(([, r]) => r)).size).toBeGreaterThan(1);
  const brushed = await radii();
  // Routes stay where they were; only their sizes follow the statistics (a route with no brushed
  // flight has no count and draws nothing).
  const places = new Set(before.map(([x]) => x));
  expect(brushed.length).toBeGreaterThan(0);
  expect(brushed.every(([x]) => places.has(x))).toBe(true);
  // Clearing the brush restores the totals.
  await page.evaluate(() => window.liveJoin.source.getBrush().clear());
  await expect.poll(async () => JSON.stringify(await radii())).toBe(JSON.stringify(before));
  expect(await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent))).toEqual([]);
  const frames = await page.evaluate(() => new Promise((resolve) => {
    let n = 0; const t0 = performance.now();
    const f = (now) => { n++; if (now - t0 < 500) requestAnimationFrame(f); else resolve(n); };
    requestAnimationFrame(f);
  }));
  expect(frames).toBeGreaterThan(5);
});

// TODO 145.1: a transform's read() gives its output's rows on the host, after a brush changes
// them and after the brush clears, as a host computation over the brushed source rows gives them.
test("a brushed Group reads back the statistics it publishes", async ({ page }) => {
  await page.goto("/test/live-join");
  await page.waitForFunction(() => window.liveJoin?.map?.whenSettled);
  await expect(page.locator(".canvas[aria-busy='false']")).toHaveCount(2);
  const n = 60, routes = ["a", "b", "c", "d"];
  const expected = (rows) => {
    const by = new Map();
    for (const i of rows) {
      const key = routes[i % 4], entry = by.get(key) ?? { flights: 0, sum: 0 };
      entry.flights++; entry.sum += (i * 13) % 50;
      by.set(key, entry);
    }
    return Object.fromEntries([...by].map(([key, { flights, sum }]) => [key, [flights, sum / flights]]));
  };
  const read = () => page.evaluate(async () => {
    const { columns, length, version } = await window.liveJoin.stats.read();
    return { length, version, byRoute: Object.fromEntries(Array.from(columns.route, (key, i) => [key, [columns.flights[i], columns.delay[i]]])) };
  });
  const totals = await read();
  expect(totals.byRoute).toEqual(Object.fromEntries(Object.entries(expected(Array.from({ length: n }, (_, i) => i))).map(([k, [f, d]]) => [k, [f, expect.closeTo(d, 4)]])));
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await read()).version).not.toBe(totals.version);
  // The brushed rows, from the brush's bounds over the page's columns (delay and distance).
  const bounds = Object.fromEntries((await page.evaluate(() => window.liveJoin.source.getBrush().getConstraints()))
    .map((c) => [c.name, c.bounds]));
  const column = { delay: (i) => (i * 13) % 50, distance: (i) => (i * 7) % 30 };
  const rows = Array.from({ length: n }, (_, i) => i).filter((i) =>
    Object.entries(bounds).every(([name, [lo, hi]]) => column[name](i) >= lo && column[name](i) <= hi));
  expect(Object.keys(bounds).sort()).toEqual(["delay", "distance"]);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThan(n);
  const brushed = await read();
  const want = expected(rows);
  expect(Object.keys(brushed.byRoute).sort()).toEqual(Object.keys(want).sort());
  for (const [key, [flights, delay]] of Object.entries(want)) {
    expect(brushed.byRoute[key][0]).toBe(flights);
    expect(brushed.byRoute[key][1]).toBeCloseTo(delay, 4);
  }
  // Rows as objects, and an unknown column named in the error.
  const objects = await page.evaluate(() => window.liveJoin.stats.read({ rows: true, columns: ["route", "flights"] }));
  expect(objects.rows).toHaveLength(brushed.length);
  expect(Object.keys(objects.rows[0])).toEqual(["route", "flights"]);
  expect(await page.evaluate(() => window.liveJoin.stats.read({ columns: ["nope"] }).then(() => "", (e) => e.message)))
    .toMatch(/Group: read\(\) asked for "nope", which is not a column of this table/);
  await page.evaluate(() => window.liveJoin.source.getBrush().clear());
  await expect.poll(async () => JSON.stringify((await read()).byRoute)).toBe(JSON.stringify(totals.byRoute));
});
