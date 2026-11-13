import { numericColumn, categoryField, categoryColumn } from "../dataView.js";
import { numpy as np } from "@hmplot/jax";
import { add, multiply } from "../expressions.js";
import { inputGroups, fieldTitle } from "./common.js";
import { channelTitle } from "../axisTitles.js";
import { stack } from "./stack.js";

/** How bars that share a category are laid out (TODO 133.2): stacked, side by side, or overlapping. */
export const BAR_ARRANGEMENTS = Object.freeze(["stack", "group", "overlap"]);

const GROUP_NEEDS_SERIES = 'Bar arrange="group" puts each series in its own slot: give fill (or color) a column, such as fill="product".';

/** The orientations BarGeometry takes; "auto" lays bars along the numeric axis. */
export const BAR_ORIENTATIONS = Object.freeze(["auto", "vertical", "horizontal"]);

/**
 * Which of x and y is the bars' value, and which their position (TODO 130.1 orientation="auto"):
 * an explicit orientation, else the one given when only one is, else the numeric one against a
 * categorical one. `scope` is the input (for "auto" with both given).
 */
export function barLayout(config, scope) {
  const orientation = config.orientation ?? "auto";
  let horizontal;
  if (orientation !== "auto") horizontal = orientation === "horizontal";
  else if (config.x === undefined || config.y === undefined) horizontal = config.y === undefined;
  else {
    const cx = categoryField(scope, config.x), cy = categoryField(scope, config.y);
    if (Boolean(cx) === Boolean(cy))
      throw Error('BarGeometry needs exactly one categorical position axis among x and y, or an explicit orientation="vertical" or "horizontal".');
    horizontal = Boolean(cy);
  }
  const [valueAxis, positionAxis] = horizontal ? ["x", "y"] : ["y", "x"];
  return { horizontal, valueAxis, positionAxis, value: config[valueAxis], position: config[positionAxis] };
}

/**
 * BarGeometry (Bar, Lollipop): the same rows, each with its bar's geometry between its value and
 * `baseline` along the value axis, at its position (a category) along the other. Per row, so it
 * reads every row, hidden ones included (no compaction), and not a Filter's bucket: the Bar mark
 * then keeps the Filter's rows and swaps which are hidden.
 *
 * Its outputs are the same whichever way the bars run (orientation-neutral, TODO 130.1), so one
 * mark draws both: `__barX`/`__barY` the bar's center (on the position axis, the position itself,
 * a category column passing through), `__barSizeX`/`__barSizeY` its extent (the span along the
 * value axis, its share of the band across), `__barOffsetX`/`__barOffsetY` its slot's offset in
 * the band, and `__barBaseX`/`__barBaseY` and `__barTipX`/`__barTipY` its ends at the baseline
 * and at the value (a lollipop's stem and head). `__barValue` and `__barBaseline` are the ends
 * along the value axis (connection endpoints).
 *
 * `arrange` lays out bars that share a position: "stack" stacks them from zero, in `series`
 * order, as Stack does (their ends follow the shown rows); "group" puts each `series` in a slot
 * of its own across the band; "overlap" draws each from its baseline. One bar per position draws
 * the same in all three. The series is a column of the input by name; anything else (a CSS color,
 * an {r, g, b} object, an array of colors, as when Bar passes its fill) is no series (TODO
 * 130.2), so a Bar can pass fill ?? color without reading its data.
 */

/** The input's column `series` names, else undefined. */
const seriesColumn = (config, scope) =>
  typeof config.series === "string" && scope.has?.(config.series) ? config.series : undefined;
export const barGeometry = {
  reads: "rows",
  buckets: () => false,
  output: "sameRows",
  // A bar's value and baseline ends are along its value axis (Bar's connection attachments).
  valueAxis: (config, source) => (barLayout(config, source).horizontal ? 0 : 1),
  validate(config) {
    const arrange = config.arrange ?? "overlap";
    if (!BAR_ARRANGEMENTS.includes(arrange))
      throw Error(`Bar arrange is "stack", "group" or "overlap"; received ${JSON.stringify(arrange)}.`);
    if (arrange === "group" && config.series === undefined) throw Error(GROUP_NEEDS_SERIES);
    if (arrange === "stack" && (config.baseline ?? 0) !== 0)
      throw Error('Bar arrange="stack" stacks from zero: leave out baseline, or use arrange="overlap".');
    if (!BAR_ORIENTATIONS.includes(config.orientation ?? "auto"))
      throw Error(`BarGeometry orientation is "auto", "vertical" or "horizontal"; received ${JSON.stringify(config.orientation)}.`);
    if (config.x === undefined && config.y === undefined)
      throw Error("BarGeometry needs y (or x for horizontal bars): the bars' values.");
    const valueAxis = config.orientation === "horizontal" ? "x" : config.orientation === "vertical" ? "y" : null;
    if (valueAxis && config[valueAxis] === undefined)
      throw Error(`BarGeometry orientation="${config.orientation}" reads the bars' values from ${valueAxis}: give ${valueAxis}, or change the orientation.`);
  },
  // Along the value axis its outputs are the value column (a named array's or col()'s too, as a
  // mark's channel), the baseline end the baseline column's, or the value's for a constant
  // baseline; along the other they are the position column; sizes and offsets are unnamed.
  names(config, source) {
    const { valueAxis, positionAxis, value: v, position: p } = barLayout(config, source);
    const value = channelTitle(source, v) ?? null,
      baseline = typeof config.baseline === "string" ? fieldTitle(source, config.baseline) : value,
      position = p === undefined ? null : channelTitle(source, p) ?? null;
    const along = (axis) => axis.toUpperCase(), V = along(valueAxis), P = along(positionAxis);
    return {
      __barValue: value, __barBaseline: baseline,
      [`__bar${V}`]: value, [`__barTip${V}`]: value, [`__barBase${V}`]: baseline,
      [`__bar${P}`]: position, [`__barTip${P}`]: position, [`__barBase${P}`]: position,
      __barSizeX: null, __barSizeY: null, __barOffsetX: null, __barOffsetY: null,
    };
  },
  // A bar drags by its value end; its center moves by half as much; along the position axis it
  // drags its position column (lineage, TODO 38.2).
  lineage(config, source) {
    const { valueAxis, positionAxis, value, position } = barLayout(config, source), baseline = config.baseline ?? 0,
      V = valueAxis.toUpperCase(), P = positionAxis.toUpperCase();
    const along = typeof position === "string"
      ? Object.fromEntries([`__bar${P}`, `__barTip${P}`, `__barBase${P}`].map((key) => [key, { kind: "expr", expression: position }]))
      : {};
    return {
      ...along,
      __barValue: { kind: "expr", expression: value },
      [`__barTip${V}`]: { kind: "expr", expression: value },
      __barBaseline: { kind: "expr", expression: baseline },
      [`__barBase${V}`]: { kind: "expr", expression: baseline },
      [`__bar${V}`]: { kind: "expr", expression: multiply(add(value, baseline), 0.5) },
    };
  },
  async run(input, config, context) {
    const { own, cleanup, cache } = context, arrange = config.arrange ?? "overlap", n = input.length;
    const series = seriesColumn(config, input.scope);
    if (arrange === "group" && series === undefined) throw Error(GROUP_NEEDS_SERIES);
    const { valueAxis, positionAxis, value: valueField, position: positionField } = barLayout(config, input.scope);
    // The position passes through: a category column (or a list of categories, as_category(),
    // col()) keeps its categories, the mark mapping them onto the axis; numbers are positions, a
    // datetime column's keeping its metadata; without one, every bar is at 0.
    const resolved = positionField === undefined ? undefined : input.scope.resolve(positionField);
    const categorical = typeof resolved === "string" || typeof resolved === "boolean"
      ? { categories: [resolved], codes: own(np.zeros([n], { dtype: np.int32 })) }
      : categoryColumn(resolved) ? resolved : null;
    const value = own(numericColumn(input.scope, valueField));
    let base, tip, followsMask = false;
    // Bars at the same position of a column (categories or numbers) stack.
    const stackKey = typeof positionField === "string" && input.scope.has?.(positionField) ? positionField : undefined;
    if (arrange === "stack" && stackKey !== undefined && n) {
      // Stack's ends per position, from zero (positive values up, negative down).
      const { columns } = await stack.run(input, { x: stackKey, y: valueField, series }, context);
      const positive = own(value.ref.greaterEqual(0)),
        low = own(np.minimum(columns.y0.ref, columns.y1.ref)),
        high = own(np.maximum(columns.y0.ref, columns.y1.ref));
      tip = own(np.where(positive.ref, high.ref, low.ref));
      base = own(np.where(positive.ref, low.ref, high.ref));
      // Which rows are shown sets the stacks.
      followsMask = true;
    } else {
      tip = own(value.ref.add(0));
      base = own(numericColumn(input.scope, config.baseline ?? 0));
    }
    const numeric = categorical ? null
      : own(positionField === undefined ? np.zeros([n]) : numericColumn(input.scope, positionField));
    const position = () => (numeric ? own(numeric.ref.add(0)) : categorical);
    const share = Number(config.bandFraction ?? 0.8);
    let size = own(np.full([n], share)), offset = null;
    if (arrange === "group" && n) {
      // Each series a slot of the bar's share of the band, the same slot in every category.
      const groups = await inputGroups(cache, input, series);
      cleanup(() => groups.dispose());
      const slots = Math.max(1, groups.count), width = share / slots;
      offset = own(groups.codes.ref.astype(np.float32).sub((slots - 1) / 2).mul(width));
      size = own(np.full([n], width));
    }
    const V = valueAxis.toUpperCase(), P = positionAxis.toUpperCase();
    const columns = {
      // Connection endpoints attach to a bar's value or baseline end (at: "value" | "baseline").
      __barValue: tip,
      __barBaseline: base,
      [`__bar${V}`]: own(tip.ref.add(base.ref).mul(0.5)),
      [`__barSize${V}`]: own(np.abs(tip.ref.sub(base.ref))),
      [`__barTip${V}`]: own(tip.ref.add(0)),
      [`__barBase${V}`]: own(base.ref.add(0)),
      [`__bar${P}`]: position(),
      [`__barSize${P}`]: size,
      [`__barTip${P}`]: position(),
      [`__barBase${P}`]: position(),
    };
    // Slots within the band only when grouped (the value axis's offset is 0).
    if (offset) Object.assign(columns, { [`__barOffset${V}`]: own(np.zeros([n])), [`__barOffset${P}`]: offset });
    const metadata = typeof positionField === "string" && !categorical ? input.scope.metadata?.(positionField) : null;
    // A datetime value column's ends stay dates (a lollipop's heads on a time axis), unless stacked.
    const valueMetadata = typeof valueField === "string" && arrange !== "stack" ? input.scope.metadata?.(valueField) : null;
    const columnMetadata = metadata?.type === "datetime" || valueMetadata?.type === "datetime" ? {
      ...(metadata?.type === "datetime" ? Object.fromEntries([`__bar${P}`, `__barTip${P}`, `__barBase${P}`].map((key) => [key, metadata])) : {}),
      ...(valueMetadata?.type === "datetime" ? Object.fromEntries([`__bar${V}`, `__barTip${V}`, `__barBase${V}`].map((key) => [key, valueMetadata])) : {}),
    } : undefined;
    return { columns, ...(followsMask ? { followsMask } : {}), ...(columnMetadata ? { columnMetadata } : {}) };
  },
};
