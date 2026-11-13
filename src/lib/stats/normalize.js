// @ts-check
// Normalize is one Calculate: each row relative to its group's finite, visible values.
import { defineTemplate, node, param, rest, where, equal, dataExpression as expr } from "../templates/define.js";

const field = param("field"), method = param("method");
const options = { __expressionLiteral: true, by: param("by") };
const reduction = op => expr(op, field, options);
const finite = expr("is_finite", field);
const deviation = expr("divide", expr("subtract", field, reduction("mean")), expr("where", expr("greater", reduction("std"), 0), reduction("std"), 1));
const span = expr("subtract", reduction("max"), reduction("min"));
const extent = expr("where", expr("greater", span, 0), expr("divide", expr("subtract", field, reduction("min")), expr("maximum", span, 1e-30)), 0.5);
const divisor = reduction(method);
const ratio = expr("where", expr("not_equal", divisor, 0), expr("divide", field, divisor), NaN);
export default defineTemplate({
  kind: "Normalize",
  params: { field: undefined, method: "deviation", by: undefined, as: "normalized" },
  output: { columns: ["normalized"], groups: "by" },
  settings: {
    field: { option: "field", text: "value" },
    method: { option: "method", options: ["deviation", "extent", "sum", "first", "max"] },
  },
  root: node("Calculate", {
    columns: { normalized: expr("where", finite, where(equal(method, "deviation"), deviation, where(equal(method, "extent"), extent, ratio)), NaN) },
    as: { normalized: param("as") },
    ...rest({ omit: ["children"] }),
  }, [node("Slot")]),
});
