// @ts-check
// The empirical distribution of a column as steps (TODO 47.3, a template since 130.2): the
// internal ECDF transform (no longer public: TODO 137.3), then a Line with curve="step-after",
// one per group of `by`, colored by it.
import { defineTemplate, option, refine, node, param, rest, where, isMissing, coalesce } from "../templates/define.js";

export default defineTemplate({
  kind: "Ecdf",
  signature: {
    tier: "charts",
    summary: "Empirical cumulative distributions as step lines, one per group.",
    extraProps: true,
    use: ["mark", "samplingOption", "maxInstancesOption", "markSettings", "transparent"],
    omit: ["rows", "outlineColor", "outlineColorScale", "outlineWidth", "outlineOpacity", "brush", "drag", "nearby", "ondrag", "ondragend"],
    options: {
      x: option("column", "The column whose distribution is drawn.", { input: false, required: true }),
      by: option("column", "Groups: a step line each, colored by its group."),
      complementary: option("boolean", "Draw the share of values above each value (1 − ECDF) instead of at or below it.", { default: false }),
      normalize: option('"fraction" | "count"', "Measure in fractions of the group or in counts of rows.", { default: "fraction" }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      color: refine({ defaultText: "the by column, when given" }),
      width: refine({ default: 2 }),
    },
  },
  params: { x: undefined, by: undefined, complementary: false, normalize: "fraction", color: undefined },
  theme: { kind: "Ecdf", defaults: { width: 2 }, values: { color: param("color") } },
  describe: { noun: "ECDF plot" },
  root: node("Transform", { kind: "ECDF", x: param("x"), by: param("by"), complementary: param("complementary"), normalize: param("normalize") }, [
    node("Line", {
      x: param("x"), y: "ecdf", curve: "step-after", series: param("by"),
      color: where(isMissing(param("by")), null, coalesce(param("color"), param("by"))),
      ...rest({ omit: ["name"] }),
    }),
  ]),
});
