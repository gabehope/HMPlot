import { numpy as np } from "@hmplot/jax";
import { groupRows } from "./grouping.js";
import { asArray } from "./data.js";
import { columnTitle } from "./axisTitles.js";
import { normalizeGrid, evenDimension } from "./gridModel.js";
import {
  createDataView,
  categoryColumn,
  numericColumn,
  scalar,
  finiteExtents,
} from "./dataView.js";
import { ownCacheEntry } from "./cacheEntries.js";
import { limitError } from "./limits.js";

/** Bounded query batches; distance matrices are never retained in the output. */
async function interpolateRows(scope, config, context, normalized = false) {
  const { signal, maxBytes, cache, own } = context;
  const fields = config.values;
  if (!Array.isArray(fields) || !fields.length)
    throw Error("Interpolate needs at least one value column.");
  const identity = [
    config.x,
    ...(config.y === undefined ? [] : [config.y]),
  ].flatMap((key) => {
    const id = scope.columnIdentities?.[key];
    return id
      ? [id.source, id.selection, id.key]
      : [key, scope.get(key).codes ?? scope.get(key)];
  });
  const same = (a, b) =>
    a?.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  if (scope.length * 128 > maxBytes)
    throw limitError("storage", {
      component: "Interpolate",
      what: "its source",
      count: scope.length * 128,
      limit: maxBytes,
    });
  if (!normalized && scope.length && !same(cache?.unique, identity)) {
    const grouped = await groupRows(scope, [
      config.x,
      ...(config.y === undefined ? [] : [config.y]),
    ]);
    if (grouped.count < scope.length) {
      const arrays = [],
        own = (a) => (arrays.push(a), a),
        columns = { ...grouped.keys },
        index = own(np.arange(scope.length).astype(np.int32));
      let reduced;
      try {
        for (const field of fields) {
          const raw = scope.get(field),
            categories = categoryColumn(raw)
              ? (raw.categories ?? [...new Set(raw.filter((v) => v != null))])
              : null;
          const value = own(
              categories
                ? raw.codes
                  ? asArray(raw.codes).astype(np.float32)
                  : np.array(raw.map((v) => categories.indexOf(v)))
                : numericColumn(scope, field),
            ),
            parts = [];
          for (let g = 0; g < grouped.count; g++) {
            if (signal?.aborted)
              throw new DOMException("Canceled", "AbortError");
            const valid = np.logicalAnd(
              grouped.codes.ref.equal(g),
              categories
                ? np.logicalAnd(
                    np.isfinite(value.ref),
                    value.ref.greaterEqual(0),
                  )
                : np.isfinite(value.ref),
            );
            let result;
            if (categories) {
              const at = np.min(np.where(valid.ref, index.ref, scope.length));
              result = np.where(
                at.ref.less(scope.length),
                np.take(value.ref, np.minimum(at, scope.length - 1), 0),
                -1,
              );
            } else {
              const count = np.sum(valid.ref.astype(np.float32));
              result = np.where(
                count.ref.greater(0),
                np
                  .sum(np.where(valid.ref, value.ref, 0))
                  .div(np.maximum(count, 1)),
                np.nan,
              );
            }
            valid.dispose();
            parts.push(own(result));
            if (g % 16 === 15) {
              await result.blockUntilReady();
              await new Promise((r) => setTimeout(r, 0));
            }
          }
          const output = own(np.stack(parts.map((a) => a.ref)));
          columns[field] = categories ? { codes: output, categories } : output;
        }
        reduced = createDataView(scope, { columns, aggregate: true });
        reduced.onDispose = () => {
          arrays.splice(0).forEach((a) => a.dispose());
          grouped.dispose();
        };
        context.cleanup(() => reduced.dispose());
        return await interpolateRows(
          reduced,
          config,
          { ...context, cache: undefined },
          true,
        );
      } finally {
        if (!reduced) {
          arrays.forEach((a) => a.dispose());
          grouped.dispose();
        }
      }
    }
    grouped.dispose();
    if (cache) cache.unique = identity;
  }
  const dims = config.y === undefined ? 1 : 2;
  let resolution = config.resolution ?? (dims === 1 ? 256 : [128, 128]);
  resolution =
    typeof resolution === "number" ? Array(dims).fill(resolution) : resolution;
  if (
    resolution.length !== dims ||
    resolution.some((v) => !Number.isInteger(v) || v < 2)
  )
    throw Error(
      "Interpolate resolution needs an integer of at least two per axis.",
    );
  const total = resolution.reduce((a, b) => a * b, 1),
    n = scope.length;
  const working = Math.max(total * (fields.length + dims + 32) * 4, n * 128);
  if (working > maxBytes)
    throw limitError("storage", {
      component: "Interpolate",
      what: "its working memory",
      count: working,
      limit: maxBytes,
      hint: "Use a lower resolution, or fewer rows.",
    });
  let method = config.method ?? "auto";
  if (
    !["auto", "linear", "bilinear", "idw", "nearest"].includes(method) ||
    (dims === 1 && method === "bilinear") ||
    (dims === 2 && method === "linear")
  )
    throw Error(
      "Interpolate's method is incompatible with its coordinate dimensions.",
    );
  const outputs = {};
  const check = () => {
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  };
  check();
  const x = own(numericColumn(scope, config.x)),
    y = dims === 2 ? own(numericColumn(scope, config.y)) : null;
  const valid = own(
    y
      ? np.logicalAnd(np.isfinite(x.ref), np.isfinite(y.ref))
      : np.isfinite(x.ref),
  );
  const coordinateKey = [
    ...identity,
    config.method ?? "auto",
    JSON.stringify(config.bounds ?? null),
  ];
  const coordinate = same(cache?.coordinate?.key, coordinateKey)
    ? cache.coordinate
    : null;
  // Both automatic extents in one readback (TODO 29.3).
  const extents = async () => {
    const [xe, ye] = await finiteExtents([
      own(np.where(valid.ref, x.ref, np.nan)),
      ...(y ? [own(np.where(valid.ref, y.ref, np.nan))] : []),
    ]);
    return { x: xe, ...(y ? { y: ye } : {}) };
  };
  const bounds = config.bounds ?? coordinate?.bounds ?? (await extents());
  for (const axis of ["x", ...(y ? ["y"] : [])])
    if (
      !Array.isArray(bounds[axis]) ||
      bounds[axis].length !== 2 ||
      !bounds[axis].every(Number.isFinite) ||
      bounds[axis][1] < bounds[axis][0]
    )
      throw Error(`Invalid Interpolate ${axis} bounds.`);
  if (coordinate) method = coordinate.method;
  if (method === "auto") method = dims === 1 ? "linear" : "idw";
  // A complete rectangular grid can be detected from compact unique counts.
  if (
    !coordinate &&
    dims === 2 &&
    (config.method === "auto" ||
      config.method === undefined ||
      method === "bilinear")
  ) {
    const uniqueCount = async (a) => {
      const sorted = own(np.sort(np.where(valid.ref, a.ref, Infinity)));
      return scalar(
        np.sum(
          np
            .logicalAnd(
              np.isfinite(sorted.ref),
              np.concatenate([
                np.ones([1], { dtype: np.bool }),
                sorted.ref.slice([1, n]).notEqual(sorted.ref.slice([0, n - 1])),
              ]),
            )
            .astype(np.int32),
        ),
      );
    };
    if (n) {
      const nx = await uniqueCount(x),
        ny = await uniqueCount(y);
      // Check that every valid coordinate pair has support; duplicated pairs do not fill holes.
      const order = own(np.argsort(np.where(valid.ref, y.ref, Infinity))),
        sx = own(np.take(x.ref, order.ref, 0)),
        sy = own(np.take(y.ref, order.ref, 0));
      const second = own(
        np.argsort(np.where(np.isfinite(sx.ref), sx.ref, Infinity)),
      );
      const px = own(np.take(sx.ref, second.ref, 0)),
        py = own(np.take(sy.ref, second.ref, 0));
      const distinct = own(
        np.concatenate([
          np.ones([1], { dtype: np.bool }),
          np.logicalOr(
            px.ref.slice([1, n]).notEqual(px.ref.slice([0, n - 1])),
            py.ref.slice([1, n]).notEqual(py.ref.slice([0, n - 1])),
          ),
        ]),
      );
      const count = await scalar(
        np.sum(
          np
            .logicalAnd(
              distinct.ref,
              np.logicalAnd(np.isfinite(px.ref), np.isfinite(py.ref)),
            )
            .astype(np.int32),
        ),
      );
      const regular = nx * ny === count;
      if (method === "bilinear" && !regular)
        throw Error(
          "Bilinear interpolation requires a complete rectangular source grid.",
        );
      if (regular) method = "bilinear";
    }
  }
  if (cache) cache.coordinate = { key: coordinateKey, bounds, method };
  const coords = np.arange(total).astype(np.float32);
  const gx = own(
    (dims === 1 ? coords.ref : np.remainder(coords.ref, resolution[0]))
      .add(dims === 1 ? 0 : 0.5)
      .div(dims === 1 ? resolution[0] - 1 : resolution[0])
      .mul(bounds.x[1] - bounds.x[0])
      .add(bounds.x[0]),
  );
  const gy = y
    ? own(
        np
          .floor(coords.ref.div(resolution[0]))
          .add(0.5)
          .div(resolution[1])
          .mul(bounds.y[1] - bounds.y[0])
          .add(bounds.y[0]),
      )
    : null;
  coords.dispose();
  outputs.x = gx;
  if (gy) outputs.y = gy;
  const input = fields.map((field) => {
    if (!scope.has(field))
      throw Error(`Missing Interpolate value column: ${field}`);
    const v = scope.get(field),
      cat = categoryColumn(v),
      categories = cat
        ? (v.categories ?? [...new Set(v.filter((x) => x != null))])
        : null;
    const a = own(
      cat
        ? v.codes
          ? asArray(v.codes).astype(np.float32)
          : np.array(v.map((x) => categories.indexOf(x)))
        : numericColumn(scope, field),
    );
    return { field, a, categories, parts: [], missing: false };
  });
  for (const item of input)
    item.missing = Boolean(
      n &&
      (await scalar(
        np.sum(
          (item.categories
            ? np.logicalOr(
                np.logicalNot(np.isfinite(item.a.ref)),
                item.a.ref.less(0),
              )
            : np.logicalNot(np.isfinite(item.a.ref))
          ).astype(np.int32),
        ),
      )),
    );
  const cacheKey = [
    ...identity,
    method,
    JSON.stringify(resolution),
    JSON.stringify(bounds),
  ];
  const saved = same(cache?.grid?.key, cacheKey) ? cache.grid : null;
  const pieces = [];
  const disposePieces = () =>
    pieces.splice(0).forEach((p) => {
      p.indices.dispose();
      p.weights.dispose();
      p.nearest.dispose();
      p.valid.dispose();
    });
  try {
    const batch = Math.max(
      1,
      Math.min(256, Math.floor(maxBytes / Math.max(1, n * 4 * 16))),
    );
    if (saved?.indices && input.every((item) => !item.missing)) {
      for (const item of input) {
        if (item.categories || method === "nearest")
          item.parts.push(
            own(
              np.where(
                saved.valid.ref,
                np.take(item.a.ref, saved.nearest.ref, 0),
                np.nan,
              ),
            ),
          );
        else {
          const values = own(np.take(item.a.ref, saved.indices.ref, 0));
          const sum = own(np.sum(saved.weights.ref, 1));
          item.parts.push(
            own(
              np.where(
                sum.ref.greater(0),
                np
                  .sum(values.ref.mul(saved.weights.ref), 1)
                  .div(np.maximum(sum.ref, 1e-30)),
                np.nan,
              ),
            ),
          );
        }
      }
      await input.at(-1).parts.at(-1).blockUntilReady();
      check();
    } else {
      for (let start = 0; start < total; start += batch) {
        check();
        const end = Math.min(start + batch, total),
          size = end - start,
          scratch = [],
          tmp = (a) => (scratch.push(a), a);
        try {
          const qx = tmp(gx.ref.slice([start, end]).reshape([size, 1])),
            qy = gy ? tmp(gy.ref.slice([start, end]).reshape([size, 1])) : null;
          const dx = tmp(x.ref.reshape([1, n]).sub(qx.ref)),
            dy = y ? tmp(y.ref.reshape([1, n]).sub(qy.ref)) : null;
          const distance = tmp(
            np.where(
              valid.ref.reshape([1, n]),
              dy ? np.square(dx.ref).add(np.square(dy.ref)) : np.square(dx.ref),
              Infinity,
            ),
          );
          const nearest = n
            ? tmp(
                np
                  .argsort(distance.ref, 1)
                  .slice([0, size], [0, Math.min(8, n)]),
              )
            : null;
          let weights;
          if (n && (method === "linear" || method === "bilinear")) {
            const bracket = (a, q) => {
              const lo = tmp(
                np.max(
                  np.where(
                    np.logicalAnd(
                      valid.ref.reshape([1, n]),
                      a.ref.reshape([1, n]).lessEqual(q.ref),
                    ),
                    a.ref.reshape([1, n]),
                    -Infinity,
                  ),
                  1,
                  { keepdims: true },
                ),
              );
              const hi = tmp(
                np.min(
                  np.where(
                    np.logicalAnd(
                      valid.ref.reshape([1, n]),
                      a.ref.reshape([1, n]).greaterEqual(q.ref),
                    ),
                    a.ref.reshape([1, n]),
                    Infinity,
                  ),
                  1,
                  { keepdims: true },
                ),
              );
              const t = tmp(
                np.where(
                  hi.ref.equal(lo.ref),
                  0,
                  q.ref.sub(lo.ref).div(hi.ref.sub(lo.ref)),
                ),
              );
              return { lo, hi, t };
            };
            const bx = bracket(x, qx),
              by = y ? bracket(y, qy) : null;
            const support = tmp(
              np.logicalAnd(np.isfinite(bx.lo.ref), np.isfinite(bx.hi.ref)),
            );
            const supported = by
              ? tmp(
                  np.logicalAnd(
                    support.ref,
                    np.logicalAnd(
                      np.isfinite(by.lo.ref),
                      np.isfinite(by.hi.ref),
                    ),
                  ),
                )
              : support;
            weights = tmp(np.zeros([size, n]));
            for (let iy = 0; iy < (y ? 2 : 1); iy++)
              for (let ix = 0; ix < 2; ix++) {
                const mx = x.ref
                  .reshape([1, n])
                  .equal((ix ? bx.hi : bx.lo).ref);
                const mask = tmp(
                  y
                    ? np.logicalAnd(
                        mx,
                        y.ref.reshape([1, n]).equal((iy ? by.hi : by.lo).ref),
                      )
                    : mx,
                );
                const wx = ix ? bx.t.ref : np.subtract(1, bx.t.ref),
                  wy = y
                    ? iy
                      ? by.t.ref
                      : np.subtract(1, by.t.ref)
                    : np.array(1);
                weights = tmp(
                  weights.ref.add(
                    np.where(
                      np.logicalAnd(mask.ref, supported.ref),
                      wx.mul(wy).div(
                        np.maximum(
                          np.sum(mask.ref.astype(np.float32), 1, {
                            keepdims: true,
                          }),
                          1,
                        ),
                      ),
                      0,
                    ),
                  ),
                );
              }
          }
          if (n && cache) {
            const indices = weights
              ? np
                  .argsort(weights.ref.neg(), 1)
                  .slice([0, size], [0, Math.min(y ? 4 : 2, n)])
              : nearest.ref;
            let compact;
            if (weights)
              compact = np.takeAlongAxis(weights.ref, indices.ref, 1);
            else {
              const d = np.takeAlongAxis(distance.ref, indices.ref, 1),
                exact = d.ref.equal(0),
                hasExact = np
                  .sum(exact.ref.astype(np.float32), 1, { keepdims: true })
                  .greater(0);
              compact = np.where(
                hasExact,
                exact.astype(np.float32),
                np.where(
                  np.isfinite(d.ref),
                  np.divide(1, np.maximum(d.ref, 1e-20)),
                  0,
                ),
              );
              d.dispose();
            }
            const first = np.argmin(distance.ref, 1),
              supported = weights
                ? np.sum(weights.ref, 1).greater(0)
                : np.isfinite(np.min(distance.ref, 1));
            pieces.push({
              indices,
              weights: compact,
              nearest: first,
              valid: supported,
            });
          }
          for (const item of input) {
            let result;
            if (!n) result = np.full([size], np.nan);
            else if (item.categories || method === "nearest") {
              const usable = tmp(
                item.categories
                  ? np.logicalAnd(
                      np.isfinite(item.a.ref),
                      item.a.ref.greaterEqual(0),
                    )
                  : np.isfinite(item.a.ref),
              );
              const d = tmp(
                np.where(usable.ref.reshape([1, n]), distance.ref, Infinity),
              );
              const index = tmp(np.argmin(d.ref, 1));
              result = np.where(
                np.logicalAnd(
                  weights
                    ? np.sum(weights.ref, 1).greater(0)
                    : np.ones([size], { dtype: np.bool }),
                  np.isfinite(np.min(d.ref, 1)),
                ),
                np.take(item.a.ref, index.ref, 0),
                np.nan,
              );
            } else if (weights) {
              const usable = tmp(
                np.where(
                  np.isfinite(item.a.ref).reshape([1, n]),
                  weights.ref,
                  0,
                ),
              );
              const sum = tmp(np.sum(usable.ref, 1));
              result = np.where(
                sum.ref.greater(0),
                np
                  .sum(
                    usable.ref.mul(
                      np
                        .where(np.isfinite(item.a.ref), item.a.ref, 0)
                        .reshape([1, n]),
                    ),
                    1,
                  )
                  .div(np.maximum(sum.ref, 1e-30)),
                np.nan,
              );
            } else {
              const d = tmp(
                np.where(
                  np.isfinite(item.a.ref).reshape([1, n]),
                  distance.ref,
                  Infinity,
                ),
              );
              const indices = tmp(
                np.argsort(d.ref, 1).slice([0, size], [0, Math.min(8, n)]),
              );
              const values = tmp(np.take(item.a.ref, indices.ref, 0)),
                ds = tmp(np.takeAlongAxis(d.ref, indices.ref, 1));
              const exact = tmp(ds.ref.equal(0)),
                hasExact = tmp(
                  np
                    .sum(exact.ref.astype(np.float32), 1, { keepdims: true })
                    .greater(0),
                );
              const w = tmp(
                  np.where(
                    hasExact.ref,
                    exact.ref.astype(np.float32),
                    np.where(
                      np.isfinite(ds.ref),
                      np.divide(1, np.maximum(ds.ref, 1e-20)),
                      0,
                    ),
                  ),
                ),
                sum = tmp(np.sum(w.ref, 1));
              result = np.where(
                sum.ref.greater(0),
                np
                  .sum(
                    w.ref.mul(np.where(np.isfinite(values.ref), values.ref, 0)),
                    1,
                  )
                  .div(np.maximum(sum.ref, 1e-30)),
                np.nan,
              );
            }
            item.parts.push(own(result));
          }
          await input.at(-1).parts.at(-1).blockUntilReady();
        } finally {
          scratch.forEach((a) => a.dispose());
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    if (cache && pieces.length === Math.ceil(total / batch)) {
      cache.grid?.dispose();
      const joined = Object.fromEntries(
        ["indices", "weights", "nearest", "valid"].map((key) => [
          key,
          np.concatenate(pieces.map((p) => p[key].ref)),
        ]),
      );
      ownCacheEntry(cache, "grid", (grid) => grid.dispose());
      cache.grid = {
        key: cacheKey,
        ...joined,
        dispose() {
          Object.values(joined).forEach((a) => a.dispose());
        },
      };
    }
  } finally {
    // Concatenation owns the dependencies it needs, including deferred device work.
    // Cache only the complete geometry; partial batches are never a reusable cache.
    disposePieces();
  }
  for (const item of input) {
    const a = own(np.concatenate(item.parts.map((p) => p.ref)));
    outputs[item.field] = item.categories
      ? { codes: a, categories: item.categories }
      : a;
  }
  check();
  // A grid table (TODO 51): y then x, x varying fastest, as gx and gy are laid out; a 2-D grid's
  // cells tile the bounds, a 1-D grid's points reach its ends.
  const grid = normalizeGrid(
    {
      dims:
        dims === 1
          ? [evenDimension("x", bounds.x, resolution[0], { ends: true })]
          : [
              evenDimension("y", bounds.y, resolution[1]),
              evenDimension("x", bounds.x, resolution[0]),
            ],
      fields,
    },
    total,
  );
  return {
    columns: outputs,
    grid,
    view: {
      topology: "grid:" + JSON.stringify([resolution, bounds]),
      gridInfo: { method, geometryReused: Boolean(saved) },
    },
  };
}

export const interpolate = {
  reads: "compacted",
  output: "aggregate",
  parameters: { resolution: { type: "expression", integer: true } },
  names(config, scope) {
    const title = (field) =>
      typeof field === "string" ? columnTitle(scope, field) : null;
    return {
      x: title(config.x),
      ...(config.y === undefined ? {} : { y: title(config.y) }),
    };
  },
  run(input, config, context) {
    return interpolateRows(input.scope, config, context);
  },
};
