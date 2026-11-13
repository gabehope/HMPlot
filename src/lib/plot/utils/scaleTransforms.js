/**
 * Scale transforms (TODO 39.1): one table every site reads. Each entry holds its code (the
 * number shaders and compute passes select it by), its domain, its CPU forward, inverse and
 * derivative, its TSL, WGSL and jax forms, and its tick rule. Sites that spelled a transform
 * out (materials, operationTable, connectionGather, sampledBuffers, animation, data, axes,
 * interaction, scaleBindings, frameMapping, geometry, guides, export) read these instead, so a
 * new transform is one entry here.
 *
 * One rule for a value outside a transform's domain (a zero or a negative under log, a
 * negative under sqrt): it is missing, as NaN is. It is not drawn and not picked, and auto
 * extents leave it out. The CPU and jax forwards return NaN for it; shaders test `valid` and
 * treat the row as missing (their forwards clamp, so no NaN reaches a shader that assumes
 * finite math). An explicit domain outside a transform's domain stays an error.
 *
 * symlog (d3's scaleSymlog) takes a constant c > 0: y = sign(x)·log1p(|x|/c). The constant is
 * a uniform next to the transform code wherever the code is, so changing it compiles nothing.
 */
import {
  Fn, If, float, vec2, log, exp, sqrt, max, abs, sign, reciprocal,
} from "three/tsl";
import { numpy as np } from "@hmplot/jax";
import { scaleLog } from "d3";

const TINY = 1e-30;
const finite = (x) => typeof x === "number" && Number.isFinite(x);

/** Decade ticks (and 2..9 × 10^k minors) of a positive interval [min, max]. */
function logTicks(min, max, count) {
  const full = scaleLog().domain([min, max]).ticks(count);
  let major = full.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-8);
  if (!major.length) major = full;
  const minor = [];
  for (let k = Math.floor(Math.log10(min)); k <= Math.ceil(Math.log10(max)); k++)
    for (let n = 2; n < 10; n++) minor.push(n * 10 ** k);
  return { major, minor };
}

/**
 * symlog ticks: 0 and ±10^k inside [min, max], about `count` of them. Decades beyond c are
 * ln 10 apart in transformed space, so when fewer fit every `step`th is kept, counting down
 * from the largest (which is always kept); one closer to 0 than half the spacing is dropped
 * (±1 when c is 1 would crowd 0). Minors at ±2..9 × 10^k from c's decade up. Linear ticks
 * when the interval lies inside [-c, c], where the transform is nearly linear.
 */
function symlogTicks(min, max, count, c) {
  if (min >= -c && max <= c) return null;
  const f = (x) => Math.sign(x) * Math.log1p(Math.abs(x) / c);
  const inside = (v) => v >= min && v <= max;
  const lowest = Math.floor(Math.log10(Math.max(c, TINY)));
  const highest = Math.floor(Math.log10(Math.max(Math.abs(min), Math.abs(max))));
  const spacing = Math.abs(f(max) - f(min)) / Math.max(1, count);
  const step = Math.max(1, Math.round(spacing / Math.LN10));
  const major = inside(0) ? [0] : [], minor = [];
  for (let k = lowest; k <= highest; k++) {
    const kept = (highest - k) % step === 0 && (!inside(0) || f(10 ** k) >= 0.5 * spacing);
    for (const s of [-1, 1]) {
      if (kept && inside(s * 10 ** k)) major.push(s * 10 ** k);
      for (let n = 2; n < 10; n++) if (inside(s * n * 10 ** k)) minor.push(s * n * 10 ** k);
    }
  }
  return { major: major.sort((a, b) => a - b), minor };
}

/** The transforms, by name. Codes are dense from 0: shaders select by them. */
export const SCALE_TRANSFORMS = Object.freeze({
  linear: Object.freeze({
    name: "linear", code: 0,
    inDomain: finite,
    forward: (x) => x,
    inverse: (y) => y,
    derivative: () => 1,
    wgsl: { valid: "true", forward: "x", inverse: "y" },
    tsl: { valid: null, forward: (x) => x, inverse: (y) => y, derivative: () => float(1) },
    // jax forms borrow their inputs (they take .ref) and return new arrays.
    jax: { valid: null, forward: (x) => x.ref },
    ticks: null,
  }),
  log: Object.freeze({
    name: "log", code: 1,
    inDomain: (x) => finite(x) && x > 0,
    forward: (x) => Math.log(x),
    inverse: (y) => Math.exp(y),
    derivative: (x) => 1 / x,
    wgsl: { valid: "x > 0.", forward: "log(max(x, 1e-30))", inverse: "exp(y)" },
    tsl: {
      valid: (x) => x.greaterThan(0),
      forward: (x) => log(max(x, TINY)),
      inverse: (y) => exp(y),
      derivative: (x) => reciprocal(max(x, TINY)),
    },
    jax: { valid: (x) => x.ref.greater(0), forward: (x) => np.log(np.maximum(x.ref, TINY)) },
    ticks: (min, max, count) => (min > 0 ? logTicks(min, max, count) : null),
  }),
  sqrt: Object.freeze({
    name: "sqrt", code: 2,
    inDomain: (x) => finite(x) && x >= 0,
    forward: (x) => Math.sqrt(x),
    inverse: (y) => (y >= 0 ? y * y : NaN),
    derivative: (x) => 0.5 / Math.sqrt(x),
    wgsl: { valid: "x >= 0.", forward: "sqrt(max(x, 0.))", inverse: "max(y, 0.) * max(y, 0.)" },
    tsl: {
      valid: (x) => x.greaterThanEqual(0),
      forward: (x) => sqrt(max(x, 0)),
      inverse: (y) => max(y, 0).mul(max(y, 0)),
      derivative: (x) => sqrt(max(x, 0)).add(1e-6).reciprocal().mul(0.5),
    },
    jax: { valid: (x) => x.ref.greaterEqual(0), forward: (x) => np.sqrt(np.maximum(x.ref, 0)) },
    ticks: null,
  }),
  symlog: Object.freeze({
    name: "symlog", code: 3,
    inDomain: finite,
    forward: (x, c = 1) => Math.sign(x) * Math.log1p(Math.abs(x) / c),
    inverse: (y, c = 1) => Math.sign(y) * c * Math.expm1(Math.abs(y)),
    derivative: (x, c = 1) => 1 / (c + Math.abs(x)),
    wgsl: { valid: "true", forward: "sign(x) * log(1. + abs(x) / c)", inverse: "sign(y) * c * (exp(abs(y)) - 1.)" },
    tsl: {
      valid: null,
      forward: (x, c) => sign(x).mul(log(abs(x).div(c).add(1))),
      inverse: (y, c) => sign(y).mul(c).mul(exp(abs(y)).sub(1)),
      derivative: (x, c) => reciprocal(abs(x).add(c)),
    },
    jax: {
      valid: null,
      forward: (x, c) => np.sign(x.ref).mul(np.log1p(np.abs(x.ref).div(typeof c === "number" ? c : c.ref))),
    },
    ticks: (min, max, count, c = 1) => symlogTicks(min, max, count, c),
  }),
});

export const TRANSFORM_NAMES = Object.freeze(Object.keys(SCALE_TRANSFORMS));
/** Animation-only kind (utils/animation.js): switch between two values at t = 0.5. */
export const STEP_KIND = 4;
/** Operation-table code of an axis with no scale stage (utils/operationTable.js). */
export const NO_STAGE_KIND = 15;
/** symlog's constant when none is given (d3's default). */
export const DEFAULT_TRANSFORM_CONSTANT = 1;

/** The table entry for `name` (undefined and null are linear); an unknown name is an error. */
export function scaleTransform(name) {
  const entry = SCALE_TRANSFORMS[name ?? "linear"];
  if (!entry) throw Error(`Unsupported scale transform: ${name}. Use ${TRANSFORM_NAMES.join(", ")}.`);
  return entry;
}
/** A transform's code for a shader or compute uniform; unknown names are linear (0). */
export const transformCode = (name) => SCALE_TRANSFORMS[name ?? "linear"]?.code ?? 0;
/** The name of a transform code (linear for any other code). */
export const transformName = (code) => TRANSFORM_NAMES.find((name) => SCALE_TRANSFORMS[name].code === code) ?? "linear";

/** A symlog constant (or undefined for the default), checked: finite and positive. */
export function transformConstant(value, what = "Symlog constant") {
  if (value === undefined || value === null) return DEFAULT_TRANSFORM_CONSTANT;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw Error(`${what} must be a finite positive number.`);
  return value;
}

/** Whether `x` is inside the transform's domain (finite, and positive for log). */
export const inTransformDomain = (name, x) => scaleTransform(name).inDomain(x);
/** The CPU forward: NaN outside the transform's domain (a missing value). */
export function transformForward(name, x, c = DEFAULT_TRANSFORM_CONSTANT) {
  const t = scaleTransform(name);
  return t.inDomain(x) ? t.forward(x, c) : NaN;
}
/**
 * The CPU forward as shaders compute it: clamped into the domain (log of max(x, 1e-30), sqrt of
 * max(x, 0)), so it is finite for any finite x. For a scale's bounds, which the GPU maps the
 * same way; a value outside the domain is still missing (test inTransformDomain).
 */
export function transformClamped(name, x, c = DEFAULT_TRANSFORM_CONSTANT) {
  const t = scaleTransform(name);
  return t.forward(name === "log" ? Math.max(x, TINY) : name === "sqrt" ? Math.max(x, 0) : x, c);
}
/**
 * Render mappings deliberately keep tiny transformed spans away from zero. Unlike scaleFraction
 * (axis/domain arithmetic), an equal render domain without a midpoint maps to the range's start. Both
 * forms also preserve reversed domains and midpoint halves. Keep this epsilon and these two
 * implementations together: exports use the CPU form, materials use the TSL form.
 */
const MIN_RENDER_SPAN = 1e-8;
const renderSpan = (span) => Math.abs(span) < MIN_RENDER_SPAN ? MIN_RENDER_SPAN : span;
const renderSpanNode = (span) => span.abs().lessThan(MIN_RENDER_SPAN).select(MIN_RENDER_SPAN, span);

/**
 * A value mapped to its rendered range, as the shader computes it (materials.js
 * applyScale): the transform clamped into its domain, the bounds' span kept off zero, a
 * midpoint's two halves each linear, then the output range. Null for a value outside the
 * transform's domain (a zero under log): the shader leaves such a row out (scaleValidity).
 * @param {number} value
 * @param {{domain?: number[], range?: number[], transform?: string, constant?: number, midpoint?: number | null}} options
 */
export function renderScaleValue(value, { domain = [0, 1], range = [0, 1], transform = "linear", constant = 1, midpoint = null } = {}) {
  if (transform === "log" && !(value > 0) || transform === "sqrt" && !(value >= 0)) return null;
  const f = (x) => transformClamped(transform ?? "linear", x, constant);
  const v = f(value), lo = f(domain[0]), hi = f(domain[1]);
  let t = (v - lo) / renderSpan(hi - lo);
  if (typeof midpoint === "number" && Number.isFinite(midpoint)) {
    const m = f(midpoint);
    t = (hi - lo) * (v - m) < 0 ? (v - lo) / renderSpan(m - lo) * 0.5 : (v - m) / renderSpan(hi - m) * 0.5 + 0.5;
  }
  return t * (range[1] - range[0]) + range[0];
}

/**
 * Map a value through a scale onto `outputRangeNode` (default [0, 1]). `valueTransform`: a
 * transform name (baked into the shader) or a float uniform holding its code (selected at run
 * time: another transform compiles nothing); `constantNode`: symlog's constant. `midpointNode`:
 * a vec2 (1 when set, the midpoint) that maps the domain's halves to the range's halves, each
 * linearly in transformed space (TODO 39.2; unset or 0 in x maps [lo, hi] linearly).
 * @param {{valueNode: import("three/webgpu").Node<"float">,
 * valueTransform: string | import("three/webgpu").Node<"float">,
 * boundsNode: import("three/webgpu").Node<"vec2">,
 * outputRangeNode?: import("three/webgpu").Node<"vec2"> | null,
 * constantNode?: import("three/webgpu").Node<"float"> | null,
 * midpointNode?: import("three/webgpu").Node<"vec2"> | null}} inputs
 * @returns {import("three/webgpu").Node<"float">}
 */
export function renderScaleNode({
  valueNode,
  valueTransform,
  boundsNode,
  outputRangeNode,
  constantNode = null,
  midpointNode = null,
}) {
  const { apply } = tslTransform(valueTransform, constantNode);
  const fraction = Fn(() => {
    const v = apply(valueNode).toVar(), lo = apply(boundsNode.x).toVar(), hi = apply(boundsNode.y).toVar();
    const result = v.sub(lo).div(renderSpanNode(hi.sub(lo))).toVar();
    if (midpointNode) {
      If(midpointNode.x.greaterThan(0.5), () => {
        const m = apply(midpointNode.y).toVar();
        If(hi.sub(lo).mul(v.sub(m)).lessThan(0), () => {
          result.assign(v.sub(lo).div(renderSpanNode(m.sub(lo))).mul(0.5));
        }).Else(() => {
          result.assign(v.sub(m).div(renderSpanNode(hi.sub(m))).mul(0.5).add(0.5));
        });
      });
    }
    return result;
  })();
  const outputRange = outputRangeNode || vec2(0, 1);
  return fraction.mul(outputRange.y.sub(outputRange.x)).add(outputRange.x);
}

/** The CPU inverse (NaN where a transformed value has no preimage, as sqrt's negatives). */
export function transformInverse(name, y, c = DEFAULT_TRANSFORM_CONSTANT) {
  return Number.isFinite(y) ? scaleTransform(name).inverse(y, c) : NaN;
}
/** The CPU derivative d forward / dx (NaN outside the domain). */
export function transformDerivative(name, x, c = DEFAULT_TRANSFORM_CONSTANT) {
  const t = scaleTransform(name);
  return t.inDomain(x) ? t.derivative(x, c) : NaN;
}
/** forward and inverse of one transform, for code that maps many values. */
export function transformPair(name, c = DEFAULT_TRANSFORM_CONSTANT) {
  return { forward: (x) => transformForward(name, x, c), inverse: (y) => transformInverse(name, y, c) };
}

/**
 * The transform's tick values on [min, max]: `{major, minor}`, or null for d3's linear ticks
 * (linear, sqrt, a log interval that is not positive, a symlog interval inside [-c, c]).
 */
export function transformTicks(name, min, max, count, c = DEFAULT_TRANSFORM_CONSTANT) {
  return scaleTransform(name).ticks?.(min, max, count, c) ?? null;
}
/**
 * An automatic domain [lo, hi] padded by `padding` of its span in transformed space (so a log
 * axis pads by a factor and stays positive); a single value widens by 0.5 there. Falls back
 * to [lo, hi] when an end is outside the transform's domain.
 */
export function paddedDomain([lo, hi], name = "linear", padding = 0, c = DEFAULT_TRANSFORM_CONSTANT) {
  const a = transformForward(name, lo, c), b = transformForward(name, hi, c);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [lo, hi];
  const pad = a === b ? 0.5 : Math.abs(b - a) * padding;
  if (!pad) return [lo, hi];
  const low = transformInverse(name, Math.min(a, b) - pad, c), high = transformInverse(name, Math.max(a, b) + pad, c);
  // sqrt has no preimage below 0: the padded end stops at 0.
  const start = Number.isFinite(low) ? low : name === "sqrt" ? 0 : Math.min(lo, hi);
  return lo <= hi ? [start, high] : [high, start];
}

/**
 * The CPU piecewise map of a scale with a midpoint (TODO 39.2, d3's scaleDiverging): the
 * domain's halves map to [0, 0.5] and [0.5, 1], each linearly in transformed space. Without a
 * midpoint (undefined or NaN), one linear map of [lo, hi] onto [0, 1]. Returns t (NaN for a
 * missing value), not clamped.
 */
/** @param {number} value @param {{domain?: number[], transform?: string, constant?: number, midpoint?: number | null}} options */
export function scaleFraction(value, { domain, transform = "linear", constant = DEFAULT_TRANSFORM_CONSTANT, midpoint } = {}) {
  const f = (x) => transformForward(transform, x, constant);
  const v = f(value), lo = f(domain[0]), hi = f(domain[1]);
  if (![v, lo, hi].every(Number.isFinite)) return NaN;
  if (midpoint === undefined || midpoint === null || Number.isNaN(midpoint)) {
    const span = hi - lo;
    return Math.abs(span) < 1e-8 ? 0.5 : (v - lo) / span;
  }
  const m = f(midpoint);
  // The lower half is the side of the midpoint the domain's low end is on.
  if ((hi - lo) * (v - m) < 0) return 0.5 * (v - lo) / (m - lo);
  return hi === m ? 0.5 : 0.5 + 0.5 * (v - m) / (hi - m);
}
/** The inverse of scaleFraction: the value at fraction t. */
export function scaleValueAt(t, { domain, transform = "linear", constant = DEFAULT_TRANSFORM_CONSTANT, midpoint } = {}) {
  const f = (x) => transformForward(transform, x, constant);
  const lo = f(domain[0]), hi = f(domain[1]);
  if (midpoint === undefined || midpoint === null || Number.isNaN(midpoint))
    return transformInverse(transform, lo + t * (hi - lo), constant);
  const m = f(midpoint);
  return transformInverse(transform, t < 0.5 ? lo + 2 * t * (m - lo) : m + (2 * t - 1) * (hi - m), constant);
}
/** A midpoint for a domain: undefined when unset, else a number inside the domain. */
export function checkMidpoint(midpoint, domain, what = "Scale") {
  if (midpoint === undefined || midpoint === null) return undefined;
  if (typeof midpoint !== "number" || !Number.isFinite(midpoint))
    throw Error(`${what} midpoint must be a finite number.`);
  if (domain && (midpoint < Math.min(...domain) || midpoint > Math.max(...domain)))
    throw Error(`${what} midpoint ${midpoint} is outside its domain [${domain[0]}, ${domain[1]}].`);
  return midpoint;
}

/**
 * WGSL functions `${prefix}Valid(x, k)`, `${prefix}Forward(x, k, c)` and `${prefix}Inverse(y,
 * k, c)` over every transform, selected by code k (a runtime value: another transform or
 * constant compiles nothing). Forwards clamp, so they stay finite; test Valid for missing.
 */
export function scaleTransformWgsl(prefix = "scale") {
  const cases = (form, arg) => TRANSFORM_NAMES.filter((name) => name !== "linear")
    .map((name) => `  if (k == ${SCALE_TRANSFORMS[name].code}u) { return ${SCALE_TRANSFORMS[name].wgsl[form]}; }`)
    .join("\n") + `\n  return ${arg};`;
  return /* wgsl */ `
fn ${prefix}Valid(x: f32, k: u32) -> bool {
${TRANSFORM_NAMES.filter((name) => SCALE_TRANSFORMS[name].wgsl.valid !== "true")
    .map((name) => `  if (k == ${SCALE_TRANSFORMS[name].code}u) { return ${SCALE_TRANSFORMS[name].wgsl.valid}; }`).join("\n")}
  return true;
}
fn ${prefix}Forward(x: f32, k: u32, c: f32) -> f32 {
${cases("forward", "x")}
}
fn ${prefix}Inverse(y: f32, k: u32, c: f32) -> f32 {
${cases("inverse", "y")}
}
`;
}

/**
 * TSL forms selected by name (baked: another name builds another shader) or by a float uniform
 * node holding the code (every transform computed and one selected, so another transform
 * compiles nothing). `constant`: a float node or number, symlog's c. Returns `{apply,
 * derivative, inverse, valid}`: valid is null when every value is valid.
 */
export function tslTransform(transform, constant) {
  const c = constant == null ? float(DEFAULT_TRANSFORM_CONSTANT) : typeof constant === "number" ? float(constant) : constant;
  if (!transform?.isNode) {
    const t = scaleTransform(transform || "linear").tsl;
    return {
      apply: (x) => t.forward(x, c),
      derivative: (x) => t.derivative(x, c),
      inverse: (y) => t.inverse(y, c),
      valid: t.valid && ((x) => t.valid(x)),
    };
  }
  const code = transform;
  const others = TRANSFORM_NAMES.filter((name) => name !== "linear");
  const pick = (method, linear) => (input) => Fn(() => {
    const value = input.toVar(), result = linear(value).toVar();
    for (const name of others)
      If(code.equal(SCALE_TRANSFORMS[name].code), () => { result.assign(SCALE_TRANSFORMS[name].tsl[method](value, c)); });
    return result;
  })();
  const checked = others.filter((name) => SCALE_TRANSFORMS[name].tsl.valid);
  return {
    apply: pick("forward", (x) => x),
    derivative: pick("derivative", () => float(1)),
    inverse: pick("inverse", (y) => y),
    valid: (input) => Fn(() => {
      const value = input.toVar(), result = float(1).toVar();
      for (const name of checked)
        If(code.equal(SCALE_TRANSFORMS[name].code), () => {
          result.assign(SCALE_TRANSFORMS[name].tsl.valid(value).select(float(1), float(0)));
        });
      return result.greaterThan(0.5);
    })(),
  };
}

/**
 * The jax forward of `name` over a borrowed array: NaN outside the domain (and NaN in stays
 * NaN). `c`: a number or a borrowed rank-0 array (a device parameter, so a new constant
 * compiles nothing in a jitted kernel). Returns a new array.
 */
export function jaxTransformForward(name, x, c = DEFAULT_TRANSFORM_CONSTANT) {
  const t = scaleTransform(name).jax;
  if (!t.valid) return t.forward(x, c);
  return np.where(t.valid(x), t.forward(x, c), NaN);
}
/** The jax domain test of `name` over a borrowed array (null when every value is valid). */
export function jaxTransformValid(name, x) {
  return scaleTransform(name).jax.valid?.(x) ?? null;
}
