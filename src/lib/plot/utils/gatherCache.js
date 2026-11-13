// @ts-check
import { Array as JaxArray } from "@hmplot/jax";

/** @typedef {import("./dataViewTypes.js").Column} Column */
/** @typedef {import("./dataViewTypes.js").DeviceColumn} DeviceColumn */
/** @typedef {import("./dataViewTypes.js").DeviceDictionary} DeviceDictionary */
/** @typedef {{source: JaxArray, signature: string, categories: readonly unknown[] | undefined,
 * value: DeviceColumn, bytes: number}} GatherEntry */

/**
 * A row mapping owns one reference; every returned array acquires a caller reference.
 * Dictionary identity is part of the key. Codes do not depend on dictionary contents:
 * editing labels in place can reuse codes, and the borrowed dictionary exposes those edits.
 */
export function createGatherCache({
  maxEntries = 64,
  maxBytes = 16 * 1024 * 1024,
} = {}) {
  /** @type {Map<object, GatherEntry>} */
  const entries = new Map();
  let bytes = 0;
  /** @param {object} key @param {GatherEntry} entry */
  const release = (key, entry) => {
    entries.delete(key);
    bytes -= entry.bytes;
    /** @type {JaxArray} */ (entry.value.codes ?? entry.value).dispose();
  };
  return {
    /** Borrow input; make transfers an owned result. Each cache hit returns a new reference.
     * @param {Column} input
     * @param {string} signature
     * @param {() => DeviceColumn} make
     * @returns {DeviceColumn}
     */
    get(input, signature, make) {
      const array = input?.codes ?? input;
      const categories = input?.categories;
      if (!(array instanceof JaxArray)) return make();
      for (const [key, entry] of entries)
        if (
          entry.source === array &&
          entry.signature === signature &&
          entry.categories === categories
        ) {
          entries.delete(key);
          entries.set(key, entry);
          return entry.value.codes
            ? {
                .../** @type {DeviceDictionary} */ (entry.value),
                codes: entry.value.codes.ref,
              }
            : /** @type {JaxArray} */ (entry.value).ref;
        }
      const value = make(),
        output = /** @type {JaxArray} */ (value.codes ?? value);
      const stride =
        output.dtype === "float64" ? 8 : output.dtype === "float16" ? 2 : 4;
      const size =
        output.shape.reduce((n, dimension) => n * dimension, 1) * stride;
      if (!maxEntries || size > maxBytes) return value;
      while (entries.size >= maxEntries || bytes + size > maxBytes) {
        const [key, entry] = /** @type {[object, GatherEntry]} */ (
          entries.entries().next().value
        );
        release(key, entry);
      }
      const held = value.codes
        ? { .../** @type {DeviceDictionary} */ (value), codes: output.ref }
        : output.ref;
      entries.set(
        {},
        { source: array, categories, signature, value: held, bytes: size },
      );
      bytes += size;
      return value;
    },
    get size() {
      return entries.size;
    },
    get bytes() {
      return bytes;
    },
    dispose() {
      for (const [key, entry] of entries) release(key, entry);
    },
  };
}
