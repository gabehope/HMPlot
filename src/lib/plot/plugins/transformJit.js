import { Array as JaxArray, jit } from "@hmplot/jax";
import { deviceScalar } from "../utils/deviceParams.js";
import { ownCacheEntry } from "../utils/cacheEntries.js";

/** A transform owns compiled kernels across runs, and releases captured constants with its
 * cache. Kernels are keyed by function identity and static argument positions, never source
 * text: two closures with the same text may capture different values.
 */
export function transformJit(cache, cleanup) {
  const kernels = cache ? (cache.pluginKernels ??= new Map()) : new Map();
  const dispose = (entries) => {
    for (const variants of entries.values())
      for (const kernel of variants.values()) kernel.dispose();
    entries.clear();
  };
  if (cache) ownCacheEntry(cache, "pluginKernels", dispose);
  else cleanup(() => dispose(kernels));
  return (fn, { staticArgnums = [] } = {}) => {
    const positions = [...new Set(staticArgnums)].sort((a, b) => a - b);
    if (positions.some((value) => !Number.isInteger(value) || value < 0))
      throw Error(
        "Transform jit: staticArgnums must contain nonnegative argument indices.",
      );
    let variants = kernels.get(fn);
    if (!variants) kernels.set(fn, (variants = new Map()));
    const key = JSON.stringify(positions);
    let kernel = variants.get(key);
    if (!kernel) {
      kernel = jit(fn, { staticArgnums: positions });
      variants.set(key, kernel);
    }
    return (...args) => {
      const scalars = [];
      const inputs = new Map();
      const consume = (array) => {
        const retained = (inputs.get(array) ?? array.refCount) - 1;
        if (retained < 0)
          throw Error(
            "Transform jit: use .ref when passing an array more than once.",
          );
        inputs.set(array, retained);
        return array;
      };
      const dynamic = (value) => {
        if (typeof value === "number") {
          const scalar = deviceScalar(value);
          scalars.push(scalar);
          return consume(scalar.ref);
        }
        if (value instanceof JaxArray) return consume(value);
        if (ArrayBuffer.isView(value)) return value;
        if (Array.isArray(value)) return value.map(dynamic);
        if (value && Object.getPrototypeOf(value) === Object.prototype)
          return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, dynamic(entry)]),
          );
        return value;
      };
      try {
        return kernel(
          ...args.map((value, index) =>
            positions.includes(index) ? value : dynamic(value),
          ),
        );
      } catch (error) {
        // Jax consumes arguments after a successful trace; a trace that throws can leave
        // them untouched. Release only the references transferred to this invocation.
        for (const [array, retained] of inputs)
          while (array.refCount > retained) array.dispose();
        throw error;
      } finally {
        for (const scalar of scalars) scalar.dispose();
      }
    };
  };
}
