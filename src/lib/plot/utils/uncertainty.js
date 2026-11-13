import { numpy as np } from "@hmplot/jax";
import { planProgram } from "./programs.js";
import { asArray, shapeOf } from "./data.js";
import { deviceArray } from "./deviceParams.js";
import { SCALE_TRANSFORMS, jaxTransformValid } from "./scaleTransforms.js";
/**
 * A band mark's props as its mark reads them (TODO 64): the mark's `axis` (which axis lower and
 * upper run along) is not a prop. Orientation selects it; a horizontal Area takes its
 * positions as `y` (internally `x`, running along y, with lower and upper on x).
 * A stray `axis` is dropped.
 */
export function bandMarkValues(kind, props) {
  if (kind === "Area" && props.baseline !== undefined)
    throw Error("Area.baseline was removed: pass lower instead, and upper for the other edge.");
  const { axis, ...rest } = props;
  if (kind !== "ErrorBars" && kind !== "Area") return rest;
  const { orientation, ...others } = rest;
  if (orientation != null && orientation !== "vertical" && orientation !== "horizontal")
    throw Error(`${kind}.orientation must be "vertical" or "horizontal", not ${JSON.stringify(orientation)}.`);
  if (kind === "ErrorBars")
    return orientation == null ? others : { ...others, axis: orientation === "horizontal" ? "x" : "y" };
  if (orientation !== "horizontal") {
    if (others.y !== undefined)
      throw Error(`${kind} takes y only with orientation="horizontal": pass upper for values and x for positions, or set orientation="horizontal".`);
    return others;
  }
  const { x, y, ...band } = others;
  if (x !== undefined)
    throw Error(`A horizontal ${kind} runs along y, with lower and upper on x: pass its positions as y, not x.`);
  return { ...band, x: y, axis: "x" };
}
export function validateUncertainty(kind, x, lower, upper, axis = "y") {
  const shape = shapeOf(x),
    n = shape[0] ?? 0;
  if (
    kind === "errors"
      ? shape.length !== 2 || ![2, 3].includes(shape[1])
      : shape.length !== 1
  )
    throw Error(
      kind === "errors"
        ? "position must be an N×2 or N×3 array."
        : `Area.${axis === "x" ? "y" : "x"} must be a one-dimensional array of positions.`,
    );
  if (!["x", "y"].includes(axis)) throw Error("Error-bar axis must be x or y.");
  for (const [name, value] of [
    ["lower", lower],
    ["upper", upper],
  ]) {
    const s = shapeOf(value);
    if (typeof value !== "number" && (s.length !== 1 || s[0] !== n))
      throw Error(`${name} must be a scalar or an array of length ${n}.`);
  }
  return n;
}
/**
 * `shown` (optional, borrowed): 1 for the rows to draw; the others read as missing. `transform`:
 * the value axis's; a bound outside its domain (0 on a log axis) is missing, as for every mark
 * (scaleTransforms.js; TODO 67.1: a band ran to the clamped log of 0, far off the plot).
 */
export function uncertaintyArrays(kind, x, lower, upper, axis = "y", shown = undefined, transform = "linear") {
  const n = validateUncertainty(kind, x, lower, upper, axis);
  if (!n)
    return Object.fromEntries(
      (kind === "errors"
        ? ["start", "end"]
        : ["start", "end", "previous", "next"]
      ).map((k) => [k, np.zeros([0, 2])]),
    );
  // One compiled program per plan (TODO 33.3); numeric bounds come from a buffer.
  const numbers = [lower, upper].filter((v) => typeof v === "number");
  const plan = {
    kind,
    axis,
    lower: typeof lower === "number" ? "number" : "column",
    upper: typeof upper === "number" ? "number" : "column",
    shown: Boolean(shown),
    transform: SCALE_TRANSFORMS[transform]?.jax.valid ? transform : null,
  };
  return uncertaintyProgram(plan)({
    x: asArray(x),
    ...(plan.lower === "column" ? { lower: asArray(lower) } : {}),
    ...(plan.upper === "column" ? { upper: asArray(upper) } : {}),
    ...(numbers.length ? { params: deviceArray(numbers) } : {}),
    ...(shown ? { shown: shown.ref } : {}),
  });
}

/** uncertaintyArrays' device work for a plan. Consumes `inputs`. */
function uncertaintyKernel(plan, inputs) {
  const { kind, axis } = plan,
    a = inputs.x,
    n = a.shape[0];
  let at = 0;
  const bound = (key) =>
    plan[key] === "column"
      ? inputs[key]
      : np.broadcastTo(inputs.params.ref.slice(at++), [n]);
  const lo = bound("lower"),
    hi = bound("upper");
  inputs.params?.dispose();
  let bounded = np.logicalAnd(
    np.logicalAnd(np.isfinite(lo.ref), np.isfinite(hi.ref)),
    kind === "area" ? np.ones([n], { dtype: np.bool }) : lo.ref.lessEqual(hi.ref),
  );
  if (plan.transform)
    bounded = np.logicalAnd(bounded, np.logicalAnd(jaxTransformValid(plan.transform, lo), jaxTransformValid(plan.transform, hi)));
  const valid = inputs.shown
    ? np.logicalAnd(bounded, inputs.shown.greater(0))
    : bounded;
  const clean = (v) => np.where(valid.ref, v, np.nan);
  let out;
  if (kind === "errors") {
    const index = axis === "x" ? 0 : 1,
      cols = [];
    for (let i = 0; i < a.shape[1]; i++) cols.push(a.ref.slice([], i));
    out = {
      start: np.stack(cols.map((v, i) => (i === index ? clean(lo.ref) : v.ref)), 1),
      end: np.stack(cols.map((v, i) => (i === index ? clean(hi.ref) : v.ref)), 1),
    };
    cols.forEach((v) => v.dispose());
  } else {
    const l = np.stack(axis === "x" ? [clean(lo.ref), a.ref] : [a.ref, clean(lo.ref)], 1),
      h = np.stack(axis === "x" ? [clean(hi.ref), a.ref] : [a.ref, clean(hi.ref)], 1);
    out = {
      start: l.ref.slice([0, Math.max(0, n - 1)]),
      end: l.slice([1, n]),
      previous: h.ref.slice([0, Math.max(0, n - 1)]),
      next: h.slice([1, n]),
    };
  }
  for (const v of [a, lo, hi, valid]) v.dispose();
  return out;
}
const PROGRAMS = new Map();
/** uncertaintyKernel compiled once per plan (utils/programs.js). */
const uncertaintyProgram = (plan) => planProgram(PROGRAMS, plan, uncertaintyKernel);
