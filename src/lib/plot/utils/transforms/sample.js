import { numpy as np, random } from "@hmplot/jax";
import { deviceScalar } from "../deviceParams.js";
import { cachedArray } from "./common.js";

/**
 * Sample: `size` rows (or a `proportion` of them, or at most 1000) chosen at random, in row
 * order, or with order "random" in the seeded random order (every row by default: a shuffle;
 * TODO 137.3 folded Shuffle in). Every row read gets a seeded key, the hidden rows last, so the
 * sample is the visible rows with the smallest keys and stays put as other rows are hidden or
 * shown. Its capacity is the size every row would give, so its length does not follow the
 * visible rows.
 */
export const sample = {
  // Its expression parameters, evaluated before it runs (TODO 138.2).
  parameters: {
    size: { type: "expression", integer: true },
    proportion: { type: "expression" },
  },
  reads: "rows",
  output: "subset",
  validate(config) {
    if (!["data", "random"].includes(config.order ?? "data"))
      throw Error('Sample order must be "data" or "random".');
    if (config.size !== undefined && config.proportion !== undefined)
      throw Error("Sample accepts size or proportion, not both.");
    if (
      config.proportion !== undefined &&
      (!Number.isFinite(config.proportion) ||
        config.proportion < 0 ||
        config.proportion > 1)
    )
      throw Error("Sample proportion must be between zero and one.");
  },
  run(input, config, { own, cache }) {
    const n = input.length;
    const shuffled = config.order === "random";
    // The size a count of rows gives: `size`, a proportion of them, or at most 1000 (every row
    // in a random order).
    const sizeFor = (count) =>
      config.size !== undefined
        ? config.size
        : config.proportion !== undefined
          ? Math.round(count * config.proportion)
          : shuffled
            ? count
            : Math.min(1000, count);
    let size = sizeFor(input.count);
    if (!Number.isInteger(size) || size < 0)
      throw Error("Sample size must be a nonnegative integer.");
    size = Math.min(input.count, size);
    const capacity = Math.min(n, sizeFor(n));
    // Every row's random key: the same while the seed and the row count are (29.6).
    const seed = config.seed ?? 42;
    const keys = cachedArray(cache, "sample", [seed, n], () =>
      random.uniform(random.key(seed), [n]),
    );
    const picked = own(
      np
        .argsort(
          input.valid ? np.where(input.valid.ref.greater(0), keys, 2) : keys,
        )
        .slice([0, capacity]),
    );
    // Already the sample first, in the keys' (random) order.
    if (shuffled) return { order: picked, count: size };
    // The sample first, in row order, then the rest of the capacity.
    const sampled = own(
      np
        .arange(capacity)
        .astype(np.int32)
        .less(deviceScalar(size, { dtype: "int32" })),
    );
    const order = own(
      np.take(
        picked.ref,
        np.argsort(np.where(sampled.ref, picked.ref, picked.ref.add(n))),
        0,
      ),
    );
    return { order, count: size };
  },
};
