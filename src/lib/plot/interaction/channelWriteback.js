/** Resolve a dragged channel back to a writable source column, then invert its operators.
 * Paths borrow scopes and authored expressions; dragSession owns its captured host values.
 * This is the write direction, separate from source-row provenance and offset dependencies. */
import { isExpression, REDUCTIONS } from "../utils/expressions.js";
import { isLiteral } from "../utils/categorical.js";
import { isViewStateField } from "../utils/viewState.js";

/**
 * LINEAGE (TODO 38.2): the write direction of a drag. A mark's channel reads a table's column
 * through the channel's own expression and the transforms between the mark and the table;
 * lineage says which column, and how a value of the channel becomes a value of that column.
 * It is computed from configuration (expressions, transform declarations), never from data.
 *
 * - channelPath(value): the column one expression drags and the operators between it and the
 *   result. The dragged column is the one read through moved() or offset(), else the only
 *   column the expression reads; it must appear once, and every operator on its path needs an
 *   inverse (INVERSES below).
 * - resolveColumn(scope, column): from a scope's column back to its table's column. Views a
 *   column passes through (Filter, Sort, a facet cell's alias) change nothing; a column a
 *   transform computes follows that transform's declaration (runner.js puts `step` on its
 *   view: { kind, config, lineage }), and one without a declaration cannot be dragged.
 * - resolveChannel(scope, value): both, as { root, column, steps } or { reason }.
 * - invertPath(path, target, valueOf): the leaf value that gives the result `target`, from
 *   the current values of the path's operators and their arguments (host numbers, read once
 *   when a drag starts).
 *
 * A transform declares its outputs with lineage(config) in its definition:
 *   { kind: "expr", expression }  computed per row (Calculate; BarGeometry's value end);
 *   { kind: "snap", from }        moves by the change in `from` (Bin's assigned edges);
 *   { kind: "fold", fields, key } a Fold's value: row r is field fields[key] of its source row;
 *   { kind: "joined" }            a Join's column, from another table (no drag moves it);
 *   { kind: "reduce", policy, op, field } an aggregate of `field` over a group's members:
 *                                 "shift" moves every member by the change (mean, median, a
 *                                 bin's edges), "sum" splits it among them (decision 1).
 * Layouts (Force, Dodge, Tree, ...), counts, densities and quantiles declare nothing.
 */

/**
 * INVERSES (TODO 38.2): how a drag moves an operator's argument. A rule is
 * (target, args, index, current) => value: the value args[index] must take for the operator's
 * result to be `target`, given the current values of every argument (`args`, host numbers) and
 * of the result (`current`). null means no value reaches `target` (a drag there keeps the last
 * valid one). An operator without a rule cannot be dragged through, so that is the default for
 * a new operator. Rules either invert exactly, follow the branch the row is on (abs keeps its
 * sign, sin and cos stay on the monotonic piece around the current value), saturate (clip,
 * minimum and maximum pass the target to their argument, and the result stops at the bound; an
 * argument already past the bound keeps its value while the target stays past it too), or
 * snap through (floor, round: the argument moves by the change in the result, and the result
 * steps). tween and interval pass through to their value.
 */
/** @param {number} t */
const clampUnit = (t) => Math.min(1, Math.max(-1, t));
/** @type {InverseRule} */
const snapThrough = (t, args, index, current) => args[index] + (t - current);
/** @type {InverseRule} */
const passThrough = (t, args, index) => (index === 0 ? t : null);
/** An argument held at a bound (its value past the result) moves only once the target leaves it. */
/** @type {InverseRule} */
const saturate = (t, args, index, current) => {
  const x = args[index];
  return (x > current && t >= current) || (x < current && t <= current) ? x : t;
};
/** x with x^k = t: odd integer powers keep t's sign, others keep the current base's. */
/** @param {number} t @param {number} k @param {number} base */
function powerBase(t, k, base) {
  if (k === 0) return null;
  const odd = Number.isInteger(k) && Math.abs(k) % 2 === 1;
  if (odd) return Math.sign(t) * Math.abs(t) ** (1 / k);
  if (t < 0) return null;
  return (Number.isInteger(k) && base < 0 ? -1 : 1) * t ** (1 / k);
}
/** @typedef {(target: number, args: number[], index: number, current: number) => number | null} InverseRule
 * @type {Readonly<Record<string, InverseRule>>} */
export const INVERSES = Object.freeze({
  add: (t, [a, b], i) => (i === 0 ? t - b : t - a),
  subtract: (t, [a, b], i) => (i === 0 ? t + b : a - t),
  multiply: (t, [a, b], i) => {
    const k = i === 0 ? b : a;
    return k === 0 ? null : t / k;
  },
  // A zero numerator reaches only 0 (or 0 / 0), whatever the denominator.
  divide: (t, [a, b], i) =>
    i === 0 ? t * b : t === 0 || a === 0 ? null : a / t,
  power: (t, [a, b], i) =>
    i === 0
      ? powerBase(t, b, a)
      : a > 0 && a !== 1 && t > 0
        ? Math.log(t) / Math.log(a)
        : null,
  negative: (t) => -t,
  log: (t) => Math.exp(t),
  exp: (t) => (t > 0 ? Math.log(t) : null),
  sqrt: (t) => (t >= 0 ? t * t : null),
  square: (t, [a]) => (t >= 0 ? (a < 0 ? -1 : 1) * Math.sqrt(t) : null),
  abs: (t, [a]) => (t >= 0 ? (a < 0 ? -t : t) : null),
  minimum: saturate,
  maximum: saturate,
  clip: (t, args, index, current) =>
    index === 0 ? saturate(t, args, index, current) : null,
  sin: (t, [a]) => {
    const k = Math.round(a / Math.PI),
      base = Math.asin(clampUnit(t));
    return k * Math.PI + (k % 2 === 0 ? base : -base);
  },
  cos: (t, [a]) => {
    const k = Math.floor(a / Math.PI),
      base = Math.acos(clampUnit(t));
    return k % 2 === 0 ? k * Math.PI + base : (k + 1) * Math.PI - base;
  },
  floor: snapThrough,
  round: snapThrough,
  interval: passThrough,
  tween: passThrough,
});

const leafName = (item) => {
  if (typeof item === "string")
    return item.startsWith("@") ? null : { column: item, leaf: "column" };
  if (!isExpression(item)) return null;
  if (item.op === "column")
    return typeof item.args[0] === "string" && !item.args[0].startsWith("@")
      ? { column: item.args[0], leaf: "column" }
      : null;
  if (item.op === "moved" || item.op === "offset")
    return { column: item.args[0], leaf: item.op };
  return null;
};

/** Every column leaf of an expression, with the path of { node, index } from the root to it. */
function leaves(value, path = [], output = []) {
  const leaf = leafName(value);
  if (leaf) {
    output.push({ ...leaf, node: value, path });
    return output;
  }
  if (!isExpression(value)) return output;
  value.args.forEach((item, index) =>
    leaves(item, [...path, { node: value, index }], output),
  );
  return output;
}

/** The column a channel value drags and the operators on its path, or { reason }. */
export function channelPath(value) {
  const found = leaves(value);
  if (!found.length)
    return {
      reason:
        typeof value === "string" && value.startsWith("@")
          ? `${value} is not a table column`
          : "it reads no table column",
    };
  const offsets = found.filter((entry) => entry.leaf !== "column");
  const named = [
    ...new Set((offsets.length ? offsets : found).map((entry) => entry.column)),
  ];
  if (named.length > 1)
    return {
      reason: `it reads ${named.join(" and ")}; read the one to drag through moved()`,
    };
  const column = named[0];
  const uses = found.filter((entry) => entry.column === column);
  if (uses.length > 1) return { reason: `it reads ${column} more than once` };
  const { path, leaf } = uses[0];
  for (const { node, index } of path) {
    if (REDUCTIONS[node.op])
      return { reason: `${node.op}() reduces over rows` };
    if (node.op === "lookup")
      return { reason: "lookup() reads another row's value" };
    if (!INVERSES[node.op]) return { reason: `${node.op}() has no inverse` };
    if (
      (node.op === "clip" || node.op === "tween" || node.op === "interval") &&
      index !== 0
    )
      return { reason: `it drags a bound of ${node.op}()` };
  }
  return { column, leaf, path };
}

/** A value an operator reads: a host number, or undefined for a literal option. */
function argumentValue(item, valueOf) {
  if (typeof item === "number") return item;
  if (typeof item === "boolean") return Number(item);
  if (isLiteral(item)) return Number(item.value);
  if (typeof item === "string" || isExpression(item)) return valueOf(item);
  return undefined;
}

/**
 * The value the path's leaf must take for the channel to be `target`, or null where no value
 * gets there. `valueOf(node)` gives the current value of an expression node or column name (on
 * the path, and every other argument of an operator on it).
 */
export function invertPath(path, target, valueOf) {
  let t = target;
  for (const { node, index } of path) {
    const args = node.args.map((item) => argumentValue(item, valueOf));
    t = INVERSES[node.op](t, args, index, valueOf(node));
    if (t === null || t === undefined || !Number.isFinite(t)) return null;
  }
  return t;
}

/** The scope a scope stands for when walking: a padded view's physical rows are its view. */
const walkable = (scope) => (scope?.physical ? scope.view : scope);
const kindOf = (scope) =>
  scope?.step?.kind ?? scope?.pipeline?.at(-1)?.kind ?? "a transform";

/**
 * From a scope's column back to its table: { root, column, steps } or { reason }. `steps` go
 * from the scope toward the table, one per column a transform computes: { kind: "expr",
 * scope (where its expression reads), path, leaf } or { kind: "snap", scope, column, from }.
 * A Fold's value gives { kind: "fold", fields, key, branches }, one resolution per field (a
 * row's field is known only from its key).
 */
export function resolveColumn(scope, column) {
  const steps = [];
  let at = walkable(scope);
  while (at) {
    if (at.applyOffsets) {
      if (!at.has(column))
        return { reason: `the table has no column ${column}` };
      // Offsets are numeric deltas in the column's units (a datetime's would be milliseconds).
      const type = at.metadata?.(column)?.type;
      if (type && type !== "numeric")
        return {
          reason: `${column} is a ${type} column; a drag moves numeric columns`,
        };
      // A Simulate's output is a root, but each step computes its state (TODO 42.8).
      if (at.stateColumns?.has(column))
        return {
          reason: `${column} is a Simulate's state, which each step computes`,
        };
      return { root: at, column, steps };
    }
    if (at.snapshotOf) {
      at = walkable(at.snapshotOf);
      continue;
    }
    if (at.aggregate && !at.hasOwnColumn?.(column))
      return { reason: `${column} does not pass through ${kindOf(at)}` };
    if (!at.hasOwnColumn?.(column)) {
      at = walkable(at.parent);
      continue;
    }
    const forwarded = at.forwardedColumn?.(column);
    if (forwarded !== null && forwarded !== undefined) {
      column = forwarded;
      at = walkable(at.parent);
      continue;
    }
    const declared = at.step?.lineage?.[column];
    if (!declared) return { reason: `${column} is computed by ${kindOf(at)}` };
    const parent = walkable(at.parent);
    if (declared.kind === "expr") {
      const path = channelPath(declared.expression);
      if (path.reason)
        return {
          reason: `${kindOf(at)} computes ${column}, and ${path.reason}`,
        };
      steps.push({
        kind: "expr",
        scope: parent,
        column,
        path: path.path,
        leaf: path.leaf,
        expression: declared.expression,
      });
      column = path.column;
    } else if (declared.kind === "snap") {
      steps.push({
        kind: "snap",
        scope: parent,
        view: at,
        column,
        from: declared.from,
      });
      column = declared.from;
    } else if (declared.kind === "reduce") {
      // An aggregate (38.4): the change moves the group's members, so below it only columns
      // that pass through or are renamed (Calculate w = moved("weight")) can follow.
      const below = resolveColumn(parent, declared.field);
      const name = kindOf(at);
      if (below.reason)
        return {
          reason: `${name} reduces ${declared.field}, and ${below.reason}`,
        };
      if (
        below.fold ||
        below.steps.some((step) => step.kind !== "expr" || step.path.length)
      )
        return {
          reason: `${name} reduces ${declared.field}, which is computed; reduce the column a drag should move`,
        };
      steps.push({
        kind: "reduce",
        view: at,
        scope: parent,
        column,
        policy: declared.policy,
        op: declared.op,
        field: declared.field,
      });
      return {
        root: below.root,
        column: below.column,
        steps: [...steps, ...below.steps],
      };
    } else if (declared.kind === "joined") {
      return { reason: `${column} is joined from another table` };
    } else if (declared.kind === "fold") {
      const branches = Object.fromEntries(
        declared.fields.map((field) => [field, resolveColumn(parent, field)]),
      );
      return {
        fold: { fields: declared.fields, key: declared.key, branches },
        steps,
      };
    } else return { reason: `${column} is computed by ${kindOf(at)}` };
    at = parent;
  }
  return { reason: `${column} does not come from a table` };
}

/**
 * The table column a mark's channel value drags, through its own expression and the
 * transforms above the mark: { root, column, steps } (steps[0] is the channel's own
 * expression when it has operators), or { reason }.
 */
export function resolveChannel(scope, value) {
  if (value === undefined || value === null) return { reason: "it is not set" };
  if (typeof value === "string" && isViewStateField(value))
    return { reason: `${value} is view state` };
  const own = channelPath(value);
  if (own.reason) return own;
  const resolved = resolveColumn(scope, own.column);
  if (resolved.reason) return resolved;
  const channel = own.path.length
    ? [
        {
          kind: "expr",
          scope,
          column: null,
          path: own.path,
          leaf: own.leaf,
          expression: value,
        },
      ]
    : [];
  return {
    ...resolved,
    steps: [...channel, ...resolved.steps],
    leaf: own.leaf,
  };
}
