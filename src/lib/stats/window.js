// @ts-check
// Window is one Calculate over the ordered window expression; the caller's children see it.
import { defineTemplate, node, param, rest, dataExpression } from "../templates/define.js";

export default defineTemplate({
  kind: "Window",
  params: { field: undefined, size: 5, reduce: "mean", align: "trailing", by: undefined, as: "smoothed" },
  output: { columns: ["smoothed"], groups: "by" },
  settings: {
    size: { option: "size", text: true },
    reduce: { option: "reduce", options: ["count", "sum", "mean", "min", "max", "first", "last", "variance", "std", "any", "all"] },
  },
  root: node("Calculate", {
    columns: { smoothed: dataExpression("window", param("field"), {
      __expressionLiteral: true, by: param("by"), reduce: param("reduce"), align: param("align"),
    }, param("size")) },
    as: { smoothed: param("as") },
    ...rest({ omit: ["children"] }),
  }, [node("Slot")]),
});
