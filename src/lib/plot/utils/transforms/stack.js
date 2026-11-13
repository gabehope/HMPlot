import { numpy as np } from "@hmplot/jax";
import { planProgram } from "../programs.js";
import { finiteExtents, numericColumn } from "../dataView.js";
import {
  comparisonColumn,
  inputGroups,
  fieldTitle,
  cachedHostValue,
} from "./common.js";
import { segmentedScan } from "../reduce.js";
import { deviceArray } from "../deviceParams.js";
import { disposeCacheEntries, ownCacheEntry } from "../cacheEntries.js";
import { LIMITS, limitError } from "../limits.js";

/** Stack's offsets (TODO 39.7): d3's diverging offset ("zero"), expand, silhouette and wiggle. */
export const STACK_OFFSETS = Object.freeze([
  "zero",
  "expand",
  "center",
  "wiggle",
]);
/** Stack's named orders (d3's stackOrder*); `order` also takes a list of categories. */
export const STACK_ORDERS = Object.freeze([
  "none",
  "appearance",
  "asc",
  "desc",
  "insideOut",
  "reverse",
]);
// Orders computed from the values: each needs every series' total or peak.
const COMPUTED_ORDERS = new Set(["appearance", "asc", "desc", "insideOut"]);
const quoted = (values) => values.map((value) => `"${value}"`).join(", ");
// insideOut places the series one at a time: a step each in the compiled program.
const INSIDE_OUT_SERIES = LIMITS.stackInsideOut.value;

/**
 * Stack: the same rows, each with y0 and y1, its span of the cumulative positive or negative
 * totals of its x group (`x`) in stack order (series rank, then row order), moved by `offset`.
 * Masks, not per-group compaction: no kernel sized by a group, and no readback but the groups'
 * count (kept while the columns are the same) and center and wiggle's check for negative values
 * (requireNonNegative). Hidden and non-finite rows add nothing; their y0 and y1 are NaN.
 */
export const stack = {
  // Props that take a column name or one number per row (runner.js alignedFields).
  fields: ["y"],
  reads: "rows",
  output: "sameRows",
  validate(config) {
    const offset = config.offset ?? "zero",
      order = config.order ?? "none";
    if (!STACK_OFFSETS.includes(offset))
      throw Error(
        `Unknown Stack offset ${JSON.stringify(offset)}: use ${quoted(STACK_OFFSETS)}.`,
      );
    if (!Array.isArray(order) && !STACK_ORDERS.includes(order))
      throw Error(
        `Unknown Stack order ${JSON.stringify(order)}: use a list of categories, or ${quoted(STACK_ORDERS)}.`,
      );
    // The layers wiggle moves and the computed orders sort are the series.
    if (!config.series && offset === "wiggle")
      throw Error(
        'Stack offset "wiggle" needs series: the layers it moves are the series.',
      );
    if (!config.series && COMPUTED_ORDERS.has(order))
      throw Error(`Stack order "${order}" needs series: it sorts the series.`);
  },
  // The bounds are the stacked field.
  names: (config, source) => ({
    y0: fieldTitle(source, config.y),
    y1: fieldTitle(source, config.y),
  }),
  async run(input, config, { own, cleanup, cache, maxBytes }) {
    const { scope, length: n } = input;
    if (!n)
      return { columns: { y0: own(np.zeros([0])), y1: own(np.zeros([0])) } };
    const offset = config.offset ?? "zero",
      list = Array.isArray(config.order) ? config.order : null,
      order = list ? "none" : (config.order ?? "none");
    if (offset === "center" || offset === "wiggle")
      await requireNonNegative(input, config, cache, offset);
    const groups =
      config.x !== undefined ? await inputGroups(cache, input, config.x) : null;
    if (groups) cleanup(() => groups.dispose());
    let lookup = null,
      series = null,
      seriesCount = null;
    if (config.series) {
      series = comparisonColumn(scope, config.series, own);
      if (list) {
        if (!series.map)
          throw Error("Explicit stack order requires categorical series.");
        lookup = listRanks([...series.map.keys()], list);
      }
      // wiggle and the computed orders read every (x group, series) total: a table of series
      // codes 0 .. seriesCount - 1. A category's code is one; numbers are grouped (their count
      // read back once, kept while the column is the same).
      if (offset === "wiggle" || COMPUTED_ORDERS.has(order)) {
        if (series.map) seriesCount = series.map.size;
        else {
          // A Stack's numeric series keep their groups in a cache of their own (TODO 39.7).
          if (cache) ownCacheEntry(cache, "seriesGroups", disposeCacheEntries);
          const found = await inputGroups(
            cache ? (cache.seriesGroups ??= {}) : null,
            input,
            config.series,
          );
          cleanup(() => found.dispose());
          seriesCount = found.count;
          series = {
            array: own(
              np.where(
                np.isfinite(series.array.ref),
                found.codes.ref.astype(np.float32),
                NaN,
              ),
            ),
            map: null,
          };
        }
      }
    }
    if (seriesCount !== null) {
      // The (x group, series) table: float32 keys, and a buffer of 8 bytes per pair.
      const count = groups?.count ?? 1,
        limit = Math.min(LIMITS.stackPairs.value, Math.floor(maxBytes / 8));
      const what = offset === "wiggle" ? 'offset "wiggle"' : `order "${order}"`;
      if (count * (seriesCount + 1) > limit)
        throw limitError("stackPairs", {
          what: `${what}, which totals every (x, series) pair,`,
          count: count * (seriesCount + 1),
          limit,
          hint: `Stack fewer x values (${count.toLocaleString("en-US")}) or series (${seriesCount.toLocaleString("en-US")}).`,
        });
      if (order === "insideOut" && seriesCount > INSIDE_OUT_SERIES)
        throw limitError("stackInsideOut", {
          count: seriesCount,
          hint: `Use order "asc" or "desc", or fewer series in "${config.series}".`,
        });
    }
    const plan = {
      series: Boolean(series),
      ordered: Boolean(lookup),
      grouped: Boolean(groups),
      hidden: Boolean(input.valid),
      count: groups?.count ?? 1,
      offset,
      order,
      seriesCount,
    };
    const { y0, y1 } = stackProgram(plan)({
      y: numericColumn(scope, config.y),
      ...(input.valid ? { valid: input.valid.ref } : {}),
      ...(groups ? { codes: groups.codes.ref } : {}),
      ...(series ? { series: series.array.ref } : {}),
      ...(lookup ? { lookup: deviceArray(lookup) } : {}),
    });
    // Which rows are visible sets the totals: the values follow the mask.
    return { columns: { y0: own(y0), y1: own(y1) }, followsMask: true };
  },
};

/**
 * Each category's place in a stack ordered by `list`: the listed ones in its order, then the
 * others in their own order, then the missing value. A permutation of 0 .. categories.length
 * (the last for the missing value), so each series keeps a place of its own.
 */
function listRanks(categories, list) {
  const position = categories.map((value, code) => {
    const at = list.indexOf(value);
    return at < 0 ? list.length + code : at;
  });
  const ranks = new Array(categories.length + 1);
  categories
    .map((_, code) => code)
    .sort((a, b) => position[a] - position[b])
    .forEach((code, rank) => (ranks[code] = rank));
  ranks[categories.length] = categories.length;
  return ranks;
}

/**
 * center and wiggle stack each group up from a baseline, so a negative value is a data error
 * (d3 draws something odd instead). The column's minimum is read back once and kept while the
 * column is the same object, so a brush over a Filter reads nothing more; only while the column
 * holds a negative value does a run with hidden rows read the shown rows' minimum too.
 */
async function requireNonNegative(input, config, cache, offset) {
  const field = config.y;
  const plain = typeof field === "string" && !field.startsWith("@");
  const minimum = async (rows, valid) => {
    const values = numericColumn(rows, field);
    try {
      return (await finiteExtents([values], valid))[0][0];
    } finally {
      values.dispose();
    }
  };
  // Every row the input's rows come from (a Filter's bucket: the Filter's rows), hidden or not.
  // Values given for y are aligned to the input's own rows (runner.js alignedFields).
  const rows =
    typeof field === "string"
      ? (input.groupSource?.rows ?? input.scope)
      : input.scope;
  let negative = await cachedHostValue(
    plain ? cache : null,
    "stackNegative",
    [
      field,
      rows.length,
      rows.identity?.generation,
      plain ? rows.get(field) : null,
    ],
    async () => (await minimum(rows, null)) < 0,
  );
  if (negative && (input.valid || rows !== input.scope))
    negative = (await minimum(input.scope, input.valid)) < 0;
  if (negative)
    throw Error(
      `Stack offset "${offset}" needs non-negative values, but ${plain ? `column "${field}"` : "y"} has a negative value. Filter out the negative rows, or use offset "zero" or "expand".`,
    );
}

/**
 * For each j in 0 .. count - 1, the index of the last of `keys` (float32 [m], ascending, m > 0)
 * equal to j, or -1 for none: a binary search, ceil(log2(m + 1)) passes of gathers over `count`
 * queries. Borrows `keys`.
 */
function runEnds(keys, count) {
  const m = keys.shape[0];
  const target = np.arange(count).astype(np.float32);
  let lo = np.zeros([count]),
    hi = np.full([count], m);
  for (let pass = 0; pass < Math.ceil(Math.log2(m + 1)); pass++) {
    const mid = lo.ref.add(hi.ref).mul(0.5).astype(np.int32).astype(np.float32);
    const right = np
      .take(keys.ref, np.minimum(mid.ref, m - 1).astype(np.int32), 0)
      .lessEqual(target.ref);
    const open = lo.ref.less(hi.ref);
    lo = np.where(np.logicalAnd(open.ref, right.ref), mid.ref.add(1), lo);
    hi = np.where(np.logicalAnd(open, np.logicalNot(right)), mid, hi);
  }
  hi.dispose();
  // lo is the number of keys <= j: the last of them is j's when it equals j.
  const last = lo.sub(1),
    at = np.maximum(last.ref, 0).astype(np.int32);
  const found = np.logicalAnd(
    last.greaterEqual(0),
    np.take(keys.ref, at.ref, 0).equal(target),
  );
  return np.where(found, at, -1).astype(np.int32);
}

/**
 * `values` ([m, d], rows sorted by `keys`) at the last row of each key 0 .. count - 1: [count,
 * d], 0 for a key with no row. With running sums, each run's total. Borrows both.
 */
function runLast(values, keys, count) {
  const ends = runEnds(keys, count);
  const at = np.take(values.ref, np.maximum(ends.ref, 0), 0);
  return np.where(ends.greaterEqual(0).reshape([count, 1]), at, 0);
}

/**
 * Each series' place in the stack for a computed order (d3's stackOrderAppearance, Ascending,
 * Descending and InsideOut), from the (group, series) totals `cells` ([count, S], the groups in
 * x order) and which of them have a row (`present`). Ties keep the series' own order, as d3's
 * stable sorts do (descending is ascending reversed, as d3's). Returns float32 [S]. Consumes its
 * inputs.
 */
function computedRanks(order, cells, present) {
  const S = cells.shape[1];
  const totals = np.sum(cells.ref, 0);
  const inverse = (permutation) => np.argsort(permutation).astype(np.float32);
  if (order === "asc" || order === "desc") {
    cells.dispose();
    present.dispose();
    const up = np.argsort(totals);
    return inverse(order === "asc" ? up : np.flip(up));
  }
  // Appearance: by the group of each series' peak (the first, in x order).
  const appearance = np.argsort(
    np.argmax(np.where(present, cells, -Infinity), 0),
  );
  if (order === "appearance") {
    totals.dispose();
    return inverse(appearance);
  }
  // insideOut: in order of appearance, each series goes to the lighter side (d3: the top when it
  // is lighter than the bottom, else the bottom); then the bottom's series reversed, then the
  // top's. A sequence of S scalar steps, each depending on the last.
  const weights = np.take(totals, appearance.ref, 0);
  let lead = np.zeros([]); // bottom - top
  const tops = [];
  for (let i = 0; i < S; i++) {
    const top = lead.ref.greater(0).astype(np.float32);
    lead = lead.add(weights.ref.slice(i).mul(np.subtract(1, top.ref.mul(2))));
    tops.push(top);
  }
  lead.dispose();
  weights.dispose();
  const top = np.stack(tops);
  const topsBefore = np.cumsum(top.ref, 0).sub(top.ref);
  const bottomsBefore = np.arange(S).astype(np.float32).sub(topsBefore.ref);
  const bottoms = np.sum(np.subtract(1, top.ref));
  const place = np.where(
    top.greater(0),
    bottoms.ref.add(topsBefore),
    bottoms.sub(1).sub(bottomsBefore),
  );
  return np.take(place, np.argsort(appearance), 0);
}

/**
 * wiggle's baseline per group (d3's stackOffsetWiggle): each group moves by the change in slope
 * of its layers from the group before, weighted by their thickness, summed along x. For group j,
 * with v the layers' totals in stack order, d = v(j) - v(j - 1), and mid each layer's middle
 * stacked from 0, the step is sum(d (total - mid)) / total (d3's s2 / s1), and the baseline is
 * minus the running sum of the steps (0 at the first group). `stacked` is [count, S + 1] in
 * stack order; consumed. Returns float32 [count].
 */
function wiggleBaseline(stacked) {
  const [count, width] = stacked.shape;
  const running = np.cumsum(stacked.ref, 1);
  const total = running.ref.slice([], [width - 1, width]);
  const before = np.concatenate([
    stacked.ref.slice([0, 1]),
    stacked.ref.slice([0, count - 1]),
  ]);
  const change = stacked.ref.sub(before);
  const s2 = np.sum(
    change.mul(total.ref.sub(running).add(stacked.mul(0.5))),
    1,
  );
  const s1 = total.reshape([count]);
  const step = np.where(
    s1.ref.notEqual(0),
    s2.div(np.where(s1.ref.notEqual(0), s1.ref, 1)),
    0,
  );
  s1.dispose();
  return np.cumsum(step, 0).neg();
}

/**
 * Stack's device work for a plan (TODO 33.3: one compiled program per plan). Stack order (TODO
 * 29.9): by x group, then series rank, then row. Each group's positive and negative running
 * totals are one segmented scan (it restarts at each group, so no group's total loses precision
 * to another's), then the offset scales or moves each group, then back to row order.
 *
 * With plan.seriesCount S (wiggle, and the orders computed from values) the series are codes
 * 0 .. S - 1 and the missing value S, the last layer. The (group, series) totals come first,
 * from a sort by (group, series) and a segmented scan read at each run's end (runLast), as a
 * [count, S + 1] table; the order's ranks come from it, and one stable sort by (group, rank)
 * stacks the rows. Consumes `inputs` (y, valid, codes, series, lookup).
 */
function stackKernel(plan, { y, valid, codes, series, lookup }) {
  const n = y.shape[0],
    count = plan.count,
    S = plan.seriesCount;
  const shown = valid
    ? np.logicalAnd(np.isfinite(y.ref), valid.greater(0))
    : np.isfinite(y.ref);
  const group = codes ?? np.zeros([n], { dtype: np.int32 });
  // Hidden rows and rows in no group are a run of their own after the groups, never stacked.
  const member = np.logicalAnd(shown, group.ref.greaterEqual(0));
  const key = np.where(member.ref, group, count).astype(np.int32);
  let rows,
    cells = null;
  if (S === null) {
    let inSeries = null;
    if (series) {
      let rank = lookup
        ? np.take(
            lookup,
            np
              .where(np.isfinite(series.ref), series, lookup.shape[0] - 1)
              .astype(np.int32),
            0,
          )
        : series;
      // The missing value stays last (NaN sorts last).
      if (plan.order === "reverse") rank = rank.neg();
      inSeries = np.argsort(rank);
    } else if (plan.order === "reverse")
      inSeries = np.flip(np.arange(n).astype(np.int32));
    inSeries ??= np.arange(n).astype(np.int32);
    rows = np.take(inSeries.ref, np.argsort(np.take(key.ref, inSeries, 0)), 0);
  } else {
    const width = S + 1;
    const slot = np.where(np.isfinite(series.ref), series, S).astype(np.int32);
    // The (group, series) totals of the member rows, series in code order.
    const cellKey = key.ref.mul(width).add(slot.ref).astype(np.float32);
    const byCell = np.argsort(cellKey.ref);
    const sortedKey = np.take(cellKey, byCell.ref, 0);
    const sums = segmentedScan(
      np.stack(
        [
          np.take(np.where(member.ref, y.ref, 0), byCell.ref, 0),
          np.take(member.ref.astype(np.float32), byCell, 0),
        ],
        1,
      ),
      sortedKey,
    );
    const table = runLast(sums, sortedKey, count * width).reshape([
      count,
      width,
      2,
    ]);
    sums.dispose();
    sortedKey.dispose();
    const totals = table.ref.slice([], [], 0),
      present = table.slice([], [], 1).greater(0);
    const index = np.arange(width).astype(np.float32);
    let rank;
    if (plan.ordered) rank = lookup;
    else if (plan.order === "reverse")
      rank = np.where(index.ref.less(S), np.subtract(S - 1, index.ref), S);
    else if (COMPUTED_ORDERS.has(plan.order) && S > 0)
      rank = np.concatenate([
        computedRanks(
          plan.order,
          totals.ref.slice([], [0, S]),
          present.ref.slice([], [0, S]),
        ),
        np.full([1], S),
      ]);
    else rank = index.ref;
    index.dispose();
    present.dispose();
    const stackKey = key.ref
      .mul(width)
      .astype(np.float32)
      .add(np.take(rank.ref, slot, 0));
    rows = np.argsort(stackKey);
    if (plan.offset === "wiggle") cells = np.take(totals, np.argsort(rank), 1);
    else {
      totals.dispose();
      rank.dispose();
    }
  }
  const keys = np.take(key, rows.ref, 0).astype(np.float32);
  const v = np.take(y, rows.ref, 0),
    inStack = np.take(member, rows.ref, 0);
  const totals = segmentedScan(
    np.stack(
      [
        np.where(inStack.ref, np.maximum(v.ref, 0), 0),
        np.where(inStack.ref, np.minimum(v.ref, 0), 0),
      ],
      1,
    ),
    keys,
  );
  let top = np.where(
    inStack,
    np.where(
      v.ref.greaterEqual(0),
      totals.ref.slice([], 0),
      totals.ref.slice([], 1),
    ),
    NaN,
  );
  let start = top.ref.sub(v);
  // The offset: a scale (expand) or a baseline (center, wiggle) per group.
  if (plan.offset !== "zero") {
    let perGroup;
    if (plan.offset === "wiggle") perGroup = wiggleBaseline(cells);
    else {
      const ends = runLast(totals, keys, count);
      const positive = ends.ref.slice([], 0),
        negative = ends.slice([], 1);
      if (plan.offset === "expand") {
        // Each group's total magnitude spans 1: positives rise to P/T, negatives fall to -N/T.
        const magnitude = positive.sub(negative);
        perGroup = np.where(
          magnitude.ref.greater(0),
          np.divide(1, np.maximum(magnitude, 1e-30)),
          1,
        );
      } else perGroup = positive.add(negative).mul(-0.5); // center: d3's silhouette
    }
    const each = np.take(
      perGroup,
      np.minimum(keys.ref, count - 1).astype(np.int32),
      0,
    );
    if (plan.offset === "expand") {
      top = top.mul(each.ref);
      start = start.mul(each);
    } else {
      top = top.add(each.ref);
      start = start.add(each);
    }
  }
  totals.dispose();
  keys.dispose();
  const back = np.argsort(rows);
  top = np.take(top, back.ref, 0);
  start = np.take(start, back, 0);
  return { y0: np.minimum(start.ref, top.ref), y1: np.maximum(start, top) };
}
const PROGRAMS = new Map();
/** stackKernel compiled once per plan (utils/programs.js). */
const stackProgram = (plan) => planProgram(PROGRAMS, plan, stackKernel);
