// @ts-check
import { jaxTransformValid } from "./scaleTransforms.js";
import { isGeometryColumn } from "./geoData.js";
import { numpy as np, Array as JaxArray, getWebGPUDevice } from "@hmplot/jax";
import { createDataScope, isLiteral } from "./categorical.js";
import { asArray, shapeOf } from "./data.js";
import {
  ANY_INTERACTION_FIELDS,
  aggregateMembership,
  isVirtualField,
  virtualRevision,
  brushExtentField,
  brushExtentColumn,
  brushExtentMetadata,
} from "./interaction.js";
import { isOffsetField, offsetColumn, offsetField } from "./offsets.js";
import { deviceScalar } from "./deviceParams.js";
import { finiteRange, finiteRangeWhere } from "./reduce.js";
import { planProgram } from "./programs.js";
import { isCoordinate, gridDim } from "./gridModel.js";
import { coordinateColumn } from "./gridTable.js";
import { nodeField } from "./names.js";
import {
  deriveViewMetadata,
  forwardViewMetadata,
  snapshotViewMetadata,
} from "./viewMetadata.js";
import { createGatherCache } from "./gatherCache.js";

/**
 * @typedef {import('./dataViewTypes.js').RowScope} RowScope
 * @typedef {import('./dataViewTypes.js').DataView} DataView
 * @typedef {import('./dataViewTypes.js').PhysicalScope} PhysicalScope
 * @typedef {import('./dataViewTypes.js').Column} Column
 * @typedef {import('./dataViewTypes.js').DeviceColumn} DeviceColumn
 * @typedef {import('./dataViewTypes.js').GatheredColumn} GatheredColumn
 * @typedef {import('./dataViewTypes.js').RowProvenance} RowProvenance
 * @typedef {import('./dataViewTypes.js').MaskedRowMapping} MaskedRowMapping
 */

let nextViewVersion = 0;
// Only transparent views may be skipped when comparing row identity. Indices, masks
// and aggregates are barriers; their common source alone cannot prove the same rows.
/** @type {WeakMap<import("./dataViewTypes.js").RowIdentity, RowScope>} */
const rowParents = new WeakMap();
// Selecting views only compare through the exact immutable mapping, never its values
// or a mutable host array. Input row identity remains part of the certificate.
/** @type {WeakMap<import("./dataViewTypes.js").RowIdentity, {parent: RowScope, mapping: object, prefix: boolean, length: number}>} */
const rowSelections = new WeakMap();
/** @type {WeakSet<object>} */
const immutableRowMappings = new WeakSet();
/** @param {unknown} value @returns {value is import("./dataViewTypes.js").DictionaryColumn | import("./dataViewTypes.js").CategoryHostColumn} */
export const categoryColumn = (value) =>
  Boolean(
    value &&
    typeof value === "object" &&
    "categories" in value &&
    value.categories,
  ) ||
  (Array.isArray(value) &&
    value.some((v) => typeof v === "string" || typeof v === "boolean"));

/** @param {Column} value @returns {value is import('./dataViewTypes.js').DeviceDictionary} */
const deviceDictionary = (value) => value.codes instanceof JaxArray;

/** @overload
 * @param {RowScope} parent
 * @param {import('./dataViewTypes.js').DataViewOptions & {aggregate: true, provenance: RowProvenance}} options
 * @returns {import('./dataViewTypes.js').AggregateDataView}
 */
/** @overload
 * @param {RowScope} parent
 * @param {import('./dataViewTypes.js').DataViewOptions} [options]
 * @returns {DataView}
 */
/**
 * THE MODEL: a table can have hidden rows. A Filter keeps its input's rows and hides the ones it
 * drops, so lengths downstream do not change as a brush moves (every new length compiles new GPU
 * kernels). `view.length` is the number of visible rows, a host number.
 *
 * Three invariants:
 * - Real rows: every physical row is a real row of the source (a Filter keeps its parent's rows;
 *   a visible-first ordering only reorders them). Hidden rows hold real values, never
 *   sentinels, so group discovery, category dictionaries and extents over them are safe.
 * - Visibility only in the mask: nothing reads meaning from a hidden row's values; every
 *   reduction, count, extent and key is masked by `valid`.
 * - The adapter: get(), keys(), sourceIndices() and every other accessor return the visible
 *   rows COMPACTED, computed on first use and cached. A consumer reads the hidden rows only by
 *   asking: transforms declare it (utils/transforms/runner.js, TODO 31.2), marks through
 *   paddedMode (bound/namedMark.svelte).
 *
 * The storage forms a consumer can ask for:
 * - `view.padded()`: the physical rows, { capacity, valid (int32 0/1), count, prefix, get(key)
 *   (a Filter's are its parent's own columns: no copy), sourceIndices() (-1 where hidden) }.
 * - `view.prefixed()`: the same capacity with the visible rows first, in order (prefix: true;
 *   lines, Sort, Window). A `prefix` view's padded() is already prefixed.
 * - `bucketedRows(view)`: a Filter keeping a small part of a large input also offers
 *   `view.bucketed()`, its visible rows first in a power-of-two capacity (transforms/filter.js
 *   bucketing), built on first call and disposed with the view. Consumers whose work follows the
 *   row count read it; marks that can draw every row keep the Filter's own rows.
 *
 * A view built with `mask` (and its host `count`) has hidden rows; its parent is the physical
 * scope the mask covers, and its own columns (if any) are physical too. Flags carried downstream:
 * `followsMask` (the rows or values depend on which input rows are visible: an aggregate, a
 * reduction; a mark over it cannot just swap its mask), `prefix`, and `live` (the values move
 * with the view clock, TODO 28: marks skip their implicit transition).
 *
 * GRID TABLES (TODO 51, utils/gridModel.js): `view.grid` is the grid of the rows get() returns,
 * the padded form's `grid` that of its physical rows. A view keeps its parent's grid while its
 * rows are the parent's, in order: a Filter's grid lives on its padded form (its compacted rows
 * are a plain long table), and reordering, subsets and aggregates drop it unless they make one
 * (`grid`: an Interpolate's, a Density's; null drops it). `lazyColumns` ({ name: () => array or categorical column }) are own
 * columns made on first read: a grid coordinate a Calculate rewrote, from the new grid.
 *
 * Owns only arrays it creates (and `mask`). Numeric source columns remain borrowed.
 * @param {RowScope} parent
 * @param {import('./dataViewTypes.js').DataViewOptions} [options]
 * @returns {DataView}
 */
export function createDataView(
  parent,
  {
    indices = null,
    mask = null,
    count = undefined,
    columns = {},
    columnMetadata = {},
    names = {},
    aggregate = false,
    provenance = undefined,
    followsMask = false,
    prefix = false,
    live = false,
    repeatsRows = false,
    grid = undefined,
    lazyColumns = null,
    rowMapping = null,
  } = {},
) {
  const version = ++nextViewVersion;
  const releaseParent = parent.retain?.();
  const releaseMapping = rowMapping?.retain();
  // Columns that hold one value for every row of this scope (a Partition group's key).
  // Aggregating transforms drop the columns they did not produce, so these are carried
  // forward and rebuilt at the output's length, keeping `fill="species"` meaningful
  // inside a Density within a Partition.
  const constants = parent.constants;
  /** @type {Map<string, Column>} */
  const cache = new Map();
  /** @type {Set<JaxArray>} */
  const owned = new Set();
  const encoding = createDataScope();
  /** @template {JaxArray} T @param {T} value @returns {T} */
  const own = (value) => (owned.add(value), value);
  const lazyKeys = new Set(Object.keys(lazyColumns ?? {}));
  if (lazyKeys.size) {
    columns = { ...columns };
    for (const [key, make] of Object.entries(lazyColumns ?? {})) {
      /** @type {DeviceColumn | undefined} */
      let made;
      Object.defineProperty(columns, key, {
        enumerable: true,
        get: () => {
          if (!made) {
            made = make();
            own(made.codes ?? /** @type {JaxArray} */ (made));
          }
          return made;
        },
      });
    }
  }
  const masked = mask !== null;
  if (masked) {
    own(mask);
    if (!Number.isInteger(count))
      throw Error("A padded view needs its row count.");
  }
  // Rows chosen from the parent (a subset or an ordering): gathered on read.
  const selecting = Boolean(indices) || masked;
  // The grid of the physical rows (see GRID TABLES above). A column written over a coordinate by
  // a transform that does not say what becomes of the grid drops it.
  const inheritedGrid = aggregate || indices ? undefined : parent.grid;
  const physicalGrid =
    grid !== undefined
      ? (grid ?? undefined)
      : inheritedGrid &&
          Object.keys(columns).some(
            (key) => isCoordinate(inheritedGrid, key) && !lazyKeys.has(key),
          )
        ? undefined
        : inheritedGrid;
  const capacity = mask?.shape[0] ?? parent.length;
  const n = masked
    ? (count ?? 0)
    : (indices?.shape[0] ??
      (aggregate
        ? (shapeOf(
            Object.values(columns)[0]?.codes ?? Object.values(columns)[0],
          )[0] ?? 0)
        : parent.length));
  // A padded view compacts only when a consumer that has not opted in reads its rows.
  let compacted = indices;
  const rowIndices = () => {
    if (compacted) return compacted;
    if (!mask) throw Error("A selecting data view needs indices or a mask.");
    return (compacted = own(
      rowMapping ? rowMapping.indices() : compactIndices(mask, n, prefix),
    ));
  };
  // An aggregate's provenance maps its rows to the rows its codes index (provenance.rows, else
  // the parent). The compacted rows of a padded aggregate are some of its groups: `ids` gives
  // their group, on first use.
  const physicalInfo = provenance ?? parent.provenance;
  const info =
    aggregate && masked && physicalInfo
      ? Object.defineProperty({ ...physicalInfo }, "ids", {
          get: () => rowIndices(),
          enumerable: true,
        })
      : physicalInfo;
  let disposed = false,
    users = 1;
  /** @type {Map<string, string | null>} */
  const forwarded = new Map();
  /** The parent column an own column IS (the same array, e.g. an alias), or null. */
  /** @param {string} key @returns {string | null} */
  function forwardedSource(key) {
    if (lazyKeys.has(key)) return null;
    if (!forwarded.has(key)) {
      const declared = view.step?.lineage?.[key],
        expression =
          declared?.kind === "expr" ? declared.expression : undefined;
      const named =
        typeof expression === "string"
          ? expression.startsWith("$")
            ? null
            : expression.replace(/^:/, "")
          : nodeField(expression);
      const alias = named && !named.startsWith("@") ? named : undefined;
      const candidate = view.fieldIdentity?.[key] ?? alias ?? key;
      forwarded.set(
        key,
        !aggregate &&
          parent.has(candidate) &&
          columns[key] === parent.get(candidate)
          ? candidate
          : null,
      );
    }
    return forwarded.get(key) ?? null;
  }
  /** The host values of a column this view forwards from the Data table (TODO 29.12). */
  /** @param {string} key */
  function hostColumn(key) {
    if (!Object.hasOwn(columns, key))
      return aggregate ? undefined : parent.hostColumn?.(key);
    const source = forwardedSource(key);
    return source !== null ? parent.hostColumn?.(source) : undefined;
  }
  /** @param {string} key */
  function columnIdentity(key) {
    if (!Object.hasOwn(columns, key))
      return aggregate ? undefined : parent.columnIdentity?.(key);
    const source = forwardedSource(key);
    if (source !== null) return parent.columnIdentity?.(source);
    const lineage = view.step?.lineage?.[key];
    if (aggregate && lineage?.preservesValues && lineage.field)
      return parent.columnIdentity?.(lineage.field);
    const definition = view.transformDefinition ?? `view-${version}`;
    return `derived:${parent.identity?.id ?? "unowned"}:${definition}:${JSON.stringify(key)}`;
  }
  /**
   * The display name of a column (axis titles, TODO 21): an alias forwards to the column it is
   * (a Facet's `value` is its field), an output with a declared name takes it (`names`, null for
   * unnamed outputs), and anything else is its own key.
   */
  /** @param {string} key */
  function columnName(key) {
    /** @param {string} field */
    const inherited = (field) =>
      parent.columnName ? parent.columnName(field) : field;
    if (!Object.hasOwn(columns, key))
      return aggregate
        ? constants?.[key] !== undefined
          ? key
          : undefined
        : inherited(key);
    if (Object.hasOwn(names, key)) return names[key];
    const source = forwardedSource(key);
    if (source !== null) return inherited(source) ?? source;
    // A label its metadata carries (a NetCDF variable's or coordinate's, TODO 48.6).
    const label = Object.hasOwn(columnMetadata, key)
      ? columnMetadata[key]?.label
      : gridDim(physicalGrid, key)?.metadata?.label;
    return typeof label === "string" && label ? label : key;
  }
  /**
   * Drop cached values of a virtual column from earlier interaction revisions: keys `prefix`
   * and a revision (an offset column's name may itself contain ":", "@offset:a" must not drop
   * "@offset:a:b").
   */
  /** @param {string} prefix @param {string} cacheKey */
  function evict(prefix, cacheKey) {
    for (const [oldKey, oldValue] of cache)
      if (
        oldKey.startsWith(prefix) &&
        /^\d+$/.test(oldKey.slice(prefix.length)) &&
        oldKey !== cacheKey
      ) {
        const array = oldValue.codes ?? oldValue;
        if (array instanceof JaxArray) {
          owned.delete(array);
          array.dispose();
        }
        cache.delete(oldKey);
      }
  }
  /** @param {string} prefix @param {string} key */
  const virtualKey = (prefix, key) =>
    isVirtualField(key)
      ? `${prefix}${key}:${virtualRevision(parent, key)}`
      : `${prefix}${key}`;
  // Bounds belong to this scope's column identity, including transformed aliases/outputs.
  // Their scalar value needs no gather or aggregate-membership reduction. A column this view
  // passes through unchanged has its parent's (the same identity and rows).
  /** @param {string} key @param {number} length @param {string} [prefix] */
  function extentColumn(key, length, prefix = "") {
    const extent = brushExtentField(key);
    if (
      !selecting &&
      !aggregate &&
      extent &&
      !Object.hasOwn(columns, extent.column)
    )
      return parent.get(key);
    const cacheKey = virtualKey(prefix, key);
    evict(`${prefix}${key}:`, cacheKey);
    let value = cache.get(cacheKey);
    if (value === undefined) {
      value = own(brushExtentColumn(view, key, length));
      cache.set(cacheKey, value);
    }
    return value;
  }
  /**
   * The offset field a read of `key` means here (TODO 38): offsets move a table's own columns,
   * so a column this view forwards (a facet cell's alias, x for weight) reads its source's.
   * A column this view computes has none.
   */
  /** @param {string} key */
  function offsetKey(key) {
    const name = offsetColumn(key);
    if (aggregate)
      throw Error(
        `offset(${JSON.stringify(name)}) is not available after an aggregate: compute moved(${JSON.stringify(name)}) in a Calculate before it.`,
      );
    if (!Object.hasOwn(columns, name)) return key;
    const source = forwardedSource(name);
    if (source === null)
      throw Error(
        `offset(${JSON.stringify(name)}): ${name} is computed by a transform, not a column of the table; read moved() of its source columns before that transform.`,
      );
    return offsetField(source);
  }
  /** An aggregate's interaction and constant columns, `length` rows, `rowInfo` mapping them. */
  /** @param {string} key @param {number} length @param {RowProvenance | undefined} rowInfo @param {string} prefix */
  function aggregateColumn(key, length, rowInfo, prefix) {
    if (isOffsetField(key)) offsetKey(key);
    const virtual = isVirtualField(key),
      cacheKey = virtualKey(prefix, key);
    if (virtual) evict(`${prefix}${key}:`, cacheKey);
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    let value;
    if (virtual) {
      const rows = rowInfo?.rows ?? parent;
      // Virtual membership columns are borrowed device masks, including named interactions.
      const sourceMask = /** @type {JaxArray} */ (rows.get(key));
      if (ANY_INTERACTION_FIELDS.has(key)) {
        // Scope-wide flags are constant, so every group row takes the same value.
        const flag = sourceMask.shape[0]
          ? np.max(sourceMask.ref)
          : np.array(0, { dtype: np.int32 });
        value = own(
          np
            .zeros([length], { dtype: np.int32 })
            .add(flag.ref)
            .astype(np.int32),
        );
        flag.dispose();
      } else
        value = own(
          rowInfo?.codes
            ? aggregateMembership(rowInfo, sourceMask, length)
            : np.zeros([length], { dtype: np.int32 }),
        );
    } else {
      const constant = constants?.[key];
      if (constant === undefined)
        throw Error(`Missing aggregate column: ${key}`);
      value =
        typeof constant === "number"
          ? own(np.full([length], constant, { dtype: np.float32 }))
          : {
              codes: own(np.zeros([length], { dtype: np.int32 })),
              categories: [constant],
            };
    }
    cache.set(cacheKey, value);
    return value;
  }
  /** @param {string} key @returns {Column} */
  function get(key) {
    if (disposed) throw Error("Data view has been disposed.");
    if (brushExtentField(key)) return extentColumn(key, n);
    if (isOffsetField(key)) key = offsetKey(key);
    if (masked) {
      // The adapter: this view's rows gathered from its physical rows.
      const cacheKey = virtualKey("compact:", key);
      if (isVirtualField(key)) evict(`compact:${key}:`, cacheKey);
      let value = cache.get(cacheKey);
      if (value === undefined) {
        value = gather(key, physicalGet(key), rowIndices(), true);
        cache.set(cacheKey, value);
      }
      return value;
    }
    if (Object.hasOwn(columns, key)) return columns[key];
    if (aggregate) return aggregateColumn(key, n, info, "");
    if (!indices) return parent.get(key);
    const virtual = isVirtualField(key),
      cacheKey = virtualKey("", key);
    if (virtual) evict(`${key}:`, cacheKey);
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const value = gather(key, parent.get(key), indices);
    cache.set(cacheKey, value);
    return value;
  }
  /** @param {string} key @param {Column} input @param {JaxArray} order @param {boolean} [physical] @returns {GatheredColumn} */
  function gather(key, input, order, physical = false) {
    if (categoryColumn(input) && !(input?.codes instanceof JaxArray)) {
      input =
        Object.hasOwn(columns, key) || aggregate
          ? encoding.encodeColumn(input, view.metadata(key))
          : (parent.encodedColumn?.(key) ??
            encoding.encodeColumn(input, view.metadata(key)));
    }
    if (
      !physical ||
      !rowMapping ||
      !immutableRowMappings.has(rowMapping) ||
      isVirtualField(key) ||
      isGeometryColumn(input)
    )
      return gatherColumn(input, order, own);
    // The gather depends on source codes, dictionary identity and this immutable mapping.
    // Column metadata stays with the view; encoding a host dictionary above already accounts
    // for a changed domain by producing different codes. Do not serialize its full dictionary.
    const value = rowMapping.gather(input, view.columnIdentity(key) ?? "", () =>
      gatherValues(input, order, (value) => value),
    );
    own(value instanceof JaxArray ? value : value.codes);
    return value;
  }
  // The physical scope of a padded view (see the protocol above), made on first use.
  /** @type {PhysicalScope | null} */
  let physicalScope = null;
  /** @type {PhysicalScope | null} */
  let prefixedScope = null;
  /** @param {string} key @returns {Column} */
  function physicalGet(key) {
    if (disposed) throw Error("Data view has been disposed.");
    if (brushExtentField(key)) return extentColumn(key, capacity, "physical:");
    if (Object.hasOwn(columns, key)) return columns[key];
    if (aggregate)
      return aggregateColumn(key, capacity, physicalInfo, "physical:");
    if (isOffsetField(key)) key = offsetKey(key);
    return parent.get(key);
  }
  /** Describe row `index` of rows read through `getter` (an aggregate's fields). */
  /** @param {number} index @param {(field: string) => Column} getter @param {RowProvenance | undefined} rowInfo */
  async function describeRow(index, getter, rowInfo) {
    if (!rowInfo) return undefined;
    const entries = await Promise.all(
      (rowInfo.fields ?? []).map(async (key) => {
        const value = getter(key);
        const selected = await scalar(
          np.take(
            asArray(value.codes ?? value),
            deviceScalar(index, { dtype: "int32" }),
            0,
          ),
        );
        return [
          key,
          value.categories ? (value.categories[selected] ?? null) : selected,
        ];
      }),
    );
    const group =
      rowInfo.describe && rowInfo.ids
        ? await scalar(
            np.take(
              rowInfo.ids.ref,
              deviceScalar(index, { dtype: "int32" }),
              0,
            ),
          )
        : index;
    return {
      index,
      kind: rowInfo.kind,
      ...Object.fromEntries(entries),
      ...(await rowInfo.describe?.(group)),
    };
  }
  /** The source rows that make up aggregate row `index` (row `index` of `rowInfo.ids`, if any). */
  /** @param {number} index @param {RowProvenance | undefined} rowInfo */
  async function rowContributors(index, rowInfo) {
    const id = rowInfo?.ids
      ? await scalar(
          np.take(rowInfo.ids.ref, deviceScalar(index, { dtype: "int32" }), 0),
        )
      : index;
    if (rowInfo?.contributors) return rowInfo.contributors(id);
    if (!rowInfo?.codes) throw Error("Contributor indices are unavailable.");
    const mask = rowInfo.codes.ref.equal(deviceScalar(id, { dtype: "int32" })),
      selected = await selectedIndices(mask);
    mask.dispose();
    const rows = rowInfo.rows ?? parent,
      source = rows.sourceIndices?.();
    if (source) return np.take(source, selected, 0);
    if (rows.identityRows || !rows.contributors) return selected;
    // The rows codes index are themselves an aggregate's (or rows over one): compose each one's
    // contributors back to the table's rows, never treating group indices as rows (TODO 139.2).
    const indices = Array.from(await selected.ref.data(), Number);
    selected.dispose();
    const parts = await Promise.all(indices.map((i) => rows.contributors?.(i)));
    try {
      const all = await Promise.all(
        parts.map((part) => part?.ref?.data?.() ?? []),
      );
      return np.array(
        [...new Set(all.flatMap((part) => Array.from(part, Number)))].sort(
          (a, b) => a - b,
        ),
        { dtype: np.int32 },
      );
    } finally {
      parts.forEach((part) => part?.dispose?.());
    }
  }
  // A projection of this view's rows: its metadata is the view's (utils/viewMetadata.js).
  /**
   * @param {{capacity: number, prefix: boolean, grid?: import('./dataViewTypes.js').GridModel | null,
   * valid: () => JaxArray, get: (field: string) => Column, sourceIndices: () => JaxArray | null,
   * info?: RowProvenance, row: (index: number) => number | Promise<number>}} fields
   * @returns {PhysicalScope}
   */
  function scopeOver(fields) {
    return forwardViewMetadata(
      {
        get capacity() {
          return fields.capacity;
        },
        get length() {
          return fields.capacity;
        },
        get count() {
          return n;
        },
        get valid() {
          return fields.valid();
        },
        get prefix() {
          return fields.prefix;
        },
        /** Marks a padded view's physical scope (see the protocol above). */
        physical: true,
        get grid() {
          return fields.grid;
        },
        view,
        parent,
        identityRows: false,
        aggregate,
        hasOwnColumn: (key) => Object.hasOwn(columns, key),
        columnFact: (key, fact) => view.columnFact?.(key, fact),
        get provenance() {
          return aggregate ? fields.info : view.provenance;
        },
        interactionResource: (key) => view.interactionResource(key),
        metadata: (key) => view.metadata(key),
        columnIdentity: (key) => view.columnIdentity(key),
        hostColumn: (key) => view.hostColumn(key),
        columnName: (key) => view.columnName(key),
        keys: () => view.keys(),
        has: (key) => view.has(key),
        get: fields.get,
        encodedColumn(key) {
          const input = fields.get(key);
          if (!categoryColumn(input)) return input;
          return Object.hasOwn(columns, key) ||
            aggregate ||
            (fields.prefix && !prefix)
            ? encoding.encodeColumn(input, view.metadata(key))
            : (parent.encodedColumn?.(key) ??
                encoding.encodeColumn(input, view.metadata(key)));
        },
        resolve(value) {
          return isLiteral(value)
            ? value.value
            : typeof value === "string" && view.has(value)
              ? fields.get(value)
              : value;
        },
        scale: (key, palette) => view.scale(key, palette),
        encode: (...args) => view.encode(...args),
        ownsColumn: (input) => view.ownsColumn(input),
        sourceIndices: fields.sourceIndices,
        // Row `index` here is a physical row (in this scope's order).
        async aggregateInfo(index) {
          const at = await fields.row(index);
          return aggregate
            ? describeRow(at, physicalGet, physicalInfo)
            : parent.aggregateInfo?.(at);
        },
        async contributors(index) {
          const at = await fields.row(index);
          return aggregate
            ? rowContributors(at, physicalInfo)
            : parent.contributors?.(at);
        },
        retain: () => view.retain(),
        dispose: () => view.dispose(),
        padded: () => physical(),
        prefixed: () => prefixed(),
      },
      view,
    );
  }
  /** Physical source rows (-1 where invalid): the parent's physical rows where this view's valid is set. */
  function physicalSourceIndices() {
    if (aggregate || !mask) return null;
    const source = parent.sourceIndices
      ? parent.sourceIndices()
      : np.arange(parent.length).astype(np.int32);
    if (!source) return null;
    return np.where(mask.ref.greater(0), source, -1).astype(np.int32);
  }
  /** @returns {PhysicalScope | null} */
  function physical() {
    if (!mask) return null;
    return (physicalScope ??= scopeOver({
      capacity,
      prefix,
      grid: physicalGrid,
      valid: () => mask,
      get: physicalGet,
      sourceIndices: physicalSourceIndices,
      info: physicalInfo,
      row: async (index) => index,
    }));
  }
  /** @returns {PhysicalScope | null} */
  function prefixed() {
    if (!mask) return null;
    if (prefix) return physical();
    if (prefixedScope) return prefixedScope;
    // A stable sort of "invalid" puts the valid rows first, in their order; nothing is sliced,
    // so the capacity (and every kernel shape downstream) stays the same.
    const order = own(
      np.argsort(np.logicalNot(mask.ref.greater(0)).astype(np.int32)),
    );
    /** @type {JaxArray | null} */
    let valid = null;
    return (prefixedScope = scopeOver({
      capacity,
      prefix: true,
      grid: undefined,
      // The first `count` rows; the count comes from a buffer so a new count compiles nothing.
      valid: () =>
        (valid ??= own(
          np
            .arange(capacity)
            .astype(np.int32)
            .less(deviceScalar(n, { dtype: "int32" }))
            .astype(np.int32),
        )),
      get(key) {
        const cacheKey = virtualKey("prefixed:", key);
        if (isVirtualField(key)) evict(`prefixed:${key}:`, cacheKey);
        let value = cache.get(cacheKey);
        if (value === undefined) {
          value = gatherColumn(physicalGet(key), order, own);
          cache.set(cacheKey, value);
        }
        return value;
      },
      sourceIndices: () => {
        const source = physicalSourceIndices();
        return source && np.take(source, order.ref, 0);
      },
      // Aggregate prefixed rows are groups too: their provenance maps rows through `order`.
      info:
        aggregate && physicalInfo
          ? Object.defineProperty({ ...physicalInfo }, "ids", {
              get: () => order,
              enumerable: true,
            })
          : physicalInfo,
      row: (index) =>
        scalar(np.take(order.ref, deviceScalar(index, { dtype: "int32" }), 0)),
    }));
  }
  /** @type {Omit<DataView, "indices">} */
  const view = {
    version,
    constants,
    liveColumns: aggregate ? undefined : parent.liveColumns,
    liveUntil: aggregate ? undefined : parent.liveUntil,
    columnIdentity,
    hostColumn,
    columnName,
    metadata(key) {
      if (brushExtentField(key)) return brushExtentMetadata(view, key);
      return Object.hasOwn(columnMetadata, key)
        ? columnMetadata[key]
        : aggregate
          ? undefined
          : parent.metadata?.(key);
    },
    identity: parent.identity,
    identityRows: !selecting && !aggregate && parent.identityRows === true,
    get interactionRevision() {
      return parent.interactionRevision ?? 0;
    },
    interactionResource: (key) => parent.interactionResource?.(key),
    pipeline: parent.pipeline ?? [],
    grid: selecting ? undefined : physicalGrid,
    // Why an upstream Calculate dropped the grid these rows had (TODO 51), for grid marks' errors.
    gridDropped: physicalGrid ? undefined : parent.gridDropped,
    columnIdentities:
      !selecting && !aggregate
        ? Object.fromEntries(
            Object.entries(parent.columnIdentities ?? {}).filter(
              ([key]) => !Object.hasOwn(columns, key),
            ),
          )
        : undefined,
    topology: selecting || aggregate ? version : parent.topology,
    length: n,
    parent,
    provenance: info,
    aggregate,
    followsMask: Boolean(
      followsMask || (aggregate && masked) || parent.followsMask,
    ),
    live: Boolean(live || parent.live),
    // The length of the space sourceIndices() index: the table's rows, or an aggregate's rows for
    // the views under it (TODO 28: tween state lives in it). repeatsRows: rows share a source row
    // (Fold, Dodge grid), so the source rows cannot tell them apart.
    sourceLength: aggregate ? n : (parent.sourceLength ?? parent.length),
    repeatsRows: !aggregate && Boolean(repeatsRows || parent.repeatsRows),
    /** The data generation this view's rows were last confirmed for (a reused Partition group
     * sets `revalidated`; views derived from it inherit it). namedMark's guards read it. */
    revalidated: undefined,
    get revalidatedGeneration() {
      return this.revalidated ?? parent.revalidatedGeneration;
    },
    keys: () => [
      ...new Set([
        ...(aggregate ? Object.keys(constants ?? {}) : parent.keys()),
        ...Object.keys(columns),
      ]),
    ],
    /** Whether this view makes `key` itself (lineage, TODO 38.2), rather than reading its parent's. */
    hasOwnColumn: (key) => Object.hasOwn(columns, key),
    // Optional conservative facts from a column producer; overwriting an expression
    // drops its inherited certificate unless it is an ordinary forwarded alias.
    columnFact(key, fact) {
      if (this.columnFacts?.[key]) return this.columnFacts[key](fact);
      if (Object.hasOwn(columns, key)) {
        const source = forwardedSource(key);
        return source === null ? undefined : parent.columnFact?.(source, fact);
      }
      return aggregate ? undefined : parent.columnFact?.(key, fact);
    },
    /** The parent column an own column is (an alias, a facet cell's value), or null. */
    forwardedColumn: (key) =>
      Object.hasOwn(columns, key) ? forwardedSource(key) : null,
    has: (key) => {
      const extent = brushExtentField(key);
      if (extent) return view.has(extent.column);
      if (Object.hasOwn(columns, key)) return true;
      if (
        isOffsetField(key) &&
        !aggregate &&
        Object.hasOwn(columns, offsetColumn(key))
      ) {
        const source = forwardedSource(offsetColumn(key));
        return source !== null && parent.has(offsetField(source));
      }
      // An aggregate reads its membership columns from the rows its codes index (TODO 139.1).
      if (aggregate && isVirtualField(key) && !isOffsetField(key))
        return (
          (ANY_INTERACTION_FIELDS.has(key) || Boolean(physicalInfo?.codes)) &&
          (physicalInfo?.rows ?? parent).has(key)
        );
      return aggregate ? constants?.[key] !== undefined : parent.has(key);
    },
    get,
    encodedColumn(key) {
      const input = get(key);
      if (input?.codes instanceof JaxArray || !categoryColumn(input))
        return input;
      if (!selecting && !aggregate && !Object.hasOwn(columns, key))
        return (
          parent.encodedColumn?.(key) ??
          encoding.encodeColumn(input, this.metadata(key))
        );
      return encoding.encodeColumn(input, this.metadata(key));
    },
    resolve(value) {
      return isLiteral(value)
        ? value.value
        : typeof value === "string" && this.has(value)
          ? get(value)
          : value;
    },
    scale: (key, palette) => parent.scale(key, palette),
    // A category encoding of one of the Data scope's own columns is kept there, across views
    // (a Filter makes a new view on every brush move) and updates that keep the column
    // (TODO 26.6); other inputs are this view's.
    encode: (input, scale, create) =>
      parent.ownsColumn?.(input)
        ? parent.encode(input, scale, create)
        : encoding.encode(input, scale, create),
    ownsColumn: (input) => Boolean(parent.ownsColumn?.(input)),
    async aggregateInfo(index) {
      const release = this.retain();
      try {
        if (!aggregate) {
          // Indices come from a buffer: every row a user points at reuses one kernel.
          const at = selecting
            ? await scalar(
                np.take(
                  rowIndices().ref,
                  deviceScalar(index, { dtype: "int32" }),
                  0,
                ),
              )
            : index;
          return parent.aggregateInfo?.(at);
        }
        return await describeRow(index, get, this.provenance);
      } finally {
        release();
      }
    },
    async contributors(index) {
      const release = this.retain();
      try {
        if (!aggregate) {
          const at = selecting
            ? await scalar(
                np.take(
                  rowIndices().ref,
                  deviceScalar(index, { dtype: "int32" }),
                  0,
                ),
              )
            : index;
          return parent.contributors?.(at);
        }
        return rowContributors(index, this.provenance);
      } finally {
        release();
      }
    },
    sourceIndices() {
      if (aggregate) return null;
      if (rowMapping) return rowMapping.sourceIndices(parent);
      // Selecting rows of the owning table already IS the source-row mapping. Preserve
      // its array identity instead of allocating arange + gather on every reader/frame.
      if (selecting && parent.identityRows) {
        const rows = rowIndices();
        return rows.dtype === "int32" ? rows.ref : rows.ref.astype(np.int32);
      }
      const source = parent.sourceIndices
        ? parent.sourceIndices()
        : np.arange(parent.length).astype(np.int32);
      if (!source) return null;
      return selecting ? np.take(source, rowIndices().ref, 0) : source;
    },
    /** The physical scope of a padded view (see the protocol above); null for other views. */
    padded: masked ? () => physical() : undefined,
    /** The physical rows with the valid ones first (see the protocol above). */
    prefixed: masked ? () => prefixed() : undefined,
    retain() {
      if (disposed) throw Error("Cannot retain a disposed view.");
      users++;
      return () => this.dispose();
    },
    dispose() {
      if (disposed || --users > 0) return;
      disposed = true;
      owned.forEach((a) => a.dispose());
      encoding.dispose();
      cache.clear();
      this.onDispose?.();
      releaseMapping?.();
      releaseParent?.();
    },
  };
  // The parent rows this view shows, in order. Not enumerable: spreading a view (as
  // interactionScope does) must not compact a padded view.
  Object.defineProperty(view, "indices", {
    get: () => (selecting ? rowIndices() : null),
    enumerable: false,
  });
  if (!selecting && !aggregate) rowParents.set(view, parent);
  else if (selecting && !aggregate) {
    const mapping =
      rowMapping && immutableRowMappings.has(rowMapping)
        ? rowMapping
        : indices instanceof JaxArray
          ? indices
          : mask instanceof JaxArray
            ? mask
            : null;
    if (mapping)
      rowSelections.set(view, { parent, mapping, prefix, length: view.length });
  }
  deriveViewMetadata(parent, view);
  return /** @type {DataView} */ (view);
}

/** Rows `indices` of a column (numeric, categorical or geometry); the caller owns the result via `own`. */
/**
 * @param {Column} input @param {JaxArray} indices
 * @param {<T extends JaxArray>(array: T) => T} own
 * @returns {GatheredColumn}
 */
function gatherColumn(input, indices, own) {
  if (isGeometryColumn(input)) {
    const selected = own(
      input.indices ? np.take(input.indices.ref, indices.ref, 0) : indices.ref,
    );
    return { ...input, indices: selected, length: indices.shape[0] };
  }
  return gatherValues(input, indices, own);
}

/** Gather numeric values or dictionary codes; geometry has its own row indirection above.
 * @param {Exclude<Column, import('./dataViewTypes.js').GeometryColumn>} input
 * @param {JaxArray} indices @param {<T extends JaxArray>(array: T) => T} own
 * @returns {DeviceColumn}
 */
function gatherValues(input, indices, own) {
  if (categoryColumn(input)) {
    const categories = input.categories ?? [
      ...new Set(
        /** @type {import('./dataViewTypes.js').CategoryHostColumn} */ (
          input
        ).filter((v) => v !== null && v !== undefined),
      ),
    ];
    const codes = input.codes
      ? asArray(input.codes)
      : (() => {
          const lookup = new Map(categories.map((v, i) => [v, i]));
          return np.array(
            /** @type {import('./dataViewTypes.js').CategoryHostColumn} */ (
              input
            ).map((v) => lookup.get(v) ?? -1),
            { dtype: np.int32 },
          );
        })();
    return { codes: own(np.take(codes, indices.ref, 0)), categories };
  }
  return own(np.take(asArray(input), indices.ref, 0));
}

/**
 * Whether `field` resolves to categorical values (including a scalar literal): read from a padded view's
 * physical rows, its parent's own columns, so asking does not compact the kept rows (a
 * compound's orientation check did on every brush move: a sort and a gather per column).
 */
/** @param {RowScope | null | undefined} scope @param {unknown} field */
export const categoryField = (scope, field) => {
  const value = (scope?.padded?.() ?? scope)?.resolve?.(field);
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    categoryColumn(value)
  );
};

/** A Filter's bucket when it offers one (see BUCKETS above), else the scope itself. */
/** @template {RowScope | null | undefined} T @param {T} scope @returns {RowScope | T} */
export const bucketedRows = (scope) => scope?.bucketed?.() ?? scope;

/**
 * The indices of a mask's set rows, in order, given how many there are (no readback). `prefix`:
 * the set rows come first, so they are the first `count` rows (TODO 29.5: no sort).
 */
/** @param {JaxArray} mask @param {number} count @param {boolean} [prefix] */
export function compactIndices(mask, count, prefix = false) {
  if (prefix) return np.arange(count).astype(np.int32);
  if (mask.shape[0] <= 1)
    return count
      ? np.array([0], { dtype: np.int32 })
      : np.zeros([0], { dtype: np.int32 });
  // Stable sort places retained rows first while preserving their original order.
  return np
    .argsort(np.logicalNot(mask.ref.greater(0)).astype(np.int32))
    .slice([0, count]);
}

/**
 * The immutable rows of one Filter membership. The Filter cache and published views each
 * retain it; replacing the cache cannot invalidate a retained view. Compaction and source
 * mapping stay lazy, and numerical columns do not recreate either array.
 */
/** @param {JaxArray} mask @param {number} count @param {boolean} [prefix] @returns {MaskedRowMapping} */
export function createMaskedRowMapping(mask, count, prefix = false) {
  const valid = mask.ref;
  const gathered = createGatherCache();
  /** @type {JaxArray | null} */
  let compacted = null;
  /** @type {JaxArray | null} */
  let source = null;
  /** @type {JaxArray | null} */
  let mapped = null;
  let users = 1;
  /** @type {RowScope | null} */
  let fallbackParent = null;
  /** @type {number | undefined} */
  let fallbackLength;
  const indices = () => (compacted ??= compactIndices(valid, count, prefix));
  /** @type {MaskedRowMapping} */
  const mapping = {
    gather: (input, signature, make) => gathered.get(input, signature, make),
    get gatherCache() {
      return { entries: gathered.size, bytes: gathered.bytes };
    },
    indices: () => indices().ref,
    sourceIndices(parent) {
      if (parent.aggregate) return null;
      if (parent.identityRows) return indices().ref;
      const current = parent.sourceIndices
        ? parent.sourceIndices()
        : parent === fallbackParent && parent.length === fallbackLength
          ? source?.ref
          : np.arange(parent.length).astype(np.int32);
      if (!current) return null;
      if (current !== source) {
        mapped?.dispose();
        source?.dispose();
        source = current;
        fallbackParent = parent.sourceIndices ? null : parent;
        fallbackLength = parent.length;
        mapped = np.take(source.ref, indices().ref, 0);
      } else current.dispose();
      return /** @type {JaxArray} */ (mapped).ref;
    },
    retain() {
      if (!users) throw Error("Cannot retain a disposed row mapping.");
      users++;
      return () => this.dispose();
    },
    dispose() {
      if (!users || --users) return;
      gathered.dispose();
      compacted?.dispose();
      mapped?.dispose();
      source?.dispose();
      valid.dispose();
    },
  };
  immutableRowMappings.add(mapping);
  return mapping;
}

/** @param {RowScope & {resolve(value: unknown): unknown}} scope @param {string} field */
export function numericColumn(scope, field) {
  const value = scope.resolve(field);
  if (categoryColumn(value) || typeof value === "string")
    throw Error(`Expected numeric column: ${field}`);
  if (typeof value === "number") return np.full([scope.length], value);
  const shape = shapeOf(value);
  if (shape.length === 2 && shape[0] === scope.length)
    throw Error(
      `${field} holds a position per row (${shape[1]} numbers each), which cannot be a key or a value here; ` +
        `use the columns that name it (an id, or its x and y) instead.`,
    );
  if (shape.length !== 1 || shape[0] !== scope.length)
    throw Error(`Expected ${scope.length} numeric values for ${field}.`);
  return asArray(value).astype(np.float32);
}

/** Only a compact scalar crosses the GPU boundary; never a source column. */
/** @param {JaxArray} array */
export async function scalar(array) {
  try {
    return Number((await array.ref.data())[0]);
  } finally {
    array.dispose();
  }
}
/** @param {JaxArray} array */
export async function finiteExtent(array) {
  if (!array.shape[0]) return [0, 1];
  const lo = np.min(np.where(np.isfinite(array.ref), array.ref, Infinity));
  const hi = np.max(np.where(np.isfinite(array.ref), array.ref, -Infinity));
  const [a, b] = await Promise.all([scalar(lo), scalar(hi)]);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : [0, 1];
}
/**
 * The finite [min, max] of each array, as finiteExtent gives them, with ONE readback for all of
 * them ([0, 1] for an empty or nonfinite array). Borrows the arrays.
 */
/**
 * Each array's [min, max] over its finite values (and, for a padded view's arrays, its valid
 * rows: a hidden row is real but not shown), [0, 1] for one with none, in one readback. An entry
 * is an array, or { array, column } for one column of a 2D array. One compiled program per
 * call's structure (which entries are masked, which take a column; TODO 33.4): before, each
 * array was cast and reduced on its own, and each column sliced before that. Borrows `arrays`.
 * `missing`: what an array with no finite values gives ([0, 1]; a mark's domains ask for null).
 */
/**
 * @param {(JaxArray | {array: JaxArray, column?: number | null, transform?: string})[]} arrays
 * @param {JaxArray | null} [valid]
 * @param {{missing?: number[] | null}} [options]
 */
export async function finiteExtents(
  arrays,
  valid = null,
  { missing = [0, 1] } = {},
) {
  /** @type {{array: JaxArray, column?: number | null, transform?: string}[]} */
  const entries = arrays.map((entry) =>
    entry instanceof JaxArray ? { array: entry, column: null } : entry,
  );
  const present = entries.filter(({ array }) => array.shape[0]);
  /** @type {number[]} */
  let values = [];
  if (present.length) {
    // An entry's `transform` (its axis's) leaves out values outside its domain (TODO 39.1).
    /** @type {[number | null, boolean, string | null][]} */
    const plan = present.map(({ array, column, transform }) => [
      column ?? null,
      Boolean(valid && valid.shape[0] === array.shape[0]),
      transform && transform !== "linear" ? transform : null,
    ]);
    const out = planProgram(
      EXTENT_PROGRAMS,
      plan,
      extentsKernel,
    )({
      arrays: present.map(({ array }) => array.ref),
      ...(valid && plan.some(([, masked]) => masked)
        ? { valid: valid.ref }
        : {}),
    });
    values = Array.from(await out.data(), Number);
  }
  let at = 0;
  return entries.map(({ array }) => {
    if (!array.shape[0]) return missing;
    const [a, b] = [values[at++], values[at++]];
    return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : missing;
  });
}
/** finiteExtents' device work for a plan of [column or null, masked] per array. Consumes its inputs. */
/**
 * @param {[number | null, boolean, string | null][]} plan
 * @param {{arrays: JaxArray[], valid?: JaxArray}} inputs
 */
function extentsKernel(plan, { arrays, valid }) {
  const parts = arrays.map((array, k) => {
    const [column, masked, transform] = plan[k];
    let values = (column === null ? array : array.slice([], column)).astype(
      np.float32,
    );
    const inside = transform && jaxTransformValid(transform, values);
    if (inside) values = np.where(inside, values, NaN);
    // Masked entries are produced only with a matching validity buffer.
    return masked
      ? finiteRangeWhere(values, /** @type {JaxArray} */ (valid).ref)
      : finiteRange(values);
  });
  valid?.dispose();
  return np.concatenate(parts);
}
const EXTENT_PROGRAMS = new Map();
/** @param {JaxArray} mask */
export async function selectedIndices(mask) {
  return compactIndices(mask, await scalar(np.sum(mask.ref.astype(np.int32))));
}

/**
 * Whether two scopes hold the same rows in the same order: the same view, snapshots of one
 * scope's version, or physical scopes (not valid-first ones) over the same rows.
 */
/** @param {import("./dataViewTypes.js").RowIdentity | null | undefined} a @param {import("./dataViewTypes.js").RowIdentity | null | undefined} b @returns {boolean} */
export function sameRows(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.physical || b.physical)
    return Boolean(
      a.physical &&
      b.physical &&
      !a.prefix &&
      !b.prefix &&
      sameRows(a.parent, b.parent),
    );
  const length = a.length;
  if (length !== b.length) return false;
  for (let parent = rowParents.get(a); parent; parent = rowParents.get(a))
    a = parent;
  for (let parent = rowParents.get(b); parent; parent = rowParents.get(b))
    b = parent;
  if (a === b) return true;
  if (a.snapshotOf && a.snapshotOf === b.snapshotOf && a.version === b.version)
    return true;
  const selectedA = rowSelections.get(a),
    selectedB = rowSelections.get(b);
  if (
    selectedA &&
    selectedB &&
    selectedA.mapping === selectedB.mapping &&
    selectedA.length === selectedB.length &&
    selectedA.prefix === selectedB.prefix
  )
    return sameRows(selectedA.parent, selectedB.parent);
  return false;
}

/** A borrowed source-update witness for unchanged forwarded columns. Only the
 * private transparent-row certificates may be traversed; selections, aggregates
 * and a replacement of any requested column stop the proof. Snapshots capture
 * lastChange alongside their version, rather than reading a later live update. */
/** @param {RowScope} scope @param {readonly string[]} fields */
export function columnChangeProof(scope, fields) {
  let rows = scope;
  for (
    let parent = rowParents.get(rows);
    parent;
    parent = rowParents.get(rows)
  ) {
    if (fields.some((field) => rows.hasOwnColumn?.(field))) return null;
    rows = parent;
  }
  if (rows.snapshotOf)
    return {
      source: rows.snapshotOf,
      version: rows.version,
      change: rows.lastChange,
    };
  if (rows === scope && !rows.parent)
    return { source: rows, version: rows.version, change: rows.lastChange };
  return null;
}

/** The table scope under `scope` (a Data, Provider or Plot data= scope): parents up to it. */
/** @param {RowScope | null | undefined} scope */
export function rootScope(scope) {
  for (let at = scope; at; at = at.parent ?? at.snapshotOf)
    if (at.applyOffsets) return at;
  return undefined;
}

/** Snapshot column references before an asynchronous transform yields. */
/** @param {RowScope} source @returns {RowScope} */
export function snapshotDataScope(source) {
  if (source.retain) {
    source.retain();
    return source;
  }
  /** @type {JaxArray[]} */
  const held = [];
  /** @type {Record<string, Column>} */
  const columns = {};
  /** @type {Map<string, unknown>} */
  const hostColumns = new Map();
  /** @type {Map<string, () => unknown>} */
  const hostReaders = new Map();
  /** @type {Map<string, Column>} */
  const encodedColumns = new Map();
  /** @type {Map<string, import('./dataViewTypes.js').ColumnMetadata | null | undefined>} */
  const columnMetadata = new Map();
  const encoding = createDataScope();
  // A grid table's coordinates are made from the snapshot's grid when read (TODO 51): taking
  // them here would make every coordinate column of every input.
  const grid = source.grid;
  /** @type {Map<string, Column>} */
  const coordinates = new Map();
  /** @param {string} key @returns {Column} */
  const coordinate = (key) => {
    if (!coordinates.has(key)) {
      const value = coordinateColumn(grid, key);
      held.push(value?.codes ?? value);
      coordinates.set(key, value);
    }
    return /** @type {Column} */ (coordinates.get(key));
  };
  for (const key of source.keys()) {
    columnMetadata.set(key, source.metadata?.(key));
    if (isCoordinate(grid, key) && !source.hasOwnColumn?.(key)) continue;
    const v = source.get(key);
    if (source.snapshotHostColumn)
      hostReaders.set(key, source.snapshotHostColumn(key));
    else {
      const host = source.hostColumn?.(key);
      if (host !== undefined) hostColumns.set(key, host);
    }
    if (v instanceof JaxArray) {
      columns[key] = v.ref;
      held.push(columns[key]);
    } else if (deviceDictionary(v)) {
      const codes = v.codes.ref;
      held.push(codes);
      columns[key] = { ...v, codes };
    } else columns[key] = v;
  }
  const length = source.length,
    version = source.version;
  const sourceRows = source.sourceIndices
    ? source.sourceIndices()
    : np.arange(length).astype(np.int32);
  if (sourceRows) held.push(sourceRows);
  /** @type {RowScope & Required<Pick<RowScope, "metadata" | "hostColumn">>} */
  const parent = {
    length,
    version,
    // The scope this snapshots: two snapshots of one scope at one version hold the same rows.
    snapshotOf: source,
    lastChange: source.lastChange,
    constants: source.constants,
    liveColumns: source.liveColumns,
    liveUntil: source.liveUntil,
    ...snapshotViewMetadata(source),
    live: Boolean(source.live),
    sourceLength: source.sourceLength ?? length,
    repeatsRows: Boolean(source.repeatsRows),
    identity: source.identity,
    identityRows: source.identityRows === true,
    grid,
    metadata: (key) =>
      columnMetadata.has(key)
        ? columnMetadata.get(key)
        : source.metadata?.(key),
    get interactionRevision() {
      return source.interactionRevision ?? 0;
    },
    interactionResource: (key) => source.interactionResource?.(key),
    keys: () => [
      ...Object.keys(columns),
      ...[...source.keys()].filter(
        (k) => !Object.hasOwn(columns, k) && isCoordinate(grid, k),
      ),
    ],
    has: (k) =>
      Object.hasOwn(columns, k) || isCoordinate(grid, k) || source.has(k),
    get: (k) =>
      Object.hasOwn(columns, k)
        ? columns[k]
        : isCoordinate(grid, k)
          ? coordinate(k)
          : source.get(k),
    encodedColumn(k) {
      const input = this.get(k);
      if (input?.codes instanceof JaxArray || !categoryColumn(input))
        return input;
      if (!encodedColumns.has(k)) {
        const encoded =
          !source.encodingDisposed &&
          source.version === version &&
          source.encodedColumn
            ? source.encodedColumn(k)
            : encoding.encodeColumn(
                this.hostColumn(k) ?? input,
                this.metadata(k),
              );
        if (encoded?.codes instanceof JaxArray) {
          const codes = encoded.codes.ref;
          held.push(codes);
          encodedColumns.set(k, { ...encoded, codes });
        } else encodedColumns.set(k, encoded);
      }
      return /** @type {Column} */ (encodedColumns.get(k));
    },
    columnIdentity: (k) => source.columnIdentity?.(k),
    columnFact: (k, fact) => source.columnFact?.(k, fact),
    hostColumn(k) {
      if (!hostColumns.has(k) && hostReaders.has(k))
        hostColumns.set(k, /** @type {() => unknown} */ (hostReaders.get(k))());
      return hostColumns.has(k)
        ? hostColumns.get(k)
        : Object.hasOwn(columns, k)
          ? undefined
          : source.hostColumn?.(k);
    },
    columnName: (k) => (source.columnName ? source.columnName(k) : k),
    scale: (k, palette) => source.scale(k, palette),
    // Host columns are the source's own arrays: their encodings stay there (TODO 26.6).
    ownsColumn: (input) => Boolean(source.ownsColumn?.(input)),
    encode: (...args) => source.encode(...args),
    sourceIndices: () => sourceRows?.ref ?? null,
  };
  const view = createDataView(parent);
  view.onDispose = () => {
    held.forEach((a) => a.dispose());
    encoding.dispose();
  };
  return view;
}

export function dataBufferLimit() {
  try {
    return getWebGPUDevice().limits.maxStorageBufferBindingSize;
  } catch {
    return 128 * 1024 * 1024;
  }
}
