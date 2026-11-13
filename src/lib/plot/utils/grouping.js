import { numpy as np } from "@hmplot/jax";
import { asArray } from "./data.js";
import {
  categoryColumn,
  columnChangeProof,
  numericColumn,
  scalar,
} from "./dataView.js";
import { deviceArray } from "./deviceParams.js";
import { histogramRows, reduceByCode } from "./reduce.js";
import { ownCacheEntry } from "./cacheEntries.js";

/** Per group, 1 if it has a shown row (int32 [count]), every group at once (TODO 29.7). Borrows
 * `codes` and `shown`. */
export function groupsShown(codes, shown, count) {
  if (!count) return np.zeros([0], { dtype: np.int32 });
  const code = np.where(shown.ref, codes.ref, -1).astype(np.int32),
    ones = np.ones([code.shape[0]], { dtype: np.float32 });
  const rows = reduceByCode(code, ones, count);
  code.dispose();
  ones.dispose();
  return rows.greater(0).astype(np.int32);
}
/**
 * Each group's kept values in order, on the device (TODO 26.1): one stable sort by value, then by
 * group, puts every group's kept rows in a run, ascending; `counts` and `starts` locate the runs
 * ([count] float32). Rows that are not kept sort after the last run. `codes` (int32 [n], 0 ..
 * count - 1 on every row), `keep` (bool [n]) and `values` (float32 [n], finite where kept) are
 * borrowed; `extra` are more per-row weights summed per group over every row (float32 [count]
 * each, in `totals`).
 * The caller disposes the result (dispose()).
 */
export function sortedGroups(codes, keep, values, count, extra = []) {
  const byValue = np.argsort(np.where(keep.ref, values.ref, Infinity));
  const key = np.where(keep.ref, codes.ref, count).astype(np.int32);
  const order = np.take(
    byValue.ref,
    np.argsort(np.take(key.ref, byValue.ref, 0)),
    0,
  );
  byValue.dispose();
  key.dispose();
  // Every row counts in its own group, with its weight: 0 or 1 kept, and each extra weight
  // (a row with no kept value still counts for a shown-rows weight).
  const kept = keep.ref.astype(np.float32);
  const [counts, ...totals] = histogramRows(codes, [kept, ...extra], count);
  kept.dispose();
  const starts = count
    ? np.cumsum(counts.ref, 0).sub(counts.ref)
    : np.zeros([0]);
  const sorted = np.take(values.ref, order.ref, 0);
  return {
    order,
    sorted,
    counts,
    starts,
    totals,
    dispose() {
      [order, sorted, counts, starts, ...totals].forEach((a) => a.dispose());
    },
  };
}

/**
 * Probabilities `p` (host numbers) of each group's sorted run, interpolated linearly between the
 * order statistics around p x (count - 1), as numpy: float32 [groups, p.length], NaN for a group
 * with no kept value. Borrows its arguments (a sortedGroups result's arrays).
 */
export function groupQuantiles({ sorted, starts, counts }, probabilities) {
  // Host numbers, or a float32 [P] array (borrowed): a compiled caller passes its probabilities
  // as an argument, so new ones retrace nothing (TODO 33.3).
  const onDevice = !Array.isArray(probabilities);
  const groups = counts.shape[0],
    P = onDevice ? probabilities.shape[0] : probabilities.length,
    last = Math.max(0, sorted.shape[0] - 1);
  if (!groups) return np.zeros([0, P]);
  const at = np
    .maximum(counts.ref.sub(1), 0)
    .reshape([groups, 1])
    .mul(
      (onDevice ? probabilities.ref : deviceArray(probabilities)).reshape([
        1,
        P,
      ]),
    );
  const lo = np.floor(at.ref),
    t = at.sub(lo.ref);
  const position = (offset) =>
    np
      .clip(starts.ref.reshape([groups, 1]).add(offset), 0, last)
      .astype(np.int32)
      .reshape([-1]);
  const a = np.take(sorted.ref, position(lo.ref), 0).reshape([groups, P]);
  // ceil(at): lo + 1 unless at is whole (t = 0), which reads a with weight 1.
  const b = np
    .take(
      sorted.ref,
      position(
        np.minimum(
          lo.add(1),
          np.maximum(counts.ref.sub(1), 0).reshape([groups, 1]),
        ),
      ),
      0,
    )
    .reshape([groups, P]);
  const value = a.ref.mul(np.subtract(1, t.ref)).add(b.mul(t.ref));
  const result = np.where(
    counts.ref.greater(0).reshape([groups, 1]),
    np.where(t.equal(0), a, value),
    NaN,
  );
  return result;
}

/**
 * groupRows, reused while its key columns are unchanged (TODO 26.2): over a Filter's physical
 * rows a transform groups the same rows on every run (a brush changes the mask, not the
 * columns), and grouping sorts every row and reads the group count back. `cache` is the
 * transform's cache (it persists across runs; transform.svelte disposes cache.grouping); without
 * one, or for interaction fields (a new mask on every read), this is groupRows. The caller
 * disposes the result, as groupRows'.
 */
export async function cachedGroupRows(cache, scope, by, options = {}) {
  const fields = Array.isArray(by) ? by : [by];
  if (
    !cache ||
    fields.some((field) => typeof field !== "string" || field.startsWith("@"))
  )
    return groupRows(scope, by, options);
  const columns = fields.map((field) => scope.get(field));
  const identity = [
    JSON.stringify(fields),
    JSON.stringify(options),
    scope.length,
    ...columns,
  ];
  const entry = cache.grouping;
  const generation = scope.identity?.generation;
  const version = scope.version;
  const proof = columnChangeProof(scope, fields);
  const source = proof?.source ?? scope;
  const sourceVersion = proof?.version ?? version;
  const change = proof?.change;
  // lastChange proves only the immediately preceding update. A skipped update,
  // a different scope, or a schema/row change needs a fresh grouping; we must
  // not interpret the latest unrelated update as evidence about the whole gap.
  const unchangedKeys =
    entry?.scope === source &&
    change?.columns &&
    change.from === entry.version &&
    change.to === sourceVersion &&
    fields.every((field) => !change.columns.has(field));
  if (
    entry &&
    (entry.generation === generation || unchangedKeys) &&
    entry.identity.length === identity.length &&
    entry.identity.every((value, i) => value === identity[i])
  ) {
    entry.generation = generation;
    entry.version = sourceVersion;
    entry.groups.retain();
    return entry.groups;
  }
  const groups = await groupRows(scope, by, options);
  // Discovery awaits a count readback. A live source may advance meanwhile:
  // its old result still belongs to this caller, but cannot seed a newer cache.
  if (
    scope.version !== version ||
    scope.identity?.generation !== generation ||
    source.version !== sourceVersion
  )
    return groups;
  groups.retain(); // the cache's reference
  cache.grouping?.groups.dispose();
  cache.grouping = {
    identity,
    groups,
    scope: source,
    version: sourceVersion,
    generation,
  };
  ownCacheEntry(cache, "grouping", (entry) => entry.groups.dispose());
  return groups;
}

/** Numeric grouping and tuple equality remain on the device. */
export async function groupRows(scope, by, { preserveNumeric = false } = {}) {
  const fields = Array.isArray(by) ? by : [by],
    owned = [];
  const own = (a) => (owned.push(a), a);
  let users = 1;
  try {
    const columns = fields.map((field) => {
      const source = scope.get(field);
      if (categoryColumn(source)) {
        const categories = source.categories ?? [...new Set(source)];
        const index = new Map(categories.map((v, i) => [v, i]));
        return {
          field,
          categories,
          values: own(
            source.codes
              ? asArray(source.codes)
              : np.array(
                  source.map((v) => index.get(v) ?? -1),
                  { dtype: np.int32 },
                ),
          ),
        };
      }
      return {
        field,
        values: own(
          preserveNumeric
            ? asArray(scope.get(field))
            : numericColumn(scope, field),
        ),
      };
    });
    const n = scope.length;
    let order = own(np.arange(n).astype(np.int32));
    for (const { values } of [...columns].reverse()) {
      const v = np.take(values.ref, order.ref, 0);
      const next = own(
        np.take(
          order.ref,
          np.argsort(
            np.where(np.isfinite(v.ref.astype(np.float32)), v.ref, Infinity),
          ),
          0,
        ),
      );
      v.dispose();
      order = next;
    }
    let changes = own(np.zeros([Math.max(0, n - 1)], { dtype: np.bool }));
    for (const { values } of columns) {
      const v = own(np.take(values.ref, order.ref, 0)),
        a = own(v.ref.slice([0, Math.max(0, n - 1)])),
        // (No rows: an empty slice, not [1, 0].)
        b = own(v.ref.slice([Math.min(1, n), n]));
      changes = own(
        np.logicalOr(
          changes.ref,
          np.logicalAnd(
            a.ref.notEqual(b.ref),
            np.logicalNot(
              np.logicalAnd(
                np.isnan(a.ref.astype(np.float32)),
                np.isnan(b.ref.astype(np.float32)),
              ),
            ),
          ),
        ),
      );
    }
    const starts = own(
      n
        ? np.concatenate([
            np.ones([1], { dtype: np.int32 }),
            changes.ref.astype(np.int32),
          ])
        : np.zeros([0], { dtype: np.int32 }),
    );
    const count = n ? await scalar(np.sum(starts.ref)) : 0;
    const codes = own(np.cumsum(starts.ref, 0).sub(1).astype(np.int32));
    const first = own(
      np.argsort(starts.ref.equal(0).astype(np.int32)).slice([0, count]),
    );
    /** @type {Record<string, import("./dataViewTypes.js").DeviceColumn>} */
    const keys = {};
    for (const { field, values, categories } of columns) {
      const v = own(np.take(values.ref, np.take(order.ref, first.ref, 0), 0));
      keys[field] = categories ? { codes: v, categories } : v;
    }
    const inverse = own(np.argsort(order.ref));
    const result = {
      count,
      codes: own(np.take(codes.ref, inverse.ref, 0)),
      // Original row at which each group first appears. Consumers can use
      // this compact device array to preserve first-seen group order without
      // reading grouping columns back to the host.
      firstIndices: own(np.take(order.ref, first.ref, 0)),
      keys,
      retain() {
        users++;
        return () => this.dispose();
      },
      dispose() {
        if (--users > 0) return;
        owned.splice(0).forEach((a) => a.dispose());
      },
    };
    // The cache needs group membership and keys, not the sorting and scan
    // temporaries. Keep exactly the arrays exposed by the owned result.
    const retained = new Set([
      result.codes,
      result.firstIndices,
      ...Object.values(keys).map((column) => column.codes ?? column),
    ]);
    const scratch = owned.filter((array) => !retained.has(array));
    owned.splice(
      0,
      owned.length,
      ...owned.filter((array) => retained.has(array)),
    );
    scratch.forEach((array) => array.dispose());
    return result;
  } catch (e) {
    owned.forEach((a) => a.dispose());
    throw e;
  }
}

/**
 * Each group's position on its categorical axis (TODO 17.14e): the index of its category in
 * `order`, the axis domain its frame gives the transform (`__categoryOrder`), else its code (the column's
 * own order, which an axis built from the column shares). A category the order lacks is NaN.
 * `key` is a groupRows key column (borrowed); returns float32 [groups].
 */
export function categoryPositions(key, order) {
  const code = key.codes ?? key;
  if (!order || !key.categories) return code.ref.astype(np.float32);
  const index = new Map(order.map((value, i) => [value, i]));
  const table = deviceArray(
    key.categories.map((category) => index.get(category) ?? NaN),
  );
  return np.take(table, code.ref.astype(np.int32), 0);
}
