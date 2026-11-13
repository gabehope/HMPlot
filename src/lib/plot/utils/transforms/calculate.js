import {
  evaluateExpression,
  expressionHasTween,
  expressionFields,
  expressionHasReduction,
  pruneConstantCache,
  releaseReductionCache,
  expressionNeedsRows,
} from "../expressions.js";
import { animationCorrespondenceCache } from "../animationGroup.js";
import { tweenHandler, tweenPaths, tweenColumnFacts } from "../tweenState.js";
import {
  readsOffsets,
  scopeReadsOffsets,
} from "../../interaction/offsetDependencies.js";
import { gridRewrites } from "../gridCalculate.js";
import { Array as JaxArray } from "@hmplot/jax";
import { ownCacheEntry } from "../cacheEntries.js";

const tweens = (config) =>
  Object.values(config.columns ?? {}).some(expressionHasTween);

/**
 * Calculate: new columns from expressions over the same rows. Over hidden rows every row is
 * computed (reductions over the visible ones), and the input's mask carries through. Over a
 * grid table it keeps, rewrites or drops the grid per column (gridCalculate.js, TODO 51).
 */
export const calculate = {
  tweens: true,
  reads: (config) =>
    config.__animationGroup != null && tweens(config) ? "compacted" : "rows",
  // Tween state follows rows; a bucket's rows change with every selection (TODO 28). A grid's
  // rows are its cells in order: a bucket's are not.
  buckets: (config, scope) =>
    !tweens(config) &&
    !Object.values(config.columns ?? {}).some(expressionNeedsRows) &&
    !scope?.padded?.()?.grid,
  output: "sameRows",
  // It evaluates its columns' expressions (dependencies.js).
  dependencies: (settings) => ({
    expressions: Object.values(settings.columns ?? {}),
  }),
  // Each output is its expression over the same row (lineage, TODO 38.2).
  lineage: (config) =>
    Object.fromEntries(
      Object.entries(config.columns ?? {}).map(([name, expression]) => [
        name,
        { kind: "expr", expression },
      ]),
    ),
  validate(config) {
    if (
      !config.columns ||
      typeof config.columns !== "object" ||
      Array.isArray(config.columns)
    )
      throw Error("Calculate requires a columns object.");
    for (const [name, expression] of Object.entries(config.columns)) {
      if (!name) throw Error("Calculate output names cannot be empty.");
      if (expression?.__hmplotAnimate)
        throw Error(
          `Calculate column ${name}: animate() belongs on a mark channel, not a Calculate output; use tween() here.`,
        );
    }
  },
  async run(input, config, { cleanup, cache, viewState, own, evaluator }) {
    const { scope, source } = input;
    const groups = cache
      ? (cache.animationCorrespondence ??= animationCorrespondenceCache())
      : animationCorrespondenceCache();
    if (cache)
      ownCacheEntry(cache, "animationCorrespondence", (value) =>
        value.dispose(),
      );
    else cleanup(() => groups.dispose());
    const correspondence = tweens(config)
      ? await groups.prepare(scope, config.__animationGroup)
      : null;
    const constantCache = cache
      ? (cache.expressionConstants ??= new Map())
      : new Map();
    const constantUsed = new Set();
    if (!cache) cleanup(() => releaseReductionCache(constantCache));
    else ownCacheEntry(cache, "expressionConstants", releaseReductionCache);
    // The cache owns immutable constants; evaluations take their own references. Pruning on
    // success or failure retires changed seeds/shapes without invalidating retained outputs.
    // Over a grid table: which columns rewrite its coordinates (made when read), and its grid.
    const rewrites = await gridRewrites(input, config.columns, {
      viewState,
      own,
      evaluator,
    });
    const columns = {},
      columnMetadata = {},
      columnFacts = {},
      liveColumns = new Set();
    const tweenCache = cache ? (cache.tweens ??= new Map()) : new Map();
    if (cache)
      ownCacheEntry(cache, "tweens", (tweens) =>
        tweens.forEach((entry) => entry.dispose()),
      );
    if (!cache)
      cleanup(() => {
        tweenCache.forEach((entry) => entry.dispose());
        tweenCache.clear();
      });
    const paths = new Set();
    for (const [name, expression] of Object.entries(config.columns))
      for (const [node, path] of tweenPaths(expression, `columns/${name}`))
        if (node.op === "tween") {
          paths.add(path);
          paths.add(`__target/${path}`);
        }
    for (const [path, entry] of tweenCache)
      if (!paths.has(path)) {
        entry.dispose();
        tweenCache.delete(path);
      }
    // This Calculate's producers own the local deadline (the component schedules it).
    let liveUntil = -Infinity;
    // A live drag of the table's offsets changed what this run reads (TODO 38 decision 7).
    // The offsets it last saw advance only when it runs: one that does not read them would
    // take a later change for the drag's.
    const arrive =
      Boolean(scope.identity?.offsets?.draggedSince(cache?.offsetsVersion)) &&
      (readsOffsets(config.columns) || scopeReadsOffsets(scope));
    try {
      for (const [name, expression] of Object.entries(config.columns)) {
        if (!rewrites.eager.has(name)) continue;
        // The expression producer owns all its tweens, including a root tween. Every
        // ordinary reader sees this revision's current values; state never leaves the cache.
        const time = config.__viewState?.time ?? 0;
        const hasTween = expressionHasTween(expression);
        const hook = hasTween
          ? tweenHandler({
              cache: tweenCache,
              correspondence,
              scope,
              time,
              viewState,
              root: expression,
              prefix: `columns/${name}`,
              landed: Boolean(config.__viewState?.landed),
              arrive,
              moving: (producer) => {
                liveUntil = Math.max(liveUntil, producer.end);
              },
            })
          : undefined;
        // Every row read, hidden ones included (reductions over the visible ones).
        const evaluated = evaluateExpression(expression, scope, {
          evaluator,
          rowCount: input.length,
          viewState,
          tween: hook,
          constantCache,
          constantUsed,
        });
        const fields = expressionFields(
          expression,
          new Set(typeof expression === "string" ? [expression] : []),
        );
        if (
          hasTween ||
          [...fields].some((field) => source.liveColumns?.has?.(field))
        )
          liveColumns.add(name);
        try {
          // The table owns only its published column, not every temporary in the expression.
          // Retaining the final array first also preserves lazy dependencies and old outputs.
          const value = evaluated.value;
          columns[name] =
            value?.codes instanceof JaxArray
              ? { ...value, codes: own(value.codes.ref) }
              : value instanceof JaxArray
                ? own(value.ref)
                : value;
          if (expression?.op === "tween") {
            const facts = tweenColumnFacts(
              tweenCache.get(`columns/${name}`),
              cleanup,
            );
            if (facts) columnFacts[name] = facts;
          }
          if (evaluated.metadata) columnMetadata[name] = evaluated.metadata;
        } finally {
          evaluated.dispose();
        }
      }
      if (cache) cache.offsetsVersion = scope.identity?.offsets?.version;
      return {
        columns,
        columnMetadata,
        columnFacts,
        liveColumns,
        liveUntil,
        followsMask: Object.values(config.columns).some(expressionHasReduction),
        grid: rewrites.grid,
        lazyColumns: rewrites.lazy,
        ...(rewrites.dropped
          ? { view: { gridDropped: rewrites.dropped } }
          : {}),
      };
    } finally {
      pruneConstantCache(constantCache, constantUsed);
    }
  },
};
