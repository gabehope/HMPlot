import { numpy as np } from "@hmplot/jax";
import { columnTitle } from "../axisTitleRules.js";
import { channelTitle } from "../axisTitles.js";
import { isExpression } from "../names.js";

// Reductions a drag moves through (TODO 38.4): moving every member by a change moves these by
// it ("shift"); a sum splits the change among its members ("sum", decision 1).
const SHIFTS = new Set(["mean", "median", "min", "max", "first", "last"]);
/** The lineage of `reduce` outputs ({ name: { op, field } }) a drag can move through. */
export function reduceLineage(reduce) {
  const lineage = {};
  for (const [name, spec] of Object.entries(reduce ?? {})) {
    const policy = SHIFTS.has(spec?.op)
      ? "shift"
      : spec?.op === "sum"
        ? "sum"
        : null;
    if (policy && typeof spec.field === "string")
      lineage[name] = {
        kind: "reduce",
        policy,
        op: spec.op,
        field: spec.field,
      };
  }
  return lineage;
}
import { asArray } from "../data.js";
import { categoryColumn, numericColumn } from "../dataView.js";
import { isCategory } from "../categorical.js";
import { disposeCacheEntries, ownCacheEntry } from "../cacheEntries.js";
import { viewState as makeViewState } from "../viewState.js";
import { cachedGroupRows } from "../grouping.js";

/** Helpers every transform shares (TODO 31.2). */

export const list = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];

export function check(signal) {
  if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
}

/** Output columns under their `as` names.
 * @template T
 * @param {Record<string, T>} columns
 * @param {string | Record<string, string> | undefined} as
 * @returns {Record<string, T>}
 */
export function rename(columns, as) {
  if (!as) return columns;
  if (typeof as === "string") {
    if (Object.keys(columns).length !== 1)
      throw Error("Use an output-name mapping for multiple columns.");
    return { [as]: Object.values(columns)[0] };
  }
  return Object.fromEntries(
    Object.entries(columns).map(([k, v]) => [as[k] ?? k, v]),
  );
}

/**
 * The view state a transform run reads (@time; TODO 28): transform.svelte puts it in the config as
 * `__viewState` ({time, live}) when the transform reads any, so a Facet's replay and its cache key
 * carry it too.
 */
export const configViewState = (config) =>
  config?.__viewState ? makeViewState(config.__viewState) : undefined;

/**
 * A column to compare or order by: numbers as they are, categories as their codes (NaN for a
 * missing or unknown one) with `map` from each category to its code. `own` takes the arrays.
 */
export function comparisonColumn(source, key, own) {
  const input = source.resolve(key);
  if (!categoryColumn(input))
    return { array: own(numericColumn(source, key)), map: null };
  const domain = input.categories ?? [...new Set(input)].filter(isCategory),
    map = new Map(domain.map((v, i) => [v, i]));
  const raw = own(
    input.codes
      ? asArray(input.codes).astype(np.float32)
      : np.array(input.map((v) => map.get(v) ?? -1)),
  );
  const valid = np.logicalAnd(
    np.logicalAnd(raw.ref.greaterEqual(0), raw.ref.less(domain.length)),
    raw.ref.equal(np.floor(raw.ref)),
  );
  return { array: own(np.where(valid, raw.ref, np.nan)), map };
}

/**
 * Masked helpers: a transform has one code path whether or not rows are hidden. `input.valid` is
 * the rows' int32 0/1 mask, or null when every row is visible.
 */
/** The visible rows as int32 0/1 (every row when nothing is hidden). The caller owns it. */
export const visibleRows = (input) =>
  input.valid ? input.valid.ref : np.ones([input.length], { dtype: np.int32 });
/** `test` (a boolean per row) and visible. Consumes `test`. */
export const whereVisible = (input, test) =>
  input.valid ? np.logicalAnd(test, input.valid.ref.greater(0)) : test;

/**
 * An array kept in the transform's cache across runs (TODO 29.6): reused while `identity` (an
 * array compared element by element: config values, lengths, column objects) is unchanged,
 * else rebuilt by `build()`, which returns an array the caller may own. The cache keeps its own
 * reference until the entry is replaced or the cache is released (disposeTransformCache); the
 * caller owns what this returns. Without a cache, this is build().
 */
export function cachedArray(cache, name, identity, build) {
  if (!cache) return build();
  ownCacheEntry(cache, "kept", (kept) => {
    for (const { value } of kept.values()) value.dispose();
  });
  const kept = (cache.kept ??= new Map()),
    entry = kept.get(name);
  if (
    entry &&
    entry.identity.length === identity.length &&
    entry.identity.every((value, i) => value === identity[i])
  )
    return entry.value.ref;
  const value = build();
  entry?.value.dispose();
  kept.set(name, { identity, value: value.ref });
  return value;
}

/**
 * A host value (numbers, edges) kept in the transform's cache while `identity` holds, else
 * computed by `build()` (it may be async). As cachedArray, for values that need no release.
 */
export async function cachedHostValue(cache, name, identity, build) {
  if (!cache) return build();
  ownCacheEntry(cache, "hostValues", () => {});
  const kept = (cache.hostValues ??= new Map()),
    entry = kept.get(name);
  if (
    entry &&
    entry.identity.length === identity.length &&
    entry.identity.every((value, i) => value === identity[i])
  )
    return entry.value;
  const value = await build();
  kept.set(name, { identity, value });
  return value;
}

/** Release everything a transform's cache holds (transform.svelte, facetEngine.js). */
export function disposeTransformCache(cache) {
  disposeCacheEntries(cache);
}

/**
 * The groups of `by` over the rows a transform reads (cachedGroupRows). Over a Filter's bucket
 * (input.groupSource; TODO 29.10) they are the groups of the Filter's rows, kept across brush
 * moves (its columns are its parent's, the same objects every move), with each bucket row's
 * code gathered through the bucket's indices: no regrouping per move, and a group per group of
 * the input, as over the Filter's own rows. The caller disposes the result.
 */
export async function inputGroups(cache, input, by, options = {}) {
  const source = input.groupSource;
  if (!source) return cachedGroupRows(cache, input.scope, by, options);
  const groups = await cachedGroupRows(cache, source.rows, by, options);
  const codes = np.take(groups.codes.ref, source.indices.ref, 0);
  let users = 1;
  return {
    count: groups.count,
    keys: groups.keys,
    codes,
    retain() {
      users++;
      return () => this.dispose();
    },
    dispose() {
      if (--users > 0) return;
      codes.dispose();
      groups.dispose();
    },
  };
}

/**
 * Display names for axis titles (TODO 21 D7): the title of `field` in `source` (through
 * aliases), or null for a non-column. A definition's `names` builds its declarations with it.
 */
export const fieldTitle = (source, field) =>
  typeof field === "string"
    ? columnTitle(source, field)
    : // Values given for a field: a named array's name (a pandas Series), as on a mark.
      field && typeof field === "object" && !isExpression(field)
      ? (channelTitle(source, field) ?? null)
      : null;
