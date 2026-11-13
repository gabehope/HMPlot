import { numpy as np } from "@hmplot/jax";
import {
  evaluateExpression,
  isExpression,
  expressionFields,
} from "./expressions.js";
import { field } from "./names.js";
import { asArray } from "./data.js";
import { defaultInteractionKind } from "./interaction.js";
import { tweenSlots } from "./tweenState.js";
import { createExpressionEvaluator } from "./expressionPlans.js";
import { deviceArray } from "./deviceParams.js";

/**
 * SIMULATE (TODO 42): per-row state stepped at a fixed interval. Each step reads the parent's
 * columns now (col("x")), the state after the previous step (prev("x")), the step in
 * milliseconds ("@dt"), the Simulate's clock ("@time"), inputs, and the Simulate's own rows'
 * interaction flags (@any_brushed, ...: it is their root), and writes the next state. Every
 * update reads the previous state only, so the order of the columns does not matter.
 *
 * State arrays are owned here: a step takes its own reference to each result (`.ref`) and
 * releases the expression's intermediates at once, so a column whose update is its previous value
 * does not share an array the next step would free.
 */
export const PREV = "@prev:";
/** The state column `name` after the previous step. */
export const prev = (name) => {
  if (typeof name !== "string" || !name)
    throw Error(
      `prev() needs a state column's name; received ${JSON.stringify(name)}.`,
    );
  return field(`${PREV}${name}`);
};

/** The state columns an expression reads with prev(). */
export function prevReads(value, output = new Set()) {
  for (const field of expressionFields(
    value,
    new Set(typeof value === "string" ? [value] : []),
  ))
    if (field.startsWith(PREV)) output.add(field.slice(PREV.length));
  return output;
}

const STOP_OPTIONS = ["tolerance", "every", "columns"];
/**
 * The Simulate's configuration, checked: every update names a state column `initial` gives,
 * prev() reads one, and stop's options are known.
 */
export function checkSimulation({
  initial,
  update,
  step,
  stop = undefined,
  maxSteps = 8,
}) {
  if (!initial || typeof initial !== "object" || !Object.keys(initial).length)
    throw Error(
      "Simulate needs initial={...}: each state column's first value.",
    );
  if (!update || typeof update !== "object" || !Object.keys(update).length)
    throw Error("Simulate needs update={...}: each state column's next value.");
  for (const name of Object.keys(update))
    if (!Object.hasOwn(initial, name))
      throw Error(
        `Simulate: update.${name} has no initial value; add initial.${name}.`,
      );
  for (const [name, value] of Object.entries(update))
    for (const read of prevReads(value))
      if (!Object.hasOwn(initial, read))
        throw Error(
          `Simulate: update.${name} reads prev("${read}"), which is not a state column.`,
        );
  if (!(Number.isFinite(step) && step > 0))
    throw Error(
      `Simulate: step must be a positive number of milliseconds; received ${step}.`,
    );
  if (!(Number.isInteger(maxSteps) && maxSteps > 0))
    throw Error(
      `Simulate: maxSteps must be a positive integer; received ${maxSteps}.`,
    );
  if (stop == null) return;
  if (
    typeof stop !== "object" ||
    !(Number.isFinite(stop.tolerance) && stop.tolerance >= 0)
  )
    throw Error(
      "Simulate: stop needs a tolerance, a nonnegative number: stop={{ tolerance: 0.001 }}.",
    );
  for (const key of Object.keys(stop))
    if (!STOP_OPTIONS.includes(key))
      throw Error(
        `Simulate: stop has no option "${key}" (${STOP_OPTIONS.join(", ")}).`,
      );
  if (
    stop.every !== undefined &&
    !(Number.isInteger(stop.every) && stop.every > 0)
  )
    throw Error(
      `Simulate: stop.every must be a positive whole number of steps; received ${stop.every}.`,
    );
  for (const column of stop.columns ?? [])
    if (!Object.hasOwn(initial, column))
      throw Error(
        `Simulate: stop.columns names "${column}", which is not a state column.`,
      );
}

/**
 * The scope an update reads: the parent's columns, prev("name") as the previous state (lent:
 * the state outlives the step), "@dt" as the step, and the Simulate's own rows' interaction
 * flags from `output` (the scope it publishes).
 */
export function stepScope(parent, state, output, dt) {
  const scope = Object.create(parent);
  scope.has = (field) => {
    if (field === "@dt") return true;
    if (field.startsWith(PREV))
      return Object.hasOwn(state, field.slice(PREV.length));
    if (defaultInteractionKind(field)) return Boolean(output?.has(field));
    return parent.has(field);
  };
  scope.get = (field) => {
    if (field === "@dt") return dt;
    if (field.startsWith(PREV)) {
      const name = field.slice(PREV.length);
      if (!Object.hasOwn(state, name))
        throw Error(`Missing state column: ${name}`);
      return state[name];
    }
    if (defaultInteractionKind(field) && output) return output.get(field);
    return parent.get(field);
  };
  // A compiled step reads @dt as a runtime input, not a column (expressionPlans.js).
  scope.scalarInput = (field) =>
    field === "@dt" ? dt : parent.scalarInput?.(field);
  scope.metadata = (field) =>
    field === "@dt" || field.startsWith(PREV)
      ? { type: "numeric" }
      : defaultInteractionKind(field) && output
        ? output.metadata?.(field)
        : parent.metadata?.(field);
  return scope;
}

/** Each expression of `columns` evaluated over `scope`, as owned float arrays of `length` rows. */
export function evaluateColumns(columns, scope, length, where, options = {}) {
  const out = {};
  try {
    for (const [name, expression] of Object.entries(columns)) {
      const evaluated = evaluateExpression(expression, scope, {
        rowCount: length,
        ...options,
      });
      try {
        const value = evaluated.value;
        if (!value || typeof value !== "object" || value.codes)
          throw Error(
            `Simulate: ${where}.${name} must be numeric, one value per row.`,
          );
        // A column read may be the host array the data came in (asArray uploads it once).
        const array = asArray(value);
        if (array.shape?.length !== 1 || array.shape[0] !== length) {
          array.dispose();
          throw Error(
            `Simulate: ${where}.${name} has shape [${array.shape}]; expected [${length}].`,
          );
        }
        out[name] =
          array.dtype === "float32" ? array : array.astype(np.float32);
      } finally {
        evaluated.dispose?.();
      }
    }
    return out;
  } catch (error) {
    disposeState(out);
    throw error;
  }
}

/** Simulate owns one shared expression service. A forest shares intermediates across columns. */
export function createSimulationEvaluator() {
  const evaluator = createExpressionEvaluator();
  return {
    expressions: evaluator,
    stats: evaluator.stats,
    get size() {
      return evaluator.size;
    },
    evaluate(columns, scope, length, options = {}) {
      let result;
      try {
        result = evaluator.prepare(Object.values(columns), scope, {
          ...options,
          rowCount: length,
        });
      } catch {
        return evaluateColumns(columns, scope, length, "update", {
          ...options,
          evaluator,
        });
      }
      const out = {};
      try {
        for (const [index, name] of Object.keys(columns).entries()) {
          const value = result.values[index];
          // Category codes are not positions or velocities (lag or mode of a category column).
          if (result.descriptions?.[index]?.categories)
            throw Error(
              `Simulate: update.${name} must be numeric, one value per row.`,
            );
          if (value.shape.length !== 1 || value.shape[0] !== length)
            throw Error(
              `Simulate: update.${name} has shape [${value.shape}]; expected [${length}].`,
            );
          out[name] =
            value.dtype === "float32"
              ? value.ref
              : value.ref.astype(np.float32);
        }
        return out;
      } catch (error) {
        disposeState(out);
        throw error;
      } finally {
        result.dispose();
      }
    },
    dispose() {
      evaluator.dispose();
    },
  };
}

export function disposeState(state) {
  for (const array of Object.values(state ?? {})) array?.dispose?.();
}

/** How many steps are due: floor(time / step) minus those taken, at most `cap` in one frame. */
export function stepsDue(time, step, taken, cap) {
  return Math.max(0, Math.min(cap, Math.floor(time / step + 1e-9) - taken));
}

/**
 * One token per row of `scope`, for matching state across versions (TODO 42.3), as tween state
 * matches (tweenState.js): through a Filter, Sort or Sample the row's source row, by its key
 * when the data has one, else by its index; a keyed Data scope's rows by key. Null: match by
 * position. Reads a transform's source rows back once per parent change, never per step.
 */
export async function rowTokens(scope) {
  const root = scope?.physical ? scope.parent : scope,
    keys = root?.identity?.tokens ?? null;
  const { slots } = tweenSlots(scope);
  if (!slots) return keys && keys.length === scope.length ? keys : null;
  try {
    const rows = await slots.ref.data();
    return Array.from(rows, (row) => keys?.[row] ?? `row:${row}`);
  } finally {
    slots.dispose();
  }
}

/**
 * `state` moved to new rows (TODO 42.3): a row keeps its state when its key is still there
 * (`from` and `to` are the key tokens, one per row), else by position; new rows take `initial`.
 * Frees `state` and `initial`; returns the new state.
 */
export function remapState(state, initial, from, to) {
  const length = to?.length ?? Object.values(initial)[0]?.shape?.[0] ?? 0;
  let index;
  if (from && to) {
    const at = new Map(from.map((token, i) => [token, i]));
    index = to.map((token) => at.get(token) ?? -1);
  } else {
    const old = Object.values(state)[0]?.shape?.[0] ?? 0;
    index = Array.from({ length }, (_, i) => (i < old ? i : -1));
  }
  const at = deviceArray(index, { dtype: "int32" });
  const out = {};
  try {
    const safe = np.maximum(at.ref, 0),
      kept = at.ref.greaterEqual(0);
    for (const [name, fresh] of Object.entries(initial)) {
      const old = state[name];
      out[name] =
        old && old.shape[0] > 0
          ? np.where(kept.ref, np.take(old.ref, safe.ref, 0), fresh.ref)
          : fresh.ref;
    }
    safe.dispose();
    kept.dispose();
  } finally {
    at.dispose();
    disposeState(state);
    disposeState(initial);
  }
  return out;
}

/** The largest absolute change of `columns` between two states: one scalar, one read-back. */
export async function largestChange(before, after, columns) {
  let largest = null;
  for (const name of columns) {
    if (!before[name] || !after[name]) continue;
    const change = np.max(np.abs(after[name].ref.sub(before[name].ref)));
    largest = largest ? np.maximum(largest, change) : change;
  }
  if (!largest) return 0;
  try {
    return Number((await largest.ref.data())[0]);
  } finally {
    largest.dispose();
  }
}

/** Whether an update reads the Simulate's own rows' interaction flags. */
export const readsInteraction = (update) =>
  Object.values(update ?? {}).some((value) =>
    [
      ...expressionFields(
        value,
        new Set(typeof value === "string" ? [value] : []),
      ),
    ].some((field) => Boolean(defaultInteractionKind(field))),
  );
