import { numpy as np } from "@hmplot/jax";

/**
 * Values that reach GPU kernels from a buffer instead of as literals (TODO 17.1).
 *
 * jax-js 0.1.24 compiles one kernel per distinct expression, and it folds some inputs into the
 * kernel source as literals: a JS number operand (`x.greater(0.5)`), a one-element array
 * (`np.array(v)`, `np.array([v])`, `np.full([1], v)`), and ANY typed array under 128 elements
 * whose values are all equal (Object.is). A value that follows the data or the pointer — a
 * Filter threshold, Bin edges, a quantile index, a brushed category — then compiles a new
 * pipeline for every value it takes, and jax-js never evicts one.
 *
 * What it does not fold: a typed array of two or more elements that are not all equal. Its
 * slices are views that read the uploaded buffer, so the kernel sees an input, not a value. The
 * helpers here pack the values into one such array with a sentinel element after them (NaN for
 * floats: NaN never equals anything, even itself; for integers the first value with its low bit
 * flipped), so even [v] or [v, v] stays a buffer.
 *
 * tests/unit/kernel-literals.test.js depends on this folding rule; after a jax-js upgrade, run it
 * first. The kernel still bakes each slice's POSITION, so a call site must always put the same
 * parameter at the same index.
 */
function block(values, dtype) {
  const data = dtype === "int32" ? new Int32Array(values.length + 1) : new Float32Array(values.length + 1);
  data.set(values.map(Number));
  data[values.length] = dtype === "int32" ? (data[0] ^ 1) : NaN;
  return np.array(data, { dtype: dtype === "int32" ? np.int32 : np.float32 });
}

/** One rank-0 array per value, each a view of one uploaded buffer. The caller owns them. */
export function deviceParams(values, { dtype = "float32" } = {}) {
  if (!values.length) return [];
  const all = block(values, dtype);
  try { return values.map((_, index) => all.ref.slice(index)); }
  finally { all.dispose(); }
}

/** One rank-0 array (see deviceParams). The caller owns it. */
export function deviceScalar(value, options) {
  return deviceParams([value], options)[0];
}

/** A shape-[k] array of `values` that reads its buffer (never folded, even for k = 1). */
export function deviceArray(values, { dtype = "float32" } = {}) {
  if (!values.length) return np.zeros([0], { dtype: dtype === "int32" ? np.int32 : np.float32 });
  const all = block(values, dtype);
  try { return all.ref.slice([0, values.length]); }
  finally { all.dispose(); }
}

/**
 * A host column as a device array that is never folded into a kernel. np.array() alone turns a
 * short constant-filled column (fewer than 128 rows, every value equal) into a literal, so a
 * later revision with a different constant would compile new kernels (13.8 N4 leftover).
 */
export function uploadColumn(values, dtype) {
  const n = values.length;
  if (n === 0 || n >= 128 || !allEqual(values)) return undefined;
  const Type = ArrayBuffer.isView(values) ? values.constructor : null;
  if (Type ? Type !== Float32Array && Type !== Int32Array : typeof values[0] !== "number") return undefined;
  const kind = dtype ?? (Type === Int32Array ? "int32" : "float32");
  const all = block(Array.from(values, Number), kind);
  try { return all.ref.slice([0, n]); }
  finally { all.dispose(); }
}
function allEqual(values) {
  for (let i = 1; i < values.length; i++) if (!Object.is(values[i], values[0])) return false;
  return true;
}
