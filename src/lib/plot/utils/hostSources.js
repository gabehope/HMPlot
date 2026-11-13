// Immutable source buffers supplied by a transport may already exist on the host.
// Legacy mesh preparation can reuse them instead of reading a GPU copy back.
const sources = new WeakMap();
export function rememberHostSource(array, values, shape, { integer = undefined, exact = undefined } = {}) {
  sources.set(array, { values, shape: [...shape], nested: undefined, exact,
    integer: integer ?? (ArrayBuffer.isView(values) && !(values instanceof Float32Array || values instanceof Float64Array)) });
}
/**
 * A 1-D GPU array's host values, as uploaded (a Python column's payload): its exact values when
 * the upload narrowed them (an int64 column: BigInts, NaN where missing), else the typed array.
 * Keys and joins read these instead of a readback (TODO 43).
 */
export function existingHostValues(array) {
  const source = sources.get(array);
  if (!source || source.shape.length !== 1) return undefined;
  return source.exact ?? source.values;
}
/** Whether a GPU array was uploaded from integer data (the RGB 0-255 rule). */
export function hostSourceInteger(array) {
  return Boolean(sources.get(array)?.integer);
}
export function existingHostSource(array) {
  const source = sources.get(array);
  if (!source) return undefined;
  if (source.nested !== undefined) return source.nested;
  let offset = 0;
  const unpack = (axis) =>
    axis === source.shape.length
      ? source.values[offset++]
      : Array.from({ length: source.shape[axis] }, () => unpack(axis + 1));
  return (source.nested = unpack(0));
}
