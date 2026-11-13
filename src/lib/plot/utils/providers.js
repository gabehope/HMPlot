import {bytesToBase64, base64ToBytes} from "../../encoding/base64.js";
// Providers (TODO 20): asynchronous data sources for <Provider>. Sources, request keys, the
// fetch helpers, loads shared while in flight, and the request scheduler (latest wins, aborts,
// settle causes), which VectorTile reuses (TODO 24).
import { csvParse } from "d3";
import { diagnostic } from "./diagnostics.js";
import { isArrowTable, arrowColumns } from "./arrow.js";
import { isTypedColumn } from "./columns.js";
import { currentCause, publishWithCause, settleClock, trackPreparation } from '../rendering/viewSettlement.js';

const isPlainObject = (value) => {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * A frozen deep copy of `params`, so a load reads the values it was requested with. Params are
 * JSON-compatible plain values; an undefined entry is left out (as JSON does).
 */
export function plainParams(params, path = "params") {
  if (params === undefined || params === null) return Object.freeze({});
  const copy = (value, at) => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") return value;
    if (Array.isArray(value)) return Object.freeze(value.map((item, i) => copy(item === undefined ? null : item, `${at}[${i}]`)));
    if (isPlainObject(value)) {
      const out = {};
      for (const [name, item] of Object.entries(value)) if (item !== undefined) out[name] = copy(item, `${at}.${name}`);
      return Object.freeze(out);
    }
    const kind = value instanceof Date ? "a Date (pass a string)" : typeof value === "object" ? `a ${value?.constructor?.name ?? "object"}` : `a ${typeof value}`;
    throw diagnostic("provider.params",
      `Provider: params must be plain values (numbers, strings, booleans, null, arrays and plain objects); ${at} is ${kind}.`,
      { component: "Provider", property: "params" });
  };
  if (!isPlainObject(params)) throw diagnostic("provider.params", "Provider: params must be a plain object.", { component: "Provider", property: "params" });
  return copy(params, path);
}

/** JSON with object keys sorted: equal values give equal keys. */
export function stableKey(value) {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((name) => `${JSON.stringify(name)}:${stableKey(value[name])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/**
 * A URL from a template with {name} placeholders, or from a function of params. {version}, unless
 * params has one, is the version of the result on screen (an accumulating feed's cursor, TODO
 * 127): empty for the first request.
 */
export function fillUrl(url, params, version = undefined) {
  if (typeof url === "function") {
    const out = url(params);
    if (typeof out !== "string") throw diagnostic("provider.url", "Provider: a url function must return a string.", { component: "Provider", property: "url" });
    return out;
  }
  return String(url).replace(/\{([^{}]+)\}/g, (_, name) => {
    if (name === "version" && !Object.hasOwn(params ?? {}, "version")) return encodeURIComponent(String(version ?? ""));
    const value = params?.[name];
    if (value === undefined || value === null)
      throw diagnostic("provider.url", `Provider: the url names {${name}}, which params does not have.`, { component: "Provider", property: "url", field: name });
    return encodeURIComponent(String(value));
  });
}

/**
 * Fetch a URL for a source. On a refresh of the result on screen (`version` from an earlier
 * response), send If-None-Match / If-Modified-Since: a 304 is "unchanged". A refresh without a
 * version revalidates with the server instead of reading the HTTP cache.
 */
async function fetchVersioned(url, init, { signal, version, refresh, bytes = false }) {
  const headers = new Headers(init?.headers);
  const conditional = typeof version === "string" && (version.startsWith("etag:") || version.startsWith("modified:"));
  if (conditional && version.startsWith("etag:")) headers.set("If-None-Match", version.slice(5));
  else if (conditional) headers.set("If-Modified-Since", version.slice(9));
  const response = await fetch(url, { ...init, headers, signal, ...(refresh && !init?.cache ? { cache: "no-cache" } : {}) });
  if (response.status === 304 && conditional) return { unchanged: true };
  if (!response.ok)
    throw diagnostic("provider.http", `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}: ${url}`,
      { component: "Provider", details: { status: response.status, url } });
  const [etag, modified] = ["etag", "last-modified"].map((name) => response.headers.get(name));
  return { ...(bytes ? { bytes: await response.arrayBuffer() } : { text: await response.text() }),
    version: etag ? `etag:${etag}` : modified ? `modified:${modified}` : undefined };
}

/** One column's chunks (hyparquet's onChunk, one per row group) as one array, in row order. */
function joinChunks(parts, length) {
  if (parts.length === 1 && parts[0].rowStart === 0 && parts[0].columnData.length === length) return parts[0].columnData;
  parts.sort((a, b) => a.rowStart - b.rowStart);
  const Type = parts[0]?.columnData?.constructor;
  const typed = ArrayBuffer.isView(parts[0]?.columnData) && parts.every((part) => part.columnData.constructor === Type);
  const out = typed ? new Type(length) : new Array(length);
  for (const { rowStart, columnData } of parts)
    if (typed) out.set(columnData, rowStart);
    else for (let i = 0; i < columnData.length; i++) out[rowStart + i] = columnData[i];
  return out;
}

/**
 * A Parquet file's columns (all, or `columns`), read with HTTP range requests: the footer, then
 * only the named columns' pages (TODO 48.3). Numbers come as typed arrays (INT64 as BigInt64
 * arrays, exact), strings as plain arrays, timestamps and dates as Dates; missing values are
 * null. hyparquet and its codecs (snappy, zstd, gzip, brotli, lz4) load on first use.
 */
async function parquetColumns(url, { columns = undefined, init = undefined, signal = undefined, refresh = false } = {}) {
  const [{ asyncBufferFromUrl, parquetMetadataAsync, parquetRead, parquetSchema }, { compressors }] =
    await Promise.all([import("hyparquet"), import("hyparquet-compressors")]);
  const requestInit = { ...init, signal, ...(refresh && !init?.cache ? { cache: "no-cache" } : {}) };
  let file, metadata;
  try {
    file = await asyncBufferFromUrl({ url, requestInit });
    // The footer is read from the file's end; hyparquet's default 512 KB would fetch much of a
    // small file's data too, and then the columns again. A larger footer is read in a second request.
    metadata = await parquetMetadataAsync(file, { initialFetchSize: 1 << 16 });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw diagnostic("provider.http", `Provider: ${url} could not be read as Parquet (${error.message}).`, { component: "Provider", details: { url } });
  }
  const names = parquetSchema(metadata).children.map((child) => child.element.name);
  const missing = (columns ?? []).filter((name) => !names.includes(name));
  if (missing.length)
    throw diagnostic("provider.result", `Provider: ${url} has no column ${missing.map((name) => JSON.stringify(name)).join(", ")}. Its columns: ${names.join(", ")}.`,
      { component: "Provider", property: "columns" });
  const wanted = columns ?? names, chunks = new Map(wanted.map((name) => [name, []]));
  await parquetRead({ file, metadata, columns: wanted, compressors,
    onChunk: ({ columnName, columnData, rowStart }) => chunks.get(columnName)?.push({ rowStart, columnData }) });
  const length = Number(metadata.num_rows);
  return Object.fromEntries([...chunks].map(([name, parts]) => [name, joinChunks(parts, length)]));
}

/** The value at a dot path ("results", "data.items") in parsed JSON. */
function atPath(value, path) {
  if (!path) return value;
  let out = value;
  for (const part of String(path).split(".")) {
    if (out === null || typeof out !== "object" || !Object.hasOwn(out, part))
      throw diagnostic("provider.result", `Provider: the JSON has no ${JSON.stringify(path)}.`, { component: "Provider", property: "path" });
    out = out[part];
  }
  return out;
}

/**
 * CSV text as columns. A column whose non-empty cells all read as numbers is numeric, unless the
 * schema declares it categorical, ordinal or boolean (R2.0: a ZIP code "02134" keeps its zero);
 * the others are strings. Empty cells are missing (null). Dates stay strings; a datetime schema
 * parses them.
 */
export function parseCSV(text, schema = undefined) {
  const rows = csvParse(text), columns = {};
  const typeOf = (name) => { const entry = schema?.[name]; return typeof entry === "string" ? entry : entry?.type; };
  for (const name of rows.columns) {
    const cells = rows.map((row) => (row[name] === "" || row[name] === undefined ? null : row[name]));
    const numeric = !["categorical", "ordinal", "boolean"].includes(typeOf(name)) &&
      cells.every((cell) => cell === null || (cell.trim() !== "" && Number.isFinite(Number(cell))));
    columns[name] = numeric ? cells.map((cell) => (cell === null ? null : Number(cell))) : cells;
  }
  return columns;
}

const FORMAT_NAMES = { json: "JSON", csv: "CSV", arrow: "Arrow", parquet: "Parquet" };
// A url function's ids, one per format, path and columns it is used with.
const functionIds = new WeakMap();
/**
 * The id a fetch source's loads share under (sharedLoad; TODO 69.3): equal templates with the same
 * format, path and columns share one id; a url function shares one with itself under the same
 * format, path and columns. A source with fetch options (`init`: headers, credentials, a body)
 * has an id of its own: its options can change the response and are not compared, nor written
 * into an id, where a token would show.
 */
function urlSourceId(format, url, path, columns, init) {
  const config = `${format}${path ? ` ${path}` : ""}${columns ? ` ${JSON.stringify(columns)}` : ""}`;
  if (init !== undefined) return Object.freeze({ fetchSource: config });
  if (typeof url !== "function") return `${format} ${url}${config.slice(format.length)}`;
  let ids = functionIds.get(url);
  if (!ids) functionIds.set(url, (ids = new Map()));
  if (!ids.has(config)) ids.set(config, Object.freeze({ fetchSource: config }));
  return ids.get(config);
}
function urlSource(format, url, { path = undefined, init = undefined, columns = undefined } = {}) {
  if (url === undefined || url === null || url === "") throw diagnostic("provider.source", `Provider: fetch${FORMAT_NAMES[format]} needs a url.`, { component: "Provider", property: "url" });
  if (columns !== undefined && (!Array.isArray(columns) || !columns.every((name) => typeof name === "string")))
    throw diagnostic("provider.source", "Provider: columns must be a list of column names.", { component: "Provider", property: "columns" });
  return {
    id: urlSourceId(format, url, path, columns, init),
    requestKey: ({ params }) => fillUrl(url, params),
    async load({ params, signal, version, refresh, schema }) {
      const address = fillUrl(url, params, version);
      // Parquet reads byte ranges of the file, so it is read again on a refresh.
      if (format === "parquet") return parquetColumns(address, { columns, init, signal, refresh });
      const response = await fetchVersioned(address, init, { signal, version, refresh, bytes: format === "arrow" });
      if (response.unchanged) return { data: undefined, version };
      let data;
      if (format === "arrow") {
        const { tableFromIPC } = await import("apache-arrow");
        try { data = tableFromIPC(new Uint8Array(response.bytes)); }
        catch (error) { throw diagnostic("provider.result", `Provider: ${address} is not an Arrow IPC file or stream (${error.message}).`, { component: "Provider" }); }
      } else if (format === "csv") data = parseCSV(response.text, schema);
      else {
        try { data = JSON.parse(response.text); }
        catch (error) { throw diagnostic("provider.result", `Provider: ${address} is not JSON (${error.message}).`, { component: "Provider" }); }
        data = atPath(data, path);
      }
      // An envelope only with a version: without one, { data } would read as a table.
      return response.version === undefined ? data : { data, version: response.version };
    },
  };
}

/** A source that fetches JSON: rows, columns or a GeoJSON FeatureCollection (at `path`). */
export const fetchJSON = (url, options = {}) => urlSource("json", url, options);
/** A source that fetches CSV (see parseCSV). */
export const fetchCSV = (url, options = {}) => urlSource("csv", url, options);
/** A source that fetches an Arrow IPC file or stream, as an Arrow Table (apache-arrow, loaded on
 * first use). */
export const fetchArrow = (url, options = {}) => urlSource("arrow", url, options);
/** A source that reads a Parquet file's columns (`options.columns`: only those) with HTTP range
 * requests (hyparquet, loaded on first use). */
export const fetchParquet = (url, options = {}) => urlSource("parquet", url, options);

/** A Provider's source: `source` ({ load, requestKey?, id? } or a load function) or `url`. */
export function sourceOf({ source = undefined, url = undefined, format = "json", path = undefined, columns = undefined } = {}) {
  const hasUrl = url !== undefined && url !== null && url !== "";
  if (source && hasUrl) throw diagnostic("provider.source", "Provider: pass a source or a url, not both.", { component: "Provider", property: "source" });
  if (hasUrl) {
    if (!Object.hasOwn(FORMAT_NAMES, format)) throw diagnostic("provider.source", `Provider: format must be "json", "csv", "arrow" or "parquet", not ${JSON.stringify(format)}.`, { component: "Provider", property: "format" });
    if (columns !== undefined && format !== "parquet") throw diagnostic("provider.source", `Provider: columns selects a Parquet file's columns; format is ${JSON.stringify(format)}.`, { component: "Provider", property: "columns" });
    return urlSource(format, url, { path, columns });
  }
  if (!source) return null;
  if (typeof source === "function") return { id: source, load: source };
  if (typeof source.load !== "function") throw diagnostic("provider.source", "Provider: a source needs a load(context) function.", { component: "Provider", property: "source" });
  return { id: source.id ?? source, load: (context) => source.load(context), requestKey: source.requestKey?.bind(source) };
}

/**
 * The key a Provider's load shares under within its source's id (sharedLoad): the request key,
 * and the schema the result is parsed by (a CSV's), so loads share under one schema only.
 */
export function shareKey(key, schema) {
  return schema ? `${key} ${stableKey(schema)}` : key;
}

/** The request key: the source's requestKey, else stable JSON of the params. */
export function requestKeyOf(source, params) {
  if (!source.requestKey) return stableKey(params);
  const key = source.requestKey({ params });
  if (typeof key !== "string") throw diagnostic("provider.source", "Provider: requestKey must return a string.", { component: "Provider", property: "source" });
  return key;
}

/**
 * A load's result: an object with a scalar `version` and a `data` key is an envelope; anything
 * else is the data (a table cannot have a scalar column, so the two cannot be confused).
 */
export function unwrap(value) {
  if (isPlainObject(value) && Object.hasOwn(value, "data") && Object.hasOwn(value, "version") &&
      (typeof value.version === "string" || typeof value.version === "number"))
    return { data: value.data, version: value.version };
  return { data: value, version: undefined };
}

const typedArray = (value) => ArrayBuffer.isView(value) && !(value instanceof DataView);
/**
 * One column of a table result, for accumulate (TODO 127): its values on the host, the typed
 * array they come in (or null), and how to write merged values back in its form. A dictionary
 * column (Arrow strings) merges as its values.
 */
function hostColumn(column) {
  if (Array.isArray(column)) return { values: column, Typed: null, wrap: (values) => values };
  if (typedArray(column)) return { values: column, Typed: column.constructor, wrap: (values) => values };
  if (isTypedColumn(column) && typedArray(column.values))
    return { values: column.values, Typed: column.values.constructor, wrap: (values) => ({ ...column, values }) };
  if (column?.codes && Array.isArray(column.categories))
    return { values: Array.from(column.codes, (code) => (code >= 0 ? column.categories[code] : null)), Typed: null, wrap: (values) => values };
  return null;
}
/** A table result's columns (rows, columns or an Arrow table), each as hostColumn reads it. */
function hostColumns(value) {
  if (isArrowTable(value)) value = arrowColumns(value);
  if (Array.isArray(value)) {
    const names = [...new Set(value.flatMap((row) => (row && typeof row === "object" ? Object.keys(row) : [])))];
    value = Object.fromEntries(names.map((name) => [name, value.map((row) => row?.[name])]));
  }
  const columns = isPlainObject(value) && value.type !== "FeatureCollection"
    ? Object.fromEntries(Object.entries(value).map(([name, column]) => [name, hostColumn(column)])) : null;
  if (!columns || Object.values(columns).some((column) => column === null))
    throw diagnostic("provider.accumulate",
      "Provider: accumulate merges tables (rows, columns or an Arrow table); this load returned something else.",
      { component: "Provider", property: "accumulate" });
  return columns;
}

/**
 * `next` merged into `previous` (TODO 127): with `key`, a row whose key is on screen replaces it
 * in place and a new key appends; without, rows append in arrival order. `maxRows` keeps the
 * newest rows. Both must have the same columns. Returns new columns, typed where both were (in
 * the newer load's form).
 * @param {unknown} previous @param {unknown} next
 * @param {{ key?: string | string[], maxRows?: number }} [options]
 */
export function accumulateResult(previous, next, { key = undefined, maxRows = Infinity } = {}) {
  const before = hostColumns(previous), after = hostColumns(next);
  const names = Object.keys(before), incoming = Object.keys(after);
  const missing = names.filter((name) => !incoming.includes(name)), extra = incoming.filter((name) => !names.includes(name));
  if (missing.length || extra.length)
    throw diagnostic("provider.accumulate",
      `Provider: an accumulated load must have the columns on screen; ${[
        missing.length ? `it lacks ${missing.join(", ")}` : "", extra.length ? `it adds ${extra.join(", ")}` : "",
      ].filter(Boolean).join(" and ")}.`, { component: "Provider", property: "accumulate" });
  const length = (columns) => (names.length ? columns[names[0]].values.length : 0);
  const keys = key === undefined ? [] : Array.isArray(key) ? key : [key];
  for (const name of keys)
    if (!names.includes(name))
      throw diagnostic("provider.accumulate", `Provider: key ${name} is not a column of the result.`, { component: "Provider", property: "key" });
  // Each output row: [table, row]. A re-sent key takes its earlier row's place.
  const rows = Array.from({ length: length(before) }, (_, i) => [before, i]);
  if (keys.length) {
    const tokenOf = (columns, i) => stableKey(keys.map((name) => {
      const value = columns[name].values[i];
      return typeof value === "bigint" ? `${value}n` : value;
    }));
    const at = new Map(rows.map(([, i]) => [tokenOf(before, i), i]));
    for (let i = 0; i < length(after); i++) {
      const token = tokenOf(after, i), place = at.get(token);
      if (place === undefined) { at.set(token, rows.length); rows.push([after, i]); }
      else rows[place] = [after, i];
    }
  } else for (let i = 0; i < length(after); i++) rows.push([after, i]);
  const kept = Number.isFinite(maxRows) && rows.length > maxRows ? rows.slice(rows.length - maxRows) : rows;
  return Object.fromEntries(names.map((name) => {
    const values = kept.map(([columns, i]) => columns[name].values[i]);
    const { Typed } = before[name], newer = after[name];
    return [name, Typed && Typed === newer.Typed ? newer.wrap(Typed.from(values)) : values];
  }));
}

export const abortError = () => new DOMException("The request was superseded.", "AbortError");
const isAbort = (error) => error?.name === "AbortError";

// Loads in flight, by source id and request key: Providers asking for the same data share one.
const inFlight = new Map();
/**
 * Run `start(signal)` for (id, key), or join the load already running for them. The shared load
 * is aborted once every caller has aborted; a caller that aborts is rejected at once.
 */
export function sharedLoad(id, key, start, signal) {
  let byKey = inFlight.get(id), entry = byKey?.get(key);
  if (!entry) {
    const controller = new AbortController();
    entry = { users: 0, controller };
    if (!byKey) inFlight.set(id, (byKey = new Map()));
    byKey.set(key, entry);
    const forget = () => {
      if (byKey.get(key) === entry) byKey.delete(key);
      if (!byKey.size && inFlight.get(id) === byKey) inFlight.delete(id);
    };
    entry.forget = forget;
    entry.promise = Promise.resolve().then(() => start(controller.signal));
    entry.promise.then(forget, forget);
  }
  entry.users++;
  return new Promise((resolve, reject) => {
    let done = false;
    const leave = () => {
      if (done) return;
      done = true;
      reject(abortError());
      if (--entry.users === 0) {
        entry.forget();
        entry.controller.abort();
      }
    };
    if (signal?.aborted) return leave();
    signal?.addEventListener("abort", leave, { once: true });
    entry.promise.then(
      (value) => { if (!done) { done = true; signal?.removeEventListener("abort", leave); resolve(value); } },
      (error) => { if (!done) { done = true; signal?.removeEventListener("abort", leave); reject(error); } },
    );
  });
}
/** Loads in flight (tests). */
export const sharedLoadCount = () => [...inFlight.values()].reduce((n, byKey) => n + byKey.size, 0);

const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(abortError());
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(abortError()); }, { once: true });
});
/** `promise`, or an AbortError as soon as `signal` fires (a load may ignore its signal). */
const unlessAborted = (promise, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(abortError());
  const abort = () => reject(abortError());
  signal.addEventListener("abort", abort, { once: true });
  Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
});

/**
 * One stream of requests where the newest wins (TODO 20; VectorTile loads through it too, TODO 24).
 * - schedule(request, { delay }) cancels the pending request, waits `delay` (the debounce), runs
 *   `load(request, signal)`, then `publish(request, result)` under the request's settle cause
 *   (publishWithCause), so the work downstream is its follow-up. A canceled request's load is
 *   aborted and its result, if it still arrives, is dropped; its cause passes to the newer one,
 *   so whenSettled() after the first change waits for the newest result.
 * - `fail(request, error)` reports a failure other than an abort.
 * - Each request's whole work is tracked (trackPreparation, as a load) under its cause.
 * - schedule() returns the request's entry; `entry.done` resolves when it is published (or
 *   `publish` returns without publishing), rejects with its error, and follows the newer
 *   request when it is superseded (or resolves when cancel() drops it).
 * @param {{ view?: import("./internalTypes.js").ViewServices, load: (request: any, signal: AbortSignal) => Promise<any>,
 *   publish: (request: any, result: any) => any, fail: (request: any, error: any) => void,
 *   onPending: (pending: boolean) => void }} options
 */
export function createScheduler({ view = undefined, load, publish, fail = () => {}, onPending = () => {} }) {
  let current = null, handed;
  const runs = new Map();
  const setPending = (value) => onPending(value);
  function settleEntry(entry, outcome, value) {
    if (entry.settled) return;
    entry.settled = true;
    if (outcome === "follow") value.done.then(entry.resolve, entry.reject);
    else if (outcome === "reject") entry.reject(value);
    else entry.resolve(value);
  }
  function cancel(successor = undefined) {
    const entry = current;
    if (!entry) return;
    current = null;
    handed = Math.min(handed ?? Infinity, entry.cause);
    entry.controller.abort();
    if (successor) settleEntry(entry, "follow", successor);
    else {
      settleEntry(entry, "resolve");
      handed = undefined;
      setPending(false);
    }
  }
  return {
    get pending() { return current?.request; },
    schedule(request, { delay = 0, cause = undefined } = {}) {
      const entry = { request, controller: new AbortController() };
      entry.done = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
      entry.done.catch(() => {});
      const own = cause ?? currentCause(view);
      if (current) cancel(entry);
      entry.cause = Math.min(own, handed ?? Infinity);
      handed = undefined;
      current = entry;
      setPending(true);
      const { signal } = entry.controller;
      const work = (async () => {
        if (delay > 0) await wait(delay, signal);
        // Settling must not wait for a superseded load that ignores its signal.
        const result = await unlessAborted(load(request, signal), signal);
        return publishWithCause(view, entry.cause, () => publish(request, result));
      })();
      const tracked = work.then(
        (value) => settleEntry(entry, "resolve", value),
        (error) => {
          if (isAbort(error) && signal.aborted) return;
          if (current === entry) fail(request, error);
          settleEntry(entry, "reject", error);
        },
      ).finally(() => {
        runs.delete(tracked);
        if (current === entry) { current = null; setPending(false); }
      });
      runs.set(tracked, entry.cause);
      trackPreparation(view, tracked, entry.cause, { load: true });
      return entry;
    },
    cancel: () => cancel(),
    /** Wait for the requests made at or before `until` (and those that superseded them). */
    async settle(until = settleClock()) {
      for (let due = [...runs].filter(([, cause]) => cause <= until); due.length; due = [...runs].filter(([, cause]) => cause <= until))
        await Promise.allSettled(due.map(([work]) => work));
    },
    dispose() {
      cancel();
    },
  };
}

// Export snapshots of binary results (TODO 48.3): an exported page embeds a Provider's last
// result as `initial`, which is JSON. A JSON or CSV result is kept as it is; an Arrow table or a
// Parquet result (typed arrays, BigInts, Dates) is written as { $columns } with typed arrays in
// base64, and read back by the Provider (decodeInitial).
const TYPED = { Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint8ClampedArray,
  Uint16Array, Uint32Array, BigInt64Array, BigUint64Array };
function toBase64(view) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return bytesToBase64(bytes);
}
function fromBase64(text, Type) {
  return new Type(base64ToBytes(text).buffer);
}
const jsonSafe = (value) => value === null || ["string", "boolean"].includes(typeof value) ||
  typeof value === "number" && Number.isFinite(value) ||
  Array.isArray(value) && value.every(jsonSafe) ||
  !!value && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(jsonSafe);
function encodeValue(value) {
  if (ArrayBuffer.isView(value) && TYPED[value.constructor.name] === value.constructor)
    return { $typed: value.constructor.name, base64: toBase64(value) };
  if (isTypedColumn(value)) return { $column: { values: encodeValue(value.values), metadata: value.metadata } };
  if (value?.codes && value?.categories) return { codes: encodeValue(value.codes), categories: value.categories, metadata: value.metadata };
  if (!Array.isArray(value)) return value;
  const present = value.find((item) => item !== null && item !== undefined);
  if (present instanceof Date) return { $dates: value.map((item) => (item instanceof Date ? item.getTime() : null)) };
  if (typeof present === "bigint" || value.some((item) => typeof item === "bigint"))
    return { $bigints: value.map((item) => (typeof item === "bigint" ? String(item) : item ?? null)) };
  if (Array.isArray(present)) return { $rows: encodeValue(Float64Array.from(value.flat(), (v) => v ?? NaN)), width: present.length };
  return value.map((item) => (typeof item === "number" && !Number.isFinite(item) ? null : item));
}
function decodeValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (value.$typed) return fromBase64(value.base64, TYPED[value.$typed]);
  if (value.$column) return { __hmplotColumn: true, values: decodeValue(value.$column.values), metadata: value.$column.metadata };
  if (value.codes && value.categories) return { ...value, codes: decodeValue(value.codes) };
  if (value.$dates) return value.$dates.map((t) => (t === null ? null : new Date(t)));
  if (value.$bigints) return value.$bigints.map((v) => (typeof v === "string" ? BigInt(v) : v === null ? NaN : v));
  if (value.$rows) {
    const flat = decodeValue(value.$rows);
    return Array.from({ length: flat.length / value.width }, (_, i) => Array.from(flat.subarray(i * value.width, (i + 1) * value.width)));
  }
  return value;
}
/** A Provider result as JSON for an exported page: as it is when JSON holds it, else { $columns }. */
export function encodeInitial(data) {
  if (isArrowTable(data)) data = arrowColumns(data);
  if (jsonSafe(data) || Array.isArray(data) || !data || typeof data !== "object") return data;
  return { $columns: Object.fromEntries(Object.entries(data).map(([name, column]) => [name, encodeValue(column)])) };
}
/** The value encodeInitial wrote (anything else is returned as it is). */
export function decodeInitial(value) {
  if (!value?.$columns || Object.keys(value).length !== 1) return value;
  return Object.fromEntries(Object.entries(value.$columns).map(([name, column]) => [name, decodeValue(column)]));
}
