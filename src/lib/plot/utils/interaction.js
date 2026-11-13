// @ts-check
/** Data-owned interaction resources, borrowed masks and retained column constraints. */
/** @typedef {import("./viewControllerTypes.js").InteractionPhase} InteractionPhase */
/** @typedef {import("./viewControllerTypes.js").InteractionKind} InteractionKind */
/** @typedef {import("./viewControllerTypes.js").InteractionOwner} InteractionOwner */
/** @typedef {import("./viewControllerTypes.js").SelectionState} SelectionState */
/** @typedef {import("./viewControllerTypes.js").SelectionStatus} SelectionStatus */
/** @typedef {import("./viewControllerTypes.js").ConstraintDescriptor} ConstraintDescriptor */
/** @typedef {import("./viewControllerTypes.js").ConstraintColumns} ConstraintColumns */
/** @typedef {import("./viewControllerTypes.js").DataIdentityState} DataIdentityState */
/** @typedef {import("./viewControllerTypes.js").BrushColumn} BrushColumn */
/** @typedef {import("./viewControllerTypes.js").NearbyRequest} NearbyRequest */
/** @typedef {import("./viewControllerTypes.js").MembershipResource} MembershipResource */
/** @typedef {import("./viewControllerTypes.js").MembershipStatus} MembershipStatus */
/** @typedef {import("./viewControllerTypes.js").AggregateMembership} AggregateMembership */
/** @typedef {import("./dataViewTypes.js").RowScope} RowScope */
/** @typedef {import("./viewControllerTypes.js").MembershipScope} MembershipScope */
/** @typedef {import("../publicTypes.js").SelectionConstraint} SelectionConstraint */
/** @typedef {import("../publicTypes.js").CategoryValue} CategoryValue */
/** @param {Set<number> | undefined} a @param {Set<number>} b */
const sameRows = (a, b) =>
  a?.size === b.size && [...b].every((row) => a.has(row));
// Pixel-radius nearby constraints are in one view's world coordinates: never committed or published.
/** @param {SelectionConstraint} descriptor */
const viewLocal = (descriptor) =>
  descriptor?.type === "radius" && descriptor.units === "px";
import { jaxTransformForward } from "./scaleTransforms.js";
import { numpy as np, Array as JaxArray, jit, lax } from "@hmplot/jax";
import { existingHostSource, existingHostValues } from "./hostSources.js";
import { asArray, shapeOf } from "./data.js";
import { frameTransform } from "./frameMapping.js";
import { deviceArray, deviceScalar } from "./deviceParams.js";
import { createOffsetLayer, isOffsetField } from "./offsets.js";
import { isInteractionColumn, brushExtentField } from "./names.js";
import { hostKeyValues } from "./tableJoin.js";
export { brushExtentField };

// A resource method called without the data it applies to, on a resource that has no data of its
// own (one from selection(), not a table's).
/** @param {string} what */
const noOwner = (what) =>
  `This ${what} has no data of its own: pass the data's identity first, as in ${what === "brush" ? "getConstraints(identity)" : "replace(identity, rows)"} (a table's identity, or one from identity()).`;

/** @type {Readonly<Record<string, InteractionKind>>} */
export const DEFAULT_INTERACTION_FIELDS = Object.freeze({
  "@selected": "selection",
  "@brushed": "brush",
  "@hovered": "hover",
  "@nearby": "nearby",
  // The row the tolerant pick finds (TODO 72): under the pointer, else the nearest drawn row of a
  // mark with nearest or a tooltip within its radius (a whole series for Line, Area).
  "@nearest": "nearest",
  // The rows a tooltip shows (TODO 44): the picked row, or each series' row in unified x.
  "@tooltip": "tooltip",
  // Scope-wide flags: every row is 1 when the matching @ column has any member.
  "@any_selected": "selection",
  "@any_brushed": "brush",
  "@any_hovered": "hover",
  "@any_nearby": "nearby",
  "@any_nearest": "nearest",
  "@any_tooltip": "tooltip",
});
/** Virtual columns that report whether a resource has any member, not per-row membership. */
export const ANY_INTERACTION_FIELDS = new Set([
  "@any_selected",
  "@any_brushed",
  "@any_hovered",
  "@any_nearby",
  "@any_nearest",
  "@any_tooltip",
]);
/** Default resources, including dynamic brush-bound field names. */
/** @param {string} field @returns {InteractionKind | undefined} */
export const defaultInteractionKind = (field) =>
  brushExtentField(field)
    ? "brush"
    : Object.hasOwn(DEFAULT_INTERACTION_FIELDS, field)
      ? DEFAULT_INTERACTION_FIELDS[field]
      : undefined;
/** Metadata follows the source datetime/duration representation; other bounds are numeric. */
/** @param {RowScope} scope @param {string} field @returns {import("./dataViewTypes.js").ColumnMetadata | null | undefined} */
export function brushExtentMetadata(scope, field) {
  const source = brushExtentField(field);
  const metadata = source && scope.metadata?.(source.column);
  return metadata?.type === "datetime" || metadata?.type === "duration"
    ? metadata
    : { type: "numeric" };
}
/**
 * A brush bound broadcast over a scope's rows. Descriptors carry the gesture's data bounds,
 * even for an empty selection. Read by column identity (aliases share it), never row reduction.
 * A new array: the scope that makes it keeps it for its interaction revision and lends it.
 */
/** @param {RowScope} scope @param {string} field @param {number} [length] */
export function brushExtentColumn(scope, field, length = scope.length) {
  return np.broadcastTo(deviceScalar(brushExtentValue(scope, field)), [length]);
}
/**
 * A brush bound on the host: the number every row of "@brush_min:x" holds (NaN with no brush),
 * from the brush's descriptor, with no GPU broadcast, reduction or read (TODO 143.5).
 * @param {RowScope} scope @param {string} field
 */
export function brushExtentValue(scope, field) {
  const { bound, column } =
    /** @type {NonNullable<ReturnType<typeof brushExtentField>>} */ (
      brushExtentField(field)
    );
  if (!scope.has(column)) throw Error(`Missing data column: ${column}`);
  const identity = scope.columnIdentity?.(column),
    resource = scope.identity?.brush;
  const descriptor = /** @type {SelectionConstraint | undefined} */ (
    identity &&
      resource
        ?.getConstraints(
          scope.identity,
          interactionPhase(/** @type {SelectionState} */ (resource), "brush"),
        )
        .find((item) => item.identity === identity)
  );
  let value = NaN;
  if (
    descriptor?.bounds?.length === 2 &&
    !descriptor.categories &&
    descriptor.type !== "categorical" &&
    descriptor.type !== "radius"
  ) {
    const [a, b] = descriptor.bounds;
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const metadata = scope.metadata?.(column);
      // Datetime arrays count milliseconds from their origin; preserve that precision and
      // metadata so bounds plot and compare alongside the source column.
      const origin = metadata?.type === "datetime" ? (metadata.origin ?? 0) : 0;
      value = (bound === "min" ? Math.min(a, b) : Math.max(a, b)) - origin;
    }
  }
  return value;
}
/**
 * Virtual columns a table's scopes read from its data identity: the interaction fields
 * ("@brushed"), an Interaction's columns ("@focus") and offsets ("@offset:weight",
 * utils/offsets.js). Views carry them like columns.
 */
/** @param {unknown} key */
export const isVirtualField = (key) =>
  typeof key === "string" &&
  (Boolean(defaultInteractionKind(key)) ||
    isOffsetField(key) ||
    isInteractionColumn(key) ||
    isSelectionField(key));

/*
 * A selection resource read as a column (TODO 139.2): "@@selection:<n>" is its membership at
 * the live phase (the preview while one is active, else the committed rows), and
 * "@@selection:<n>:preview" or ":committed" one phase. It is the one path every reader of a
 * resource takes, Filter(where=resource), respond, an Interaction's columns and an expression's
 * operand alike: a table's scope lends the resource's mask over its rows (categorical.js), and
 * every view carries it as it carries "@selected" (a row transform gathers it, an aggregate
 * reduces its contributors' with aggregateMembership), so nested aggregates and filtered
 * intermediate ones agree. Not a name anyone writes: "@@" is no column or Interaction name.
 */
const SELECTION_FIELD = /^@@selection:(\d+)(?::(preview|committed))?$/;
let nextSelectionField = 0;
/** @type {WeakMap<object, number>} */
const selectionFieldIds = new WeakMap();
/** @type {Map<number, WeakRef<SelectionState>>} */
const selectionFieldResources = new Map();
const selectionFieldRelease =
  typeof FinalizationRegistry === "undefined"
    ? null
    : new FinalizationRegistry((/** @type {number} */ id) =>
        selectionFieldResources.delete(id),
      );
/** @param {unknown} key */
export const isSelectionField = (key) =>
  typeof key === "string" && SELECTION_FIELD.test(key);
/** The column a selection resource is read as (see above); `phase` pins one phase. */
/** @param {SelectionState} resource @param {InteractionPhase} [phase] */
export function selectionField(resource, phase) {
  let id = selectionFieldIds.get(resource);
  if (id === undefined) {
    id = ++nextSelectionField;
    selectionFieldIds.set(resource, id);
    selectionFieldResources.set(id, new WeakRef(resource));
    selectionFieldRelease?.register(resource, id);
  }
  return phase ? `@@selection:${id}:${phase}` : `@@selection:${id}`;
}
/** The resource and pinned phase (undefined: live) of a selection field, or null. */
/** @param {string} key @returns {{resource: SelectionState, phase: InteractionPhase | undefined} | null} */
export function selectionOfField(key) {
  const match = typeof key === "string" ? SELECTION_FIELD.exec(key) : null;
  const resource = match
    ? selectionFieldResources.get(Number(match[1]))?.deref()
    : undefined;
  return resource
    ? {
        resource,
        phase: /** @type {InteractionPhase | undefined} */ (match?.[2]),
      }
    : null;
}
/** The membership a table's scope lends for a selection field: the resource's mask over the table's
 * rows (none for a table the resource holds no rows of; never another table's row positions). */
/** @param {string} key @param {InteractionOwner} owner @param {number} length */
export function selectionFieldMask(key, owner, length) {
  const found = selectionOfField(key);
  if (!found) throw Error(`Missing data column: ${key}`);
  const { resource, phase } = found;
  return resource.borrowMask(
    owner,
    length,
    phase ?? (resource.previewActive ? "preview" : "committed"),
  );
}
/**
 * A virtual field's revision, which a view's cached column of it is keyed by: a membership
 * column's own resource's (a selection field's, "@selected"'s, an Interaction's "@focus"), so a
 * hover leaves "@selected" cached (TODO 139.8); else, for offsets and brush bounds, the scope's
 * interaction revision.
 */
/** @param {{interactionRevision?: number, interactionResource?: (field: string) => unknown} | null | undefined} scope @param {string} key */
export function virtualRevision(scope, key) {
  if (isSelectionField(key)) {
    const found = selectionOfField(key);
    return found ? interactionVersion(found.resource) : 0;
  }
  if (!isOffsetField(key) && !brushExtentField(key)) {
    const resource = /** @type {SelectionState | undefined} */ (
      scope?.interactionResource?.(key.replace(/^@any_/, "@"))
    );
    if (resource?.isSelection) return interactionVersion(resource);
  }
  return scope?.interactionRevision ?? 0;
}

let nextIdentity = 0;
/** @type {WeakMap<object, DataIdentityState>} */
const dataIdentities = new WeakMap();

/** @param {unknown} value @param {{id?: string, key?: string | string[] | null, identity?: DataIdentityState}} [options] */
export function rememberDataIdentity(
  value,
  { id, key, identity: supplied } = {},
) {
  if (!value || typeof value !== "object")
    return supplied ?? createDataIdentity({ id, key });
  let owner = dataIdentities.get(value);
  if (!owner || owner.disposed)
    dataIdentities.set(
      value,
      (owner = supplied?.disposed
        ? createDataIdentity({ id, key })
        : (supplied ?? createDataIdentity({ id, key }))),
    );
  else if (key !== undefined) owner.key = key;
  owner.persistent = true;
  return owner;
}

/** @param {unknown} value @returns {DataIdentityState | undefined} */
export function identityForData(value) {
  return value && typeof value === "object"
    ? dataIdentities.get(value)
    : undefined;
}

/** @template T @param {T} value @param {{key?: string | string[]}} [options] @returns {T} */
export function table(value, { key } = {}) {
  rememberDataIdentity(value, { key });
  return value;
}

/** @param {{keys?: unknown, id?: string}} [options] */
export function identity({ keys, id } = {}) {
  if (keys === undefined) throw Error("identity requires keys.");
  const values = hostValues(keys);
  if (!values)
    throw Error("Identity keys require retained host or dictionary data.");
  const owner = createDataIdentity({ id, key: null });
  owner.length = values.length;
  owner.offsets.rows(owner.length);
  owner.tokens = values.map(token);
  if (new Set(owner.tokens).size !== owner.tokens.length)
    throw Error("Identity keys must be unique.");
  return owner;
}

/** @param {unknown} value @returns {unknown[] | undefined} */
function hostValues(value) {
  // Transport wrappers and dictionary columns lend their host data; no device readback here.
  const column =
    /** @type {{__hmplotColumn?: boolean, values?: unknown, codes?: unknown, categories?: unknown[]} | null | undefined} */ (
      value
    );
  if (column?.__hmplotColumn) return hostValues(column.values);
  if (column?.codes !== undefined) {
    const codes = /** @type {number[] | undefined} */ (
      hostValues(column.codes)
    );
    return codes?.map((code) =>
      code < 0 ? null : (column.categories?.[code] ?? null),
    );
  }
  // A Python integer column's exact values (BigInts), not its float32 copy.
  if (value instanceof JaxArray) {
    const exact = existingHostValues(value);
    return exact ? Array.from(exact) : existingHostSource(value);
  }
  if (ArrayBuffer.isView(value))
    return Array.from(
      /** @type {ArrayLike<unknown>} */ (/** @type {unknown} */ (value)),
    );
  if (Array.isArray(value)) return value;
  return undefined;
}

/** @param {unknown} value */
function token(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    throw Error("Data keys cannot be missing or nonfinite.");
  if (!["string", "boolean", "number", "bigint"].includes(typeof value))
    throw Error(
      "Data keys must be strings, booleans, finite numbers, or tuples of those values.",
    );
  // A BigInt that a number holds exactly is that number, so an int64 key 7n and 7 are one key.
  if (
    typeof value === "bigint" &&
    value >= Number.MIN_SAFE_INTEGER &&
    value <= Number.MAX_SAFE_INTEGER
  )
    return `number:${value}`;
  return `${typeof value}:${String(value)}`;
}

/** @param {Pick<RowScope, "has" | "get" | "length">} scope @param {string | string[] | null | undefined} key @returns {string[] | null} */
export function keyTokens(scope, key) {
  if (key === undefined || key === null) return null;
  const fields = Array.isArray(key) ? key : [key];
  if (
    !fields.length ||
    fields.some((field) => typeof field !== "string" || !scope.has(field))
  )
    throw Error("Data key fields must name existing columns.");
  const columns = fields.map((field) => {
    const values = hostValues(scope.get(field));
    if (!values)
      throw Error(
        `Key column ${field} must have retained host or dictionary data.`,
      );
    return values;
  });
  const result = Array.from({ length: scope.length }, (_, index) =>
    columns.map((values) => token(values[index])).join("\u001f"),
  );
  if (new Set(result).size !== result.length)
    throw Error("Data keys must be unique.");
  return result;
}

/*
 * The constraint evaluators as one jitted program each (TODO 17.8): a brush move evaluates them
 * for every brushed column, and eager mode dispatches one kernel per operation. Bounds, category
 * tables and pointer centers are arguments (arrays that are never folded into the program).
 */
/** @type {(input: JaxArray, parameters: JaxArray) => JaxArray} */
const intervalMask = jit((input, parameters) => {
  const lower = parameters.ref.slice([0, 1]),
    upper = parameters.slice([1, 2]);
  return np
    .logicalAnd(
      np.isfinite(input.ref),
      np.logicalAnd(input.ref.greaterEqual(lower), input.lessEqual(upper)),
    )
    .astype(np.int32);
});
/** @type {(codes: JaxArray, table: JaxArray) => JaxArray} */
const categoryMask = jit((codes, table) => {
  const count = table.shape[0];
  const known = np.logicalAnd(codes.ref.greaterEqual(0), codes.ref.less(count));
  return np
    .where(known, np.take(table, np.clip(codes, 0, count - 1), 0), 0)
    .astype(np.int32);
});
/** @type {Array<(...values: JaxArray[]) => JaxArray>} */
const nearbyMasks = [
  jit((x, parameters) => {
    const d = x.ref
      .sub(parameters.ref.slice([0, 1]))
      .mul(parameters.slice([1, 2]));
    return np
      .logicalAnd(np.isfinite(x), d.ref.mul(d).lessEqual(1))
      .astype(np.int32);
  }),
  jit((x, y, parameters) => {
    const dx = x.ref
        .sub(parameters.ref.slice([0, 1]))
        .mul(parameters.ref.slice([1, 2])),
      dy = y.ref
        .sub(parameters.ref.slice([2, 3]))
        .mul(parameters.slice([3, 4]));
    return np
      .logicalAnd(
        np.logicalAnd(np.isfinite(x), np.isfinite(y)),
        dx.ref.mul(dx).add(dy.ref.mul(dy)).lessEqual(1),
      )
      .astype(np.int32);
  }),
];

/** Whether two constraint descriptors select the same rows the same way (their functions aside). */
/** @param {ConstraintDescriptor | undefined} a @param {ConstraintDescriptor | undefined} b */
function sameConstraint(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  /** @param {ConstraintDescriptor} value */
  const plain = ({ evaluate, release, expand, ...descriptor }) =>
    JSON.stringify(descriptor);
  try {
    return plain(a) === plain(b);
  } catch {
    return false;
  }
}

/**
 * Interaction transactions (TODO 136.8). A pointer event's handlers change selections in steps:
 * a hover's leave clears its rows at once, and the enter that replaces them waits for a GPU
 * readback, so a frame between them drew nothing hovered (the flash). While a transaction is open
 * a selection's changes are applied but not published; when it ends each changed selection
 * publishes once per phase, and no frame sees the state in between. Writes outside a pointer
 * dispatch (code, Python) publish at once, as before.
 */
const transaction = { depth: 0, pending: new Map() };
export function beginInteraction() {
  transaction.depth++;
}
export function endInteraction() {
  if (transaction.depth === 0 || --transaction.depth > 0) return;
  const pending = [...transaction.pending.values()];
  transaction.pending.clear();
  for (const flush of pending) flush();
}
/** Whether a transaction is open (tests). */
export const interactionOpen = () => transaction.depth > 0;

/** selection({by}): one column's name, the same in every table that reads the selection. */
/** @param {unknown} value */
function selectionBy(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value || value.startsWith("@"))
    throw Error(
      `selection: by is one column's name, such as by: "gene"; received ${JSON.stringify(value)}. ` +
        "Every table that reads the selection needs that column; other names or composite keys are not supported.",
    );
  return value;
}

/**
 * Each row's typed `by` value of a table ("n:7", "s:BRCA1", "b:true", "t:<epoch ms>" for a
 * datetime, "u:<ms>" for a duration), undefined where missing: missing values match nothing, and
 * values of different types never match ("7" is not 7).
 * @param {InteractionOwner} owner @param {string} field @returns {(string | undefined)[]}
 */
function byKeys(owner, field) {
  // Kept per table update (its generation): a hover's every move reads them again.
  const cached = byKeyCache.get(owner)?.get(field);
  if (cached && cached.generation === owner.generation) return cached.keys;
  const keys = readByKeys(owner, field);
  if (!byKeyCache.has(owner)) byKeyCache.set(owner, new Map());
  byKeyCache.get(owner)?.set(field, { generation: owner.generation, keys });
  return keys;
}
/** @type {WeakMap<object, Map<string, {generation: number | undefined, keys: (string | undefined)[]}>>} */
const byKeyCache = new WeakMap();
/** byKeys' read. @param {InteractionOwner} owner @param {string} field */
function readByKeys(owner, field) {
  const read = /** @type {any} */ (owner).byValues;
  const found = read?.(field);
  if (!found)
    throw Error(
      `selection(by: ${JSON.stringify(field)}): a table that reads or writes it has no column ${JSON.stringify(field)} ` +
        "on the host. Give every table the selection connects that column (with the same values), or use a selection without by.",
    );
  const tag =
    found.type === "datetime" ? "t" : found.type === "duration" ? "u" : null;
  return found.values.map((/** @type {unknown} */ value) =>
    value === null || value === undefined
      ? undefined
      : `${tag ?? (typeof value === "number" ? "n" : typeof value === "boolean" ? "b" : "s")}:${String(value)}`,
  );
}

/**
 * A selection resource. `by` (TODO 139.6): a column's name; the rows written on a table select
 * their values of it, and every row of any table with one of those values is a member.
 * @param {{active?: boolean, by?: string}} [config] @returns {SelectionState}
 */
export function selection(config = {}) {
  const by = selectionBy(config.by);
  let active = Boolean(config.active),
    revision = 0,
    previewRevision = 0,
    // Counts changes of the rows the resource selects. Committing a preview keeps its rows (the
    // committed mask IS the preview's), so it bumps `revision` but not this (17.2d).
    membership = 0;
  /** @type {Map<string, Set<number>>} */
  const committed = new Map();
  /** @type {Map<string, Set<number>>} */
  const preview = new Map();
  /** @type {Set<string>} */
  const activePreviews = new Set();
  /** @type {Set<(status: SelectionStatus) => void>} */
  const listeners = new Set();
  /** @type {Map<string, {revision: number, length: number, array: JaxArray, generation?: string}>} */
  const masks = new Map();
  /** @type {Map<string, {token: string | JaxArray, length: number, array: JaxArray}>} */
  const anyMasks = new Map();
  // Graphical brushes retain semantic column constraints and their GPU membership.
  // Other interactions use row sets; both implement the public SelectionResource contract.
  /** @type {Map<string, Map<string, ConstraintDescriptor>>} */
  const constraints = new Map();
  /** @type {Map<string, Map<string, ConstraintDescriptor>>} */
  const previewConstraints = new Map();
  /** @type {Map<string, JaxArray>} */
  const constraintMasks = new Map();
  /** @type {Map<string, number>} */
  const constraintCounts = new Map();
  /** @type {Map<string, number>} */
  const constraintCountVersions = new Map();
  /** @type {Map<string, JaxArray>} */
  const feedback = new Map();
  /** @param {string} key @param {JaxArray} mask */
  const refreshCount = (key, mask) => {
    const countVersion = (constraintCountVersions.get(key) ?? 0) + 1;
    constraintCountVersions.set(key, countVersion);
    const total = np.sum(mask.ref.astype(np.int32));
    // data() releases `total` once it has read it; a failed read leaves it to release here.
    total
      .data()
      .then((value) => {
        if (constraintCountVersions.get(key) !== countVersion) return;
        constraintCounts.set(key, Number(value));
        listeners.forEach((listener) => listener(resource.status()));
      })
      .catch(() => {
        if (total.refCount > 0) total.dispose();
      });
  };
  // Inside a transaction a change is recorded, not published: one notification per phase when it
  // ends (sameRows holds only if every change in it kept the rows).
  /** @type {Map<InteractionPhase, boolean>} */
  const deferred = new Map();
  /** @param {InteractionPhase} [phase] @param {boolean} [sameRows] */
  const notify = (phase = "committed", sameRows = false) => {
    if (transaction.depth > 0) {
      deferred.set(phase, (deferred.get(phase) ?? true) && sameRows);
      transaction.pending.set(resource, () => {
        const phases = [...deferred];
        deferred.clear();
        for (const [deferredPhase, kept] of phases)
          publish(deferredPhase, kept);
      });
      return;
    }
    publish(phase, sameRows);
  };
  /** @param {InteractionPhase} phase @param {boolean} sameRows */
  const publish = (phase, sameRows) => {
    if (phase === "preview") previewRevision++;
    else revision++;
    if (!sameRows) membership++;
    for (const cached of masks.values()) cached.array.dispose();
    masks.clear();
    for (const cached of feedback.values()) cached.dispose();
    feedback.clear();
    listeners.forEach((listener) => listener(resource.status()));
  };
  /** @param {Map<string, Set<number>>} map @param {InteractionOwner} owner @param {boolean} [create] */
  const bucket = (map, owner, create = false) => {
    let value = map.get(owner.id);
    if (!value && create) map.set(owner.id, (value = new Set()));
    return value;
  };
  // selection({by}) (TODO 139.6): the rows written on each table select their `by` values, and
  // a table's member rows are those with one of the values. The writing tables, by id.
  /** @type {Map<string, WeakRef<InteractionOwner>>} */
  const writers = new Map();
  /** @type {Map<string, () => void>} */
  const writerStops = new Map();
  /** @param {InteractionOwner} owner */
  const wrote = (owner) => {
    if (!by) return;
    writers.set(owner.id, new WeakRef(owner));
    // New rows on a writing table may select other values: every reader's membership changes.
    if (!writerStops.has(owner.id))
      writerStops.set(
        owner.id,
        // Only an update of the by column can change what its rows select.
        /** @type {any} */ (owner).onUpdate?.(
          (/** @type {Set<string> | null} */ changed) => {
            if (!changed || changed.has(by)) notify("committed");
          },
        ) ?? (() => {}),
      );
  };
  /** @type {Map<string, {token: string, values: Set<string>}>} */
  const selectedValues = new Map();
  /** The typed `by` values of the rows held at `phase`, on every table that wrote rows: kept
   * while the resource and those tables (their generations) are unchanged. */
  /** @param {InteractionPhase} phase */
  const valuesAt = (phase) => {
    const token = [
      phase === "preview" ? previewRevision : revision,
      ...[...writers.values()].map((w) => w.deref()?.generation ?? "gone"),
    ].join(":");
    const cached = selectedValues.get(phase);
    if (cached?.token === token) return cached.values;
    const values = new Set();
    for (const [id, rows] of phase === "preview" ? preview : committed) {
      const writer = writers.get(id)?.deref();
      if (!writer || !rows.size) continue;
      const keys = byKeys(writer, /** @type {string} */ (by));
      for (const row of rows) {
        const key = keys[row];
        if (key !== undefined) values.add(key);
      }
    }
    selectedValues.set(phase, { token, values });
    return values;
  };
  // A by-selection's members change with the reading and writing tables' rows, not only with
  // its revision: every cache of a mask keys them too.
  /** @param {InteractionOwner} owner */
  const byToken = (owner) =>
    by
      ? `/${owner.generation}/${[...writers.values()].map((w) => w.deref()?.generation ?? "gone").join(":")}`
      : "";
  /** @param {InteractionOwner} owner @param {number} length @param {InteractionPhase} phase */
  const byMask = (owner, length, phase) => {
    const rev = phase === "preview" ? previewRevision : revision;
    const cacheKey = `${owner.id}:${phase}`,
      old = masks.get(cacheKey);
    // A reading or writing table's new rows change its members even when the resource did not.
    if (
      old?.revision === rev &&
      old.length === length &&
      old.generation === byToken(owner)
    )
      return old.array;
    old?.array.dispose();
    const selected = valuesAt(phase),
      out = new Int32Array(length);
    if (selected.size) {
      const keys = byKeys(owner, /** @type {string} */ (by));
      for (let row = 0; row < length; row++)
        if (keys[row] !== undefined && selected.has(keys[row])) out[row] = 1;
    }
    const array = np.array(out, { dtype: np.int32 });
    masks.set(cacheKey, {
      revision: rev,
      length,
      array,
      generation: byToken(owner),
    });
    return array;
  };
  /** @type {SelectionState} */
  const resource = {
    isSelection: true,
    /** The column a selection matches rows by (selection({by})), or null: the rows themselves. */
    by,
    get active() {
      return active;
    },
    get revision() {
      return revision;
    },
    get previewRevision() {
      return previewRevision;
    },
    get previewActive() {
      return activePreviews.size > 0;
    },
    status() {
      let committedCount = 0,
        previewCount = 0;
      for (const rows of committed.values()) committedCount += rows.size;
      for (const rows of preview.values()) previewCount += rows.size;
      for (const [key, count] of constraintCounts)
        key.endsWith(":committed")
          ? (committedCount += count)
          : (previewCount += count);
      const previewActive = this.previewActive;
      return {
        active,
        previewActive,
        count: previewActive ? previewCount : committedCount,
        committedCount,
        previewCount,
        revision,
        previewRevision,
        membership,
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(this.status());
      return () => listeners.delete(listener);
    },
    /** @this {SelectionState} */
    rows(owner, phase = "committed") {
      owner ??= this.owner;
      if (!owner) throw Error(noOwner("selection"));
      return new Set(
        bucket(phase === "preview" ? preview : committed, owner) ?? [],
      );
    },
    /** @this {SelectionState} */
    getConstraints(owner = undefined, phase = undefined) {
      if (owner === undefined) owner = this.owner;
      if (!owner) throw Error(noOwner("brush"));
      const usePreview =
        phase === "preview" ||
        (phase === undefined && activePreviews.has(owner.id));
      const current = usePreview
        ? (previewConstraints.get(owner.id) ?? constraints.get(owner.id))
        : constraints.get(owner.id);
      return [...(current?.values?.() ?? [])].map(
        ({ evaluate, release, expand, ...descriptor }) => ({
          ...descriptor,
          bounds: descriptor.bounds ? [...descriptor.bounds] : undefined,
          categories: descriptor.categories
            ? [...descriptor.categories]
            : undefined,
          ...(descriptor.center
            ? {
                center: { ...descriptor.center },
                radius: { ...descriptor.radius },
              }
            : {}),
        }),
      );
    },
    clearColumns(owner, columns) {
      if (columns === undefined) {
        columns = /** @type {ConstraintColumns} */ (owner);
        owner = this.owner;
      }
      if (!owner) throw Error(noOwner("brush"));
      const dataOwner = /** @type {InteractionOwner} */ (owner);
      const wanted = new Set(
        (Array.isArray(columns) ? columns : [columns]).map((value) =>
          typeof value === "string" ? value : value?.identity,
        ),
      );
      const current = new Map(constraints.get(dataOwner.id) ?? []);
      for (const [identity, descriptor] of current)
        if (wanted.has(identity) || wanted.has(descriptor.name)) {
          descriptor.release?.();
          current.delete(identity);
        }
      setConstraintState(dataOwner, current, "committed");
      return this;
    },
    /** @this {SelectionState} */
    refreshConstraints(owner = undefined) {
      if (owner === undefined) owner = this.owner;
      if (!owner) return this;
      if (constraints.has(owner.id))
        setConstraintState(
          owner,
          new Map(constraints.get(owner.id)),
          "committed",
        );
      if (previewConstraints.has(owner.id))
        setConstraintState(
          owner,
          new Map(previewConstraints.get(owner.id)),
          "preview",
        );
      return this;
    },
    /** @param {InteractionOwner} owner @param {ConstraintDescriptor[]} updates @param {{phase?: InteractionPhase, replace?: boolean}} [options] */
    setConstraints(
      owner,
      updates,
      { phase = "committed", replace = false } = {},
    ) {
      if (!owner) throw Error(noOwner("brush"));
      if (phase === "committed" && updates.some(viewLocal))
        throw Error(
          'A nearby constraint with units "px" belongs to one view and cannot be committed; commit units "data" instead.',
        );
      if (phase === "preview" && activePreviews.has(owner.id)) {
        // A preview that selects what the current one does (a brush's pointer-up repeats its
        // last move; a pointer resting in the plot repeats its nearby) notifies no one: every
        // Filter and mark on this resource would otherwise redo its work with the same rows.
        const current = previewConstraints.get(owner.id);
        if (
          current &&
          (!replace || current.size === updates.length) &&
          updates.every((descriptor) =>
            sameConstraint(current.get(descriptor.identity), descriptor),
          )
        ) {
          for (const descriptor of updates)
            if (current.get(descriptor.identity) !== descriptor)
              descriptor.release?.();
          return this;
        }
      }
      const source =
        phase === "preview"
          ? (previewConstraints.get(owner.id) ?? constraints.get(owner.id))
          : constraints.get(owner.id);
      const next = new Map(replace ? [] : (source ?? []));
      if (replace)
        for (const descriptor of source?.values?.() ?? [])
          descriptor.release?.();
      for (const descriptor of updates) {
        const old = next.get(descriptor.identity);
        if (old !== descriptor) old?.release?.();
        next.set(descriptor.identity, descriptor);
      }
      if (phase === "committed") {
        committed.delete(owner.id);
        preview.delete(owner.id);
      }
      setConstraintState(owner, next, phase);
      return this;
    },
    /** @this {SelectionState} */
    commitConstraintPreview(owner = undefined) {
      if (owner === undefined) owner = this.owner;
      if (!owner) throw Error(noOwner("brush"));
      const next = previewConstraints.get(owner.id);
      if (!next) return this;
      if ([...next.values()].some(viewLocal)) {
        // A resource shared by a brush and a pixel nearby: commit the rest; the radius stays behind.
        next.forEach((descriptor) => {
          if (viewLocal(descriptor)) descriptor.release?.();
        });
        const kept = [...next.values()].filter(
          (descriptor) => !viewLocal(descriptor),
        );
        previewConstraints.delete(owner.id);
        activePreviews.delete(owner.id);
        constraintMasks.get(`${owner.id}:preview`)?.dispose?.();
        constraintMasks.delete(`${owner.id}:preview`);
        return this.setConstraints(owner, kept, { replace: true });
      }
      constraints.get(owner.id)?.forEach((value) => {
        if (!next.has(value.identity)) value.release?.();
      });
      constraints.set(owner.id, next);
      committed.delete(owner.id);
      preview.delete(owner.id);
      previewConstraints.delete(owner.id);
      const mask = constraintMasks.get(`${owner.id}:preview`);
      constraintMasks.get(`${owner.id}:committed`)?.dispose?.();
      if (mask) constraintMasks.set(`${owner.id}:committed`, mask);
      const previewKey = `${owner.id}:preview`,
        committedKey = `${owner.id}:committed`;
      if (constraintCounts.has(previewKey))
        constraintCounts.set(
          committedKey,
          /** @type {number} */ (constraintCounts.get(previewKey)),
        );
      constraintCounts.delete(previewKey);
      constraintCountVersions.set(
        committedKey,
        (constraintCountVersions.get(committedKey) ?? 0) + 1,
      );
      constraintCountVersions.delete(previewKey);
      constraintMasks.delete(`${owner.id}:preview`);
      // The committed mask is the preview's own: consumers of membership need not rerun, unless
      // there was no preview mask to commit.
      activePreviews.delete(owner.id);
      active = true;
      notify("committed", Boolean(mask));
      const committedMask = constraintMasks.get(committedKey);
      if (committedMask) refreshCount(committedKey, committedMask);
      return this;
    },
    /** @this {SelectionState} */
    cancelConstraintPreview(owner = undefined) {
      if (owner === undefined) owner = this.owner;
      if (!owner) throw Error(noOwner("brush"));
      // Nearby cancels every frame while the pointer is over the axis margins: stay quiet when idle.
      if (!activePreviews.has(owner.id) && !previewConstraints.has(owner.id))
        return this;
      previewConstraints.get(owner.id)?.forEach((value) => {
        if (!constraints.get(owner.id)?.has(value.identity)) value.release?.();
      });
      previewConstraints.delete(owner.id);
      activePreviews.delete(owner.id);
      constraintMasks.get(`${owner.id}:preview`)?.dispose?.();
      constraintMasks.delete(`${owner.id}:preview`);
      notify("preview");
      return this;
    },
    replace(owner, rows, options = {}) {
      if (rows === undefined) {
        rows = /** @type {Iterable<number>} */ (owner);
        owner = this.owner;
      }
      if (!owner) throw Error(noOwner("selection"));
      const dataOwner = /** @type {InteractionOwner} */ (owner);
      wrote(dataOwner);
      const { phase = "committed", activate = true } = options;
      // Programmatic row membership and graphical constraints are distinct
      // modes. Switching to manual membership removes graphical overlays.
      clearConstraintState(dataOwner);
      const map = phase === "preview" ? preview : committed;
      const next = new Set(
        [.../** @type {Iterable<number>} */ (rows)].filter(
          (row) => Number.isInteger(row) && row >= 0 && row < dataOwner.length,
        ),
      );
      if (
        sameRows(map.get(dataOwner.id), next) &&
        (phase === "preview"
          ? activePreviews.has(dataOwner.id)
          : !activate || active)
      )
        return this;
      map.set(dataOwner.id, next);
      if (phase === "preview") activePreviews.add(dataOwner.id);
      if (activate && phase !== "preview") active = true;
      notify(phase);
      return this;
    },
    add(owner, rows) {
      if (rows === undefined) {
        rows = /** @type {Iterable<number>} */ (owner);
        owner = this.owner;
      }
      if (!owner) throw Error(noOwner("selection"));
      const dataOwner = /** @type {InteractionOwner} */ (owner);
      wrote(dataOwner);
      clearConstraintState(dataOwner);
      const values = /** @type {Set<number>} */ (
        bucket(committed, dataOwner, true)
      );
      for (const row of /** @type {Iterable<number>} */ (rows))
        if (Number.isInteger(row) && row >= 0 && row < dataOwner.length)
          values.add(row);
      active = true;
      notify();
      return this;
    },
    remove(owner, rows) {
      if (rows === undefined) {
        rows = /** @type {Iterable<number>} */ (owner);
        owner = this.owner;
      }
      if (!owner) throw Error(noOwner("selection"));
      const dataOwner = /** @type {InteractionOwner} */ (owner);
      wrote(dataOwner);
      clearConstraintState(dataOwner);
      const values = bucket(committed, dataOwner);
      for (const row of /** @type {Iterable<number>} */ (rows))
        values?.delete(row);
      active = true;
      notify();
      return this;
    },
    toggle(owner, rows) {
      if (rows === undefined) {
        rows = /** @type {Iterable<number>} */ (owner);
        owner = this.owner;
      }
      if (!owner) throw Error(noOwner("selection"));
      const dataOwner = /** @type {InteractionOwner} */ (owner);
      wrote(dataOwner);
      clearConstraintState(dataOwner);
      const values = /** @type {Set<number>} */ (
        bucket(committed, dataOwner, true)
      );
      for (const row of /** @type {Iterable<number>} */ (rows))
        values.has(row) ? values.delete(row) : values.add(row);
      active = true;
      notify();
      return this;
    },
    /** @this {SelectionState} */
    commitPreview(owner = undefined) {
      if (owner === undefined) owner = this.owner;
      if (!owner) throw Error(noOwner("selection"));
      const shown = activePreviews.has(owner.id);
      committed.set(owner.id, new Set(bucket(preview, owner) ?? []));
      // The committed rows are the previewed rows: membership only changes if nothing was previewed.
      preview.delete(owner.id);
      activePreviews.delete(owner.id);
      active = true;
      notify("committed", shown);
      return this;
    },
    /** @this {SelectionState} */
    cancelPreview(owner = undefined) {
      if (owner === undefined) owner = this.owner;
      if (!owner) throw Error(noOwner("selection"));
      const hadRows = preview.delete(owner.id),
        wasActive = activePreviews.delete(owner.id);
      if (hadRows || wasActive) notify("preview");
      return this;
    },
    clear(owner = undefined) {
      if (owner) {
        committed.delete(owner.id);
        preview.delete(owner.id);
        activePreviews.delete(owner.id);
        clearConstraintState(owner);
      } else {
        committed.clear();
        preview.clear();
        activePreviews.clear();
        for (const value of constraints.values())
          value.forEach((d) => d.release?.());
        constraints.clear();
        previewConstraints.clear();
        for (const mask of constraintMasks.values()) mask.dispose?.();
        constraintMasks.clear();
        constraintCounts.clear();
        constraintCountVersions.clear();
      }
      active = [...committed.values()].some((rows) => rows.size);
      notify();
      return this;
    },
    remap(owner, oldTokens, nextTokens) {
      const lookup = new Map(nextTokens.map((value, index) => [value, index]));
      for (const map of [committed, preview]) {
        const old = map.get(owner.id);
        if (!old) continue;
        const next = /** @type {Set<number>} */ (
          new Set(
            [...old]
              .map((row) =>
                lookup.get(/** @type {string} */ (oldTokens?.[row])),
              )
              .filter(Number.isInteger),
          )
        );
        if (!sameRows(old, next)) {
          map.set(owner.id, next);
          notify(map === preview ? "preview" : "committed");
        }
      }
    },
    hydrate(owners, isActive = false) {
      committed.clear();
      preview.clear();
      activePreviews.clear();
      for (const [owner, rows] of owners) wrote(owner);
      for (const [owner, rows] of owners)
        committed.set(
          owner.id,
          new Set(
            [...rows].filter(
              (row) => Number.isInteger(row) && row >= 0 && row < owner.length,
            ),
          ),
        );
      active = Boolean(isActive);
      notify();
      return this;
    },
    prune(owner, length) {
      for (const map of [committed, preview]) {
        const rows = map.get(owner.id);
        if (rows) {
          const next = new Set([...rows].filter((row) => row < length));
          if (!sameRows(rows, next)) {
            map.set(owner.id, next);
            notify(map === preview ? "preview" : "committed");
          }
        }
      }
    },
    /** The rows' membership (int32 0/1), a reference of the caller's own. */
    mask(owner, length, phase = "committed") {
      return this.borrowMask(owner, length, phase).ref;
    },
    /**
     * The cached mask, lent: valid until this resource's next revision or constraint change (a
     * table scope lends it as "@selected"; its readers acquire it to keep it longer).
     */
    borrowMask(owner, length, phase = "committed") {
      if (by) return byMask(owner, length, phase);
      const constrained =
        constraintMasks.get(`${owner.id}:${phase}`) ??
        (phase === "preview"
          ? constraintMasks.get(`${owner.id}:committed`)
          : undefined);
      if (constrained) return constrained;
      const rev = phase === "preview" ? previewRevision : revision;
      const cacheKey = `${owner.id}:${phase}`;
      const old = masks.get(cacheKey);
      if (old?.revision === rev && old.length === length) return old.array;
      old?.array.dispose();
      const rows =
        bucket(phase === "preview" ? preview : committed, owner) ?? new Set();
      const values = new Int32Array(length);
      for (const row of rows) if (row < length) values[row] = 1;
      const array = np.array(values, { dtype: np.int32 });
      masks.set(cacheKey, { revision: rev, length, array });
      return array;
    },
    anyMask(owner, length, phase = "committed") {
      return this.borrowAnyMask(owner, length, phase).ref;
    },
    // A length-N column that is 1 everywhere when mask() has any member, lent as borrowMask's is.
    // It is computed on the GPU from the same mask, so preview brushes need no count readback.
    borrowAnyMask(owner, length, phase = "committed") {
      const constrained =
        constraintMasks.get(`${owner.id}:${phase}`) ??
        (phase === "preview"
          ? constraintMasks.get(`${owner.id}:committed`)
          : undefined);
      // clear(owner) and hydrate() bump only the committed revision, even for preview rows.
      const token =
        constrained ?? `${revision}:${previewRevision}${byToken(owner)}`;
      const cacheKey = `${owner.id}:${phase}`,
        old = anyMasks.get(cacheKey);
      if (old?.token === token && old.length === length) return old.array;
      old?.array.dispose();
      let array;
      if (!length) array = np.zeros([0], { dtype: np.int32 });
      else {
        const any = np.max(
          this.borrowMask(owner, length, phase).ref.astype(np.int32),
        );
        array = np
          .zeros([length], { dtype: np.int32 })
          .add(any.ref)
          .astype(np.int32);
        any.dispose();
      }
      anyMasks.set(cacheKey, { token, length, array });
      return array;
    },
    /** Per-row opacity: 1 on members, `dim` elsewhere. `whileAny` (nearby) dims only while some row is a member. */
    feedbackOpacity(owner, length, phase, dim = 0.25, whileAny = false) {
      const rev = phase === "preview" ? previewRevision : revision;
      const key = `${owner.id}:${phase}:${length}:${dim}:${rev}:${whileAny}${byToken(owner)}`;
      const cached = feedback.get(key);
      if (cached) return cached.ref;
      const mask = this.mask(owner, length, phase);
      let value = np.where(mask.ref.greater(0), 1, dim);
      if (whileAny && length)
        value = np.where(np.max(mask.ref).greater(0), value, 1);
      mask.dispose();
      feedback.set(key, value);
      return value.ref;
    },
    dispose() {
      for (const stop of writerStops.values()) stop();
      writerStops.clear();
      for (const cached of masks.values()) cached.array.dispose();
      masks.clear();
      for (const cached of anyMasks.values()) cached.array.dispose();
      anyMasks.clear();
      for (const cached of feedback.values()) cached.dispose();
      feedback.clear();
      for (const value of constraints.values())
        value.forEach((d) => d.release?.());
      constraints.clear();
      previewConstraints.clear();
      for (const mask of constraintMasks.values()) mask.dispose?.();
      constraintMasks.clear();
      constraintCounts.clear();
      constraintCountVersions.clear();
      listeners.clear();
      committed.clear();
      preview.clear();
      activePreviews.clear();
    },
  };
  /** @param {InteractionOwner} owner */
  function clearConstraintState(owner) {
    for (const map of [constraints, previewConstraints]) {
      map.get(owner.id)?.forEach((d) => d.release?.());
      map.delete(owner.id);
    }
    for (const phase of ["committed", "preview"]) {
      const key = `${owner.id}:${phase}`;
      constraintMasks.get(key)?.dispose?.();
      constraintMasks.delete(key);
      constraintCounts.delete(key);
      constraintCountVersions.delete(key);
    }
  }
  /** @param {InteractionOwner} owner @param {Map<string, ConstraintDescriptor>} next @param {InteractionPhase} phase */
  function setConstraintState(owner, next, phase) {
    const target = phase === "preview" ? previewConstraints : constraints;
    target.set(owner.id, next);
    if (phase === "preview") activePreviews.add(owner.id);
    else active = next.size > 0;
    const key = `${owner.id}:${phase}`,
      old = constraintMasks.get(key);
    /** @type {JaxArray | null} */
    let combined = null;
    try {
      for (const descriptor of next.values()) {
        let part;
        try {
          part = descriptor.evaluate();
        } catch (error) {
          if (
            /** @type {{code?: string}} */ (error).code ===
            "BRUSH_COLUMN_REMOVED"
          ) {
            descriptor.release?.();
            next.delete(descriptor.identity);
            continue;
          }
          throw error;
        }
        /** @type {JaxArray} */
        // One or several constraints publish the same mask dtype, so downstream uploads
        // and reductions do not specialize again when a brush adds another axis.
        const merged = combined
          ? np.logicalAnd(combined.ref, part.ref).astype(np.int32)
          : part.ref.astype(np.int32);
        combined?.dispose?.();
        part.dispose?.();
        combined = merged;
      }
      // A series mark's brush (TODO 62.1) brushes every row of a series with a row inside:
      // expanded once the intervals combine, so a series needs one row inside all of them.
      const expand =
        combined &&
        [...next.values()].find((descriptor) => descriptor.expand)?.expand;
      if (expand) {
        const expanded = expand(/** @type {JaxArray} */ (combined));
        /** @type {JaxArray} */ (combined).dispose();
        combined = expanded;
      }
      combined ??= np.zeros([owner.length], { dtype: np.int32 });
      if (phase === "committed") active = next.size > 0;
      constraintMasks.set(key, combined);
      old?.dispose?.();
      const countVersion = (constraintCountVersions.get(key) ?? 0) + 1;
      constraintCountVersions.set(key, countVersion);
      // Counts are an inspection/notebook concern. Reading a scalar back on
      // every pointer move serializes the preview behind submitted GPU work and
      // makes an otherwise device-local brush visibly trail the pointer. Keep
      // preview membership entirely on the GPU; refresh the compact count only
      // for committed states.
      if (phase === "committed") refreshCount(key, combined);
    } catch (error) {
      combined?.dispose?.();
      throw error;
    }
    notify(phase);
  }
  return resource;
}

/** @param {{id?: string, key?: string | string[] | null}} [options] @returns {DataIdentityState} */
export function createDataIdentity({ id, key } = {}) {
  let references = 0,
    disposed = false;
  /** @type {Set<(changed: Set<string> | null) => void>} */
  const updateListeners = new Set();
  /** @type {DataIdentityState} */
  const owner = {
    id: id ?? `data-${++nextIdentity}`,
    key,
    length: 0,
    generation: 0,
    tokens: null,
    persistent: false,
    get disposed() {
      return disposed;
    },
    selection: selection(),
    brush: selection(),
    hover: selection(),
    nearby: selection(),
    nearest: selection(),
    tooltip: selection(),
    offsets: createOffsetLayer(),
    /**
     * New rows (or a new key): selections and offsets follow their rows by key. `rekeyed`: the
     * key changed, so the old tokens name rows by another column and cannot be matched; rows
     * keep their state by position (cleared when the row count changed).
     */
    /** Call `listener` after each update of the table's rows (selection({by}) writers). */
    onUpdate(/** @type {(changed: Set<string> | null) => void} */ listener) {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    update(scope, preparedTokens = undefined, rekeyed = false) {
      this.generation++;
      // selection({by}) reads this table's values of its column (TODO 139.6).
      this.byValues = (/** @type {string} */ field) =>
        hostKeyValues(scope, field);
      // The columns the update changed (null: maybe all), so a listener can skip the others.
      const changed = /** @type {any} */ (scope).lastChange?.columns ?? null;
      queueMicrotask(() =>
        updateListeners.forEach((listener) => listener(changed)),
      );
      const previousLength = this.length,
        previousTokens = rekeyed ? null : this.tokens;
      const nextTokens =
        arguments.length > 1
          ? preparedTokens
          : keyTokens(
              /** @type {Pick<RowScope, "length" | "get" | "has">} */ (scope),
              this.key,
            );
      this.length = scope.length;
      this.tokens = nextTokens;
      for (const state of [
        this.selection,
        this.brush,
        this.hover,
        this.nearby,
        this.nearest,
        this.tooltip,
      ]) {
        // Constraint-based states re-evaluate against the new rows instead of remapping.
        if (
          (state === this.brush || state === this.nearby) &&
          state.getConstraints(this).length
        )
          continue;
        if (previousTokens && nextTokens)
          state.remap(this, previousTokens, nextTokens);
        else if (previousLength && previousLength !== this.length)
          state.clear(this);
        else state.prune(this, this.length);
      }
      this.brush.refreshConstraints(this);
      this.nearby.refreshConstraints(this);
      this.offsets.rows(this.length, previousTokens, nextTokens);
    },
    resource(kind) {
      return this[kind];
    },
    retain() {
      if (disposed) throw Error("Cannot retain a disposed data identity.");
      references++;
      return () => this.release();
    },
    release() {
      if (references > 0 && --references === 0 && !this.persistent)
        this.dispose();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      this.selection.dispose();
      this.brush.dispose();
      this.hover.dispose();
      this.nearby.dispose();
      this.nearest.dispose();
      this.tooltip.dispose();
      this.offsets.dispose();
    },
  };
  owner.selection.owner = owner;
  owner.brush.owner = owner;
  owner.hover.owner = owner;
  owner.nearby.owner = owner;
  owner.nearest.owner = owner;
  owner.tooltip.owner = owner;
  return owner;
}

/** @param {Pick<RowScope, "identity"> | null | undefined} scope @param {unknown} value @param {InteractionKind} kind @returns {SelectionState | null | undefined} */
export function interactionResource(scope, value, kind) {
  if (
    /** @type {Partial<SelectionState> | null | undefined} */ (value)
      ?.isSelection
  )
    return /** @type {SelectionState} */ (value);
  if (value === true)
    return /** @type {DataIdentityState | undefined} */ (
      scope?.identity
    )?.resource(kind);
  // A configuration object ({axis}, {radius, ...}) without an explicit selection uses the data-owned resource.
  if (value && typeof value === "object")
    return interactionResource(
      scope,
      /** @type {{selection?: unknown}} */ (value).selection ?? true,
      kind,
    );
  return null;
}

/** Describe one brushable channel without exposing its array publicly. */
/** @param {RowScope | null | undefined} scope @param {unknown} value @param {string} channel @param {string} localIdentity @returns {BrushColumn | null} */
export function brushColumn(scope, value, channel, localIdentity) {
  if (!scope) return null;
  let source = scope,
    field = typeof value === "string" && scope.has?.(value) ? value : null;
  const identity = /** @type {string} */ (
    field
      ? scope.columnIdentity?.(/** @type {string} */ (field))
      : `direct:${localIdentity}:${channel}`
  );
  if (field && identity) {
    for (;;) {
      // A transform's input is a snapshot of the scope above it at one version (dataView.js
      // snapshotDataScope): brush the scope itself, whose columns are current when the owner's
      // rows change and constraints re-evaluate. A Simulate frees each state once a newer one
      // has drawn, so a snapshot's columns may be gone by then (TODO 69.16).
      if (
        source.snapshotOf?.columnIdentity?.(/** @type {string} */ (field)) ===
        identity
      ) {
        source = source.snapshotOf;
        continue;
      }
      if (!source.parent) break;
      /** @type {string | undefined} */
      const candidate = source.parent
        .keys?.()
        .find(
          (key) =>
            /** @type {RowScope} */ (source.parent).columnIdentity?.(key) ===
            identity,
        );
      if (!candidate) break;
      source = source.parent;
      field = candidate;
    }
  }
  const raw =
    /** @type {import("./dataViewTypes.js").Column | null | undefined} */ (
      field ? source.get(field) : value
    );
  // A root Data scope keeps a string column as a plain array: it brushes by category too, in the
  // column's domain order (the order its categorical axis uses).
  const plain =
    !raw?.categories &&
    Array.isArray(raw) &&
    raw.some((item) => typeof item === "string" || typeof item === "boolean");
  const categories = /** @type {CategoryValue[] | undefined} */ (
    raw?.categories
      ? [...raw.categories]
      : plain
        ? [
            ...(source.metadata?.(/** @type {string} */ (field))?.domain ??
              new Set(
                raw.filter((item) => item !== null && item !== undefined),
              )),
          ]
        : undefined
  );
  const values = raw?.codes ?? raw;
  if (
    shapeOf(values).length !== 1 ||
    shapeOf(values)[0] !== source.length ||
    source.length !== /** @type {InteractionOwner} */ (scope.identity).length
  )
    return null;
  const release = source.retain?.();
  let worldCache =
      /** @type {{key: string, column: unknown, array: JaxArray} | null} */ (
        null
      ),
    rowCache = /** @type {JaxArray | null} */ (null),
    plainCodes = /** @type {JaxArray | null} */ (null),
    released = false;
  // A datetime column's values are milliseconds from its origin (TODO 48.1); brush bounds and
  // pointer positions are epoch milliseconds, as the axis reads them.
  const metadata = field
    ? source.metadata?.(/** @type {string} */ (field))
    : undefined;
  const origin = metadata?.type === "datetime" ? (metadata.origin ?? 0) : 0;
  /** The column as a device array: raw values, or category codes. */
  /** @param {unknown} column */
  const encoded = (column) => {
    if (!plain || column !== raw)
      return asArray(
        /** @type {import("./dataViewTypes.js").Column | null | undefined} */ (
          column
        )?.codes ?? column,
      );
    if (!plainCodes) {
      const index = new Map(
        /** @type {CategoryValue[]} */ (categories).map((item, at) => [
          item,
          at,
        ]),
      );
      plainCodes = np.array(
        Int32Array.from(
          /** @type {CategoryValue[]} */ (raw),
          (item) => index.get(item) ?? -1,
        ),
        { dtype: np.int32 },
      );
    }
    return plainCodes.ref;
  };
  return {
    identity,
    name: field ?? channel,
    channel,
    type: categories
      ? "categorical"
      : /** @type {string} */ (
          source.metadata?.(/** @type {string} */ (field))?.logicalType ??
            "numeric"
        ),
    categories,
    /** Epoch milliseconds a datetime column's values count from (0 otherwise). */
    origin,
    /** A fresh GPU array of the raw column values (category codes for categories). */
    array() {
      if (field && !source.has?.(field))
        throw Object.assign(
          Error(`Brushed column ${field} is no longer available.`),
          { code: "BRUSH_COLUMN_REMOVED" },
        );
      return encoded(field ? source.get(field) : raw);
    },
    /**
     * World coordinates of the column, cached per frame topology and column data (camera moves
     * change neither). A released column still evaluates, but caches nothing it cannot free.
     */
    world(key, map) {
      if (released) return map(this.array());
      const column = field
        ? source.has?.(field)
          ? source.get(field)
          : null
        : values;
      if (worldCache?.key !== key || worldCache.column !== column) {
        const array = map(this.array());
        worldCache?.array.dispose();
        worldCache = { key, column, array };
      }
      return worldCache.array.ref;
    },
    /**
     * Owner-length int32 mask of the rows the mark's scope shows, or null when it shows every
     * row (a facet cell or a Filter shows some). Once the source data changes, the scope's rows
     * are out of date and the column counts as removed until the mark prepares again.
     */
    rows() {
      if (scope === source || scope.identityRows) return null;
      if (
        released ||
        (field ? source.has?.(field) && source.get(field) : raw) !== raw
      )
        throw Object.assign(
          Error(`The rows shown for ${field ?? channel} changed.`),
          { code: "BRUSH_COLUMN_REMOVED" },
        );
      rowCache ??= viewRows(scope, source.length);
      return rowCache.ref;
    },
    evaluateConstraint(constraint) {
      if (field && !source.has?.(field))
        throw Object.assign(
          Error(`Brushed column ${field} is no longer available.`),
          { code: "BRUSH_COLUMN_REMOVED" },
        );
      const input = encoded(field ? source.get(field) : raw);
      try {
        if (constraint.categories) {
          const count = categories?.length ?? 0;
          if (!count) return np.zeros([source.length], { dtype: np.int32 });
          // A 0/1 table over the categories, read from a buffer: every selection uses one kernel.
          const table = new Array(count).fill(0);
          for (const value of constraint.categories) {
            const at = /** @type {CategoryValue[]} */ (categories).findIndex(
              (item) => Object.is(item, value),
            );
            if (at >= 0) table[at] = 1;
          }
          return categoryMask(
            input.ref.astype(np.int32),
            deviceArray(table, { dtype: "int32" }),
          );
        }
        const [low, high] = constraint.bounds;
        // Gesture bounds are runtime data. Passing JS numbers here embeds
        // each pointer position in the JAX program and defeats kernel reuse.
        // JAX folds single-element (and constant) host arrays into literals.
        // A nonconstant parameter block keeps even equal bounds dynamic.
        return intervalMask(
          input.ref,
          np.array(new Float32Array([low - origin, high - origin, 0, 1])),
        );
      } finally {
        input.dispose();
      }
    },
    release() {
      if (released) return;
      released = true;
      worldCache?.array.dispose();
      worldCache = null;
      rowCache?.dispose();
      rowCache = null;
      plainCodes?.dispose();
      plainCodes = null;
      release?.();
    },
  };
}

/** A frame transform on the GPU (consumes `values`); NaN outside its domain, as in axisWorldArray. */
/** @param {JaxArray} values @param {import("../publicTypes.js").ScaleTransformName} kind @param {number | undefined} constant */
function transformValues(values, kind, constant) {
  const mapped = jaxTransformForward(kind, values, constant);
  values.dispose();
  return mapped;
}

/**
 * A pointer-proximity constraint over one or two brush columns.
 * units "data": distances in each axis's transformed data space, `transform[axis]` (the frame's
 * transform; `constant[axis]` its symlog constant): center is a data value and radius is in transformed
 * units, so on a log axis radius r matches values within a factor e^r of the center either way.
 * units "px": distances in world coordinates, which are linear in screen pixels, so a pixel
 * radius stays a circle under any frame chain; `world[axis](column)` supplies each column's
 * world values. World coordinates belong to one view: px constraints are never committed.
 * Membership: sum over tested axes of ((f(v) - f(center)) / radius)^2 <= 1 (|d| <= 1 for one axis).
 */
/** @param {NearbyRequest} request @returns {ConstraintDescriptor} */
export function nearbyConstraint({
  x,
  y,
  axis = "xy",
  units = "px",
  center,
  radius,
  world,
  transform = {},
  constant = {},
}) {
  const axes = [...axis].filter(
    (a) =>
      /** @type {Record<string, BrushColumn | null | undefined>} */ ({ x, y })[
        a
      ],
  );
  /** @type {Record<string, BrushColumn>} */
  const columns = /** @type {Record<string, BrushColumn>} */ ({ x, y });
  const identity = `nearby:${axes.map((a) => columns[a].identity).join("|")}`;
  const kinds = Object.fromEntries(
    axes.map((a) => [
      a,
      units === "data" ? (transform[a] ?? "linear") : "linear",
    ]),
  );
  return {
    identity,
    name: axes.map((a) => columns[a].name).join(", "),
    type: "radius",
    axis: axes.join(""),
    units,
    center: Object.fromEntries(axes.map((a) => [a, center[a]])),
    radius: Object.fromEntries(axes.map((a) => [a, radius[a]])),
    ...(units === "data" ? { transform: kinds } : {}),
    evaluate() {
      if (!axes.length) throw Error("nearby needs a named x or y column.");
      // A mark in a facet cell or behind a Filter matches only the rows it shows. Read them
      // first: a cell whose rows changed throws (BRUSH_COLUMN_REMOVED) before any mask is made.
      const shown = columns[axes[0]].rows?.();
      // Pointer positions are runtime data: pass them as an array so the GPU program is reused.
      // (A trailing 0, 1: a block whose values are all equal could be folded into the program.)
      const parameters = np.array(
        new Float32Array([
          ...axes.flatMap((a) => [
            frameTransform(kinds[a], constant[a]).forward(center[a]),
            1 / radius[a],
          ]),
          0,
          1,
        ]),
      );
      const values = axes.map((a) =>
        units === "px"
          ? world[a](columns[a])
          : transformValues(
              columns[a].array().astype(np.float32),
              kinds[a],
              constant[a] ?? 1,
            ),
      );
      const near = nearbyMasks[axes.length - 1](...values, parameters);
      return shown ? np.logicalAnd(near, shown).astype(np.int32) : near;
    },
    release() {},
  };
}

/**
 * One nearby constraint for several marks that share a resource and data owner, such as a mark
 * repeated in facet cells: a row is nearby when it is near the pointer in any mark's own frame.
 * Marks whose rows went out of date are skipped until they prepare again.
 */
/** @param {ConstraintDescriptor[]} parts @returns {ConstraintDescriptor} */
export function nearbyUnion(parts) {
  if (parts.length === 1) return parts[0];
  return {
    ...parts[0],
    evaluate() {
      /** @type {JaxArray | null} */
      let result = null;
      for (const part of parts) {
        let mask;
        try {
          mask = part.evaluate();
        } catch (error) {
          if (
            /** @type {{code?: string}} */ (error).code ===
            "BRUSH_COLUMN_REMOVED"
          )
            continue;
          result?.dispose();
          throw error;
        }
        result = result ? np.logicalOr(result, mask).astype(np.int32) : mask;
      }
      if (!result)
        throw Object.assign(Error("Every nearby mark's rows changed."), {
          code: "BRUSH_COLUMN_REMOVED",
        });
      return result;
    },
  };
}

/**
 * Owner-length int32 mask of the rows a data view shows (sourceIndices), without a scatter:
 * a stable argsort of [shown, arange(length)] puts each shown index just before the same value
 * from the arange, and a second argsort (the inverse permutation) reads that back per row.
 */
/** @param {Pick<RowScope, "sourceIndices">} scope @param {number} length */
export function viewRows(scope, length) {
  const shown = scope.sourceIndices?.();
  if (!shown) return np.ones([length], { dtype: np.int32 });
  const count = shown.shape[0],
    total = count + length;
  if (!count || !length) {
    shown.dispose();
    return np.zeros([length], { dtype: np.int32 });
  }
  const all = np.concatenate([
    shown.astype(np.int32),
    np.arange(length).astype(np.int32),
  ]);
  const order = np.argsort(all.ref),
    sorted = np.take(all, order.ref, 0);
  const repeated = np.concatenate([
    np.zeros([1], { dtype: np.int32 }),
    sorted.ref
      .slice([1, total])
      .equal(sorted.slice([0, total - 1]))
      .astype(np.int32),
  ]);
  return np.take(repeated, np.argsort(order).slice([count, total]), 0);
}

/**
 * The role a feedback resource plays for one mark: the prop it was passed to (an explicit
 * resource given to nearby, nearest, hover, or brush), else its data owner's role, else a selection.
 */
/** @param {import("./viewControllerTypes.js").ResponseBinding | null | undefined} binding @param {SelectionState | null | undefined} resource @returns {InteractionKind} */
export function interactionRole(binding, resource) {
  if (resource === binding?.selection) return "selection";
  for (const role of /** @type {InteractionKind[]} */ ([
    "nearby",
    "nearest",
    "hover",
    "brush",
  ]))
    if (resource === binding?.[role]) return role;
  for (const role of /** @type {InteractionKind[]} */ ([
    "nearby",
    "nearest",
    "hover",
    "brush",
  ]))
    if (resource === binding?.owner?.[role]) return role;
  return "selection";
}

/**
 * The phase of `resource`'s rows a mark shows: its preview while one shows, for the transient
 * roles; else its committed rows.
 * @param {string} [kind] The role `resource` plays (interactionRole).
 * @returns {"preview" | "committed"}
 */
/** @param {SelectionState | null | undefined} resource @param {string | undefined} [kind] */
export function interactionPhase(resource, kind = undefined) {
  // Hover, nearby and nearest are transient by definition. Brush previews replace the committed
  // mask only while a gesture is active; selections never read a preview.
  if (
    kind === "hover" ||
    resource?.owner?.hover === resource ||
    kind === "nearby" ||
    resource?.owner?.nearby === resource ||
    kind === "nearest" ||
    resource?.owner?.nearest === resource ||
    kind === "tooltip" ||
    resource?.owner?.tooltip === resource
  )
    return resource?.previewActive ? "preview" : "committed";
  if (kind === "brush" || resource?.owner?.brush === resource)
    return resource?.previewActive ? "preview" : "committed";
  return "committed";
}

/** @type {Readonly<Record<string, InteractionKind>>} */
const RESPONSE_NAMES = Object.freeze({
  selected: "selection",
  selection: "selection",
  brushed: "brush",
  brush: "brush",
  hovered: "hover",
  hover: "hover",
  nearby: "nearby",
  nearest: "nearest",
});

/**
 * Resolve one mark's feedback resources without changing capture behavior. Omitted, a mark
 * responds to the states it produces except the pointer's (TODO 62.2, 72): hovering marks
 * @hovered, and nearest @nearest, without fading the other rows; respond="hovered" or
 * "nearest" (or true) asks for the fade.
 */
/** @param {import("./viewControllerTypes.js").ResponseBinding | null | undefined} binding @returns {SelectionState[]} */
export function responseResources(binding) {
  if (!binding?.owner || binding.respond === false) return [];
  /** @type {SelectionState[]} */
  const result = [];
  /** @param {unknown} resource */
  const add = (resource) => {
    if (
      /** @type {Partial<SelectionState> | null | undefined} */ (resource)
        ?.isSelection &&
      !result.includes(/** @type {SelectionState} */ (resource))
    )
      result.push(/** @type {SelectionState} */ (resource));
  };
  const producers = [
    binding.selection,
    binding.brush,
    binding.hover,
    binding.nearby,
    binding.nearest,
  ];
  if (binding.respond === undefined || binding.respond === null) {
    [binding.selection, binding.brush, binding.nearby].forEach(add);
    return result;
  }
  if (binding.respond === true) {
    producers.forEach(add);
    add(binding.owner.selection);
    add(binding.owner.brush);
    add(binding.owner.hover);
    add(binding.owner.nearby);
    add(binding.owner.nearest);
    return result;
  }
  const requested = Array.isArray(binding.respond)
    ? binding.respond
    : [binding.respond];
  for (const item of requested) {
    if (
      /** @type {Partial<SelectionState> | null | undefined} */ (item)
        ?.isSelection
    )
      add(item);
    else if (typeof item === "string") {
      const kind = RESPONSE_NAMES[item.replace(/^@/, "")];
      if (kind) add(binding.owner[kind]);
    }
  }
  return result;
}

/**
 * Subscribe to a resource's membership, not to its status: a committed brush reads its row
 * count back and re-notifies with the same revisions, which must not rerun transforms or
 * re-prepare marks (17.2d). The callback is not called for the initial status.
 */
/** @param {MembershipResource} resource @param {(status: MembershipStatus) => void} callback */
export function onMembershipChange(resource, callback) {
  /** @type {string | undefined} */
  let last;
  return resource.subscribe((status) => {
    // Whether anything is active matters too: an inactive Filter keeps every row or none.
    const key = `${status.membership ?? `${status.revision}:${status.previewRevision}`}:${status.active || status.previewActive}`;
    if (last !== undefined && key !== last) {
      last = key;
      callback(status);
    } else last = key;
  });
}

/** @param {{revision?: number, previewRevision?: number} | null | undefined} resource */
export function interactionVersion(resource) {
  return (resource?.revision ?? 0) + (resource?.previewRevision ?? 0);
}

/**
 * `scope` with an Interaction's columns: each "@" name (columns={{"@focus": selection}}) reads
 * as 1 on the selection's member rows, like "@selected", in expressions, Filter and channels.
 */
/** @template {RowScope & {interactionColumns?(): string[]}} T @param {T} scope @param {Record<string, SelectionState>} [columns] @returns {T} */
export function interactionScope(scope, columns = {}) {
  const aliases = new Map(Object.entries(columns));
  for (const key of aliases.keys())
    if (!isInteractionColumn(key))
      throw Error(
        `Interaction: a column's name is "@" and a name that is not a state name, such as "@focus"; received ${JSON.stringify(key)}.`,
      );
  // Over the scope, not a copy of its own properties: a wrapper (another Interaction's, a
  // Simulate step's) carries the table (its length, metadata and columns) on its prototype, and
  // Dodge's layout knows the rows it handed on by that chain (utils/dodgeLayout.js).
  return Object.defineProperties(
    Object.create(scope),
    Object.getOwnPropertyDescriptors({
      get interactionRevision() {
        return (
          (scope.interactionRevision ?? 0) +
          [...aliases.values()].reduce(
            (sum, resource) => sum + interactionVersion(resource),
            0,
          )
        );
      },
      keys: () => scope.keys(),
      /** The Interaction columns this scope reads ("@focus"), its own and those around it. */
      interactionColumns: () => [
        ...aliases.keys(),
        ...(scope.interactionColumns?.() ?? []),
      ],
      /** @param {string} key */
      interactionResource(key) {
        return aliases.get(key) ?? scope.interactionResource?.(key);
      },
      /** @param {string} key */
      has: (key) => aliases.has(key) || scope.has(key),
      /** @param {string} key */
      get(key) {
        if (!aliases.has(key)) return scope.get(key);
        const resource = aliases.get(key);
        if (!resource?.isSelection)
          throw Error(
            `Interaction column ${key} requires a selection resource.`,
          );
        // An explicitly aliased resource has no data-owned role (a named brush's owner is
        // null). Like Filter(where=resource), its live membership, over this scope's rows: the
        // Interaction may be below a Filter or an aggregate (TODO 139.2).
        return scope.get(selectionField(resource));
      },
      /** @param {unknown} value */
      resolve(value) {
        return typeof value === "string" && this.has(value)
          ? this.get(value)
          : /** @type {NonNullable<RowScope["resolve"]>} */ (scope.resolve)(
              value,
            );
      },
    }),
  );
}

/** @param {MembershipScope | null | undefined} scope @param {number[]} indices @returns {Promise<number[]>} */
export async function interactionRows(scope, indices) {
  if (!scope || !indices?.length) return [];
  // Row-preserving transforms (BarGeometry, Calculate) retain an aggregate's
  // contributors even though they do not create a new aggregate themselves.
  if (scope.aggregate || scope.provenance) {
    const arrays = await Promise.all(
      indices.map((index) =>
        /** @type {NonNullable<MembershipScope["contributors"]>} */ (
          scope.contributors
        )(index),
      ),
    );
    try {
      const values = await Promise.all(
        arrays.map((array) => array?.ref?.data?.() ?? []),
      );
      return [...new Set(values.flatMap((value) => Array.from(value, Number)))];
    } finally {
      arrays.forEach((array) => array?.dispose?.());
    }
  }
  if (scope.identityRows) return indices;
  const source = scope.sourceIndices?.();
  if (!source) return indices;
  const requested = np.array(indices, { dtype: np.int32 });
  const selected = np.take(source.ref, requested.ref, 0);
  source.dispose();
  requested.dispose();
  try {
    return Array.from(await selected.ref.data(), Number);
  } finally {
    selected.dispose();
  }
}

/**
 * Per output row of an aggregate, 1 when any of its source rows is set in `mask`. `info.codes`
 * gives each source row's output id (-1 for none) and `info.ids` the id of each output row
 * (output row i otherwise). Up to SCATTER_CELLS rows x outputs, one one-hot product for all
 * rows: an index per output row would be a literal, one kernel per row (TODO 17.1), and chunks
 * bound the [rows x outputs] matrix. Past it, for output rows that are their groups (no ids;
 * TODO 139.4: 100,000 rows in 1,000 groups took about a second on the CPU), a scatter-add of
 * the mask by code, linear in both; jax-js's scatter writes its size into its shader, so it is
 * padded to a power of two, which bounds its compiles as a Filter's row count moves.
 */
/** @param {AggregateMembership} info @param {JaxArray} mask @param {number} length */
export function aggregateMembership(info, mask, length) {
  const rows = /** @type {JaxArray} */ (info.codes).shape[0];
  if (!length || !rows) return np.zeros([length], { dtype: np.int32 });
  // Output rows named by ids (a compacted aggregate's) may name groups past both counts: the
  // one-hot product, which compares ids, handles them. Without ids, output i is group i.
  if (rows * length <= SCATTER_CELLS || info.ids)
    return oneHotMembership(info, mask, length);
  const bucket = 2 ** Math.ceil(Math.log2(Math.max(rows, length))),
    padding = bucket - rows;
  const pad = (/** @type {JaxArray} */ array, /** @type {number} */ value) =>
    padding
      ? np.concatenate([array, np.full([padding], value, { dtype: np.int32 })])
      : array;
  // Padded rows have code -1, which the scatter skips; every code is below `length`.
  const hits = lax.scatter(
    pad(mask.ref.greater(0).astype(np.int32), 0),
    pad(/** @type {JaxArray} */ (info.codes).ref.astype(np.int32), -1),
    [bucket],
    { mode: "add" },
  );
  return hits.slice([0, length]).greater(0).astype(np.int32);
}
/** Rows x outputs above which aggregateMembership scatters instead of a one-hot product. */
const SCATTER_CELLS = 4_000_000;
/** The one-hot product (aggregateMembership's below SCATTER_CELLS). */
/** @param {AggregateMembership} info @param {JaxArray} mask @param {number} length */
function oneHotMembership(info, mask, length) {
  const rows = /** @type {JaxArray} */ (info.codes).shape[0];
  if (!length || !rows) return np.zeros([length], { dtype: np.int32 });
  const ids = (info.ids ? info.ids.ref : np.arange(length))
    .astype(np.int32)
    .reshape([1, length]);
  const chunk = Math.max(1, Math.floor(8_000_000 / length));
  /** @type {JaxArray | null} */
  let total = null;
  for (let start = 0; start < rows; start += chunk) {
    const end = Math.min(rows, start + chunk),
      whole = start === 0 && end === rows;
    const codes = whole
        ? /** @type {JaxArray} */ (info.codes).ref
        : /** @type {JaxArray} */ (info.codes).ref.slice([start, end]),
      set = whole ? mask.ref : mask.ref.slice([start, end]);
    const hot = codes
      .reshape([end - start, 1])
      .equal(ids.ref)
      .astype(np.float32);
    const counts = np
      .matmul(set.astype(np.float32).reshape([1, end - start]), hot)
      .reshape([length]);
    total = total ? total.add(counts) : counts;
  }
  ids.dispose();
  return /** @type {JaxArray} */ (total).greater(0).astype(np.int32);
}

/**
 * Per row of `scope`, 1 where `resource` holds the row: a row transform's rows by their source
 * rows, an aggregate's while any contributor is held (nested aggregates included). The scope's
 * own virtual columns compute it (selectionField), so it is the membership "@selected" and an
 * Interaction's columns read. The caller owns the result.
 */
/** @param {MembershipScope | null | undefined} scope @param {SelectionState | null | undefined} resource @param {InteractionPhase} [phase] */
export function selectionMask(
  scope,
  resource,
  phase = resource?.previewActive ? "preview" : "committed",
) {
  if (!scope?.identity || !resource?.isSelection)
    return np.zeros([scope?.length ?? 0], { dtype: np.int32 });
  const value = /** @type {JaxArray} */ (
    scope.get(selectionField(resource, phase))
  );
  return value.ref;
}
