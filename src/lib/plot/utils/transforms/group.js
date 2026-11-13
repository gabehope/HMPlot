import { booleanValues } from "../columnOperations.js";
import { numpy as np } from "@hmplot/jax";
import { planProgram } from "../programs.js";
import { numericColumn, categoryColumn } from "../dataView.js";
import { isCategory } from "../categorical.js";
import { groupsShown } from "../grouping.js";
import { reduceByCode } from "../reduce.js";
import { list, comparisonColumn, inputGroups, reduceLineage, fieldTitle } from "./common.js";
import { count, isExpression, REDUCTIONS } from "../expressions.js";
import { expression } from "../names.js";
import {
  fieldOf,
  groupColumns,
  groupRowsOf,
  evaluateGroupColumns,
} from "./groupColumns.js";
import { validateReducers, groupReduce, REDUCER_OPS } from "./statistics.js";
import { groupByKeys, isKeyNode, keyOutputs, validateKey } from "./groupKeys.js";

/** The rows' group codes, the hidden rows in no group (-1). The caller owns the result. */
const visibleCodes = (input, groups) =>
  input.valid
    ? np
        .where(input.valid.ref.greater(0), groups.codes.ref, -1)
        .astype(np.int32)
    : groups.codes.ref;

/**
 * Every group's reductions over the visible rows (TODO 29.7): the visible codes, a row per group
 * and, over hidden rows, which groups are shown. `plan`: { reducers: [[key, op, hasField]], total
 * (the group count; null: every visible row in one group) }. `inputs`: codes (unless total is
 * null), valid (when rows are hidden), n (a [n] array when there are no codes), values by
 * reducer key. Consumes `inputs`.
 */
function groupKernel(plan, inputs) {
  const { reducers } = plan;
  const shown = inputs.valid ? inputs.valid.greater(0) : null;
  const total = plan.total ?? 1;
  const rowCodes =
    inputs.codes ?? np.zeros(inputs.n.shape, { dtype: np.int32 });
  if (inputs.n) inputs.n.dispose();
  const codes = shown
    ? np.where(shown, rowCodes.ref, -1).astype(np.int32)
    : rowCodes.ref;
  const columns = {};
  for (const [key, op, hasField] of reducers) {
    const values = hasField ? inputs.values[key] : null;
    const summaries = groupReduce(codes, values, op, total);
    values?.dispose();
    columns[key] = summaries;
  }
  rowCodes.dispose();
  // Every group kept, the ones with a visible row visible.
  return {
    columns,
    codes,
    ...(inputs.valid
      ? { shown: columns.count.ref.greater(0).astype(np.int32) }
      : {}),
  };
}
const PROGRAMS = new Map();
/** groupKernel compiled once per plan (utils/programs.js). */
const groupProgram = (plan) => planProgram(PROGRAMS, plan, groupKernel);
/** Runs groupKernel compiled, or eagerly for no rows or no groups. */
const runGroupKernel = (plan, inputs, n) =>
  n && plan.total !== 0
    ? groupProgram(plan)(inputs)
    : groupKernel(plan, inputs);

/** Typed preparation shared by Group and GraphData. Arithmetic stays in the
 * same compiled group kernel; category codes are restored to their original dictionary. */
export function groupedReductions(scope, reduce, { codes = null, total = null, valid = null, length, label = (name) => `Reducer ${name}` } = {}) {
  validateReducers(reduce, true);
  const held = [], own = (array) => (held.push(array), array), values = {}, dictionaries = {}, columnMetadata = {};
  try {
    for (const [name, spec] of Object.entries(reduce)) {
      if (spec.field === undefined) continue;
      const input = scope.resolve(spec.field);
      const categorical = categoryColumn(input);
      if (spec.op === "any" || spec.op === "all") {
        values[name] = booleanValues({ value: input, metadata: scope.metadata?.(spec.field) }, own, spec.op);
        columnMetadata[name] = { type: "boolean" };
        continue;
      }
      if (categorical && !['first', 'last', 'count'].includes(spec.op))
        throw Error(`${label(name)}: ${spec.op} requires numeric values; use first, last or count for categorical columns.`);
      if (categorical) {
        const compared = comparisonColumn(scope, spec.field, own);
        values[name] = compared.array;
        if (spec.op !== 'count') {
          dictionaries[name] = input.categories ?? [...new Set(input)].filter(isCategory);
          columnMetadata[name] = scope.metadata?.(spec.field) ?? { type: 'categorical', domain: dictionaries[name] };
        } else columnMetadata[name] = { type: 'numeric' };
      } else {
        values[name] = own(numericColumn(scope, spec.field));
        const metadata = typeof spec.field === 'string' ? scope.metadata?.(spec.field) : undefined;
        columnMetadata[name] = metadata?.type === 'datetime' && ['first', 'last', 'min', 'max'].includes(spec.op)
          ? metadata : { type: 'numeric' };
      }
    }
    const plan = { reducers: Object.entries(reduce).map(([key, spec]) => [key, spec.op, spec.field !== undefined]), total };
    const out = runGroupKernel(plan, {
      ...(codes ? { codes: codes.ref } : { n: np.zeros([length], { dtype: np.int32 }) }),
      ...(valid ? { valid: valid.ref } : {}),
      values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.ref])),
    }, length);
    for (const [key, categories] of Object.entries(dictionaries)) {
      const array = out.columns[key];
      out.columns[key] = { codes: np.where(np.isfinite(array.ref), array.ref, -1).astype(np.int32), categories };
      array.dispose();
    }
    return { ...out, columnMetadata };
  } finally { held.forEach((array) => array.dispose()); }
}

/** The lineage a drag can move through (TODO 38.4): a column that is one reduction of a field. */
export function columnsLineage(columns) {
  const specs = {};
  for (const [name, value] of Object.entries(columns ?? {}))
    if (
      isExpression(value) &&
      REDUCTIONS[value.op] &&
      value.args.length === 1 &&
      value.args[0] !== null &&
      fieldOf(value.args[0]) !== null
    )
      specs[name] = { op: value.op, field: fieldOf(value.args[0]) };
  return reduceLineage(specs);
}

/** reduce= is gone (TODO 137.2): the error names what to write instead. */
export function removedReduce(component, config, javascript, python) {
  if (config.reduce !== undefined)
    throw Error(
      `${component}: reduce was removed; pass ${javascript} (Python ${python}).`,
    );
}
// One count expression, so its rewritten form (and plan) is reused across runs.
const COUNT = { count: count() };
// Pivot's own columns in the expression path: names no key or category can have.
const PIVOT_COUNT = { "\u0000count": COUNT.count },
  PIVOT_VALUE = "\u0000value";

/**
 * A column that is one reduction of a column ({op, field}: mean("x"), count()) that the compiled
 * group kernel computes (statistics.js REDUCER_OPS), or null for any other expression (a median,
 * arithmetic of reductions, a where=), which the expression path computes (groupColumns.js).
 * The kernel is one compiled program per plan: a brush move over a Group runs a few operations.
 */
export function plainReduction(value) {
  if (!isExpression(value) || !REDUCER_OPS.has(value.op) || value.args.length !== 1)
    return null;
  const [field] = value.args;
  if (field === null) return value.op === "count" ? { op: "count" } : null;
  // A column, by name or as col.x.
  const name = fieldOf(field);
  return name === null ? null : { op: value.op, field: name };
}

/**
 * Group: a row per group of `by`, with count and `columns` (reduction expressions, as in
 * Calculate: {mean_x: mean("x")}) over its visible rows. The groups come from every row read
 * (real rows), so the group set does not change as rows are hidden; the groups with no visible
 * row are hidden. Every group at once, and any number of them (TODO 137.2). Without `by`, one
 * row of totals over the visible rows, shown when none is (a count of 0), as SQL's aggregate
 * without GROUP BY and pandas' agg() (TODO 143.6: a live count needs no constant key column).
 */
export const group = {
  reads: "rows",
  output: "aggregate",
  // Its columns are expressions (dependencies.js).
  dependencies: (settings) => ({
    expressions: Object.values(settings.columns ?? {}),
  }),
  // A mean, median, min, max, first or last moves with its members; a sum splits a drag
  // among them (lineage, TODO 38.4). count is not draggable. A bin's edges and center move all
  // its members, as Bin's.
  lineage(config) {
    const lineage = columnsLineage(config.columns);
    // A plain key is unchanged for every contributing row. Keep that semantic identity for
    // linked brushes, without treating its shorter aggregate buffer as a forwarded array.
    for (const key of list(config.by).filter((key) => typeof key === "string"))
      if (key !== "count" && !Object.hasOwn(config.columns ?? {}, key))
        lineage[key] = {
          kind: "reduce",
          policy: "shift",
          op: "first",
          field: key,
          preservesValues: true,
        };
    for (const key of list(config.by).filter(isKeyNode))
      if (key.op === "bin")
        for (const name of keyOutputs(key))
          lineage[name] = { kind: "reduce", policy: "shift", op: "bin", field: key.args[0] };
    return lineage;
  },
  // A bin's edges and center are its field; a hexagon's center its x and y.
  names(config, source, columns) {
    const names = {};
    for (const key of list(config.by).filter(isKeyNode)) {
      const fields = key.op === "bin" ? [key.args[0], key.args[0], key.args[0]] : key.args.slice(0, 2);
      keyOutputs(key).forEach((name, i) => {
        if (Object.hasOwn(columns, name)) names[name] = fieldTitle(source, fields[i]);
      });
    }
    return names;
  },
  validate(config) {
    removedReduce(
      "Group",
      config,
      'columns={{ mean_x: mean("x") }}',
      'columns={"mean_x": hm.mean("x")}',
    );
    const keys = list(config.by);
    // A bin's or hexagon's columns can't share a name with another key's or with count (a
    // repeated column key still groups by it once).
    const written = keys.filter(isKeyNode).flatMap(keyOutputs);
    const others = [...keys.filter((key) => !isKeyNode(key)), "count"];
    const repeated = written.find(
      (name, i) => written.indexOf(name) !== i || others.includes(name),
    );
    if (repeated !== undefined)
      throw Error(
        `Group: two keys write the column ${JSON.stringify(repeated)}; rename the column with Calculate first, or drop one of the keys.`,
      );
    for (const key of keys.filter(isKeyNode)) validateKey(key);
    // A column key can be read outside a reduction; a bin's columns are written by Group.
    groupColumns(
      config.columns ?? {},
      "Group",
      keys.filter((key) => typeof key === "string"),
      ["count", ...keys.filter(isKeyNode).flatMap(keyOutputs)],
    );
  },
  async run(input, config, context) {
    if (list(config.by).some(isKeyNode)) return groupByKeys(input, config, context);
    const { own, cleanup, cache, evaluator, viewState } = context;
    const by = list(config.by);
    // No key: every row in group 0.
    const groups = by.length
      ? await inputGroups(cache, input, config.by)
      : { count: 1, keys: {}, codes: own(np.zeros([input.length], { dtype: np.int32 })), dispose() {} };
    cleanup(() => groups.dispose());
    // Plain reductions through the compiled kernel; any other expression through the
    // expression path, read at each group's first row.
    const plain = { count: { op: "count" } },
      general = {};
    for (const [name, value] of Object.entries(config.columns ?? {})) {
      const spec = plainReduction(value);
      if (spec) plain[name] = spec;
      else general[name] = value;
    }
    const kernel = groupedReductions(input.scope, plain, {
      codes: groups.codes,
      valid: input.valid,
      total: groups.count,
      length: input.length,
      label: (name) => `Group column ${name}`,
    });
    // Held now: an expression column below can throw.
    const codes = own(kernel.codes),
      shown = kernel.shown ? own(kernel.shown) : null,
      valid = by.length ? shown : null;
    const columns = { ...groups.keys };
    const keep = (out) => {
      for (const [key, column] of Object.entries(out))
        columns[key] = column?.categories
          ? { ...column, codes: own(column.codes) }
          : own(column);
    };
    keep(kernel.columns);
    let columnMetadata = { ...kernel.columnMetadata };
    if (Object.keys(general).length) {
      const rows = own(groupRowsOf(groups.codes, groups.count));
      const out = evaluateGroupColumns(
        groupColumns(general, "Group", by),
        input.scope,
        {
          codes: groups.codes,
          count: groups.count,
          rows,
          length: input.length,
          evaluator,
          viewState,
        },
      );
      keep(out.columns);
      columnMetadata = { ...columnMetadata, ...out.columnMetadata };
    }
    // Every output column in the order given, after the keys and count.
    const ordered = { ...groups.keys, count: columns.count };
    for (const name of Object.keys(config.columns ?? {}))
      ordered[name] = columns[name];
    const provenance = {
      kind: "group",
      codes,
      fields: [...by, "count"],
      ...(input.valid ? { rows: input.scope } : {}),
    };
    // A key column keeps what it is (TODO 53): categories (a calculated day_name) stay
    // categories on an axis, and times (a time_floor) stay times.
    for (const field of by) {
      const metadata = typeof field === "string" ? input.scope.metadata?.(field) : null;
      if (metadata && ["categorical", "ordinal", "boolean", "datetime"].includes(metadata.type)) columnMetadata[field] = metadata;
    }
    return { columns: ordered, columnMetadata, provenance, valid };
  },
};

/**
 * Pivot: a row per group of `by` (one row without it), with a column per category of `field`:
 * `value`, a reduction expression (sum("sales")), over the group's visible rows in that category
 * (NaN for none). The groups come from every row read; those with no visible row are hidden.
 * Every (group, category) cell at once, as one code, through the same reductions as Group
 * (TODO 137.2).
 */
export const pivot = {
  reads: "rows",
  output: "aggregate",
  dependencies: (settings) => ({
    expressions: settings.value === undefined ? [] : [settings.value],
  }),
  validate(config) {
    removedReduce(
      "Pivot",
      config,
      'value={mean("x")}',
      'value=hm.mean("x")',
    );
    if (config.value === undefined)
      throw Error('Pivot needs a value, a reduction such as sum("x").');
    const field = typeof config.value === "string" ? config.value : fieldOf(config.value);
    if (field !== null)
      throw Error(
        `Pivot: value is a reduction now; pass value={sum(${JSON.stringify(field)})} (Python value=hm.sum(${JSON.stringify(field)})).`,
      );
    groupColumns({ [PIVOT_VALUE]: config.value }, "Pivot value", list(config.by), []);
  },
  async run(input, config, { own, cleanup, cache, evaluator, viewState }) {
    const { scope, source, length: n } = input;
    const field = scope.get(config.field);
    if (!categoryColumn(field)) throw Error("Pivot field must be categorical.");
    const categories = field.categories ?? [
      ...new Set(field.filter(isCategory)),
    ];
    const names = config.as ?? categories.map(String);
    if (
      !Array.isArray(names) ||
      names.length !== categories.length ||
      new Set(names).size !== names.length
    )
      throw Error(
        "Pivot output names must be unique and match the pivot domain.",
      );
    const by = list(config.by),
      collisions = names.filter(
        (name) => by.includes(name) || source.has(name),
      );
    if (collisions.length)
      throw Error(`Pivot output collides with source column: ${collisions[0]}`);
    const groups = by.length ? await inputGroups(cache, input, by) : null;
    if (groups) cleanup(() => groups.dispose());
    const columns = groups ? { ...groups.keys } : {};
    const groupCount = groups?.count ?? 1,
      width = categories.length,
      cells = groupCount * width;
    const provenance = { kind: "pivot", fields: [...by, ...names] };
    // A plain reduction of a column (sum("x")) through the compiled kernel; any other through
    // the expression path (groupColumns.js).
    const plain = plainReduction(config.value);
    if (plain && !["any", "all"].includes(plain.op)) {
      if (plain.field !== undefined && categoryColumn(scope.resolve(plain.field)))
        throw Error(
          `Pivot value: ${plain.op}("${plain.field}") reduces a categorical column; the value must be numeric, such as count() or sum("x").`,
        );
      const plan = {
        op: plain.op,
        hidden: Boolean(input.valid),
        groups: groupCount,
        grouped: Boolean(groups),
        width,
      };
      const inputs = {
        // count() counts the rows: a column of ones.
        value:
          plain.field === undefined
            ? np.ones([n], { dtype: np.float32 })
            : numericColumn(scope, plain.field),
        encoded: comparisonColumn(scope, config.field, own).array.ref,
        ...(input.valid ? { valid: input.valid.ref } : {}),
        ...(groups ? { codes: groups.codes.ref } : {}),
      };
      const out = n ? pivotProgram(plan)(inputs) : pivotKernel(plan, inputs);
      out.columns.forEach((column, category) => {
        columns[names[category]] = own(column);
      });
      return { columns, provenance, valid: out.shown ? own(out.shown) : null };
    }
    // A row's cell, group x categories + category; -1 for a row of no group or category.
    const encoded = own(comparisonColumn(scope, config.field, own).array.ref);
    const group = groups ? groups.codes : own(np.zeros([n], { dtype: np.int32 }));
    const member = own(
      np.logicalAnd(group.ref.greaterEqual(0), np.isfinite(encoded.ref)),
    );
    const cell = own(
      np
        .where(
          member.ref,
          group.ref
            .mul(width)
            .add(np.where(member.ref, encoded.ref, 0).astype(np.int32)),
          -1,
        )
        .astype(np.int32),
    );
    const rewritten = {
      ...groupColumns(PIVOT_COUNT, "Pivot", by, []),
      ...groupColumns({ [PIVOT_VALUE]: config.value }, "Pivot value", by, []),
    };
    const rows = own(groupRowsOf(cell, cells));
    const out = evaluateGroupColumns(rewritten, scope, {
      codes: cell,
      count: cells,
      rows,
      length: n,
      evaluator,
      viewState,
    });
    const present = own(out.columns["\u0000count"]);
    const reduced = out.columns[PIVOT_VALUE];
    if (reduced?.codes) {
      reduced.codes.dispose();
      throw Error(
        "Pivot value must be a numeric reduction, such as sum(\"x\") or count().",
      );
    }
    own(reduced);
    // A cell with no visible row is NaN; one whose rows have no finite value reduces as nothing
    // does. A cell with no row at all read another cell's row: its code is not the cell's.
    const ownRow = own(
      np.take(cell.ref, rows.ref, 0).equal(np.arange(cells).astype(np.int32)),
    );
    const table = own(
      np
        .where(
          np.logicalAnd(ownRow.ref, present.ref.greater(0)),
          reduced.ref,
          NaN,
        )
        .astype(np.float32)
        .reshape([groupCount, width]),
    );
    categories.forEach((_, category) => {
      columns[names[category]] = own(table.ref.slice([], category));
    });
    const valid =
      groups && input.valid
        ? own(
            groupsShown(
              groups.codes,
              own(input.valid.ref.greater(0)),
              groupCount,
            ),
          )
        : null;
    return { columns, provenance, valid };
  },
};

/**
 * Pivot's device work for a plan ({ op, hidden, groups: the group count, grouped, width: the
 * category count }), one compiled program per plan (TODO 33.3): every (group, category) cell at
 * once, as one code (TODO 29.7). Consumes `inputs` (value, encoded, valid, codes). Returns the
 * columns (one per category) and, over hidden rows of groups, which groups are shown.
 */
function pivotKernel(plan, { value, encoded, valid, codes }) {
  const { groups: groupCount, width } = plan,
    n = value.shape[0],
    cells = groupCount * width;
  const shown = valid ? valid.greater(0) : null;
  // A row's cell, group x categories + category; -1 for a row in no group, of no category or
  // hidden.
  const group = codes ?? np.zeros([n], { dtype: np.int32 });
  let member = np.logicalAnd(
    group.ref.greaterEqual(0),
    np.isfinite(encoded.ref),
  );
  if (shown) member = np.logicalAnd(member, shown.ref);
  const cell = np
    .where(
      member,
      group.ref
        .mul(width)
        .add(np.where(np.isfinite(encoded.ref), encoded, 0).astype(np.int32)),
      -1,
    )
    .astype(np.int32);
  // A cell with no row is NaN; one whose rows have no finite value reduces as nothing does.
  const ones = np.ones([n], { dtype: np.float32 });
  const present = reduceByCode(cell, ones, cells);
  const reduced = groupReduce(cell, value, plan.op, cells);
  const table = np
    .where(present.greater(0), reduced, np.nan)
    .reshape([groupCount, width]);
  const columns = [];
  for (let category = 0; category < width; category++)
    columns.push(table.ref.slice([], category));
  const out = {
    columns,
    ...(codes && shown ? { shown: groupsShown(codes, shown, groupCount) } : {}),
  };
  for (const a of [table, cell, value, group, shown, ones]) a?.dispose();
  return out;
}
const PIVOTS = new Map();
/** pivotKernel compiled once per plan (utils/programs.js). */
const pivotProgram = (plan) => planProgram(PIVOTS, plan, pivotKernel);
