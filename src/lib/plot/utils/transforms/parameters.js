import { evaluateTransientExpression } from "../expressionPlans.js";
import { shapeOf } from "../data.js";
import { parameterVariant } from "../../plugins/parameters.js";
import { isExpression } from "../expressions.js";

async function parameterValue(
  kind,
  prop,
  shape,
  expression,
  scope,
  viewState,
  evaluator,
) {
  // A padded input's physical rows: reductions see its shown rows, and nothing compacts (17.3d).
  const evaluated = evaluateTransientExpression(
    expression,
    scope.padded?.() ?? scope,
    {
      evaluator,
      broadcast: false,
      viewState,
    },
  );
  try {
    const value = evaluated.value?.codes ?? evaluated.value;
    if (shapeOf(value).length)
      throw Error(
        `${kind}.${prop} must be a single value; use a reduction such as count(), mean(), or std().`,
      );
    const number = Number(
      typeof value === "number" ? value : (await value.ref.data())[0],
    );
    if (!Number.isFinite(number))
      throw Error(
        `${kind}.${prop} evaluated to ${number}; it must be a finite number.`,
      );
    // Counts are computed in single precision, where sqrt(400) can land just under 20.
    return shape === "integer" ? Math.round(number) : number;
  } finally {
    evaluated.dispose();
  }
}

/**
 * Replace expression-valued parameters with the numbers they evaluate to, against the
 * transform's input scope. Returns the config unchanged when there are none.
 */
export async function resolveParameterExpressions(
  kind,
  config,
  props,
  scope,
  { evaluator, viewState } = {},
) {
  if (!config || !Object.keys(props).length) return config;
  let resolved = config;
  for (const [prop, shape] of Object.entries(props)) {
    const value = config[prop];
    if (typeof shape === "object") {
      const resolve = async (spec, value, path) => {
        spec = parameterVariant(spec, value);
        if (spec.type === "array" && Array.isArray(value))
          return Promise.all(
            value.map((entry, index) =>
              resolve(spec.items, entry, `${path}[${index}]`),
            ),
          );
        if (spec.type === "object" && value && typeof value === "object") {
          const out = { ...value };
          for (const [key, child] of Object.entries(spec.properties))
            if (Object.hasOwn(value, key))
              out[key] = await resolve(child, value[key], `${path}.${key}`);
          return out;
        }
        if (spec.type === "expression" && isExpression(value))
          return parameterValue(
            kind,
            path,
            spec.integer ? "integer" : "number",
            value,
            scope,
            viewState,
            evaluator,
          );
        return value;
      };
      resolved = { ...resolved, [prop]: await resolve(shape, value, prop) };
    } else if (isExpression(value)) {
      resolved = {
        ...resolved,
        [prop]: await parameterValue(
          kind,
          prop,
          shape,
          value,
          scope,
          viewState,
          evaluator,
        ),
      };
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      // Per-axis parameters: {x: expression, y: 20}.
      let axes = value,
        changed = false;
      for (const [axis, entry] of Object.entries(value))
        if (isExpression(entry)) {
          axes = {
            ...axes,
            [axis]: await parameterValue(
              kind,
              `${prop}.${axis}`,
              shape,
              entry,
              scope,
              viewState,
              evaluator,
            ),
          };
          changed = true;
        }
      if (changed) resolved = { ...resolved, [prop]: axes };
    }
  }
  return resolved;
}
