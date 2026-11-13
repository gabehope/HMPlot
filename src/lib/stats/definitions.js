// Runner adapters for declarative statistical templates. Parameter metadata stays literal so
// the Python generator can read it without initializing a renderer.
import { transformTemplate } from "../templates/transform.js";
import { fieldTitle } from "../plot/utils/transforms/common.js";
import { calculate } from "../plot/utils/transforms/calculate.js";
import normalizeTemplate from "./normalize.js";
import windowTemplate from "./window.js";

export const normalize = { ...transformTemplate(normalizeTemplate, calculate), fields: ["field"] };
export const windowTransform = {
  ...transformTemplate(windowTemplate, calculate),
  fields: ["field"],
  reads: config => config.by ? "rows" : "visibleFirst",
  buckets: undefined,
  names: (config, source) => {
    const reduce = config.reduce ?? "mean";
    return { [config.as ?? "smoothed"]: reduce === "count" ? "count" :
      ["variance", "any", "all"].includes(reduce) ? null : fieldTitle(source, config.field) };
  },
  parameters: { size: { type: "expression", integer: true } },
};
