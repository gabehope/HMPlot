// TODO 20.1: Provider sources, request keys, shared loads and the request scheduler.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tableFromArrays, tableToIPC } from "apache-arrow";
import {
  plainParams, stableKey, fillUrl, parseCSV, unwrap, sourceOf, requestKeyOf, fetchJSON, fetchCSV,
  fetchArrow, fetchParquet, encodeInitial, decodeInitial, sharedLoad, sharedLoadCount, createScheduler, shareKey,
  accumulateResult,
} from "../../src/lib/plot/utils/providers.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { asArray } from "../../src/lib/plot/utils/data.js";
import { isArrowTable } from "../../src/lib/plot/utils/arrow.js";
import { settleClock } from '../../src/lib/plot/rendering/viewSettlement.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

test("binary snapshots preserve typed subviews and large payloads", async () => {
  const {bytesToBase64, base64ToBytes} = await import("../../src/lib/encoding/base64.js");
  for (const Type of [Float32Array, Float64Array, Int8Array, Int16Array, Int32Array,
    Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, BigInt64Array, BigUint64Array]) {
    const big = Type === BigInt64Array || Type === BigUint64Array;
    const backing = new Type(big ? [99n, 0n, 1n, 17n, 99n] : [99, 0, 1, 17, 99]);
    const input = {column: backing.subarray(1, 4)};
    const output = decodeInitial(JSON.parse(JSON.stringify(encodeInitial(input))));
    assert.deepEqual(output, input);
    assert.notEqual(output.column.buffer, backing.buffer);
  }
  const large = Uint8Array.from({length: 100003}, (_, i) => i % 256).subarray(3, 100000);
  const restored = base64ToBytes(bytesToBase64(large));
  assert.deepEqual(restored, large);
  assert.notEqual(restored.buffer, large.buffer);
  assert.deepEqual(base64ToBytes(bytesToBase64(new Uint8Array())), new Uint8Array());
  assert.throws(() => base64ToBytes("?"));
});

test("params are frozen plain copies with a stable key", () => {
  const params = plainParams({ b: [1, { c: "x" }], a: true, gone: undefined });
  assert.deepEqual(params, { b: [1, { c: "x" }], a: true });
  assert.ok(Object.isFrozen(params) && Object.isFrozen(params.b) && Object.isFrozen(params.b[1]));
  assert.equal(stableKey(params), stableKey({ a: true, b: [1, { c: "x" }] }));
  assert.notEqual(stableKey({ a: 1 }), stableKey({ a: "1" }));
  for (const [value, text] of [[{ when: new Date(0) }, "params.when is a Date (pass a string)"], [{ f: () => 1 }, "params.f is a function"], [{ m: new Map() }, "params.m is a Map"]])
    assert.throws(() => plainParams(value), (error) => error.code === "provider.params" && error.message.includes(text), text);
});

test("url templates fill {name} from params, encoded, and name what is missing", () => {
  assert.equal(fillUrl("/api/penguins?species={species}&n={n}", { species: "Adélie & co", n: 3 }), "/api/penguins?species=Ad%C3%A9lie%20%26%20co&n=3");
  assert.equal(fillUrl(({ year }) => `/data/${year}.csv`, { year: 2020 }), "/data/2020.csv");
  assert.throws(() => fillUrl("/api/{species}", {}), (error) => error.code === "provider.url" && /\{species\}/.test(error.message));
  // TODO 127: {version} is the cursor, empty for the first request, unless params has a version.
  assert.equal(fillUrl("/events?since={version}", {}), "/events?since=");
  assert.equal(fillUrl("/events?since={version}", {}, "2026-10-12T10:00"), "/events?since=2026-10-12T10%3A00");
  assert.equal(fillUrl("/v{version}", { version: 2 }, "cursor"), "/v2");
});

test("accumulate merges a load into the table on screen (TODO 127)", () => {
  // Without a key, rows append in arrival order; maxRows keeps the newest; typed columns stay typed.
  assert.deepEqual(accumulateResult({ t: [1, 2], v: [10, 20] }, [{ t: 3, v: 30 }]), { t: [1, 2, 3], v: [10, 20, 30] });
  const trimmed = accumulateResult({ t: Float64Array.of(1, 2, 3), v: [1, 2, 3] }, { t: Float64Array.of(4, 5), v: [4, 5] }, { maxRows: 3 });
  assert.ok(trimmed.t instanceof Float64Array);
  assert.deepEqual([...trimmed.t, ...trimmed.v], [3, 4, 5, 3, 4, 5]);
  // With a key (one column or several), a re-sent row updates in place and new keys append.
  assert.deepEqual(accumulateResult([{ id: "a", v: 1 }, { id: "b", v: 2 }], [{ id: "b", v: 20 }, { id: "c", v: 3 }], { key: "id" }),
    { id: ["a", "b", "c"], v: [1, 20, 3] });
  assert.deepEqual(accumulateResult({ s: [1, 1], d: [1, 2], v: [0, 0] }, { s: [1], d: [2], v: [9] }, { key: ["s", "d"] }),
    { s: [1, 1], d: [1, 2], v: [0, 9] });
  // An Arrow load merges as its columns.
  const arrow = tableFromArrays({ id: Int32Array.of(2, 3), v: Float64Array.of(20, 30) });
  const merged = accumulateResult({ id: Int32Array.of(1, 2), v: Float64Array.of(1, 2) }, arrow, { key: "id" });
  // Arrow's integers come wrapped with their type, and stay so.
  assert.equal(merged.id.__hmplotColumn, true);
  assert.deepEqual([...merged.id.values, ...merged.v], [1, 2, 3, 1, 20, 30]);
  // The columns must match the table on screen; the error names them. A GeoJSON is not merged.
  assert.throws(() => accumulateResult({ a: [1], b: [2] }, { a: [3], c: [4] }),
    (error) => error.code === "provider.accumulate" && /lacks b and it adds c/.test(error.message));
  assert.throws(() => accumulateResult({ a: [1] }, { a: [2] }, { key: "id" }), /key id is not a column/);
  assert.throws(() => accumulateResult({ a: [1] }, { type: "FeatureCollection", features: [] }), /accumulate merges tables/);
});

test("CSV columns: numbers where every non-empty cell is one, strings otherwise, empty cells missing", () => {
  const columns = parseCSV("a,b,c,d\n1,x,2020-01-01,\n2.5,,2020-01-02,\n,y,,\n");
  assert.deepEqual(columns, { a: [1, 2.5, null], b: ["x", null, "y"], c: ["2020-01-01", "2020-01-02", null], d: [null, null, null] });
  assert.deepEqual(parseCSV("a,b\n"), { a: [], b: [] });
  // A schema's categorical, ordinal and boolean columns stay text (R2.0): "02134" keeps its zero.
  assert.deepEqual(parseCSV("zip,n,rank\n02134,1,3\n10001,2,1\n", { zip: "categorical", rank: { type: "ordinal" } }),
    { zip: ["02134", "10001"], n: [1, 2], rank: ["3", "1"] });
});

test("an object with a scalar version and data is an envelope; anything else is data", () => {
  assert.deepEqual(unwrap({ data: [{ x: 1 }], version: "v1" }), { data: [{ x: 1 }], version: "v1" });
  assert.deepEqual(unwrap({ data: [1, 2] }), { data: { data: [1, 2] }, version: undefined });
  assert.deepEqual(unwrap({ data: [1, 2], version: [3, 4] }), { data: { data: [1, 2], version: [3, 4] }, version: undefined });
  const rows = [{ version: 1, data: 2 }];
  assert.equal(unwrap(rows).data, rows);
});

test("sources: a load function, an object, or a url; request keys", () => {
  const load = async () => [];
  assert.equal(sourceOf({ source: load }).id, load);
  const object = { load, requestKey: ({ params }) => params.species };
  const source = sourceOf({ source: object });
  assert.equal(source.id, object);
  assert.equal(requestKeyOf(source, { species: "Gentoo", other: 1 }), "Gentoo");
  assert.equal(requestKeyOf(sourceOf({ source: load }), { b: 1, a: 2 }), '{"a":2,"b":1}');
  const url = sourceOf({ url: "/data/{year}.csv", format: "csv" });
  assert.equal(url.id, sourceOf({ url: "/data/{year}.csv", format: "csv" }).id, "equal templates share");
  assert.equal(requestKeyOf(url, { year: 2020, unused: "x" }), "/data/2020.csv", "a param the url does not use is not in the key");
  assert.equal(sourceOf({}), null);
  assert.throws(() => sourceOf({ source: load, url: "/x" }), (error) => error.code === "provider.source");
  assert.throws(() => sourceOf({ url: "/x", format: "xml" }), (error) => error.code === "provider.source");
  assert.throws(() => sourceOf({ source: {} }), (error) => error.code === "provider.source");
});

test("fetch helpers: JSON at a path, CSV, HTTP errors, and a 304 on refresh is unchanged", async () => {
  const calls = [], original = globalThis.fetch;
  const responses = {
    "/api/a.json": () => new Response(JSON.stringify({ results: [{ x: 1 }, { x: 2 }] }), { headers: { ETag: '"v1"' } }),
    "/api/b.csv": () => new Response("x,y\n1,a\n2,b\n", { headers: { "Last-Modified": "Wed, 21 Oct 2015 07:28:00 GMT" } }),
    "/api/missing.json": () => new Response("no", { status: 404, statusText: "Not Found" }),
    "/api/plain.json": () => new Response(JSON.stringify([{ x: 1 }])),
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: Object.fromEntries(new Headers(init.headers)), cache: init.cache, signal: init.signal });
    if (new Headers(init.headers).get("If-None-Match") === '"v1"') return new Response(null, { status: 304 });
    return responses[url]();
  };
  try {
    const signal = new AbortController().signal;
    const json = fetchJSON("/api/{name}.json", { path: "results" });
    const first = await json.load({ params: { name: "a" }, signal });
    assert.deepEqual(first, { data: [{ x: 1 }, { x: 2 }], version: 'etag:"v1"' });
    assert.equal(calls[0].signal, signal);
    const again = await json.load({ params: { name: "a" }, signal, version: first.version, refresh: true });
    assert.deepEqual(again, { data: undefined, version: 'etag:"v1"' }, "a 304 keeps the version and has no data");
    assert.equal(calls[1].headers["if-none-match"], '"v1"');
    const csv = await fetchCSV("/api/b.csv").load({ params: {}, signal });
    assert.deepEqual(csv, { data: { x: [1, 2], y: ["a", "b"] }, version: "modified:Wed, 21 Oct 2015 07:28:00 GMT" });
    await fetchCSV("/api/b.csv").load({ params: {}, signal, refresh: true });
    assert.equal(calls.at(-1).cache, "no-cache", "a refresh without a version revalidates");
    assert.deepEqual(await fetchJSON("/api/plain.json").load({ params: {}, signal }), [{ x: 1 }], "no version: the data itself");
    await assert.rejects(fetchJSON("/api/missing.json").load({ params: {}, signal }),
      (error) => error.code === "provider.http" && error.message === "HTTP 404 Not Found: /api/missing.json");
    await assert.rejects(fetchJSON("/api/a.json", { path: "data.items" }).load({ params: {}, signal }),
      (error) => error.code === "provider.result" && error.message.includes('"data.items"'));
  } finally {
    globalThis.fetch = original;
  }
});

test("Parquet (pyarrow's snappy, Polars' zstd) and Arrow sources, and their export snapshots (TODO 48.3)", async () => {
  const original = globalThis.fetch, warn = console.warn, requests = [];
  const fixture = (name) => readFileSync(new URL(`./fixtures-parquet/${name}.parquet`, import.meta.url));
  const files = { "/pyarrow.parquet": fixture("pyarrow-snappy"), "/polars.parquet": fixture("polars-zstd"),
    "/table.arrow": tableToIPC(tableFromArrays({ x: new Float32Array([1, 2]) })) };
  // A server with range requests, as hyparquet reads a file: its length, then byte ranges.
  globalThis.fetch = async (url, init = {}) => {
    const body = files[url], range = new Headers(init.headers).get("Range");
    requests.push({ url, method: init.method ?? "GET", range });
    if (!body) return new Response("no", { status: 404, statusText: "Not Found" });
    if (init.method === "HEAD") return new Response(null, { headers: { "Content-Length": String(body.byteLength) } });
    if (!range) return new Response(body);
    const [, start, last] = /bytes=(\d+)-(\d*)/.exec(range), end = last ? Number(last) + 1 : body.byteLength;
    return new Response(body.subarray(Number(start), end), { status: 206 });
  };
  console.warn = () => {}; // i holds 2^40: the Data scope's float32 warning
  const T0 = Date.UTC(2026, 0, 1), signal = new AbortController().signal;
  try {
    for (const file of ["/pyarrow.parquet", "/polars.parquet"]) {
      const data = await fetchParquet(file, { columns: ["x", "i", "t"] }).load({ params: {}, signal });
      assert.deepEqual(Object.keys(data), ["x", "i", "t"], `${file}: only the named columns`);
      for (const value of [data, decodeInitial(JSON.parse(JSON.stringify(encodeInitial(data))))]) {
        const scope = createDataScope();
        scope.update(value);
        assert.deepEqual(asArray(scope.get("x")).js(), [1.5, NaN, 3.5], file);
        assert.deepEqual(asArray(scope.get("i")).js(), [1, NaN, 2 ** 40], file);
        assert.deepEqual(scope.hostColumn("i"), [1n, NaN, 2n ** 40n], `${file}: int64 exact on the host`);
        assert.equal(scope.metadata("t").origin, T0, file);
        assert.deepEqual(asArray(scope.get("t")).js(), [0, NaN, 1500], file);
        scope.dispose();
      }
    }
    assert.ok(requests.some((request) => request.range), "Parquet is read by byte ranges");
    await assert.rejects(fetchParquet("/pyarrow.parquet", { columns: ["x", "nope"] }).load({ params: {}, signal }),
      { message: 'Provider: /pyarrow.parquet has no column "nope". Its columns: x, i, s, t, b.' });
    await assert.rejects(fetchParquet("/missing.parquet").load({ params: {}, signal }), (error) => error.code === "provider.http");
    const table = await fetchArrow("/table.arrow").load({ params: {}, signal });
    assert.ok(isArrowTable(table));
    assert.deepEqual(decodeInitial(JSON.parse(JSON.stringify(encodeInitial(table)))), { x: new Float32Array([1, 2]) });
    const plain = { x: [1, null], y: ["a", "b"] };
    assert.equal(encodeInitial(plain), plain, "a JSON or CSV result is embedded as it is");
    assert.equal(sourceOf({ url: "/a.parquet", format: "parquet", columns: ["x"] }).id, 'parquet /a.parquet ["x"]');
    assert.throws(() => sourceOf({ url: "/a.csv", format: "csv", columns: ["x"] }),
      { message: 'Provider: columns selects a Parquet file\'s columns; format is "csv".' });
    assert.throws(() => sourceOf({ url: "/a", format: "xml" }),
      { message: 'Provider: format must be "json", "csv", "arrow" or "parquet", not "xml".' });
  } finally {
    globalThis.fetch = original;
    console.warn = warn;
  }
});

test("loads of the same source and key share one while in flight; it aborts when every caller has", async () => {
  const started = [];
  const start = (signal) => {
    const gate = deferred();
    started.push({ signal, gate });
    signal.addEventListener("abort", () => gate.reject(new DOMException("aborted", "AbortError")));
    return gate.promise;
  };
  const a = new AbortController(), b = new AbortController();
  const first = sharedLoad("src", "k", start, a.signal), second = sharedLoad("src", "k", start, b.signal);
  await sleep(0);
  assert.equal(started.length, 1);
  a.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(started[0].signal.aborted, false, "one caller left: the load goes on");
  started[0].gate.resolve("rows");
  assert.equal(await second, "rows");
  assert.equal(sharedLoadCount(), 0);
  // Both callers abort: the load is aborted and forgotten.
  const c = new AbortController(), d = new AbortController();
  const third = sharedLoad("src", "k", start, c.signal), fourth = sharedLoad("src", "k", start, d.signal);
  await sleep(0);
  c.abort(); d.abort();
  await assert.rejects(third, { name: "AbortError" });
  await assert.rejects(fourth, { name: "AbortError" });
  assert.equal(started[1].signal.aborted, true);
  assert.equal(sharedLoadCount(), 0);
  // A different key starts its own load.
  const e = new AbortController();
  const other = sharedLoad("src", "k2", start, e.signal);
  await sleep(0);
  assert.equal(started.length, 3);
  started[2].gate.resolve(1);
  assert.equal(await other, 1);
});

test("only equal requests share a load: fetch options, a url function's format and path, the schema (TODO 69.3)", async () => {
  // CODEX_REVIEW #4: two Providers asking one URL with different Authorization headers both
  // received the first one's response. A local mock answers with what each request carried.
  const original = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const request = { url, auth: new Headers(init.headers).get("Authorization"), credentials: init.credentials ?? null, body: init.body ?? null };
    requests.push(request);
    await sleep(10);
    return new Response(url.endsWith(".csv") ? "zip\n02134\n" : JSON.stringify([request]));
  };
  // As a Provider loads (provider.svelte): its source's id, then the request key and schema.
  const load = (source, { schema = undefined, signal = undefined } = {}) =>
    sharedLoad(source.id, shareKey(requestKeyOf(source, {}), schema), (shared) => source.load({ params: {}, signal: shared, schema }), signal);
  try {
    const sources = [
      fetchJSON("/api/me", { init: { headers: { Authorization: "account-A" } } }),
      fetchJSON("/api/me", { init: { headers: { Authorization: "account-B" } } }),
      fetchJSON("/api/me", { init: { credentials: "include" } }),
      fetchJSON("/api/me", { init: { method: "POST", body: "q=1" } }),
      fetchJSON("/api/me", { init: { method: "POST", body: "q=2" } }),
    ];
    const results = await Promise.all(sources.map((source) => load(source)));
    assert.deepEqual(results.map(([row]) => [row.auth, row.credentials, row.body]),
      [["account-A", null, null], ["account-B", null, null], [null, "include", null], [null, null, "q=1"], [null, null, "q=2"]]);
    assert.equal(requests.length, 5);
    assert.ok(!JSON.stringify(sources.map((source) => source.id)).includes("account-"), "no option in an id");
    // One source, or equal sources without options, still share; a caller that leaves does not
    // cancel the load for the other.
    const [, again] = await Promise.all([load(sources[0]), load(sources[0])]);
    await Promise.all([load(fetchJSON("/api/me")), load(fetchJSON("/api/me"))]);
    assert.equal(again[0].auth, "account-A");
    assert.equal(requests.length, 7);
    const leaving = new AbortController(), left = load(sources[1], { signal: leaving.signal }), staying = load(sources[1]);
    leaving.abort();
    await assert.rejects(left, { name: "AbortError" });
    assert.equal((await staying)[0].auth, "account-B");
    // A url function shares with itself under the same format, path and columns only.
    const url = () => "/api/me";
    assert.equal(fetchJSON(url, { path: "rows" }).id, fetchJSON(url, { path: "rows" }).id);
    assert.notEqual(fetchJSON(url, { path: "rows" }).id, fetchJSON(url, { path: "items" }).id);
    assert.notEqual(fetchJSON(url).id, fetchCSV(url).id);
    // A CSV is parsed by its schema: loads share under one schema only.
    const csv = fetchCSV("/api/zips.csv"), before = requests.length;
    const [coded, numbers] = await Promise.all([load(csv, { schema: { zip: "categorical" } }), load(csv)]);
    assert.deepEqual([coded.zip, numbers.zip, requests.length - before], [["02134"], [2134], 2]);
    assert.equal(sharedLoadCount(), 0);
  } finally {
    globalThis.fetch = original;
  }
});

function harness() {
  const log = [], gates = [];
  const scheduler = createScheduler({
    load: (request, signal) => {
      const gate = deferred();
      gates.push({ request, signal, gate });
      log.push(`load ${request.key}`);
      return gate.promise;
    },
    publish: (request, result) => { log.push(`publish ${request.key} ${result}`); return result; },
    fail: (request, error) => log.push(`fail ${request.key} ${error.message}`),
    onPending: (value) => log.push(`pending ${value}`),
  });
  return { log, gates, scheduler };
}

test("the scheduler debounces, and a newer request aborts the load in flight and drops its result", async () => {
  const { log, gates, scheduler } = harness();
  // Three changes inside the debounce: one load, for the last.
  scheduler.schedule({ key: "a" }, { delay: 30 });
  await sleep(5);
  scheduler.schedule({ key: "b" }, { delay: 30 });
  await sleep(5);
  const last = scheduler.schedule({ key: "c" }, { delay: 30 });
  await sleep(60);
  assert.deepEqual(log.filter((line) => line.startsWith("load")), ["load c"]);
  // A newer request supersedes c while it loads: c's signal fires, and its late result is dropped.
  const next = scheduler.schedule({ key: "d" });
  await sleep(0);
  assert.equal(gates[0].signal.aborted, true);
  gates[0].gate.resolve("late");
  gates[1].gate.resolve("rows");
  assert.equal(await last.done, "rows", "a superseded request follows the newer one");
  assert.equal(await next.done, "rows");
  assert.deepEqual(log.filter((line) => line.startsWith("publish")), ["publish d rows"]);
  assert.equal(log.at(-1), "pending false");
  assert.equal(scheduler.pending, undefined);
});

test("the scheduler hands a superseded request's settle cause on, reports failures, and cancels", async () => {
  const { log, gates, scheduler } = harness();
  const first = scheduler.schedule({ key: "a" }, { cause: 5 });
  const second = scheduler.schedule({ key: "b" }, { cause: 9 });
  assert.equal(second.cause, 5, "the newer request serves the older change too");
  await sleep(0);
  // settle(until) waits for the newest request, since it carries the first change's cause.
  let settled = false;
  const settling = scheduler.settle(settleClock()).then(() => (settled = true));
  await sleep(5);
  assert.equal(settled, false);
  gates.at(-1).gate.reject(new Error("HTTP 500"));
  await assert.rejects(second.done, /HTTP 500/);
  await assert.rejects(first.done, /HTTP 500/);
  await settling;
  assert.ok(log.includes("fail b HTTP 500"));
  // cancel() drops the pending request: its done resolves, nothing is published.
  const third = scheduler.schedule({ key: "c" });
  await sleep(0);
  scheduler.cancel();
  assert.equal(await third.done, undefined);
  assert.equal(gates.at(-1).signal.aborted, true);
  gates.at(-1).gate.resolve("late");
  await sleep(0);
  assert.equal(log.filter((line) => line.startsWith("publish")).length, 0);
  assert.equal(log.at(-1), "pending false");
});
