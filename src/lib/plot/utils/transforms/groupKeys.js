import { ownCacheEntry, disposeCacheEntries } from "../cacheEntries.js";
import { numpy as np } from "@hmplot/jax";
import { createDataView, scalar } from "../dataView.js";
import { first, GROUP_KEY_OPS } from "../expressions.js";
import { isExpression } from "../names.js";
import { list } from "./common.js";
import { bin as binTransform } from "./bin.js";
import { hexCells, hexCenters } from "./hexbin.js";

/**
 * Bins and hexagons as Group keys (TODO 137.2): Group(by=bin("x", 20)) has a row per bin with a
 * visible row, Group(by=hexbin("x", "y")) one per hexagon, alongside any column keys. Each row
 * is binned as Bin and Hexbin bin it (over the visible rows, so the groups follow the mask as
 * theirs do), and the rows are grouped by their bin with Group's columns.
 */

/** Whether a key of Group's by is a bin or hexbin. */
export const isKeyNode = (key) =>
  isExpression(key) && GROUP_KEY_OPS.has(key.op);

/** The columns a key writes: a column key its own; a bin its edges and center (x0, x1, x); a
 * hexbin its center (x, y). */
export function keyOutputs(key) {
  if (!isKeyNode(key)) return [key];
  if (key.op === "bin") {
    const field = key.args[0];
    return [field + "0", field + "1", field];
  }
  return [key.args[0], key.args[1]];
}

/** An error from Bin or Hexbin, as the Group key that raised it: Group: bin("x", 20): …. */
function asKey(key, error) {
  const described = `${key.op}(${key.args
    .filter((arg) => typeof arg === "string")
    .map((arg) => JSON.stringify(arg))
    .join(", ")})`;
  const message = String(error?.message ?? error).replace(
    /^(Bin|Hexbin)\b:?\s*/,
    "",
  );
  return Error(`Group by ${described}: ${message}`, { cause: error });
}

/** Checks a bin key's settings as Bin checks its own (an interval with explicit edges, an
 * unknown interval or time zone). */
export function validateKey(key) {
  if (key.op !== "bin") return;
  const [field, { bins, interval, tz }] = key.args;
  try {
    binTransform.validate({ x: field, bins, interval, tz, mode: "assign" });
  } catch (error) {
    throw asKey(key, error);
  }
}

/** Retain assignment columns while their source, mask and bin settings are unchanged.
 * Keeping the device columns stable also lets the nested Group reuse its discovered groups. */
async function keyAssignment(input, key, fields, context, produce) {
  // Virtual interaction columns can change in place independently of table revisions.
  const cache = fields.every(field => typeof field === "string" && !field.startsWith("@")) ? context.cache : null;
  const identity = [JSON.stringify(key), input.length, input.valid,
    input.scope.version, input.scope.identity?.generation,
    ...fields.flatMap(field => [input.scope.get(field), JSON.stringify(input.scope.metadata?.(field))])];
  const previous = cache?.assignment;
  if (previous && previous.identity.every((value, i) => value === identity[i]))
    return { ...previous.result, columns: Object.fromEntries(
      Object.entries(previous.result.columns).map(([name, value]) => [name, context.own(value.ref)])) };
  const result = await produce();
  if (cache) {
    const columns = Object.fromEntries(Object.entries(result.columns).map(([name, value]) => [name, value.ref]));
    const dispose = entry => Object.values(entry.result.columns).forEach(value => value.dispose());
    if (previous) dispose(previous);
    cache.assignment = { identity, result: { columns, columnMetadata: result.columnMetadata } };
    ownCacheEntry(cache, "assignment", dispose);
  }
  return result;
}

function binAssignment(input, key, context) {
  const [field, { bins, interval, tz }] = key.args;
  return keyAssignment(input, key, [field], context,
    () => binTransform.run(input, { x: field, bins, interval, tz, mode: "assign" }, context));
}

function hexAssignment(input, key, context) {
  const [x, y, options] = key.args;
  const { __expressionLiteral, ...settings } = options ?? {};
  return keyAssignment(input, key, [x, y], context, async () => {
    const { cq, cr, finite, rootThreeR, twoR } = await hexCells(input, { x, y, ...settings }, context.own);
    return { columns: { cq, cr, finite: context.own(finite), rootThreeR, twoR } };
  });
}

/** Group over `by` with bin or hexbin keys: Group's run, with the bins as hidden key columns. */
export async function groupByKeys(input, config, context) {
  const { own, cleanup, run, cache } = context;
  const nested = cache ? (cache.keyGrouping ??= {}) : undefined;
  if (cache) ownCacheEntry(cache, "keyGrouping", disposeCacheEntries);
  const groupKeys = list(config.by);
  // Each key owns its edge cache: two automatic bins must not evict one another.
  const caches = cache ? (cache.groupKeys ??= new Map()) : null;
  if (cache) {
    ownCacheEntry(cache, "groupKeys", entries => entries.forEach(disposeCacheEntries));
    for (const [index, entry] of caches)
      if (!isKeyNode(groupKeys[index])) {
        disposeCacheEntries(entry);
        caches.delete(index);
      }
  }
  const contextOf = index => {
    if (!caches) return context;
    if (!caches.has(index)) caches.set(index, {});
    return { ...context, cache: caches.get(index) };
  };
  const hidden = {},
    by = [],
    keys = [],
    columns = { ...(config.columns ?? {}) };
  // The rows in a bin of every key (and visible).
  let kept = input.valid
    ? input.valid.ref.greater(0)
    : np.ones([input.length], { dtype: np.bool });
  try {
    for (const [i, key] of groupKeys.entries()) {
      if (!isKeyNode(key)) {
        by.push(key);
        keys.push({ kind: "column", name: key });
      } else if (key.op === "bin") {
        const field = key.args[0];
        const assigned = await binAssignment(input, key, contextOf(i))
          .catch((error) => {
            throw asKey(key, error);
          });
        const code = `\u0000bin${i}`,
          lo = code + "lo",
          hi = code + "hi";
        hidden[code] = assigned.columns.binX;
        hidden[lo] = assigned.columns.binX0;
        hidden[hi] = assigned.columns.binX1;
        kept = np.logicalAnd(kept, assigned.columns.binX.ref.greaterEqual(0));
        // A bin's edges are the same for its every row.
        columns[lo] = first(lo);
        columns[hi] = first(hi);
        by.push(code);
        keys.push({
          kind: "bin",
          field,
          lo,
          hi,
          metadata: assigned.columnMetadata?.binX0,
        });
      } else {
        const [x, y, options] = key.args;
        const { columns: cells } = await hexAssignment(input, key, contextOf(i)).catch(error => {
          throw asKey(key, error);
        });
        const q = `\u0000hex${i}q`,
          r = `\u0000hex${i}r`;
        hidden[q] = cells.cq;
        hidden[r] = cells.cr;
        kept = np.logicalAnd(kept, cells.finite.ref);
        by.push(q, r);
        keys.push({ kind: "hexbin", x, y, q, r, cells: { ...cells, orientation: options?.orientation ?? "pointy" } });
      }
    }
  } catch (error) {
    kept.dispose();
    throw error;
  }
  const withKeys = createDataView(input.scope, { columns: hidden });
  let subset, grouped;
  try {
    // Keep the key columns in their original row space. Compacting them here would
    // allocate fresh gathered columns and discard the nested Group's cache each run.
    const mask = own(kept.astype(np.int32));
    const count = await scalar(np.sum(mask.ref));
    subset = createDataView(withKeys, { mask: mask.ref, count });
    grouped = await run("Group", subset, {
      by,
      columns,
      // Its columns may read @time.
      ...(config.__viewState ? { __viewState: config.__viewState } : {}),
    }, { cache: nested });
  } catch (error) {
    subset?.dispose();
    throw error;
  } finally {
    withKeys.dispose();
  }
  // The groups' codes index the subset's rows, so it lives as long as the output.
  cleanup(() => {
    grouped.dispose();
    subset.dispose();
  });
  const rows = grouped.padded?.() ?? grouped;
  const out = {},
    columnMetadata = {};
  for (const key of keys) {
    if (key.kind === "column") {
      out[key.name] = rows.get(key.name);
      const metadata = rows.metadata?.(key.name);
      if (metadata) columnMetadata[key.name] = metadata;
    } else if (key.kind === "bin") {
      const lo = rows.get(key.lo),
        hi = rows.get(key.hi);
      out[key.field + "0"] = lo;
      out[key.field + "1"] = hi;
      out[key.field] = own(lo.ref.add(hi.ref).mul(0.5));
      if (key.metadata)
        for (const name of [key.field + "0", key.field + "1", key.field])
          columnMetadata[name] = key.metadata;
    } else {
      const centers = hexCenters(key.cells, rows.get(key.q), rows.get(key.r), own);
      out[key.x] = centers.x;
      out[key.y] = centers.y;
    }
  }
  out.count = rows.get("count");
  for (const name of Object.keys(config.columns ?? {})) {
    out[name] = rows.get(name);
    const metadata = rows.metadata?.(name);
    if (metadata) columnMetadata[name] = metadata;
  }
  return {
    columns: out,
    columnMetadata,
    // The groups' rows, as a Group's: contributors, and @selected from a brush elsewhere.
    provenance: {
      kind: "group",
      codes: grouped.provenance.codes,
      rows: grouped.provenance.rows ?? subset.scope ?? subset,
      fields: [...list(config.by).flatMap(keyOutputs), "count"],
    },
    ...(rows !== grouped
      ? { valid: own(rows.valid.ref), count: grouped.length }
      : {}),
  };
}
