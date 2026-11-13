import {
  expressionFields,
  expressionDescriptor,
  expressionTweens,
} from "./expressions.js";
import { expressionEvaluator, evaluateTransientExpression } from "./expressionPlans.js";
import { numpy as np } from "@hmplot/jax";
import { tweenHandler } from "./tweenState.js";
import { asArray } from "./data.js";
import { viewState, viewStateKey, isViewStateField } from "./viewState.js";
import { interactionVersion } from "./interaction.js";
import { nodeField } from "./names.js";

/** Numeric layout inputs stay on the device. Expression evaluation owns tween state;
 * layouts consume current arrays, as downstream transforms do. */
export function layoutInput(
  value,
  scope,
  key,
  { cache, time = 0, landed = false, moving, correspondence = null } = {},
) {
  const state = viewState({ time });
  const evaluator = cache ? expressionEvaluator(cache) : undefined;
  const options = {
    evaluator,
    viewState: state,
    tween: cache
      ? tweenHandler({
          cache,
          scope,
          correspondence,
          time,
          root: value,
          prefix: key,
          landed,
          moving,
        })
      : undefined,
  };
  // A root tween's target changes with its inputs, not with interpolation time. Reuse
  // that target between dependency changes instead of rebuilding its expression each tick.
  // Nested/upstream tweens still evaluate at the current time through the ordinary path.
  const target = value?.op === "tween" ? value.args[0] : value;
  const versioned = [...expressionFields(target, new Set(typeof target === "string" ? [target] : []))]
    .every((field) => !field.startsWith("@") || isViewStateField(field) ||
      scope.interactionResource?.(field.replace(/^@any_/, "@")));
  if (cache && versioned && !expressionTweens(target).length) {
    const identity = [...layoutDependencies(target, scope), JSON.stringify(viewStateKey([target], state))];
    const name = `__layoutInput/${key}`, previous = cache.get(name);
    let held = previous;
    if (!held || identity.length !== held.identity.length ||
        !identity.every((entry, i) => Object.is(entry, held.identity[i]))) {
      const result = evaluateTransientExpression(target, scope, options);
      try {
        held = { identity, value: asArray(result.value), dispose() { this.value.dispose(); } };
        previous?.dispose();
        cache.set(name, held);
      } finally { result.dispose(); }
    }
    if (value?.op !== "tween") return held.value.ref;
    const owned = [];
    try {
      const result = options.tween(value, { value: held.value, metadata: { type: "numeric" } },
        (array) => (owned.push(array), array));
      return asArray(result.value);
    } finally { owned.forEach((array) => array.dispose()); }
  }
  const result = evaluateTransientExpression(value, scope, options);
  try {
    return asArray(result.value);
  } finally {
    result.dispose();
  }
}

/** Validate targets on dependency changes, never read moving coordinates each frame.
 * Only a single invalid-value flag reaches the host, rather than the input column. */
export async function validateLayoutInput(value, scope, label, cache) {
  const key = layoutDependencies(value, scope);
  const name = `__validate/${label}`,
    old = cache?.get(name);
  if (
    old?.key.length === key.length &&
    key.every((value, i) => Object.is(value, old.key[i]))
  )
    return;
  const field = typeof value === "string" ? value : nodeField(value);
  if (field && scope.columnFact) {
    const current = scope.get(field), shape = current?.shape;
    // A certificate cannot bypass shape/type validation, and unsupported or false
    // certificates fall back to the actual current values without assuming safety.
    if (shape?.length === 1 && shape[0] === scope.length &&
        await scope.columnFact(field, "finiteNonnegative")) return;
  }
  const evaluator = cache ? expressionEvaluator(cache) : undefined;
  const result = evaluateTransientExpression(value, scope, { evaluator }),
    array = asArray(result.value);
  try {
    if (array.shape.length !== 1 || array.shape[0] !== scope.length)
      throw Error(
        `Tree ${label} must give one numeric value per row: pass a nonnegative number, column or expression.`,
      );
    const invalid = np.any(
      np.logicalOr(np.logicalNot(np.isfinite(array.ref)), array.ref.less(0)),
    );
    try {
      if (await invalid.ref.js())
        throw Error(
          `Tree ${label} must be nonnegative and finite: pass numeric values >= 0.`,
        );
    } finally {
      invalid.dispose();
    }
    cache?.set(name, { key, dispose() {} });
  } finally {
    array.dispose();
    result.dispose();
  }
}

/** Versions of exactly the fields read, without allocating virtual-column masks. */
export function layoutDependencies(value, scope) {
  const fields = [
    ...expressionFields(
      value,
      new Set(typeof value === "string" ? [value] : []),
    ),
  ];
  return [
    JSON.stringify(expressionDescriptor(value)),
    scope.length,
    ...fields.map((field) => {
      const resource = field.startsWith("@") && scope.interactionResource?.(field.replace(/^@any_/, "@"));
      return field.startsWith("@") ? resource?.version ?? interactionVersion(resource) : scope.get(field);
    }),
  ];
}
