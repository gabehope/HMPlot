import { numpy as np, getWebGPUDevice } from "@hmplot/jax";
import { categorical, ordinal, literal } from "../plot/utils/categorical.js";
import { inputNode } from "../plot/utils/names.js";
import { continuous, createNormalization } from "../plot/utils/scaleResources.js";
import { createTheme } from "../plot/utils/theme.js";
import { rememberHostSource } from "../plot/utils/hostSources.js";
import { selection, identity, rememberDataIdentity } from "../plot/utils/interaction.js";
import { expressionFromDescriptor } from "../plot/utils/expressions.js";
import { animate } from "../plot/utils/animation.js";
import { registerShapes } from "../plot/utils/shapes.js";
import { connect, endpointDescriptor } from "../plot/utils/connections.js";
import { nameColumnValues } from "../plot/utils/axisTitles.js";
import { gridTable } from "../plot/utils/gridTable.js";
import { UNIT_MS } from "../plot/utils/columns.js";
import { limitError } from "../plot/utils/limits.js";
const columnPool = new Map();
const scalePool = new Map();
const FLOAT32_EXACT = 1n << 24n;
const warnedPrecision = new Set();
const INTEGER_ARRAYS = { int64: BigInt64Array, uint64: BigUint64Array };
/** Milliseconds per `unit` of a datetime or duration column; another unit is an error, not ms. */
function unitMs(unit, id) {
  if (!Object.hasOwn(UNIT_MS, unit))
    throw Error(`Column ${id}: unsupported time unit ${JSON.stringify(unit)}; a datetime or duration column's unit is one of ${Object.keys(UNIT_MS).join(", ")}.`);
  return UNIT_MS[unit];
}
/**
 * An int64 or uint64 payload (python/PROTOCOL.md): the exact values, and with `validity:
 * "uint8"` a byte per value after them, 0 where the row is missing (TODO 69.5: no integer value
 * stands for a missing one). `missing` is null when every row has a value.
 */
function integerPayload(desc, buffer) {
  const count = buffer.byteLength / (desc.validity ? 9 : 8);
  const values = new INTEGER_ARRAYS[desc.dtype](buffer, 0, count);
  const valid = desc.validity ? new Uint8Array(buffer, count * 8, count) : null;
  return { values, missing: valid && valid.includes(0) ? (row) => valid[row] === 0 : null };
}
/**
 * Decode a column payload into the typed array that becomes the GPU column, mutating
 * `metadata`. Datetime int64 columns are stored relative to their first value (metadata.origin
 * / sourceOrigin, milliseconds) because float32 cannot hold an epoch timestamp; durations are
 * milliseconds, with no origin (TODO 69.0). Numeric int64 and uint64 columns keep their values
 * (float32 is exact up to 2^24, beyond that `metadata.inexact` is set and a warning is logged)
 * and are flagged `integer` so the RGB 0-255 rule and legends can tell them from float data.
 * The exact values stay on the host: BigInts, NaN where missing.
 */
export function decodeColumn(desc, buffer, metadata = {}, id = "column") {
  let typed, source, exactValues;
  if (INTEGER_ARRAYS[desc.dtype]) {
    const { values: exact, missing } = integerPayload(desc, buffer), count = exact.length;
    // The exact integers stay on the host for keys (Partition, Join; TODO 43), NaN where missing.
    const host = missing ? Array.from(exact, (value, row) => (missing(row) ? NaN : value)) : exact;
    if (metadata.type === "datetime" || metadata.type === "duration") {
      const factor = unitMs(desc.unit, id);
      let origin = 0n;
      if (metadata.type === "datetime")
        for (let row = 0; row < count; row++) if (!missing?.(row)) { origin = exact[row]; break; }
      typed = new Float32Array(count);
      for (let row = 0; row < count; row++) typed[row] = missing?.(row) ? NaN : Number(exact[row] - origin) * factor;
      if (metadata.type === "datetime") {
        metadata.sourceOrigin = origin.toString();
        metadata.origin = Number(origin) * factor;
      }
      metadata.gpuUnit = "ms";
      source = host;
    } else {
      let inexact = false;
      typed = new Float32Array(count);
      for (let row = 0; row < count; row++) {
        if (missing?.(row)) { typed[row] = NaN; continue; }
        const value = exact[row];
        if (value > FLOAT32_EXACT || value < -FLOAT32_EXACT) inexact = true;
        typed[row] = Number(value);
      }
      exactValues = host;
      metadata.integer = true;
      if (inexact) {
        metadata.inexact = true;
        if (!warnedPrecision.has(id)) {
          warnedPrecision.add(id);
          console.warn(`Column ${id} holds integers beyond 2^24; the GPU stores float32, so large values lose precision.`);
        }
      }
      source = typed;
    }
  } else {
    typed = desc.dtype === "int32" ? new Int32Array(buffer) : new Float32Array(buffer);
    source = typed;
  }
  return { typed, source, exact: exactValues };
}
/**
 * A grid table's 1-D coordinates or edges (python/PROTOCOL.md "Grid tables"), decoded on the
 * host and never uploaded: numbers as float64, times as milliseconds from their first value
 * (the origin, as decodeColumn's), durations as milliseconds, categories by their codes.
 */
function hostCoordinates(desc, buffer, metadata, id) {
  let values;
  if (INTEGER_ARRAYS[desc.dtype]) {
    const { values: exact, missing } = integerPayload(desc, buffer), count = exact.length;
    const temporal = metadata.type === "datetime" || metadata.type === "duration";
    const factor = temporal ? unitMs(desc.unit, id) : 1;
    let origin = 0n;
    if (metadata.type === "datetime")
      for (let row = 0; row < count; row++) if (!missing?.(row)) { origin = exact[row]; break; }
    values = Float64Array.from(exact, (value, row) => (missing?.(row) ? NaN : Number(value - origin) * factor));
    if (metadata.type === "datetime")
      Object.assign(metadata, { sourceOrigin: origin.toString(), origin: Number(origin) * factor, gpuUnit: "ms" });
    else if (metadata.type === "duration") Object.assign(metadata, { unit: "ms", gpuUnit: "ms" });
  } else if (desc.categories) values = Array.from(new Int32Array(buffer), (code) => desc.categories[code] ?? null);
  else values = Float64Array.from(new Float32Array(buffer));
  return { __hmplotColumn: true, values, metadata };
}
/** A column descriptor's metadata, before its payload is decoded. */
function columnMetadata(desc) {
  const metadata = { type: desc.logical_type ?? (desc.categories ? "categorical" : "numeric"),
    ordered: Boolean(desc.ordered), domain: desc.categories, unit: desc.unit,
    timezone: desc.timezone, nullable: Boolean(desc.nullable), sourceDtype: desc.source_dtype,
    // A named Series passed as a channel: its name titles the axis (TODO 40.1).
    ...(desc.name ? { name: desc.name } : {}),
    // A table column's display name; a model calendar's times (TODO 48.6).
    ...(desc.label ? { label: desc.label } : {}),
    ...(desc.calendar ? { calendar: desc.calendar, calendarUnits: desc.calendar_units } : {}) };
  // Optional protocol fields are absent until supplied. An own undefined value
  // cannot survive the expression planner's lossless JSON metadata snapshot,
  // forcing otherwise ordinary Python numeric expressions onto the eager path.
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
}
/**
 * A column as the scene holds it: a GPU array (float32, or int32 codes) whose host values
 * (hostSources.js; a Python integer column's exact BigInts) keys and joins read, and its metadata.
 */
export function columnValue(desc, buffer, id = "column") {
  const metadata = columnMetadata(desc);
  const { typed, source, exact } = decodeColumn(desc, buffer, metadata, id);
  const array = np.array(typed).reshape(desc.shape);
  rememberHostSource(array, source, desc.shape, { integer: Boolean(metadata.integer), exact });
  return desc.categories
    ? { codes: array, categories: desc.categories, metadata }
    : { __hmplotColumn: true, values: array, metadata };
}
/** The ids of the columns a snapshot's grid tables hold as coordinates or edges. */
function coordinateIds(tables) {
  const ids = new Set();
  for (const table of Object.values(tables ?? {}))
    for (const dim of table.grid?.dims ?? []) {
      ids.add(dim.coords.$column);
      if (dim.edges) ids.add(dim.edges.$column);
    }
  return ids;
}
/**
 * The Data value of a grid table (TODO 48.6): gridTable() over the variables' columns, the
 * dimensions' host coordinates and edges (a time's edges moved to its coordinates' origin), and
 * the curvilinear positions' device arrays.
 */
function gridData(table, column) {
  const dims = {}, edges = {}, grid = table.grid;
  for (const dim of grid.dims) {
    const coords = column(dim.coords);
    dims[dim.name] = coords;
    if (!dim.edges) continue;
    const bounds = column(dim.edges), shift = (bounds.metadata.origin ?? 0) - (coords.metadata.origin ?? 0);
    edges[dim.name] = shift ? Float64Array.from(bounds.values, (value) => value + shift) : bounds.values;
  }
  if (Object.keys(dims).join("\0") !== grid.dims.map((dim) => dim.name).join("\0"))
    throw Error(`Grid dimensions named by integers (${grid.dims.map((dim) => dim.name).join(", ")}) are not supported.`);
  const columns = Object.fromEntries(Object.entries(table.columns).map(([key, value]) => [key, column(value)]));
  const positions = grid.positions && { dims: grid.positions.dims, x: grid.positions.x, y: grid.positions.y,
    columns: Object.fromEntries(Object.entries(grid.positions.columns).map(([key, value]) => [key, column(value).values])) };
  return gridTable({ dims, columns, edges, positions });
}
/**
 * Decode `{"$connect": {version, key, order, endpoints}}` (python/PROTOCOL.md "Connections")
 * into the connect() descriptor. Endpoints are `{target: {$ref}, at}` (a mark) or
 * `{scope: {$ref}, name, at}` (a Facet/Partition selection); each resolves through the mounted
 * handle's own endpoint() when it has one, exactly as a Svelte author writes it, so the
 * descriptor is structurally equal across re-derivations. A handle that has not mounted yet (a
 * forward reference: the connector precedes its endpoint in the scene) is a pending endpoint:
 * the connector keeps what it drew and resolves once the endpoint registers, because
 * `reference()` reads the runtime's reactive handle map. A newer version throws
 * connectVersionError (through connect()).
 */
export function decodeConnect(descriptor, reference) {
  const { version = 1, key = null, order = null, endpoints = [] } = descriptor ?? {};
  const decoded = endpoints.map((endpoint) => {
    const at = endpoint?.at ?? undefined;
    if (endpoint?.scope) {
      const id = endpoint.scope.$ref, scope = reference(id);
      return (typeof scope?.endpoint === "function" ? scope.endpoint(endpoint.name, { at }) : undefined) ??
        endpointDescriptor({ ref: id, at });
    }
    const id = endpoint?.target?.$ref, handle = reference(id);
    if (typeof handle?.endpoint === "function") return handle.endpoint({ at });
    return endpointDescriptor({ handle: handle ?? undefined, at, ref: id });
  });
  return connect(...decoded, { key: key ?? undefined, order: order ?? undefined, version });
}
/** Immutable, independently addressable columns. A transaction only uploads new IDs. */
export class SceneResources {
  columns = new Map();
  tables = new Map();
  scales = new Map();
  normalizations = new Map();
  themes = new Map();
  selections = new Map();
  identities = new Map();
  selectionVersions = new Map();
  // The offsets version of each table last taken from Python (TODO 38): an older snapshot
  // (a republish for another reason) must not undo a drag.
  offsetVersions = new Map();
  async prepare(state, load) {
    const created = [];
    const coordinates = coordinateIds(state.tables);
    try {
      for (const [id, desc] of Object.entries(state.columns)) {
        if (this.columns.has(id)) continue;
        if (columnPool.has(id)) {
          const pooled = columnPool.get(id);
          pooled.users++;
          this.columns.set(id, pooled.value);
          created.push(id);
          continue;
        }
        if (desc.dtype === "geojson") {
          const resource = desc.structured ? desc : (await load(id)).descriptor;
          if (!resource?.structured)
            throw Error(`Missing geometry resource ${id}`);
          this.columns.set(id, resource.structured);
          created.push(id);
          continue;
        }
        // An encoded image (a Python sky effect's image; TODO 37.5): its file's bytes, decoded in the
        // browser (createImageBitmap), so a JPEG stays a JPEG on the way.
        if (desc.dtype === "uint8" && desc.logical_type === "encoded-image") {
          const loaded = await load(id), bytes = loaded.payload ?? loaded;
          const raw = new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength);
          if (raw.byteLength !== desc.shape[0]) throw Error(`Invalid byte length for column ${id}`);
          const value = new Blob([raw.slice()], { type: desc.mime ?? "" });
          this.columns.set(id, value);
          columnPool.set(id, { value, users: 1 });
          created.push(id);
          continue;
        }
        if (
          !["float32", "int32", "int64", "uint64"].includes(desc.dtype) ||
          desc.byte_order !== "little" ||
          (desc.validity !== undefined && (desc.validity !== "uint8" || !INTEGER_ARRAYS[desc.dtype]))
        )
          throw Error(`Unsupported column format: ${id}`);
        const loaded = await load(id);
        // Another view may finish the same upload while its widget model resolves.
        if (columnPool.has(id)) {
          const pooled = columnPool.get(id);
          pooled.users++;
          this.columns.set(id, pooled.value);
          created.push(id);
          continue;
        }
        const bytes = loaded.payload ?? loaded;
        const raw =
          bytes instanceof DataView
            ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
            : new Uint8Array(
                bytes.buffer ?? bytes,
                bytes.byteOffset ?? 0,
                bytes.byteLength,
              );
        const count = desc.shape.reduce((a, b) => a * b, 1);
        // A grid table's coordinates stay on the host (hostCoordinates).
        const limit = coordinates.has(id) ? Infinity : getWebGPUDevice().limits.maxStorageBufferBindingSize;
        const byteSize = INTEGER_ARRAYS[desc.dtype] ? 8 : 4;
        if (!Number.isSafeInteger(count) || count < 0)
          throw Error(
            `Invalid shape for column ${id}: ${JSON.stringify(desc.shape)}`,
          );
        if (count * byteSize > limit)
          throw limitError("storage", {
            component: "Data",
            what: `column ${id}`,
            count: count * byteSize,
            limit,
            hint: "Select fewer rows before passing the table.",
          });
        if (count * (byteSize + (desc.validity ? 1 : 0)) !== raw.byteLength)
          throw Error(`Invalid byte length for column ${id}`);
        const copy = raw.slice().buffer;
        const value = coordinates.has(id) ? hostCoordinates(desc, copy, columnMetadata(desc), id) : columnValue(desc, copy, id);
        this.columns.set(id, value);
        columnPool.set(id, { value, users: 1 });
        created.push(id);
      }
      const selections = new Map(this.selections);
      for (const [id, descriptor] of Object.entries(state.selections ?? {}))
        if (!selections.has(id)) selections.set(id, selection(descriptor.by ? { by: descriptor.by } : {}));
      const identities = new Map(this.identities);
      for (const [id, descriptor] of Object.entries(state.identities ?? {})) {
        let owner = identities.get(id);
        if (!owner) owner = identity({ id, keys: this.columns.get(descriptor.keys.$column) });
        for (const kind of ["selection", "brush", "hover", "nearby", "nearest"]) {
          const resource = selections.get(descriptor[kind]?.$selection);
          if (resource) { owner[kind] = resource; resource.owner = owner; }
        }
        identities.set(id, owner);
      }
      const tables = new Map(), offsetUpdates = [];
      for (const [id, table] of Object.entries(state.tables)) {
        const old = this.tables.get(id);
        if (table.offsets) offsetUpdates.push([id, table.offsets, old?.version !== table.version]);
        if (old?.version === table.version) tables.set(id, old);
        else {
          const data = table.grid ? gridData(table, (v) => this.columns.get(v.$column)) : Object.fromEntries(
            Object.entries(table.columns).map(([key, v]) => [
              key,
              this.columns.get(v.$column),
            ]),
          );
          const owner = rememberDataIdentity(data.__geojson__ ?? data, {
            id, key: table.key, identity: old?.identity,
          });
          owner.selection = selections.get(table.selection?.$selection) ?? owner.selection;
          owner.brush = selections.get(table.brush?.$selection) ?? owner.brush;
          owner.hover = selections.get(table.hover?.$selection) ?? owner.hover;
          owner.nearby = selections.get(table.nearby?.$selection) ?? owner.nearby;
          owner.nearest = selections.get(table.nearest?.$selection) ?? owner.nearest;
          tables.set(id, {
            version: table.version,
            value: data.__geojson__ ?? data,
            identity: owner,
          });
        }
      }
      const owners = new Map([
        ...[...tables.values()].map((table) => [table.identity?.id, table.identity]),
        ...identities,
      ]);
      const selectionUpdates = [];
      for (const [id, descriptor] of Object.entries(state.selections ?? {})) {
        const entries = Object.entries(descriptor.owners ?? {})
          .map(([ownerId, rows]) => [owners.get(ownerId), rows])
          .filter(([owner]) => owner);
        selectionUpdates.push([id, selections.get(id), entries, descriptor.active, descriptor.version ?? 0, descriptor.constraints ?? {}]);
      }
      const normalizations = new Map(this.normalizations);
      const normalizationUpdates = [];
      for (const [id, descriptor] of Object.entries(state.normalizations ?? {})) {
        const old = normalizations.get(id);
        const config = { domain: descriptor.domain, transform: descriptor.transform,
          domainSource: descriptor.domainSource, constant: descriptor.constant, midpoint: descriptor.midpoint };
        if (old) normalizationUpdates.push([old, config]);
        else normalizations.set(id, createNormalization(config));
      }
      const scales = new Map(this.scales);
      const scaleUpdates = [];
      for (const [id, props] of Object.entries(state.scales ?? {})) {
        const old = scales.get(id);
        if (old) {
          scaleUpdates.push([old, props]);
          continue;
        }
        const normalizer = normalizations.get(props.normalization?.$normalization);
        if (props.kind === "continuous" && !normalizer)
          throw Error(`Continuous scale ${id} references an unavailable normalization.`);
        const scale = (props.kind !== "continuous" ? scalePool.get(id)?.value : null) ?? (props.kind === "continuous"
          ? continuous({ normalization: normalizer, label: props.label ?? undefined,
              // No colormap inherits the theme's default; only an explicit one overrides it.
              ...(props.range ? { range: props.range } : { colormap: props.colormap ?? undefined, missing: props.missing ?? undefined }),
              quantize: props.quantize, levels: props.levels })
          : props.kind === "ordinal"
            ? ordinal({ domain: props.domain, ...(props.range ? { range: props.range } :
                { colormap: props.colormap ?? "Viridis" }), unknown: props.unknown, label: props.label ?? undefined })
            : categorical(Object.fromEntries(Object.entries(props).filter(([key, value]) =>
                key !== "kind" && value !== null))));
        scales.set(id, scale);
      }
      // Custom shapes register before any mark reads them (idempotent per name and vertices).
      registerShapes(state.shapes ?? {});
      const themes = new Map(this.themes);
      for (const [id, descriptor] of Object.entries(state.themes ?? {})) {
        const old = themes.get(id);
        if (old?.version === descriptor.version) continue;
        themes.set(id, {
          version: descriptor.version,
          value: old?.value ?? createTheme(descriptor.value),
          next: descriptor.value,
        });
      }
      return { tables, scales, normalizations, normalizationUpdates, scaleUpdates,
        themes, selections, identities, selectionUpdates, offsetUpdates, created };
    } catch (error) {
      this.retire(created);
      throw error;
    }
  }
  /**
   * One scene update's resources, as a transaction (Stage 115.1). The update's resources are
   * prepared here; activate() puts them in place, keeping a snapshot of what it changes;
   * accept() keeps them once the scene settles and releases what the update replaced;
   * rollback() restores the snapshot; retire() releases what the update created unless it was
   * accepted. The runtime mounts, settles and decides between accept and rollback.
   */
  async transaction(state, load) {
    const prepared = await this.prepare(state, load);
    let saved = null, accepted = false;
    return {
      prepared,
      /** `owners`: interaction owners besides the tables' and identities' (mounted marks'). */
      activate: (owners, pendingInteractions) => {
        saved = this.snapshot(owners);
        this.commit(prepared, pendingInteractions);
      },
      accept: () => {
        accepted = true;
        saved = null;
        this.collect(state);
      },
      rollback: () => {
        if (saved) this.restore(saved);
        saved = null;
      },
      retire: () => {
        if (!accepted) this.retire(prepared.created);
      },
    };
  }
  /** Interaction owners by id: the tables' identities and standalone identities. */
  owners() {
    return new Map([
      ...[...this.tables.values()].map((table) => [table.identity?.id, table.identity]),
      ...[...this.identities.values()].map((owner) => [owner.id, owner]),
    ].filter(([, owner]) => owner));
  }
  /**
   * What commit() changes, for restore() after an update that fails before it settles: the
   * resource maps, scale and normalization values, selection rows of `owners` (the tables'
   * and identities' owners, plus any the caller adds), theme values, offsets and the version
   * maps Python's interaction state is compared with.
   */
  snapshot(owners = []) {
    owners = [...[...this.tables.values()].map((table) => table.identity), ...this.identities.values(), ...owners]
      .filter((owner, index, values) => owner && values.indexOf(owner) === index);
    return {
      tables: this.tables,
      scales: this.scales,
      normalizations: this.normalizations,
      scaleValues: [...this.scales].map(([id, scale]) => [id, scale.snapshot?.() ?? null]),
      normalizationValues: [...this.normalizations].map(([id, resource]) => [id, resource.snapshot()]),
      selections: this.selections,
      identities: this.identities,
      selectionRows: [...this.selections].map(([id, resource]) => [
        id, resource.active, owners.map((owner) => [owner, [...resource.rows(owner)]]),
      ]),
      themes: this.themes,
      themeValues: [...this.themes.values()].map(({ value }) => [value, value.version, value.snapshot()]),
      offsets: [...this.tables.values()].map((table) => table.identity?.offsets).filter(Boolean)
        .map((layer) => [layer, layer.snapshot()]),
      offsetVersions: new Map(this.offsetVersions),
      selectionVersions: new Map(this.selectionVersions),
    };
  }
  /** Put back a snapshot() taken before commit(); scales the update created are retired. */
  restore(saved) {
    this.tables = saved.tables;
    this.retireScales([...this.scales.keys()].filter((id) => !saved.scales.has(id)));
    this.scales = saved.scales;
    this.normalizations = saved.normalizations;
    for (const [id, value] of saved.normalizationValues) this.normalizations.get(id)?.update(value);
    for (const [id, value] of saved.scaleValues) {
      const scale = this.scales.get(id);
      if (!scale || !value) continue;
      if (scale.isContinuous)
        scale.update(value.range ? { range: value.range, quantize: value.quantize, levels: value.levels } :
          { colormap: value.colormap, quantize: value.quantize, levels: value.levels });
      else if (scale.isCategorical) scale.update(value);
    }
    this.selections = saved.selections;
    this.identities = saved.identities;
    for (const [id, active, owners] of saved.selectionRows) this.selections.get(id)?.hydrate(owners, active);
    // commit() replaces a kept theme's values in place and hydrates offsets on shared identities.
    this.themes = saved.themes;
    for (const [theme, version, value] of saved.themeValues) if (theme.version !== version) theme.replace(value);
    for (const [layer, value] of saved.offsets) layer.restore(value);
    this.offsetVersions = saved.offsetVersions;
    this.selectionVersions = saved.selectionVersions;
  }
  commit(prepared, pendingInteractions = new Set()) {
    this.tables = prepared.tables;
    this.normalizations = prepared.normalizations;
    for (const [id, value] of prepared.scales) {
      if (!this.scales.has(id)) {
        if (!value.isContinuous) {
          const shared = scalePool.get(id);
          if (shared) {
            shared.users++;
            prepared.scales.set(id, shared.value);
          } else scalePool.set(id, { value, users: 1 });
        }
      }
    }
    this.scales = prepared.scales;
    for (const [resource, props] of prepared.normalizationUpdates) resource.update(props);
    for (const [resource, props] of prepared.scaleUpdates) {
      if (props.kind === "continuous")
        resource.update(props.range ? { range: props.range, quantize: props.quantize, levels: props.levels } :
          { colormap: props.colormap ?? null, quantize: props.quantize, levels: props.levels, missing: props.missing ?? null });
      else resource.update(props.range ? { domain: props.domain, range: props.range, unknown: props.unknown } :
        props.kind === "ordinal"
          ? { domain: props.domain, colormap: props.colormap ?? "Viridis", unknown: props.unknown }
          : { domain: props.domain, range: null, unknown: props.unknown });
    }
    this.selections = prepared.selections;
    this.identities = prepared.identities;
    for (const [id, offsets, dataChanged] of prepared.offsetUpdates ?? []) {
      const version = offsets.version ?? 0;
      if (version <= (this.offsetVersions.get(id) ?? 0)) continue;
      this.tables.get(id)?.identity?.offsets.hydrate(offsets, { pending: dataChanged });
      this.offsetVersions.set(id, version);
    }
    for (const [id, resource, owners, active, version] of prepared.selectionUpdates ?? []) {
      if (pendingInteractions.has(id) || version < (this.selectionVersions.get(id) ?? 0)) continue;
      resource?.hydrate(owners, active);
      this.selectionVersions.set(id, version);
    }
    for (const resource of prepared.themes.values())
      if (resource.next) {
        resource.value.replace(resource.next);
        delete resource.next;
      }
    this.themes = prepared.themes;
  }
  resolve(value, reference) {
    if (!value || typeof value !== "object") return value;
    // Portable template parameters are values already supplied by the Svelte host. Preserve
    // tables, typed arrays and expression objects instead of treating them as JSON descriptors.
    if (Object.hasOwn(value, "$host")) return value.$host;
    if (value.$column) {
      const column = this.columns.get(value.$column);
      if (!column?.__hmplotColumn) return column;
      nameColumnValues(column.values, column.metadata?.name);
      return column.values;
    }
    if (value.$table) return this.tables.get(value.$table)?.value;
    if (value.$scale) return this.scales.get(value.$scale);
    if (value.$normalization) return this.normalizations.get(value.$normalization);
    if (value.$theme) return this.themes.get(value.$theme)?.value;
    if (value.$selection) return this.selections.get(value.$selection);
    if (value.$identity) return this.identities.get(value.$identity);
    // hm.animate(value, ...): the JS animate() descriptor on a mark channel.
    if (value.$animate) {
      const fields = value.$animate;
      return animate(this.resolve(fields.value, reference), {
        duration: fields.duration, easing: fields.easing,
        enter: this.resolve(fields.enter, reference), exit: this.resolve(fields.exit, reference),
      });
    }
    // hm.connect(...): the JS connect() descriptor on a connector's `connections`.
    if (value.$connect) return decodeConnect(value.$connect, reference);
    // A reduction's options ride along as a literal marker, not as an operand to evaluate.
    if (value.$expression_options)
      return Object.freeze({ __expressionLiteral: true, ...Object.fromEntries(Object.entries(value.$expression_options).map(([key, item]) => [key, this.resolve(item, reference)])) });
    // hm.input("root", default=...): the read resolves to its default while nothing declares it.
    if (value.$expression?.op === "input" && "default" in value.$expression)
      return inputNode(value.$expression.args[0], { default: this.resolve(value.$expression.default, reference) });
    if (value.$expression)
      return expressionFromDescriptor({ $expression: { op: value.$expression.op,
        args: value.$expression.args.map((item) => this.resolve(item, reference)) } });
    if (value.$ref) return reference(value.$ref);
    // A Python datetime, date or datetime64 (TODO 53): epoch milliseconds.
    if ("$datetime" in value) return new Date(value.$datetime);
    if ("$literal" in value)
      return literal(this.resolve(value.$literal, reference));
    // hm.rgb(r, g, b, a): component columns for an RGB color channel.
    if (value.$rgb)
      return Object.fromEntries(Object.entries(value.$rgb).map(([k, v]) => [k, this.resolve(v, reference)]));
    if (Array.isArray(value))
      return value.map((v) => this.resolve(v, reference));
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, this.resolve(v, reference)]),
    );
  }
  retire(ids) {
    for (const id of ids) {
      const value = this.columns.get(id);
      const pooled = columnPool.get(id);
      if (!pooled || --pooled.users === 0) {
        (value?.codes ?? value?.values ?? value)?.dispose?.();
        columnPool.delete(id);
      }
      this.columns.delete(id);
    }
  }
  retireScales(ids) {
    for (const id of ids) {
      const shared = scalePool.get(id);
      if (shared && --shared.users === 0) scalePool.delete(id);
      if (!shared) this.scales.get(id)?.dispose?.();
      this.scales.delete(id);
    }
  }
  collect(state) {
    this.retireScales(
      [...this.scales.keys()].filter((id) => !state.scales[id]),
    );
    this.retire([...this.columns.keys()].filter((id) => !state.columns[id]));
    for (const id of [...this.normalizations.keys()])
      if (!state.normalizations?.[id]) this.normalizations.delete(id);
    for (const id of [...this.themes.keys()])
      if (!state.themes?.[id]) this.themes.delete(id);
    for (const id of [...this.selections.keys()])
      if (!state.selections?.[id]) { this.selections.get(id)?.dispose?.(); this.selections.delete(id); }
    for (const id of [...this.identities.keys()])
      if (!state.identities?.[id]) { this.identities.get(id)?.dispose?.(); this.identities.delete(id); }
  }
  dispose() {
    this.retire([...this.columns.keys()]);
    this.tables.clear();
    this.retireScales([...this.scales.keys()]);
    this.normalizations.clear();
    this.themes.clear();
    for (const value of this.selections.values()) value.dispose?.();
    this.selections.clear();
    this.selectionVersions.clear();
    this.offsetVersions.clear();
    this.identities.clear();
  }
}
