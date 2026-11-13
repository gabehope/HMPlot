// TODO 20.1: Providers (src/routes/test/providers). The fixture's sources wait until the spec
// settles each load (window.providers.calls[label][i].resolve / .reject).
import { test, expect } from "./fixtures.js";
import { installGpuCounters, gpuCounters, countersDelta } from "./gpu-counters.js";

const table = (ids, xs) => ({ id: ids, x: xs, y: xs.map((x) => x + 1) });
const ADELIE = table(["a", "b", "c"], [1, 2, 3]);
const GENTOO = table(["b", "c", "d"], [4, 5, 6]);
const CHINSTRAP = table(["a", "b", "c", "d"], [7, 8, 9, 3]);
const doubled = (rows) => rows.x.map((x) => x * 2);

/** The routed JSON API: name -> { body, etag }; requests are recorded. */
async function routeApi(page) {
  const api = { files: { a: { body: { rows: [{ x: 1 }, { x: 2 }] }, etag: '"e1"' } }, requests: [] };
  await page.route("**/providers-api/*.json", async (route) => {
    const request = route.request(), name = new URL(request.url()).pathname.split("/").pop().replace(".json", "");
    const file = api.files[name], match = request.headers()["if-none-match"];
    api.requests.push({ name, ifNoneMatch: match ?? null });
    if (!file) return route.fulfill({ status: 404, contentType: "text/plain", body: "missing" });
    if (match && match === file.etag) return route.fulfill({ status: 304, headers: { ETag: file.etag } });
    return route.fulfill({ status: 200, contentType: "application/json", headers: { ETag: file.etag }, body: JSON.stringify(file.body) });
  });
  return api;
}

async function open(page, { counters = false } = {}) {
  if (counters) await page.addInitScript(installGpuCounters);
  const api = await routeApi(page);
  await page.goto("/test/providers");
  await page.waitForFunction(() => window.providers && window.providers.calls.main.length === 1 && window.providers.calls.order.length === 1);
  return api;
}
const resolveCall = (page, label, index, value) =>
  page.evaluate(([label, index, value]) => window.providers.calls[label][index].resolve(value), [label, index, value]);
const waitCalls = (page, label, count) =>
  page.waitForFunction(([label, count]) => window.providers.calls[label].length >= count, [label, count]);
/** Resolve the main Provider's first load and wait until its Plot has drawn it. */
async function loadMain(page, rows = ADELIE) {
  await resolveCall(page, "main", 0, rows);
  await page.waitForFunction(() => window.providers.mainPlot);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-case="main"] .canvas')].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  await page.evaluate(() => window.providers.mainPlot.whenSettled());
}
const mainState = (page) => page.evaluate(() => {
  const f = window.providers;
  return {
    calls: f.calls.main.length, values: f.probes.main?.values, loads: f.loads.main.map((event) => event.revision),
    pending: f.statuses.at(-1)?.pending, error: f.statuses.at(-1)?.error, count: f.mainPoints?.getMark().fields.get("position").count,
  };
});

test("the first load mounts the children; an unchanged key and A -> B -> A load nothing", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => ({ plot: !!window.providers.mainPlot, probe: !!window.providers.probes.main, params: window.providers.calls.main[0].params })))
    .toEqual({ plot: false, probe: false, params: { species: "Adelie" } });
  await loadMain(page);
  expect(await mainState(page)).toMatchObject({ calls: 1, values: doubled(ADELIE), loads: [1], pending: false, error: "", count: 3 });
  expect(await page.evaluate(() => window.providers.loads.main[0].rows)).toBe(3);
  // The same species: nothing.
  await page.evaluate(() => window.providers.setSpecies("Adelie"));
  await page.waitForTimeout(250);
  expect((await mainState(page)).calls).toBe(1);
  // Gentoo then Adelie again inside the debounce: nothing loads.
  await page.evaluate(async () => {
    window.providers.setSpecies("Gentoo");
    await new Promise((resolve) => setTimeout(resolve, 30));
    window.providers.setSpecies("Adelie");
  });
  await page.waitForTimeout(300);
  expect((await mainState(page)).calls).toBe(1);
  // Gentoo loading, then Adelie again: Gentoo's load is aborted and nothing else loads.
  await page.evaluate(() => window.providers.setSpecies("Gentoo"));
  await waitCalls(page, "main", 2);
  await page.evaluate(() => window.providers.setSpecies("Adelie"));
  await expect.poll(() => page.evaluate(() => window.providers.calls.main[1].aborted)).toBe(true);
  await page.waitForTimeout(300);
  expect(await mainState(page)).toMatchObject({ calls: 2, values: doubled(ADELIE), loads: [1], pending: false });
  // A Refresh button bound to refresh=: each press loads the same params again.
  await page.locator('[data-case="main"]').getByRole("button", { name: "Refresh" }).click();
  await waitCalls(page, "main", 3);
  expect(await page.evaluate(() => ({ params: window.providers.calls.main[2].params, refresh: window.providers.calls.main[2].refresh })))
    .toEqual({ params: { species: "Adelie" }, refresh: true });
  await resolveCall(page, "main", 2, ADELIE);
  await expect.poll(async () => (await mainState(page)).loads).toEqual([1, 4]);
});

test("a newer request aborts the load in flight; the old result stays drawn until the new one publishes", async ({ page }) => {
  await open(page);
  await loadMain(page);
  await page.evaluate(() => window.providers.setSpecies("Gentoo"));
  await waitCalls(page, "main", 2);
  // Loading: the old rows are still there and drawn, and the status says so.
  expect(await mainState(page)).toMatchObject({ values: doubled(ADELIE), count: 3, pending: true });
  await page.evaluate(() => window.providers.setSpecies("Chinstrap"));
  await waitCalls(page, "main", 3);
  expect(await page.evaluate(() => window.providers.calls.main[1].aborted)).toBe(true);
  // The newer load first, then the superseded one arrives late: it never publishes.
  await resolveCall(page, "main", 2, CHINSTRAP);
  await resolveCall(page, "main", 1, GENTOO);
  await page.evaluate(() => window.providers.mainPlot.whenSettled());
  await page.waitForTimeout(100);
  expect(await mainState(page)).toMatchObject({ values: doubled(CHINSTRAP), loads: [1, 3], pending: false, count: 4 });
  // A refresh (its load is its own, not shared) superseded by a params change: its late result is dropped too.
  const refreshed = page.evaluate(() => window.providers.main.refresh().then(() => "done"));
  await waitCalls(page, "main", 4);
  await page.evaluate(() => window.providers.setSpecies("Adelie"));
  await waitCalls(page, "main", 5);
  await resolveCall(page, "main", 4, ADELIE);
  await resolveCall(page, "main", 3, CHINSTRAP);
  expect(await refreshed).toBe("done");
  await page.evaluate(() => window.providers.mainPlot.whenSettled());
  await page.waitForTimeout(100);
  expect(await mainState(page)).toMatchObject({ values: doubled(ADELIE), loads: [1, 3, 5], count: 3 });
});

test("whenSettled() and exportPNG wait for a load requested before them, through its debounce and a Calculate", async ({ page }) => {
  await open(page);
  await loadMain(page);
  const result = await page.evaluate(async (rows) => {
    const f = window.providers, order = [];
    f.setSpecies("Gentoo");
    const waits = [
      f.mainPlot.whenSettled().then(() => order.push("plot")),
      f.main.whenSettled().then(() => order.push("provider")),
      f.mainPlot.exportPNG().then((blob) => order.push(`png ${blob.size > 0}`)),
    ];
    // Past the debounce: the load is in flight and nothing has resolved.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const early = [...order];
    f.calls.main.at(-1).resolve(rows);
    await Promise.all(waits);
    return { early, order: order.sort(), values: f.probes.main.values };
  }, GENTOO);
  expect(result).toEqual({ early: [], order: ["plot", "png true", "provider"], values: doubled(GENTOO) });
});

test("a load error keeps the previous result, shows it, and calls onerror; refresh() rejects with it", async ({ page }) => {
  await open(page);
  await loadMain(page);
  await page.evaluate(() => window.providers.setSpecies("Emperor"));
  await waitCalls(page, "main", 2);
  await page.evaluate(() => window.providers.calls.main[1].reject(new Error("HTTP 500 from the test")));
  await expect(page.locator('[data-case="main"] p[role="alert"]')).toHaveText("Provider: HTTP 500 from the test");
  expect(await mainState(page)).toMatchObject({ values: doubled(ADELIE), count: 3, pending: false, error: "Provider: HTTP 500 from the test" });
  expect(await page.evaluate(() => window.providers.errors.main)).toEqual(["HTTP 500 from the test"]);
  const refreshed = page.evaluate(() => window.providers.main.refresh().then(() => "ok", (error) => error.message));
  await waitCalls(page, "main", 3);
  await page.evaluate(() => window.providers.calls.main[2].reject(new Error("still down")));
  expect(await refreshed).toBe("still down");
  const again = page.evaluate(() => window.providers.main.refresh().then(() => "ok", (error) => error.message));
  await waitCalls(page, "main", 4);
  await resolveCall(page, "main", 3, GENTOO);
  expect(await again).toBe("ok");
  await expect(page.locator('[data-case="main"] p[role="alert"]')).toHaveCount(0);
  expect(await mainState(page)).toMatchObject({ values: doubled(GENTOO), error: "" });
});

test("a keyed reload keeps a selection on its key", async ({ page }) => {
  await open(page);
  await loadMain(page);
  const selected = await page.evaluate(async (rows) => {
    const f = window.providers, owner = ((m) => m?.view.marks.of(m))(f.mainPoints.getMark())?.interaction.owner, selection = f.main.getSelection();
    selection.replace(owner, [1]); // "b"
    const before = [...selection.rows(owner)];
    f.setSpecies("Gentoo");
    await new Promise((resolve) => setTimeout(resolve, 200));
    f.calls.main.at(-1).resolve(rows); // b is now row 0
    await f.mainPlot.whenSettled();
    return { before, after: [...selection.rows(((m) => m?.view.marks.of(m))(f.mainPoints.getMark())?.interaction.owner)] };
  }, GENTOO);
  expect(selected).toEqual({ before: [1], after: [0] });
});

test("two Providers with the same source and key share one load; a param that keeps changing loads once it pauses", async ({ page }) => {
  await open(page);
  await waitCalls(page, "shared", 1);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.providers.calls.shared.length)).toBe(1);
  await resolveCall(page, "shared", 0, { x: [1, 2] });
  await expect.poll(() => page.evaluate(() => [window.providers.probes.sharedA?.values, window.providers.probes.sharedB?.values])).toEqual([[1, 2], [1, 2]]);
  await page.evaluate(() => window.providers.setShared(2));
  await waitCalls(page, "shared", 2);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.providers.calls.shared.map((call) => call.params))).toEqual([{ n: 1 }, { n: 2 }]);
  await resolveCall(page, "shared", 1, { x: [3] });
  await expect.poll(() => page.evaluate(() => [window.providers.probes.sharedA?.values, window.providers.probes.sharedB?.values])).toEqual([[3], [3]]);

  // Twenty changes 30 ms apart (default debounce, 150 ms): one load, for the last value.
  await waitCalls(page, "debounced", 1);
  await resolveCall(page, "debounced", 0, { x: [0] });
  const during = await page.evaluate(async () => {
    for (let v = 1; v <= 20; v++) {
      window.providers.setDebounced(v);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return window.providers.calls.debounced.length;
  });
  expect(during).toBe(1);
  await waitCalls(page, "debounced", 2);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.providers.calls.debounced.map((call) => call.params.v))).toEqual([0, 20]);
});

test("a Provider mounting late under a Frame keeps declaration order and the plot's frame", async ({ page }) => {
  await open(page);
  // The plot waits for the load inside it to reveal (and to settle), so read it before that.
  await page.waitForFunction(() => window.providers.orderPlot && window.providers.before?.getMark() && window.providers.after?.getMark());
  await page.waitForTimeout(300);
  const layout = () => page.evaluate(() => JSON.stringify(window.providers.orderPlot.getAxisLayout(), (key, value) => (typeof value === "function" ? undefined : value)));
  const first = await layout();
  expect(await page.evaluate(() => !!window.providers.late)).toBe(false);
  await resolveCall(page, "order", 0, { x: [4, 5], y: [4, 5] });
  await page.waitForFunction(() => window.providers.late?.getMark());
  await page.evaluate(() => window.providers.orderPlot.whenSettled());
  const orders = await page.evaluate(() => ["before", "late", "after"].map((name) => window.providers[name].getMark().renderOrder));
  expect(orders[0], JSON.stringify(orders)).toBeLessThan(orders[1]);
  expect(orders[1], JSON.stringify(orders)).toBeLessThan(orders[2]);
  expect(await layout()).toBe(first);
});

test("polling: ticks never overlap, and whenSettled() waits for the tick in flight only", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => window.providers.pollPlot);
  // Loads slower than the interval (400 ms against 250 ms).
  await page.evaluate(() => { window.providers.poll.delay = 400; window.providers.poll.spans.length = 0; });
  await page.waitForTimeout(2000);
  const spans = await page.evaluate(() => window.providers.poll.spans.filter((span) => span.end !== undefined));
  expect(spans.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < spans.length; i++) {
    expect(spans[i].start, JSON.stringify(spans)).toBeGreaterThanOrEqual(spans[i - 1].end);
    expect(spans[i].refresh).toBe(true);
  }
  // Called while a tick loads, whenSettled() waits for it but not for the ticks after it.
  const settle = await page.evaluate(async () => {
    const f = window.providers;
    await new Promise((resolve) => { const check = () => (f.poll.spans.at(-1)?.end === undefined ? resolve() : setTimeout(check, 5)); check(); });
    const started = performance.now(), loading = f.poll.spans.at(-1);
    await f.pollPlot.whenSettled();
    return { ms: performance.now() - started, finished: loading.end !== undefined };
  });
  expect(settle.finished).toBe(true);
  expect(settle.ms).toBeLessThan(1200);
});

test("polling: an unchanged version publishes nothing; a same-length new version compiles nothing and draws", async ({ page }) => {
  await open(page, { counters: true });
  await page.waitForFunction(() => window.providers.pollPlot);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-case="polled"] .canvas')].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  const published = () => page.evaluate(() => ({ runs: window.providers.probes.polled.runs, loads: window.providers.loads.polled.length, calls: window.providers.poll.spans.length }));
  const quiet = await published();
  await page.waitForTimeout(1000);
  const later = await published();
  expect(later.calls, JSON.stringify([quiet, later])).toBeGreaterThan(quiet.calls + 1);
  expect(later.runs).toBe(quiet.runs);
  expect(later.loads).toBe(quiet.loads);
  const next = (version, values) => page.evaluate(async ([version, values]) => {
    const f = window.providers;
    f.poll.version = version;
    f.poll.values = values;
    await new Promise((resolve) => { const check = () => (f.probes.polled.values?.join() === values.join() ? resolve() : setTimeout(check, 10)); check(); });
    await f.pollPlot.whenSettled();
  }, [version, values]);
  // Warm: the first new versions may compile what a changed column needs.
  await next("v2", [5, 6, 7, 8]);
  await next("v3", [2, 2, 3, 9]);
  const before = await gpuCounters(page), drawn = await page.evaluate(() => window.providers.pollPlot.getDiagnostics().completedFrame);
  const runs = (await published()).runs;
  for (const [version, values] of [["v4", [1, 7, 3, 4]], ["v5", [9, 1, 2, 6]], ["v6", [3, 3, 8, 1]]]) await next(version, values);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
  expect((await published()).runs).toBe(runs + 3);
  expect(await page.evaluate(() => window.providers.pollPlot.getDiagnostics().completedFrame)).toBeGreaterThan(drawn);
});

test("polling pauses while the page is hidden and ticks at once when it is shown again", async ({ page }) => {
  await open(page);
  await page.waitForFunction(() => window.providers.pollPlot);
  const count = await page.evaluate(async () => {
    const f = window.providers;
    const setHidden = (hidden) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    await new Promise((resolve) => setTimeout(resolve, 300));
    setHidden(true);
    await new Promise((resolve) => setTimeout(resolve, 60)); // a tick already loading may finish
    const hiddenAt = f.poll.spans.length;
    await new Promise((resolve) => setTimeout(resolve, 900));
    const whileHidden = f.poll.spans.length - hiddenAt;
    setHidden(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { whileHidden, afterShown: f.poll.spans.length - hiddenAt - whileHidden };
  });
  expect(count).toEqual({ whileHidden: 0, afterShown: 1 });
});

test("fetchJSON through the url prop: a 304 on refresh publishes nothing, and an HTTP error is shown", async ({ page }) => {
  const api = await open(page);
  await expect.poll(() => page.evaluate(() => window.providers.probes.fetched?.values)).toEqual([1, 2]);
  const runs = await page.evaluate(() => window.providers.probes.fetched.runs);
  await page.evaluate(() => window.providers.fetched.refresh());
  expect(api.requests.at(-1)).toEqual({ name: "a", ifNoneMatch: '"e1"' });
  expect(await page.evaluate(() => ({ runs: window.providers.probes.fetched.runs, loads: window.providers.loads.fetched.length }))).toEqual({ runs, loads: 1 });
  api.files.a = { body: { rows: [{ x: 5 }, { x: 6 }, { x: 7 }] }, etag: '"e2"' };
  await page.evaluate(() => window.providers.fetched.refresh());
  expect(await page.evaluate(() => window.providers.probes.fetched.values)).toEqual([5, 6, 7]);
  await page.evaluate(() => window.providers.setFetchName("missing"));
  await expect(page.locator('[data-case="fetched"] p[role="alert"]')).toContainText("Provider: HTTP 404");
  await expect(page.locator('[data-case="fetched"] p[role="alert"]')).toContainText("/providers-api/missing.json");
  expect(await page.evaluate(() => window.providers.probes.fetched.values)).toEqual([5, 6, 7]);
});

test("the parquet-earthquakes example reads three of five columns by range requests (TODO 48.3)", async ({ page }) => {
  const errors = [], parquet = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().endsWith(".parquet") && response.request().method() === "GET")
      parquet.push({ status: response.status(), bytes: Number(response.headers()["content-length"] ?? 0) });
  });
  await page.goto("/examples/parquet-earthquakes");
  await expect(page.locator(".live-example output")).toContainText("72,956 earthquakes", { timeout: 60000 });
  await page.waitForFunction(() => window.__examples?.plot);
  await page.evaluate(() => window.__examples.settle());
  expect(await page.evaluate(() => window.__examples.plot.getRenderError())).toBe("");
  // Every read is a byte range, and together they are well short of the 828 KB file.
  expect(parquet.length).toBeGreaterThan(0);
  expect(parquet.every((response) => response.status === 206)).toBe(true);
  expect(parquet.reduce((total, response) => total + response.bytes, 0)).toBeLessThan(0.75 * 827977);
  expect(errors).toEqual([]);
});

// TODO 127: accumulate merges each load into the table on screen: keyed upserts in place, new
// keys append, maxRows keeps the newest, the cursor reaches the next load, selections stay on
// their keys, and failed, superseded or mismatched loads leave the rows; new params start afresh.
test("an accumulating feed merges loads by key, keeps maxRows, and resets on new params", async ({ page }) => {
  await open(page);
  await waitCalls(page, "feed", 1);
  const rows = (ids, xs) => ({ id: ids, x: xs });
  const feed = (action) => page.evaluate(action);
  const settle = async (count) => {
    await page.waitForFunction((count) => window.providers.loads.feed.length >= count, count);
    await page.evaluate(() => window.providers.feedPlot.whenSettled());
  };
  const state = () => page.evaluate(() => ({
    ids: window.providers.probes.feed?.values,
    drawn: window.providers.feedPoints.getMark().fields.get("position").count,
  }));
  await resolveCall(page, "feed", 0, { data: rows([1, 2, 3], [1, 2, 3]), version: "v1" });
  await settle(1);
  expect(await state()).toEqual({ ids: [1, 2, 3], drawn: 3 });
  // Select key 3, then a load re-sends key 2 and adds 4: 2 updates in place, 3 stays selected.
  await page.evaluate(() => { const m = window.providers.feedPoints.getMark(); window.providers.feed.getSelection().replace(m.view.marks.of(m).interaction.owner, [2]); });
  await feed(() => { window.providers.feed.refresh().catch(() => {}); });
  await waitCalls(page, "feed", 2);
  expect(await page.evaluate(() => window.providers.calls.feed[1].version)).toBe("v1");
  await resolveCall(page, "feed", 1, { data: rows([2, 4], [9, 4]), version: "v2" });
  await settle(2);
  expect(await state()).toEqual({ ids: [1, 2, 3, 4], drawn: 4 });
  expect(await page.evaluate(() => { const m = window.providers.feedPoints.getMark(); return [...window.providers.feed.getSelection().rows(m.view.marks.of(m).interaction.owner)]; })).toEqual([2]);
  // maxRows 5: the oldest rows go.
  await feed(() => { window.providers.feed.refresh().catch(() => {}); });
  await waitCalls(page, "feed", 3);
  await resolveCall(page, "feed", 2, { data: rows([5, 6], [5, 6]), version: "v3" });
  await settle(3);
  expect(await state()).toEqual({ ids: [2, 3, 4, 5, 6], drawn: 5 });
  // Key 3 is now row 1, and still selected.
  expect(await page.evaluate(() => { const m = window.providers.feedPoints.getMark(); return [...window.providers.feed.getSelection().rows(m.view.marks.of(m).interaction.owner)]; })).toEqual([1]);
  // A failed load, a superseded one and one with other columns leave the rows on screen.
  await feed(() => { window.providers.feed.refresh().catch(() => {}); });
  await waitCalls(page, "feed", 4);
  await page.evaluate(() => window.providers.calls.feed[3].reject(new Error("offline")));
  await feed(() => { const f = window.providers.feed; f.refresh().catch(() => {}); f.refresh().catch(() => {}); });
  await waitCalls(page, "feed", 6);
  expect(await page.evaluate(() => window.providers.calls.feed[4].aborted)).toBe(true);
  await resolveCall(page, "feed", 4, { data: rows([7], [7]), version: "v4" });
  await resolveCall(page, "feed", 5, { data: { id: [8], y: [8] }, version: "v5" });
  await page.waitForFunction(() => window.providers.errors.feed.length >= 2);
  expect(await page.evaluate(() => window.providers.errors.feed)).toEqual(["offline", expect.stringContaining("it lacks x and it adds y")]);
  await page.evaluate(() => window.providers.feedPlot.whenSettled());
  expect(await state()).toEqual({ ids: [2, 3, 4, 5, 6], drawn: 5 });
  // New params: a fresh table.
  await feed(() => window.providers.setStream("south"));
  await waitCalls(page, "feed", 7);
  await resolveCall(page, "feed", 6, { data: rows([1], [1]), version: "s1" });
  await settle(4);
  expect(await state()).toEqual({ ids: [1], drawn: 1 });
});
