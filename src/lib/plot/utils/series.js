import { Array as JaxArray, numpy as np, lax } from "@hmplot/jax";
import { asArray, shapeOf } from "./data.js";
import { categoryColumn } from "./dataView.js";
import { groupRows } from "./grouping.js";
import { isLiteral } from "./categorical.js";
import { viewRows } from "./interaction.js";
import { limitError } from "./limits.js";

const EVENT = /^on(pointer|click|dblclick|contextmenu|nearest)/;
const ROW_CHANNELS = new Set([
  "position", "x", "y", "z", "lower", "upper", "baseline", "fill",
  "color", "size", "width", "categoryColor", "symbolCode", "outlineColor",
  "outlineWidth", "rotation", "dx", "dy",
]);

function resolveInputs(series, scope) {
  if (isLiteral(series)) return [series.value];
  if (
    Array.isArray(series) &&
    series.length > 0 &&
    series.every((field) => typeof field === "string" && scope?.has(field))
  )
    return series.map((field) => scope.get(field));
  return [scope?.resolve(series) ?? series];
}

function encodedColumn(value, n, own) {
  const source = value?.codes ?? value;
  if ((source?.shape?.[0] ?? source?.length) !== n)
    throw Error(`series has ${source?.shape?.[0] ?? source?.length ?? 0} rows; expected ${n}.`);
  if (value?.codes) {
    const codes = own(asArray(value.codes).astype(np.float32));
    return {
      group: value,
      valid: own(np.logicalAnd(np.isfinite(codes.ref), codes.ref.greaterEqual(0))),
    };
  }
  if (categoryColumn(value)) {
    const categories = [...new Set(Array.from(value).filter((v) => v != null))],
      lookup = new Map(categories.map((v, i) => [v, i])),
      codes = own(np.array(Array.from(value, (v) => lookup.get(v) ?? -1), { dtype: np.int32 }));
    return { group: { codes, categories }, valid: own(codes.ref.greaterEqual(0)) };
  }
  const array = own(asArray(value).astype(np.float32));
  return { group: array, valid: own(np.isfinite(array.ref)) };
}

function gather(value, index, n, own) {
  const source = value?.codes ?? value,
    shape = shapeOf(source);
  if (!shape.length || shape[0] !== n) return value;
  const array = own(asArray(source));
  return own(np.take(array.ref, index.ref, 0));
}

/**
 * Reorder row channels into first-seen series order, each series followed by one invalid vertex
 * (a break between paths). Only the series count crosses the device boundary: the output has a
 * row per input row and per series, the rows of no series (a missing key) and the breaks
 * missing (TODO 26.8). `rowOpacity`, a mark's row opacity (read beside its props), is
 * reordered the same way and returned as `opacity`.
 */
/** @param {string} kind @param {Record<string, unknown>} props @param {unknown} series @param {import("./dataViewTypes.js").RowScope|undefined} scope @param {{signal?: AbortSignal, maxBytes?: number, rowOpacity?: JaxArray | null}} [options] */
export async function partitionSeries(kind, props, series, scope, { signal, maxBytes = Infinity, rowOpacity } = {}) {
  if (!["Line", "Area"].includes(kind))
    throw Error("series is supported by Line and Area.");
  const primary = props.position ?? props.x,
    n = shapeOf(primary)[0] ?? 0,
    owned = [],
    own = (value) => (owned.push(value), value);
  let groups;
  try {
    const inputs = resolveInputs(series, scope),
      columns = {},
      names = [],
      validity = [];
    inputs.forEach((value, i) => {
      const name = `series${i}`,
        encoded = encodedColumn(value, n, own);
      names.push(name);
      columns[name] = encoded.group;
      validity.push(encoded.valid);
    });
    // groupRows reads a numeric series column through resolve (numericColumn), which borrows
    // it and takes a reference of its own (TODO 64: a scope of get alone failed on a numeric
    // series). resolve hands out the column, as a scope's resolve does.
    const synthetic = {
      length: n,
      get: (key) => columns[key],
      resolve: (key) => columns[key],
    };
    groups = await groupRows(synthetic, names);
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
    let valid = own(np.ones([n], { dtype: np.bool }));
    for (const mask of validity)
      valid = own(np.logicalAnd(valid.ref, mask.ref));
    // One stable sort: each row keyed 2 x its series' first-seen rank (a row of no series 2 x
    // count, last), each series' break 2 x rank + 1, right after its rows. Before, every series
    // was compacted with a readback of its row count.
    const count = groups.count, outputRows = n + count;
    if (outputRows * 16 > maxBytes)
      throw limitError("storage", {
        component: kind,
        what: "its series",
        count: outputRows * 16,
        limit: maxBytes,
        property: "series",
      });
    let index, sourceIndex;
    if (!outputRows) {
      index = own(np.zeros([0], { dtype: np.int32 }));
      sourceIndex = own(np.zeros([0], { dtype: np.int32 }));
    } else {
      const order = own(np.argsort(groups.firstIndices.ref)),
        rank = own(np.argsort(order.ref).astype(np.int32)),
        ranked = own(np.take(rank.ref, groups.codes.ref, 0));
      const keys = own(np.concatenate([
        np.where(valid.ref, ranked.ref.mul(2), 2 * count).astype(np.int32),
        np.arange(count).astype(np.int32).mul(2).add(1),
      ]));
      const sorted = own(np.argsort(keys.ref)),
        row = own(np.logicalAnd(sorted.ref.less(n), np.take(keys.ref, sorted.ref, 0).less(2 * count)));
      index = own(np.where(row.ref, sorted.ref, n).astype(np.int32));
      sourceIndex = own(np.where(row.ref, sorted.ref, -1).astype(np.int32));
    }
    const safeIndex = own(np.clip(index.ref, 0, Math.max(0, n - 1))),
      next = { ...props };
    delete next.series;
    for (const [key, value] of Object.entries(next)) {
      if (!ROW_CHANNELS.has(key)) continue;
      const shape = shapeOf(value?.codes ?? value);
      if (!shape.length || shape[0] !== n) continue;
      const selected = gather(value, safeIndex, n, own),
        rowShape = selected.shape.length > 1 ? [outputRows, ...selected.shape.slice(1)] : [outputRows],
        mask = index.ref.less(n),
        expanded = selected.shape.length > 1 ? mask.reshape([outputRows, ...selected.shape.slice(1).map(() => 1)]) : mask;
      const missing=own(np.full(rowShape, np.nan));
      next[key] = own(np.where(expanded, selected.ref, missing.ref));
    }
    // The grouped order on the host, read once on the first event: each event's row, and the
    // rows of its series (TODO 62.1), the run of rows between two breaks around the vertex.
    let disposed = false, order;
    const host = () => (order ??= sourceIndex.ref.data().then((values) => Int32Array.from(values)));
    const seriesRows = (rows, at) => () => {
      let start = at, end = at;
      while (start > 0 && rows[start - 1] >= 0) start--;
      while (end + 1 < rows.length && rows[end + 1] >= 0) end++;
      return Array.from(rows.subarray(start, end + 1));
    };
    for (const [key, handler] of Object.entries(next))
      if (EVENT.test(key) && typeof handler === "function")
        next[key] = async (event) => {
          const at = event?.instanceId;
          if (disposed || !Number.isInteger(at) || at < 0 || at >= sourceIndex.shape[0])
            return handler(event);
          const rows = await host();
          const row = rows[at];
          // `_seriesRows()`: the series' rows in the mark's scope, for hover and select.
          if (row >= 0) return handler({ ...event, instanceId: row, rowIndex: row, _seriesRows: seriesRows(rows, at) });
        };
    let structuralScope = scope;
    while (structuralScope?.parent && structuralScope.topology === undefined)
      structuralScope = structuralScope.parent;
    next._categoryTopology = JSON.stringify([
      next._categoryTopology,
      "series",
      // Numerical updates to a same-row view change its version without changing the paths.
      // Selection/aggregation views publish their structural revision as topology.
      structuralScope?.topology ?? structuralScope?.version ?? null,
      groups.count,
      outputRows,
    ]);
    return {
      props: next,
      // Retain the reordered row provenance beside the public props. Interaction
      // feedback uses it to project owner membership into grouped paths without
      // changing picking identities or exposing a renderer channel.
      sourceIndex,
      opacity: rowOpacity && shapeOf(rowOpacity)[0] === n ? own(inSeriesOrder(rowOpacity, sourceIndex)) : undefined,
      dispose() { disposed = true; owned.splice(0).forEach((value) => value?.dispose?.()); },
    };
  } catch (error) {
    owned.splice(0).forEach((value) => value?.dispose?.());
    throw error;
  } finally {
    groups?.dispose();
  }
}

/**
 * A new array of `values`' rows in the grouped series order of `sourceIndex`, each break row
 * `fill`. Borrows both arrays.
 * @param {JaxArray} values @param {JaxArray} sourceIndex @param {number} [fill]
 * @returns {JaxArray}
 */
function inSeriesOrder(values, sourceIndex, fill = 0) {
  const n = values.shape[0], rows = sourceIndex.shape[0];
  if (!n) return np.full([rows, ...values.shape.slice(1)], fill, { dtype: values.dtype });
  const safe = np.clip(sourceIndex.ref, 0, n - 1),
    taken = np.take(values.ref, safe, 0),
    present = sourceIndex.ref.greaterEqual(0);
  return np.where(
    values.shape.length > 1 ? present.reshape([rows, ...values.shape.slice(1).map(() => 1)]) : present,
    taken,
    fill,
  );
}

/**
 * Each row's series as an int32 code (-1 for a row with a missing key) over `n` rows of
 * `columns` (category columns, string arrays or numbers), computed without a readback: rows sort
 * by every column in turn and a code starts where a column changes (as groupRows, which also
 * reads the count back).
 */
function seriesCodes(columns, n) {
  const owned = [], own = (value) => (owned.push(value), value);
  try {
    if (!n) return np.zeros([0], { dtype: np.int32 });
    const keys = [];
    let valid = own(np.ones([n], { dtype: np.bool }));
    for (const column of columns) {
      const encoded = encodedColumn(column, n, own);
      keys.push(own(asArray(encoded.group?.codes ?? encoded.group).astype(np.float32)));
      valid = own(np.logicalAnd(valid.ref, encoded.valid.ref));
    }
    let order = own(np.arange(n).astype(np.int32));
    for (const key of [...keys].reverse()) {
      const value = own(np.take(key.ref, order.ref, 0));
      order = own(np.take(order.ref, np.argsort(np.where(np.isfinite(value.ref), value.ref, Infinity)), 0));
    }
    let changes = own(np.zeros([n - 1], { dtype: np.bool }));
    for (const key of keys) {
      const value = own(np.take(key.ref, order.ref, 0));
      changes = own(np.logicalOr(changes.ref, value.ref.slice([0, n - 1]).notEqual(value.ref.slice([1, n]))));
    }
    const starts = own(np.concatenate([np.ones([1], { dtype: np.int32 }), changes.ref.astype(np.int32)]));
    const sorted = own(np.cumsum(starts.ref, 0).sub(1).astype(np.int32));
    const codes = own(np.take(sorted.ref, np.argsort(order.ref), 0));
    return np.where(valid.ref, codes.ref, -1).astype(np.int32);
  } finally {
    owned.splice(0).forEach((value) => value?.dispose?.());
  }
}

/**
 * How a brush over a series mark brushes whole series (TODO 62.1): a row is brushed when any row
 * of its series is inside. The series are grouped over the table that owns the rows (each
 * series column followed up through the views to the table, as brushColumn follows x and y), so
 * @brushed is the same rows in every view. Without `series` the mark is one series: every row it
 * shows (`scope`'s rows). `expand(mask)` borrows an owner-length int32 mask and returns a new
 * one. The codes are cached while a constraint holds the expansion (`retain`/`release`); after
 * that they are computed per call, so a released expansion still expands.
 */
export function seriesBrush(scope, series, kind) {
  const owner = scope?.identity;
  if (!owner) return null;
  if (series === undefined)
    return {
      name: kind,
      retain() {},
      release() {},
      expand(mask) {
        const n = mask.shape[0];
        if (n !== owner.length) return mask.ref;
        const shown = scope.sourceIndices ? viewRows(scope, n) : np.ones([n], { dtype: np.int32 });
        return np.where(np.max(np.logicalAnd(mask.ref, shown.ref).astype(np.int32)).greater(0), shown, 0).astype(np.int32);
      },
    };
  const fields = Array.isArray(series) ? series : [series];
  let source = scope, names = fields;
  if (fields.every((field) => typeof field === "string" && scope.has?.(field)))
    while (source.parent) {
      const parent = source.parent;
      const found = names.map((name) => {
        const identity = source.columnIdentity?.(name);
        return identity ? parent.keys?.().find((key) => parent.columnIdentity?.(key) === identity) : undefined;
      });
      if (found.some((name) => name === undefined)) break;
      source = parent;
      names = found;
    }
  else if (scope.parent || scope.length !== owner.length)
    throw Error(`${kind} brushes whole series: give series as column names of its table.`);
  if (source.length !== owner.length)
    throw Error(`${kind} brushes whole series: series ${fields.join(", ")} must be a column of the table, not one a transform adds.`);
  const columns = () => typeof names[0] === "string" && names.every((name) => typeof name === "string")
    ? names.map((name) => (source.has?.(name) ? source.get(name) : undefined))
    : [series];
  let users = 0, cache = null;
  const codes = (n) => {
    const current = columns();
    if (current.some((column) => column === undefined) || source.length !== n) return null;
    if (cache && cache.columns.every((column, i) => column === current[i])) return cache.codes.ref;
    const computed = seriesCodes(current, n);
    if (users > 0) {
      cache?.codes.dispose();
      cache = { columns: current, codes: computed.ref };
    }
    return computed;
  };
  return {
    name: fields.every((field) => typeof field === "string") ? fields.join(", ") : kind,
    retain() { users++; },
    release() {
      users = Math.max(0, users - 1);
      if (!users) { cache?.codes.dispose(); cache = null; }
    },
    expand(mask) {
      const n = mask.shape[0], code = n ? codes(n) : null;
      // The table changed under the brush: the rows stand as they are until it prepares again.
      if (!code) return mask.ref;
      const hits = lax.scatter(mask.ref.astype(np.int32), code.ref, [n], { mode: "add" });
      return np.where(code.ref.greaterEqual(0), np.take(hits.greater(0).astype(np.int32), np.maximum(code, 0), 0), 0).astype(np.int32);
    },
  };
}

/**
 * A brush constraint (brushStrips.brushConstraint) that brushes whole series: the descriptor
 * carries the series' name (Python and getConstraints see it) and the expansion, which the
 * selection applies after combining its constraints. Holds the expansion until released.
 */
export function seriesConstraint(constraint, brush) {
  if (!brush) return constraint;
  brush.retain();
  let released = false;
  return {
    ...constraint,
    series: brush.name,
    expand: brush.expand,
    release() {
      constraint.release?.();
      if (!released) { released = true; brush.release(); }
    },
  };
}
