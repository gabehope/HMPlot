import { numpy as np, random } from "@hmplot/jax";
import { planProgram } from "../programs.js";
import { numericColumn } from "../dataView.js";
import { sortedGroups, groupQuantiles, groupsShown } from "../grouping.js";
import { reduceByCode } from "../reduce.js";
import { deviceParams, deviceScalar, deviceArray } from "../deviceParams.js";
import { list, inputGroups, fieldTitle } from "./common.js";
import {
  missingValue,
  quantileValue,
  normalQuantile,
  groupReduce,
} from "./statistics.js";

/** Summary's output column names: the defaults, renamed by `as`. */
function summaryNames(config) {
  const by = list(config.by);
  const outputNames = {
    estimate: "estimate",
    lower: "lower",
    upper: "upper",
    count: "count",
    standardDeviation: "standardDeviation",
    standardError: "standardError",
    ...(config.as ?? {}),
  };
  if (
    Object.values(outputNames).some(
      (name) => typeof name !== "string" || !name,
    ) ||
    new Set(Object.values(outputNames)).size !==
      Object.keys(outputNames).length ||
    Object.values(outputNames).some((name) => by.includes(name))
  )
    throw Error(
      "Summary output names must be distinct and must not replace grouping fields.",
    );
  return outputNames;
}

/**
 * Summary: a row per group of `by` (one without it) with the estimate (mean or median) of
 * `value` over its visible finite rows, an interval (deviation, standard error, normal or
 * bootstrap), count, standard deviation and standard error. Masked statistics: a group's size
 * never becomes a kernel shape. Only a bootstrap resamples the values, so it reads them
 * compacted. The groups come from every row read; those with no visible row are hidden.
 */
export const summary = {
  reads: (config) => (config.interval === "bootstrap" ? "compacted" : "rows"),
  output: "aggregate",
  // Its outputs are named by `as` here, once (runner.js).
  renames: true,
  // The estimate and its interval are the summarized field (keyed by their output names).
  names: (config, source) => Object.fromEntries(["estimate", "lower", "upper"]
    .map((key) => [config.as?.[key] ?? key, fieldTitle(source, config.field)])),
  validate(config) {
    const estimateKind = config.estimate ?? "mean",
      interval = config.interval ?? "none",
      confidence = config.confidence ?? 0.95,
      samples = config.samples ?? 1000,
      seed = config.seed ?? 42,
      by = list(config.by);
    if (!["mean", "median"].includes(estimateKind))
      throw Error("Summary estimate must be mean or median.");
    if (
      !["none", "deviation", "standard-error", "normal", "bootstrap"].includes(
        interval,
      )
    )
      throw Error("Unknown Summary interval.");
    if (
      ["deviation", "standard-error", "normal"].includes(interval) &&
      estimateKind !== "mean"
    )
      throw Error("Analytic Summary intervals require estimate=mean.");
    if (!(confidence > 0 && confidence < 1))
      throw Error("Summary confidence must be between zero and one.");
    if (!Number.isInteger(samples) || samples < 1)
      throw Error("Summary samples must be a positive integer.");
    if (!Number.isInteger(seed))
      throw Error("Summary seed must be an integer.");
    if (typeof config.field !== "string")
      throw Error("Summary field must name a numeric column.");
    if (by.some((field) => typeof field !== "string"))
      throw Error("Summary by must contain field names.");
    summaryNames(config);
  },
  async run(input, config, { own, cleanup, cache, boundary, maxBytes }) {
    const estimateKind = config.estimate ?? "mean",
      interval = config.interval ?? "none",
      confidence = config.confidence ?? 0.95,
      samples = config.samples ?? 1000,
      seed = config.seed ?? 42,
      by = list(config.by);
    const value = own(numericColumn(input.scope, config.field));
    let baseGroups = null,
      groups = null;
    if (by.length) {
      // Over a padded input: groups from every physical row (base), reused while the key
      // columns are unchanged (TODO 26.2; before, keyed by the input view, new every brush move).
      baseGroups = await inputGroups(cache, input, by);
      const releaseBase = () => baseGroups.dispose();
      const borrowed = [],
        borrow = (a) => (borrowed.push(a.ref), borrowed.at(-1));
      groups = {
        count: baseGroups.count,
        codes: borrow(baseGroups.codes),
        keys: Object.fromEntries(
          Object.entries(baseGroups.keys).map(([key, source]) => [
            key,
            source?.categories
              ? { codes: borrow(source.codes), categories: source.categories }
              : borrow(source),
          ]),
        ),
        dispose: () => borrowed.splice(0).forEach((a) => a.dispose()),
      };
      cleanup(() => {
        groups.dispose();
        releaseBase();
      });
    }
    const groupCount = groups?.count ?? 1;
    const columns = groups ? { ...groups.keys } : {};
    const outputNames = summaryNames(config);
    const alpha = (1 - confidence) / 2,
      critical = interval === "normal" ? normalQuantile(1 - alpha) : 1;
    const plan = {
      estimate: estimateKind,
      interval,
      grouped: Boolean(groups),
      hidden: Boolean(input.valid),
      groups: groupCount,
    };
    const inputs = {
      value: value.ref,
      ...(groups ? { codes: groups.codes.ref } : { rows: np.zeros([input.length]) }),
      ...(input.valid ? { valid: input.valid.ref } : {}),
      params: deviceArray([critical]),
    };
    // Every group at once (TODO 29.8), as one compiled program (TODO 33.3): masked statistics
    // over each group's visible finite rows, so a group's size never becomes a kernel shape,
    // and nothing is read back but the counts a bootstrap needs.
    const out =
      input.length && groupCount
        ? summaryProgram(plan)(inputs)
        : summaryKernel(plan, inputs);
    const results = {};
    if (!groupCount)
      for (const key of Object.keys(outputNames))
        results[key] = own(np.zeros([0]));
    else {
      let { lower, upper } = out;
      if (interval === "bootstrap")
        [lower, upper] = await bootstrap(
          { own, boundary, maxBytes },
          {
            code: own(out.code),
            valid: own(out.finite),
            value,
            count: out.count,
            groupCount,
          },
          { estimateKind, samples, seed, alpha },
        );
      Object.assign(results, {
        estimate: own(out.estimate),
        count: own(out.count),
        standardDeviation: own(out.sd),
        standardError: own(out.se),
        lower: own(lower),
        upper: own(upper),
      });
    }
    for (const [key, array] of Object.entries(results))
      columns[outputNames[key]] = array;
    const provenance = {
      kind: "summary",
      // Over a padded input the codes index the physical rows; hidden rows are in no group.
      codes: own(out.codes),
      fields: [...by, ...Object.values(outputNames)],
      ...(input.valid ? { rows: input.scope } : {}),
    };
    // Every group kept, the ones with a visible row visible.
    const shownGroups = out.shown ? own(out.shown) : null;
    return { columns, provenance, valid: shownGroups };
  },
};

/**
 * Summary's device work for a plan ({ estimate, interval, grouped, hidden, groups: the group
 * count }), one compiled program per plan (TODO 33.3). `inputs`: value, codes (or rows, a [n]
 * placeholder without groups), valid (over hidden rows), params ([the normal interval's
 * critical value]). Consumes `inputs`. Returns each group's count, estimate, sd, se and (but
 * for a bootstrap) lower and upper; the provenance codes; over hidden rows of groups, which
 * groups are shown; and for a bootstrap, each row's group code and finite mask.
 */
function summaryKernel(plan, { value, codes: groupCodes, rows, valid, params }) {
  const groupCount = plan.groups;
  const codes =
    groupCodes ?? np.zeros(rows.shape, { dtype: np.int32 });
  rows?.dispose();
  const shown = valid ? valid.greater(0) : null;
  const visible = shown
    ? np.where(shown.ref, codes.ref, -1).astype(np.int32)
    : codes.ref;
  const finite = np.logicalAnd(visible.ref.greaterEqual(0), np.isfinite(value.ref));
  const code = np.where(finite.ref, visible, -1).astype(np.int32);
  const out = {
    codes: shown
      ? np.where(shown.ref, codes.ref, -1).astype(np.int32)
      : codes.ref,
    ...(plan.grouped && shown
      ? { shown: groupsShown(codes, shown, groupCount) }
      : {}),
  };
  codes.dispose();
  shown?.dispose();
  if (!groupCount) {
    for (const a of [value, code, finite, params]) a.dispose();
    return out;
  }
  const count = groupReduce(code, value, "count", groupCount);
  const mean = groupReduce(code, value, "mean", groupCount);
  let estimate = mean.ref;
  if (plan.estimate === "median") {
    const runs = sortedGroups(code, finite, value, groupCount);
    estimate.dispose();
    estimate = groupQuantiles(runs, [0.5]).reshape([groupCount]);
    runs.dispose();
  }
  // The sample deviation (n - 1) and standard error, for groups of two or more values.
  const deviation = np.where(
    finite.ref,
    np.square(value.ref.sub(np.take(mean, np.clip(code.ref, 0, groupCount - 1), 0))),
    0,
  );
  const squares = reduceByCode(code, deviation, groupCount),
    several = count.ref.greater(1);
  deviation.dispose();
  const sd = np.where(
    several.ref,
    np.sqrt(squares.div(np.maximum(count.ref.sub(1), 1))),
    NaN,
  );
  const se = np.where(several, sd.ref.div(np.sqrt(np.maximum(count.ref, 1))), NaN);
  const critical = params.slice(0);
  let lower, upper;
  if (plan.interval === "deviation")
    [lower, upper] = [estimate.ref.sub(sd.ref), estimate.ref.add(sd.ref)];
  else if (plan.interval === "standard-error")
    [lower, upper] = [estimate.ref.sub(se.ref), estimate.ref.add(se.ref)];
  else if (plan.interval === "normal")
    [lower, upper] = [
      estimate.ref.sub(se.ref.mul(critical.ref)),
      estimate.ref.add(se.ref.mul(critical.ref)),
    ];
  else if (plan.interval !== "bootstrap")
    [lower, upper] = [np.full([groupCount], NaN), np.full([groupCount], NaN)];
  critical.dispose();
  Object.assign(out, { count, estimate, sd, se });
  if (lower) Object.assign(out, { lower, upper });
  if (plan.interval === "bootstrap") Object.assign(out, { code, finite });
  else {
    code.dispose();
    finite.dispose();
  }
  value.dispose();
  return out;
}
const PROGRAMS = new Map();
/** summaryKernel compiled once per plan (utils/programs.js). */
const summaryProgram = (plan) => planProgram(PROGRAMS, plan, summaryKernel);

/**
 * Bootstrap intervals, per group (TODO 29.8): each group's finite visible values in row order
 * (one stable sort; the counts read back once for every group), resampled `samples` times in
 * seeded batches. Returns [lower, upper] (float32 [groups]).
 */
async function bootstrap(
  { own, boundary, maxBytes },
  { code, valid, value, count, groupCount },
  { estimateKind, samples, seed, alpha },
) {
  const counts = Array.from(await count.ref.data(), Number);
  const order = own(
    np.argsort(np.where(valid.ref, code.ref, groupCount).astype(np.int32)),
  );
  const inOrder = own(np.take(value.ref, order.ref, 0));
  const lower = [],
    upper = [];
  let start = 0;
  for (let group = 0; group < groupCount; group++) {
    const n = counts[group];
    if (!n) {
      lower.push(own(missingValue()));
      upper.push(own(missingValue()));
      continue;
    }
    const values = own(inOrder.ref.slice([start, start + n]));
    start += n;
    const batch = Math.max(
        1,
        Math.min(128, samples, Math.floor(maxBytes / Math.max(8, n * 8))),
      ),
      replicates = [];
    for (let first = 0; first < samples; first += batch) {
      const size = Math.min(batch, samples - first),
        key = random.key((seed + group * 1000003 + first) >>> 0),
        draws = own(
          np.floor(random.uniform(key, [size, n]).mul(n)).astype(np.int32),
        ),
        sampled = own(np.take(values.ref, draws.ref, 0)),
        sampleSorted =
          estimateKind === "median" ? own(np.sort(sampled.ref, 1)) : null;
      let stats;
      if (estimateKind === "mean") stats = own(np.mean(sampled.ref, 1));
      else if (n % 2) {
        const index = own(deviceScalar(Math.floor(n / 2), { dtype: "int32" }));
        stats = own(np.take(sampleSorted.ref, index.ref, 1));
      } else {
        const [lowerIndex, upperIndex] = deviceParams([n / 2 - 1, n / 2], {
            dtype: "int32",
          }).map(own),
          lowerMedian = own(np.take(sampleSorted.ref, lowerIndex.ref, 1)),
          upperMedian = own(np.take(sampleSorted.ref, upperIndex.ref, 1));
        stats = own(lowerMedian.ref.add(upperMedian.ref).mul(0.5));
      }
      replicates.push(stats);
      if (first % (batch * 8) === 0) {
        await stats.blockUntilReady();
        await boundary();
      }
    }
    const joined = own(np.concatenate(replicates.map((a) => a.ref))),
      distribution = own(np.sort(joined.ref));
    lower.push(own(quantileValue(distribution, samples, alpha)));
    upper.push(own(quantileValue(distribution, samples, 1 - alpha)));
  }
  return [np.stack(lower.map((a) => a.ref)), np.stack(upper.map((a) => a.ref))];
}
