import { numpy as np, jit } from "@hmplot/jax";
import { asArray, shapeOf } from "../data.js";
import { createDataView, createMaskedRowMapping, scalar } from "../dataView.js";
import { selectionMask, interactionVersion } from "../interaction.js";
import {
  evaluateExpression,
  isExpression,
  expressionFields,
  expressionDescriptor,
  expressionHasTween,
} from "../expressions.js";
import { isViewStateField, viewStateKey } from "../viewState.js";
import { isColumnNode } from "../names.js";
import { countRows } from "../reduce.js";
import { deviceScalar, deviceArray } from "../deviceParams.js";
import { list, comparisonColumn, visibleRows, whereVisible } from "./common.js";
import { ownCacheEntry } from "../cacheEntries.js";

/**
 * TODO 17.3h, bucketed compaction: a Filter that keeps a small part (under a quarter) of a large
 * input (`minimumSource` physical rows or more) compacts the kept rows into a power-of-two
 * bucket of at least `minimumBucket` rows, so downstream work follows the selection while
 * kernels see a few lengths only (each compiled once). A bucket grows at once and shrinks only
 * after the count has stayed under a quarter of it for `shrinkAfter` runs, so a count near a
 * boundary does not switch lengths back and forth. Tests lower these.
 */
export const bucketing = {
  minimumSource: 65536,
  minimumBucket: 16384,
  shrinkAfter: 3,
};
/**
 * The physical length of a Filter's output for `count` kept rows of `capacity`: the capacity,
 * or a bucket. `state` is the Filter's transform cache (it persists across runs; without one,
 * every run takes its bucket at once); a new capacity starts over.
 */
export function bucketSize(state, capacity, count) {
  const { minimumSource, minimumBucket, shrinkAfter } = bucketing;
  const target =
    capacity < minimumSource || count * 4 >= capacity
      ? capacity
      : Math.min(
          capacity,
          Math.max(
            minimumBucket,
            2 ** Math.ceil(Math.log2(Math.max(count, 1))),
          ),
        );
  if (!state) return target;
  let bucket = state.filterBucket;
  if (!bucket || bucket.capacity !== capacity)
    bucket = state.filterBucket = { capacity, size: target, low: 0 };
  else if (count > bucket.size) Object.assign(bucket, { size: target, low: 0 });
  else if (target < bucket.size && count * 4 < bucket.size) {
    if (++bucket.low >= shrinkAfter)
      Object.assign(bucket, { size: target, low: 0 });
  } else bucket.low = 0;
  return bucket.size;
}

/**
 * A bucket's rows, `size` of them (static): the kept rows first, in order (a stable sort), then
 * copies of the first of them; and which of them are shown (int32). `kept` is the count, from a
 * buffer. One program per input and bucket length (TODO 33.3). Consumes its arguments.
 */
const bucketRows = jit(
  (valid, kept, size) => {
    const order = np.argsort(valid.equal(0).astype(np.int32)).slice([0, size]);
    const shown = np.arange(size).astype(np.int32).less(kept);
    const indices = np.where(shown.ref, order.ref, order.slice([0, 1]));
    return [indices, shown.astype(np.int32)];
  },
  { staticArgnums: [2] },
);

/** A Filter condition as an error message shows it. @param {unknown} condition */
const describeCondition = (condition) => {
  try {
    return JSON.stringify(condition) ?? String(condition);
  } catch {
    return String(condition);
  }
};

const tests = {
  eq: (x, v) => x.equal(v),
  ne: (x, v) => x.notEqual(v),
  lt: (x, v) => x.less(v),
  lte: (x, v) => x.lessEqual(v),
  gt: (x, v) => x.greater(v),
  gte: (x, v) => x.greaterEqual(v),
};

// Replacing unrelated columns does not change an expression filter's membership. Keep
// its mask/count while the predicate inputs and row order hold, including interaction phase.
function filterIdentity(input, where, viewState) {
  if (!isExpression(where) || expressionHasTween(where)) return null;
  const { scope } = input,
    fields = [...expressionFields(where)].filter(
      (field) => !isViewStateField(field),
    );
  // Unknown virtual fields retain the uncached path until they supply a versioned resource.
  if (
    fields.some(
      (field) =>
        field.startsWith("@") &&
        !scope.interactionResource?.(field.replace(/^@any_/, "@")),
    )
  )
    return null;
  const rows = scope.identityRows ? null : scope.sourceIndices?.();
  try {
    return [
      JSON.stringify(expressionDescriptor(where)),
      input.length,
      input.valid,
      rows,
      JSON.stringify(viewStateKey([where], viewState)),
      ...fields.map((field) => {
        const resource =
          field.startsWith("@") &&
          scope.interactionResource?.(field.replace(/^@any_/, "@"));
        return resource
          ? (resource.version ?? interactionVersion(resource))
          : scope.get(field);
      }),
    ];
  } finally {
    rows?.dispose();
  }
}

/**
 * Filter: the same rows, the kept ones visible (a padded view, dataView.js; TODO 17.3), so
 * nothing downstream changes length as the kept rows change. Over hidden rows it tests every
 * row and keeps only visible ones.
 */
export const filter = {
  reads: "rows",
  output: "sameRows",
  // A selection, or conditions: expressions, and field conditions that read a field directly
  // (where="@brushed", {field: "@hovered", op: "eq", value: 0}).
  dependencies(settings) {
    if (settings.where?.isSelection) return { resources: [settings.where] };
    const conditions = list(settings.where);
    // A list may hold selections too (where=[brushA, brushB]: both must hold).
    const selections = conditions.filter((condition) => condition?.isSelection);
    return {
      ...(selections.length ? { resources: selections } : {}),
      expressions: conditions.filter(isExpression),
      fields: conditions
        .filter(
          (condition) => !isExpression(condition) && !condition?.isSelection,
        )
        .map((condition) =>
          typeof condition === "string" ? condition : condition?.field,
        ),
    };
  },
  validate(config) {
    const conditions = list(config.where);
    if (!conditions.length) throw Error("Filter needs at least one condition.");
    for (const condition of conditions)
      if (!(
        typeof condition === "string" ||
        isExpression(condition) ||
        isColumnNode(condition) ||
        condition?.isSelection ||
        typeof condition?.field === "string"
      ))
        throw Error(
          `Filter where: each condition is a column or interaction field ("@brushed"), {field, op, value}, a selection or an expression; received ${describeCondition(condition)}.`,
        );
  },
  async run(input, config, { own, cleanup, cache, viewState, evaluator }) {
    const { scope, length: rows } = input;
    const identity = cache && filterIdentity(input, config.where, viewState);
    const prior = identity && cache.filterMask;
    const reuse =
      prior &&
      identity.length === prior.identity.length &&
      identity.every((entry, i) => Object.is(entry, prior.identity[i]));
    let mask,
      count = null;
    if (reuse) {
      mask = prior.valid.ref;
      count = prior.count;
    } else if (config.where?.isSelection) {
      if (
        !config.where.active &&
        !config.where.previewActive &&
        (config.inactive ?? "all") === "all"
      ) {
        mask = visibleRows(input);
        count = input.count;
      } else
        mask = whereVisible(
          input,
          selectionMask(scope, config.where).greater(0),
        );
    } else {
      let combined = null;
      for (let entry of list(config.where)) {
        let test;
        // col.flag is the column "flag": a bare column, which may hold booleans or text.
        if (isColumnNode(entry)) entry = entry.args[0];
        if (entry?.isSelection) {
          // A selection in a list, as one where=selection: its rows, or every row while it is
          // inactive (eval 2026-10-13: where=[brushA, brushB] read a field "undefined").
          if (
            !entry.active &&
            !entry.previewActive &&
            (config.inactive ?? "all") === "all"
          )
            continue;
          test = selectionMask(scope, entry).greater(0);
        } else if (isExpression(entry)) {
          const evaluated = evaluateExpression(entry, scope, {
            evaluator,
            broadcast: false,
            viewState,
          });
          try {
            const value = evaluated.value?.codes ?? evaluated.value;
            // A constant condition (an input compared with a constant: ~(focus != "")) keeps every
            // row or none (2026-10-22); a reduction, a single device value, is still refused.
            if (typeof value === "number" || typeof value === "boolean")
              test = np.full([rows], Boolean(value) && !Number.isNaN(value), {
                dtype: np.bool,
              });
            else if (shapeOf(value).length !== 1 || value.shape[0] !== rows)
              throw Error(
                "Filter condition must be one value per row; a reduction is a single value, so compare it (x > mean(x)).",
              );
            else test = asArray(value).notEqual(0);
          } finally {
            evaluated.dispose();
          }
        } else {
          const condition =
            typeof entry === "string" ? { field: entry } : entry;
          const state = scope.interactionResource?.(condition.field);
          // An inactive interaction condition keeps every row: no test at all.
          if (
            state &&
            !state.active &&
            !state.previewActive &&
            (config.inactive ?? "all") === "all"
          )
            continue;
          const { array: x, map } = comparisonColumn(
            scope,
            condition.field,
            own,
          );
          let requested = condition.value ?? (state ? 1 : condition.value);
          // A bare column (where="flag", col.flag) keeps the rows where it is true: a boolean
          // column's true rows, a number column's nonzero ones.
          const bare = requested === undefined && condition.op === undefined;
          if (bare && map) {
            if (![...map.keys()].every((v) => typeof v === "boolean"))
              throw Error(
                `Filter where="${condition.field}": a text column is not true or false; compare it to a value (col.${condition.field} == "${map.keys().next().value}").`,
              );
            requested = true;
          } else if (bare) requested = 0;
          const value = map ? (map.get(requested) ?? -2) : requested;
          // A slider or a Python update changes the value: it comes from a buffer (17.1).
          const operand = () =>
            typeof value === "number" || typeof value === "boolean"
              ? deviceScalar(Number(value))
              : value;
          const op = condition.op ?? (bare && !map ? "ne" : "eq");
          if (tests[op]) test = tests[op](x.ref, operand());
          else if (op === "finite")
            test = np.isfinite(x.ref.astype(np.float32));
          else if (op === "in") {
            const values = map
              ? condition.value.map((v) => map.get(v) ?? -2)
              : condition.value;
            test = np.isin(
              x.ref,
              Array.isArray(values) &&
                values.every((v) => typeof v === "number")
                ? deviceArray(values)
                : np.array(values),
            );
          } else throw Error(`Unknown filter operation: ${condition.op}`);
        }
        combined = combined ? np.logicalAnd(combined, test) : test;
      }
      if (combined) mask = whereVisible(input, combined);
      else {
        mask = visibleRows(input);
        count = input.count;
      }
    }
    // The one readback a Filter keeps: the logical row count (view.length, mark counts).
    const valid = own(reuse ? mask : mask.astype(np.int32));
    const kept = count ?? (await scalar(countRows(valid.ref)));
    const rowMapping = reuse
      ? prior.rowMapping
      : createMaskedRowMapping(valid, kept);
    if (!reuse) cleanup(() => rowMapping.dispose());
    if (identity && !reuse) {
      prior?.valid.dispose();
      prior?.releaseRows?.();
      cache.filterMask = {
        identity,
        valid: valid.ref,
        count: kept,
        rowMapping,
        releaseRows: rowMapping.retain(),
      };
      ownCacheEntry(cache, "filterMask", (mask) => {
        mask.valid.dispose();
        mask.releaseRows?.();
      });
    }
    const size = bucketSize(cache, rows, kept);
    // A bucket (see bucketing), built when a consumer first asks for it (view.bucketed): the
    // kept rows first, in order (a stable sort), then copies of the first of them, so every
    // physical row is a real row. The kept count reaches the kernels from a buffer; the bucket
    // is a prefix view whose rows follow the mask. The output itself stays the physical rows
    // with a mask, so a consumer that gains nothing from fewer rows (a mark that swaps its
    // mask, a Slice) never pays for the sort (TODO 25.1).
    const bucketed =
      size < rows
        ? () => {
            const [indices, shown] = bucketRows(
              valid.ref,
              deviceScalar(kept, { dtype: "int32" }),
              size,
            );
            own(indices);
            const rowsView = createDataView(scope, { indices });
            try {
              const bucket = createDataView(rowsView, {
                mask: shown,
                count: kept,
                prefix: true,
                followsMask: true,
              });
              // Grouped transforms group the Filter's rows (the same columns every move) and
              // map the bucket's rows through `indices` (TODO 29.10).
              bucket.bucketSource = { rows: scope, indices };
              return bucket;
            } finally {
              rowsView.dispose(); // the bucket holds it
            }
          }
        : null;
    return { valid, count: kept, bucketed, rowMapping };
  },
};
