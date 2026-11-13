// Legacy reference for template parity; not shipped by the library.
import { numericColumn } from "../../../src/lib/plot/utils/dataView.js";
import { orderedRows, orderedColumn, WINDOW_REDUCERS, booleanValues } from "../../../src/lib/plot/utils/columnOperations.js";
import { inputGroups, fieldTitle } from "../../../src/lib/plot/utils/transforms/common.js";

/**
 * Window: each row's reduction over a window of rows. Every window at once over runs of rows
 * (windows.js, TODO 26.7): with `by`, each group's rows in their order (the hidden rows a run of
 * their own); without, the rows, visible first, windows ending at the visible count (from a
 * buffer). Before, a grouped window compacted and reran per group, and min, max, first, last,
 * variance and std reduced one window per dispatch.
 */
export const windowTransform = {
  // Its expression parameters, evaluated before it runs (TODO 138.2).
  parameters: { size: { type: "expression", integer: true } },
  // Props that take a column name or one number per row (runner.js alignedFields).
  fields: ["field"],
  reads: (config) => (config.by ? "rows" : "visibleFirst"),
  output: "sameRows",
  // A window's mean, sum, min, std, ... is in the field's units; its count is a count; a
  // variance (squared units) and any/all (flags) are unnamed.
  names: (config, source) => {
    const reduce = config.reduce ?? "mean";
    return { [config.as ?? "smoothed"]: reduce === "count" ? "count" : ["variance", "any", "all"].includes(reduce) ? null : fieldTitle(source, config.field) };
  },
  validate(config) {
    const size = config.size ?? 5;
    if (
      !Number.isInteger(size) ||
      size < 1 ||
      !WINDOW_REDUCERS.has(config.reduce ?? "mean") ||
      !["trailing", "leading", "center"].includes(config.align ?? "trailing")
    )
      throw Error("Invalid window size, reducer, or alignment.");
  },
  async run(input, config, { own, cleanup, cache }) {
    const boolean = config.reduce === "any" || config.reduce === "all";
    const source = boolean ? input.scope.resolve(config.field) : null;
    const x = boolean ? booleanValues({ value: source, metadata: input.scope.metadata?.(config.field) }, own, config.reduce)
      : own(numericColumn(input.scope, config.field));
    const groups = config.by ? await inputGroups(cache, input, config.by) : null;
    if (groups) cleanup(() => groups.dispose());
    const options = { ...config, reduce: config.reduce ?? "mean", align: config.align ?? "trailing" };
    const shown = input.valid && (groups || options.orderBy || !input.prefix) ? own(input.valid.ref.greater(0)) : null;
    const rows = orderedRows(input.scope, options, groups ? { codes: groups.codes, groups: groups.count } : null, shown, own,
      { operation: "window", prefixCount: input.valid && input.prefix ? input.count : undefined });
    const reduced = orderedColumn("window", { value: x, metadata: { type: "numeric" } }, input.scope,
      options, config.size ?? 5, rows, own);
    // Which rows are visible sets every window: the values follow the mask.
    return {
      columns: { [config.as ?? "smoothed"]: reduced.value },
      columnMetadata: { [config.as ?? "smoothed"]: reduced.metadata },
      followsMask: true,
    };
  },
};
