// @ts-check
// Column reads (docs/REFACTOR-PLAN-2026-10-09.md, "Column reads and retained work"). A scope's
// get(field) lends the column: it is valid during the synchronous work that read it, while the
// scope's revision and cache entry hold (an "@" column is replaced at the next interaction
// revision). A borrower never disposes it, and gives an operation that consumes its inputs a
// `.ref`. Work that keeps a column longer (across an await, in a cache or a queued write, or in a
// result handed on) acquires it and releases it once.
import { isDeviceArray } from "./data.js";

/**
 * @template T
 * @typedef {{ get: (field: string) => T }} ColumnScope
 */

/**
 * Column `field` of `scope`, held until `release()` (later calls do nothing). A device array is
 * retained itself and a dictionary column its codes, without a copy; host values need nothing.
 * @template T
 * @param {ColumnScope<T>} scope
 * @param {string} field
 * @returns {{ value: T, release: () => void }}
 */
export function acquireColumn(scope, field) {
  const value = scope.get(field);
  const array = isDeviceArray(value)
    ? value
    : isDeviceArray(
          /** @type {{codes?: unknown} | null | undefined} */ (value)?.codes,
        )
      ? /** @type {import("@hmplot/jax").Array} */ (
          /** @type {{codes?: unknown}} */ (value).codes
        )
      : null;
  /** @type {import("@hmplot/jax").Array | null | undefined} */
  let held = array?.ref;
  return {
    value,
    release() {
      held?.dispose();
      held = null;
    },
  };
}
