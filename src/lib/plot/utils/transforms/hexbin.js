import { numpy as np } from "@hmplot/jax";
import { planProgram } from "../programs.js";
import {
  createDataView,
  numericColumn,
  finiteExtents,
  selectedIndices,
  scalar,
} from "../dataView.js";
import { deviceParams, deviceArray } from "../deviceParams.js";
import { hexGrid, hexTotals, hexExtent, HEX_GRID_REDUCERS } from "../hexbin.js";
import { categoryColumn } from "../dataView.js";
import { plainReduction, removedReduce } from "./group.js";
import { groupColumns } from "./groupColumns.js";
import { fieldTitle } from "./common.js";
import { parameterExpressions } from "./dependencies.js";

/** The columns a Hexbin writes itself, which its columns cannot replace. */
const HEX_OUTPUTS = ["count", "x", "y", "width", "depth", "rotation"];

/**
 * The fixed grid's reducers ({name: {op, field}}) when every column is a count, sum or mean of a
 * numeric column (the grid's one-pass totals), else null: the grouped path computes any column.
 */
function gridReducers(scope, columns = {}) {
  const reducers = {};
  for (const [name, value] of Object.entries(columns)) {
    const spec = plainReduction(value);
    if (
      !spec ||
      !HEX_GRID_REDUCERS.includes(spec.op) ||
      (spec.field !== undefined && categoryColumn(scope.resolve(spec.field)))
    )
      return null;
    reducers[name] = spec;
  }
  return reducers;
}

/**
 * Hexbin: a row per hexagonal cell of x and y with its count and `columns` (reduction
 * expressions, as Group's: {mean_v: mean("v")}) over the visible rows in it, and each cell's
 * center, width, depth and rotation for a Prism.
 */
export const hexbin = {
  sharedBins: (config) => config.radius !== undefined ? null : ({
    axes: ["x", "y"],
    finish: ({ bounds, counts }) => ({
      ...config, bins: counts.x ?? 30,
      radius: (bounds.x[1] - bounds.x[0]) / ((config.orientation === "flat" ? 1.5 : Math.sqrt(3)) * (counts.x ?? 30)),
    }),
  }),
  domainFields: (settings) => ({ x: settings.x, y: settings.y }),
  // Its expression parameters, evaluated before it runs (TODO 138.2).
  parameters: { bins: { type: "expression", integer: true }, radius: { type: "expression" } },
  reads: "rows",
  output: "aggregate",
  // A cell count or radius from an expression, and its columns (dependencies.js). Its x and y
  // are not declared: a Hexbin of an "@" column follows its input only.
  dependencies: (settings) => ({
    expressions: [
      ...parameterExpressions(settings.bins),
      ...parameterExpressions(settings.radius),
      ...Object.values(settings.columns ?? {}),
    ],
  }),
  // Cell centers are the binned x and y.
  names: (config, source) => ({ x: fieldTitle(source, config.x), y: fieldTitle(source, config.y) }),
  validate(config) {
    removedReduce(
      "Hexbin",
      config,
      'columns={{ mean_v: mean("v") }}',
      'columns={"mean_v": hm.mean("v")}',
    );
    if (config.columns !== undefined)
      groupColumns(config.columns, "Hexbin", [], HEX_OUTPUTS);
    if (!["pointy", "flat"].includes(config.orientation ?? "pointy"))
      throw Error("Hexbin orientation must be pointy or flat.");
    const cells = config.bins ?? 30;
    if (!Number.isInteger(cells) || cells < 1)
      throw Error("Hexbin bins must be a positive integer.");
  },
  run(input, config, context) {
    const reducers = config.bounds ? gridReducers(input.scope, config.columns) : null;
    return reducers
      ? fixedGrid(input, config, reducers, context)
      : groupedCells(input, config, context);
  },
};

/**
 * A fixed grid over `extent` (utils/hexbin.js, TODO 17.14d): a row per cell, the occupied ones
 * visible, so which rows a Filter keeps changes no length and compiles nothing.
 */
async function fixedGrid(input, config, reduce, { own }) {
  const columns = {};
  // A fixed grid over `extent` (utils/hexbin.js, TODO 17.14d): a row per cell, the occupied
  // ones valid, so which rows a Filter keeps changes no length and compiles nothing.
  const extent = hexExtent(config.bounds),
    orientation = config.orientation ?? "pointy",
    cells = config.bins ?? 30;
  const radius =
    config.radius ??
    (extent.x[1] - extent.x[0]) /
      ((orientation === "flat" ? 1.5 : Math.sqrt(3)) * cells);
  if (!Number.isFinite(radius) || radius <= 0)
    throw Error("Hexbin radius must be finite and positive.");
  const grid = hexGrid(extent, radius, orientation);
  const reducers = { count: { op: "count" }, ...reduce };
  const plan = {
    orientation,
    hidden: Boolean(input.valid),
    count: grid.count,
    rows: grid.rows,
    reducers: Object.entries(reducers).map(([key, spec]) => [key, spec.op]),
  };
  // The numbers that follow the extent come from one buffer: another extent of the same grid
  // shape compiles nothing.
  const out = hexProgram(plan)({
    x: numericColumn(input.scope, config.x),
    y: numericColumn(input.scope, config.y),
    ...(input.valid ? { valid: input.valid.ref } : {}),
    fields: Object.fromEntries(
      Object.entries(reducers)
        .filter(([, spec]) => spec.op !== "count")
        .map(([key, spec]) => [key, numericColumn(input.scope, spec.field)]),
    ),
    params: deviceArray([
      Math.sqrt(3) * radius,
      3 * radius,
      2 / (3 * radius),
      1.5 * radius,
      2 * radius,
      grid.qMin,
      grid.rMin,
      extent.x[0],
      extent.x[1],
      extent.y[0],
      extent.y[1],
    ]),
  });
  for (const [key, column] of Object.entries(out.columns))
    columns[key] = own(column);
  const provenance = {
    kind: "hexbin",
    codes: own(out.codes),
    fields: ["x", "y", "count"],
    ...(input.valid ? { rows: input.scope } : {}),
  };
  // The occupied cells are visible (the runner reads their count), as in a padded Group.
  return { columns, provenance, valid: own(out.shown) };
}

/**
 * fixedGrid's device work for a plan ({ orientation, hidden, count and rows of the grid,
 * reducers: [[key, op]] }), one compiled program per plan (TODO 33.3). `inputs.params` is
 * [sqrt(3) r, 3r, 2 / 3r, 1.5r, 2r, qMin, rMin, x0, x1, y0, y1]. Consumes `inputs`.
 */
function hexKernel(plan, { x, y, valid, fields, params }) {
  const { orientation, count, rows } = plan;
  const p = (i) => params.ref.slice(i);
  const [rootThreeR, threeR, twoOverThreeR, oneAndHalfR, twoR, qMin, rMin] = [
    0, 1, 2, 3, 4, 5, 6,
  ].map(p);
  // Each row's cell, rounded as in the grouped path below.
  const q =
    orientation === "pointy"
      ? x.ref.div(rootThreeR.ref).sub(y.ref.div(threeR.ref))
      : x.ref.mul(twoOverThreeR.ref);
  const r =
    orientation === "pointy"
      ? y.ref.mul(twoOverThreeR.ref)
      : y.ref.div(rootThreeR.ref).sub(x.ref.div(threeR.ref));
  const third = q.ref.add(r.ref).neg(),
    rq = np.round(q.ref),
    rr = np.round(r.ref),
    rs = np.round(third.ref);
  const dq = np.abs(rq.ref.sub(q)),
    dr = np.abs(rr.ref.sub(r)),
    ds = np.abs(rs.ref.sub(third));
  const cq = np.where(
    np.logicalAnd(dq.ref.greater(dr.ref), dq.ref.greater(ds.ref)),
    rr.ref.add(rs.ref).neg(),
    rq.ref,
  );
  const cr = np.where(
    np.logicalAnd(dr.ref.greaterEqual(dq), dr.greater(ds)),
    rq.add(rs).neg(),
    rr,
  );
  // Rows outside the extent, missing, or hidden by a Filter fall in no cell.
  const within = np.logicalAnd(
    np.logicalAnd(x.ref.greaterEqual(p(7)), x.lessEqual(p(8))),
    np.logicalAnd(y.ref.greaterEqual(p(9)), y.lessEqual(p(10))),
  );
  params.dispose();
  const inside = valid ? np.logicalAnd(within, valid.greater(0)) : within;
  const index = cq.sub(qMin.ref).mul(rows).add(cr.sub(rMin.ref));
  const cell = np.where(inside.ref, index.ref, count);
  // One weight per total: count; sum and mean over the rows with a finite value.
  const weights = [],
    slots = [];
  const weight = (a) => weights.push(a) - 1;
  for (const [key, op] of plan.reducers) {
    if (op === "count") {
      slots.push([key, op, weight(inside.ref.astype(np.float32))]);
      continue;
    }
    const value = fields[key],
      ok = np.logicalAnd(inside.ref, np.isfinite(value.ref));
    slots.push([
      key,
      op,
      weight(np.where(ok.ref, value, 0)),
      op === "mean" ? weight(ok.astype(np.float32)) : (ok.dispose(), -1),
    ]);
  }
  const totals = hexTotals(cell, weights, count);
  weights.forEach((w) => w.dispose());
  cell.dispose();
  const columns = {};
  for (const [key, op, total, counted] of slots)
    columns[key] =
      op === "mean"
        ? np.where(
            totals[counted].ref.greater(0),
            totals[total].ref.div(np.maximum(totals[counted].ref, 1)),
            NaN,
          )
        : totals[total].ref;
  totals.forEach((t) => t.dispose());
  // Every cell's center: cell c is (qMin + floor(c / rows), rMin + c % rows).
  const at = np.arange(count).astype(np.float32);
  const hq = np.floor(at.ref.div(rows)).add(qMin),
    hr = np.remainder(at, rows).add(rMin);
  columns.x =
    orientation === "pointy"
      ? hq.ref.add(hr.ref.mul(0.5)).mul(rootThreeR.ref)
      : hq.ref.mul(oneAndHalfR.ref);
  columns.y =
    orientation === "pointy"
      ? hr.mul(oneAndHalfR)
      : hr.add(hq.mul(0.5)).mul(rootThreeR.ref);
  if (orientation === "pointy") hq.dispose();
  else oneAndHalfR.dispose();
  columns.width = np.zeros([count], { dtype: np.float32 }).add(twoR);
  columns.depth = np.zeros([count], { dtype: np.float32 }).add(rootThreeR);
  columns.rotation = np.full([count], orientation === "pointy" ? 30 : 0);
  for (const a of [threeR, twoOverThreeR]) a.dispose();
  return {
    columns,
    codes: np.where(inside, index, -1).astype(np.int32),
    shown: columns.count.ref.greater(0).astype(np.int32),
  };
}
const PROGRAMS = new Map();
/** hexKernel compiled once per plan (utils/programs.js). */
const hexProgram = (plan) => planProgram(PROGRAMS, plan, hexKernel);

/**
 * Each row's hexagonal cell of x and y (config: x, y, radius, bins, bounds, orientation): the
 * axial coordinates cq and cr (owned through `own`), whether x and y are finite (the caller owns
 * it), and `centers(q, r)`, a cell's center (owned). The radius follows the visible rows' x
 * extent (or bounds) and `bins` unless given. Hexbin's grouped path and Group's hexbin key.
 */
export async function hexCells(input, config, own) {
  const col = (key) => own(numericColumn(input.scope, key));
  const x = col(config.x),
    y = col(config.y),
    orientation = config.orientation ?? "pointy";
  // Over a padded input: the shown rows' extent.
  // With an extent (and a reducer the fixed grid lacks), the radius follows the extent too.
  let radius = config.radius;
  if (radius === undefined) {
    const [a, b] = config.bounds
      ? hexExtent(config.bounds).x
      : (await finiteExtents([x], input.valid))[0];
    radius = (b - a || 1) / ((orientation === "flat" ? 1.5 : Math.sqrt(3)) * (config.bins ?? 30));
  }
  if (!Number.isFinite(radius) || radius <= 0)
    throw Error("Hexbin radius must be finite and positive.");
  // The radius follows the data extent, so its multiples come from a buffer.
  const [rootThreeR, threeR, twoOverThreeR, twoR] = deviceParams([
    Math.sqrt(3) * radius,
    3 * radius,
    2 / (3 * radius),
    2 * radius,
  ]).map(own);
  const q = own(
    orientation === "pointy"
      ? x.ref.div(rootThreeR.ref).sub(y.ref.div(threeR.ref))
      : x.ref.mul(twoOverThreeR.ref),
  );
  const r = own(
    orientation === "pointy"
      ? y.ref.mul(twoOverThreeR.ref)
      : y.ref.div(rootThreeR.ref).sub(x.ref.div(threeR.ref)),
  );
  const third = own(q.ref.add(r.ref).neg()),
    rq = own(np.round(q.ref)),
    rr = own(np.round(r.ref)),
    rs = own(np.round(third.ref));
  const dq = own(np.abs(rq.ref.sub(q.ref))),
    dr = own(np.abs(rr.ref.sub(r.ref))),
    ds = own(np.abs(rs.ref.sub(third.ref)));
  const cq = own(
    np.where(
      np.logicalAnd(dq.ref.greater(dr.ref), dq.ref.greater(ds.ref)),
      rr.ref.add(rs.ref).neg(),
      rq.ref,
    ),
  );
  const cr = own(
    np.where(
      np.logicalAnd(dr.ref.greaterEqual(dq.ref), dr.ref.greater(ds.ref)),
      rq.ref.add(rs.ref).neg(),
      rr.ref,
    ),
  );
  const centers = (hq, hr) => hexCenters({ orientation, rootThreeR, twoR }, hq, hr, own);
  return {
    cq,
    cr,
    finite: np.logicalAnd(np.isfinite(x.ref), np.isfinite(y.ref)),
    centers,
    rootThreeR,
    twoR,
  };
}

/** Map axial cell codes to centers using the retained grid dimensions. The caller owns the
 * resulting columns; no callback from an earlier runner invocation is retained in a cache. */
export function hexCenters({ orientation, rootThreeR, twoR }, q, r, own) {
  return {
    x: own(orientation === "pointy"
      ? q.ref.add(r.ref.mul(0.5)).mul(rootThreeR.ref)
      : q.ref.mul(twoR.ref.mul(0.75))),
    y: own(orientation === "pointy"
      ? r.ref.mul(twoR.ref.mul(0.75))
      : r.ref.add(q.ref.mul(0.5)).mul(rootThreeR.ref)),
  };
}

/** Cells found by grouping the rows' cell coordinates (any reducer, or no extent). */
async function groupedCells(input, config, { own, cleanup, run }) {
  const columns = {},
    orientation = config.orientation ?? "pointy";
  // Over a padded input: the cells grouped as a padded view (hidden and non-finite rows in no
  // cell) instead of compacted.
  const { cq, cr, finite: valid, centers, rootThreeR, twoR } = await hexCells(
    input,
    config,
    own,
  );
  const withCells = createDataView(input.scope, {
    columns: { __hexQ: cq, __hexR: cr },
  });
  let subset;
  if (input.valid) {
    const kept = np
      .logicalAnd(valid, input.valid.ref.greater(0))
      .astype(np.int32);
    subset = createDataView(withCells, {
      mask: kept,
      count: await scalar(np.sum(kept.ref)),
    });
  } else {
    const selected = own(await selectedIndices(valid));
    valid.dispose();
    subset = createDataView(withCells, { indices: selected });
  }
  withCells.dispose();
  const grouped = await run("Group", subset, {
    by: ["__hexQ", "__hexR"],
    columns: config.columns ?? {},
    // Its columns may read @time.
    ...(config.__viewState ? { __viewState: config.__viewState } : {}),
  });
  subset.dispose();
  cleanup(() => grouped.dispose());
  // A padded input's cells: every cell physically, the ones with a shown row valid.
  const cellRows = grouped.padded?.() ?? grouped;
  const hq = cellRows.get("__hexQ"),
    hr = cellRows.get("__hexR");
  Object.assign(columns, centers(hq, hr));
  // A regular hexagon is defined by vertices on an ellipse; rotation changes its orientation.
  columns.width = own(np.zeros([cellRows.length], { dtype: np.float32 }).add(twoR.ref));
  columns.depth = own(
    np.zeros([cellRows.length], { dtype: np.float32 }).add(rootThreeR.ref),
  );
  columns.rotation = own(
    np.full([cellRows.length], orientation === "pointy" ? 30 : 0),
  );
  const columnMetadata = {};
  for (const key of grouped.keys())
    if (!key.startsWith("__hex")) {
      columns[key] = cellRows.get(key);
      // A column keeps what it is: a datetime, a category, a boolean.
      const metadata = cellRows.metadata?.(key);
      if (metadata && key !== "count") columnMetadata[key] = metadata;
    }
  const provenance = {
    kind: "hexbin",
    fields: ["x", "y", "count"],
    contributors: (index) => cellRows.contributors(index),
  };
  return {
    columns,
    columnMetadata,
    provenance,
    ...(cellRows !== grouped
      ? { valid: own(cellRows.valid.ref), count: grouped.length }
      : {}),
  };
}
