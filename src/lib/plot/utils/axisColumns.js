/**
 * Which columns a mark plots on each axis (TODO 21 F3). One channel table, the channel sets of
 * namedMark's domain loop, serves a Facet's scales="field" grouping (and, later, axis titles).
 */
import { isExpression, isLiteral } from "./names.js";
import { unionDomains } from "./markDomains.js";

/** A channel that plots data without naming a column: a position array, start/end, raw arrays. */
export const UNNAMED = Symbol("unnamed");
/** The identity given to an expression or a column no scope names: a value derived in the cell. */
export const DERIVED = "derived:expression";

/**
 * The channel values `kind` plots on each axis, from its props (after animate() unwrapping):
 * props[a], a0, a1, and on the value axis (`props.axis ?? "y"`) lower/upper/baseline; a Area
 * with axis="x" swaps them (lower/upper on x, its `x` on y). `position` replaces them and,
 * with start/end/control1/control2, counts as UNNAMED on every axis.
 */
export function axisChannelValues(kind, props) {
  const valueAxis = props.axis ?? "y", out = {};
  for (const axis of "xyz") {
    let values;
    if (props.position !== undefined) values = [UNNAMED];
    else if (kind === "Area" && props.axis === "x")
      values = axis === "x" ? [props.lower, props.upper] : axis === "y" ? [props.x] : [];
    else
      values = [props[axis], props[axis + "0"], props[axis + "1"],
        ...(axis === valueAxis ? [props.lower, props.upper, props.baseline] : [])];
    if (kind === "ErrorBars" && props.position !== undefined && axis === valueAxis) values.push(props.lower, props.upper);
    for (const end of ["start", "end", "control1", "control2"]) if (props[end] !== undefined) values.push(UNNAMED);
    out[axis] = values.filter((value) => value !== undefined);
  }
  return out;
}

/**
 * The column identity one channel value plots: a column's identity (through aliases), the
 * column read by col() / tween(col()), DERIVED for other expressions and columns without an
 * owner, and null for constants and unnamed data (arrays, {codes, categories}, position).
 */
export function channelIdentity(scope, value) {
  while (isExpression(value) && value.op === "tween") value = value.args[0];
  if (isExpression(value)) {
    if (value.op === "column" && typeof value.args[0] === "string") value = value.args[0];
    else return DERIVED;
  }
  if (typeof value === "string") return scope?.has?.(value) ? (scope.columnIdentity?.(value) ?? DERIVED) : null;
  return null;
}

/** Per axis, the identities `kind` plots (channelIdentity of axisChannelValues). */
export function axisColumnIdentities(scope, kind, props) {
  return Object.fromEntries(Object.entries(axisChannelValues(kind, props)).map(([axis, values]) =>
    [axis, values.map((value) => (value === UNNAMED || isLiteral(value) ? null : channelIdentity(scope, value)))]));
}

/**
 * The scales="field" group of one identity a mark plots on dimension `d` of a cell (F-D8):
 * one of the facet's fields (an alias or the column itself) -> "field:<f>", shared across the
 * cells and across x/y; an input column -> "shared:<d>"; a constant or unnamed data (null) ->
 * "shared:<d>"; anything else (derived inside the cell, no owner) -> the cell's field on
 * that axis, else "shared:<d>".
 */
export function fieldScaleGroup(identity, d, cell, { fieldIdentities, inputIdentities }) {
  if (identity === null) return `shared:${d}`;
  if (fieldIdentities?.has(identity)) return `field:${fieldIdentities.get(identity)}`;
  if (inputIdentities?.has(identity)) return `shared:${d}`;
  return cellGroup(cell, d);
}

const cellGroup = (cell, d) => {
  const field = cell?.axisFields?.[d] ?? cell?.field;
  return field !== undefined && field !== null ? `field:${field}` : `shared:${d}`;
};

/**
 * Every cell's axis domains under scales="field": `entries` are the registered domains
 * ({cell, axis: "<frame prefix>:<d>", bounds, columns}: `columns` the identities the mark plots
 * on that axis, undefined when unknown), `cells` the facet's cells by key, `meta` the
 * partition's fieldIdentities/inputIdentities. Groups are per frame prefix; a cell axis takes
 * the union of its groups' extents (a cell with no entry on an axis, its fallback group's).
 * Returns Map<cell key, Map<axis, [min, max]>>.
 */
export function fieldScaleDomains(entries, cells, meta) {
  const extents = new Map(), groupsOf = new Map(), axes = new Set();
  const split = (axis) => {
    const at = axis.lastIndexOf(":");
    return [axis.slice(0, at + 1), axis.slice(at + 1)];
  };
  for (const entry of entries) {
    // A mark that draws nothing (markDomains.js emptyDomain) sets no group's extent.
    if (!entry.bounds || entry.bounds.empty) continue;
    const [prefix, d] = split(entry.axis), cell = cells.get(entry.cell);
    axes.add(entry.axis);
    const groups = entry.columns === undefined ? [cellGroup(cell, d)]
      : entry.columns.length ? entry.columns.map((identity) => fieldScaleGroup(identity, d, cell, meta)) : [`shared:${d}`];
    const key = entry.cell + "\u0000" + entry.axis;
    if (!groupsOf.has(key)) groupsOf.set(key, new Set());
    for (const group of groups) {
      const id = prefix + "\u0000" + group, extent = extents.get(id);
      extents.set(id, unionDomains(extent ? [extent, entry.bounds] : [entry.bounds]));
      groupsOf.get(key).add(id);
    }
  }
  const result = new Map();
  for (const [key, cell] of cells)
    for (const axis of axes) {
      const [prefix, d] = split(axis);
      const groups = groupsOf.get(key + "\u0000" + axis) ?? [prefix + "\u0000" + cellGroup(cell, d)];
      let bounds = null;
      for (const id of groups) {
        const extent = extents.get(id);
        if (extent) bounds = unionDomains(bounds ? [bounds, extent] : [extent]);
      }
      if (!bounds) continue;
      if (!result.has(key)) result.set(key, new Map());
      result.get(key).set(axis, bounds);
    }
  return result;
}
