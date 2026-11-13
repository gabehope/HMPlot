import { evaluateTransientExpression } from "./expressionPlans.js";
import { numpy as np } from "@hmplot/jax";
import { isExpression } from "./expressions.js";
import { invertPath, resolveChannel } from "../interaction/channelWriteback.js";
import { deviceScalar } from "./deviceParams.js";

/**
 * A DRAG SESSION (TODO 38.3): what a drag holds from pointerdown to pointerup.
 *
 * At the start it reads, once, everything the write direction needs for the grabbed row: the
 * row's table row, each dragged channel's current value, the current value of every operator
 * and operand on the channel's lineage (interaction/channelWriteback.js), the table column's value and the
 * row's offset. After that it holds table rows and numbers, not the mark's views, so it
 * outlives them: a Filter that reads the offsets reruns under the drag (decision 5) without
 * disturbing it.
 *
 * Each move gives the pointer's position in the mark's data (at). A channel's target is its
 * value at the start plus the pointer's movement since the start (start + delta, as Force's
 * drag: a bar grabbed by its middle does not jump), inverted down its lineage into the table
 * column; the row's new offset is its starting offset plus the change that makes. It is
 * computed from the start every time, so it never drifts. A selected row drags the whole
 * selection by the same change in each column (decision 2). Where a frame or an operator has
 * no inverse (off a globe's disk; the log of a negative target), a channel keeps its last
 * valid offset.
 */

/** Row `row` of a column (a host or device array, or a dictionary column's codes). */
async function readRow(column, row) {
  const values = column?.codes ?? column;
  if (typeof values === "number" || typeof values === "boolean") return Number(values);
  if (Array.isArray(values) || ArrayBuffer.isView(values)) return Number(values[row]);
  const picked = np.take(values.ref, deviceScalar(row, { dtype: "int32" }), 0);
  try { return Number((await picked.ref.data())[0]); }
  finally { picked.dispose(); }
}

/** The value of `value` (an expression or a column name) at `row` of `scope`. */
export async function valueAt(scope, value, row, time = 0) {
  // A column name reads the column itself (a dictionary column is its code).
  if (typeof value === "string" && !value.startsWith("@")) return readRow(scope.get(value), row);
  const result = evaluateTransientExpression(value, scope, { time });
  try { return await readRow(result.value, row); }
  finally { result.dispose(); }
}

/** The table row of row `row` of `scope` (null for a row the scope does not map). */
export async function tableRow(scope, row) {
  if (scope.identityRows) return row;
  const source = scope.sourceIndices?.();
  if (!source) return null;
  const picked = np.take(source, deviceScalar(row, { dtype: "int32" }), 0);
  try {
    const value = Number((await picked.ref.data())[0]);
    return value >= 0 ? value : null;
  } finally { picked.dispose(); }
}

/**
 * The row of `scope` that is table row `row` (null when it has none). Above a Fold a table row
 * is one row per field: `match` ({ column, code }, the Fold's key and the row's code in it)
 * says which.
 */
export async function rowOf(scope, row, match = null) {
  if (scope.identityRows) return row;
  const source = scope.sourceIndices?.();
  if (!source) return null;
  let rows = source.equal(deviceScalar(row, { dtype: "int32" }));
  if (match) {
    const column = scope.has(match.column) ? scope.get(match.column) : null, codes = column?.codes ?? column;
    if (!codes) { rows.dispose(); return null; }
    const device = Array.isArray(codes) || ArrayBuffer.isView(codes) ? np.array(Array.from(codes, Number), { dtype: np.int32 }) : codes.ref;
    rows = np.logicalAnd(rows, device.equal(deviceScalar(match.code, { dtype: "int32" })));
  }
  const hits = rows.astype(np.int32);
  const found = np.stack([np.argmax(hits.ref), np.max(hits)]);
  try {
    const [index, any] = Array.from(await found.ref.data(), Number);
    return any ? index : null;
  } finally { found.dispose(); }
}

/** The operators and operands of a path whose current values its inverse reads. */
function pathNodes(path) {
  const nodes = new Set();
  for (const { node } of path) {
    nodes.add(node);
    for (const item of node.args) if (typeof item === "string" || isExpression(item)) nodes.add(item);
  }
  return nodes;
}

/** The table rows of an aggregate row's members (contributors: an async readback). */
async function members(scope, row) {
  const rows = await scope.contributors(row);
  try { return Array.from(await rows.ref.data(), Number).filter((value) => value >= 0); }
  finally { rows.dispose(); }
}

/** `field`'s values in `scope` for table rows `rows` (one read of the column and its rows). */
async function valuesOf(scope, field, rows) {
  const column = scope.get(field), values = column?.codes ?? column;
  const host = Array.isArray(values) || ArrayBuffer.isView(values) ? values : await values.ref.data();
  let at = null;
  if (!scope.identityRows) {
    const source = scope.sourceIndices?.();
    if (!source) return null;
    try { at = new Map(Array.from(await source.ref.data(), (row, index) => [Number(row), index])); }
    finally { source.dispose(); }
  }
  return rows.map((row) => Number(host[at ? at.get(row) : row]));
}

/**
 * How a sum splits a change among its members (decision 1): in proportion to each member's
 * value, so no member goes past zero (the change stops where the total does); in equal shares
 * when the total is 0 or the values' signs are mixed. The sum skips values that are not finite,
 * so those members take no share.
 */
export function sumShares(values) {
  const counted = values.filter(Number.isFinite), share = (value, part) => (Number.isFinite(value) ? part : 0);
  const total = counted.reduce((sum, value) => sum + value, 0);
  const sameSign = counted.every((value) => value >= 0) || counted.every((value) => value <= 0);
  if (!counted.length || total === 0 || !sameSign)
    return { shares: values.map((value) => share(value, 1 / Math.max(1, counted.length))) };
  return { shares: values.map((value) => share(value, value / total)), limit: -total };
}

/**
 * Start a drag of row `row` (a row of `scope`, as a pick names it). `channels` maps each
 * dragged axis to its channel value and its lineage ({ root, column, steps, leaf } from
 * resolveChannel, or { fold } to choose by the row's key). `origin` is the pointer's position
 * in the mark's data at the start; `selection` a selection resource whose rows drag together
 * when the grabbed row is one of them. A row of an aggregate (38.4) drags its group's members:
 * each by the change (a mean, median or bin), or by its share of it (a sum). Resolves to a
 * session, or { reason }.
 */
export async function startDrag({ scope, row, channels, origin, selection = null, time = 0 }) {
  const grabbed = scope.aggregate ? null : await tableRow(scope, row);
  if (grabbed === null && !scope.aggregate) return { reason: "the row is not one of the table's rows" };
  const axes = [];
  let root = null;
  for (const [axis, { value, lineage }] of Object.entries(channels)) {
    let resolved = lineage, folded = null;
    if (resolved.fold) {
      // A Fold's value: the row's key says which field it is, and which of the table row's
      // copies the steps above the Fold read.
      const code = await valueAt(scope, resolved.fold.key, row, time);
      const branch = resolved.fold.branches[resolved.fold.fields[code]];
      if (!branch || branch.reason) return { reason: `${axis}: ${branch?.reason ?? "the row has no field"}` };
      folded = { above: resolved.steps.length, match: { column: resolved.fold.key, code } };
      resolved = { ...branch, steps: [...resolved.steps, ...branch.steps] };
    }
    if (root && resolved.root.identity !== root.identity) return { reason: "its channels read different tables" };
    root = resolved.root;
    // Two channels on one column (a scatterplot matrix's diagonal cell): the first drags it,
    // and the row moves along both.
    if (axes.some((entry) => entry.column === resolved.column)) continue;
    const reduceAt = resolved.steps.findIndex((step) => step.kind === "reduce"), reduce = resolved.steps[reduceAt];
    if (reduce && reduce.view !== (scope.physical ? scope.view : scope))
      return { reason: `${axis}: rows between the mark and ${reduce.view?.step?.kind ?? "its aggregate"} change which group a row is` };
    if (!reduce && scope.aggregate) return { reason: `${axis}: the mark's rows are an aggregate's` };
    // Only the steps above an aggregate are inverted; below it the members' columns pass through.
    const chain = [];
    for (const [index, step] of (reduce ? resolved.steps.slice(0, reduceAt) : resolved.steps).entries()) {
      const match = folded && index < folded.above ? folded.match : null;
      const at = step.scope === scope ? row : await rowOf(step.scope, grabbed, match);
      if (at === null) return { reason: `${axis}: the row is hidden above the mark` };
      if (step.kind === "expr") {
        const values = new Map();
        for (const node of pathNodes(step.path)) values.set(node, await valueAt(step.scope, node, at, time));
        chain.push({ kind: "expr", path: step.path, values });
      } else {
        const out = await valueAt(step.view, step.column, await rowOf(step.view, grabbed, match), time);
        chain.push({ kind: "snap", out, from: await valueAt(step.scope, step.from, at, time) });
      }
    }
    const offsets = root.identity.offsets, start = await valueAt(scope, value, row, time);
    let rows, shares, base, limit;
    if (reduce) {
      rows = await members(scope, row);
      base = await valueAt(scope, reduce.column, row, time);
      if (reduce.policy === "sum") {
        const current = await valuesOf(reduce.scope, reduce.field, rows);
        if (!current) return { reason: `${axis}: the members of ${reduce.view?.step?.kind ?? "the aggregate"} are not table rows` };
        ({ shares, limit } = sumShares(current));
      } else shares = rows.map(() => 1);
    } else {
      const last = resolved.steps.at(-1);
      const leaf = last ? (last.kind === "expr" ? last.leaf : "column") : resolved.leaf;
      const original = await valueAt(root, resolved.column, grabbed, time), offset = offsets.value(resolved.column, grabbed);
      // The leaf's current value: what the lineage's end reads now.
      base = leaf === "moved" ? original + offset : leaf === "offset" ? offset : original;
      const selected = selection?.rows?.(root.identity);
      rows = selected?.has(grabbed) ? [...selected].sort((a, b) => a - b) : [grabbed];
      shares = rows.map(() => 1);
    }
    axes.push({
      axis, column: resolved.column, start, origin: origin?.[axis], chain, base, limit,
      rows, shares, starts: rows.map((r) => offsets.value(resolved.column, r)), change: 0,
    });
  }
  if (!axes.length) return { reason: "no channel can be dragged" };
  const layer = root.identity.offsets;
  return createSession({ identity: root.identity, layer, grabbed, axes, snapshot: layer.snapshot() });
}

/** The change in the lineage's end (the table column, or an aggregate's value) for `target`. */
function changeFor(axis, target) {
  let t = target;
  for (const step of axis.chain) {
    t = step.kind === "expr" ? invertPath(step.path, t, (node) => step.values.get(node)) : step.from + (t - step.out);
    if (t === null || !Number.isFinite(t)) return null;
  }
  return axis.limit === undefined ? t - axis.base : axis.limit < 0 ? Math.max(t - axis.base, axis.limit) : Math.min(t - axis.base, axis.limit);
}

function createSession({ identity, layer, grabbed, axes, snapshot }) {
  let ended = false;
  const rows = [...new Set(axes.flatMap((axis) => axis.rows))].sort((a, b) => a - b);
  return {
    identity,
    layer,
    /** Every table row the drag moves, and the grabbed one (null for an aggregate's row). */
    rows,
    grabbed,
    axes,
    /**
     * The offsets for the pointer at `at` (the mark's data: { x, y, z }): { column: deltas }
     * over that column's rows, or null when nothing changed. Offsets are not written here.
     */
    move(at) {
      if (ended) return null;
      const writes = {};
      for (const axis of axes) {
        const value = at?.[axis.axis];
        if (value === undefined || value === null || !Number.isFinite(value) || !Number.isFinite(axis.origin)) continue;
        const change = changeFor(axis, axis.start + (value - axis.origin));
        if (change === null || change === axis.change) continue;
        axis.change = change;
        writes[axis.column] = axis.starts.map((start, index) => start + change * axis.shares[index]);
      }
      return Object.keys(writes).length ? writes : null;
    },
    /** Write `writes` (from move) to the table's offsets. */
    write(writes) {
      if (ended || !writes) return;
      for (const axis of axes) if (writes[axis.column]) layer.set(axis.column, axis.rows, writes[axis.column]);
    },
    /** Each dragged column's change since the start: the grabbed row's, or its aggregate's. */
    changes() {
      return Object.fromEntries(axes.map((axis) => [axis.column, axis.change]));
    },
    /** End the drag; a cancelled one (Escape) restores the offsets from its start. */
    end(cancelled = false) {
      if (ended) return;
      ended = true;
      if (cancelled) layer.restore(snapshot);
    },
    get ended() { return ended; },
  };
}

const CATEGORICAL = new Set(["categorical", "ordinal", "boolean"]);

/**
 * The channels `drag` moves on a mark: { x: { value, lineage }, ... }. `drag` is true (every
 * dimension of the view that can be dragged; a categorical axis is skipped: a strip plot drags
 * along its numeric axis) or the axes to drag ("x", "y", "xy", "xyz"; each must be draggable).
 * `categorical(axis)` says whether an axis is categorical. Throws with the reason a named axis,
 * or every axis, cannot be dragged.
 */
/** @param {{kind: string, drag: unknown, props: Record<string, unknown>, scope?: import("./dataViewTypes.js").RowScope, dimensions: string[], categorical?: (axis: string) => boolean}} inputs */
export function dragChannels({ kind, drag, props, scope, dimensions, categorical = () => false }) {
  const named = drag === true ? null : typeof drag === "string" && /^(?!.*(.).*\1)[xyz]+$/.test(drag) ? [...drag] : undefined;
  if (named === undefined)
    throw Error(`${kind} drag must be true or the axes to drag, such as "x", "y", "xy" or "xyz"; received ${JSON.stringify(drag)}.`);
  const outside = named?.find((axis) => !dimensions.includes(axis));
  if (outside) throw Error(`${kind} drag="${drag}": this view has no ${outside} axis.`);
  const channels = {}, reasons = [];
  for (const axis of named ?? dimensions) {
    const value = props[axis];
    const isCategorical = categorical(axis) || (typeof value === "string" && CATEGORICAL.has(scope?.metadata?.(value)?.type));
    if (isCategorical) {
      if (named) throw Error(`${kind} drag="${drag}": ${axis} is categorical; a drag moves numeric columns by offsets, so it cannot move a row to another category.`);
      continue;
    }
    const lineage = scope ? resolveChannel(scope, value) : { reason: "the mark has no Data" };
    if (lineage.reason) {
      if (named) throw Error(`${kind} drag: ${axis} cannot be dragged: ${lineage.reason}.`);
      reasons.push(`${axis}: ${lineage.reason}`);
      continue;
    }
    channels[axis] = { value, lineage };
  }
  if (!Object.keys(channels).length)
    throw Error(`${kind} drag: no channel can be dragged${reasons.length ? ` (${reasons.join("; ")})` : ""}.`);
  return channels;
}

/** A data identity's key for a token (interaction.js keyTokens): the value, or a tuple. */
function tokenValue(token) {
  const parts = token.split("\u001f").map((part) => {
    const at = part.indexOf(":"), type = part.slice(0, at), text = part.slice(at + 1);
    return type === "number" ? Number(text) : type === "boolean" ? text === "true" : type === "bigint" ? BigInt(text) : text;
  });
  return parts.length === 1 ? parts[0] : parts;
}

/** What drag events report: the dragged rows, their keys (the row index without a key), each column's change. */
export function dragEvent(session) {
  const tokens = session.identity?.tokens, key = (row) => (row === null ? null : tokens ? tokenValue(tokens[row]) : row);
  const event = {
    row: session.grabbed,
    key: key(session.grabbed),
    rows: [...session.rows],
    keys: session.rows.map(key),
    changes: session.changes(),
  };
  // The table's identity, for a Python scene to name the table (not a field of the event).
  Object.defineProperty(event, "identity", { value: session.identity });
  return event;
}
