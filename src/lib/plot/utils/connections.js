/**
 * Connections (Stage 15), the pure half: connect() and endpoint descriptors, the attachment
 * table, key matching, slot sequencing, the structural ancestor check, and the row layout of
 * a connector. No GPU work and no Svelte, so all of it is unit-testable; every user-facing
 * error text lives here, so the renderer, the browser specs and the Python mirror share one
 * source.
 *
 * Vocabulary: an *endpoint* is one argument of connect() (a mark, `mark.endpoint({at})`, or a
 * Facet/Partition `endpoint(name)` selection). It resolves to one or more registry *entries*
 * (endpointRegistry.js), one per mount: a mark in embedded Facet cells or Partition groups is
 * one repeated definition with one entry per cell, any other mark is its own mount alone. A
 * *slot* is one position along a connection: explicit arguments give one slot each, and a
 * repeated definition passed alone expands into one slot per cell, in facet order (the
 * default; `order: "facet"` says so explicitly). A *connection* joins one row per slot,
 * matched by key; a Line draws it as one path, Segments/Arrows3D/Arrows as one row
 * per adjacent slot pair.
 */
import { kindsWith } from "./markKinds.js";
import { TEMPLATES } from "../../templates/builtins.js";
import { mainKind } from "../../templates/instantiate.js";

/** The descriptor format version; decoders reject newer versions. */
export const CONNECT_VERSION = 1;
/** Accepted `order` values. */
export const ORDERS = Object.freeze(["facet"]);
/** Marks that accept a `connections` prop. */
const connectionMarks = kindsWith("connections");
export const CONNECTION_KINDS = Object.freeze([...connectionMarks,
  ...TEMPLATES.filter((definition) => definition.signature?.options.connections && connectionMarks.includes(mainKind(definition)))
    .map((definition) => definition.kind),
]);
/** Mark kinds (namedMark `kind`) that register endpoint entries. */
export const ENDPOINT_KINDS = Object.freeze(kindsWith("endpoint"));
/** Templates whose main part registers as their endpoint (TODO 130.2). */
const ENDPOINT_TEMPLATES = TEMPLATES.filter((definition) => definition.endpoint);
/**
 * Compound marks whose endpoint entries come from the primitive they mount (entry.compound): the
 * built-in templates that declare an endpoint.
 */
export const COMPOUND_ENDPOINT_KINDS = Object.freeze(ENDPOINT_TEMPLATES.map((definition) => definition.kind).sort());
/** Channels a connection-backed mark takes from its endpoints instead. */
export const CONNECTION_CHANNELS = Object.freeze(["x", "y", "z", "position", "start", "end"]);
/** Props that make a mark pickable; an Anchor has nothing to pick. */
export const ANCHOR_PICKING_PROPS = Object.freeze(["select", "hover", "brush", "nearby", "respond"]);

export const isConnectionKind = (kind) => CONNECTION_KINDS.includes(kind);
/**
 * Svelte context a compound mark (Bar, Histogram, BoxPlot, Pie) sets so the primitive it mounts
 * registers as the compound's endpoint: `{kind, markKind, name(), valueAxis()}`; its attachments
 * beyond the primitive's are ATTACHMENTS[kind]'s, each by form (a template's host sets it).
 * Only the mounted mark of kind `markKind` takes it (a BoxPlot's whiskers and outliers do not).
 */
export const ENDPOINT_COMPOUND_CONTEXT = Symbol("endpoint compound");
export const isEndpointKind = (kind) => ENDPOINT_KINDS.includes(kind);

// ---------------------------------------------------------------------------------------
// Error texts. Constants for fixed messages, functions for parameterized ones. `kind` is the
// consumer (the mark with `connections`); `label` names an endpoint (its `name`, else its
// settings-tree label).
// ---------------------------------------------------------------------------------------
const quote = (value) => JSON.stringify(value);
const list = (names) => names.join(", ");

export const ANCHOR_PICKING_ERROR =
  "Anchor has no geometry to pick; put select, hover, or brush on a visible mark and connect to it.";
export const CONNECT_EMPTY_ERROR =
  'connect: pass the endpoints to connect: marks, mark.endpoint({at}), or facet.endpoint("name").';
export const CONNECT_ORDER_ARITY_ERROR = 'connect: order="facet" takes one repeated endpoint definition.';
export const ENDPOINT_BOTH_ERROR = "endpoint: pass a mark or a Facet/Partition selection with a name, not both.";
export const EXTERNAL_FACET_ENDPOINT_ERROR =
  "Facet.endpoint: connections need an embedded Facet (inside a Plot); cells of an external Facet are separate views.";

export const connectOptionError = (name) => `connect: unknown option ${quote(name)}; the options are key and order.`;
export const connectKeyError = (key) =>
  `connect: key must name one column (a non-empty string), not ${quote(key) ?? String(key)}.`;
export const connectOrderError = (order) =>
  `connect: order must be "facet" or omitted, not ${quote(order) ?? String(order)}.`;
export const connectVersionError = (version) =>
  `connect descriptor version ${version} is newer than this library supports (${CONNECT_VERSION}).`;
export const connectArgumentError = (index) =>
  `connect: argument ${index + 1} is not an endpoint; pass a mark, mark.endpoint({at}), or facet.endpoint("name").`;
export const connectScopeArgumentError = (index) =>
  `connect: argument ${index + 1} is a Facet or Partition; select the repeated mark with .endpoint("name").`;
export const endpointAtTypeError = (at) =>
  `endpoint: at must name an attachment such as "center", "left", or "start", not ${quote(at) ?? String(at)}.`;
export const endpointAtError = (kind, at, available) =>
  `${kind}.endpoint: ${kind} does not offer at=${quote(at)}; available: ${list(available)}.`;
export const scopeEndpointNameError = (scopeKind = "Facet") =>
  `${scopeKind}.endpoint: pass the name of the repeated endpoint mark, e.g. ${scopeKind.toLowerCase()}.endpoint("values").`;
export const connectKeyValueError = (value) =>
  `connect: key values must be strings, numbers, or booleans; got ${value === null ? "null" : typeof value}.`;
export const duplicateKeyError = (value, label) =>
  `connect: duplicate key ${quote(value) ?? String(value)} in endpoint "${label}"; one endpoint per key per slot.`;
export const duplicateObservationError = (label) =>
  `connect: endpoint "${label}" shows one observation more than once; pass key= naming a column that is unique in each endpoint.`;
export const missingKeyColumnError = (label, key, available = null) =>
  `connect: endpoint "${label}" has no column ${quote(key)}` +
  (available ? `; available: ${list(available) || "none"}.` : ".");
export const differentTablesError = (kind, a, b) =>
  `${kind}.connections: endpoints "${a}" and "${b}" come from different tables; pass key= to match them.`;
export const noTableError = (kind, label) =>
  `${kind}.connections: endpoint "${label}" has no data table to match observations by; pass key= naming a column.`;
export const aggregateEndpointError = (kind, label, entryKind) =>
  `${kind}.connections: "${label}" is an aggregate (${entryKind}) whose rows have no single source observation; pass key= naming a group column. To draw a line or arc per row between two places (flight routes), Segments(start=[x0, y0], end=[x1, y1]) draws each row's own ends with no connection (curve= bends them; interpolation="great-circle" on a map).`;
/** Where a repeated definition's mounts live, for messages: [plural, one, what facet order joins]. */
const REPEATS = {
  facet: ["facet cells", "facet cell", "the cells in facet order"],
  partition: ["Partition groups", "Partition group", "the groups in group order"],
  both: ["facet cells and Partition groups", "Partition group of a facet cell", "them in facet order"],
};
/** How entries repeat ("facet", "partition", or "both"), from their cells. */
export function repetition(entries) {
  const facet = entries.some((entry) => entry.cell?.facet), partition = entries.some((entry) => entry.cell?.partition);
  return facet && partition ? "both" : partition ? "partition" : "facet";
}
export const singleEndpointError = (label) =>
  `connect: "${label}" is a single mark, so it has nothing to connect to; pass two or more endpoints, or one mark repeated by a Facet or Partition.`;
export const repeatedEndpointError = (label, count, repeat = "facet") =>
  `connect: "${label}" is repeated in ${count} ${REPEATS[repeat][0]}; pass it alone (the only endpoint) to connect ${REPEATS[repeat][2]}.`;
export const repeatedMountError = (label, repeat = "facet") =>
  `connect: "${label}" is mounted more than once in one ${REPEATS[repeat][1]}; give each mount its own name.`;
export const notInFrameError = (kind, label) =>
  `${kind}.connections: endpoint "${label}" is not inside this ${kind}'s frame; mount the ${kind} in a frame that contains every endpoint.`;
export const otherViewError = (kind, label) =>
  `${kind}.connections: endpoint "${label}" belongs to another Plot; connections stay within one Plot.`;
export const connectionBackedError = (label) =>
  `connect: "${label}" is drawn from connections and cannot be an endpoint yet.`;
export const attachmentError = (kind, entryKind, at, available) =>
  `${kind}.connections: ${entryKind} does not offer endpoint at=${quote(at)}; available: ${list(available)}.`;
export const missingAttachmentError = (kind, entryKind, available) =>
  `${kind}.connections: ${entryKind} has no default endpoint; choose one with endpoint({at}) from: ${list(available)}.`;
export const deferredEndpointError = (kind, entryKind, reason = DEFERRED_ENDPOINTS[entryKind] ?? "no attachment table") =>
  `${kind}.connections: ${entryKind} endpoints are not supported yet (${reason}); use Anchor at the position you need.`;
export const connectionsKindError = (kind) =>
  `${kind}.connections: only Line, Segments, Arrows3D, and Arrows accept connections.`;
export const connectionsChannelError = (kind) =>
  `${kind}: connections cannot be combined with x, y, z, position, start, or end.`;
export const sphericalConnectionsError = (kind) =>
  `${kind}: connections are not available in 3D spherical views yet.`;
export const globeEndpointError = (kind, label) =>
  `${kind}.connections: endpoint "${label}" is not on this globe or in a frame ranged on it; ` +
  "a connector on a globe routes great circles in the globe's longitude and latitude.";
export const anchoredFrameError = (kind, label) =>
  `${kind}.connections: endpoint "${label}" is inside a pixel-anchored Frame, which connections do not follow yet; place the endpoint in a range Frame instead.`;
export const billboardFrameError = (kind, label) =>
  `${kind}.connections: endpoint "${label}" is inside a billboard Frame, which turns with the camera; connections do not follow it yet, so use orientation "parent" or a range Frame.`;
export const duplicateEndpointNameError = (scopeKind, name, count) =>
  `${scopeKind}.endpoint(${quote(name)}): ${count} endpoint definitions are named ${quote(name)}; give each a unique name.`;
export const connectionsValueError = (kind) =>
  `${kind}.connections: pass a connect() descriptor, e.g. connections={connect(before, after, {key: "id"})}.`;
export const connectionsSeriesError = (kind) =>
  `${kind}: connections cannot be combined with series; each connection is already its own path.`;
export const ambiguousFieldError = (kind, channel, field) =>
  `${kind}.${channel}: ${quote(field)} is ambiguous across the endpoints' tables; use "source.${field}" or "target.${field}".`;

// ---------------------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------------------
/**
 * Where on an endpoint mark a connection attaches. Each kind has a `default` attachment
 * (null: `at` is required) and named attachments. A linear attachment is
 * `{ fields: [[fieldName, [wx, wy, wz]], ...] }`, evaluated per row as
 * `sum(weight * field[row])` over the endpoint mark's live fields (per component), so the jax
 * gather and a WGSL gather share one formula. A compound attachment is
 * `{ compound: name }`: it needs the compound mark's own data (which side of a bar is its
 * baseline, a box plot's quartiles) and is resolved by the consumer preparation.
 *
 * Positions are data coordinates of the endpoint's own frame; `left/right/bottom/top` are the
 * x0/x1/y0/y1 edges in data order (an inverted axis draws "top" lower on screen), and a
 * rotated Prism footprint is attached as its unrotated box.
 */
const ONE = [1, 1, 1], HALF = [0.5, 0.5, 0.5];
const attachment = (fields) => Object.freeze({ fields: Object.freeze(fields.map((f) => Object.freeze(f))) });
/**
 * A compound attachment `name` by form (define.js AttachmentForm): `{edge}` a box edge on the
 * value axis, `{end, from}` the edge at a column, `{fraction}` a point between two columns.
 */
const compound = (name, form) => Object.freeze({ compound: name, form: Object.freeze(form) });
const table = (defaultName, at) => Object.freeze({ default: defaultName, at: Object.freeze(at) });
const point = table("center", { center: attachment([["position", ONE]]) });
const box = {
  center: attachment([["position", HALF], ["extent", HALF]]),
  left: attachment([["position", [1, 0.5, 0.5]], ["extent", [0, 0.5, 0.5]]]),
  right: attachment([["position", [0, 0.5, 0.5]], ["extent", [1, 0.5, 0.5]]]),
  bottom: attachment([["position", [0.5, 1, 0.5]], ["extent", [0.5, 0, 0.5]]]),
  top: attachment([["position", [0.5, 0, 0.5]], ["extent", [0.5, 1, 0.5]]]),
};
const ends = table(null, { start: attachment([["start", ONE]]), end: attachment([["end", ONE]]) });
export const ATTACHMENTS = Object.freeze({
  Anchor: point,
  Points: point,
  Points3D: point,
  // The data anchor, before dx/dy move the text on screen.
  Text: table("anchor", { anchor: attachment([["position", ONE]]) }),
  Rect: table("center", box),
  Prism: table("center", box),
  // A template's: its main part's own, and those it declares (Bar's value and baseline ends), an
  // alias naming one of its own (a Pie's outer arc is its polar box's top).
  ...Object.fromEntries(ENDPOINT_TEMPLATES.map((definition) => {
    const segment = mainKind(definition) === "Segments";
    const own = { Rect: box, Prism: box, Segments: ends.at }[mainKind(definition)] ?? {};
    return [definition.kind, table(segment ? null : "center", {
      ...own,
      ...Object.fromEntries(Object.entries(definition.endpoint.attachments)
        .map(([name, form]) => {
          if (form.alias && !own[form.alias])
            throw Error(`${definition.kind}.endpoint: attachment "${name}" aliases "${form.alias}", which its main part does not have; choose one of: ${Object.keys(own).join(", ") || "none"}.`);
          return [name, form.alias ? own[form.alias] : compound(name, form)];
        })),
    })];
  })),
  Segments: ends,
  Arrows3D: ends,
});
/** Mark kinds that cannot be endpoints yet, with the reason the error names. */
export const DEFERRED_ENDPOINTS = Object.freeze({
  Line: "general line vertices",
  Area: "boundary intersections",
  ErrorBars: "boundary intersections",
  Violin: "boundary intersections",
  GeoJSON: "GeoJSON representatives",
  Surface: "surface samples",
  Heatmap: "solid-surface attachments",
  Image: "raster cells",
  Text3D: "a single label with no data rows; use Text",
});
/** The attachment names a kind offers, default first. */
export function attachmentNames(kind) {
  const entry = ATTACHMENTS[kind];
  if (!entry) return [];
  const names = Object.keys(entry.at);
  return entry.default ? [entry.default, ...names.filter((name) => name !== entry.default)] : names;
}
/**
 * The attachment `at` (or the default) of an endpoint of `entryKind`, as `{name, ...}`; throws
 * the consumer-facing error when the kind cannot be an endpoint or does not offer `at`.
 */
export function endpointAttachment(entryKind, at, { kind = "connect" } = {}) {
  const entry = ATTACHMENTS[entryKind];
  if (!entry) throw Error(deferredEndpointError(kind, entryKind));
  const name = at ?? entry.default;
  if (name == null) throw Error(missingAttachmentError(kind, entryKind, attachmentNames(entryKind)));
  if (!Object.hasOwn(entry.at, name)) throw Error(attachmentError(kind, entryKind, name, attachmentNames(entryKind)));
  return { name, ...entry.at[name] };
}

// ---------------------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------------------
const ENDPOINT = "__hmplotEndpoint", CONNECT = "__hmplotConnect";
export const isEndpoint = (value) => !!value && typeof value === "object" && value[ENDPOINT] === true;
export const isConnect = (value) => !!value && typeof value === "object" && value[CONNECT] === true;

/**
 * An immutable endpoint selection: `{handle, at}` for a mark (a bound mark handle, anything
 * with getMark()), or `{scope, name, at}` for the uniquely named repeated definition inside a
 * Facet or Partition (`scope` is that component's options node; `scopeKind` names it in
 * messages). `ref` keeps a Python `$ref` id for messages while its handle is still pending. A
 * selection with neither handle nor scope is pending (an unbound `bind:this`, a forward
 * reference). `kind`, when known, validates `at` against the attachment table at once.
 */
export function endpointDescriptor({ handle = undefined, scope = undefined, name = undefined, at = undefined,
  ref = undefined, kind = undefined, scopeKind = undefined } = {}) {
  if (at !== undefined && (typeof at !== "string" || !at)) throw Error(endpointAtTypeError(at));
  if (handle != null && scope != null) throw Error(ENDPOINT_BOTH_ERROR);
  if (scope != null && (typeof name !== "string" || !name)) throw Error(scopeEndpointNameError(scopeKind));
  if (kind !== undefined && at !== undefined && ATTACHMENTS[kind] && !Object.hasOwn(ATTACHMENTS[kind].at, at))
    throw Error(endpointAtError(kind, at, attachmentNames(kind)));
  return Object.freeze({
    [ENDPOINT]: true,
    handle: handle ?? undefined,
    scope: scope ?? undefined,
    name: scope != null ? name : undefined,
    at,
    ref,
    kind,
    scopeKind: scope != null ? scopeKind ?? "Facet" : undefined,
  });
}
/** An endpoint whose mark or scope is not known yet (resolves on a later render). */
export const endpointPending = (endpoint) => endpoint.handle === undefined && endpoint.scope === undefined;

const plainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
/** The trailing options object of connect(): plain data, never a handle or a descriptor. */
function connectOptions(value) {
  return plainObject(value) && !isEndpoint(value) && !isConnect(value) &&
    !Object.values(value).some((item) => typeof item === "function");
}
function normalizeEndpoint(value, index) {
  if (value == null) return endpointDescriptor();
  if (isEndpoint(value)) return value;
  if (typeof value?.getMark === "function") return endpointDescriptor({ handle: value });
  if (typeof value?.endpoint === "function") throw Error(connectScopeArgumentError(index));
  throw Error(connectArgumentError(index));
}

/**
 * Describe connections between endpoints. `connect(before, after, {key: "id"})`,
 * `connect(a, b, c, {key})`, `connect(facet.endpoint("values"), {key})`. Every argument but an
 * optional trailing options object is an endpoint: a mark handle, `mark.endpoint({at})`, or
 * `facet.endpoint(name, {at})`. An undefined argument (a `bind:this` not set yet) is a pending
 * endpoint. One endpoint alone must be a mark repeated in Facet cells or Partition groups: it
 * connects its cells in facet order (checked when it resolves; a single mark is an error then).
 * Options: `key` (a column matched by exact value in every endpoint; without it, endpoints
 * must show observations of one table and match by identity) and `order` ("facet", the
 * default and only order, for one repeated endpoint). The result is frozen, versioned, and
 * carries no data: the consumer resolves it against the View's endpoint registry.
 * @param {...any} args endpoints, then optionally `{key, order}`
 * @returns {import("../publicTypes.js").ConnectDescriptor}
 */
export function connect(...args) {
  let options = {};
  if (args.length && connectOptions(args.at(-1))) options = args.pop();
  for (const name of Object.keys(options))
    if (!["key", "order", "version"].includes(name)) throw Error(connectOptionError(name));
  const { key = undefined, order = undefined, version = CONNECT_VERSION } = options;
  if (!Number.isInteger(version) || version < 1) throw Error(`connect: version must be a positive integer, not ${quote(version) ?? String(version)}.`);
  if (version > CONNECT_VERSION) throw Error(connectVersionError(version));
  if (key !== undefined && key !== null && (typeof key !== "string" || !key)) throw Error(connectKeyError(key));
  if (order !== undefined && order !== null && !ORDERS.includes(order)) throw Error(connectOrderError(order));
  if (!args.length) throw Error(CONNECT_EMPTY_ERROR);
  const endpoints = args.map(normalizeEndpoint);
  if (order === "facet" && endpoints.length !== 1) throw Error(CONNECT_ORDER_ARITY_ERROR);
  return Object.freeze({
    [CONNECT]: true,
    version: CONNECT_VERSION,
    endpoints: Object.freeze(endpoints),
    key: key ?? undefined,
    order: order ?? undefined,
  });
}
/** Whether two connect() descriptors select the same endpoints the same way (re-renders
 * build a new descriptor each time; consumers compare with this instead of identity). */
export function sameConnect(a, b) {
  if (a === b) return true;
  if (!isConnect(a) || !isConnect(b)) return false;
  if (a.version !== b.version || a.key !== b.key || a.order !== b.order || a.endpoints.length !== b.endpoints.length) return false;
  return a.endpoints.every((e, i) => {
    const f = b.endpoints[i];
    return e.handle === f.handle && e.scope === f.scope && e.name === f.name && e.at === f.at && e.ref === f.ref;
  });
}
/** The label an endpoint goes by in messages before it resolves to a registry entry. */
export function endpointLabel(endpoint, index = 0) {
  return endpoint?.name ?? endpoint?.handle?.getMark?.()?.options?.presentation?.label ??
    (endpoint?.ref !== undefined ? String(endpoint.ref) : `endpoint ${index + 1}`);
}
/** The label a registry entry goes by in messages: its authored name, else its settings label. */
export const entryLabel = (entry) => entry?.name ?? entry?.label ?? entry?.definition ?? "endpoint";

// ---------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------
/**
 * The token an explicit key value matches by: its type and value, so "1" never matches 1.
 * Missing values (null, undefined, NaN, infinities) have no token and match nothing.
 */
export function connectionKeyToken(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? `number:${value}` : null;
  if (["string", "boolean", "bigint"].includes(typeof value)) return `${typeof value}:${String(value)}`;
  throw Error(connectKeyValueError(value));
}

/**
 * Match rows across slots. Each slot is `{label, keys?, tokens?, owner?, aggregate?, kind?}`:
 * with `key`, `keys` holds the slot's host key values per row (matched by
 * connectionKeyToken); without it, `tokens` holds its owner key tokens per row (the shown
 * frame's keyTokens: source observations through provenance) and every slot must show the
 * same `owner` and no aggregate. Duplicates within a slot are errors, never joins; missing
 * values match nothing.
 *
 * Returns `{index, keys, connections, missing}`: `index[slot]` is an Int32Array with the row
 * of each connection in that slot, -1 when the slot has no row for it (the path breaks there;
 * nothing is compacted). Connections are the ordered union of keys over the slots, by first
 * appearance. Returns `{pending: true}` when an implicit slot has not published its tokens.
 */
export function matchEndpoints(slots, { key = undefined, kind = "connect" } = {}) {
  const rows = [], order = new Map();
  if (key != null) {
    for (const slot of slots) {
      if (!slot.keys) throw Error(missingKeyColumnError(slot.label, key, slot.available ?? null));
      const map = new Map();
      for (let row = 0; row < slot.keys.length; row++) {
        const value = slot.keys[row], token = connectionKeyToken(value);
        if (token === null) continue;
        if (map.has(token)) throw Error(duplicateKeyError(value, slot.label));
        map.set(token, row);
        if (!order.has(token)) order.set(token, order.size);
      }
      rows.push(map);
    }
  } else {
    const first = slots[0];
    for (const slot of slots) {
      if (slot.aggregate) throw Error(aggregateEndpointError(kind, slot.label, slot.kind ?? "mark"));
      if (!slot.owner) throw Error(noTableError(kind, slot.label));
      if (slot.owner !== first.owner) throw Error(differentTablesError(kind, first.label, slot.label));
    }
    if (slots.some((slot) => !slot.tokens)) return { pending: true };
    for (const slot of slots) {
      const map = new Map();
      slot.tokens.forEach((token, row) => {
        if (token == null) return;
        if (map.has(token)) throw Error(duplicateObservationError(slot.label));
        map.set(token, row);
        if (!order.has(token)) order.set(token, order.size);
      });
      rows.push(map);
    }
  }
  const connections = order.size;
  const index = rows.map((map) => {
    const out = new Int32Array(connections).fill(-1);
    for (const [token, row] of map) out[order.get(token)] = row;
    return out;
  });
  let missing = 0;
  for (let c = 0; c < connections; c++) if (index.some((slot) => slot[c] < 0)) missing++;
  return { index, keys: [...order.keys()], connections, missing };
}

/**
 * The cache key of a match: which entries (definition, cell, registration sequence, published
 * data revision, owner), the key and the order. The sequence tells apart mounts that share a
 * definition outside any cell (unnamed marks in repeated Frames). Frame revisions, camera and
 * placement are deliberately absent, so a frame slider re-gathers positions without re-matching.
 */
export function matchCacheKey(entries, { key = undefined, order = undefined } = {}) {
  return JSON.stringify([
    entries.map((e) => [e.definition, e.cell?.key ?? null, e.sequence ?? null, e.revision?.data ?? 0, e.shown?.ownerId ?? null]),
    key ?? null, order ?? null,
  ]);
}

// ---------------------------------------------------------------------------------------
// Slots and structure
// ---------------------------------------------------------------------------------------
/** Order two cell ordinals (arrays, outermost first: facet cell, then Partition groups). */
export function compareOrdinals(a = [], b = []) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** Whether resolved entries are mounts of a repeated definition (Facet cells, Partition groups). */
export const isRepeated = (entries) => entries.some((entry) => entry.cell != null);

/**
 * The slots of one endpoint. `entries` are its registry entries: every mount of a repeated
 * definition (a mark in Facet cells or Partition groups), or the one mount of any other mark.
 * `within(entry)` says whether an entry is inside the consumer's frame (endpointAncestor); a
 * consumer inside a Facet cell sees only its own cell's mounts. `alone` (the only endpoint of
 * its connect()) expands a repeated definition into one slot per cell in cell order and
 * rejects a single mark, which has nothing to connect to; otherwise the endpoint must resolve
 * to one entry. Returns `[{endpoint, entry, label}]`.
 */
export function endpointSlots(endpoint, entries, { alone = false, kind = "connect", within = () => true } = {}) {
  const inside = entries.filter(within);
  if (!inside.length) throw Error(notInFrameError(kind, entryLabel(entries[0])));
  const sorted = [...inside].sort((a, b) => compareOrdinals(a.cell?.ordinal, b.cell?.ordinal));
  const label = entryLabel(sorted[0]), repeat = repetition(sorted);
  // Two mounts of one definition in one cell: unnamed marks in repeated Frames (an {#each}, a
  // loop) share a definition key, and nothing says which mount of the cell is meant.
  const cells = new Set();
  for (const entry of sorted) {
    if (entry.cell == null) continue;
    if (cells.has(entry.cell.key)) throw Error(repeatedMountError(label, repeat));
    cells.add(entry.cell.key);
  }
  if (alone) {
    if (!isRepeated(sorted)) throw Error(singleEndpointError(label));
    return sorted.map((entry) => ({ endpoint, entry, label: entryLabel(entry) }));
  }
  if (sorted.length > 1) throw Error(repeatedEndpointError(label, sorted.length, repeat));
  return [{ endpoint, entry: sorted[0], label }];
}

/**
 * Expand endpoints into slots. `resolved[i]` lists the registry entries of endpoint i, or
 * null/empty while it is pending. Explicit arguments give one slot each and must resolve to
 * one entry; one repeated endpoint alone gives one slot per entry in cell order (see
 * endpointSlots). Returns `{pending: true}` or `{slots: [{endpoint, entry, label}]}`.
 */
export function slotSequence(endpoints, resolved, { order = undefined, kind = "connect", within = () => true } = {}) {
  if (endpoints.some((_, i) => !resolved[i]?.length)) return { pending: true };
  if (order === "facet" && endpoints.length !== 1) throw Error(CONNECT_ORDER_ARITY_ERROR);
  const alone = endpoints.length === 1;
  return { slots: endpoints.flatMap((endpoint, i) => endpointSlots(endpoint, resolved[i], { alone, kind, within })) };
}

/**
 * Whether an endpoint in the frame `entryFrame` (a frame options node, which carries
 * `frameDefinition.parent`) is inside the consumer's frame `consumerFrame`: the same frame or
 * a descendant. A consumer at the root of its View (no frame) contains everything in it.
 */
export function endpointAncestor(entryFrame, consumerFrame) {
  if (consumerFrame == null) return true;
  for (let node = entryFrame; node; node = node.frameDefinition?.parent)
    if (node === consumerFrame) return true;
  return false;
}

/**
 * The consumer's rows for matched `index` (from matchEndpoints). A Line draws one path per
 * connection, its slots in order, with a separator row between connections (gathered as
 * NaN, so no segment joins two connections): `{kind: "path", rows, slot, row, connection}`
 * per row, slot and row -1 on separators and row -1 where a slot is missing. Segments,
 * Arrows and Arrows draw one row per adjacent slot pair, so three slots give two
 * arrows per connection: `{kind: "pairs", rows, startSlot, startRow, endSlot, endRow,
 * connection}`.
 */
export function connectionLayout(kind, index) {
  const slots = index.length, connections = slots ? index[0].length : 0;
  if (kind === "Line") {
    const rows = connections ? connections * (slots + 1) - 1 : 0;
    const slot = new Int32Array(rows).fill(-1), row = new Int32Array(rows).fill(-1), connection = new Int32Array(rows).fill(-1);
    for (let c = 0; c < connections; c++)
      for (let s = 0; s < slots; s++) {
        const r = c * (slots + 1) + s;
        slot[r] = s; row[r] = index[s][c]; connection[r] = c;
      }
    return { kind: "path", rows, slots, connections, slot, row, connection };
  }
  if (!isConnectionKind(kind)) throw Error(connectionsKindError(kind));
  const pairs = Math.max(0, slots - 1), rows = connections * pairs;
  const startSlot = new Int32Array(rows), startRow = new Int32Array(rows), endSlot = new Int32Array(rows),
    endRow = new Int32Array(rows), connection = new Int32Array(rows);
  for (let c = 0; c < connections; c++)
    for (let p = 0; p < pairs; p++) {
      const r = c * pairs + p;
      startSlot[r] = p; endSlot[r] = p + 1;
      startRow[r] = index[p][c]; endRow[r] = index[p + 1][c];
      connection[r] = c;
    }
  return { kind: "pairs", rows, slots, connections, startSlot, startRow, endSlot, endRow, connection };
}

/** The props that would make an Anchor pickable (select/hover/brush/nearby/respond, pointer handlers). */
export function anchorPickingProps(props) {
  return Object.keys(props ?? {}).filter((key) => ANCHOR_PICKING_PROPS.includes(key)
    ? props[key] !== undefined && props[key] !== null && props[key] !== false
    : /^on(pointer|click|dblclick|contextmenu|wheel)/.test(key) && typeof props[key] === "function");
}
