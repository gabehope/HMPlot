import { axisCategory } from "./categorical.js";
import { Array as JaxArray } from "@hmplot/jax";
import {
  runTransform,
  binCountFromRule,
  resolveTransformParameters,
  disposeTransformCache,
  transformSharedBins,
} from "./transforms.js";
import { valuesGiven, alignedValues } from "./transforms/runner.js";
import { dataBufferLimit, finiteExtents } from "./dataView.js";
import { automaticInterval, calendarEdges, timeInterval } from "./datetime.js";
import { asArray, shapeOf } from "./data.js";
import { createDataScope } from "./categorical.js";
import { isExpression, expressionFields } from "./expressions.js";
import { numpy as np } from "@hmplot/jax";
import { rectangleDomainArrays } from "./rectangles.js";
import { prepareChannels } from "./namedData.js";
import { numericExtent } from "./scaleBindings.js";
import { axisColumnIdentities } from "./axisColumns.js";
import { limitError } from "./limits.js";

function frameKey(options) {
  for (let node = options; node; node = node.defaults)
    if (node.axisFrameKey !== undefined)
      return node.facetFrameKey ?? node.axisFrameKey;
}
const VALUE_FIELDS = new Set(["x", "y", "z", "weight", "field"]);
export function createFacetEngine(cells, onDomains) {
  const cancel = new AbortController(),
    bins = new Map(),
    definitions = new Map(),
    pipelineCache = new Map(),
    scaleExtents = new Map(),
    ownedViews = new Set(),
    transformCaches = new Map();
  let queue = Promise.resolve(),
    generation = 0,
    nextIdentity = 0;
  const identities = new WeakMap();
  // Device arrays, typed arrays and a field's plain array of values (TODO 130.1) key by
  // identity: stringifying a column's worth of numbers would cost more than the cache saves.
  const cacheKey = (value) =>
    JSON.stringify(value, (key, v) => {
      if (v instanceof JaxArray || ArrayBuffer.isView(v) ||
          (Array.isArray(v) && VALUE_FIELDS.has(key) && valuesGiven(v))) {
        if (!identities.has(v)) identities.set(v, ++nextIdentity);
        return { gpuColumn: identities.get(v) };
      }
      return v;
    });
  // Pipeline prefixes per cell are shared by every user that runs them: a mark definition
  // ("define:<slot>"), or "shared" (scale extents, cell transforms, shared bins). A
  // redefinition releases only the prefixes its new pipeline no longer runs (TODO 29.11: an
  // animated Slice after a Filter reran the Filter in every cell every frame); a prefix no one
  // holds is disposed.
  const userKeys = new Map();
  function hold(user, key) {
    pipelineCache.get(key)?.users.add(user);
    if (!userKeys.has(user)) userKeys.set(user, new Set());
    userKeys.get(user).add(key);
  }
  function release(user, keep = new Set()) {
    const keys = userKeys.get(user);
    if (!keys) return;
    for (const key of [...keys]) {
      if (keep.has(key)) continue;
      keys.delete(key);
      const entry = pipelineCache.get(key);
      if (!entry) continue;
      entry.users.delete(user);
      if (entry.users.size) continue;
      pipelineCache.delete(key);
      entry.pending.then(
        (view) => {
          ownedViews.delete(view);
          view.dispose();
        },
        () => {},
      );
    }
  }
  async function preparedCell(
    cell,
    pipeline,
    signal,
    user = "shared",
    used = null,
  ) {
    const releaseRoot = cell.view.retain();
    let scope = cell.view;
    try {
      for (let index = 0; index < pipeline.length; index++) {
        if (signal.aborted) throw new DOMException("Canceled", "AbortError");
        const prefix = pipeline.slice(0, index + 1),
          key = cacheKey([cell.key, prefix]);
        let pending = pipelineCache.get(key)?.pending;
        if (!pending) {
          const { kind, config } = pipeline[index];
          const releaseInput = scope.retain();
          const cacheId = cell.key + ":" + index + ":" + kind;
          if (!transformCaches.has(cacheId)) transformCaches.set(cacheId, {});
          pending = runTransform(kind, scope, config, {
            signal,
            cache: transformCaches.get(cacheId),
          })
            .finally(releaseInput)
            .then((view) => {
              if (signal.aborted) {
                view.dispose();
                throw new DOMException("Canceled", "AbortError");
              }
              ownedViews.add(view);
              return view;
            });
          pipelineCache.set(key, { pending, users: new Set() });
          pending.catch(() => {
            if (pipelineCache.get(key)?.pending === pending)
              pipelineCache.delete(key);
          });
        }
        hold(user, key);
        used?.add(key);
        scope = await pending;
      }
      const release = scope.retain?.();
      return { scope, dispose: () => release?.() };
    } finally {
      releaseRoot();
    }
  }
  // The rows of every cell after `pipeline`, as one scope holding only the columns named:
  // the rule columns and the fields the expressions read. Numeric columns concatenate on the
  // GPU; dictionary columns concatenate their codes (cells of one table share categories).
  async function unionOfCells(pipeline, signal, { rules, expressions }) {
    const fields = new Set(rules);
    for (const expression of expressions) expressionFields(expression, fields);
    const parts = Object.fromEntries([...fields].map((field) => [field, []]));
    const owned = [],
      columns = {};
    const release = (piece) => (piece.codes ?? piece.array)?.dispose();
    try {
      for (const cell of cells) {
        if (signal.aborted) throw new DOMException("Canceled", "AbortError");
        const prepared = await preparedCell(cell, pipeline, signal);
        try {
          if (!prepared.scope.length) continue;
          for (const field of fields) {
            if (!prepared.scope.has(field))
              throw Error(
                `Shared bins: missing field ${JSON.stringify(field)} in a facet cell.`,
              );
            const value = prepared.scope.resolve(field);
            parts[field].push(
              value?.codes
                ? { codes: asArray(value.codes), categories: value.categories }
                : Array.isArray(value) &&
                    value.some(
                      (v) => typeof v === "string" || typeof v === "boolean",
                    )
                  ? { host: value }
                  : { array: asArray(value) },
            );
          }
        } finally {
          prepared.dispose();
        }
      }
      for (const [field, pieces] of Object.entries(parts)) {
        if (!pieces.length) columns[field] = own(np.zeros([0]));
        else if (pieces.every((piece) => piece.host))
          columns[field] = pieces.flatMap((piece) => piece.host);
        else if (pieces.every((piece) => piece.codes)) {
          const categories = pieces[0].categories;
          if (
            pieces.some(
              (piece) =>
                JSON.stringify(piece.categories) !== JSON.stringify(categories),
            )
          )
            throw Error(
              `Shared bins: facet cells disagree on the categories of ${JSON.stringify(field)}.`,
            );
          columns[field] = {
            codes: own(np.concatenate(pieces.map((piece) => piece.codes.ref))),
            categories,
          };
        } else if (pieces.every((piece) => piece.array))
          columns[field] = own(
            np.concatenate(pieces.map((piece) => piece.array.ref)),
          );
        else
          throw Error(
            `Shared bins: facet cells disagree on the type of ${JSON.stringify(field)}.`,
          );
      }
    } catch (error) {
      owned.forEach((item) => item.dispose());
      throw error;
    } finally {
      Object.values(parts).flat().forEach(release);
    }
    // A data scope borrows its columns (dispose() does not free them), so `owned` holds the
    // only reference and frees it after the scope.
    const scope = createDataScope();
    const dispose = () => {
      scope.dispose();
      owned.forEach((item) => item.dispose());
    };
    try {
      scope.update(columns);
    } catch (error) {
      dispose();
      throw error;
    }
    return { scope, columns, dispose };
    function own(value) {
      owned.push(value);
      return value;
    }
  }
  const schedule = (fn) => {
    const work = queue.then(() => {
      if (cancel.signal.aborted)
        throw new DOMException("Canceled", "AbortError");
      return fn(cancel.signal);
    });
    queue = work.catch(() => {});
    return work;
  };
  return {
    scaleExtent(pipeline, field, transform = "linear") {
      const key = cacheKey([pipeline, field, transform]);
      if (scaleExtents.has(key)) return scaleExtents.get(key);
      const work = schedule(async (signal) => {
        const bounds = [];
        for (const cell of cells) {
          if (signal.aborted) throw new DOMException("Canceled", "AbortError");
          const prepared = await preparedCell(cell, pipeline, signal);
          try {
            if (!prepared.scope.has(field))
              throw Error(`Missing facet scale field: ${field}`);
            const extent = await numericExtent(
              prepared.scope.get(field),
              transform,
              signal,
            );
            if (extent) bounds.push(extent);
          } finally {
            prepared.dispose();
          }
        }
        return bounds.length
          ? [
              Math.min(...bounds.map((entry) => entry[0])),
              Math.max(...bounds.map((entry) => entry[1])),
            ]
          : null;
      });
      scaleExtents.set(key, work);
      work.catch(() => scaleExtents.delete(key));
      return work;
    },
    transform(cell, kind, scope, config) {
      return schedule(async (signal) => {
        const prepared = await preparedCell(
          cell,
          [...(scope.pipeline ?? []), { kind, config }],
          signal,
        );
        return prepared.scope;
      });
    },
    bins(slot, kind, scope, config) {
      const plan = transformSharedBins(kind, config);
      if (!plan) return Promise.resolve(config);
      const key = cacheKey([slot, kind, scope.pipeline, config]);
      if (bins.has(key)) return bins.get(key);
      const pending = schedule(async (signal) => {
        const axes = plan.axes,
          domains = Object.fromEntries(axes.map((a) => [a, []])),
          // A datetime axis's metadata (every cell reads the same table): its bins are calendar
          // edges over the union (TODO 53.2).
          times = {};
        for (const cell of cells) {
          if (signal.aborted) throw new DOMException("Canceled", "AbortError");
          const prepared = await preparedCell(
            cell,
            scope.pipeline ?? [],
            signal,
          );
          try {
            for (const axis of axes) {
              const metadata = typeof config[axis] === "string" ? prepared.scope.metadata?.(config[axis]) : null;
              if (plan.calendar && metadata?.type === "datetime" && Number.isFinite(metadata.origin)) times[axis] ??= metadata;
            }
            if (prepared.scope.length) {
              // Every axis's extent in one readback (TODO 29.3).
              const arrays = [];
              try {
                for (const axis of axes)
                  arrays.push(valuesGiven(config[axis])
                    ? alignedValues(config[axis], prepared.scope)
                    : asArray(prepared.scope.resolve(config[axis])));
                const found = await finiteExtents(arrays);
                axes.forEach((axis, k) => domains[axis].push(found[k]));
              } finally {
                arrays.forEach((a) => a.dispose());
              }
            }
          } finally {
            prepared.dispose();
          }
        }
        // Shared bins mean one edge set for every cell, so a rule name or an expression
        // count is resolved ONCE, over the union of the cells' rows (the rows the shared
        // bounds come from), not per cell against that cell's rows.
        const perAxis =
          config.bins &&
          typeof config.bins === "object" &&
          !Array.isArray(config.bins) &&
          !isExpression(config.bins)
            ? config.bins
            : null;
        const options = Object.fromEntries(
          axes.map((axis) => [axis, perAxis ? perAxis[axis] : config.bins]),
        );
        const needsUnion = Object.values(options).some(
          (option) => typeof option === "string" || isExpression(option),
        );
        // The binned columns always go in, so count() of the union is its row count.
        const union = needsUnion
          ? await unionOfCells(scope.pipeline ?? [], signal, {
              rules: axes
                .map((axis) => config[axis])
                .filter((field) => typeof field === "string"),
              expressions: Object.values(options).filter(isExpression),
            })
          : null;
        const raw = {};
        try {
          for (const axis of axes) {
            const all = domains[axis];
            raw[axis] = [
              all.length ? Math.min(...all.map((b) => b[0])) : 0,
              all.length ? Math.max(...all.map((b) => b[1])) : 1,
            ];
          }
          if (union) {
            const resolved = await resolveTransformParameters(
              kind,
              {
                bins: perAxis ? { ...perAxis } : config.bins,
                __viewState: config.__viewState,
              },
              union.scope,
            );
            for (const axis of axes) {
              const option = perAxis ? resolved.bins[axis] : resolved.bins;
              options[axis] =
                typeof option === "string"
                  ? await binCountFromRule(
                      option,
                      union.columns[config[axis]],
                      raw[axis][0],
                      raw[axis][1],
                    )
                  : option;
            }
          }
        } finally {
          union?.dispose();
        }
        const bounds = {};
        for (const axis of axes) {
          let [a, b] = raw[axis];
          if (a === b) {
            a -= 0.5;
            b += 0.5;
          }
          bounds[axis] = [a, b];
        }
        if (plan.finish) return plan.finish({ bounds, counts: options });
        const result = {};
        const pick = (value, axis) => (value !== null && typeof value === "object" && !Array.isArray(value) ? value[axis] : value);
        for (const axis of axes) {
          const option = options[axis];
          if (Array.isArray(option)) result[axis] = option;
          else if (times[axis]) {
            const origin = times[axis].origin, [a, b] = raw[axis];
            const n = option ?? 30;
            const interval = timeInterval(pick(config.interval, axis)) ?? automaticInterval(Math.max(b - a, 1), n);
            result[axis] = calendarEdges(origin + a, origin + b, interval,
              pick(config.tz, axis) ?? times[axis].timezone ?? "UTC", Math.floor(dataBufferLimit() / 32)).map((edge) => edge - origin);
          } else {
            const n = option ?? 30;
            if (!Number.isInteger(n) || n < 1)
              throw Error(
                "Bin count must be a positive integer, a rule name, or explicit edges.",
              );
            if ((n + 1) * 4 > dataBufferLimit())
              throw limitError("storage", {
                component: kind,
                what: "its shared edge list",
                count: (n + 1) * 4,
                limit: dataBufferLimit(),
                hint: "Use fewer bins.",
                property: "bins",
              });
            result[axis] = Array.from(
              { length: n + 1 },
              (_, i) =>
                bounds[axis][0] + ((bounds[axis][1] - bounds[axis][0]) * i) / n,
            );
          }
        }
        // Calendar edges replace an interval: Bin takes explicit edges or an interval, not both.
        return { ...config, bins: result, ...(Object.keys(times).length ? { interval: undefined } : {}) };
      });
      bins.set(key, pending);
      pending.catch(() => bins.delete(key));
      return pending;
    },
    define(slot, kind, props, pipeline, options) {
      const selected = Object.fromEntries(
        [
          "position",
          "x",
          "y",
          "z",
          "x0",
          "x1",
          "y0",
          "y1",
          "z0",
          "z1",
          "lower",
          "upper",
          "baseline",
          "width",
          "depth",
          "rotation",
          "shape",
          "axis",
        ]
          .filter((k) => props[k] !== undefined)
          .map((k) => [k, props[k]]),
      );
      // Prop references and resolved pipeline configurations identify a repeated definition.
      const settings = Object.fromEntries(
        ["coordinates", "xTransform", "yTransform", "zTransform"].map((k) => [
          k,
          options.get(k),
        ]),
      );
      const axes = Object.fromEntries(
        [..."xyz"].map((a) => [a, axisCategory(options, a)]),
      );
      // A cell's preparation computes its domains only: what it derives for the frame (a time
      // column's axis settings, a band axis) belongs to the plot, which binds them itself, so
      // prepareChannels' frame bindings are dropped (TODO 136.12), except a band scale a cell
      // makes, which the cells after it encode against.
      const optionSnapshot = {
        categoryAxes: axes,
        get: (key) => settings[key],
      };
      const key = cacheKey([
        kind,
        selected,
        pipeline,
        settings,
        Object.values(axes).map((s) => s?.domain),
      ]);
      if (definitions.get(slot)?.key === key)
        return definitions.get(slot).pending;
      const replace = definitions.has(slot);
      const version = ++generation;
      const pending = schedule(async (signal) => {
        if (definitions.get(slot)?.version !== version) return;
        const user = "define:" + slot,
          used = new Set();
        // Shared prefixes are dropped as every prefix was before; this slot's are kept where
        // its new pipeline runs them again.
        if (replace) release("shared");
        const results = [];
        for (const cell of cells) {
          if (definitions.get(slot)?.version !== version) return;
          if (signal.aborted) throw new DOMException("Canceled", "AbortError");
          const prepared = await preparedCell(
            cell,
            pipeline ?? [],
            signal,
            user,
            used,
          );
          let mark;
          try {
            // Cell domains are computed once, so @time channels contribute their t = 0 extent.
            mark = prepareChannels(
              selected,
              prepared.scope,
              optionSnapshot,
              kind,
              { auto: {}, hidden: {} },
              undefined,
              {},
              { time: 0 },
            );
            Object.assign(axes, mark.frameBindings.categoryAxes);
            const bounds = {};
            const box = ["Rect", "Prism"].includes(kind)
              ? rectangleDomainArrays(kind, mark.props)
              : null;
            try {
              for (const [i, axis] of [..."xyz"].entries()) {
                if (selected[axis + "bounds"] !== undefined) continue;
                const p = mark.props,
                  arrays = box
                    ? [box.lower.ref.slice([], i), box.upper.ref.slice([], i)]
                    : p.position !== undefined &&
                        shapeOf(p.position).length === 2 &&
                        shapeOf(p.position)[1] > i
                      ? [asArray(p.position).slice([], i)]
                      : [
                          p[axis],
                          p[axis + "0"],
                          p[axis + "1"],
                          ...(axis === "y"
                            ? [p.lower, p.upper, p.baseline]
                            : []),
                        ]
                          .filter((v) => v !== undefined)
                          .map((v) => asArray(typeof v === "number" ? [v] : v));
                if (arrays.length && prepared.scope.length) {
                  try {
                    const extents = await finiteExtents(arrays); // one readback (TODO 29.3)
                    bounds[axis] = [
                      Math.min(...extents.map((b) => b[0])),
                      Math.max(...extents.map((b) => b[1])),
                    ];
                  } finally {
                    arrays.forEach((a) => a.dispose());
                  }
                } else arrays.forEach((a) => a.dispose());
              }
            } finally {
              if (box) Object.values(box).forEach((a) => a.dispose());
            }
            // The columns each axis plots in this cell, for scales="field" (TODO 21 F3).
            results.push({ cell: cell.key, bounds, columns: axisColumnIdentities(prepared.scope, kind, selected) });
          } finally {
            mark?.dispose();
            prepared.dispose();
          }
        }
        if (definitions.get(slot)?.version === version) release(user, used);
        if (!signal.aborted && definitions.get(slot)?.version === version)
          onDomains(
            slot,
            results.map((r) => ({
              ...r,
              bounds: Object.fromEntries(
                Object.entries(r.bounds).map(([a, b]) => [
                  frameKey(options) !== undefined
                    ? frameKey(options) + ":" + a
                    : a,
                  b,
                ]),
              ),
              // The columns each axis plots, keyed like the bounds (scales="field", TODO 21).
              columns: Object.fromEntries(
                Object.entries(r.columns).map(([a, c]) => [
                  frameKey(options) !== undefined
                    ? frameKey(options) + ":" + a
                    : a,
                  c,
                ]),
              ),
            })),
          );
      });
      definitions.set(slot, { key, version, pending });
      return pending;
    },
    whenSettled: () => queue,
    dispose() {
      cancel.abort();
      queue.finally(() => {
        for (const cache of transformCaches.values()) {
          disposeTransformCache(cache);
        }
        transformCaches.clear();
      });
      bins.clear();
      definitions.clear();
      pipelineCache.clear();
      userKeys.clear();
      scaleExtents.clear();
      ownedViews.forEach((view) => view.dispose());
      ownedViews.clear();
    },
  };
}
