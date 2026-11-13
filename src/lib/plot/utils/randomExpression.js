// @ts-check
import { random as rng } from "@hmplot/jax";
import { isExpression } from "./names.js";
import { isConstantSubtree, hostValue } from "./viewState.js";

/** @typedef {"uniform" | "normal" | "exponential"} RandomDistribution
 * @typedef {import("./expressionPlanTypes.js").CachedExpressionValue} CachedExpressionValue
 * @typedef {import("./expressionPlanTypes.js").ExpressionValueCache} ExpressionValueCache
 * @typedef {import("./expressionPlanTypes.js").ExpressionCacheKey} ExpressionCacheKey
 * @typedef {{$expression_options?: unknown, distribution?: unknown}} RandomOptionsInput
 */
/** @type {readonly RandomDistribution[]} */
const DISTRIBUTIONS = ["uniform", "normal", "exponential"];

/** @param {unknown} seed @returns {number} */
export function checkRandomSeed(seed) {
  if (
    !(
      /** @type {(value: unknown) => value is number} */ (Number.isInteger)(
        seed,
      )
    ) ||
    seed < 0 ||
    seed > 4294967295
  )
    throw Error(
      "random() seed must be an integer from 0 to 4294967295; pass a number or a scalar input, not a table column.",
    );
  return seed;
}

/** Opaque expression options, so distribution names never become column dependencies.
 * @param {unknown} [options]
 * @returns {Readonly<{__expressionLiteral: true, distribution: RandomDistribution}>} */
export function randomOptions(options = {}) {
  options =
    /** @type {RandomOptionsInput | null | undefined} */ (options)
      ?.$expression_options ?? options;
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw Error(
      'random() options must be an object; pass {seed: 7, distribution: "normal"}.',
    );
  for (const name of Object.keys(options))
    if (!["seed", "distribution", "__expressionLiteral"].includes(name))
      throw Error(
        `random() does not accept ${JSON.stringify(name)}; pass seed and distribution.`,
      );
  const distribution =
    /** @type {RandomOptionsInput} */ (options).distribution === undefined
      ? "uniform"
      : /** @type {RandomOptionsInput} */ (options).distribution;
  if (!DISTRIBUTIONS.includes(/** @type {RandomDistribution} */ (distribution)))
    throw Error(
      'random() distribution must be "uniform", "normal" or "exponential"; pass a standard distribution name.',
    );
  return Object.freeze({
    __expressionLiteral: true,
    distribution: /** @type {RandomDistribution} */ (distribution),
  });
}

/** @param {unknown} seed @returns {number} */
export function randomSeed(seed) {
  if (isExpression(seed)) {
    if (!isConstantSubtree(seed))
      throw Error(
        "random() seed must be an integer from 0 to 4294967295; pass a number or a scalar input, not a table column.",
      );
    seed = hostValue(seed);
  }
  return checkRandomSeed(seed);
}

/** Pure seeded draws. The cache owns the stored reference; each evaluation receives its own.
 * Without a cache, the returned array transfers directly to the evaluation's owner.
 * The evaluator selects an active cache and omits maps that have already been retired.
 * @param {unknown} seed @param {unknown} options @param {unknown} rows
 * @param {ExpressionValueCache} [cache] @param {Set<ExpressionCacheKey>} [used]
 * @returns {CachedExpressionValue} */
export function randomValues(seed, options, rows, cache, used) {
  seed = randomSeed(seed);
  const { distribution } = randomOptions(options);
  if (
    !(
      /** @type {(value: unknown) => value is number} */ (Number.isInteger)(
        rows,
      )
    ) ||
    rows < 0 ||
    rows > 2147483647
  )
    throw Error(
      "random() needs a table row count; use it in Calculate or a mark with data, or add Data(rows=...).",
    );
  const key = `random:${rows}:${seed}:${distribution}`;
  used?.add(key);
  /** @type {CachedExpressionValue | undefined} */
  let entry = cache?.get(key);
  if (!entry) {
    entry = {
      value: rng[distribution](rng.key(/** @type {number} */ (seed)), [rows]),
      metadata: { type: "numeric" },
      constant: true,
    };
    cache?.set(key, entry);
  }
  return { ...entry, value: cache ? entry.value.ref : entry.value };
}
