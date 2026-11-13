import { evaluateTransientExpression } from "../expressionPlans.js";
import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import { format } from "d3";
import { planProgram } from "../programs.js";
import { numericColumn } from "../dataView.js";
import { asArray } from "../data.js";
import { isExpression } from "../expressions.js";
import { comparisonColumn, inputGroups } from "./common.js";
import { histogramRows, segmentedScan } from "../reduce.js";
import { deviceArray } from "../deviceParams.js";

const SORTS = ["none", "asc", "desc"];
const finite = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * PieGeometry (Pie): the same rows, each with its sector. Per `by` group (one ring each, the
 * first innermost, a pad's width apart at their boundary), in `sort` order, a row's angles are
 * its value's cumulative share of the group's total across [startAngle, endAngle], as d3.pie's:
 * 0 at 12 o'clock, clockwise, in degrees; `padAngle` is taken out of every sector's share and
 * left as an angular gap, half on each side. Unlike d3.pie, only rows that draw (a positive
 * value) take a pad: a zero is a sector of no width at its place, and a missing or hidden row
 * takes neither.
 *
 * Output columns, angles in the frame's units (`turn` units per revolution; a polar frame's
 * angle 0 points east and runs counter-clockwise, so the angles are converted):
 *   __pieStart, __pieEnd   the sector's angles (start <= end), NaN for a missing or hidden row;
 *   __pieInner, __pieOuter its ring's radii (from innerRadius to outerRadius, split among rings);
 *   __pieAngle, __pieRadius its centroid (mid angle, mid radius), for labels; NaN unless drawn;
 *   __pieShare             its share of its group's total (0 to 1);
 *   __pieLabel             with `label` "value", "percent" or a numeric column: the text;
 *   __pieTextRadius        where the label is drawn: __pieRadius, or NaN for a label hidden
 *                          because it would overlap a larger sector's (with `labelText`, the
 *                          text's column, and `labelSize`, the font size in radius units).
 * A negative value is a data error naming its row (one readback).
 */
export const pieGeometry = {
  reads: "rows",
  output: "sameRows",
  // Angles, radii and shares are the pie's own coordinates, not a column's: unnamed.
  names: () => Object.fromEntries(["__pieStart", "__pieEnd", "__pieInner", "__pieOuter", "__pieAngle", "__pieRadius", "__pieShare", "__pieLabel", "__pieTextRadius"]
    .map((name) => [name, null])),
  validate(config) {
    if (config.value === undefined) throw Error("Pie requires a value column.");
    // The Pie passes its plot's view: its sectors are 2D polar Rects.
    if (config.view === "3d") throw Error('Pie draws in 2D plots only; give its Plot type="2d".');
    for (const key of ["startAngle", "endAngle", "padAngle", "innerRadius", "outerRadius"])
      if (config[key] !== undefined && !finite(config[key]))
        throw Error(`Pie ${key} must be a finite number.`);
    if ((config.padAngle ?? 0) < 0) throw Error("Pie padAngle must be nonnegative.");
    const inner = config.innerRadius ?? 0, outer = config.outerRadius ?? 1;
    if (inner < 0 || outer < inner)
      throw Error("Pie radii must satisfy 0 <= innerRadius <= outerRadius.");
    if (config.turn === "extent")
      throw Error('Pie cannot draw in a polar frame whose angleUnit is "extent" (its turn follows the x domain); use degrees, radians or custom.');
    if (config.turn !== undefined && !(finite(config.turn) && config.turn > 0))
      throw Error("Pie needs a polar frame with a finite, positive angular period.");
    const sort = config.sort ?? "none";
    if (!Array.isArray(sort) && !SORTS.includes(sort))
      throw Error(`Pie sort must be "none", "asc", "desc" or a list of categories; got ${JSON.stringify(sort)}.`);
    if (Array.isArray(sort) && config.category === undefined)
      throw Error("Pie sort by a category order needs a category column.");
  },
  async run(input, config, { own, cleanup, cache, evaluator }) {
    const { scope, length: n } = input;
    const inner = config.innerRadius ?? 0, outer = config.outerRadius ?? 1;
    const names = ["__pieStart", "__pieEnd", "__pieInner", "__pieOuter", "__pieAngle", "__pieRadius", "__pieShare"];
    if (!n) {
      const columns = Object.fromEntries(names.map((name) => [name, own(np.zeros([0]))]));
      if (config.label !== undefined) columns.__pieLabel = { codes: own(np.zeros([0], { dtype: np.int32 })), categories: [] };
      columns.__pieTextRadius = own(np.zeros([0]));
      return { columns };
    }
    const value = numbers(scope, config.value, n, own, cleanup, evaluator);
    // A negative value is an error in the data, not a sector: find the first, in one readback.
    const [row, bad] = Array.from(await negativeProgram({ hidden: Boolean(input.valid) })({
      value: value.ref, ...(input.valid ? { valid: input.valid.ref } : {}),
    }).data(), Number);
    if (row < n)
      throw Error(`Pie value ${typeof config.value === "string" ? `"${config.value}" ` : ""}must be nonnegative: row ${row} is ${bad}.`);
    const groups = config.by !== undefined ? await inputGroups(cache, input, config.by) : null;
    if (groups) cleanup(() => groups.dispose());
    const sort = config.sort ?? "none";
    let category = null, lookup = null;
    if (Array.isArray(sort)) {
      category = comparisonColumn(scope, config.category, own);
      if (!category.map) throw Error("Pie sort by a category order needs a categorical category column.");
      // Each category's rank in the list (unlisted ones after, in row order), then the missing.
      lookup = [...[...category.map.keys()].map((v) => {
        const i = sort.indexOf(v);
        return i < 0 ? sort.length : i;
      }), sort.length];
    }
    const start = config.startAngle ?? 0,
      span = Math.max(-360, Math.min(360, (config.endAngle ?? 360) - start));
    const plan = {
      sort: Array.isArray(sort) ? "list" : sort,
      hidden: Boolean(input.valid),
      grouped: Boolean(groups),
      count: groups?.count ?? 1,
    };
    // Every number reaches the program from one buffer: new angles or radii compile nothing.
    const params = deviceArray([start, span, config.padAngle ?? 0, span < 0 ? -1 : 1, inner, outer, config.turn ?? 360]);
    const out = pieProgram(plan)({
      value: value.ref,
      params,
      ...(input.valid ? { valid: input.valid.ref } : {}),
      ...(groups ? { codes: groups.codes.ref } : {}),
      ...(category ? { category: category.array.ref, lookup: deviceArray(lookup) } : {}),
    });
    const columns = Object.fromEntries(names.map((name, i) => [name, own(out.ref.slice([], i))]));
    out.dispose();
    if (config.label !== undefined)
      columns.__pieLabel = await labelColumn(config, scope, columns, value, own, cleanup, evaluator);
    columns.__pieTextRadius = await textRadius(config, scope, columns, n, own);
    // Which rows are visible sets the totals: the values follow the mask.
    return { columns, followsMask: true };
  },
};

/**
 * The label text as a dictionary column: "value" the value, "percent" the share, any other a
 * numeric column (or expression) of the rows, formatted with `labelFormat` (d3-format). Reads
 * the numbers back: pies have few rows.
 */
async function labelColumn(config, scope, columns, value, own, cleanup, evaluator) {
  const { label, labelFormat } = config;
  const source = label === "percent" ? columns.__pieShare
    : label === "value" ? value : numbers(scope, label, value.shape[0], own, cleanup, evaluator);
  const read = Array.from(await source.ref.data(), Number);
  const text = format(labelFormat ?? (label === "percent" ? ".0%" : ",.7~r"));
  const categories = [], index = new Map();
  const codes = Int32Array.from(read, (number) => {
    // A row that draws nothing has no text (its centroid is missing too).
    const string = Number.isFinite(number) ? text(number) : "";
    if (!index.has(string)) index.set(string, categories.push(string) - 1);
    return index.get(string);
  });
  return { codes: own(np.array(codes, { dtype: np.int32 })), categories };
}

/**
 * The labels' radius column: each label at its centroid's radius, except that one whose box
 * would overlap a label already placed is hidden (NaN). Larger shares are placed first. A box is
 * the text's estimated width (0.6 em a character) by 1 em, in radius units (`labelSize` is the
 * font size in them), centered on the centroid. Without labelText and labelSize, every label
 * shows. Reads the centroids back: pies have few rows.
 */
async function textRadius(config, scope, columns, n, own) {
  const { labelText, labelSize } = config;
  if (labelText === undefined || !(labelSize > 0)) return own(columns.__pieRadius.ref);
  const [angle, radius, share] = await Promise.all(["__pieAngle", "__pieRadius", "__pieShare"]
    .map(async (name) => Array.from(await columns[name].ref.data(), Number)));
  const text = await labelStrings(labelText === "__pieLabel" ? columns.__pieLabel : scope.resolve(labelText), n);
  const toRadians = (2 * Math.PI) / (config.turn ?? 360), placed = [], out = new Float32Array(n).fill(NaN);
  const order = [...Array(n).keys()].filter((i) => Number.isFinite(angle[i]) && Number.isFinite(radius[i]) && text[i])
    .sort((a, b) => share[b] - share[a] || a - b);
  for (const i of order) {
    const box = { x: radius[i] * Math.cos(angle[i] * toRadians), y: radius[i] * Math.sin(angle[i] * toRadians),
      half: 0.3 * text[i].length * labelSize };
    if (placed.some((p) => Math.abs(p.x - box.x) < p.half + box.half && Math.abs(p.y - box.y) < labelSize)) continue;
    placed.push(box);
    out[i] = radius[i];
  }
  return own(np.array(out));
}

/** A label column's text per row ("" for none): a dictionary, strings or numbers. */
async function labelStrings(column, n) {
  if (column?.codes !== undefined) {
    const codes = column.codes instanceof JaxArray ? await column.codes.ref.data() : column.codes;
    return Array.from(codes, (code) => (code >= 0 ? String(column.categories[code] ?? "") : ""));
  }
  const values = column instanceof JaxArray ? Array.from(await column.ref.data()) : column ? Array.from(column) : [];
  return Array.from({ length: n }, (_, i) => (values[i] == null || Number.isNaN(values[i]) ? "" : String(values[i])));
}

/** A numeric column, or an expression evaluated over the `n` rows read. The run owns it. */
function numbers(scope, field, n, own, cleanup, evaluator) {
  if (!isExpression(field)) return own(numericColumn(scope, field));
  const evaluated = evaluateTransientExpression(field, scope, { rowCount: n, evaluator });
  cleanup(evaluated.dispose);
  return own(asArray(evaluated.value));
}

/** [the first shown row with a negative value (n if none), its value]: one readback. */
function negativeKernel(plan, { value, valid }) {
  const n = value.shape[0];
  const negative = valid ? np.logicalAnd(value.ref.less(0), valid.greater(0)) : value.ref.less(0);
  const row = np.min(np.where(negative, np.arange(n).astype(np.float32), n));
  const at = np.take(value, np.minimum(row.ref, n - 1).astype(np.int32), 0);
  return np.stack([row, at]);
}
const NEGATIVE = new Map();
const negativeProgram = (plan) => planProgram(NEGATIVE, plan, negativeKernel);

/**
 * PieGeometry's device work for a plan (one compiled program per plan): the sectors of every
 * group at once. Rows sort by `sort` (a stable sort), then by group, so each group's rows are a
 * run; one segmented scan gives each row the total and count of the drawn rows before it in its
 * run, and a histogram each group's total and count. Returns [n, 7]: start, end, inner, outer,
 * mid angle, mid radius, share, in row order. Consumes `inputs`.
 * params: start, span (degrees, d3's convention), pad, direction (the span's sign), inner and
 * outer radius, the frame's units per turn.
 */
function pieKernel(plan, { value, valid, codes, category, lookup, params }) {
  const n = value.shape[0], count = plan.count;
  const p = (i) => params.ref.slice(i);
  const finiteValue = np.isfinite(value.ref);
  const shown = valid ? np.logicalAnd(finiteValue, valid.greater(0)) : finiteValue;
  const group = codes ?? np.zeros([n], { dtype: np.int32 });
  // Rows in no group (a missing `by` value) draw nothing.
  const drawn = np.logicalAnd(shown, group.ref.greaterEqual(0));
  let order = null;
  if (plan.sort === "asc" || plan.sort === "desc")
    order = np.argsort(np.where(drawn.ref, plan.sort === "asc" ? value.ref : value.ref.mul(-1), Infinity));
  else if (plan.sort === "list")
    order = np.argsort(np.take(lookup, np.where(np.isfinite(category.ref), category, lookup.shape[0] - 1).astype(np.int32), 0));
  const inOrder = order ?? np.arange(n).astype(np.int32);
  const key = np.where(drawn.ref, group.ref, count).astype(np.int32);
  const rows = np.take(inOrder, np.argsort(np.take(key.ref, inOrder.ref, 0)), 0);
  const keys = np.take(key, rows.ref, 0);
  const member = np.logicalAnd(drawn.ref, value.ref.greater(0));
  const weight = np.where(member.ref, value, 0), ones = member.astype(np.float32);
  // Each group's total and (for d3's pad, without rings) its number of drawn rows.
  const code = np.where(drawn.ref, group, -1).astype(np.int32);
  const [totals, numbers] = histogramRows(code, plan.grouped ? [weight] : [weight, ones], count);
  code.dispose();
  const v = np.take(weight, rows.ref, 0), m = np.take(ones, rows.ref, 0),
    isDrawn = np.take(drawn, rows.ref, 0);
  const keyFloat = keys.ref.astype(np.float32);
  const scanned = segmentedScan(np.stack([v.ref, m.ref], 1), keyFloat);
  keyFloat.dispose();
  const ring = np.minimum(keys, count - 1);
  const total = np.take(totals, ring.ref, 0);
  // As d3.pie: the pad is at most the span shared among the drawn rows, and each drawn row's
  // share of what the pads leave.
  let a0, a1, b0, b1;
  if (plan.grouped) {
    // Rings: each sector's pad comes out of its own share (at most half of it), so a ring's
    // sectors start and end where the inner sectors whose values they sum do (a sunburst).
    const k = np.where(total.ref.greater(0), p(1).div(np.maximum(total.ref, 1e-30)), 0);
    a0 = p(0).add(scanned.slice([], 0).sub(v.ref).mul(k.ref));
    const width = v.ref.mul(k);
    a1 = a0.ref.add(width.ref);
    const half = np.minimum(p(2), np.abs(width).mul(0.5)).mul(p(3)).mul(m).mul(0.5);
    b0 = a0.ref.add(half.ref);
    b1 = a1.ref.sub(half);
  } else {
    const number = np.take(numbers, ring.ref, 0);
    const pad = np.minimum(np.abs(p(1)).div(np.maximum(number.ref, 1)), p(2)).mul(p(3));
    const k = np.where(total.ref.greater(0), p(1).sub(number.mul(pad.ref)).div(np.maximum(total.ref, 1e-30)), 0);
    const before = scanned.ref.slice([], 0).sub(v.ref), drawnBefore = scanned.slice([], 1).sub(m.ref);
    a0 = p(0).add(before.mul(k.ref)).add(drawnBefore.mul(pad.ref));
    a1 = a0.ref.add(v.ref.mul(k)).add(pad.ref.mul(m.ref));
    const half = pad.mul(0.5).mul(m);
    b0 = a0.ref.add(half.ref);
    b1 = a1.ref.sub(half);
  }
  // d3's angle (degrees, clockwise from 12 o'clock) in the frame's units (counter-clockwise
  // from east): a decreasing map, so the sector's end is its frame start.
  const scale = p(6).div(360);
  const frame = (angle) => np.subtract(90, angle).mul(scale.ref);
  const hidden = np.logicalNot(isDrawn);
  const start = np.where(hidden.ref, NaN, frame(np.maximum(b0.ref, b1.ref)));
  const end = np.where(hidden.ref, NaN, frame(np.minimum(b0, b1)));
  const width = p(5).sub(p(4)).div(count), index = ring.astype(np.float32);
  const base = p(4).add(index.ref.mul(width.ref)), top = base.ref.add(width);
  // Rings are separated as sectors are: by the pad's width at their boundary (radius x angle).
  const gap = p(2).mul(Math.PI / 360);
  const lower = np.where(hidden.ref, NaN, base.ref.add(np.where(index.ref.greater(0), base.mul(gap.ref), 0)));
  const upper = np.where(hidden.ref, NaN, top.ref.sub(np.where(index.less(count - 1), top.mul(gap), 0)));
  const sector = v.ref.greater(0);
  const mid = np.where(sector.ref, frame(a0.add(a1).mul(0.5)), NaN);
  const radius = np.where(sector, lower.ref.add(upper.ref).mul(0.5), NaN);
  const share = np.where(hidden, NaN, v.div(np.maximum(total, 1e-30)));
  scale.dispose();
  params.dispose();
  const sorted = np.stack([start, end, lower, upper, mid, radius, share], 1);
  return np.take(sorted, np.argsort(rows), 0);
}
const PROGRAMS = new Map();
/** pieKernel compiled once per plan (utils/programs.js). */
const pieProgram = (plan) => planProgram(PROGRAMS, plan, pieKernel);
