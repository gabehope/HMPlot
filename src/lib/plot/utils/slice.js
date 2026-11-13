// @ts-check
import { runningMax, suffixMin } from "./numeric/scans.js";
import { numpy as np, jit, Array as JaxArray } from "@hmplot/jax";
import { asArray } from "./data.js";
import { groupRows } from "./grouping.js";
import {
  sameRows,
  columnChangeProof,
  categoryColumn,
  numericColumn,
  scalar,
  selectedIndices,
  compactIndices,
} from "./dataView.js";
import { deviceScalar, deviceArray } from "./deviceParams.js";
import { dropDimension, isCoordinate, sortedCoords } from "./gridModel.js";
import { coordinateColumn } from "./gridTable.js";
import { ownCacheEntry } from "./cacheEntries.js";
import { limitError } from "./limits.js";

/**
 * @typedef {import('./sliceTypes.js').SliceTopology} SliceTopology
 * @typedef {import('./sliceTypes.js').SliceConfig} SliceConfig
 * @typedef {import('./sliceTypes.js').SliceScope} SliceScope
 * @typedef {import('./transforms/transformTypes.js').TransformContext} TransformContext
 * @typedef {import('./dataViewTypes.js').DeviceColumn} DeviceColumn
 * @typedef {import('./dataViewTypes.js').DeviceDictionary} DeviceDictionary
 */
let nextTopology = 0;

/** Exact timestamps and the open intervals between them have distinct certificates.
 * Compare float32 time, matching the device scalar used by the bracket kernels.
 * @param {number[]} boundaries @param {number} at
 */
function timeInterval(boundaries, at) {
  at = Math.fround(at);
  let lo = 0,
    hi = boundaries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (boundaries[mid] < at) lo = mid + 1;
    else hi = mid;
  }
  return 2 * lo + Number(boundaries[lo] === at);
}

/**
 * Normalize a borrowed categorical column. The caller owns `codes`; the dictionary stays borrowed.
 * Grid slabs request int32 codes, while entity slices preserve an existing code array's dtype.
 * @param {import('./dataViewTypes.js').DictionaryColumn | import('./dataViewTypes.js').CategoryHostColumn} value
 * @param {boolean} integers
 */
function categoricalInput(value, integers) {
  if (Array.isArray(value)) {
    const categories = [...new Set(value.filter((v) => v != null))];
    const codes = np.array(
      value.map((v) => categories.indexOf(v)),
      integers ? { dtype: np.int32 } : undefined,
    );
    return { categories, codes };
  }
  // The category predicate admits only host arrays or a dictionary envelope.
  const dictionary =
    /** @type {import('./dataViewTypes.js').DictionaryColumn} */ (value);
  const codes = asArray(dictionary.codes);
  return {
    categories: dictionary.categories,
    codes: integers ? codes.astype(np.int32) : codes,
  };
}

// The per-step work, one jitted program per row count (TODO 17.14a). The time and the mask are
// arguments, so a new time or mask runs the same program. Run eagerly, these shifted passes cost
// O(rows^2) on the cpu backend (10 s at 4,000 rows; 16 ms jitted). Arguments are consumed.
/**
 * Each entity's bracketing positions in (entity, time) order: the last shown row at or before
 * `at` (a running maximum read at the entity's last position) and the first at or after it (a
 * suffix minimum read at its first). `shown` is 1 or 0 per sorted row.
 */
const brackets = jit(
  /** @param {JaxArray} sortedTime @param {JaxArray} shown @param {JaxArray} position @param {JaxArray} start @param {JaxArray} end @param {JaxArray} at */ (
    sortedTime,
    shown,
    position,
    start,
    end,
    at,
  ) => {
    const kept = shown.greater(0);
    const lo = np.take(
      runningMax(
        np.where(
          np.logicalAnd(sortedTime.ref.lessEqual(at.ref), kept.ref),
          position.ref,
          -Infinity,
        ),
      ),
      end,
      0,
    );
    const hi = np.take(
      suffixMin(
        np.where(
          np.logicalAnd(sortedTime.greaterEqual(at), kept),
          position,
          Infinity,
        ),
      ),
      start,
      0,
    );
    return [lo, hi];
  },
);
/** Each entity's first shown position in (entity, row) order, from the entity's first position. */
const firstShown = jit(
  /** @param {JaxArray} shown @param {JaxArray} position @param {JaxArray} start */ (
    shown,
    position,
    start,
  ) =>
    np.take(
      suffixMin(np.where(shown.greater(0), position, Infinity)),
      start,
      0,
    ),
);
/**
 * The span of times at which every entity with a shown, timed row is active (TODO 25.3): from
 * the latest of their first times to the earliest of their last times, each has a shown row at
 * or before the time and one at or after it (brackets finds both). [that latest first time,
 * that earliest last time, how many such entities]; missing (NaN) times do not count.
 */
const activeSpan = jit(
  /** @param {JaxArray} sortedTime @param {JaxArray} shown @param {JaxArray} position @param {JaxArray} start @param {JaxArray} end */ (
    sortedTime,
    shown,
    position,
    start,
    end,
  ) => {
    const n = sortedTime.shape[0];
    const timed = np.logicalAnd(
      shown.greater(0),
      np.logicalNot(np.isnan(sortedTime.ref)),
    );
    const first = np.take(
      suffixMin(np.where(timed.ref, position.ref, Infinity)),
      start,
      0,
    );
    const last = np.take(
      runningMax(np.where(timed, position, -Infinity)),
      end.ref,
      0,
    );
    const has = first.ref.lessEqual(end.astype(np.float32));
    const firstTime = np.take(
      sortedTime.ref,
      np.clip(first, 0, n - 1).astype(np.int32),
      0,
    );
    const lastTime = np.take(
      sortedTime,
      np.clip(last, 0, n - 1).astype(np.int32),
      0,
    );
    return np.stack([
      np.max(np.where(has.ref, firstTime, -Infinity)),
      np.min(np.where(has.ref, lastTime, Infinity)),
      np.sum(has.astype(np.float32)),
    ]);
  },
);
/**
 * The active span for `prepared`'s rows shown by `key` (a padded input's valid mask; null: every
 * row), read back once per topology and mask: a playing Slice's time changes every frame, its
 * input's mask only when a Filter runs.
 */
/** @param {SliceTopology} prepared @param {JaxArray | null} key @param {() => JaxArray} shown */
async function spanOf(prepared, key, shown) {
  if (prepared.span?.key === key) return prepared.span;
  const { groups, sortedTime, position, start, end } = prepared;
  let values = [-Infinity, Infinity, 0];
  if (groups.count && sortedTime.shape[0])
    values = Array.from(
      await activeSpan(
        sortedTime.ref,
        shown(),
        position.ref,
        start.ref,
        end.ref,
      ).data(),
      Number,
    );
  const [lo, hi, kept] = values;
  return (prepared.span = { key, lo, hi, kept });
}

/**
 * What a Slice reuses while only its time or its input's mask changes (the columns stay the same):
 * the rows in (entity, time) order, sorted once on the host (missing times last), the rows in
 * (entity, row) order for first appearances, each entity's run of positions in both orders, and
 * the runs of rows that share an entity and a time (allowed while at most one of them is shown).
 * `requireUnique` (no mask): such a run is an error at once.
 */
/** @param {import('./sliceTypes.js').SliceGroups} groups @param {JaxArray} time @param {number} n @param {boolean} requireUnique @returns {Promise<SliceTopology>} */
async function sliceTopology(groups, time, n, requireUnique) {
  // These inputs are normalized to int32 group ids and float32 time values.
  const codes = /** @type {Int32Array} */ (await groups.codes.ref.data()),
    times = /** @type {Float32Array} */ (await time.ref.data()),
    count = groups.count;
  /** @param {number} a @param {number} b */
  const byTime = (a, b) => {
    const x = times[a],
      y = times[b],
      nx = x !== x,
      ny = y !== y;
    return nx || ny ? Number(nx) - Number(ny) : x - y;
  };
  const rows = Int32Array.from({ length: n }, (_, i) => i);
  const perm = rows
    .slice()
    .sort((a, b) => codes[a] - codes[b] || byTime(a, b) || a - b);
  const byIndex = rows.slice().sort((a, b) => codes[a] - codes[b] || a - b);
  const start = new Int32Array(count),
    end = new Int32Array(count).fill(-1),
    runs = /** @type {[number[], number[]]} */ ([[], []]);
  for (let p = 0; p < n; p++) {
    const code = codes[perm[p]];
    if (code < 0 || code >= count) continue;
    if (end[code] < 0) start[code] = p;
    end[code] = p;
    if (
      p &&
      codes[perm[p - 1]] === code &&
      times[perm[p]] === times[perm[p - 1]]
    ) {
      if (runs[1].at(-1) === p) runs[1][runs[1].length - 1] = p + 1;
      else (runs[0].push(p - 1), runs[1].push(p + 1));
    }
  }
  if (requireUnique && runs[0].length)
    throw Error("Slice requires unique key/time combinations.");
  const permArray = deviceArray(perm, { dtype: "int32" });
  /** @type {SliceTopology} */
  const prepared = {
    groups,
    perm: permArray,
    byIndex: deviceArray(byIndex, { dtype: "int32" }),
    sortedTime: np.take(time.ref, permArray.ref, 0),
    start: deviceArray(start, { dtype: "int32" }),
    end: deviceArray(end, { dtype: "int32" }),
    position: np.arange(n).astype(np.float32),
    all: np.ones([n]),
    runs: runs[0].length
      ? {
          start: deviceArray(runs[0], { dtype: "int32" }),
          end: deviceArray(runs[1], { dtype: "int32" }),
        }
      : null,
    selection: null,
    token: ++nextTopology,
    keyToken: ++nextTopology,
    boundaries: [...new Set(times)]
      .filter((value) => !Number.isNaN(value))
      .sort((a, b) => a - b),
    keyColumns: {},
    dispose() {
      groups.dispose();
      for (const a of [
        this.perm,
        this.byIndex,
        this.sortedTime,
        this.start,
        this.end,
        this.position,
        this.all,
        this.runs?.start,
        this.runs?.end,
        this.entityOrder?.firsts,
        this.entityOrder?.order,
      ])
        a?.dispose();
      this.selection?.dispose();
      Object.values(this.keyColumns).forEach((v) =>
        (v instanceof JaxArray ? v : v.codes).dispose(),
      );
    },
  };
  return prepared;
}
/**
 * Slice's grid path (TODO 51 decision 4): over a grid table sliced through one of its
 * dimensions, the coordinates on either side of `at` are found on the host (a binary search) and
 * those two slabs blended on the GPU, O(cells) with no grouping or sort: one program per (shape,
 * dimension, field kind), `at` from buffers, so a Playback on it compiles nothing and reads
 * nothing back. The output is a grid table of the other dimensions. Outside the coordinates every
 * cell is hidden (decision 12); categories take the nearer step (t ≤ 0.5 the earlier); on a
 * padded input, a cell hidden at either step is hidden.
 */
/** @type {Map<string, (values: JaxArray, lo: JaxArray, hi: JaxArray, t: JaxArray) => JaxArray>} */
const GRID_SLICES = new Map();
/** @param {number} outer @param {number} size @param {number} inner @param {boolean} categorical @param {boolean} masked */
function gridSliceProgram(outer, size, inner, categorical, masked) {
  const key = JSON.stringify([outer, size, inner, categorical, masked]);
  let program = GRID_SLICES.get(key);
  if (!program) {
    if (GRID_SLICES.size >= 64)
      GRID_SLICES.delete(
        /** @type {string} */ (GRID_SLICES.keys().next().value),
      );
    /** @param {JaxArray} cube @param {JaxArray} at */
    const slab = (cube, at) =>
      np.take(cube, at.reshape([1]), 1).reshape([outer * inner]);
    program = jit((values, lo, hi, t) => {
      const cube = values.reshape([outer, size, inner]);
      const a = slab(cube.ref, lo),
        b = slab(cube, hi);
      if (masked) {
        // Validity (0 or 1): shown at the earlier step, and at the later one when it is used.
        const both = a.ref
          .greater(0)
          .astype(np.int32)
          .mul(np.where(t.ref.equal(0), 1, b.greater(0).astype(np.int32)));
        t.dispose();
        a.dispose();
        return both;
      }
      if (categorical) return np.where(t.lessEqual(0.5), a, b);
      return np.where(
        t.ref.equal(0),
        a.ref,
        a.mul(np.subtract(1, t.ref)).add(b.mul(t)),
      );
    });
    GRID_SLICES.set(key, program);
  }
  return program;
}

/** The grid path's slice of `scope` (see gridSliceProgram), or null when it does not apply. */
/** @param {SliceScope} scope @param {SliceConfig} config @param {string[]} keys @param {TransformContext} context */
async function sliceGrid(scope, config, keys, context) {
  const { signal, own } = context;
  const physical = scope.padded?.() ?? null,
    rows = physical ?? scope;
  const grid = physical ? physical.grid : scope.grid;
  const k = grid ? grid.dims.findIndex((dim) => dim.name === config.field) : -1;
  if (
    !grid ||
    k < 0 ||
    grid.dims.length < 2 ||
    !(grid.dims[k].coords instanceof Float64Array) ||
    (grid.coords2d && Object.hasOwn(grid.coords2d.columns, config.field))
  )
    return null;
  const others = grid.dims.filter((_, i) => i !== k).map((dim) => dim.name);
  if (
    keys.length &&
    (keys.length !== others.length ||
      !others.every((name) => keys.includes(name)))
  )
    return null;
  const dim = grid.dims[k],
    at = config.at ?? 0,
    n = dim.size;
  // The steps on either side of `at`, in the dimension's sorted order, as its rows.
  const sorted = sortedCoords(dim),
    ascending =
      n < 2 || Number(sorted[n - 1]) >= Number(sorted[0]) || dim.rotation;
  const position = /** @param {number} i */ (i) =>
      Number(sorted[ascending ? i : n - 1 - i]),
    row = /** @param {number} i */ (i) => {
      const at = ascending ? i : n - 1 - i;
      return dim.rotation ? (at + dim.rotation) % n : at;
    };
  let lo = 0,
    hi = 0,
    t = 0;
  const inside = at >= position(0) && at <= position(n - 1);
  if (inside) {
    let a = 0,
      b = n - 1;
    while (b - a > 1) {
      const mid = (a + b) >> 1;
      if (position(mid) <= at) a = mid;
      else b = mid;
    }
    if (position(a) === at || n === 1) {
      lo = hi = row(a);
    } else if (position(b) === at) {
      lo = hi = row(b);
    } else {
      lo = row(a);
      hi = row(b);
      t = (at - position(a)) / (position(b) - position(a));
    }
  }
  const next = /** @type {import("./dataViewTypes.js").GridModel} */ (
      dropDimension(grid, config.field)
    ),
    m = next.size;
  const outer = grid.dims.slice(0, k).reduce((a, d) => a * d.size, 1),
    inner = dim.stride;
  const fields =
    config.values ??
    scope
      .keys()
      .filter(
        (key) =>
          key !== config.field &&
          !isCoordinate(grid, key) &&
          !keys.includes(key),
      );
  const loAt = own(deviceScalar(lo, { dtype: "int32" })),
    hiAt = own(deviceScalar(hi, { dtype: "int32" })),
    tAt = own(deviceScalar(t));
  /** @type {Record<string, DeviceColumn>} */
  const columns = {};
  /** @type {Record<string, import('./dataViewTypes.js').ColumnMetadata>} */
  const columnMetadata = {};
  columns[config.field] = own(
    np.zeros([m], { dtype: np.float32 }).add(own(deviceScalar(at)).ref),
  );
  if (dim.metadata) columnMetadata[config.field] = dim.metadata;
  for (const field of fields) {
    if (!scope.has(field)) throw Error(`Missing Slice value column: ${field}`);
    const value = rows.get(field);
    const categorical = categoryColumn(value)
      ? categoricalInput(value, true)
      : null;
    const categories = categorical?.categories ?? null;
    const input = own(
      categorical ? categorical.codes : numericColumn(rows, field),
    );
    const out = own(
      gridSliceProgram(
        outer,
        n,
        inner,
        categorical !== null,
        false,
      )(input.ref, loAt.ref, hiAt.ref, tAt.ref),
    );
    columns[field] = categories ? { codes: out, categories } : out;
    const meta = rows.metadata?.(field);
    if (meta) columnMetadata[field] = meta;
  }
  // Hidden cells: outside the coordinates every one; over a padded input, those hidden at a step.
  let mask = null,
    count;
  if (!inside) {
    mask = own(np.zeros([m], { dtype: np.int32 }));
    count = 0;
  } else if (physical) {
    mask = own(
      gridSliceProgram(
        outer,
        n,
        inner,
        false,
        true,
      )(physical.valid.ref.astype(np.int32), loAt.ref, hiAt.ref, tAt.ref),
    );
    count = await scalar(np.sum(mask.ref));
  }
  if (signal?.aborted) {
    throw new DOMException("Canceled", "AbortError");
  }
  const lazyColumns = Object.fromEntries(
    next.dims.map((d) => [d.name, () => coordinateColumn(next, d.name)]),
  );
  return {
    columns,
    columnMetadata,
    grid: next,
    lazyColumns,
    ...(mask ? { valid: mask, count } : {}),
    provenance: { kind: "slice", fields: [...others, config.field] },
    view: {
      topology: `grid-slice:${JSON.stringify([grid.shape, k])}`,
      slice: {
        field: config.field,
        at,
        keys: others,
        grid: { lower: lo, upper: hi, t, inside },
      },
    },
  };
}

/** @param {SliceScope} scope @param {SliceConfig} config @param {TransformContext} context */
async function sliceRows(scope, config, context) {
  const { signal, maxBytes, cache, own } = context;
  const keys =
    config.by == null ? [] : Array.isArray(config.by) ? config.by : [config.by];
  if (!Number.isFinite(config.at ?? 0))
    throw Error("Slice value must be finite.");
  // A grid table sliced through a dimension (TODO 51): the grid path.
  const gridded = await sliceGrid(scope, config, keys, context);
  if (gridded) return gridded;
  // A padded input (utils/dataView.js, TODO 17.3): slice its physical rows, masked by the shown
  // ones. Its columns do not change as rows are hidden, so the grouping is reused. (A Filter's
  // bucket holds only the kept rows, gathered anew each run; the Slice never reads it, so the
  // entities and the output's length do not follow the selection.)
  const physical = scope.padded?.() ?? null,
    rows = physical ?? scope;
  const fields =
    config.values ??
    scope.keys().filter((k) => k !== config.field && !keys.includes(k));
  if (!scope.has(config.field))
    throw Error(`Missing slicing column: ${config.field}`);
  const n = rows.length;
  const check = () => {
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  };
  if (n * (fields.length + keys.length + 12) * 4 > maxBytes)
    throw limitError("storage", {
      component: "Slice",
      what: "its working memory",
      count: n * (fields.length + keys.length + 12) * 4,
      limit: maxBytes,
      hint: "Slice fewer rows or values columns.",
    });
  check();
  const time = own(numericColumn(rows, config.field));
  const shown = physical ? own(physical.valid.ref.greater(0)) : null;
  const identity = [...keys, config.field].flatMap((k) => [
    k,
    rows.get(k).codes ?? rows.get(k),
  ]);
  let prepared = /** @type {SliceTopology | undefined} */ (cache?.slice);
  const previousIdentity = prepared?.identity;
  if (
    !prepared ||
    !previousIdentity ||
    previousIdentity.length !== identity.length ||
    identity.some((v, i) => v !== previousIdentity[i])
  ) {
    const groups = keys.length
      ? await groupRows(rows, keys)
      : {
          count: n ? 1 : 0,
          codes: np.zeros([n], { dtype: np.int32 }),
          keys: {},
          dispose() {
            this.codes.dispose();
          },
        };
    try {
      prepared = await sliceTopology(groups, time, n, !shown);
    } catch (e) {
      groups.dispose();
      throw e;
    }
    prepared.identity = identity;
    if (cache) {
      /** @type {SliceTopology | undefined} */ (cache.slice)?.dispose();
      cache.slice = prepared;
      ownCacheEntry(
        cache,
        "slice",
        /** @param {SliceTopology} slice */ (slice) => slice.dispose(),
      );
    }
  }
  const topology = prepared;
  if (!cache) context.cleanup(() => topology.dispose());
  check();
  const maskKey = physical?.valid ?? null;
  if (shown && prepared.runs) {
    // Uniqueness depends on the topology and mask, never the requested time.
    // Retain the failed result too: the same invalid mask must keep failing.
    if (prepared.duplicateCheck?.key !== maskKey) {
      const sortedShown = own(
        np.take(shown.ref.astype(np.int32), prepared.perm.ref, 0),
      );
      const counts = own(
        np.concatenate([
          np.zeros([1], { dtype: np.int32 }),
          np.cumsum(sortedShown.ref, 0),
        ]),
      );
      const repeated = await scalar(
        np.sum(
          np
            .take(counts.ref, prepared.runs.end.ref, 0)
            .sub(np.take(counts.ref, prepared.runs.start.ref, 0))
            .greater(1)
            .astype(np.int32),
        ),
      );
      prepared.duplicateCheck = { key: maskKey, repeated };
    }
    if (prepared.duplicateCheck.repeated)
      throw Error("Slice requires unique key/time combinations.");
  }
  const groups = prepared.groups;
  const input = fields.map((field) => {
    if (!scope.has(field)) throw Error(`Missing Slice value column: ${field}`);
    const value = rows.get(field);
    const categorical = categoryColumn(value)
      ? categoricalInput(value, false)
      : null;
    return {
      field,
      categories: categorical?.categories ?? null,
      a: own(categorical ? categorical.codes : numericColumn(rows, field)),
    };
  });
  const at = config.at ?? 0,
    // The time follows a slider or the clock: it reaches the kernels from a buffer, so a new
    // time compiles nothing (TODO 17.1; a one-element array would be a literal).
    atScalar = own(deviceScalar(at));
  // Each entity's rows are one run of the (entity, time) order. The last shown row at or before
  // the time is a running maximum of positions read at the run's end; the first at or after it,
  // a running minimum read at its start. Work and memory follow the row count, however many
  // entities there are (TODO 17.14a: one [entities x rows] mask per batch took ~1 GB a step).
  const { perm, sortedTime, byIndex, start, end, position } = prepared;
  /** @param {JaxArray} order */
  const shownAs = (order) =>
    shown
      ? np.take(shown.ref.astype(np.float32), order.ref, 0)
      : topology.all.ref;
  const [lo, hi] = brackets(
    sortedTime.ref,
    shownAs(perm),
    position.ref,
    start.ref,
    end.ref,
    atScalar.ref,
  ).map(own);
  const valid = own(
    np.logicalAnd(
      lo.ref.greaterEqual(start.ref.astype(np.float32)),
      hi.ref.lessEqual(end.ref.astype(np.float32)),
    ),
  );
  // Inside the active span every entity with a shown, timed row is valid: the count is known,
  // and nothing is read back for it (TODO 25.3).
  const span = await spanOf(prepared, physical?.valid ?? null, () =>
    shownAs(perm),
  );
  const everyActive = at >= span.lo && at <= span.hi;
  const last = Math.max(0, n - 1);
  const loAt = own(np.clip(lo.ref, 0, last).astype(np.int32)),
    hiAt = own(np.clip(hi.ref, 0, last).astype(np.int32));
  const li = own(np.take(perm.ref, loAt.ref, 0)),
    ri = own(np.take(perm.ref, hiAt.ref, 0));
  const loTime = own(np.take(sortedTime.ref, loAt.ref, 0)),
    hiTime = own(np.take(sortedTime.ref, hiAt.ref, 0));
  const t = own(
    np.where(
      hiTime.ref.equal(loTime.ref),
      0,
      np.subtract(atScalar.ref, loTime.ref).div(hiTime.ref.sub(loTime.ref)),
    ),
  );
  // First appearance depends on topology and mask, never on time or values.
  let firsts, order;
  if (prepared.entityOrder?.key === maskKey) {
    firsts = own(prepared.entityOrder.firsts.ref);
    order = own(prepared.entityOrder.order.ref);
  } else {
    const firstAt = own(firstShown(shownAs(byIndex), position.ref, start.ref));
    firsts = own(
      np.where(
        firstAt.ref.lessEqual(end.ref.astype(np.float32)),
        np.take(byIndex.ref, np.clip(firstAt.ref, 0, last).astype(np.int32), 0),
        n,
      ),
    );
    order = own(np.argsort(firsts.ref));
    prepared.entityOrder?.firsts.dispose();
    prepared.entityOrder?.order.dispose();
    prepared.entityOrder = {
      key: maskKey,
      firsts: firsts.ref,
      order: order.ref,
    };
  }
  const parts = input.map((v) => {
    const a = np.take(v.a.ref, li.ref, 0),
      b = np.take(v.a.ref, ri.ref, 0);
    const result = v.categories
      ? np.where(t.ref.lessEqual(0.5), a, b)
      : np.where(
          t.ref.equal(0),
          a.ref,
          a.ref.mul(np.subtract(1, t.ref)).add(b.ref.mul(t.ref)),
        );
    if (!v.categories) {
      a.dispose();
      b.dispose();
    }
    return own(result);
  });
  check();
  /**
   * Assemble one non-grid Slice result. `selection` indexes the entity arrays;
   * a padded result includes every entity and carries its active membership in
   * `mask`, while a compact result selects only active entities. The result
   * takes ownership of the mask and releases this run's arrays on disposal.
   */
  /** @param {import('./sliceTypes.js').SliceSelection} output */
  const buildResult = ({ selection, mask = null, count = undefined }) => {
    const padded = mask !== null;
    /** @type {Record<string, DeviceColumn>} */
    const columns = {};
    for (const [key, value] of Object.entries(groups.keys)) {
      let column;
      if (padded) {
        column = own(np.take(asArray(value.codes ?? value), selection.ref, 0));
      } else {
        if (!topology.keyColumns[key]) {
          const array = np.take(
            asArray(value.codes ?? value),
            selection.ref,
            0,
          );
          topology.keyColumns[key] = value.categories
            ? { codes: array, categories: value.categories }
            : array;
        }
        const cached = topology.keyColumns[key];
        column = own((cached instanceof JaxArray ? cached : cached.codes).ref);
      }
      columns[key] = value.categories
        ? { codes: column, categories: value.categories }
        : column;
    }
    columns[config.field] = own(
      np.ones([selection.shape[0]]).mul(atScalar.ref),
    );
    for (const [index, value] of input.entries()) {
      const column = own(np.take(parts[index].ref, selection.ref, 0));
      columns[value.field] = value.categories
        ? { codes: column, categories: value.categories }
        : column;
    }
    const sourceIndices = rows.sourceIndices?.();
    if (sourceIndices) own(sourceIndices);
    /** @param {JaxArray} indices */
    const endpoint = (indices) => {
      const selected = own(np.take(indices.ref, selection.ref, 0));
      return sourceIndices
        ? own(np.take(sourceIndices.ref, selected.ref.astype(np.int32), 0))
        : selected;
    };
    const lower = endpoint(li),
      upper = endpoint(ri);
    /** @param {number} index */
    const pick = (index) =>
      np.stack(
        [lower, upper].map((array) =>
          np.take(array.ref, deviceScalar(index, { dtype: "int32" }), 0),
        ),
      );
    const provenance = {
      kind: "slice",
      fields: [...keys, config.field],
      contributors: pick,
      /** @param {number} index */
      async describe(index) {
        return { endpoints: Array.from(await pick(index).data(), Number) };
      },
    };
    // An unchanged entity order alone cannot certify endpoint provenance or validity.
    // No time boundary crossed + the same physical rows and mask certifies all three.
    // Unknown row mappings conservatively miss; no device comparison/readback is added.
    const interval = timeInterval(topology.boundaries, at);
    const previous = topology.publication;
    // Transparent snapshots get a fresh view version; their captured source version
    // is the relevant witness. sameRows still checks selections and row mappings.
    const version =
      columnChangeProof(rows.physical && rows.parent ? rows.parent : rows, [])
        ?.version ?? rows.version;
    const sameMembership =
      previous &&
      previous.mask === maskKey &&
      previous.padded === padded &&
      previous.version === version &&
      previous.sourceTopology === rows.topology &&
      sameRows(previous.rows, rows);
    if (!sameMembership) topology.keyToken = ++nextTopology;
    if (!sameMembership || previous.interval !== interval)
      topology.token = ++nextTopology;
    topology.publication = {
      rows,
      version,
      sourceTopology: rows.topology,
      mask: maskKey,
      interval,
      padded,
    };
    const columnIdentities = Object.fromEntries(
      keys.map((key) => [
        key,
        { source: topology, selection: topology.keyToken, key },
      ]),
    );
    check();
    return {
      columns,
      provenance,
      ...(mask ? { valid: mask, count } : {}),
      view: {
        topology: topology.token,
        columnIdentities,
        slice: { field: config.field, at, keys, lower, upper },
      },
    };
  };
  if (shown) {
    // Keep one physical row per entity, hiding those inactive at this time.
    const mask = own(np.take(valid.ref, order.ref, 0).astype(np.int32));
    const count = everyActive ? span.kept : await scalar(np.sum(mask.ref));
    return buildResult({ selection: order, mask, count });
  }
  let selected;
  if (everyActive && prepared.selection && prepared.selectionSpan === span) {
    // Every entity with a timed row is active, as in the last run: the same selection, with
    // no count or comparison to read back (TODO 25.3).
    selected = own(prepared.selection.ref);
  } else {
    const orderedValid = own(np.take(valid.ref, order.ref, 0)),
      kept = own(
        everyActive
          ? compactIndices(orderedValid, span.kept)
          : await selectedIndices(orderedValid),
      );
    selected = own(np.take(order.ref, kept.ref, 0));
    if (
      prepared.selection?.shape[0] !== selected.shape[0] ||
      (selected.shape[0] &&
        (await scalar(
          np.sum(
            prepared.selection.ref.notEqual(selected.ref).astype(np.int32),
          ),
        )))
    ) {
      prepared.selection?.dispose();
      prepared.selection = selected.ref;
      prepared.token = ++nextTopology;
      prepared.keyToken = ++nextTopology;
      Object.values(prepared.keyColumns).forEach((v) =>
        (v instanceof JaxArray ? v : v.codes).dispose(),
      );
      prepared.keyColumns = {};
    } else if (!prepared.selection) {
      prepared.selection = selected.ref;
    }
    prepared.selectionSpan = everyActive ? span : null;
  }
  return buildResult({ selection: selected });
}

/** Slice keeps physical entity/grid rows; a filter bucket must not replace its topology. */
/** @type {import("./transforms/transformTypes.js").TransformDefinition} */
export const slice = {
  reads: "rows",
  buckets: () => false,
  output: "aggregate",
  run(input, config, context) {
    return sliceRows(
      /** @type {SliceScope} */ (input.source),
      /** @type {SliceConfig} */ (config),
      context,
    );
  },
};
