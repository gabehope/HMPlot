import { jit } from "@hmplot/jax";

/** Tests set `compiled` false to run every plan's kernel eagerly (TODO 33.6). */
export const kernels = { compiled: true };

/**
 * A kernel compiled once per plan (TODO 33.3): `kernel(plan, inputs)` jitted over `inputs`,
 * kept in `cache` by the plan's JSON (a bounded map: the oldest plan dropped past 64). With
 * `kernels.compiled` false it runs eagerly, the reference the compiled run must match.
 */
export function planProgram(cache, plan, kernel) {
  if (!kernels.compiled) return (inputs) => kernel(plan, inputs);
  const key = JSON.stringify(plan);
  let program = cache.get(key);
  if (!program) {
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, (program = jit((inputs) => kernel(plan, inputs))));
  }
  return program;
}
