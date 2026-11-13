// Descriptions of plots (TODO 49): a generated summary, in English, of what a plot shows, for
// its accessible description, its exports' metadata and Python's plot.description. Pure: the
// Plot gathers a model of its marks, axes and legend entries, and this writes the text.

import { format } from "d3";
import { formatDatetime } from "./datetime.js";
import { TEMPLATES } from "../../templates/builtins.js";

/** The Plot's registry of its marks' description entries (namedMark registers into it). */
export const DESCRIPTION_CONTEXT = Symbol("plot description");
/** Set by a compound mark's ThemeDefaults: its parts describe themselves as the compound. */
export const COMPOUND_DESCRIPTION_CONTEXT = Symbol("compound description");

/**
 * An axis's domain for a description, formatted as its ticks are: `bounds` ([low, high] in the
 * axis's units; a datetime axis's count from `timeOrigin`), to the precision of the tick `step`;
 * a band axis's `categories` instead. null when unknown.
 * @param {object} [axis]
 * @param {number[]} [axis.bounds]
 * @param {number} [axis.step]
 * @param {string} [axis.type]
 * @param {string} [axis.transform]
 * @param {number} [axis.timeOrigin]
 * @param {string} [axis.pattern]
 * @param {string} [axis.timezone]
 * @param {unknown[]} [axis.categories]
 * @param {"top" | "bottom"} [axis.first] where a y axis's first category is (TODO 136.15)
 */
export function describeAxis({ bounds, step, type, transform, timeOrigin = 0, pattern, timezone, categories, first } = {}) {
  if (categories?.length) return { categories: [...categories], ...(first ? { first } : {}) };
  if (!Array.isArray(bounds) || bounds.length < 2 || !bounds.every(Number.isFinite)) return null;
  const low = Math.min(bounds[0], bounds[1]), high = Math.max(bounds[0], bounds[1]);
  if (type === "datetime") {
    // The dates in full (with the year), and the time of day over spans under two days.
    const full = pattern || (high - low < 2 * 86400000 ? "%b %d, %Y %H:%M" : "%b %d, %Y");
    return { kind: "datetime", low: formatDatetime(low + timeOrigin, full, timezone, high - low), high: formatDatetime(high + timeOrigin, full, timezone, high - low) };
  }
  const kind = ["log", "sqrt", "symlog"].includes(transform) ? transform : "numeric";
  const digits = kind === "numeric" && step > 0 ? Math.max(0, Math.min(12, -Math.floor(Math.log10(step) + 1e-9))) : null;
  const text = (value) => pattern ? format(pattern)(value)
    : digits === null ? format(".4~g")(value) : String(Number(value.toFixed(digits)) || 0);
  return { kind, low: text(low), high: text(high) };
}

// What each mark kind is called, as the chart it makes; null leaves it out (interactive or
// invisible parts).
const NOUNS = {
  Points: "scatter plot", Points3D: "3D scatter plot",
  Line: "line chart", Area: "area chart", Rect: "rectangles", Prism: "bars",
  Histogram: "histogram", Heatmap: "heatmap", Image: "image", Surface: "surface", Text: "labels",
  Text3D: "text", Segments: "segments", Arrows3D: "arrows",
  ErrorBars: "error bars",
  GeoJSON: "map", VectorTile: "map tiles",
  Polygon: "polygons",
  Crosshair: null, Anchor: null,
  // A built-in template's parts describe themselves as its theme kind (TODO 130.2).
  ...Object.fromEntries(TEMPLATES.filter((definition) => definition.theme && definition.describe?.noun !== undefined)
    .map((definition) => [definition.theme.kind, definition.describe.noun])),
};
// Rows as what they are: points, bars, lines...
const UNITS = {
  Points: ["point", "points"], Points3D: ["point", "points"],
  Rect: ["rectangle", "rectangles"], Prism: ["bar", "bars"], Text: ["label", "labels"],
  Segments: ["segment", "segments"], Arrows3D: ["arrow", "arrows"],
  GeoJSON: ["feature", "features"],
  ...Object.fromEntries(TEMPLATES.filter((definition) => definition.theme && definition.describe?.units)
    .map((definition) => [definition.theme.kind, definition.describe.units])),
};
/** How many categories a list names before "and N more". */
export const LISTED = 8;

const capitalize = (text) => text ? text[0].toUpperCase() + text.slice(1) : text;
const count = (n, [one, many]) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** A list of names, the first eight, then "and N more". */
export function listed(values, limit = LISTED) {
  const names = values.map(String);
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
}

function markPhrase(mark) {
  const noun = NOUNS[mark.kind] ?? (mark.kind ? mark.kind.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase() : "marks");
  const { x, y, z } = mark;
  let text;
  if (mark.kind === "Histogram") text = `${noun}${x ? ` of ${x}` : y ? ` of ${y}` : ""}${mark.rows ? ` in ${count(mark.rows, ["bin", "bins"])}` : ""}`;
  else if (mark.kind === "Heatmap" || mark.kind === "Image") text = `${noun}${mark.fill ? ` of ${mark.fill}` : ""}${x && y ? ` over ${x} and ${y}` : ""}`;
  else if (mark.kind === "Pie") text = `${noun}${mark.value ? ` of ${mark.value}` : ""}${mark.category ? ` by ${mark.category}` : ""}`;
  else if (y && x) text = `${noun} of ${y} against ${x}${z ? ` and ${z}` : ""}`;
  else if (y || x) text = `${noun} of ${y ?? x}`;
  else text = noun;
  const encodings = [];
  for (const channel of ["fill", "color"]) {
    if (!mark[channel] || mark.kind === "Heatmap" || mark.kind === "Image") continue;
    const categories = mark.categories?.[channel];
    encodings.push(`colored by ${mark[channel]}${categories?.length ? ` (${listed(categories)})` : ""}`);
    break;
  }
  if (mark.size) encodings.push(`sized by ${mark.size}`);
  if (mark.shape) encodings.push(`shaped by ${mark.shape}`);
  return encodings.length ? `${text}, ${encodings.join(", ")}` : text;
}

const AXIS_NAMES = {
  cartesian: { x: "x", y: "y", z: "z" },
  polar: { x: "angle", y: "radius", z: "z" },
  spherical: { x: "longitude", y: "latitude", z: "z" },
};

function axisPhrase(name, axis) {
  if (axis.categories?.length)
    return `${name}${name === "y" && axis.first ? (axis.first === "top" ? " (top to bottom)" : " (bottom to top)") : ""}: ${listed(axis.categories)}`;
  if (axis.low === undefined || axis.high === undefined) return null;
  const scale = ["log", "sqrt", "symlog"].includes(axis.kind) ? ` (${axis.kind} scale)` : "";
  return `${name} from ${axis.low} to ${axis.high}${scale}`;
}

/**
 * The description of a plot from its model:
 * - marks: [{ kind, x, y, z, fill, color, size, shape (column titles), categories: { fill: [...] },
 *   rows }], in the order written (the first is the main one);
 * - axes: { x, y, z: { low, high (formatted like the ticks), kind ("numeric", "datetime", "log",
 *   ...), categories } };
 * - coordinates ("cartesian", "polar", "spherical"), mode ("2d", "3d"), projection;
 * - facet: { cells, by } for a faceted plot; moving: "animated" | "simulated" when it moves.
 */
export function describePlot(model = {}) {
  const marks = (model.marks ?? []).filter((mark) => NOUNS[mark.kind] !== null);
  const sentences = [];
  if (marks.length) {
    // Parts that say the same thing once: a line and its points over the same columns.
    const phrases = [...new Set(marks.map(markPhrase))];
    const shown = phrases.slice(0, 3);
    let chart = capitalize(shown[0]);
    if (shown.length > 1) chart += `, with ${shown.slice(1).join(" and ")}`;
    if (phrases.length > 3) chart += ` and ${phrases.length - 3} more ${phrases.length - 3 === 1 ? "layer" : "layers"}`;
    if (model.coordinates === "spherical" && model.projection)
      chart += model.projection === "orthographic" ? ", on a globe" : `, in the ${model.projection} projection`;
    else if (model.coordinates === "polar") chart += ", in polar coordinates";
    if (model.mode === "3d" && !/3D/.test(chart)) chart += ", in 3D";
    sentences.push(`${chart}.`);
  } else sentences.push("An empty plot.");
  const names = AXIS_NAMES[model.coordinates] ?? AXIS_NAMES.cartesian;
  const axes = ["x", "y", ...(model.mode === "3d" ? ["z"] : [])]
    .map((axis) => model.axes?.[axis] ? axisPhrase(names[axis], model.axes[axis]) : null).filter(Boolean);
  if (axes.length) sentences.push(`${axes.join(", ")}.`);
  const main = marks[0];
  if (main && Number.isFinite(main.rows) && main.kind !== "Histogram")
    sentences.push(`${capitalize(count(main.rows, UNITS[main.kind] ?? ["row", "rows"]))}.`);
  if (model.facet?.cells > 1)
    sentences.push(`In ${model.facet.cells} panels${model.facet.by?.length ? ` by ${model.facet.by.join(" and ")}` : ""}.`);
  if (model.moving === "animated") sentences.push("It is animated; this describes it at rest.");
  else if (model.moving === "simulated") sentences.push("It moves as a simulation runs; this describes it at rest.");
  return sentences.join(" ");
}

/**
 * A document title for a scene state's tree (HTML exports, TODO 49): the first Title's text or
 * Plot title in it, {$name} filled from the inputs' values in the same state; else "HMPlot".
 */
export function stateTitle(root) {
  const values = new Map(), nodes = [];
  const walk = (node) => {
    if (!node) return;
    nodes.push(node);
    if (typeof node.props?.name === "string" && "value" in (node.props ?? {})) values.set(node.props.name, node.props.value);
    (node.children ?? []).forEach(walk);
  };
  walk(root);
  const node = nodes.find((item) => (item.kind === "Title" && typeof item.props?.text === "string" && item.props.text.trim()) ||
    (item.kind === "Plot" && typeof item.props?.title === "string" && item.props.title.trim()));
  if (!node) return "HMPlot";
  const text = node.kind === "Title" ? node.props.text : node.props.title;
  return text.replace(/\{\$([A-Za-z_]\w*)\}/g, (match, name) => (values.has(name) ? String(values.get(name)) : match))
    .replace(/\s*\n\s*/g, " ").trim();
}

/** An author's description and the generated one: the author's first, then (describe) the generated. */
export function plotDescription(description, generated, describe = true) {
  const own = typeof description === "string" ? description.trim() : "";
  if (!describe) return own;
  return own ? `${own}${/[.!?]$/.test(own) ? "" : "."} ${generated}` : generated;
}
