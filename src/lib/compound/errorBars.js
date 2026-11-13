// @ts-check
// Error bars (a template since TODO 130.3): one Segments with bar caps per row, from lower to
// upper along the value axis (y, or x with orientation="horizontal") at the row's position across
// it. A row whose upper is below its lower, or with a missing bound, is not drawn: both its ends are
// missing. Given `position` (a column of positions or an N x 2 / N x 3 array), the value axis's
// component of each end is replaced by the bound; given x, y and z, the ends are composed from
// them. In its own spherical frame a bar follows a meridian or a parallel (angular). Arrays given
// without a column name read as the columns of a table of the bars' own (_table, from the
// wrapper): the bounds are data expressions, which read a Data scope.
import { defineTemplate, option, refine, node, param, rest, where, equal, isMissing, dataExpression } from "../templates/define.js";

const horizontal = equal(param("orientation"), "horizontal");
const z = isMissing(param("z"));
// The bound `end` ("lower" or "upper"), missing where the interval is reversed. Always an
// expression, so the ends compose even from arrays alone (namedData's composedVector).
/** @param {"lower" | "upper"} end */
const bound = (end) => dataExpression("where", dataExpression("less_equal", param("lower"), param("upper")), param(end), NaN);
/** Each bar's end at `end`. @param {"lower" | "upper"} end */
const at = (end) => where(isMissing(param("position")),
  where(horizontal,
    where(z, [bound(end), param("y")], [bound(end), param("y"), param("z")]),
    where(z, [param("x"), bound(end)], [param("x"), bound(end), param("z")])),
  dataExpression("with_component", param("position"), where(horizontal, 0, 1), bound(end)));

export default defineTemplate({
  kind: "ErrorBars",
  signature: {
    tier: "charts",
    summary: "Error bars: an interval with caps at each row, such as a confidence interval.",
    extraProps: true,
    use: ["mark", "maxInstancesOption", "markSettings", "transparent"],
    omit: ["outlineColor", "outlineColorScale", "outlineWidth", "outlineOpacity", "brush", "drag", "fill", "fillScale", "nearby", "ondrag", "ondragend", "size", "sizeScale"],
    options: {
      position: option("channel", "Each bar's point as one column of positions or an N x 2 (N x 3) array, instead of x and y."),
      x: option("channel", "Each bar's x position; horizontal bars run from lower to upper along x instead."),
      y: option("channel", "Each bar's y position; vertical bars run from lower to upper along y instead."),
      lower: option("channel", "Where each bar starts, in its axis's units (not a distance from the point).", { input: true, required: true }),
      upper: option("channel", "Where each bar ends, in its axis's units; a bar whose upper is below its lower is not drawn.", { input: true, required: true }),
      orientation: option('"vertical" | "horizontal"', "Whether the bars run along y or along x.", { default: "vertical", ts: '"horizontal" | "vertical"' }),
      capSize: option("number", "The length of the caps across each bar's ends.", { default: 6, units: "px" }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
      color: refine({ defaultText: "the theme's (#3478c7 in the default theme)" }),
      width: refine({ defaultText: "the theme's (1 in the default theme)" }),
    },
  },
  params: { _table: undefined, position: undefined, x: undefined, y: undefined, z: undefined, lower: undefined, upper: undefined, orientation: "vertical" },
  // Beneath a compound's theme layer (as BoxPlot's whiskers' layer is), as when it was a
  // primitive mark; its caller's color and width reach the Segments as props.
  theme: { kind: "ErrorBars", defaults: { color: "#30343b", width: 1, opacity: 1 }, only: ["color", "width", "capSize", "opacity"], beneath: true },
  label: "Error bars",
  describe: { noun: "error bars", units: ["error bar", "error bars"] },
  root: node("DataBoundary", { data: param("_table") }, [
    node("Segments", { start: at("lower"), end: at("upper"), cap: "bar", interpolation: "angular", ...rest() }),
  ]),
});
