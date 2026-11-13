import { columnName } from "./names.js";
/**
 * A Facet's configuration as one normalized spec (TODO 21 Part F). Pure: no data, no GPU.
 *
 * Four kinds of Facet share one component:
 * - "categorical": row and/or column name categorical columns; one cell per category (pair).
 * - "fold": a single row or column that is the key of the Fold whose output the Facet reads;
 *   one cell per folded field over the Fold's source rows (utils/facets.js partitionFold).
 * - "fields": one cell per listed field over the SAME rows; inside, `value` aliases the cell's
 *   field and `field` holds its name. An array lays the cells along columns ({column: [...]}
 *   is the explicit form), {row: [...]} stacks them; a categorical split may take the OTHER
 *   dimension (fields x species).
 * - "pairs": a scatterplot matrix; each cell aliases `x` and `y` to its two fields. One list
 *   gives a square matrix (triangle, diagonal), {x: [...], y: [...]} a rectangular one
 *   (columns from x, rows from y).
 *
 * Messages are templates: `{name}` is replaced by a value of that name (python/hmplot
 * formats them the same way from registry.json).
 */
export const FACET_TRIANGLES = Object.freeze(["full", "upper", "lower"]);

export const FACET_SPEC_ERRORS = Object.freeze({
  required: "Facet requires a row or column field, fields, or pairs.",
  wrap: "Facet wrap takes a positive integer (cells per line) with one facet field, row or column.",
  fields: "Facet fields takes a nonempty list of distinct column names, or {row: [...]} or {column: [...]}.",
  fieldsDimension:
    'Facet fields lays its cells out along {dimension}s, so it cannot combine with {dimension}="{field}"; use fields={{{other}: [...]}} or {other}="{field}".',
  pairs: "Facet pairs takes a nonempty list of distinct column names, or {x: [...], y: [...]}.",
  pairsCombine: "Facet pairs cannot combine with row, column, or fields.",
  triangle: "Facet triangle must be full, upper, or lower.",
  triangleXY: "Facet triangle applies to pairs={[...]} (one list); with {x, y} lists only diagonal applies.",
  diagonal: "Facet diagonal must be true or false.",
  pairsOnly: "Facet triangle and diagonal apply only with pairs.",
  as: "Facet as renames the value/field aliases (fields) or x/y (pairs).",
  asNames: 'Facet as names must be distinct, nonempty, and not start with "@".',
  pairOrder: "Pair facet order must contain distinct selected fields.",
  order: "Facet order must contain unique category values.",
  pairsNumeric: 'Facet pairs requires numeric columns; "{field}" is not one.',
  missingField: 'Facet {prop}: the data has no column "{field}".',
});

/** A message of FACET_SPEC_ERRORS with its `{name}` placeholders filled from `values`. */
export function facetError(id, values = {}) {
  return FACET_SPEC_ERRORS[id].replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match);
}

const fail = (id, values) => {
  throw Error(facetError(id, values));
};
const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nameList = (value) =>
  Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && v.length > 0) &&
  new Set(value).size === value.length;

/** The alias names inside the cells: defaults, renamed by `as`. */
function aliasNames(kind, as) {
  const names = kind === "fields" ? { value: "value", field: "field" } : { x: "x", y: "y" };
  if (as === undefined) return names;
  if (!isPlainObject(as) || Object.keys(as).some((key) => !Object.hasOwn(names, key))) fail("as");
  for (const [key, value] of Object.entries(as)) {
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.length || value.startsWith("@")) fail("asNames");
    names[key] = value;
  }
  if (new Set(Object.values(names)).size !== Object.keys(names).length) fail("asNames");
  return names;
}

function checkWrap(wrap, dimensions) {
  if (wrap !== undefined && (!Number.isInteger(wrap) || wrap < 1 || dimensions > 1)) fail("wrap");
}

/**
 * Normalize a Facet's structural props. Throws the first configuration error (texts in
 * FACET_SPEC_ERRORS). `fold` is the Fold descriptor of the scope when the scope is that Fold's
 * own output.
 */
export function normalizeFacetSpec(
  { row, column, wrap, rowOrder, columnOrder, fields, pairs, triangle, diagonal, as } = {},
  { fold = null } = {},
) {
  // col.species names the column as "species" does (R2.0).
  row = columnName(row, "Facet.row") || null;
  column = columnName(column, "Facet.column") || null;
  if (Array.isArray(fields)) fields = columnName(fields, "Facet.fields");
  else if (fields && typeof fields === "object")
    fields = Object.fromEntries(Object.entries(fields).map(([key, list]) => [key, columnName(list, `Facet.fields.${key}`)]));
  const base = { row, column, rowOrder, columnOrder, wrap, fields: null, pairs: null, fold: null, names: null };
  if (pairs !== undefined) {
    if (row || column || fields !== undefined) fail("pairsCombine");
    let x, y, square;
    if (Array.isArray(pairs)) {
      if (!nameList(pairs)) fail("pairs");
      x = y = [...pairs];
      square = true;
    } else {
      if (!isPlainObject(pairs) || Object.keys(pairs).some((key) => key !== "x" && key !== "y") ||
          !nameList(pairs.x) || !nameList(pairs.y)) fail("pairs");
      x = [...pairs.x];
      y = [...pairs.y];
      square = false;
      if (triangle !== undefined) fail("triangleXY");
    }
    if (triangle !== undefined && !FACET_TRIANGLES.includes(triangle)) fail("triangle");
    if (diagonal !== undefined && typeof diagonal !== "boolean") fail("diagonal");
    checkWrap(wrap, 2);
    return {
      ...base, row: null, column: null, kind: "pairs",
      pairs: { x, y, triangle: triangle ?? "full", diagonal: diagonal ?? true, square },
      names: aliasNames("pairs", as),
      splitRow: true, splitColumn: true, defaultScales: "field", defaultLayout: "grid",
    };
  }
  if (triangle !== undefined || diagonal !== undefined) fail("pairsOnly");
  if (fields !== undefined) {
    let dimension, list;
    if (Array.isArray(fields)) [dimension, list] = ["column", fields];
    else if (isPlainObject(fields) && Object.keys(fields).length === 1 &&
        (Object.hasOwn(fields, "row") || Object.hasOwn(fields, "column")))
      [[dimension, list]] = Object.entries(fields);
    else fail("fields");
    if (!nameList(list)) fail("fields");
    const other = dimension === "row" ? "column" : "row", split = dimension === "row" ? row : column;
    if (split) fail("fieldsDimension", { dimension, other, field: split });
    const order = dimension === "row" ? rowOrder : columnOrder;
    if (order !== undefined && (!Array.isArray(order) || new Set(order).size !== order.length)) fail("order");
    checkWrap(wrap, (row || column) ? 2 : 1);
    return {
      ...base, kind: "fields",
      fields: { dimension, list: [...list] },
      names: aliasNames("fields", as),
      splitRow: dimension === "row" || Boolean(row), splitColumn: dimension === "column" || Boolean(column),
      defaultScales: "field", defaultLayout: "grid",
    };
  }
  if (as !== undefined) fail("as");
  if (!row && !column) fail("required");
  checkWrap(wrap, row && column ? 2 : 1);
  const folded = fold && !(row && column) && (row || column) === fold.key &&
    new Set(fold.fields).size === fold.fields.length;
  return {
    ...base, kind: folded ? "fold" : "categorical", fold: folded ? fold : null,
    splitRow: Boolean(row), splitColumn: Boolean(column), defaultScales: "shared", defaultLayout: "bands",
  };
}

/** normalizeFacetSpec without throwing: {spec, error} (error "" when valid). */
export function tryNormalizeFacetSpec(config, options) {
  try {
    return { spec: normalizeFacetSpec(config, options), error: "" };
  } catch (error) {
    return { spec: null, error: error.message };
  }
}

/**
 * The cells of a pairs spec before any data: {x, y, row, column} in row-major order (rows
 * from y, columns from x), with 1-based gridRow/gridColumn. `rowOrder`/`columnOrder` pick and
 * order the y/x lists.
 */
export function pairCells({ x, y, triangle = "full", diagonal = true, square = true }, { rowOrder, columnOrder } = {}) {
  for (const [order, list] of [[rowOrder, y], [columnOrder, x]])
    if (order !== undefined && (!Array.isArray(order) || new Set(order).size !== order.length ||
        order.some((k) => !list.includes(k)))) fail("pairOrder");
  const rows = rowOrder ?? y, cols = columnOrder ?? x;
  // Triangles compare positions in the ORIGINAL lists, so reordering moves cells, not the
  // shape.
  const cells = [];
  for (const yField of rows)
    for (const xField of cols) {
      const i = y.indexOf(yField), j = x.indexOf(xField);
      if (!diagonal && xField === yField) continue;
      if (square && ((triangle === "upper" && i > j) || (triangle === "lower" && i < j))) continue;
      cells.push({ x: xField, y: yField, row: yField, column: xField,
        gridRow: rows.indexOf(yField) + 1, gridColumn: cols.indexOf(xField) + 1 });
    }
  return { cells, rows, columns: cols };
}
