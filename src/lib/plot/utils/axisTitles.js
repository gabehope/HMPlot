/**
 * Axis titles from the plotted column (TODO 21 Part T). An axis's title is an explicit label, a
 * positional categorical scale's label, or the name of the one column its marks plot there;
 * anything else has no title.
 *
 * Votes. Each mark casts one vote per axis: a name (a string), null (it plots unnamed data:
 * an array, a position, an expression: this vetoes), or undefined (it abstains: constants, or
 * nothing on that axis). An axis takes a name when its marks' votes hold exactly one distinct
 * name and no null.
 */
import { isExpression, isLiteral } from "./names.js";
import { columnTitle, isInternalColumnName } from "./axisTitleRules.js";
import { axisChannelValues, UNNAMED } from "./axisColumns.js";
import { drawnDims, isCoordinate } from "./gridModel.js";
export { combineTitles, resolveAxisTitle, explicitAxisLabel, columnTitle } from "./axisTitleRules.js";

/**
 * A compound mark (Bar, BoxPlot, ...) plots internal columns; it provides the votes for its
 * user's channels instead: getContext(AXIS_NAMES_CONTEXT)() -> {x, y, z}.
 */
export const AXIS_NAMES_CONTEXT = Symbol("axis names");

// animate() descriptors (utils/animation.js isAnimate), checked here so compound marks that
// import channelTitle do not pull the animation runtime into their import graph.
const isAnimate = (value) => Boolean(value?.__hmplotAnimate);
// Array values that came from a named column: a named pandas or Polars Series passed as a Python
// channel (TODO 40.1). The scene runtime names them as it resolves the column (scene/resources.js).
const arrayNames = new WeakMap();
/** Name the array `values` (a channel value) after the column it came from. */
export function nameColumnValues(values, name) {
  if (values && typeof values === "object" && typeof name === "string" && name) arrayNames.set(values, name);
}

/**
 * The vote of one channel value: a column's name, the column read by col() / tween(col()),
 * undefined (abstain) for constants, the name of a named array (nameColumnValues), and null for
 * other unnamed data (arrays, typed or jax arrays, {codes, categories}, other expressions).
 */
export function channelTitle(scope, value) {
  if (isAnimate(value)) value = value.value;
  // A tween moves its column, and a cast (as_category("zip"), R2.0) types it: both keep its title.
  while (isExpression(value) && (value.op === "tween" || value.op.startsWith("as_"))) value = value.args[0];
  if (isExpression(value)) {
    if (value.op === "column" && typeof value.args[0] === "string") value = value.args[0];
    else return null;
  }
  if (value === undefined || value === null || typeof value === "number" || typeof value === "boolean" ||
      value instanceof Date || isLiteral(value)) return undefined;
  if (typeof value === "string") return scope?.has?.(value) === false ? undefined : columnTitle(scope, value);
  const name = value && typeof value === "object" ? arrayNames.get(value) ?? value.metadata?.name : undefined;
  return typeof name === "string" && !isInternalColumnName(name) ? name : null;
}

/** One mark's votes: any null -> null, two different names -> null, all abstaining -> undefined. */
function markVote(votes) {
  let name;
  for (const vote of votes) {
    if (vote === undefined) continue;
    if (vote === null) return null;
    if (name !== undefined && name !== vote) return null;
    name = vote;
  }
  return name;
}

/**
 * A mark's votes per axis, {x, y, z}, from the channels its domains read (the channel table of
 * utils/axisColumns.js). A Heatmap or Image drawing a field of a grid table (Interpolate, 2D Density, a
 * Data grid table) takes the names of the dimensions it draws (and, as a surface, the field's name
 * on z); one placed by bounds abstains. GeoJSON abstains.
 */
export function markAxisTitles(kind, props, scope) {
  if (kind === "GeoJSON") return {};
  if (kind === "Heatmap" || kind === "Image") {
    // A grid table's field (TODO 51): the drawn dimensions' names (an Image's colors may be
    // { r, g, b } columns).
    const grid = scope?.grid, fill = props.fill;
    const field = typeof fill === "string" ? scope.has?.(fill) && !isCoordinate(grid, fill) : kind === "Image" && fill && typeof fill === "object";
    if (grid && grid.dims.length >= 2 && field) {
      let drawn;
      try { drawn = drawnDims(grid, props.x, props.y); } catch { return {}; }
      return { x: columnTitle(scope, drawn.x), y: columnTitle(scope, drawn.y),
        ...(props.surfaceMode && typeof fill === "string" ? { z: columnTitle(scope, fill) } : {}) };
    }
    return {};
  }
  const values = axisChannelValues(kind, props), out = {};
  for (const axis of "xyz") {
    const vote = markVote(values[axis].map((value) => (value === UNNAMED ? null : channelTitle(scope, value))));
    if (vote !== undefined) out[axis] = vote;
  }
  return out;
}
