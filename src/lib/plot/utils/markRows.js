/**
 * rows="auto" (TODO 130.1): a mark whose channels read no column draws one item instead of one
 * per row of its data, as a rule at a value or a callout at a point does. View-state fields
 * (@time, @pointer_x, @view_y_min, ...) are not columns; interaction fields (@selected, ...) are
 * per-row, so they are.
 */
import { getContext } from "svelte";
import { isExpression, expressionFields } from "./expressions.js";
import { isLiteral } from "./names.js";
import { isAnimate } from "./animation.js";
import { isViewStateField } from "./viewState.js";
import { createDataScope, DATA_CONTEXT } from "./categorical.js";
import { MAPPING_CONTEXT } from "./mapping.js";
import { FORCE_CONTEXT, layoutBoundary } from "./forceContext.js";

/** Channels a mark reads per row (namedData.js NAMED_FIELDS, without `data`). */
const CHANNELS = ["x", "y", "z", "x0", "x1", "y0", "y1", "z0", "z1", "position", "start", "end", "control1", "control2",
  "previous", "startLower", "endLower", "startUpper", "endUpper", "lower", "upper", "baseline", "depth", "height",
  "xOffset", "yOffset", "dx", "dy", "fill", "color", "size", "width", "opacity", "outlineColor",
  "outlineWidth", "outlineOpacity", "rotation", "text", "surfaceHeight", "shapeField", "edges"];

/**
 * A start or end written as its components ([x, "@view_y_min"]), as the mark composes it
 * (namedData.js composedVector): two or three items, one of them not a number. All numbers are
 * per-row values.
 */
const components = (value) => Array.isArray(value) && value.length >= 2 && value.length <= 3 &&
  value.some((item) => typeof item === "string" || item instanceof Date || isExpression(item) || isLiteral(item)) &&
  value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item) ||
    item instanceof Date || isExpression(item) || isLiteral(item));

/**
 * Whether one channel value reads a column of `scope`: a string naming one of its columns or an
 * interaction field, an expression reading anything but view state, per-row values (an array, a
 * typed or device array, a category column), or, for start and end (`vector`), components of
 * which one does. Constants, times, literals and view-state fields do not.
 */
export function readsColumn(value, scope, vector = false) {
  if (isAnimate(value)) value = /** @type {{value: unknown}} */ (value).value;
  if (value === undefined || value === null || typeof value === "number" || typeof value === "boolean" ||
      value instanceof Date || isLiteral(value)) return false;
  if (typeof value === "string")
    return value.startsWith("@") ? !isViewStateField(value) : scope?.has?.(value) === true;
  if (isExpression(value)) return [...expressionFields(value)].some((field) => !isViewStateField(field));
  if (vector && components(value)) return value.some((item) => readsColumn(item, scope));
  return typeof value === "object";
}

/** Whether a mark with these props, under rows="auto", draws one item: no channel reads a column. */
export const drawsOnce = (props, scope) =>
  !CHANNELS.some((key) => readsColumn(props?.[key], scope, key === "start" || key === "end"));

/** A mark's rows setting: true for "auto", false when unset; anything else is an error. */
export function rowsSetting(kind, props) {
  const rows = props?.rows;
  if (rows !== undefined && rows !== "auto")
    throw Error(`${kind} rows is "auto" (one item when no channel reads a column); received ${JSON.stringify(rows)}.`);
  return rows === "auto";
}

/** Whether a mark's props say domains={false}. */
export const boundDomainless = (props) => props?.domains === false;

/** A mark's props without the options its binding reads itself (domains, rows). */
export const boundProps = (props) =>
  props && ("domains" in props || "rows" in props) ? (({ domains, rows, ...rest }) => rest)(props) : props;

/**
 * A mark's data and layout contexts (called as it initializes). `auto()` returns the mark's
 * props under rows="auto", else false. With no channel reading a column (its own or a Mapping's
 * above it), the data is a table of one row, outside any layout (a Force's); otherwise its
 * parent's, as without rows.
 */
export function markData(auto) {
  const parent = getContext(DATA_CONTEXT), mapping = getContext(MAPPING_CONTEXT);
  let one = null;
  const row = () => {
    if (!one) (one = createDataScope()).update({ __row: [0] });
    return one;
  };
  const once = (scope) => {
    const props = auto();
    if (!props) return false;
    const inherited = Object.assign({}, ...(mapping?.read() ?? []));
    return drawsOnce({ ...inherited, ...props }, scope);
  };
  const context = {
    read() {
      const scope = parent?.read();
      return once(scope) ? row() : scope;
    },
    domainSource: () =>
      auto() && once(parent?.read()) ? null : (parent?.domainSource?.() ?? null),
  };
  // Marks without rows="auto" keep their layout context as it is.
  const force = getContext(FORCE_CONTEXT);
  const layout = force && auto() ? layoutBoundary(force, () => !once(parent?.read())) : force;
  return { context, layout, dispose: () => one?.dispose() };
}
