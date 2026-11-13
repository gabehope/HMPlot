// @ts-check
// Existing datetime arithmetic aligns the endpoint origins before Prism draws a flat band.
import { dataExpression as expr, defineChart, following, isMissing, node, not, option, param, rest, where } from "../templates/define.js";

export default defineChart({
  kind: "IntervalTimeline",
  summary: "Task intervals on categorical rows, with optional milestone points.",
  use: ["mark", "markSettings", "transparent"],
  omit: ["x", "z", "position", "rows", "color", "colorScale", "colormap", "size", "sizeScale", "width", "widthScale", "brush", "drag", "nearby", "ondrag", "ondragend"],
  usage: "Each row supplies task category `y`, start `x0` and end `x1`, in numeric units or datetime columns. The main part is a flat Prism spanning those endpoints, with overlapping intervals rather than stacking; use distinct categories for separate lanes. Equal endpoints have zero area. Reversed endpoints still span their two values; the template does not validate schedules. `milestone` optionally supplies one point per task (missing values omit that point); `milestones={...}` styles the Points part, diamond-shaped by default. Main-part props style the interval Prism. Dates preserve their time metadata; set the host Plot's x type to datetime and its origin to the first start for a time axis (as the paired example does). No scheduling or lane-allocation algorithm runs.",
  params: {
    y: option("channel", "The categorical task or lane for each interval.", { required: true, input: true }),
    x0: option("channel", "The start of each interval, as numeric or datetime values.", { required: true, input: true }),
    x1: option("channel", "The end of each interval, in the same units as x0.", { required: true, input: true }),
    milestone: option("channel", "Optional milestone x values, one per task; missing values draw no point."),
    milestones: option("object", "Props of the milestone Points part, such as shape, size and fill.", { ts: '{ fill?: MarkProps["fill"]; shape?: MarkProps["shape"]; size?: MarkProps["size"]; opacity?: MarkProps["opacity"]; outlineColor?: MarkProps["outlineColor"]; outlineWidth?: MarkProps["outlineWidth"]; visible?: MarkProps["visible"]; label?: MarkProps["label"]; }' }),
    bandFraction: option("number", "The share of each task's category band filled by its interval.", { default: 0.6 }),
    data: option("table", "A table for this chart alone.", { languages: "python" }),
  },
  parts: ["milestones"],
  root: node("Mapping", {}, [
    node("Calculate", { columns: {
      __timelineCenter: expr("add", param("x0"), expr("multiply", expr("subtract", param("x1"), param("x0")), 0.5)),
      __timelineSpan: expr("abs", expr("subtract", param("x1"), param("x0"))),
      // Put the optional date on the same origin as the interval center before binding axes.
      __timelineMilestone: where(isMissing(param("milestone")), NaN,
        expr("add", param("x0"), expr("subtract", param("milestone"), param("x0")))),
    } }, [
      node("Prism", { x: "__timelineCenter", y: param("y"), width: "__timelineSpan", depth: param("bandFraction"), z0: 0, z1: 0, axis: "z", ...rest() }, [], { id: "interval", main: true }),
      node("Points", { ...following(), x: "__timelineMilestone", y: param("y"), shape: "diamond", size: 6, fill: "#30343b", legend: false }, [], { id: "milestones", when: not(isMissing(param("milestone"))) }),
    ]),
  ]),
});
