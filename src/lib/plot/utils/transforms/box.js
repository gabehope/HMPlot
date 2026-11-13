import { numpy as np, jit } from "@hmplot/jax";
import { numericColumn } from "../dataView.js";
import {
  sortedGroups,
  groupQuantiles,
  categoryPositions,
} from "../grouping.js";
import { histogramRows } from "../reduce.js";
import { inputGroups, fieldTitle } from "./common.js";
import { deviceArray } from "../deviceParams.js";

/**
 * BoxStats' device work as one jitted program per orientation, cached per row and group count
 * (TODO 33.3): the groups' sorted runs, the quartiles, the fences, each whisker the first (last)
 * value inside its fence (found by counting the values outside it), and a box's geometry. Every
 * argument is consumed; `params` is [whisker multiplier, half the width] (a buffer: a new
 * whisker or width compiles nothing). Returns the output columns in `BOX_OUTPUTS` order.
 */
const BOX_OUTPUTS = [
  "q1",
  "median",
  "q3",
  "whiskerLow",
  "whiskerHigh",
  "__boxCenter",
  "__boxSpan",
  "__boxPosition",
  "__boxX0", "__boxX1", "__boxY0", "__boxY1",
  "__medianStart",
  "__medianEnd",
  "__whiskerStart",
  "__whiskerEnd",
  "shownPerGroup",
];
const BOX_PROGRAMS = new Map();
function boxProgram(horizontal) {
  let program = BOX_PROGRAMS.get(horizontal);
  if (program) return program;
  program = jit((codes, value, finite, shownWeight, positions, params) => {
    const count = positions.shape[0],
      last = Math.max(0, value.shape[0] - 1);
    const multiplier = params.ref.slice(0),
      half = params.slice(1);
    const runs = sortedGroups(codes, finite, value, count, [shownWeight]);
    const q = groupQuantiles(runs, [0.25, 0.5, 0.75]);
    const q1 = q.ref.slice([], 0),
      median = q.ref.slice([], 1),
      q3 = q.slice([], 2);
    const span = q3.ref.sub(q1.ref);
    const lowFence = np.take(
        q1.ref.sub(span.ref.mul(multiplier.ref)),
        codes.ref,
        0,
      ),
      highFence = np.take(q3.ref.add(span.mul(multiplier)), codes.ref, 0);
    const code = np.where(finite.ref, codes, -1).astype(np.int32);
    const below = np
        .logicalAnd(finite.ref, value.ref.less(lowFence))
        .astype(np.float32),
      above = np
        .logicalAnd(finite, value.greater(highFence))
        .astype(np.float32);
    const [under, over] = histogramRows(code, [below, above], count);
    code.dispose();
    below.dispose();
    above.dispose();
    shownWeight.dispose();
    const present = runs.counts.ref.greater(0);
    const at = (position) =>
      np.take(runs.sorted.ref, np.clip(position, 0, last).astype(np.int32), 0);
    const whiskerLow = np.where(
        present.ref,
        at(runs.starts.ref.add(under)),
        NaN,
      ),
      whiskerHigh = np.where(
        present,
        at(runs.starts.ref.add(runs.counts.ref).sub(1).sub(over)),
        NaN,
      );
    const drawn = whiskerLow.ref.lessEqual(whiskerHigh.ref);
    const shownPerGroup = runs.totals[0].ref;
    runs.dispose();
    // A box along the value axis at its group's position across it.
    const pair = (along, across) =>
      horizontal ? np.stack([along, across], 1) : np.stack([across, along], 1);
    const result = [
      q1.ref,
      median.ref,
      q3.ref,
      whiskerLow.ref,
      whiskerHigh.ref,
      q1.ref.add(q3.ref).mul(0.5),
      q3.ref.sub(q1.ref),
      pair(median.ref, positions.ref),
      horizontal ? q1.ref : positions.ref.sub(half.ref),
      horizontal ? q3.ref : positions.ref.add(half.ref),
      horizontal ? positions.ref.sub(half.ref) : q1.ref,
      horizontal ? positions.ref.add(half.ref) : q3.ref,
      pair(median.ref, positions.ref.sub(half.ref)),
      pair(median, positions.ref.add(half)),
      // A whisker from its low end to its high end, at its group's position (BoxPlot's); a
      // reversed one (a whisker under half an interquartile range) is not drawn, as ErrorBars'.
      pair(np.where(drawn.ref, whiskerLow, NaN), positions.ref),
      pair(np.where(drawn, whiskerHigh, NaN), positions),
      shownPerGroup,
    ];
    q1.dispose(); q3.dispose();
    return result;
  });
  BOX_PROGRAMS.set(horizontal, program);
  return program;
}

/**
 * BoxStats: a row per group of `by` with the quartiles, the whiskers (the last values inside
 * `whisker` interquartile ranges of the box) and a box's geometry, over its visible finite rows,
 * every group at once in one compiled program. The groups come from every row read; those with no
 * visible row are hidden.
 */
export const boxStats = {
  reads: "rows",
  output: "aggregate",
  // Each group sits at its category's place on the category axis, in the frame's order.
  categoryAxis: (config) => (config.orientation === "horizontal" ? "y" : "x"),
  // Its quartiles run along the other axis (BoxPlot's q1, q3 and median attachments).
  valueAxis: (config) => (config.orientation === "horizontal" ? 0 : 1),
  validate(config) {
    if (config.order !== undefined)
      throw Error("BoxStats.order is not a prop: its groups follow the frame's category order; set the axis's domain instead.");
  },
  // The quartiles, whiskers and the box's extent along the value axis are the value column;
  // the box's extent across it sits at its group's place on the category axis.
  names(config, source) {
    const value = fieldTitle(source, config.value), category = fieldTitle(source, config.by),
      horizontal = config.orientation === "horizontal";
    const names = { __boxPosition: null, __medianStart: null, __medianEnd: null, __whiskerStart: null, __whiskerEnd: null };
    for (const name of ["q1", "median", "q3", "whiskerLow", "whiskerHigh", "__boxCenter", "__boxSpan"]) names[name] = value;
    for (const name of ["__boxX0", "__boxX1"]) names[name] = horizontal ? value : category;
    for (const name of ["__boxY0", "__boxY1"]) names[name] = horizontal ? category : value;
    return names;
  },
  async run(input, config, { own, cleanup, cache }) {
    const groups = await inputGroups(cache, input, config.by);
    cleanup(() => groups.dispose());
    const columns = { ...groups.keys },
      count = groups.count,
      n = input.length;
    const value = own(numericColumn(input.scope, config.value)),
      shown = input.valid ? own(input.valid.ref.greater(0)) : null,
      finite = own(
        shown
          ? np.logicalAnd(np.isfinite(value.ref), shown.ref)
          : np.isfinite(value.ref),
      );
    // Where each group sits on the category axis: its index in the axis order, if given.
    const positions = own(
      categoryPositions(groups.keys[config.by], config.__categoryOrder),
    );
    let shownPerGroup = null;
    if (!count) {
      for (const name of BOX_OUTPUTS.slice(0, 7))
        columns[name] = own(np.zeros([0]));
      for (const name of ["__boxX0", "__boxX1", "__boxY0", "__boxY1"]) columns[name] = own(np.zeros([0]));
      for (const name of ["__boxPosition", "__medianStart", "__medianEnd", "__whiskerStart", "__whiskerEnd"]) columns[name] = own(np.zeros([0, 2]));
    } else {
      const params = own(
        deviceArray([config.whisker ?? 1.5, (config.width ?? 0.8) / 2]),
      );
      const outputs = boxProgram(config.orientation === "horizontal")(
        groups.codes.ref,
        value.ref,
        finite.ref,
        shown ? shown.ref.astype(np.float32) : np.ones([n], { dtype: np.float32 }),
        positions.ref,
        params.ref,
      ).map(own);
      BOX_OUTPUTS.forEach((name, k) => {
        if (name === "shownPerGroup") shownPerGroup = outputs[k];
        else columns[name] = outputs[k];
      });
    }
    const provenance = {
      kind: "boxplot",
      fields: [config.by, "q1", "median", "q3", "whiskerLow", "whiskerHigh"],
    };
    // Every group kept, the ones with a visible row visible.
    const valid = shown
      ? own(
          shownPerGroup
            ? shownPerGroup.ref.greater(0).astype(np.int32)
            : np.zeros([0], { dtype: np.int32 }),
        )
      : null;
    return { columns, provenance, valid };
  },
};

/**
 * BoxOutliers' device work (TODO 33.3): each row outside its group's fences (int32 0/1), one
 * program cached per row count and group count (`count`, static). `multiplier` is a rank-1
 * buffer, so a new whisker compiles nothing. Consumes its arguments.
 */
const outlierProgram = jit(
  (codes, value, finite, multiplier, count) => {
    const runs = sortedGroups(codes, finite, value, count);
    const q = groupQuantiles(runs, [0.25, 0.75]);
    runs.dispose();
    const q1 = q.ref.slice([], 0),
      q3 = q.slice([], 1),
      span = q3.ref.sub(q1.ref),
      m = multiplier.reshape([]);
    const lowFence = np.take(q1.sub(span.ref.mul(m.ref)), codes.ref, 0),
      highFence = np.take(q3.add(span.mul(m)), codes, 0);
    return np
      .logicalAnd(
        finite,
        np.logicalOr(value.ref.less(lowFence), value.greater(highFence)),
      )
      .astype(np.int32);
  },
  { staticArgnums: [4] },
);

/**
 * BoxOutliers: the same rows, the ones outside their group's whiskers visible. Every group's
 * fences at once from its sorted run (TODO 26.1); a group with no visible value has NaN fences:
 * no outliers.
 */
export const boxOutliers = {
  reads: "rows",
  output: "sameRows",
  async run(input, config, { own, cleanup, cache }) {
    // Over a padded input: fences from the shown rows; the output keeps the physical rows
    // (like a Filter) and shows the outliers among the shown rows.
    const groups = await inputGroups(cache, input, config.by),
      value = own(numericColumn(input.scope, config.value)),
      multiplier = config.whisker ?? 1.5,
      finite = own(
        input.valid
          ? np.logicalAnd(np.isfinite(value.ref), input.valid.ref.greater(0))
          : np.isfinite(value.ref),
      );
    cleanup(() => groups.dispose());
    // Every group's fences at once from its sorted run (TODO 26.1), in one compiled program
    // (33.3); a row is an outlier against its own group's. A group with no kept value has NaN
    // fences: no outliers.
    const mask = !groups.count
      ? own(np.zeros([input.length], { dtype: np.int32 }))
      : own(
          outlierProgram(
            groups.codes.ref,
            value.ref,
            finite.ref,
            own(deviceArray([multiplier])).ref,
            groups.count,
          ),
        );
    // The same rows, the outliers visible (the runner reads their count). The fences come from
    // the visible rows: the values follow the mask.
    return { valid: mask, followsMask: true };
  },
};
