/**
 * Prepare Arrows' per-row endpoint and style inputs without readback. Borrow inputs;
 * return arrays the mark owns and must dispose. Curve preparation belongs to curves.js
 * and curvedPaths.js, rather than a second fixed-subdivision link implementation here.
 */
import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import { asArray, shapeOf, disposeArrays } from "../utils/data.js";

function positionCount(value, label) {
  if (value == null) return 0;
  const shape = shapeOf(value);
  if (shape.length === 1 && shape[0] === 0) return 0;
  if (![1, 2].includes(shape.length) || ![2, 3].includes(shape.at(-1)))
    throw new Error(`${label} must have shape [N, 2|3] or [2|3]`);
  return shape.length === 1 ? 1 : shape[0];
}
function validateAttribute(value, count, label) {
  const shape = shapeOf(value);
  if (!shape.length) return;
  if (shape.length > 2 || (shape.length === 2 && shape[1] !== 1))
    throw new Error(`${label} must be a scalar or have shape [N] or [N, 1]`);
  if (shape[0] !== count)
    throw new Error(`${label} has ${shape[0]} rows; expected ${count}`);
}
function validate(values) {
  const count = positionCount(values.start, "start");
  if (positionCount(values.end, "end") !== count)
    throw new Error(`end must match start's ${count} rows`);
  validateAttribute(values.width, count, "width");
  validateAttribute(values.color, count, "color");
  return count;
}
function positionArray(value, count) {
  let array = asArray(value).reshape([count, -1]);
  if (array.shape[1] === 2)
    array = np.pad(array, [
      [0, 0],
      [0, 1],
    ]);
  return array;
}
function repeatAttribute(value, count, subdivisions) {
  if (!shapeOf(value).length)
    return value instanceof JaxArray
      ? np.broadcastTo(value.ref, [count * subdivisions, 1])
      : value;
  return np.repeat(asArray(value).reshape([count, 1]), subdivisions, 0);
}

/**
 * Borrow inputs; callers own every JAX array in the returned object. No readbacks.
 * @param {{start: any, end: any, width?: any, color?: any}} channels
 */
export function arrowArrays({ start, end, width = 0.05, color = "#4682b4" }) {
  const count = validate({ start, end, width, color });
  if (!count)
    return {
      start: [],
      end: [],
      width: shapeOf(width).length || width instanceof JaxArray ? [] : width,
      color: shapeOf(color).length || color instanceof JaxArray ? [] : color,
    };
  const result = {};
  try {
    result.start = positionArray(start, count);
    result.end = positionArray(end, count);
    result.width = repeatAttribute(width, count, 1);
    result.color = repeatAttribute(color, count, 1);
    return result;
  } catch (error) {
    disposeArrays(result);
    throw error;
  }
}
