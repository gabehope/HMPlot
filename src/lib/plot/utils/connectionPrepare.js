/**
 * Connections (Stage 15), the consumer at rest (Tier 1): a mark with `connections`
 * (Line, Segments, Arrows3D, Arrows) resolves its connect() descriptor against the
 * View's endpoint registry, matches endpoint rows by key, and gathers the endpoints'
 * positions on jax into world coordinates (each endpoint's own frame chain applied, so the
 * consumer draws them with `positionSpace = "world"` and maps nothing again). The result
 * also carries a data scope for the connector's appearance channels (`color="species"`,
 * `source.<field>`, `target.<field>`), the picking payload, and shared-owner selection rows.
 *
 * Everything here is re-run when an endpoint publishes, registers, unregisters or changes
 * frame; the match (the expensive, host-side part) is cached by the endpoints' data
 * revisions only, so a frame change re-gathers without re-matching. The live GPU gather
 * that follows animated endpoints every clock frame is Tier 2 (chunk C).
 */
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { asArray, shapeOf } from "./data.js";
import { mapThroughFrame, mapOperations } from "./coordinateArrays.js";
import { buildCoordinateOperations, resolveCoordinateOperations } from "./coordinateOperations.js";
import { rectangleArrays } from "./rectangles.js";
import { createDataScope, isLiteral } from "./categorical.js";
import { placedFrame } from "./framePlacement.js";
import { markBinding } from "./markBinding.js";
import { Matrix4 } from "three/webgpu";
import { existingHostSource } from "./hostSources.js";
import { virtualRevision } from "./interaction.js";
import {
  endpointLabel, entryLabel, endpointSlots, endpointAncestor, endpointAttachment, matchEndpoints,
  matchCacheKey, connectionLayout, sameConnect, isEndpointKind, otherViewError, connectionBackedError,
  anchoredFrameError, billboardFrameError, deferredEndpointError, noTableError, missingKeyColumnError,
  globeEndpointError,
} from "./connections.js";
import { kindsWith } from "./markKinds.js";
import { coordinateView } from "./viewContext.js";

/** Whether a connector's own frame is a 2D globe or map (its endpoints gather in its source space). */
export const onGlobe = (options) => options?.get?.("coordinates") === "spherical" &&
  coordinateView(options) === "2d";

export { mapThroughFrame };

/** Fields a connection-backed mark takes from its endpoints; they never animate on their own. */
export const CONNECTION_FIELDS = Object.freeze([
  "position", "start", "end", "previous", "next", "control1", "control2", "distance", "endpointOffset",
]);
/** Marks whose `dx`/`dy` (pixels, e.g. from Dodge) displace the drawn point. */
const OFFSET_KINDS = kindsWith("endpointOffsets");
const PENDING = Object.freeze({ pending: true });

// ---------------------------------------------------------------------------------------
// Host values of a key column
// ---------------------------------------------------------------------------------------
/**
 * The host values of a column for explicit-key matching: plain and typed arrays as they are,
 * dictionary columns decoded through their categories (missing codes read null), GPU arrays
 * from their retained host source or, failing that, one readback (matching is cached by data
 * revision, so this runs when an endpoint publishes, never per frame).
 */
export async function hostColumnValues(value) {
  if (value?.__hmplotColumn) return hostColumnValues(value.values);
  if (value?.codes !== undefined) {
    const codes = await hostColumnValues(value.codes);
    return Array.from(codes ?? [], (code) => (code < 0 || !Number.isFinite(Number(code)) ? null : value.categories?.[code] ?? null));
  }
  if (value instanceof JaxArray) {
    const host = existingHostSource(value);
    if (host) return host;
    return Array.from(await value.ref.data());
  }
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value;
  return undefined;
}

// ---------------------------------------------------------------------------------------
// Endpoint geometry
// ---------------------------------------------------------------------------------------
/** `[N, k]` (or a single `[k]` row) as a float `[N, 3]` array, missing columns zero. Borrows. */
function rows3(value) {
  let array = asArray(value).astype(np.float32);
  if (array.shape.length === 1) array = array.reshape([1, -1]);
  if (array.shape[1] < 3) array = np.pad(array, [[0, 0], [0, 3 - array.shape[1]]]);
  else if (array.shape[1] > 3) array = array.slice([], [0, 3]);
  return array;
}
/** The endpoint mark's fields an attachment reads, as `[N, 3]` data coordinates (owned). */
function endpointFields(entry) {
  const props = entry.shown?.props ?? {};
  if (entry.kind === "Rect" || entry.kind === "Prism") {
    const box = rectangleArrays(entry.kind === "Rect" ? "rect" : "prism", props);
    box.turn.dispose();
    return { position: box.position, extent: box.extent };
  }
  const out = {};
  for (const name of ["position", "start", "end"])
    if (props[name] !== undefined && props[name] !== null && shapeOf(props[name]).length) out[name] = rows3(props[name]);
  return out;
}
const disposeAll = (values) => { for (const value of Object.values(values ?? {})) value?.dispose?.(); };
/**
 * Evaluate a resolved attachment on `[N, 3]` fields: `sum(weight * field)` per component (the
 * formula ATTACHMENTS documents), and, with a per-row `fraction`, component `axis` replaced by
 * `field0 + (field1 - field0) * fraction` (position to extent: a Bar's value end, a BoxPlot
 * median). The live WGSL gather (connectionGather.js) computes exactly this. Borrows fields.
 */
export function evaluateAttachment({ fields: terms, fraction = null, axis = 3 }, fields, label) {
  let sum = null;
  for (const [name, weights] of terms) {
    const field = fields[name];
    if (!field) throw Error(`connect: endpoint "${label}" has no ${name} to attach to yet.`);
    const term = field.ref.mul(np.array(weights));
    sum = sum ? sum.add(term) : term;
  }
  if (!fraction || axis > 2) return sum;
  const lower = fields[terms[0][0]].ref.slice([], axis), upper = fields[terms[1][0]].ref.slice([], axis);
  const mixed = lower.ref.add(upper.sub(lower).mul(fraction.ref));
  const out = np.stack([0, 1, 2].map((i) => (i === axis ? mixed.ref : sum.ref.slice([], i))), 1);
  sum.dispose(); mixed.dispose();
  return out;
}
/** Box weights: the center (1/2, 1/2) on every axis but `axis`, where position and extent weigh `lower`/`upper`. */
function boxTerms(axis, lower, upper) {
  const a = [0.5, 0.5, 0.5], b = [0.5, 0.5, 0.5];
  a[axis] = lower; b[axis] = upper;
  return [["position", a], ["extent", b]];
}
/** A compound column of the endpoint's shown table as float32 `[N]` (owned), or throws the deferred error. */
function compoundColumn(entry, key, kind, compound, name) {
  const column = key && entry.shown.scope?.has?.(key) ? entry.shown.scope.get(key) : undefined;
  if (column === undefined) throw Error(deferredEndpointError(kind, compound, `no ${name} column`));
  return asArray(column?.__hmplotColumn ? column.values : column).astype(np.float32).reshape([-1]);
}
/**
 * A compound mark's attachment (ATTACHMENTS[kind].at[name], by form; TODO 130.2) as
 * `{fields, fraction?, axis?}` for evaluateAttachment: an `edge` is a box edge on the value axis
 * (Histogram value/baseline, BoxPlot q1/q3); an `end` is the upper or lower box edge by whether
 * its column is at least `from`, or the other one (`opposite`: a Bar's baseline end is always the
 * edge its value end is not; its value end is its lower edge when negative, and follows the box
 * while it animates); a `fraction` sits at (value - low) / (high - low) of the box on the
 * value axis (a BoxPlot's median). The fraction is float32 `[N]` (owned by the caller).
 */
export function compoundAttachment(entry, attachment, kind) {
  const spec = entry.compoundSpec, compound = entry.compound ?? entry.kind, { compound: name, form } = attachment;
  if (!spec?.valueAxis) throw Error(deferredEndpointError(kind, compound, `no ${name} axis`));
  const axis = spec.valueAxis();
  if (axis !== 0 && axis !== 1 && axis !== 2) throw Error(deferredEndpointError(kind, compound, `no ${name} axis`));
  if (form.edge) return { fields: boxTerms(axis, ...form.edge) };
  if (form.fraction) {
    const value = compoundColumn(entry, form.fraction.value, kind, compound, name);
    const low = compoundColumn(entry, form.fraction.low, kind, compound, form.fraction.low);
    const high = compoundColumn(entry, form.fraction.high, kind, compound, form.fraction.high);
    const span = high.sub(low.ref);
    const fraction = np.where(span.ref.greater(0), value.sub(low).div(np.where(span.ref.greater(0), span.ref, 1)), 0);
    span.dispose();
    return { fields: boxTerms(axis, 0.5, 0.5), fraction, axis };
  }
  const end = compoundColumn(entry, form.end, kind, compound, name);
  const from = compoundColumn(entry, form.from, kind, compound, form.from);
  const upper = end.greaterEqual(from);
  const fraction = np.where(form.opposite ? np.logicalNot(upper) : upper, 1, 0).astype(np.float32);
  return { fields: boxTerms(axis, 0.5, 0.5), fraction, axis };
}
/** Whether a placed frame (and every placed frame around it) resolves without the camera: 3D, not billboard. */
function cameraIndependent(definition) {
  for (let frame = definition; frame; frame = placedFrame(frame.parent)) {
    if ((frame.mode?.() ?? "2d") !== "3d") return false;
    if (frame.placement?.orientation === "billboard") return false;
  }
  return true;
}
/**
 * The matrix that takes an endpoint's placed-frame coordinates into the consumer's (its own
 * placement is applied by the consumer's shader): null when both share one placement. 3D
 * world-size placements do not depend on the camera, so the gather applies them; pixel-anchored
 * (2D) and billboard frames do, and raise the anchored-frame error. Returns a live getter.
 */
export function placementTransform(entry, consumerPlacement, kind, label) {
  const own = placedFrame(entry.options);
  if (own === consumerPlacement) return null;
  if (!cameraIndependent(own) || !cameraIndependent(consumerPlacement)) {
    const billboard = [own, consumerPlacement].some((frame) => frame?.placement?.orientation === "billboard" && frame.mode?.() === "3d");
    throw Error(billboard ? billboardFrameError(kind, label) : anchoredFrameError(kind, label));
  }
  return () => {
    const matrix = new Matrix4();
    if (consumerPlacement) matrix.copy(consumerPlacement.inverse);
    if (own) matrix.multiply(own.matrix);
    return matrix;
  };
}
/** `[N, 3]` rows through a 4x4 matrix (column-major elements), per component. Borrows `points`. */
function transformRows(points, matrix) {
  const e = matrix.elements;
  const column = (k) => points.ref.slice([], k);
  return np.stack([0, 1, 2].map((j) =>
    column(0).mul(e[j]).add(column(1).mul(e[4 + j])).add(column(2).mul(e[8 + j])).add(e[12 + j])), 1);
}
/** Rows with a nonfinite component become missing (NaN) in every component, as in the live gather. */
function finiteRows(points) {
  const valid = np.all(np.isfinite(points.ref), 1).reshape([-1, 1]);
  return np.where(valid, points, np.nan);
}
/**
 * Data-space attachment points `[N, 3]` to the consumer's space: the endpoint's frame chain
 * (mapThroughFrame), then its placement transform (`placement()`: a Matrix4, or null). A row
 * with a nonfinite component before or after is missing in every component. The live gather's
 * vertex kernel computes the same. Consumes `point`.
 */
export function worldPoints(point, options, placement = null) {
  let mapped = mapThroughFrame(point, options);
  const valid = np.all(np.isfinite(point), 1);
  if (placement) { const placed = transformRows(mapped, placement); mapped.dispose(); mapped = placed; }
  return finiteRows(np.where(valid.reshape([-1, 1]), mapped, np.nan));
}
/** The frame options that own `options` (the node carrying its frame definition). */
const frameOwner = (options) => {
  for (let node = options; node; node = node.defaults) if (node.frameDefinition) return node;
  return null;
};
/**
 * An endpoint's operations up to, not including, the spherical frame `globe`'s own: they take
 * its data into that globe's longitude and latitude, where a connector routes great circles
 * (the connector's frame contains its endpoints, so the globe is on every endpoint's chain).
 * Null when the chain does not pass through it (an endpoint in a pixel-placed inset).
 */
export function globeOperations(options, globe) {
  const built = buildCoordinateOperations(options),
    index = built.findIndex((operation) => operation.kind.startsWith("spherical") &&
      frameOwner(operation.options) === globe);
  return index < 0 ? null : resolveCoordinateOperations(options, { includePlacement: true }).slice(0, index);
}
/** `worldPoints` for a connector on a globe: data points to the globe's longitude and latitude. Consumes `point`. */
function globePoints(point, operations) {
  const mapped = mapOperations(point, operations), valid = np.all(np.isfinite(point), 1);
  return finiteRows(np.where(valid.reshape([-1, 1]), mapped, np.nan));
}
/** Pixel offsets (Dodge, dx/dy) of a point endpoint as `[N, 2]`, or null (owned). */
function endpointOffsets(entry, count) {
  if (!OFFSET_KINDS.includes(entry.kind)) return null;
  const { dx, dy } = entry.shown?.props ?? {};
  const present = (v) => v !== undefined && v !== null && (typeof v !== "number" || v !== 0);
  if (!present(dx) && !present(dy)) return null;
  const column = (v) => typeof v === "number" ? np.full([count], v)
    : v === undefined || v === null ? np.zeros([count]) : asArray(v).astype(np.float32).reshape([-1]);
  return np.stack([column(dx), column(dy)], 1);
}
/** Rows `rows` (-1 = missing) of `values` ([N, width]) as `[rows.length, width]`, missing rows `fill`. Borrows. */
function gatherRows(values, rows, width, fill) {
  const count = rows.length;
  if (!count) return np.zeros([0, width]);
  if (!values || !values.shape[0]) return np.full([count, width], fill);
  const index = np.array(rows, { dtype: np.int32 });
  const valid = index.ref.greaterEqual(0);
  const safe = np.where(valid.ref, index, 0);
  const taken = np.take(values.ref, safe, 0);
  return np.where(valid.reshape([-1, 1]), taken, fill);
}

// ---------------------------------------------------------------------------------------
// Appearance scope
// ---------------------------------------------------------------------------------------
const QUALIFIED = /^(source|target)\.(.+)$/;
const categoryInput = (value) => Array.isArray(value) && value.some((v) => typeof v === "string" || typeof v === "boolean");
/** Column `value` at `rows` (Int32Array, -1 = missing): dictionary codes stay codes (-1 missing), numbers NaN. */
function gatherColumn(value, rows) {
  const count = rows.length;
  if (value?.__hmplotColumn) return gatherColumn(value.values, rows);
  if (value?.isGeometryColumn || value?.geometry) throw Error("connections cannot use geometry columns for appearance.");
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value?.codes !== undefined || categoryInput(value)) {
    let categories = value.categories, codes = value.codes;
    if (!codes) {
      categories = [...new Set(value.filter((v) => v !== null && v !== undefined))];
      const lookup = new Map(categories.map((v, i) => [v, i]));
      codes = Int32Array.from(value, (v) => lookup.get(v) ?? -1);
    }
    if (!(codes instanceof JaxArray)) {
      const host = Int32Array.from(codes, Number);
      return { codes: np.array(Int32Array.from(rows, (row) => (row < 0 ? -1 : host[row] ?? -1)), { dtype: np.int32 }), categories };
    }
    if (!count) return { codes: np.zeros([0], { dtype: np.int32 }), categories };
    const source = codes.ref.astype(np.int32);
    if (!source.shape[0]) { source.dispose(); return { codes: np.full([count], -1, { dtype: np.int32 }), categories }; }
    const index = np.array(rows, { dtype: np.int32 }), valid = index.ref.greaterEqual(0);
    const taken = np.take(source, np.where(valid.ref, index, 0), 0);
    return { codes: np.where(valid, taken, -1).astype(np.int32), categories };
  }
  const array = asArray(value);
  const shape = array.shape;
  const flat = shape.length === 1 ? array.astype(np.float32).reshape([-1, 1]) : array.astype(np.float32);
  const gathered = gatherRows(flat, rows, flat.shape[1] ?? 1, np.nan);
  flat.dispose();
  return shape.length === 1 ? gathered.reshape([-1]) : gathered;
}

/**
 * The data scope a connector's appearance channels resolve in (namedMark passes it to
 * prepareNamed as the mark scope). One row per consumer row (`rowConnection[r]` = the
 * connection it draws, -1 for a Line's separator rows).
 * - Shared owner (every slot shows observations of one table and each connection is one
 *   observation): unqualified fields resolve in that table (`ownerScope`) at the
 *   connection's source row (`ownerRows`), so `color="species"` and `@selected` work and
 *   categorical scales key on the original column.
 * - Always: `source.<field>` / `target.<field>` read the first / last slot's own scope at
 *   the connection's row there; a missing slot row reads as missing, never another slot's.
 * - An unqualified field that only an endpoint's table has (no shared owner, or an
 *   endpoint-local derived column) is ambiguous (`ambiguous(field)`), never guessed.
 * Scalars and per-row arrays pass through prepareNamed untouched. Reference counted like a
 * data view: retain() for each prepared frame that uses it.
 */
export function connectionScope({ rows = 0, rowConnection = new Int32Array(0), slotScopes = [], slotRows = [],
  shared = false, ownerScope = null, ownerRows = null, owner = null } = {}) {
  const cache = new Map(), local = createDataScope();
  let users = 1, disposed = false;
  const last = slotScopes.length - 1;
  const perRow = (perConnection) => Int32Array.from(rowConnection, (c) => (c < 0 || !perConnection ? -1 : perConnection[c]));
  const qualified = (key) => {
    const match = typeof key === "string" ? QUALIFIED.exec(key) : null;
    if (!match) return null;
    const slot = match[1] === "source" ? 0 : last;
    return { slot, field: match[2], scope: slotScopes[slot] ?? null, rows: slotRows[slot] ?? null };
  };
  const unqualified = (key) => shared && !!ownerScope?.has?.(key);
  const scope = {
    length: rows,
    aggregate: false,
    identityRows: false,
    identity: shared ? owner : undefined,
    parent: shared ? ownerScope : undefined,
    pipeline: [],
    topology: `connections-${Math.random().toString(36).slice(2)}`,
    get interactionRevision() { return shared ? ownerScope?.interactionRevision ?? 0 : 0; },
    interactionResource: (field) => (shared ? ownerScope?.interactionResource?.(field) : undefined),
    /** Whether an unqualified field would have to pick one endpoint's table. */
    ambiguous(field) {
      if (typeof field !== "string" || qualified(field) || unqualified(field)) return false;
      return slotScopes.some((slotScope) => slotScope?.has?.(field));
    },
    keys() {
      const names = shared ? [...(ownerScope?.keys?.() ?? [])] : [];
      for (const [prefix, slot] of [["source", 0], ["target", last]])
        for (const key of slotScopes[slot]?.keys?.() ?? []) names.push(`${prefix}.${key}`);
      return [...new Set(names)];
    },
    has(key) {
      const q = qualified(key);
      if (q) return !!q.scope?.has?.(q.field);
      return unqualified(key);
    },
    get(key) {
      if (disposed) throw Error("Connection scope has been disposed.");
      const q = qualified(key);
      const source = q ? q.scope : unqualified(key) ? ownerScope : null;
      const field = q ? q.field : key;
      if (!source?.has?.(field)) throw Error(`Missing data column: ${key}`);
      const virtual = String(field).startsWith("@");
      // A membership column follows its own resource's revision (a selection field's, TODO 139).
      const cacheKey = virtual ? `${key}:${virtualRevision(source, field)}` : key;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      if (virtual) for (const old of [...cache.keys()]) if (old.startsWith(`${key}:`)) { release(cache.get(old)); cache.delete(old); }
      const value = gatherColumn(source.get(field), perRow(q ? q.rows : ownerRows));
      cache.set(cacheKey, value);
      return value;
    },
    resolve(value) {
      return isLiteral(value) ? value.value : typeof value === "string" && this.has(value) ? this.get(value) : value;
    },
    metadata(key) {
      const q = qualified(key);
      if (q) return q.scope?.metadata?.(q.field);
      return unqualified(key) ? ownerScope.metadata?.(key) : undefined;
    },
    columnIdentity(key) {
      const q = qualified(key);
      if (q) return q.scope?.columnIdentity?.(q.field);
      return unqualified(key) ? ownerScope.columnIdentity?.(key) : undefined;
    },
    columnName(key) {
      const q = qualified(key);
      if (q) return q.scope?.columnName ? q.scope.columnName(q.field) : q.field;
      return unqualified(key) && ownerScope.columnName ? ownerScope.columnName(key) : key;
    },
    scale(key, palette) {
      const [field, suffix = ""] = String(key).split(/(?=:(?:shape|position|size|width|opacity|outlineColor)$)/);
      const q = qualified(field);
      if (q?.scope?.scale) return q.scope.scale(q.field + suffix, palette);
      if (unqualified(field) && ownerScope.scale) return ownerScope.scale(key, palette);
      return local.scale(key, palette);
    },
    encode: (...args) => local.encode(...args),
    retain() {
      if (disposed) throw Error("Cannot retain a disposed connection scope.");
      users++;
      return () => scope.dispose();
    },
    dispose() {
      if (disposed || --users > 0) return;
      disposed = true;
      for (const value of cache.values()) release(value);
      cache.clear();
      local.dispose();
    },
  };
  return scope;
}
function release(value) {
  if (value?.codes?.dispose) value.codes.dispose();
  else value?.dispose?.();
}

// ---------------------------------------------------------------------------------------
// Resolution, matching, gathering
// ---------------------------------------------------------------------------------------
/** The owner-rooted scope a derived view descends from (rows = the owner's rows), or null. */
function ownerRootScope(scope, owner) {
  for (let node = scope; node; node = node.parent)
    if (node.identityRows === true && node.identity === owner) return node;
  return null;
}
const tokenRows = new WeakMap();
/** The owner row of an observation token (namedMark's `ownerKey`: the key token, or `row:i`). */
function ownerRow(owner, token) {
  if (token == null) return -1;
  if (owner?.tokens) {
    let map = tokenRows.get(owner.tokens);
    if (!map) tokenRows.set(owner.tokens, (map = new Map(owner.tokens.map((t, i) => [t, i]))));
    if (map.has(token)) return map.get(token);
  }
  const match = /^row:(\d+)$/.exec(token);
  return match ? Number(match[1]) : -1;
}
/** A key token back to its value for event payloads ("number:3" -> 3); other tokens as they are. */
export function tokenValue(token) {
  if (typeof token !== "string") return token ?? null;
  const match = /^(number|string|boolean|bigint):([\s\S]*)$/.exec(token);
  if (!match) return token;
  if (match[1] === "number") return Number(match[2]);
  if (match[1] === "boolean") return match[2] === "true";
  return match[2];
}

/**
 * The connection payload an event on consumer row `row` carries: the connection (index,
 * key), every slot's endpoint (label, definition, cell, row, observation token), `source` /
 * `target` (the first and last slots), and for Segments-like marks the `pair` drawn. JSON-safe.
 */
export function connectionEvent(result, row) {
  const { layout, index, keys, slots } = result;
  if (!Number.isInteger(row) || row < 0 || row >= layout.connection.length) return null;
  const c = layout.connection[row];
  if (c < 0) return null;
  const slot = (s) => {
    const info = slots[s], at = index[s]?.[c] ?? -1;
    return {
      slot: s, label: info.label, definition: info.definition, cell: info.cell, kind: info.kind,
      row: at < 0 ? null : at, key: at < 0 ? null : info.tokens?.[at] ?? null,
    };
  };
  const all = slots.map((_, s) => slot(s));
  const payload = {
    index: c, key: tokenValue(keys[c]), source: all[0] ?? null, target: all.at(-1) ?? null, slots: all,
    ...(result.shared ? { ownerRow: result.ownerRows[c] } : {}),
  };
  if (layout.kind === "pairs") payload.pair = [all[layout.startSlot[row]], all[layout.endSlot[row]]];
  else if (layout.slot[row] >= 0 && layout.connection[row + 1] === c) payload.pair = [all[layout.slot[row]], all[layout.slot[row + 1]]];
  return payload;
}

/**
 * The consumer of one connect() descriptor for one mark. `update(descriptor)` re-resolves
 * when the descriptor changed (structurally: sameConnect); registry changes of the entries
 * it uses re-run it. Each run reports one state through `onState`:
 *   {result}   a complete result (namedMark re-prepares with it; the previous one is disposed)
 *   {pending}  an endpoint is not resolved or not published yet: keep what is on screen
 *   {error}    a structural, matching or attachment error (reported; the screen keeps the last result)
 * At most one run is in flight; changes during it set one dirty bit (one pending update).
 * `track(promise)` registers runs as renderer preparations (whenSettled waits for them) and
 * `settle()` resolves after the consumer's own re-preparation had its chance to run.
 */
/** @param {{kind: string, renderer: import("./internalTypes.js").PlotRenderer,
 * view?: import("./internalTypes.js").ViewServices, registry: ReturnType<typeof import("./endpointRegistry.js").endpointRegistry>,
 * frameOptions?: () => import("./internalTypes.js").FrameOptions|null,
 * options?: import("../../options/options.js").OptionsNode|null,
 * onState?: (state: import("./markPlanTypes.js").ConnectionState) => void,
 * track?: <T>(work: Promise<T>) => Promise<T>, settle?: () => Promise<unknown>,
 * live?: {frameChanged(): boolean|string}|null, restDelay?: number}} mount */
export function createConnectionConsumer({ kind, renderer, view = undefined, registry, frameOptions = () => null, options = null,
  onState = () => {}, track = (work) => work, settle = async () => {}, live = null, restDelay = 120 }) {
  let descriptor = null, disposed = false, running = false, dirty = false;
  let result = null, lastState = null, used = new Set(), resolvedAt = [];
  let matchCache = { key: null, match: null };
  let restTimer = null, restDone = null;
  const demands = new Map(), scopeIds = new WeakMap(), entryIds = new WeakMap();
  let nextScopeId = 0, nextEntryId = 0;
  // Test hooks (also summed in the view's diagnostics counters: connectionMatches, connectionPreparations).
  const counters = { runs: 0, matches: 0, gathers: 0, followed: 0 };

  // Registrations and publishes re-run everything (Tier 1). A frame change of an endpoint in
  // use (range / bounds sliders) is followed by the live gather (`live.frameChanged`, Tier 2),
  // with no re-preparation per change; when the connector derives more from the rows on the
  // host (curve controls: "rest"), Tier 1 runs once the frame has been still for `restDelay` ms.
  const stop = registry.subscribe((changes) => {
    if (disposed || !descriptor) return;
    const mine = changes.filter(({ entry }) => used.has(entry));
    if (changes.some(({ change }) => change === "register" || change === "unregister") ||
        mine.some(({ change }) => change !== "frame")) { schedule(); return; }
    if (!mine.length) return;
    const followed = live?.frameChanged?.(mine.map(({ entry }) => entry));
    if (!followed) { schedule(); return; }
    counters.followed++;
    if (followed === "rest") rest();
  });
  /** Tier 1 once the frame stops changing (tracked, so whenSettled waits for it). */
  function rest() {
    clearTimeout(restTimer);
    if (!restDone) {
      let resolveRest;
      const done = new Promise((resolve) => { resolveRest = resolve; });
      restDone = resolveRest;
      track(done);
    }
    restTimer = setTimeout(() => {
      const resolveRest = restDone;
      restDone = null;
      restTimer = null;
      schedule();
      resolveRest?.();
    }, restDelay);
  }

  function demandKey(target) {
    if (typeof target === "string") return `d:${target}`;
    if (target.entry) {
      if (!entryIds.has(target.entry)) entryIds.set(target.entry, ++nextEntryId);
      return `e:${entryIds.get(target.entry)}`;
    }
    if (!scopeIds.has(target.scope)) scopeIds.set(target.scope, ++nextScopeId);
    return `s:${scopeIds.get(target.scope)}:${target.name}`;
  }
  function syncDemands(targets) {
    const wanted = new Map(targets.map((target) => [demandKey(target), target]));
    for (const [key, release] of demands) if (!wanted.has(key)) { release(); demands.delete(key); }
    for (const [key, target] of wanted) if (!demands.has(key)) demands.set(key, registry.demand(target));
  }

  /** Resolve endpoints to slots and check structure. Returns PENDING or {slots, ...}. */
  function resolve(current) {
    const targets = [], resolved = [];
    const consumerFrame = frameOptions();
    current.endpoints.forEach((endpoint, i) => {
      if (endpoint.scope != null) {
        targets.push({ scope: endpoint.scope, name: endpoint.name });
        const found = registry.byName(endpoint.scope, endpoint.name, { scopeKind: endpoint.scopeKind });
        resolved.push(found?.entries?.length ? found.entries : null);
        return;
      }
      const mark = endpoint.handle?.getMark?.();
      if (!mark || mark.isDisposed) { resolved.push(null); return; }
      if (mark.renderer && renderer && mark.renderer !== renderer) throw Error(otherViewError(kind, endpointLabel(endpoint, i)));
      const entry = registry.entryOf(mark);
      if (!entry) {
        const markKind = markBinding(mark)?.kind;
        if (markKind && !isEndpointKind(markKind)) throw Error(deferredEndpointError(kind, markKind));
        resolved.push(null);
        return;
      }
      // A mount in a Facet cell or Partition group stands for its repeated definition (a
      // bind:this holds one cell's copy); any other mount is that mark alone, even when
      // unnamed marks in repeated Frames share its definition key.
      if (entry.cell != null) {
        targets.push(entry.definition);
        resolved.push(registry.byDefinition(entry.definition));
      } else {
        targets.push({ entry });
        resolved.push([entry]);
      }
    });
    syncDemands(targets);
    if (resolvedAt.length !== current.endpoints.length) resolvedAt = current.endpoints.map(() => false);
    // Not resolved yet: pending. Resolved once and gone now: a removed endpoint, whose slot
    // is missing (the path breaks there) instead of keeping a stale position. One endpoint
    // alone connects the cells of a repeated definition (connect() allows order="facet" only then).
    const slots = [], alone = current.endpoints.length === 1;
    const within = (entry) => endpointAncestor(entry.frameOptions, consumerFrame);
    for (const [i, endpoint] of current.endpoints.entries()) {
      if (!resolved[i]) {
        if (!resolvedAt[i]) return PENDING;
        if (!alone) slots.push({ endpoint, entry: null, label: endpointLabel(endpoint, i) });
        continue;
      }
      resolvedAt[i] = true;
      slots.push(...endpointSlots(endpoint, resolved[i], { alone, kind, within }));
    }
    used = new Set(slots.map((slot) => slot.entry).filter(Boolean));
    const consumerPlacement = options ? placedFrame(options) : null;
    for (const slot of slots) {
      const entry = slot.entry;
      if (!entry) continue;
      if (entry.connectionBacked) throw Error(connectionBackedError(slot.label));
      slot.placement = placementTransform(entry, consumerPlacement, kind, slot.label);
      slot.attachment = endpointAttachment(entry.compound ?? entry.kind, slot.endpoint.at, { kind });
      if (!entry.shown) return PENDING;
      // A compound attachment reads the endpoint's table rows, which a keyed lifecycle's union
      // rows do not line up with: wait for the settled frame.
      if (slot.attachment.compound && entry.shown.lifecycle) return PENDING;
    }
    return { slots };
  }

  /** Match slot rows (cached by data revisions, key and order). */
  async function match(current, slots) {
    const cacheKey = JSON.stringify([matchCacheKey(slots.map((slot) => slot.entry ?? {}), current), slots.map((slot) => !!slot.entry)]);
    if (matchCache.key === cacheKey) return matchCache.match;
    const present = slots.filter((slot) => slot.entry);
    const shown = (slot) => slot.entry.shown;
    let matched;
    if (current.key != null) {
      if (present.some((slot) => shown(slot).lifecycle)) return PENDING;
      const inputs = [];
      for (const slot of present) {
        const scope = shown(slot).scope;
        if (!scope?.has?.(current.key)) throw Error(missingKeyColumnError(slot.label, current.key, scope?.keys?.() ?? null));
        inputs.push({ label: slot.label, keys: await hostColumnValues(scope.get(current.key)) });
      }
      matched = matchEndpoints(inputs, { key: current.key, kind });
    } else {
      const inputs = present.map((slot) => {
        const s = shown(slot);
        if (!s.keyTokens && s.tokensRequested && s.owner && !s.aggregate) throw Error(noTableError(kind, slot.label));
        return { label: slot.label, tokens: s.keyTokens, owner: s.owner, aggregate: s.aggregate, kind: slot.entry.compound ?? slot.entry.kind };
      });
      matched = matchEndpoints(inputs, { kind });
    }
    if (matched.pending) return PENDING;
    counters.matches++;
    if (view) view.diagnostics.counters.connectionMatches++;
    // Expand to every slot: a removed endpoint's slot has no rows.
    const index = [];
    let p = 0;
    for (const slot of slots) index.push(slot.entry ? matched.index[p++] : new Int32Array(matched.connections).fill(-1));
    // Shared owner: one table, and each connection is one of its observations in every slot.
    let shared = false, ownerScope = null, ownerRows = null, owner = null;
    const owners = new Set(present.map((slot) => shown(slot).owner));
    if (present.length && owners.size === 1 && !owners.has(null) && present.every((slot) => !shown(slot).aggregate)) {
      owner = [...owners][0];
      if (present.some((slot) => !shown(slot).keyTokens)) {
        if (present.some((slot) => !shown(slot).tokensRequested)) return PENDING;
      } else {
        const first = present.find((slot) => shown(slot).scope);
        ownerScope = first ? ownerRootScope(shown(first).scope, owner) : null;
        const rowsOut = new Int32Array(matched.connections).fill(-1);
        shared = !!ownerScope;
        for (let c = 0; shared && c < matched.connections; c++) {
          let token = null;
          slots.forEach((slot, s) => {
            const row = index[s][c];
            if (!slot.entry || row < 0 || !shared) return;
            const t = shown(slot).keyTokens[row];
            if (token === null) token = t;
            else if (t !== token) shared = false;
          });
          rowsOut[c] = ownerRow(owner, token);
          if (rowsOut[c] < 0 && token !== null) shared = false;
        }
        ownerRows = shared ? rowsOut : null;
        if (!shared) ownerScope = null;
      }
    }
    const value = { index, keys: matched.keys, connections: matched.connections, shared, ownerScope, ownerRows, owner };
    matchCache = { key: cacheKey, match: value };
    return value;
  }

  /** Gather world positions and build the result (jax, no host transfers). A connector on a
   *  2D globe gathers its endpoints in the globe's longitude and latitude instead and draws
   *  them through its own chain: its paths route great circles and are cut at the horizon. */
  function gather(slots, matched) {
    counters.gathers++;
    const globe = onGlobe(options) ? frameOwner(options) : null;
    if (view) view.diagnostics.counters.connectionPreparations++;
    const owned = [], own = (value) => (value && owned.push(value), value);
    const layout = connectionLayout(kind, matched.index);
    const C = matched.connections, S = slots.length;
    const fractions = [];
    try {
      const world = [], offsets = [], live = [];
      let anyOffset = false;
      slots.forEach((slot, s) => {
        const entry = slot.entry, rows = matched.index[s];
        if (!entry) {
          world.push(own(np.full([C, 3], np.nan))); offsets.push(null);
          live.push({ entry: null, revision: null, rows, maxRow: -1, fields: [], fraction: null, fractionAxis: 3, offsets: false, matrix: null });
          return;
        }
        const fields = endpointFields(entry);
        try {
          const resolved = slot.attachment.compound
            ? compoundAttachment(entry, slot.attachment, kind)
            : { fields: slot.attachment.fields };
          if (resolved.fraction) fractions.push(resolved.fraction);
          const point = evaluateAttachment(resolved, fields, slot.label);
          const operations = globe ? globeOperations(entry.options, globe) : null;
          if (globe && !operations) throw Error(globeEndpointError(kind, slot.label));
          const mapped = own(globe ? globePoints(point, operations)
            : worldPoints(point, entry.options, slot.placement?.() ?? null));
          world.push(own(gatherRows(mapped, rows, 3, np.nan)));
          const count = mapped.shape[0];
          const offset = own(endpointOffsets(entry, count));
          offsets.push(offset ? own(gatherRows(offset, rows, 2, 0)) : null);
          anyOffset ||= !!offset;
          // What the live gather (connectionGather.js) needs to follow this slot on the GPU.
          live.push({
            entry, revision: entry.revision?.data, rows, maxRow: rows.reduce((max, row) => Math.max(max, row), -1),
            fields: resolved.fields.map(([name, weights]) => ({
              name, weights: [...weights], components: Math.min(3, shapeOf(entry.shown?.props?.[name] ?? [])[1] ?? 3) || 3,
            })),
            fraction: resolved.fraction ?? null, fractionAxis: resolved.fraction ? resolved.axis : 3,
            offsets: OFFSET_KINDS.includes(entry.kind), matrix: globe ? null : slot.placement, operations,
          });
        } finally { disposeAll(fields); }
      });
      const props = {}, extra = {};
      // A slot without rows of its own (no offsets: an Anchor beside a dodged point) stacks a
      // fill that np.stack consumes, so it is not owned (owning it disposed it twice).
      const stackSlots = (list, width, fill) => own(np.stack(list.map((value) => value ? value.ref : np.full([C, width], fill)), 1));
      if (layout.kind === "path") {
        const path = (list, width, fill) => {
          if (!C || !S) return own(np.zeros([0, width]));
          const stacked = stackSlots(list, width, fill);
          const withSeparators = own(np.concatenate([stacked.ref, np.full([C, 1, width], fill)], 1));
          return own(withSeparators.ref.reshape([C * (S + 1), width]).slice([0, layout.rows]));
        };
        props.position = path(world, 3, np.nan);
        if (anyOffset) extra.pathOffset = path(offsets, 2, 0);
      } else {
        const pairs = (list, width, fill) => {
          if (!C || S < 2) return [own(np.zeros([0, width])), own(np.zeros([0, width]))];
          const stacked = stackSlots(list, width, fill);
          return [
            own(stacked.ref.slice([], [0, S - 1]).reshape([C * (S - 1), width])),
            own(stacked.ref.slice([], [1, S]).reshape([C * (S - 1), width])),
          ];
        };
        [props.start, props.end] = pairs(world, 3, np.nan);
        if (anyOffset) [extra.startOffset, extra.endOffset] = pairs(offsets, 2, 0);
      }
      const scope = connectionScope({
        rows: layout.rows, rowConnection: layout.connection,
        slotScopes: slots.map((slot) => slot.entry?.shown?.scope ?? null), slotRows: matched.index,
        shared: matched.shared, ownerScope: matched.ownerScope, ownerRows: matched.ownerRows, owner: matched.owner,
      });
      const interactionIndex = matched.shared
        ? np.array(Int32Array.from(layout.connection, (c) => (c < 0 ? -1 : matched.ownerRows[c])), { dtype: np.int32 })
        : null;
      const keep = new Set([...Object.values(props), ...Object.values(extra)]);
      for (const value of owned) if (!keep.has(value)) value.dispose();
      owned.length = 0;
      const arrays = [...keep, interactionIndex, ...fractions].filter(Boolean);
      fractions.length = 0;
      return {
        props, offsets: anyOffset ? extra : null, scope, interactionIndex, layout,
        live: { layout: layout.kind, connections: C, offsets: anyOffset, slots: live },
        index: matched.index, keys: matched.keys, connections: C, shared: matched.shared,
        ownerRows: matched.ownerRows,
        slots: slots.map((slot) => ({
          label: slot.label, definition: slot.entry?.definition ?? null, cell: slot.entry?.cell?.key || null,
          kind: slot.entry ? slot.entry.compound ?? slot.entry.kind : null,
          tokens: slot.entry?.shown?.keyTokens ?? null, ownerId: slot.entry?.shown?.ownerId ?? null,
        })),
        dispose() { arrays.forEach((array) => array.dispose()); scope.dispose(); },
      };
    } catch (error) {
      // Release what this run made; a failed release must not replace the error itself.
      for (const value of [...owned, ...fractions]) try { value.dispose(); } catch { /* already released */ }
      throw error;
    }
  }

  async function run() {
    const current = descriptor;
    counters.runs++;
    let state;
    try {
      const plan = resolve(current);
      if (plan.pending) state = PENDING;
      else {
        const matched = await match(current, plan.slots);
        if (disposed || current !== descriptor) return;
        state = matched.pending ? PENDING : { result: gather(plan.slots, matched) };
      }
    } catch (error) {
      state = { error };
    }
    if (disposed || current !== descriptor) { state.result?.dispose(); return; }
    publish(state);
    await settle();
  }
  function publish(state) {
    if (state.pending) {
      // Keep the last complete result on screen; only the first (empty) state is reported.
      if (!result && lastState !== PENDING) onState((lastState = PENDING));
      return;
    }
    if (state.error) {
      // namedMark prefixes the message when it reports it; compare the original text.
      const text = state.error.message;
      if (lastState?.errorText === text) return;
      onState((lastState = { error: state.error, errorText: text, result }));
      return;
    }
    const old = result;
    result = state.result;
    onState((lastState = { result }));
    old?.dispose();
  }
  function schedule() {
    dirty = true;
    if (running || disposed) return;
    running = true;
    const work = (async () => {
      try {
        while (dirty && !disposed) {
          dirty = false;
          if (descriptor) await run();
        }
      } finally { running = false; }
    })();
    track(work);
  }
  return {
    counters,
    get result() { return result; },
    /** A new descriptor (compared structurally): re-resolve. `force` re-runs regardless. */
    update(next, { force = false } = {}) {
      if (disposed) return;
      // A re-render builds an equal descriptor: keep the one a run may be using.
      if (!force && descriptor && sameConnect(descriptor, next)) return;
      const structural = !descriptor || descriptor.endpoints.length !== next.endpoints.length;
      descriptor = next;
      if (structural) resolvedAt = [];
      matchCache = { key: null, match: null };
      lastState = null;
      schedule();
    },
    /** Re-run with the current descriptor (e.g. the consumer's own frame changed). */
    refresh() { if (descriptor && !disposed) schedule(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(restTimer);
      restDone?.();
      restDone = null;
      stop();
      for (const release of demands.values()) release();
      demands.clear();
      result?.dispose();
      result = null;
    },
  };
}
