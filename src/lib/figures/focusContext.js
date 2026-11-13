// @ts-check
// A focus plot over a context strip (TODO 136.16 slice 2), as Vega's and Observable's
// overview+detail examples draw it: the same lines twice in a ViewGrid (an alignment group), the
// strip below showing the whole series; a drag across the strip brushes an x interval, and the
// focus's x domain is that interval (the brush's bounds, @brush_min:x and @brush_max:x, as a
// domain read from the data: dataDomains.svelte.js), automatic while there is no brush. The
// caller's other props go to the focus's Line (the main part) and its children into the focus.
import { add, dataExpression as expr, defineTemplate, node, param, prop, rest, slot } from "../templates/define.js";

/** An end of the brushed interval on x: its bound, the same on every row, reduced to one value. */
const bound = (/** @type {"min" | "max"} */ end) => expr(end, add(`@brush_${end}:`, param("x")));

export default defineTemplate({
  kind: "FocusContext",
  // The wrapper (focusContext.svelte) turns height into the grid's rows, gap and each Plot's height.
  params: { x: undefined, y: undefined, series: undefined, viewport: undefined, rows: undefined, gap: undefined, mainHeight: undefined, contextHeight: undefined },
  root: node("ViewGrid", { rows: param("rows"), areas: '"main" "context"', gap: param("gap") }, [
    node("ViewCell", { area: "main" }, [
      node("Plot", { height: param("mainHeight"), responsive: true, viewport: param("viewport"), x: { domain: [bound("min"), bound("max")] } }, [
        node("Line", { x: param("x"), y: param("y"), series: param("series"), respond: false, ...rest() }),
        slot(),
      ], { id: "main" }),
    ]),
    node("ViewCell", { area: "context" }, [
      // No pan or zoom of its own: a plain drag brushes it (brushController), and its y axis is a shape.
      node("Plot", { height: param("contextHeight"), responsive: true, interactive: false, legend: false, y: { visible: false, grid: "off" } }, [
        node("Line", { x: param("x"), y: param("y"), series: param("series"), color: prop("color"), colorScale: prop("colorScale"),
          width: 1, brush: { axis: "x" }, respond: false }),
      ], { id: "context" }),
    ]),
  ]),
});
