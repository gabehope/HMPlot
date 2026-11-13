// @ts-check
import { numpy as np } from "@hmplot/jax";

/**
 * Inclusive running maximum in shifted passes. Consumes `values` and returns
 * an owned array; callers retaining the input must pass a reference.
 * @param {import('@hmplot/jax').Array} values
 */
export function runningMax(values) {
  const length = values.shape[0];
  let result = values;
  for (let step = 1; step < length; step *= 2) {
    result = np.maximum(
      result.ref,
      np.concatenate([
        np.full([step], -Infinity),
        result.slice([0, length - step]),
      ]),
    );
  }
  return result;
}

/**
 * Inclusive running minimum from the end. Consumes `values` and returns an
 * owned array, with the same transfer contract as runningMax.
 * @param {import('@hmplot/jax').Array} values
 */
export function suffixMin(values) {
  return np.negative(np.flip(runningMax(np.flip(np.negative(values), 0)), 0));
}
