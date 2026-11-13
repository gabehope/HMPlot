// @ts-check
/**
 * @typedef {import('../dataViewTypes.js').RowScope} RowScope
 * @typedef {import('../dataViewTypes.js').DataView} DataView
 * @typedef {import('@hmplot/jax').Array} JaxArray
 * @typedef {import('./transformTypes.js').TransformConfig} TransformConfig
 * @typedef {import('./transformTypes.js').ViewPublication} ViewPublication
 */
import { expressionEvaluator } from "../expressionPlans.js";
import { numpy as np } from "@hmplot/jax";
import {
  createDataView,
  bucketedRows,
  scalar,
  categoryColumn,
} from "../dataView.js";
import { asArray, shapeOf } from "../data.js";
import { deviceScalar } from "../deviceParams.js";
import { check, rename, configViewState } from "./common.js";

// Scheduling belongs to the transform that owns a producer. The table's generic
// liveUntil also includes ancestors and is not an instruction to start another clock.
/** @type {WeakMap<object, number>} */
const producerDeadlines = new WeakMap();
/** @param {object} view */
export const transformProducerDeadline = (view) =>
  producerDeadlines.get(view) ?? -Infinity;

/** A field prop given as numbers (an array, typed array or device array), not a column name.
 * A plain array may hold null (missing, NaN) and booleans (0 and 1), as a mark's channel may.
 * @param {any} value */
export const valuesGiven = (value) =>
  value !== null &&
  typeof value === "object" &&
  !categoryColumn(value) &&
  (Array.isArray(value)
    ? value.length > 0 &&
      value.every(
        (v) => v == null || typeof v === "number" || typeof v === "boolean",
      )
    : ArrayBuffer.isView(value) || Array.isArray(value?.shape));

/** Values given for a field, as float32 (null is NaN, a boolean 0 or 1). @param {any} value */
const fieldValues = (value) =>
  asArray(
    Array.isArray(value)
      ? Float32Array.from(value, (v) => (v == null ? NaN : Number(v)))
      : value,
  ).astype(np.float32);

/**
 * Values given for a field (one per row of the source), at `rows`'s rows: NaN where a row has no
 * source row. For a reader outside a transform's run, as a Facet's shared bins.
 * @param {any} value @param {RowScope} rows
 */
export function alignedValues(value, rows) {
  const values = fieldValues(value),
    source = rows.sourceIndices?.() ?? null;
  if (!source) return values;
  return np.where(
    source.ref.greaterEqual(0),
    np.take(values, np.maximum(source, 0), 0),
    NaN,
  );
}

/** @param {unknown} value @param {readonly string[]} path @returns {unknown} */
function fieldAt(value, path) {
  for (const key of path) {
    if (!value || typeof value !== "object") return undefined;
    value = /** @type {Record<string, unknown>} */ (value)[key];
  }
  return value;
}

/** Copy only the path to an aligned field; authored nested objects/arrays stay unchanged.
 * @param {unknown} value @param {readonly string[]} path @param {unknown} replacement
 * @returns {unknown}
 */
function withField(value, path, replacement) {
  if (!path.length) return replacement;
  const source = /** @type {Record<string, unknown>} */ (value);
  const copy = /** @type {Record<string, unknown>} */ (
    Object.assign(Array.isArray(value) ? [] : {}, source)
  );
  copy[path[0]] = withField(source?.[path[0]], path.slice(1), replacement);
  return copy;
}

/**
 * The definition's `fields` given as values (TODO 130.1: transforms take arrays as marks do),
 * one per row of the transform's data in its source order, gathered to the rows the transform
 * reads (a Filter's physical or visible-first rows). Owned by the run (`own`). Throws, naming
 * the transform and prop, when the length is not the data's.
 * @param {string} kind @param {import("./transformTypes.js").TransformDefinition} definition
 * @param {RowScope} scope @param {RowScope} base @param {TransformConfig} config
 * @param {(a: JaxArray) => JaxArray} own
 */
function alignedFields(kind, definition, scope, base, config, own) {
  const given = (definition.fields ?? [])
    .map((field) => (typeof field === "string" ? [field] : field))
    .filter((path) => valuesGiven(fieldAt(config, path)));
  if (!given.length) return config;
  const sourceRows = base.sourceIndices?.() ?? null,
    sourceLength = scope.sourceLength ?? scope.length;
  let out = config;
  try {
    for (const path of given) {
      const value = fieldAt(config, path);
      const length = shapeOf(value)[0];
      const values = fieldValues(value);
      let aligned;
      if (sourceRows && length === sourceLength)
        aligned = own(np.take(values, np.maximum(sourceRows.ref, 0), 0));
      else if (!sourceRows && length === base.length) aligned = own(values);
      else {
        values.dispose();
        throw Error(
          `${kind}.${path.join(".")} has ${length} values; its data has ${sourceRows ? sourceLength : base.length} rows. Give one value per row, or a column name.`,
        );
      }
      out = /** @type {TransformConfig} */ (withField(out, path, aligned));
    }
  } finally {
    sourceRows?.dispose();
  }
  return out;
}

/**
 * THE TRANSFORM CONTRACT (TODO 31.2). A transform is table in, table out. Its input may have
 * hidden rows (a Filter's); the transform declares how it reads them, and the runner converts
 * the input to that form, runs it, and builds the output view, deriving the view's metadata
 * (mask, prefix, followsMask) from the declaration. No transform sets those by hand.
 *
 * A definition (utils/transforms/<kind>.js, listed in index.js):
 *   reads: "rows" | "visibleFirst" | "compacted", or a function of the config giving one:
 *     - rows: the input's physical rows, hidden ones included, with their `valid` mask;
 *     - visibleFirst: the same rows with the visible ones first, in order (input.prefix);
 *     - compacted: the visible rows only (the input's compacted rows).
 *   buckets(config, scope): false when a Filter's bucket must not stand in for its rows. A bucket is a
 *     smaller capacity of the visible-first form (TODO 31.1), so by default it may.
 *   output: "sameRows" | "reordered" | "subset" | "aggregate" | "newRows".
 *   validate(config): throws on a bad config before anything runs.
 *   fields: optional; the props that take a column name or one number per row of the data
 *     (alignedFields gathers the values to the rows read before run sees them).
 *   categoryAxis(config): optional; "x" or "y" when its groups sit at their categories' places
 *     on that axis: the Transform component passes the frame's order as `__categoryOrder`.
 *   valueAxis(config, source): optional; 0 or 1, the axis its rows' values run along, for a
 *     template's connection attachments (TODO 130.2).
 *   dependencies(settings): optional; what its settings read besides the input (expressions,
 *     fields, interaction resources), which re-run it when they change (dependencies.js).
 *   names(config, source, columns): optional display names of its outputs, keyed like `columns`
 *     (before `as`): a string, or null for an unnamed output. Axes are titled by them (TODO 21
 *     D7): a Bin's edges are the binned field. Outputs without one are named by their key.
 *   renames: true when the definition applies an object `as` itself, keying its columns, names,
 *     provenance, lineage and fold by the final names (Fold, Summary, Density); the
 *     runner then leaves them as they are. Otherwise the runner renames them by `as`.
 *   run(input, config, context): the work; it returns the output (below).
 *
 * The input: scope (the rows read: get, resolve, has, interactionResource, ...), source (the
 * input view as given), length (rows read), valid (int32 0/1 per row read, or null when every
 * row is visible), count (visible rows, a host number), prefix (the visible rows come first).
 * Mask reductions with common.js's helpers (visibleRows, whereVisible), which treat a null
 * valid as every row visible: one code path whether or not rows are hidden.
 * The context: own(array) (released with the output), release(array) (early), cleanup(fn),
 * cache (the transform's cache, across runs), signal, boundary() (yield, then check for
 * cancellation), maxBytes (the storage-buffer limit), viewState, run(kind, view, config) (a
 * nested transform: Hexbin groups its cells with a Group).
 *
 * run returns { columns, columnMetadata?, liveColumns?, liveUntil? } and, by output:
 *   sameRows: the output's rows are the rows read. `valid` (int32 0/1, owned) and `count`
 *     replace the input's mask (a Filter; `bucketed` builds its bucket); otherwise the input's
 *     mask carries through. `followsMask`: the values depend on which rows are visible (a
 *     reduction over them).
 *   reordered: `order` (int32, owned), the rows read in the output's order. Over hidden rows the
 *     runner puts the visible ones first: a visible-first view of the same capacity, whose
 *     count reaches kernels from a buffer.
 *   subset: `order` (int32, owned), some of the rows read in the output's order, the first
 *     `count` of them visible (a Sample: its capacity does not follow the visible rows).
 *   aggregate: a row per group (`columns`), with `provenance` mapping groups to the rows read
 *     (provenance.rows: input.scope when rows are hidden). `valid` (owned) hides groups.
 *   newRows: `order` (int32, owned), rows read in any order and any number of times; each keeps
 *     its row's visibility (`count`: the visible ones, else read back). A definition that
 *     repeats rows says `repeatsRows: true` (a tween cannot follow them by source row); a Fold
 *     returns `fold` ({fields, key, value}) for a Facet split by its key.
 * Any output may return `view`, properties for its view (a Density's topology), `grid` (the
 * grid of its rows: an Interpolate's or a Density's; null drops its input's, TODO 51) and
 * `lazyColumns` ({ name: () => array }: own columns made on first read).
 * A `valid` without its `count` has the count read back. `output` may be a function of the
 * config (Bin's mode).
 */
/**
 * @param {string} kind
 * @param {import("./transformTypes.js").TransformDefinition} definition
 * @param {RowScope} scope
 * @param {TransformConfig} config
 * @param {import("./transformTypes.js").RunOptions & {runTransform: import("./transformTypes.js").RunTransform}} options
 */
export async function runDefinition(
  kind,
  definition,
  scope,
  config,
  { signal, maxBytes, cache, runTransform },
) {
  definition.validate?.(config);
  const form =
    typeof definition.reads === "function"
      ? definition.reads(config)
      : definition.reads;
  const rows =
    definition.buckets?.(config, scope) === false ? scope : bucketedRows(scope);
  const physical =
    form === "rows"
      ? (rows.padded?.() ?? null)
      : form === "visibleFirst"
        ? (rows.prefixed?.() ?? null)
        : form === "compacted"
          ? null
          : undefined;
  if (physical === undefined)
    throw Error(
      `${kind} reads "${form}": expected rows, visibleFirst or compacted.`,
    );
  const base = physical ?? scope,
    n = base.length;
  if (n * 16 > maxBytes)
    throw Error(
      "Transform working buffers exceed the GPU storage-buffer limit.",
    );
  /** @type {JaxArray[]} */
  const owned = [];
  /** @type {(() => void)[]} */
  const cleanups = [];
  /** @template {JaxArray} T @param {T} a @returns {T} */
  const own = (a) => (owned.push(a), a);
  /** @type {import("./transformTypes.js").TransformInput} */
  const input = {
    scope: base,
    source: scope,
    length: n,
    valid: physical?.valid ?? null,
    count: scope.length,
    prefix: Boolean(physical?.prefix),
    // The rows a bucket's rows come from, for grouping (inputGroups; TODO 29.10).
    groupSource:
      physical && rows !== scope ? (rows.bucketSource ?? null) : null,
  };
  const evaluator = expressionEvaluator(cache ?? {});
  if (!cache) cleanups.push(() => evaluator.dispose());
  /** @type {import("./transformTypes.js").TransformContext} */
  const context = {
    evaluator,
    own,
    cleanup: (release) => cleanups.push(release),
    /** Releases an array `own` took, before the output does (an intermediate replaced in a loop). */
    release(array) {
      const at = owned.indexOf(array);
      if (at >= 0) owned.splice(at, 1)[0].dispose();
    },
    cache,
    signal,
    maxBytes,
    viewState: configViewState(config),
    /** Another transform over `input` (a view), with this run's signal and limits. */
    run: (kind, input, config, options) =>
      runTransform(kind, input, config, {
        signal,
        maxBytes,
        cache: options?.cache,
      }),
    async boundary() {
      check(signal);
      await new Promise((resolve) => setTimeout(resolve, 0));
      check(signal);
    },
  };
  // A mask's visible count: given, or read back (one readback).
  /** @param {JaxArray} valid @param {number | undefined} count */
  const visible = async (valid, count) =>
    count ?? (valid.shape[0] ? await scalar(np.sum(valid.ref)) : 0);
  try {
    const result = await definition.run(
      input,
      alignedFields(kind, definition, scope, base, config, own),
      context,
    );
    check(signal);
    const output =
      typeof definition.output === "function"
        ? definition.output(config, result)
        : definition.output;
    /** @type {ViewPublication} */
    const out = {
      columns: result.columns ?? {},
      columnMetadata: result.columnMetadata ?? {},
      columnFacts: result.columnFacts,
      liveColumns: result.liveColumns,
      liveUntil: result.liveUntil,
      provenance: result.provenance,
      foldInfo: result.fold,
      names: definition.names?.(config, scope, result.columns ?? {}) ?? {},
      renamed: Boolean(definition.renames),
      repeatsRows: Boolean(definition.repeatsRows),
      extras: result.view,
      grid: result.grid,
      lazyColumns: result.lazyColumns ?? null,
      rowMapping: result.rowMapping ?? null,
      viewParent: base,
    };
    if (output === "sameRows") {
      if (result.valid) {
        out.padded = result.valid;
        out.paddedCount = await visible(result.valid, result.count);
        out.bucketed = result.bucketed;
      } else if (input.valid) {
        out.padded = own(input.valid.ref);
        out.paddedCount = scope.length;
        out.prefix = input.prefix;
      }
      // Reusing the inherited mask preserves membership. A numerical publication must
      // not look like a fresh selection to graph/layout structural caches.
      if (!result.valid) out.topology = scope.topology;
      // Only hidden rows here can make values follow a mask: without them, a downstream Filter's
      // marks would read this as their mask moving the values, and re-prepare on every move.
      out.followsMask = Boolean(input.valid && result.followsMask);
    } else if (output === "reordered" || output === "subset") {
      const selectedOrder = result.order;
      if (!selectedOrder)
        throw Error(`${kind}: pass an order buffer for ${output} rows.`);
      let order = selectedOrder;
      const count = result.count ?? scope.length;
      if (output === "reordered" && input.valid) {
        // The visible rows first, in the output's order (a last stable sort of "hidden"), then
        // the hidden ones: nothing downstream changes length as rows are hidden or shown.
        const hidden = np
          .take(input.valid.ref, order.ref, 0)
          .equal(0)
          .astype(np.int32);
        order = own(np.take(order.ref, np.argsort(hidden), 0));
      }
      if (input.valid || count < order.shape[0]) {
        // A visible-first view of the rows `order` gives: its count reaches kernels from a
        // buffer, so nothing downstream changes length as the count does.
        const ordered = createDataView(base, { indices: order });
        cleanups.push(() => ordered.dispose());
        out.viewParent = ordered;
        out.padded = own(
          np
            .arange(order.shape[0])
            .astype(np.int32)
            .less(deviceScalar(count, { dtype: "int32" }))
            .astype(np.int32),
        );
        out.paddedCount = count;
        out.prefix = true;
        out.followsMask = true;
      } else out.indices = order;
    } else if (output === "aggregate") {
      // A row per group, over the input as given. `valid` hides groups (those with no visible
      // row, or empty bins); the view then follows the mask (createDataView).
      out.aggregate = true;
      out.viewParent = scope;
      if (result.valid) {
        out.padded = result.valid;
        out.paddedCount = await visible(result.valid, result.count);
      }
    } else if (output === "newRows") {
      if (!result.order)
        throw Error(`${kind}: pass an order buffer for new rows.`);
      // Rows of the rows read, in any order and any number of times (`order`), each keeping its
      // row's visibility.
      if (input.valid) {
        const rows = createDataView(base, {
          indices: result.order,
          repeatsRows: out.repeatsRows,
        });
        cleanups.push(() => rows.dispose());
        out.viewParent = rows;
        out.padded = own(np.take(input.valid.ref, result.order.ref, 0));
        out.paddedCount = await visible(out.padded, result.count);
      } else out.indices = result.order;
    } else throw Error(`${kind}: unknown output "${output}".`);
    const view = finishView(scope, kind, config, out, owned, cleanups);
    producerDeadlines.set(view, result.liveUntil ?? -Infinity);
    // What the output's columns are made from (TODO 38.2, interaction/channelWriteback.js), by output name.
    const lineage = definition.lineage?.(config, scope);
    view.step = {
      kind,
      config,
      lineage:
        lineage && (out.renamed ? lineage : rename(lineage, renaming(config))),
    };
    return view;
  } catch (error) {
    owned.forEach((a) => a.dispose());
    cleanups.forEach((release) => release());
    throw error;
  }
}

/**
 * The output names `as` maps a transform's outputs to ({ value: "amount" }), applied once (TODO
 * 64): here, unless the definition says `renames: true` and keys its outputs (columns, names,
 * provenance, lineage, fold) by their final names itself. A string `as` (Normalize's, Window's)
 * or a list (Pivot's) names the outputs in the definition itself.
 */
/** @param {TransformConfig} config */
const renaming = (config) =>
  config.as && typeof config.as === "object" && !Array.isArray(config.as)
    ? config.as
    : undefined;

/**
 * A transform's output view over `out.viewParent` (default: its input `scope`), with what every
 * transform's output carries: the renaming by `as`, live columns, live, the pipeline, a
 * Filter's bucket and a Fold's source. `owned` and `cleanups` are released with the view.
 * On an error the view (if built) is disposed; the caller releases `owned` and `cleanups`.
 */
/**
 * @param {RowScope} scope @param {string} kind @param {TransformConfig} config
 * @param {ViewPublication} out @param {JaxArray[]} owned @param {(() => void)[]} cleanups
 */
export function finishView(scope, kind, config, out, owned, cleanups) {
  const {
    viewParent = scope,
    indices = null,
    padded = null,
    paddedCount = undefined,
    columns = {},
    columnMetadata = {},
    columnFacts = {},
    aggregate = false,
    provenance,
    followsMask = false,
    prefix = false,
    liveUntil = -Infinity,
    liveColumns = new Set(),
    bucketed = null,
    foldInfo = null,
    repeatsRows = false,
    extras = undefined,
    names = {},
    renamed = false,
    grid = undefined,
    lazyColumns = null,
    rowMapping = null,
    topology = undefined,
  } = out;
  const as = renamed ? undefined : renaming(config);
  /** @type {DataView | undefined} */
  let view;
  try {
    if (provenance?.fields && as)
      provenance.fields = provenance.fields.map((k) => as[k] ?? k);
    if (padded) {
      const at = owned.indexOf(padded);
      if (at >= 0) owned.splice(at, 1); // the view owns its mask
    }
    const published = createDataView(viewParent, {
      indices,
      mask: padded,
      count: paddedCount,
      columns: rename(columns, as),
      names: rename(names, as),
      columnMetadata: rename(columnMetadata, as),
      aggregate,
      provenance,
      followsMask,
      prefix,
      live:
        Boolean(config.__viewState?.live) ||
        liveUntil > (config.__viewState?.time ?? 0),
      // A Fold and a grid Dodge repeat source rows (a tween cannot follow them by source row).
      repeatsRows,
      grid,
      lazyColumns,
      rowMapping,
    });
    view = published; // Only the catch path needs a possibly unconstructed published.
    published.columnFacts = rename(columnFacts, as);
    if (topology !== undefined) published.topology = topology;
    // Live dependency names carry no producer state. A rewritten column replaces its
    // inherited dependency; aliases name the published columns, as normal metadata does.
    published.liveColumns = new Set([
      ...(aggregate
        ? []
        : [...(scope.liveColumns ?? [])].filter(
            (key) => !Object.hasOwn(columns, key),
          )),
      ...[...liveColumns].map((key) => as?.[key] ?? key),
    ]);
    const activeUntil = Math.max(liveUntil, scope.liveUntil ?? -Infinity);
    if (activeUntil > (config.__viewState?.time ?? 0))
      published.liveUntil = activeUntil;
    // Properties a transform puts on its view (a Density's topology).
    if (extras) Object.assign(view, extras);
    published.pipeline = [...(scope.pipeline ?? []), { kind, config }];
    if (bucketed) {
      // The Filter's bucket on first use; it shares the output's pipeline and lifetime.
      const build = bucketed;
      /** @type {DataView | null} */
      let bucket = null,
        disposed = false;
      published.bucketed = () => {
        if (disposed) throw Error("Data view has been disposed.");
        if (!bucket) {
          const created = build();
          bucket = created;
          created.pipeline = published.pipeline;
          created.liveColumns = published.liveColumns;
          created.liveUntil = published.liveUntil;
          cleanups.push(() => created.dispose());
        }
        return bucket;
      };
      cleanups.push(() => {
        disposed = true;
      });
    }
    if (foldInfo) {
      // A Facet split by the key builds one cell per field over these source rows instead of
      // the folded ones (partitionFacets), so a brush in a cell constrains the real field.
      // The output names are the columns' names after the `as` renaming above.
      /** @param {string} name */
      const named = (name) => as?.[name] ?? name;
      const key = named(foldInfo.key),
        value = named(foldInfo.value);
      if (key !== value)
        published.fold = {
          output: published,
          source: scope,
          fields: foldInfo.fields,
          key,
          value,
        };
    }
    published.onDispose = () => {
      for (const a of owned.splice(0)) a.dispose();
      cleanups.splice(0).forEach((f) => f());
      published.fold = undefined;
    };
    return published;
  } catch (error) {
    view?.dispose();
    throw error;
  }
}
