import {geoTable} from "./geoData.js";
import { isArrowTable, arrowColumns } from "./arrow.js";
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { existingHostValues } from "./hostSources.js";
import { normalizeColormap, colormapInterpolator } from "./colormap.js";
import { BUILTIN_SHAPES } from "./shapes.js";
import { createDataIdentity, identityForData, rememberDataIdentity, keyTokens, DEFAULT_INTERACTION_FIELDS, isSelectionField, selectionOfField, selectionFieldMask, ANY_INTERACTION_FIELDS, interactionPhase, interactionVersion, defaultInteractionKind, brushExtentField, brushExtentColumn, brushExtentMetadata } from "./interaction.js";
import { isOffsetField, offsetColumn, OFFSET_PREFIX, applyOffsets } from "./offsets.js";
import { prepareColumn, UNIT_MS } from "./columns.js";
import { adoptJaxValues } from "./foreignJax.js";
import { retainColumn, releaseColumn } from "./data.js";
import { createColumnEncoding } from "./columnEncoding.js";
import { isViewStateField } from "./viewState.js";
import { gridSpecOf, coordinateColumn } from "./gridTable.js";
import { normalizeGrid, coordinateDescriptor, isCoordinate, gridDim } from "./gridModel.js";
import { isLiteral } from "./names.js";
export { literal, isLiteral } from "./names.js";
export const CATEGORY_COLORS = [
  "#547ba2",
  "#cf8955",
  "#7b9865",
  "#a278a4",
  "#c4a451",
  "#579b9a",
  "#bc7180",
  "#838997",
];
/** Automatic shape palette: the built-in symbols in code order. */
export const CATEGORY_SHAPES = BUILTIN_SHAPES;
export function isCategory(value) {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
/**
 * `label` titles the legend guide shared by every mark using the scale (stored as `title`,
 * because `label(value)` formats one category).
 * @param {{domain?: import('../publicTypes.js').CategoryValue[], range?: string[], unknown?: string, label?: string}} [config]
 * @returns {import('../publicTypes.js').CategoricalScale & {explicit:boolean, labels:Map<any,string>}}
 */
export function categorical({ domain, range, unknown = "#92989f", label: title = undefined } = {}) {
  if (
    domain &&
    (new Set(domain).size !== domain.length ||
      domain.some((v) => !isCategory(v)))
  )
    throw Error(
      "Category domain must contain unique strings, booleans, or finite numbers.",
    );
  if (range && !range.length) throw Error("Category range cannot be empty.");
  let values = [...(domain ?? [])],
    output = range ? [...range] : null,
    fallback = unknown;
  const indices = new Map(values.map((v, i) => [v, i]));
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => f());
  return {
    isCategorical: true,
    explicit: domain !== undefined,
    // A guide title shared by every mark using this scale (`label` is the value formatter).
    title: title === undefined || title === null ? undefined : String(title),
    get domain() {
      return [...values];
    },
    get range() {
      return output ? [...output] : null;
    },
    get unknown() {
      return fallback;
    },
    snapshot() { return { domain: [...values], range: output && [...output], unknown: fallback,
      explicit: this.explicit, ...(this.title !== undefined ? { label: this.title } : {}) }; },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    include(input) {
      if (this.explicit) return;
      let changed = false;
      for (const v of input)
        if (isCategory(v) && !indices.has(v)) {
          indices.set(v, values.length);
          values.push(v);
          changed = true;
        }
      if (changed) notify();
    },
    index(v) {
      return isCategory(v) ? (indices.get(v) ?? -1) : -1;
    },
    value(index, kind = "color") {
      const palette =
        output ?? (kind === "shape" ? CATEGORY_SHAPES : CATEGORY_COLORS);
      return index < 0
        ? kind === "shape"
          ? "circle"
          : fallback
        : palette[index % palette.length];
    },
    setRange(next) {
      if (next !== null && (!Array.isArray(next) || !next.length))
        throw Error("Category range cannot be empty.");
      output = next === null ? null : [...next];
      notify();
    },
    update(patch) {
      if (patch.domain === null && this.explicit) {
        values = [];
        indices.clear();
        this.explicit = false;
        notify();
      } else if (patch.domain !== undefined && patch.domain !== null)
        this.setDomain(patch.domain);
      if (patch.explicit === false) this.explicit = false;
      if (patch.range !== undefined) this.setRange(patch.range);
      if (patch.unknown !== undefined) this.setUnknown(patch.unknown);
      return this;
    },
    setDomain(next) {
      if (!Array.isArray(next) || new Set(next).size !== next.length ||
          next.some((value) => !isCategory(value)))
        throw Error("Category domain must contain unique strings, booleans, or finite numbers.");
      values = [...next];
      indices.clear();
      values.forEach((value, index) => indices.set(value, index));
      this.explicit = true;
      notify();
    },
    setUnknown(next) {
      fallback = next;
      notify();
    },
    labels: new Map(),
    setLabel(value, label) {
      this.labels.set(value, String(label));
      notify();
    },
    label(value) {
      return this.labels.get(value) ?? String(value);
    },
  };
}

/** Ordered categories receive equally spaced samples from a sequential colormap. */
export function ordinal({ domain, range, colormap = "Viridis", unknown = "#92989f", label = undefined } = {}) {
  if (!Array.isArray(domain) || !domain.length)
    throw Error("Ordinal scales need a nonempty explicit domain.");
  if (range !== undefined && (colormap !== "Viridis" || range.length !== domain.length))
    throw Error("Ordinal range needs one value per category and cannot be combined with a colormap.");
  let map = normalizeColormap(colormap), explicitRange = range && [...range];
  const colors = (values) => {
    if (explicitRange) return explicitRange;
    const interpolate = colormapInterpolator(map);
    return values.map((_, index) => interpolate(values.length === 1 ? 0.5 : index / (values.length - 1)));
  };
  const scale = categorical({ domain, range: colors(domain), unknown, label });
  scale.isOrdinal = true;
  scale.snapshot = () => ({ domain: scale.domain, range: explicitRange && [...explicitRange],
    colormap: explicitRange ? null : map, unknown: scale.unknown,
    ...(scale.title !== undefined ? { label: scale.title } : {}) });
  Object.defineProperty(scale, "colormap", { get: () => explicitRange ? null : map });
  scale.update = (patch) => {
    const nextDomain = patch.domain ?? scale.domain;
    const nextRange = patch.range !== undefined ? patch.range :
      patch.colormap !== undefined ? null : explicitRange;
    const nextMap = patch.colormap === undefined ? map : normalizeColormap(patch.colormap);
    if (!Array.isArray(nextDomain) || !nextDomain.length ||
        new Set(nextDomain).size !== nextDomain.length || nextDomain.some((value) => !isCategory(value)))
      throw Error("Ordinal scales need a nonempty domain of unique categories.");
    if (nextRange && nextRange.length !== nextDomain.length)
      throw Error("Ordinal range needs one value per category.");
    const before = [map, explicitRange];
    map = nextMap; explicitRange = nextRange && [...nextRange];
    try { colors(nextDomain); }
    catch (error) { [map, explicitRange] = before; throw error; }
    if (JSON.stringify(nextDomain) !== JSON.stringify(scale.domain)) scale.setDomain(nextDomain);
    scale.setRange(colors(nextDomain));
    if (patch.unknown !== undefined) scale.setUnknown(patch.unknown);
    return scale;
  };
  return scale;
}
export const DATA_CONTEXT = Symbol("named data");

/**
 * A band axis's bounds: category i at position i, a band each. A flat Cartesian y axis lists its
 * categories from the top, as a table and a sorted bar chart read (TODO 136.15): its bounds run
 * downward, and invert=True turns it bottom-up. A polar radius or a 3D scene's y keeps i upward.
 * @param {string} axis @param {number} count @param {any} [options] the frame's options
 */
export function categoryBounds(axis, count, options) {
  const bounds = [-0.5, Math.max(0.5, count - 0.5)];
  return axis === "y" && topDown(options) ? [bounds[1], bounds[0]] : bounds;
}
/** Whether the frame lists a band y axis from the top: a flat Cartesian frame. @param {any} options */
export function topDown(options) {
  return (options?.get?.("coordinates") ?? "cartesian") === "cartesian" && options?.frameDefinition?.mode?.() !== "3d";
}
/** Column types an offset can move: numbers in the column's units (TODO 38). Datetime and
 * duration columns are not yet: Python and the browser store them in different units. */
const OFFSET_TYPES = new Set(["numeric"]);
const EMPTY_ROWS = Object.freeze({});

export function createDataScope({ key = undefined, identity = undefined } = {}) {
  let sourceColumns = Object.create(null);
  const columnEncoding = createColumnEncoding();
  let encodingDisposed = false;
  // Plain category arrays coded over their domain for hostColumn, per array.
  const hostCodes = new WeakMap();
  // Columns warned about for integers float32 cannot hold, once each (as resources.js does).
  const warnedPrecision = new Set();
  let input,
    columns = Object.create(null), columnMetadata = Object.create(null), version = 0, length = 0, activeSchema = null, activeRows = undefined,
    // The columns the last update changed (TODO 17.9; see lastChange below).
    lastChange = null;
  // A grid table's model (TODO 51), its coordinate columns (made when read) and its curvilinear
  // positions (host arrays retained as columns are: uploaded once, when first read).
  let grid = null, coordinates = new Map(), positions = [];
  // Device columns the scope made itself (prepareColumn's [x, y] rows; update), disposed with it.
  let owned = new Set();
  const coordinateNames = () => grid
    ? [...grid.dims.map((dim) => dim.name), ...Object.keys(grid.coords2d?.columns ?? {})] : [];
  const releaseGrid = () => {
    for (const value of coordinates.values()) (value?.codes ?? value)?.dispose?.();
    coordinates = new Map();
    positions.forEach((array) => (array instanceof JaxArray ? array.dispose() : releaseColumn(array)));
    positions = [];
  };
  const coordinate = (name) => {
    if (!coordinates.has(name)) coordinates.set(name, coordinateColumn(grid, name));
    return coordinates.get(name);
  };
  // Brush bounds ("@brush_min:x"), made once per interaction revision and lent like the masks.
  const extents = new Map();
  const releaseExtents = () => {
    for (const { array } of extents.values()) array.dispose();
    extents.clear();
  };
  const privateSource = `scope-${crypto.randomUUID()}`;
  let columnSource = privateSource;
  let dataIdentity = identity ?? createDataIdentity({ key });
  let releaseIdentity = dataIdentity.retain?.() ?? (() => {});
  const scaleColumns=new Map();
  const scales = new Map(),
    encoded = new Map();
  // The host arrays this scope holds (a column, or a dictionary column's codes): their device
  // copies are shared through asArray (data.js retainColumn), and category encodings of them are
  // kept across updates that keep them (TODO 26.6).
  let held = new Set(), retained = new Set();
  // Numeric host arrays (a column's type was checked when it was prepared: one value decides).
  const hostColumn = (values) => ArrayBuffer.isView(values) || (Array.isArray(values) && typeof values.find((v) => v != null) === "number");
  const hold = (next) => {
    const objects = new Set();
    for (const column of Object.values(next)) for (const values of [column, column?.codes]) if (values && typeof values === "object") objects.add(values);
    for (const values of objects) if (!retained.has(values) && hostColumn(values)) { retainColumn(values); retained.add(values); }
    for (const values of retained) if (!objects.has(values)) { releaseColumn(values); retained.delete(values); }
    held = objects;
    columnEncoding.prune(objects);
    // Encodings of arrays this scope no longer holds.
    for (const [input, byScale] of encoded)
      if (!held.has(input)) {
        for (const v of byScale.values()) v.array.dispose();
        encoded.delete(input);
      }
  };
  const clear = () => {
    columnEncoding.dispose();
    for (const m of encoded.values())
      for (const v of m.values()) v.array.dispose();
    encoded.clear();
    for (const values of retained) releaseColumn(values);
    held = new Set(); retained = new Set();
  };
  return {
    setKey(next) {
      if (key === next) return;
      const preparedTokens = input === undefined ? null : keyTokens(this, next);
      key = next;
      dataIdentity.key = next;
      // The same rows under another key: every row keeps its state.
      if (input !== undefined) dataIdentity.update(this, preparedTokens, true);
    },
    /**
     * `options.rows`: a row count instead of a table, with no placeholder columns.
     * `options.tokens`: the rows' identity tokens, prepared by the caller (a Simulate's rows
     * through a Filter, whose key column is on the device), instead of read from the key.
     */
    update(value, schema = undefined, options = undefined) {
      const rows = options?.rows;
      if (rows !== undefined) {
        if (!Number.isInteger(rows) || rows < 0 || rows > 2147483647)
          throw Error("Data.rows must be an integer from 0 to 2147483647; pass the number of rows to generate.");
        if (value !== undefined)
          throw Error("Data: pass a table or rows, not both.");
        value = EMPTY_ROWS;
      }
      const sharedIdentity = identityForData(value);
      const nextIdentity = sharedIdentity ?? dataIdentity;
      if(value?.type === "FeatureCollection") {
        if(input === value) return;
        const original=value;
        this.update(geoTable(value));
        input=original;return;
      }
      // An Arrow Table or RecordBatch (TODO 48.2): its columns, read once per table object.
      if (isArrowTable(value)) {
        if (input === value && schema === activeSchema) return;
        const original = value, columns = arrowColumns(value);
        // table(arrowTable) shares its identity (selection, brush) with every scope of it.
        if (sharedIdentity) rememberDataIdentity(columns, { identity: sharedIdentity });
        this.update(columns, schema, options);
        input = original;
        return;
      }
      // Columns from another jax-js copy become hmplot's (TODO 23.0b); `input` stays the
      // caller's object, and a column's copy is the same object across updates.
      const raw = value, gridSpec = gridSpecOf(value);
      value = adoptJaxValues(value);
      if (
        raw === input &&
        schema === activeSchema && rows === activeRows &&
        (Array.isArray(value) ||
          (Object.keys(value ?? {}).length === Object.keys(sourceColumns).length &&
            Object.keys(value ?? {}).every((k) => sourceColumns[k] === value[k])))
      )
        return;
      const next = Object.create(null), nextMetadata = Object.create(null);
      if (Array.isArray(value)) {
        for (const row of value) {
          if (!row || typeof row !== "object" || Array.isArray(row))
            throw Error("Data rows must be objects.");
          for (const key of Object.keys(row)) next[key] ??= [];
        }
        for (const key of Object.keys(next))
          next[key] = value.map((row) => row[key]);
      } else if (value && typeof value === "object") Object.assign(next, value);
      else throw Error("Data requires a column object or array of rows.");
      let nextLength = rows ?? null;
      // A column passed again (the same object, the same schema) keeps its preparation: type
      // inference reads every row (TODO 26.6).
      const kept = (key) => !Array.isArray(value) && version && schema === activeSchema &&
        Object.hasOwn(sourceColumns, key) && sourceColumns[key] === value[key];
      // The device arrays prepareColumn made ([x, y] rows): the scope's own, unlike a caller's
      // jax arrays, so it disposes them when they are replaced or the update fails.
      const nextOwned = new Set();
      const dropNew = () => { for (const array of nextOwned) if (!owned.has(array)) array.dispose(); };
      try {
        for (const [key, original] of Object.entries(next)) {
          // "@" names state (view.time, "@brushed") and the pipeline's own fields, so a column
          // of such a name could never be read (R2.0).
          if (key.startsWith("@"))
            throw Error(`Data column ${key}: names starting with @ are reserved for state (view.time, "@brushed"); rename the column.`);
          const prepared = kept(key) ? { values: columns[key], metadata: columnMetadata[key] } : prepareColumn(original, schema?.[key]);
          if (prepared.owned || owned.has(prepared.values)) nextOwned.add(prepared.values);
          if (prepared.metadata?.inexact && !warnedPrecision.has(key)) {
            warnedPrecision.add(key);
            console.warn(`Column ${key} holds integers beyond 2^24; the GPU stores float32, so large values lose precision.`);
          }
          const column = next[key] = prepared.values;
          if (prepared.metadata) nextMetadata[key] = prepared.metadata;
          const values = column?.codes ?? column;
          const n = values?.shape?.[0] ?? values?.length;
          if (!Number.isInteger(n) || n < 0)
            throw Error(`Data column ${key} must be an array or dictionary-encoded array.`);
          if (nextLength !== null && n !== nextLength)
            throw Error(`Data column ${key} has ${n} rows; expected ${nextLength}.`);
          nextLength = n;
        }
      } catch (error) {
        dropNew();
        throw error;
      }
      const candidateLength = nextLength ?? 0;
      // A grid table (TODO 51): its model, checked against the rows. Its positions stay host
      // arrays until read (a table is often set before the device is ready).
      let nextGrid = null, nextPositions = [];
      if (gridSpec) {
        const kept = {};
        for (const [name, values] of Object.entries(gridSpec.coords2d?.columns ?? {})) {
          const array = values instanceof JaxArray ? values.ref : Float32Array.from(values, Number);
          if (!(array instanceof JaxArray)) retainColumn(array);
          nextPositions.push(array);
          kept[name] = array;
        }
        try {
          nextGrid = normalizeGrid({ ...gridSpec, coords2d: gridSpec.coords2d && { ...gridSpec.coords2d, columns: kept } }, candidateLength);
          for (const name of [...nextGrid.dims.map((dim) => dim.name), ...Object.keys(kept)])
            if (Object.hasOwn(next, name)) throw Error(`Grid coordinate ${name} is also a column of the table.`);
        } catch (error) {
          nextPositions.forEach((array) => (array instanceof JaxArray ? array.dispose() : releaseColumn(array)));
          dropNew();
          throw error;
        }
      }
      const candidateKey = key !== undefined ? key : nextIdentity.key;
      const candidate = {
        length: candidateLength,
        has: (field) => Object.hasOwn(next, field),
        get: (field) => {
          if (!Object.hasOwn(next, field)) throw Error(`Missing data column: ${field}`);
          return next[field];
        },
      };
      const preparedTokens = options?.tokens !== undefined ? options.tokens : keyTokens(candidate, candidateKey);
      // Which columns this update changes, by reference (every column for rows, a new schema or
      // a first update): a Partition reuses the groups whose rows they leave alone.
      const changed = Array.isArray(value) || !version || schema !== activeSchema ? null
        : new Set([...Object.keys(sourceColumns), ...Object.keys(value)].filter((k) => sourceColumns[k] !== value[k]));
      hold(next);
      for (const array of owned) if (!nextOwned.has(array)) array.dispose();
      owned = nextOwned;
      releaseGrid();
      releaseExtents();
      grid = nextGrid;
      positions = nextPositions;
      length = candidateLength;
      lastChange = { from: version, to: version + 1, columns: changed };
      version++;
      input = raw;
      sourceColumns = Array.isArray(value) ? Object.create(null) : { ...value };
      columns = next;
      columnMetadata = nextMetadata;
      activeSchema = schema;
      activeRows = rows;
      columnSource = sharedIdentity?.id ?? privateSource;
      if (nextIdentity !== dataIdentity) {
        releaseIdentity();
        dataIdentity = nextIdentity;
        releaseIdentity = dataIdentity.retain?.() ?? (() => {});
      }
      const rekeyed = JSON.stringify(dataIdentity.key ?? null) !== JSON.stringify(candidateKey ?? null);
      dataIdentity.key = candidateKey;
      dataIdentity.update(this, preparedTokens, rekeyed);
    },
    get version() { return version; },
    /**
     * The table as it was given (columns or rows), with each column that has offsets replaced
     * by its moved values under the same name (TODO 38). The given table is not changed.
     */
    applyOffsets() {
      if (input === undefined) throw Error("applyOffsets: the table has no data yet.");
      if (input?.type === "FeatureCollection") throw Error("applyOffsets works on column or row tables, not GeoJSON.");
      if (isArrowTable(input)) throw Error("applyOffsets works on column or row tables, not Arrow tables.");
      return applyOffsets(input, dataIdentity.offsets);
    },
    /** { from, to, columns }: the versions the last update went between and the columns it
     * changed (a Set, or null for all of them). */
    get lastChange() { return lastChange; },
    get length() { return length; },
    get identity() { return dataIdentity; },
    /** A grid table's model (TODO 51; utils/gridModel.js), or null. */
    get grid() { return grid; },
    metadata(field) {
      if (brushExtentField(field)) return brushExtentMetadata(this, field);
      if (Object.hasOwn(columnMetadata, field)) return columnMetadata[field];
      return grid?.dims.find((dim) => dim.name === field)?.metadata ?? (isCoordinate(grid, field) ? { type: "numeric" } : undefined);
    },
    get schema() { return activeSchema; },
    columnIdentity(field) {
      if (!Object.hasOwn(columns, field) && !isCoordinate(grid, field)) return undefined;
      return `${columnSource}:${JSON.stringify(field)}`;
    },
    /**
     * A column's values on the host as a view of it reads them (TODO 29.12): numeric values, or
     * dictionary codes over the column's domain (a plain array of categories is coded once, in
     * the domain's order); undefined for a device column or another type.
     */
    hostColumn(field) {
      // A grid coordinate is a descriptor (TODO 51 decision 7): keys code it by index.
      if (!Object.hasOwn(columns, field)) return coordinateDescriptor(grid, field);
      const value = sourceColumns[field], meta = columnMetadata[field];
      const host = (v) => Array.isArray(v) || ArrayBuffer.isView(v);
      if (value?.categories && host(value.codes)) return value;
      // A device column uploaded from host values (a Python Table's; hostSources.js): those
      // values, with no readback (TODO 43).
      const prepared = columns[field];
      if (prepared instanceof JaxArray && meta?.type === "numeric") return existingHostValues(prepared);
      if (prepared?.categories && prepared.codes instanceof JaxArray) {
        const codes = existingHostValues(prepared.codes);
        if (!codes) return undefined;
        let coded = hostCodes.get(prepared);
        if (coded?.codes !== codes) hostCodes.set(prepared, (coded = { codes, categories: prepared.categories }));
        return coded;
      }
      if (meta?.type === "datetime" || meta?.type === "duration") {
        // Milliseconds from the column's origin, exact on the host (columns.js temporalColumn);
        // a Python column's exact int64 values in its unit (NaN where missing), converted once.
        if (host(prepared)) return prepared;
        const exact = prepared instanceof JaxArray ? existingHostValues(prepared) : undefined;
        if (!(exact instanceof BigInt64Array || Array.isArray(exact))) return undefined;
        let relative = hostCodes.get(prepared);
        if (!relative) {
          const factor = UNIT_MS[meta.unit ?? "ms"], origin = meta.origin ?? 0;
          relative = Float64Array.from(exact, (v) => (typeof v === "bigint" ? Number(v) * factor - origin : NaN));
          hostCodes.set(prepared, relative);
        }
        return relative;
      }
      if (!host(value)) return undefined;
      // As prepared: a plain array's nulls are NaN (columns.js).
      if (meta?.type === "numeric") return host(columns[field]) ? columns[field] : undefined;
      if ((meta?.type !== "categorical" && meta?.type !== "boolean") || !Array.isArray(meta.domain)) return undefined;
      return columnEncoding.host(prepared, meta);
    },
    /** Borrow a dictionary-coded column; ordinary host reads retain their representation. */
    encodedColumn(field) { return columnEncoding.get(this.get(field), this.metadata(field)); },
    encodeColumn(input, metadata) { return columnEncoding.get(input, metadata, true); },
    get encodingDisposed() { return encodingDisposed; },
    /** Capture host access without encoding unused string columns while taking a snapshot. */
    snapshotHostColumn(field) {
      const value = columns[field];
      const metadata = columnMetadata[field];
      if (value?.categories) {
        const original = value.codes instanceof JaxArray ? existingHostValues(value.codes) : value.codes;
        return columnEncoding.reader(value, metadata, original);
      }
      if (["categorical", "ordinal", "boolean"].includes(metadata?.type)) {
        return columnEncoding.reader(value, metadata);
      }
      const host = this.hostColumn(field);
      return () => host;
    },
    /**
     * The display name of a column (axis titles, legends and tooltips; TODO 21): its label (a
     * NetCDF variable's long_name and units, TODO 48.6), else its key.
     */
    columnName(field) {
      if (!Object.hasOwn(columns, field) && !isCoordinate(grid, field)) return undefined;
      const label = (Object.hasOwn(columnMetadata, field) ? columnMetadata[field] : gridDim(grid, field)?.metadata)?.label;
      return typeof label === "string" && label ? label : field;
    },
    get interactionRevision() {
      return interactionVersion(dataIdentity.selection) + interactionVersion(dataIdentity.brush) + interactionVersion(dataIdentity.hover) + interactionVersion(dataIdentity.nearby) + interactionVersion(dataIdentity.nearest) + interactionVersion(dataIdentity.tooltip) + dataIdentity.offsets.version;
    },
    interactionResource(field) {
      if (isOffsetField(field)) return dataIdentity.offsets;
      if (isSelectionField(field)) return selectionOfField(field)?.resource;
      const kind = defaultInteractionKind(field);
      return kind ? dataIdentity[kind] : undefined;
    },
    identityRows: true,
    sourceIndices() { return np.arange(length).astype(np.int32); },
    contributors(index) { return np.array([index], { dtype: np.int32 }); },
    keys() { return [...Object.keys(columns), ...coordinateNames()]; },
    dispose() {
      encodingDisposed = true;
      clear();
      for (const array of owned) array.dispose();
      owned = new Set();
      releaseGrid();
      releaseExtents();
      releaseIdentity();
    },
    encode(input, scale, create) {
      let byScale = encoded.get(input);
      if (!byScale) {
        byScale = new Map();
        encoded.set(input, byScale);
      }
      const key = JSON.stringify(scale.domain),
        old = byScale.get(scale);
      if (old?.key === key) return old.array.ref;
      const array = create();
      old?.array.dispose();
      // Keyed by the domain after create, which may have added this input's categories.
      byScale.set(scale, { key: JSON.stringify(scale.domain), array });
      return array.ref;
    },
    /** Whether `input` is one of this scope's own column arrays (views encode those here). */
    ownsColumn(input) {
      return held.has(input);
    },
    has(key) {
      const extent = brushExtentField(key);
      if (extent) return this.has(extent.column);
      return Object.hasOwn(columns, key) || isCoordinate(grid, key) || Object.hasOwn(DEFAULT_INTERACTION_FIELDS, key) ||
        isSelectionField(key) && !!selectionOfField(key) ||
        (isOffsetField(key) && Object.hasOwn(columns, offsetColumn(key)));
    },
    /** A column, lent: "@" columns (masks, offsets, brush bounds) until their next revision. */
    get(key) {
      if (brushExtentField(key)) {
        const revision = this.interactionRevision, kept = extents.get(key);
        if (kept?.revision === revision) return kept.array;
        kept?.array.dispose();
        const array = brushExtentColumn(this, key);
        extents.set(key, { revision, array });
        return array;
      }
      if (isOffsetField(key)) {
        // A column's offsets (TODO 38), one per row, lent by the table's offset layer.
        const name = offsetColumn(key), type = columnMetadata[name]?.type;
        if (!Object.hasOwn(columns, name)) throw Error(`Missing data column: ${name}`);
        if (type && !OFFSET_TYPES.has(type))
          throw Error(`offset(${JSON.stringify(name)}): ${name} is a ${type} column; offsets are numeric deltas in a numeric column's units.`);
        if (dataIdentity.offsets.length !== length)
          throw Error(`offset(${JSON.stringify(name)}): the table's offsets cover ${dataIdentity.offsets.length} rows, not ${length}.`);
        return dataIdentity.offsets.device(name);
      }
      if (Object.hasOwn(DEFAULT_INTERACTION_FIELDS, key)) {
        const resource = dataIdentity[DEFAULT_INTERACTION_FIELDS[key]];
        const phase = interactionPhase(resource, DEFAULT_INTERACTION_FIELDS[key]);
        return ANY_INTERACTION_FIELDS.has(key)
          ? resource.borrowAnyMask(dataIdentity, length, phase)
          : resource.borrowMask(dataIdentity, length, phase);
      }
      // A selection resource's membership (TODO 139.2): its mask over these rows.
      if (isSelectionField(key)) return selectionFieldMask(key, dataIdentity, length);
      if (Object.hasOwn(columns, key)) return columns[key];
      if (isCoordinate(grid, key)) return coordinate(key);
      throw Error(`Missing data column: ${key}. A string compared in a condition names a column; for the text itself write literal(${JSON.stringify(key)}) (Python hm.literal(...)).`);
    },
    scale(key, palette) {
      const shape=key.endsWith(':shape');
      const field=key.replace(/:(shape|position)$/,"");
      const paletteKey = !shape && palette ? `${key}\u0000${JSON.stringify(palette)}` : key;
      if (!scales.has(paletteKey))
        scales.set(paletteKey, columnMetadata[field]?.type === "ordinal"
          ? ordinal({ domain: columnMetadata[field]?.domain })
          : categorical(shape ? {} : {range:palette}));
      const input=columns[field]??(grid?.dims.find((dim)=>dim.name===field&&!(dim.coords instanceof Float64Array))?coordinate(field):undefined);
      if(input&&scaleColumns.get(paletteKey)!==input){
        const domain=input.categories??(Array.isArray(input)&&input.some(v=>typeof v==='string'||typeof v==='boolean')?input:null);
        if(domain)scales.get(paletteKey).include(domain);
        scaleColumns.set(paletteKey,input);
      }
      return scales.get(paletteKey);
    },
    resolve(value) {
      return isLiteral(value)
        ? value.value
        : typeof value === "string" && this.has(value)
          ? this.get(value)
          : value;
    },
  };
}
export function axisCategory(options, axis) {
  for (let n = options; n; n = n.defaults) {
    if (n.categoryAxes?.[axis]) return n.categoryAxes[axis];
    // A local numerical dimension must not inherit a parent's category codes.
    if (n.frameDefinition?.owns(axis)) return null;
  }
  return null;
}
