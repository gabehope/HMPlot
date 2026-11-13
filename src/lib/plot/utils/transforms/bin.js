import { numpy as np } from "@hmplot/jax";
import { planProgram } from "../programs.js";
import { numericColumn, finiteExtents, categoryColumn } from "../dataView.js";
import { histogramRows } from "../reduce.js";
import { deviceArray } from "../deviceParams.js";
import {
  binCountFromRule,
  validateBinEdges,
  groupReduce,
} from "./statistics.js";
import { cachedHostValue, fieldTitle } from "./common.js";
import { columnsLineage, plainReduction, removedReduce } from "./group.js";
import { isExpression } from "../names.js";
import { groupColumns, evaluateSparseGroupColumns } from "./groupColumns.js";
import { parameterExpressions } from "./dependencies.js";
import {
  automaticInterval,
  calendarEdges,
  timeInterval,
  timezone,
} from "../datetime.js";
import {
  MODEL_CALENDARS,
  modelCalendar,
  modelEdges,
} from "../modelCalendars.js";
import { limitError } from "../limits.js";

/**
 * Bin's device work for a plan (TODO 33.3): each row's bin along each axis (only the visible
 * rows are binned; the others get code -1), then the rows' bins (assign) or a row per bin with
 * its reductions (aggregate). `plan` is the structure: { mode, axes: [{ axis, uniform }], reducers:
 * [[key, op, hasField]], weight: "column" | "interaction" | undefined, normalization, empty, members };
 * the bin counts are the edge arrays' lengths. `inputs`: values and edges (each axis's edges, then
 * [first, width, last]) per axis, valid (optional), and for aggregates fields (by reducer key),
 * weight and any. Consumes `inputs`; returns { columns, codes, shown, members } (members, with
 * plan.members: each row's bin for the expression columns, -1 for a row they leave out).
 */
function binKernel(plan, inputs) {
  const n = inputs.values[0].shape[0];
  let code = np.zeros([n], { dtype: np.int32 }),
    valid = inputs.valid
      ? inputs.valid.greater(0)
      : np.ones([n], { dtype: np.bool }),
    total = 1;
  const specs = [];
  plan.axes.forEach(({ uniform }, k) => {
    const x = inputs.values[k],
      all = inputs.edges[k];
    const size = all.shape[0] - 3,
      bins = size - 1;
    const edges = all.ref.slice([0, size]),
      first = all.ref.slice(size),
      width = all.ref.slice(size + 1),
      last = all.slice(size + 2);
    let left;
    if (uniform) {
      // Evenly spaced edges: one arithmetic guess, then correct by one bin against the actual
      // edge values so boundary values land exactly as the binary search puts them.
      const guess = np
        .clip(np.floor(x.ref.sub(first.ref).div(width)), 0, bins - 1)
        .astype(np.int32);
      const low = np.take(edges.ref, guess.ref, 0),
        high = np.take(edges.ref, guess.ref.add(1), 0);
      left = np
        .where(
          x.ref.less(low),
          guess.ref.sub(1),
          np.where(x.ref.greaterEqual(high), guess.ref.add(1), guess),
        )
        .add(1);
    } else {
      width.dispose();
      left = np.zeros([n], { dtype: np.int32 });
      let right = np.full([n], size, { dtype: np.int32 });
      for (let step = 0; step < Math.ceil(Math.log2(size + 1)); step++) {
        const middle = np
          .floor(left.ref.add(right.ref).astype(np.float32).mul(0.5))
          .astype(np.int32);
        const value = np.take(edges.ref, np.minimum(middle.ref, size - 1), 0);
        const active = left.ref.less(right.ref);
        const next = np.where(
          np.logicalAnd(active.ref, x.ref.greaterEqual(value.ref)),
          middle.ref.add(1),
          left,
        );
        right = np.where(
          np.logicalAnd(active, x.ref.less(value)),
          middle,
          right,
        );
        left = next;
      }
      right.dispose();
    }
    const c = np.clip(left.sub(1), 0, bins - 1);
    valid = np.logicalAnd(
      valid,
      np.logicalAnd(
        np.isfinite(x.ref),
        np.logicalAnd(x.ref.greaterEqual(first), x.lessEqual(last)),
      ),
    );
    code = code.add(c.ref.mul(total));
    specs.push({ c, bins, stride: total, edges });
    total *= bins;
  });
  const columns = {};
  const lower = (edges, at) => np.take(edges.ref.slice([0, -1]), at, 0),
    upper = (edges, at) => np.take(edges.ref.slice([1]), at, 0);
  if (plan.mode === "assign") {
    // The same rows, each with its bins. Automatic edges come from the visible rows' extents,
    // so the bins follow the mask.
    plan.axes.forEach(({ axis }, k) => {
      const { c, edges } = specs[k],
        prefix = "bin" + axis.toUpperCase();
      columns[prefix] = np.where(valid.ref, c.ref, -1);
      columns[prefix + "0"] = np.where(valid.ref, lower(edges, c.ref), NaN);
      columns[prefix + "1"] = np.where(valid.ref, upper(edges, c), NaN);
      edges.dispose();
    });
    valid.dispose();
    code.dispose();
    return { columns };
  }
  const codes = np.where(valid.ref, code.ref, -1).astype(np.int32);
  const index = np.arange(total).astype(np.float32);
  plan.axes.forEach(({ axis: name }, k) => {
    const { c, edges, bins, stride } = specs[k];
    c.dispose();
    const at = np
      .remainder(np.floor(index.ref.div(stride)), bins)
      .astype(np.int32);
    columns[name + "0"] = lower(edges, at.ref);
    columns[name + "1"] = upper(edges, at);
    columns[name] = columns[name + "0"].ref
      .add(columns[name + "1"].ref)
      .mul(0.5);
    edges.dispose();
  });
  index.dispose();
  let weight = null;
  if (plan.weight) {
    weight = inputs.weight.astype(np.float32);
    if (plan.weight === "interaction")
      weight = np.where(inputs.any.astype(np.float32).greater(0), weight, 1);
    weight = np.where(np.isfinite(weight.ref), weight, 0);
  }
  // The expression columns (groupColumns.js) leave out hidden rows and rows of weight 0, as the
  // reducers other than sum and mean do.
  const members = plan.members
    ? np
        .where(
          weight ? np.logicalAnd(valid.ref, weight.ref.greater(0)) : valid.ref,
          code.ref,
          -1,
        )
        .astype(np.int32)
    : null;
  const fields = inputs.fields;
  if (
    plan.reducers.every(
      ([, op]) => op === "count" || op === "sum" || op === "mean",
    )
  ) {
    // One pass for every bin: each row's weight lands in its bin's column of a one-hot
    // expression, summed down the rows (reduce.js histogramRows). Weights: a row counts
    // `weight` (1 without one) where valid; sum and mean add the finite values.
    const base = np.where(valid, weight ?? 1, 0).astype(np.float32);
    const weights = [],
      slots = [];
    for (const [key, op, hasField] of plan.reducers) {
      if (!hasField) {
        slots.push([key, op, weights.push(base.ref) - 1, -1]);
        continue;
      }
      const values = fields[key].astype(np.float32),
        finite = np.isfinite(values.ref);
      const counted = weights.push(np.where(finite.ref, base.ref, 0)) - 1;
      const summed =
        op === "count"
          ? (values.dispose(), finite.dispose(), -1)
          : weights.push(np.where(finite, values.mul(base.ref), 0)) - 1;
      slots.push([key, op, counted, summed]);
    }
    base.dispose();
    const sums = histogramRows(codes, weights, total);
    weights.forEach((w) => w.dispose());
    for (const [key, op, counted, summed] of slots)
      columns[key] =
        op === "count"
          ? sums[counted].ref
          : op === "sum"
            ? sums[summed].ref
            : np.where(
                sums[counted].ref.greater(0),
                sums[summed].ref.div(np.maximum(sums[counted].ref, 1)),
                NaN,
              );
    sums.forEach((a) => a.dispose());
  } else {
    // Other reducers treat weight as membership: rows with weight 0 are left out. Every bin at
    // once (TODO 29.7): each row's bin, -1 when it is left out.
    if (weight) valid = np.logicalAnd(valid, weight.greater(0));
    const binCode = np.where(valid, code.ref, -1).astype(np.int32);
    for (const [key, op, hasField] of plan.reducers) {
      columns[key] = groupReduce(
        binCode,
        hasField ? fields[key] : null,
        op,
        total,
      );
      if (hasField) fields[key].dispose();
    }
    binCode.dispose();
  }
  code.dispose();
  if (plan.normalization) {
    // A histogram's bars along the other axis, from 0 to the normalized count (TODO 130.1), so
    // one Rect draws both orientations.
    const a = plan.axes[0].axis,
      h = heightAxis(a);
    let height = columns.count.ref;
    if (plan.normalization !== "count")
      height = height.div(np.maximum(np.sum(columns.count.ref), 1));
    if (plan.normalization === "density")
      height = height.div(columns[a + "1"].ref.sub(columns[a + "0"].ref));
    columns[h] = height.ref;
    columns[h + "0"] = np.zerosLike(height.ref);
    columns[h + "1"] = height;
  }
  const shown = plan.empty
    ? undefined
    : columns.count.ref.greater(0).astype(np.int32);
  return {
    columns,
    codes,
    ...(shown ? { shown } : {}),
    ...(members ? { members } : {}),
  };
}
const PROGRAMS = new Map();
/** binKernel compiled once per plan (utils/programs.js). */
const binProgram = (plan) => planProgram(PROGRAMS, plan, binKernel);

/** Host edge geometry after the device extent and optional rule count have been resolved.
 * Borrows the temporal metadata; returns new edges in the source column's units.
 * The allocation checks remain here, before any GPU edge buffers are created.
 */
function edgesForExtent(a, b, count, time, maxBytes) {
  if (time && MODEL_CALENDARS.includes(time.metadata.calendar)) {
    const calendar = modelCalendar({
      name: time.metadata.calendar,
      units: time.metadata.calendarUnits,
    });
    const interval =
      time.interval ??
      automaticInterval(Math.max((b - a) * calendar.days * 86400000, 1), count);
    return modelEdges(calendar, a, b, interval, Math.floor(maxBytes / 32));
  }
  if (time) {
    const origin = time.metadata.origin;
    const interval =
      time.interval ?? automaticInterval(Math.max(b - a, 1), count);
    return calendarEdges(
      origin + a,
      origin + b,
      interval,
      time.zone,
      Math.floor(maxBytes / 32),
    ).map((edge) => edge - origin);
  }
  if (a === b) {
    a -= 0.5;
    b += 0.5;
  }
  if ((count + 1) * 4 > maxBytes)
    throw limitError("storage", {
      component: "Bin",
      what: "its edge list",
      count: (count + 1) * 4,
      limit: maxBytes,
      hint: "Use fewer bins.",
      property: "bins",
    });
  return Array.from(
    { length: count + 1 },
    (_, index) => a + ((b - a) * index) / count,
  );
}

/**
 * Bin: each row's bin along x, y and z (evenly spaced over the visible rows' extent, a count, a
 * rule, or explicit edges). mode "aggregate" (the default): a row per bin (every combination of
 * the axes' bins), with count and `columns` (reduction expressions, as Group's: {mean_y:
 * mean("y")}) over the visible rows in it; `empty: false` hides the empty bins. mode "assign": the same rows, each with its bins (binX, binX0, binX1, ...).
 * A datetime column bins by the calendar (TODO 53.2): automatic edges are the boundaries of an
 * interval axis ticks would choose for that many bins (days, weeks from Sunday, months, years),
 * or of `interval` ("1 month"), in the column's time zone or `tz`; the edges and centers are
 * datetimes. Explicit edges may be Dates.
 */
/** An axis's setting from a value or a per-axis object ({x, y, z}). */
const perAxis = (value, axis) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value[axis]
    : value;
/** Whether an expression holds a sum, mean or count (which a weight would weigh). */
const hasWeighted = (value) =>
  isExpression(value) &&
  (["sum", "mean", "count"].includes(value.op) || value.args.some(hasWeighted));
// The reductions the kernel computes; any other runs through the expression path.
const BIN_OPS = new Set([
  "count",
  "sum",
  "mean",
  "min",
  "max",
  "first",
  "last",
  "variance",
  "std",
]);
/** The normalizations a one-axis Bin gives its bins' heights in. */
const NORMALIZATIONS = ["count", "proportion", "density"];
/** The axis a histogram's bars rise along: y for bins along x, x for bins along y. */
const heightAxis = (axis) => (axis === "x" ? "y" : "x");
/** The binned axes. */
const binnedAxes = (config) =>
  ["x", "y", "z"].filter((axis) => config[axis] !== undefined);
/** The columns a Bin writes itself, which its columns cannot replace. */
const binOutputs = (config) => {
  const axes = binnedAxes(config);
  if (config.normalization !== undefined && axes.length === 1)
    axes.push(heightAxis(axes[0]));
  return ["count", ...axes.flatMap((axis) => [axis, axis + "0", axis + "1"])];
};
const isDatetime = (metadata) =>
  (metadata?.type === "datetime" && Number.isFinite(metadata.origin)) ||
  MODEL_CALENDARS.includes(metadata?.calendar);
export const bin = {
  sharedBins: (config) => ({
    axes: ["x", "y", "z"].filter((axis) => config[axis] !== undefined),
    calendar: true,
  }),
  domainFields: (settings) => ({ x: settings.x, y: settings.y }),
  // Its expression parameters, evaluated before it runs (TODO 138.2).
  parameters: { bins: { type: "expression", integer: true } },
  // Props that take a column name or one number per row (runner.js alignedFields).
  fields: ["x", "y", "z", "weight"],
  // A histogram's bars rise along the other axis (a Histogram's connection value axis).
  valueAxis: (config) => {
    const axes = binnedAxes(config);
    return config.normalization !== undefined && axes.length === 1
      ? axes[0] === "x"
        ? 1
        : 0
      : null;
  },
  reads: "rows",
  output: (config) => (config.mode === "assign" ? "sameRows" : "aggregate"),
  // A bin count from an expression, the weight field and the columns (dependencies.js). The
  // binned x, y and z are not declared: a Bin of an "@" column follows its input only.
  dependencies: (settings) => ({
    expressions: [
      ...parameterExpressions(settings.bins),
      ...Object.values(settings.columns ?? {}),
    ],
    fields: [settings.weight],
  }),
  // Assigned bin edges move with their field and step to its new bin (lineage, TODO 38.2).
  // A bin's edges and center move all its members, which may re-bin; its reducers move as
  // Group's (TODO 38.4).
  lineage(config) {
    const axes = ["x", "y", "z"].filter((a) => typeof config[a] === "string");
    if (config.mode !== "assign") {
      // With a weight, sum and mean weigh their members and the other reducers leave out rows
      // of weight 0, while a drag moves every row in the bin: its reducers cannot be dragged.
      const lineage =
        config.weight === undefined ? columnsLineage(config.columns) : {};
      for (const axis of axes)
        for (const name of [axis, axis + "0", axis + "1"])
          lineage[name] = {
            kind: "reduce",
            policy: "shift",
            op: "bin",
            field: config[axis],
          };
      return lineage;
    }
    const lineage = {};
    for (const axis of axes) {
      const prefix = "bin" + axis.toUpperCase();
      lineage[prefix + "0"] = { kind: "snap", from: config[axis] };
      lineage[prefix + "1"] = { kind: "snap", from: config[axis] };
    }
    return lineage;
  },
  // Edges and centers are the binned field; an assigned bin index is unnamed; a histogram's
  // heights are its normalization.
  names(config, source, columns) {
    const names = {},
      declare = (key, name) => {
        if (Object.hasOwn(columns, key)) names[key] = name;
      };
    for (const axis of ["x", "y", "z"].filter((a) => config[a] !== undefined)) {
      const name = fieldTitle(source, config[axis]);
      if (config.mode === "assign") {
        const prefix = "bin" + axis.toUpperCase();
        declare(prefix + "0", name);
        declare(prefix + "1", name);
        declare(prefix, null);
      } else {
        declare(axis + "0", name);
        declare(axis + "1", name);
        declare(axis, name);
      }
    }
    if (config.normalization !== undefined) {
      const h = heightAxis(binnedAxes(config)[0]);
      for (const key of [h, h + "0", h + "1"])
        declare(key, config.normalization);
    }
    return names;
  },
  validate(config) {
    removedReduce(
      "Bin",
      config,
      'columns={{ mean_y: mean("y") }}',
      'columns={"mean_y": hm.mean("y")}',
    );
    if (!["x", "y", "z"].some((axis) => config[axis] !== undefined))
      throw Error("Bin requires at least one coordinate.");
    if (config.normalization !== undefined) {
      if (!NORMALIZATIONS.includes(config.normalization))
        throw Error(
          `Bin normalization is "count", "proportion" or "density"; received ${JSON.stringify(config.normalization)}.`,
        );
      const axes = binnedAxes(config);
      if (axes.length !== 1 || axes[0] === "z")
        throw Error(
          "Bin normalization gives a histogram's heights: bin x alone (heights along y) or y alone (heights along x).",
        );
      if (config.mode === "assign")
        throw Error(
          'Bin normalization gives each bin a height: it applies to mode "aggregate", a row per bin.',
        );
    }
    if (config.columns !== undefined) {
      if (config.mode === "assign")
        throw Error(
          'Bin columns apply to mode "aggregate", a row per bin; "assign" keeps the rows.',
        );
      groupColumns(config.columns, "Bin", [], binOutputs(config));
    }
    if (!["aggregate", "assign"].includes(config.mode ?? "aggregate"))
      throw Error("Bin mode must be aggregate or assign.");
    for (const axis of ["x", "y", "z"]) {
      const interval = perAxis(config.interval, axis),
        zone = perAxis(config.tz, axis);
      if (interval !== undefined) timeInterval(interval);
      if (zone !== undefined) timezone(zone);
      if (interval !== undefined && Array.isArray(perAxis(config.bins, axis)))
        throw Error("Bin: give an interval or explicit edges, not both.");
    }
  },
  async run(input, config, { own, maxBytes, cache, evaluator, viewState }) {
    const n = input.length,
      columns = {};
    let provenance;
    const col = (key) => own(numericColumn(input.scope, key));
    const axes = ["x", "y", "z"].filter((axis) => config[axis] !== undefined);
    const optionOf = (axis) => perAxis(config.bins, axis);
    const values = Object.fromEntries(
      axes.map((axis) => [axis, col(config[axis])]),
    );
    // Datetime axes bin by the calendar, in the column's zone unless tz= names one.
    const times = {};
    for (const axis of axes) {
      const metadata =
        typeof config[axis] === "string"
          ? input.scope.metadata?.(config[axis])
          : null;
      if (isDatetime(metadata))
        times[axis] = {
          metadata,
          interval: timeInterval(perAxis(config.interval, axis)),
          zone: perAxis(config.tz, axis) ?? metadata.timezone ?? "UTC",
        };
      else if (perAxis(config.interval, axis) !== undefined)
        throw Error(
          `Bin interval bins a datetime column; ${typeof config[axis] === "string" ? config[axis] : `the ${axis} values`} ${typeof config[axis] === "string" ? "is" : "are"} not one.`,
        );
    }
    // Automatic edges: every axis's extent in one readback (TODO 29.3), and the edges kept while
    // the rows, their mask and the columns are the same (29.4): a Bin weighted by "@brushed"
    // reruns on every brush move over unchanged rows. Rules see the raw extent (a constant
    // column is one bin); the edges get a width.
    const automatic = axes.filter((axis) => !Array.isArray(optionOf(axis)));
    const fields = automatic.map((axis) => config[axis]);
    const automaticEdges = !automatic.length
      ? {}
      : await cachedHostValue(
          fields.every(
            (field) => typeof field === "string" && !field.startsWith("@"),
          )
            ? cache
            : null,
          "binEdges",
          [
            JSON.stringify(
              automatic.map((axis) => [
                optionOf(axis),
                times[axis] && [
                  times[axis].interval,
                  times[axis].zone,
                  times[axis].metadata.origin,
                ],
              ]),
            ),
            input.length,
            input.scope.identity?.generation,
            input.valid,
            ...fields.map((field) =>
              typeof field === "string" ? input.scope.get(field) : null,
            ),
          ],
          async () => {
            const extents = await finiteExtents(
              automatic.map((axis) => values[axis]),
              input.valid,
            );
            const edges = {};
            for (const [k, axis] of automatic.entries()) {
              const [a, b] = extents[k];
              const option = optionOf(axis);
              const count =
                typeof option === "string"
                  ? await binCountFromRule(
                      option,
                      values[axis],
                      a,
                      b,
                      input.valid,
                    )
                  : (option ?? 30);
              if (!Number.isInteger(count) || count < 1)
                throw Error(
                  "Bin count must be a positive integer, a rule name, or explicit edges.",
                );
              edges[axis] = edgesForExtent(a, b, count, times[axis], maxBytes);
            }
            return edges;
          },
        );
    // The plan: each axis's edges (explicit, or from the cached extents), checked on the host.
    const plan = { mode: config.mode ?? "aggregate", axes: [] },
      inputs = { values: [], edges: [] },
      general = {};
    let kernelSpecs = {};
    let total = 1;
    // The program consumes `inputs`; a check that fails while building them releases them.
    try {
      for (const axis of axes) {
        const option = optionOf(axis);
        // Explicit edges on a datetime axis may be Dates (numbers are from the column's origin).
        const origin = times[axis]?.metadata.origin ?? 0;
        const edges = Array.isArray(option)
          ? validateBinEdges(
              option.map((edge) =>
                edge instanceof Date ? edge.getTime() - origin : edge,
              ),
            )
          : automaticEdges[axis];
        const bins = edges.length - 1;
        if (total * bins * 32 > maxBytes)
          throw limitError("storage", {
            component: "Bin",
            what: "its output",
            count: total * bins * 32,
            limit: maxBytes,
            hint: "Use fewer bins, or fewer groups.",
            property: "bins",
          });
        const width = (edges.at(-1) - edges[0]) / bins;
        plan.axes.push({
          axis,
          uniform: edges.every(
            (edge, i) =>
              Math.abs(edge - (edges[0] + i * width)) <=
              1e-9 * Math.max(1, Math.abs(edge)),
          ),
        });
        inputs.values.push(values[axis].ref);
        // Edges follow the data (automatic extents) or a control: they come from a buffer, the
        // edges then [first, width, last].
        inputs.edges.push(
          deviceArray([...edges, edges[0], width, edges.at(-1)]),
        );
        total *= bins;
      }
      if (input.valid) inputs.valid = input.valid.ref;
      if (plan.mode !== "assign") {
        // Plain reductions of numeric columns in the compiled kernel; any other expression
        // through the expression path (groupColumns.js), over each row's bin.
        const reducers = (kernelSpecs = { count: { op: "count" } });
        for (const [name, value] of Object.entries(config.columns ?? {})) {
          const spec = plainReduction(value);
          if (
            spec &&
            BIN_OPS.has(spec.op) &&
            (spec.field === undefined ||
              !categoryColumn(input.scope.resolve(spec.field)))
          )
            reducers[name] = spec;
          else general[name] = value;
        }
        if (Object.keys(general).length) plan.members = true;
        // A column weight weighs sum, mean and count only as a column of their own: inside an
        // expression they would count every row of positive weight once.
        const interactionWeight =
          typeof config.weight === "string" && config.weight.startsWith("@");
        if (config.weight !== undefined && !interactionWeight)
          for (const [name, value] of Object.entries(general))
            if (hasWeighted(value))
              throw Error(
                `Bin column ${name}: with weight, sum, mean and count are weighted only as a column of their own, such as {total: sum(${typeof config.weight === "string" ? `"${config.weight}"` : "a column of the weights"})}; compute ${name} from those columns in a Calculate after the Bin.`,
              );
        plan.reducers = Object.entries(reducers).map(([key, spec]) => [
          key,
          spec.op,
          spec.field !== undefined,
        ]);
        inputs.fields = {};
        for (const [key, spec] of Object.entries(reducers))
          if (spec.field !== undefined)
            inputs.fields[key] = numericColumn(input.scope, spec.field);
        // weight scales each row's contribution. An interaction field such as "@brushed" counts
        // every row while nothing is brushed, like Filter's inactive="all". Weighting instead of
        // filtering keeps arrays at full length, so brushing reuses compiled kernels.
        if (config.weight !== undefined) {
          if (
            typeof config.weight !== "string" &&
            !Array.isArray(config.weight?.shape)
          )
            throw Error(
              "Bin weight must name a column or interaction field, or give one number per row.",
            );
          inputs.weight = numericColumn(input.scope, config.weight);
          plan.weight =
            typeof config.weight === "string" &&
            /^@(selected|brushed|hovered|nearby|nearest|tooltip)$/.test(
              config.weight,
            )
              ? "interaction"
              : "column";
          if (plan.weight === "interaction")
            inputs.any = numericColumn(
              input.scope,
              "@any_" + config.weight.slice(1),
            );
        }
        if (config.normalization !== undefined)
          plan.normalization = config.normalization;
        plan.empty = config.empty !== false;
      }
    } catch (error) {
      for (const array of [
        ...inputs.values,
        ...inputs.edges,
        inputs.valid,
        ...Object.values(inputs.fields ?? {}),
        inputs.weight,
        inputs.any,
      ])
        array?.dispose();
      throw error;
    }
    // One program per plan (TODO 33.3); an empty input runs the same steps eagerly.
    const out = n ? binProgram(plan)(inputs) : binKernel(plan, inputs);
    for (const [key, column] of Object.entries(out.columns))
      columns[key] = own(column);
    // Held now: an expression column below can throw.
    const codes = out.codes ? own(out.codes) : null,
      shown = out.shown ? own(out.shown) : null;
    const columnMetadata = {};
    // The largest, smallest, first or last of a datetime column is a datetime, as in Group.
    for (const [name, spec] of Object.entries(kernelSpecs))
      if (
        spec.field !== undefined &&
        ["first", "last", "min", "max"].includes(spec.op)
      ) {
        const metadata = input.scope.metadata?.(spec.field);
        if (metadata?.type === "datetime") columnMetadata[name] = metadata;
      }
    if (plan.members) {
      const members = own(out.members);
      const evaluated = evaluateSparseGroupColumns(
        groupColumns(general, "Bin", [], binOutputs(config)),
        input.scope,
        { codes: members, count: total, length: n, evaluator, viewState },
      );
      for (const [key, column] of Object.entries(evaluated.columns))
        columns[key] = column?.categories
          ? { ...column, codes: own(column.codes) }
          : own(column);
      Object.assign(columnMetadata, evaluated.columnMetadata);
    }
    // The columns in the order given, after the bins and count.
    const heights = plan.normalization
      ? [heightAxis(axes[0])].flatMap((h) => [h, h + "0", h + "1"])
      : [];
    for (const name of [...Object.keys(config.columns ?? {}), ...heights])
      if (Object.hasOwn(columns, name)) {
        const column = columns[name];
        delete columns[name];
        columns[name] = column;
      }
    let shownBins = null;
    if (plan.mode !== "assign") {
      provenance = {
        kind: "bin",
        codes,
        fields: [...axes.flatMap((a) => [a + "0", a + "1"]), "count"],
        ...(input.valid ? { rows: input.scope } : {}),
      };
      // empty: false: every bin kept, the empty ones hidden (no compaction; consumers that have
      // not opted in see the non-empty bins as before).
      shownBins = shown;
    }
    // Edges and centers of a datetime axis are datetimes (an assigned bin index is not).
    for (const [axis, time] of Object.entries(times)) {
      const metadata = MODEL_CALENDARS.includes(time.metadata.calendar)
        ? { ...time.metadata }
        : {
            type: "datetime",
            origin: time.metadata.origin,
            timezone: time.metadata.timezone ?? "UTC",
            gpuUnit: "ms",
          };
      const keys =
        plan.mode === "assign"
          ? ["bin" + axis.toUpperCase() + "0", "bin" + axis.toUpperCase() + "1"]
          : [axis + "0", axis + "1", axis];
      for (const key of keys)
        if (Object.hasOwn(columns, key)) columnMetadata[key] = metadata;
    }
    return {
      columns,
      columnMetadata,
      provenance,
      valid: shownBins,
      followsMask: true,
    };
  },
};
