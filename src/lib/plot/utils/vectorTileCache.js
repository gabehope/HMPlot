// Raw tile bytes for a VectorTile (TODO 35): fetched through a request scheduler, kept LRU (exports
// embed them, and a tile seen again is prepared again from them, not fetched), with failures
// remembered for RETRY_AFTER so an offline page does not keep requesting.
import { fetchTileBytes, tileKey } from "./vectorTiles.js";

/** How long a failed tile is not requested again (ms). */
export const RETRY_AFTER = 10000;

/**
 * A map that forgets its least recently used entries past `maxBytes` (the sum of `size(value)`)
 * or `maxEntries`, except those `keep(key, value)` protects (TODO 63.5: the live tiles' caches
 * are budgeted in bytes, and the tiles on screen stay). get() is a use; peek() is not. trim()
 * applies the budget again (after `keep` changed its mind).
 * @param {{ maxBytes?: number, maxEntries?: number, size?: (value: any) => number, keep?: (key: any, value: any) => boolean }} [options]
 */
export function createLru({ maxBytes = Infinity, maxEntries = Infinity, size = () => 0, keep = () => false } = {}) {
  const entries = new Map();
  let bytes = 0;
  const over = () => bytes > maxBytes || entries.size > maxEntries;
  const forget = (key, entry) => {
    entries.delete(key);
    bytes -= entry.bytes;
  };
  const lru = {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    peek: (key) => entries.get(key)?.value,
    has: (key) => entries.has(key),
    set(key, value) {
      const old = entries.get(key);
      if (old) forget(key, old);
      const entry = { value, bytes: size(value) || 0 };
      entries.set(key, entry);
      bytes += entry.bytes;
      lru.trim();
      return value;
    },
    delete(key) {
      const entry = entries.get(key);
      if (entry) forget(key, entry);
    },
    trim() {
      if (!over()) return;
      for (const [key, entry] of entries) {
        if (!over()) break;
        if (!keep(key, entry.value)) forget(key, entry);
      }
    },
    clear() {
      entries.clear();
      bytes = 0;
    },
    entries: () => [...entries].map(([key, entry]) => [key, entry.value]),
    get size() { return entries.size; },
    get bytes() { return bytes; },
  };
  return lru;
}

/** The bytes of a value's typed arrays, nested in objects and arrays (a prepared tile's). */
export function arrayBytes(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return 0;
  seen.add(value);
  if (ArrayBuffer.isView(value)) return value.byteLength;
  let total = 0;
  for (const item of Array.isArray(value) ? value : Object.values(value)) total += arrayBytes(item, seen);
  return total;
}
const aborted = () => new DOMException("The tile is no longer needed.", "AbortError");

/**
 * A cache of at most `capacity` tiles and `maxBytes` of them for one url, least recently used
 * first out, except the tiles `keep(key)` protects (a VectorTile's tiles in use: exports embed the
 * ones on screen). load(tile, { priority, missing }) resolves to the tile's bytes (null: an empty
 * tile) and rejects with the load's error, or an AbortError when the request was canceled before
 * it started (see createRequestScheduler): loads of one tile
 * share a request, which waits with the most urgent of their priorities and is canceled only
 * when every one of them cancels. prune() aborts the requests under way that no load wants any
 * more (their loads reject with an AbortError; nothing is remembered). seed(tile, bytes) adds a
 * tile (embedded in an export).
 * @param {{ url: any, scheduler: ReturnType<typeof import("./requestScheduler.js").createRequestScheduler>,
 *   capacity?: number, maxBytes?: number, keep?: (key: string) => boolean, now?: () => number,
 *   fetchBytes?: (url: any, tile: any, options: any) => Promise<Uint8Array | null> }} options
 */
export function createTileCache({ url, scheduler, capacity = 256, maxBytes = 64 * 2 ** 20, keep = () => false, now = () => Date.now(), fetchBytes = fetchTileBytes }) {
  const entries = createLru({ maxEntries: capacity, maxBytes, size: (entry) => 64 + (entry.bytes?.byteLength ?? 0),
    keep: (key, entry) => entry.status === "loading" || keep(key) });
  const touch = (key, entry) => entries.set(key, entry);
  return {
    peek: (tile) => entries.peek(tileKey(tile)),
    seed(tile, bytes) {
      touch(tileKey(tile), { status: "ready", bytes: bytes ?? null });
    },
    /** @param {number[]} tile @param {{ priority?: () => number, missing?: "error" | "empty" }} [options] */
    load(tile, { priority = () => 0, missing = "error" } = {}) {
      const key = tileKey(tile);
      let entry = entries.get(key);
      if (entry?.status === "ready") return Promise.resolve(entries.get(key).bytes);
      if (entry?.status === "loading") {
        entry.priorities.add(priority);
        return entry.promise;
      }
      if (entry?.status === "failed" && now() - entry.failedAt < RETRY_AFTER) return Promise.reject(entry.error);
      entry = { status: "loading", priorities: new Set([priority]) };
      // A load that joins keeps the request wanted: a view that zooms in and straight back
      // makes a second load of a tile whose first load's view is gone (35: it stayed blank).
      const urgency = () => {
        let best = -1;
        for (const each of entry.priorities) {
          let value;
          try { value = each(); } catch { value = -1; }
          if (value >= 0 && (best < 0 || value < best)) best = value;
        }
        return best;
      };
      entry.urgency = urgency;
      entry.promise = (async () => {
        const slot = await scheduler.schedule(urgency);
        if (!slot) {
          if (entries.peek(key) === entry) entries.delete(key);
          throw aborted();
        }
        const controller = new AbortController();
        entry.controller = controller;
        try {
          const bytes = await fetchBytes(url, tile, { missing, signal: controller.signal });
          touch(key, Object.assign(entry, { status: "ready", bytes, promise: undefined, priorities: undefined, urgency: undefined, controller: undefined }));
          return bytes;
        } catch (error) {
          if (controller.signal.aborted) {
            if (entries.peek(key) === entry) entries.delete(key);
            throw aborted();
          }
          touch(key, Object.assign(entry, { status: "failed", error, failedAt: now(), promise: undefined, priorities: undefined, urgency: undefined, controller: undefined }));
          throw error;
        } finally {
          slot.done();
        }
      })();
      entry.promise.catch(() => {});
      touch(key, entry);
      return entry.promise;
    },
    /** Abort the requests under way that no load wants any more (a view that moved on). */
    prune() {
      for (const [, entry] of entries.entries())
        if (entry.status === "loading" && entry.controller && !entry.controller.signal.aborted && entry.urgency() < 0) entry.controller.abort();
    },
    /** The tiles with bytes: [{ tile key, bytes }] (exports). */
    ready: () => entries.entries().filter(([, entry]) => entry.status === "ready").map(([key, entry]) => ({ key, bytes: entry.bytes })),
    clear: () => entries.clear(),
    /** Apply the budget again (after `keep` let tiles go). */
    trim: () => entries.trim(),
    get size() { return entries.size; },
    get bytes() { return entries.bytes; },
  };
}
