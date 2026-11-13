/**
 * JAX arrays from another jax-js copy (TODO Stage 23.0b).
 *
 * hmplot bundles its own jax-js (`@hmplot/jax`). An app that builds inputs with its own
 * `@jax-js/jax` (without the `hmplot/vite` plugin, which makes the two one) hands over a
 * second copy's arrays: another Array class, and buffers on another GPU device, which this copy
 * cannot read. They are copied into hmplot's jax-js through the host, once per array (jax-js
 * arrays are immutable), with a warning once per page. The copy blocks while it reads the GPU, so
 * it suits data that doesn't change every frame.
 *
 * Inputs are adopted where they enter: data tables (createDataScope().update) and mark channels
 * (namedMark's props), plus asArray and field updates for values that arrive another way.
 */
import { Array as JaxArray, numpy as np } from "@hmplot/jax";

const copies = new WeakMap();
let live = 0;
// Our copy goes when the app's array is collected (jax-js arrays have no disposal hook).
const release = typeof FinalizationRegistry === "function"
  ? new FinalizationRegistry((copy) => { live--; copy.dispose(); })
  : null;
let warned = false;

/** Copies not yet released (tests). */
export const liveForeignCopies = () => live;

/** A jax-js array from another copy of jax-js (not hmplot's). */
export function isForeignJax(value) {
  return value !== null && typeof value === "object" && !(value instanceof JaxArray) &&
    Array.isArray(value.shape) && typeof value.dtype === "string" &&
    typeof value.dataSync === "function" && typeof value.dispose === "function";
}

/** hmplot's copy of a foreign JAX array (one per array); any other value unchanged. Borrowed. */
export function adoptJax(value) {
  if (!isForeignJax(value)) return value;
  let copy = copies.get(value);
  if (copy) return copy;
  if (!warned) {
    warned = true;
    console.warn(
      "hmplot: a JAX array from another jax-js copy was copied through the CPU. hmplot " +
      "bundles its own jax-js; build inputs with `import { numpy as np } from \"hmplot/jax\"`, " +
      "or add the `hmplotJax()` plugin from \"hmplot/vite\" so that `@jax-js/jax` is hmplot's copy.",
    );
  }
  // .ref keeps the app's array: dataSync() consumes the reference it reads.
  const data = value.ref.dataSync();
  copy = np.array(data, { dtype: value.dtype }).reshape(value.shape);
  copies.set(value, copy);
  live++;
  release?.register(value, copy);
  return copy;
}

/**
 * Adopt the arrays among a props or data-table object's values: a value, the codes of a
 * dictionary column ({codes, categories}), or the components of an array ([x, y]). Returns the
 * same object when nothing was foreign.
 */
/** @template {Record<string, unknown>} T @param {T} values @returns {T} */
export function adoptJaxValues(values) {
  if (values === null || typeof values !== "object" || Array.isArray(values) || ArrayBuffer.isView(values) ||
      values instanceof JaxArray || isForeignJax(values)) return values;
  let out = values;
  for (const key of Object.keys(values)) {
    const value = values[key], next = adoptNested(value);
    if (next !== value) {
      if (out === values) out = { ...values };
      out[key] = next;
    }
  }
  return out;
}

function adoptNested(value) {
  if (isForeignJax(value)) return adoptJax(value);
  if (Array.isArray(value) && value.some(isForeignJax)) return value.map(adoptJax);
  if (value === null || typeof value !== "object") return value;
  // column(values, ...) is frozen; a dictionary column is {codes, categories}. One adopted
  // wrapper per wrapper, so an unchanged input stays the same object across updates.
  const wrapped = value.__hmplotColumn ? "values" : "codes";
  if (!isForeignJax(value[wrapped])) return value;
  let adopted = wrappers.get(value);
  if (!adopted) {
    adopted = { ...value, [wrapped]: adoptJax(value[wrapped]) };
    if (Object.isFrozen(value)) Object.freeze(adopted);
    wrappers.set(value, adopted);
  }
  return adopted;
}
const wrappers = new WeakMap();
