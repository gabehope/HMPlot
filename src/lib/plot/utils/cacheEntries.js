// @ts-check
// A transform's cache (a plain object per transform) holds entries that its producers fill.
// Each producer records how its entry is released where it fills it, so disposal needs no
// knowledge of any entry's layout (Stage 114.3).
const OWNED = Symbol("owned cache entries");

/**
 * A transform's cache: its entries by name, and the release each entry's producer recorded.
 * @typedef {{ [OWNED]?: Map<string, (value: unknown) => void>, [name: string]: unknown }} TransformCache
 */

/**
 * Release `cache[name]` with `dispose(value)` when disposeCacheEntries runs.
 * @template T
 * @param {TransformCache} cache
 * @param {string} name
 * @param {(value: T) => void} dispose Takes what this producer stores at `cache[name]`.
 */
export function ownCacheEntry(cache, name, dispose) {
  // The producer that records `dispose` is the one that stores a T at `cache[name]`: the cache
  // keeps no other record of an entry's type.
  (cache[OWNED] ??= new Map()).set(
    name,
    /** @type {(value: unknown) => void} */ (dispose),
  );
}

/**
 * Release every owned entry of `cache` and set it to null.
 * @param {TransformCache} cache
 */
export function disposeCacheEntries(cache) {
  for (const [name, dispose] of cache[OWNED] ?? []) {
    const value = cache[name];
    cache[name] = null;
    if (value !== undefined && value !== null) dispose(value);
  }
  cache[OWNED]?.clear();
}
