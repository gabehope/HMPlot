import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import {
  evaluateExpression,
  isExpression,
  REDUCTIONS,
} from "../expressions.js";
import { ORDERED_OPS, columnOptions } from "../columnOperations.js";
import { expression, isColumnNode, nameNode } from "../names.js";
import { lowerBound } from "../numeric/search.js";

/**
 * A transform's columns as reduction expressions over its groups (TODO 137.2): Group's
 * columns={"mean_delay": hm.mean("delay")}, Pivot's value=hm.sum("x"). Each reduction in a
 * column reduces each group's rows (it is rewritten to reduce by the transform's group codes,
 * a hidden column), and the column's value per group is read from one row of the group. One
 * syntax for reductions, Calculate's; every group at once, with no limit on their number
 * (expressions.js: a one-hot pass, or runs of equal codes).
 */

/** The hidden column holding each row's group code: a name no table column can have. */
const GROUP_KEY = "\u0000group";

// Ordered operations read rows in order; a group's value is not one of them.
const describe = (node) =>
  `${node.op}(${typeof node.args[0] === "string" ? JSON.stringify(node.args[0]) : "..."})`;

/** The field a string or column node names, or null. */
export const fieldOf = (item) => {
  const node = typeof item === "string" ? nameNode(item) : item;
  return isColumnNode(node) ? node.args[0] : null;
};

/**
 * `value` with every reduction reducing by the group codes. Throws for a column that has no
 * reduction, a reduction with its own by=, an ordered operation, or a column read outside a
 * reduction (other than `keys`: one value per group). `where` names the column in errors.
 */
function grouped(value, where, keys) {
  let reduces = false;
  const visit = (node, inside) => {
    if (!isExpression(node)) {
      const field = typeof node === "string" ? fieldOf(node) : null;
      if (field !== null && !inside && !keys.has(field))
        throw Error(
          `${where} reads "${field}" outside a reduction, where a group has many values; wrap it in one, such as first("${field}").`,
        );
      return node;
    }
    if (ORDERED_OPS.has(node.op) || node.op === "lookup" || node.op === "row")
      throw Error(
        `${where}: ${describe(node)} is a row operation; compute it in a Calculate before this transform.`,
      );
    if (REDUCTIONS[node.op]) {
      reduces = true;
      const options = node.args.find((item) => item?.__expressionLiteral);
      if (options?.by !== undefined)
        throw Error(
          `${where}: ${describe(node)} has by=, but every reduction here already reduces each group; remove by.`,
        );
      const { __expressionLiteral, ...rest } = options ?? {};
      const args = [
        visit(node.args[0], true),
        columnOptions(node.op, { ...rest, by: GROUP_KEY }),
      ];
      if (options && node.args.length > 2) args.push(visit(node.args[2], true));
      return expression(node.op, args);
    }
    const field = fieldOf(node);
    if (field !== null) {
      if (!inside && !keys.has(field))
        throw Error(
          `${where} reads "${field}" outside a reduction, where a group has many values; wrap it in one, such as first("${field}").`,
        );
      return node;
    }
    if (node.op === "column" || node.op === "state" || node.op === "input")
      return node;
    return expression(
      node.op,
      node.args.map((item) => visit(item, inside)),
    );
  };
  const rewritten = visit(value, false);
  if (!reduces)
    throw Error(
      `${where} needs a reduction, such as mean("x") or count(); got ${JSON.stringify(value)}.`,
    );
  return rewritten;
}

// Rewritten expressions by the caller's, so a column keeps its compiled plan across runs.
const REWRITTEN = new WeakMap();
/** `columns` ({name: expression}) rewritten to reduce by group, checked (see grouped); `reserved`: names the transform writes itself. A name starting with "\u0000" is the transform's own (Pivot's value): errors name the component alone. */
export function groupColumns(columns, component, keys = [], reserved = ["count"]) {
  if (!columns || typeof columns !== "object" || Array.isArray(columns))
    throw Error(
      `${component}: columns must be an object of reductions, such as {mean_x: mean("x")}.`,
    );
  const keySet = new Set(keys);
  return Object.fromEntries(
    Object.entries(columns).map(([name, value]) => {
      if (!name) throw Error(`${component}: a column's name cannot be empty.`);
      if (keySet.has(name) || reserved.includes(name))
        throw Error(
          `${component}: column ${JSON.stringify(name)} would replace ${keySet.has(name) ? "a key" : `the ${name}`} column; name it otherwise.`,
        );
      let cached = isExpression(value) ? REWRITTEN.get(value) : undefined;
      if (!cached?.has(keys.join("\u0000"))) {
        const out = grouped(
          value,
          name.startsWith("\u0000") ? component : `${component} column ${name}`,
          keySet,
        );
        if (isExpression(value)) {
          if (!cached) REWRITTEN.set(value, (cached = new Map()));
          cached.set(keys.join("\u0000"), out);
        }
        return [name, out];
      }
      return [name, cached.get(keys.join("\u0000"))];
    }),
  );
}

/** `scope` with the group codes (int32 [n], lent) as the hidden key column. */
function groupScope(scope, codes, count) {
  const key = { codes, categories: Array.from({ length: count }, (_, i) => i) };
  const wrapped = Object.create(scope);
  wrapped.has = (field) => field === GROUP_KEY || scope.has(field);
  wrapped.get = (field) => (field === GROUP_KEY ? key : scope.get(field));
  wrapped.metadata = (field) =>
    field === GROUP_KEY ? { type: "categorical" } : scope.metadata?.(field);
  wrapped.resolve = (value) =>
    value === GROUP_KEY ? key : scope.resolve(value);
  return wrapped;
}

/**
 * The first row of each group (int32 [count]): the rows sorted by code, and each group's first
 * position by a binary search. Every group 0 .. count - 1 has a row. Borrows `codes`.
 */
export function groupRowsOf(codes, count) {
  // The search is over float32 codes, exact to 2^24.
  if (count > 2 ** 24)
    throw Error(
      `${count} groups is more than a group's row can be found for (16,777,216); group by fewer keys or categories.`,
    );
  const order = np.argsort(codes.ref);
  const sorted = np.take(codes.ref, order.ref, 0).astype(np.float32);
  const groups = np.arange(count).astype(np.float32);
  const starts = lowerBound(sorted, groups);
  sorted.dispose();
  groups.dispose();
  const rows = np.take(
    order,
    np.clip(starts, 0, Math.max(0, codes.shape[0] - 1)).astype(np.int32),
    0,
  );
  return rows;
}

/**
 * Each column of `columns` (rewritten by groupColumns) per group: evaluated over `scope` (its
 * hidden rows reduce to nothing, as in Calculate) with `codes` (int32 [n], lent; every group
 * 0 .. count - 1 has a row) as the groups, then read at each group's first row (`rows`, from
 * groupRowsOf; lent). Returns { columns: {name: owned array or {codes, categories}},
 * columnMetadata }.
 */
export function evaluateGroupColumns(
  columns,
  scope,
  { codes, count, rows, length, evaluator, viewState },
) {
  const keyed = groupScope(scope, codes, count);
  const out = {},
    columnMetadata = {};
  try {
    for (const [name, value] of Object.entries(columns)) {
      const evaluated = evaluateExpression(value, keyed, {
        evaluator,
        rowCount: length,
        viewState,
      });
      try {
        const result = evaluated.value;
        const take = (array) => {
          if (array.shape.length !== 1 || array.shape[0] !== length)
            throw Error(
              `${name}: expected a value per row from its reductions; got shape [${array.shape}].`,
            );
          return np.take(array.ref, rows.ref, 0);
        };
        if (result?.codes instanceof JaxArray)
          out[name] = { ...result, codes: take(result.codes) };
        else if (result instanceof JaxArray) out[name] = take(result);
        else
          throw Error(
            `${name}: expected a value per row from its reductions; got ${typeof result}.`,
          );
        if (evaluated.metadata) columnMetadata[name] = evaluated.metadata;
      } finally {
        evaluated.dispose();
      }
    }
  } catch (error) {
    for (const column of Object.values(out))
      (column?.codes ?? column)?.dispose?.();
    throw error;
  }
  return { columns: out, columnMetadata };
}

/**
 * evaluateGroupColumns for groups that may have no row (a Bin's empty bins): `codes` (int32 [n],
 * lent) is each row's group, -1 for a row in none. A group with no row is NaN (a category
 * column's, -1). Returns { columns: {name: owned array or {codes, categories}}, columnMetadata }.
 */
export function evaluateSparseGroupColumns(
  columns,
  scope,
  { codes, count, length, evaluator, viewState },
) {
  // No rows: every group is empty (the columns are still evaluated, for their kinds and errors).
  const rows = length
    ? groupRowsOf(codes, count)
    : np.zeros([count], { dtype: np.int32 });
  // A group with no row read another group's row: the row's code is not the group's.
  const present = length
    ? np.take(codes.ref, rows.ref, 0).equal(np.arange(count).astype(np.int32))
    : np.zeros([count], { dtype: np.bool });
  try {
    const out = evaluateGroupColumns(columns, scope, {
      codes,
      count,
      rows,
      length,
      evaluator,
      viewState,
    });
    for (const [name, column] of Object.entries(out.columns))
      out.columns[name] =
        column?.codes instanceof JaxArray
          ? {
              ...column,
              codes: np.where(present.ref, column.codes, -1).astype(np.int32),
            }
          : np.where(present.ref, column.astype(np.float32), NaN);
    // A boolean column (any, all) is missing in an empty group: a number, 0, 1 or NaN.
    for (const [name, metadata] of Object.entries(out.columnMetadata))
      if (metadata?.type === "boolean") out.columnMetadata[name] = { type: "numeric" };
    return out;
  } finally {
    rows.dispose();
    present.dispose();
  }
}
