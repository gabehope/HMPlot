// Tooltips (TODO 44): which fields a mark's tooltip shows, a row's values, and their text. The
// row comes from a tolerant pick (picking/tolerantPick.js); the box is the view's (viewCore).
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { MODEL_CALENDARS, modelCalendar, formatModel } from "./modelCalendars.js";
import { format } from "d3";
import { isExpression, expressionFields } from "./expressions.js";
import { formatDatetime } from "./datetime.js";
import { valueLabel } from "./numberLabels.js";
import { isGridDescriptor, descriptorValue } from "./gridModel.js";

/** A Plot's tooltip setting, the default of the marks in it (viewCore sets it). */
export const TOOLTIP_CONTEXT = Symbol("tooltip");
export const DEFAULT_TOOLTIP_RADIUS = 16;

/** The cell of a [height, width, ...] grid at `uv` (0 to 1 across each), as [row, column]. */
export function gridCell(shape, uv) {
  const [height, width] = shape;
  const clamp = (value, size) => Math.min(size - 1, Math.max(0, Math.floor(value * size)));
  return [clamp(uv.y, height), clamp(uv.x, width)];
}

/**
 * The values of a grid's cell (one per channel of an image): from host values, else read back once.
 * @returns {Promise<number[] | null>}
 */
export async function gridValues(grid, cell) {
  const source = grid?.codes ?? grid;
  if (Array.isArray(source)) {
    const value = source[cell[0]]?.[cell[1]];
    return value === undefined ? null : Array.isArray(value) ? value.map(Number) : [Number(value)];
  }
  if (!(source instanceof JaxArray) || source.shape.length < 2) return null;
  const [height, width] = source.shape, channels = source.shape.slice(2).reduce((a, b) => a * b, 1);
  const flat = source.ref.reshape([height * width, channels]);
  const at = np.array([cell[0] * width + cell[1]], { dtype: np.int32 });
  return Array.from(await np.take(flat, at, 0).astype(np.float32).data());
}
// The channels whose columns a tooltip lists by default, in this order.
const CHANNELS = ["x", "y", "z", "x0", "x1", "y0", "y1", "lower", "upper", "fill", "color", "size", "shape",
  "opacity", "width", "text", "series"];
const SETTING_KEYS = new Set(["fields", "radius", "content", "mode"]);

function tooltipField(item, where) {
  if (typeof item === "string") return { field: item };
  if (item && typeof item === "object" && typeof item.field === "string") {
    for (const key of Object.keys(item))
      if (!["field", "label", "format"].includes(key))
        throw Error(`${where} fields take { field, label, format }, not ${key}.`);
    return { field: item.field, label: item.label, format: item.format };
  }
  throw Error(`${where} fields are column names or { field, label, format }.`);
}

/**
 * A mark's tooltip, from its own `tooltip` or else its Plot's: null (none), or { fields (null:
 * the columns its channels read), radius (CSS pixels), content (a Svelte snippet) }.
 */
export function tooltipSetting(value, plotDefault = undefined, where = "tooltip") {
  const given = value === undefined ? plotDefault : value;
  if (given === undefined || given === null || given === false) return null;
  if (given === true) return { fields: null, radius: DEFAULT_TOOLTIP_RADIUS, content: null };
  if (Array.isArray(given)) return { fields: given.map((item) => tooltipField(item, where)), radius: DEFAULT_TOOLTIP_RADIUS, content: null };
  if (typeof given === "object") {
    for (const key of Object.keys(given))
      if (!SETTING_KEYS.has(key)) throw Error(`${where} takes fields, radius, content and mode, not ${key}.`);
    const radius = given.radius ?? DEFAULT_TOOLTIP_RADIUS;
    if (typeof radius !== "number" || !(radius >= 0)) throw Error(`${where}.radius must be a number of pixels, 0 or more.`);
    if (given.mode !== undefined && given.mode !== "x" && given.mode !== "row")
      throw Error(`${where}.mode must be "row" (the default) or "x".`);
    return {
      fields: given.fields === undefined ? null : given.fields.map((item) => tooltipField(item, where)),
      radius,
      content: given.content ?? null,
    };
  }
  throw Error(`${where} must be true, a list of fields, or { fields, radius, content }.`);
}

/**
 * A mark's nearest (TODO 72), from its own `nearest` or else its Plot's: null (none), or
 * { selection (true: its data's nearest; or a selection()), radius (CSS pixels; undefined: the
 * tooltip's, else 16) }.
 */
export function nearestSetting(value, plotDefault = undefined, where = "nearest") {
  const given = value === undefined ? plotDefault : value;
  if (given === undefined || given === null || given === false) return null;
  if (given === true || given?.isSelection) return { selection: given, radius: undefined };
  if (typeof given === "object" && !Array.isArray(given)) {
    for (const key of Object.keys(given))
      if (key !== "selection" && key !== "radius") throw Error(`${where} takes selection and radius, not ${key}.`);
    if (given.selection !== undefined && given.selection !== true && !given.selection?.isSelection)
      throw Error(`${where}.selection must be a selection(), or true for its data's.`);
    if (given.radius !== undefined && (typeof given.radius !== "number" || !(given.radius >= 0)))
      throw Error(`${where}.radius must be a number of pixels, 0 or more.`);
    return { selection: given.selection ?? true, radius: given.radius };
  }
  throw Error(`${where} must be true, a selection(), or { selection, radius }.`);
}

/** A Plot's tooltip mode: "x" (unified x: every series at the pointer's x) or "row". */
export const tooltipMode = (value) => (value && typeof value === "object" && !Array.isArray(value) && value.mode === "x" ? "x" : "row");

/**
 * The fields a tooltip lists when none are given: the columns the mark's channels read (an
 * expression's columns too), in channel order, each once; view state and interaction columns
 * ("@...") are left out. An expression x, y or z also shows its plotted value (`plotted`).
 */
export function defaultFields(props, scope) {
  const fields = [], seen = new Set();
  const add = (field) => {
    if (typeof field !== "string" || field.startsWith("@") || seen.has(field) || !scope?.has?.(field)) return;
    seen.add(field);
    fields.push({ field });
  };
  // Ends composed of per-axis values (a rule's, an error bar's) list the columns they read.
  for (const end of ["start", "end"])
    if (Array.isArray(props[end]))
      for (const item of props[end]) {
        // An error bar's own table of arrays (its "__" columns) lists nothing, as arrays don't.
        if (typeof item === "string") { if (!item.startsWith("__")) add(item); }
        else if (isExpression(item)) for (const field of expressionFields(item)) if (!field.startsWith("__")) add(field);
      }
  for (const channel of CHANNELS) {
    const value = props[channel];
    if (typeof value === "string") add(value);
    else if (isExpression(value)) {
      for (const field of expressionFields(value)) add(field);
      if (["x", "y", "z"].includes(channel)) fields.push({ plotted: channel, label: channel });
    }
  }
  return fields;
}

const missing = (value) => value === null || value === undefined || (typeof value === "number" && Number.isNaN(value));

/** A duration in milliseconds as its two largest units ("2 d 3 h", "4.2 s"). */
export function formatDuration(ms) {
  const sign = ms < 0 ? "−" : "", value = Math.abs(ms);
  const units = [["d", 86400000], ["h", 3600000], ["min", 60000], ["s", 1000]];
  for (let i = 0; i < units.length; i++) {
    const [name, size] = units[i];
    if (value < size) continue;
    if (name === "s") return `${sign}${format(".3~g")(value / 1000)} s`;
    const whole = Math.floor(value / size), rest = value - whole * size, [next, nextSize] = units[i + 1];
    const part = Math.floor(rest / nextSize);
    return `${sign}${whole} ${name}${part ? ` ${part} ${next}` : ""}`;
  }
  return `${sign}${format(".3~g")(value)} ms`;
}

/**
 * A value as a tooltip writes it: a number in `pattern` (a d3-format string), else the theme's
 * `numberFormat` (theme.numbers.format), else readably as ticks write numbers (valueLabel: four
 * significant digits, integers exact, thousands grouped from 10,000; TODO 132.4); a datetime
 * (milliseconds from `meta.origin`) in its zone with as much of the time of day as it has (or a
 * %-pattern), a duration in its two largest units, a category or boolean as it is. A missing
 * value reads "—".
 * @param {{type?: string, origin?: number, timezone?: string, calendar?: string, calendarUnits?: string} | null | undefined} [meta]
 * @param {string} [pattern] @param {string} [numberFormat]
 */
export function formatValue(value, meta = undefined, pattern = undefined, numberFormat = undefined) {
  if (missing(value)) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return String(value);
  if (meta?.type === "datetime") {
    const ms = value + (meta.origin ?? 0), zone = meta.timezone ?? "UTC";
    if (pattern) return formatDatetime(ms, pattern, zone);
    const clock = formatDatetime(ms, "%H:%M:%S.%L", zone);
    const shown = clock === "00:00:00.000" ? "%b %d, %Y" : clock.endsWith(":00.000") ? "%b %d, %Y %H:%M"
      : clock.endsWith(".000") ? "%b %d, %Y %H:%M:%S" : "%b %d, %Y %H:%M:%S.%L";
    return formatDatetime(ms, shown, zone);
  }
  if (meta?.type === "duration") return pattern ? format(pattern)(value) : formatDuration(value);
  // A model calendar's time (TODO 53.6): its date in that calendar.
  if (MODEL_CALENDARS.includes(meta?.calendar)) {
    const cal = modelCalendar({ name: meta.calendar, units: meta.calendarUnits });
    const whole = Math.abs(value * cal.days - Math.round(value * cal.days)) < 1e-6;
    return formatModel(cal, value, pattern ?? (whole ? "%b %-d, %Y" : "%b %-d, %Y %H:%M"));
  }
  const chosen = pattern || numberFormat;
  return chosen ? format(chosen)(value) : valueLabel(value);
}

/**
 * A position on an axis as a tooltip writes it: in the axis's own `format` (a d3-format string, or
 * a %-pattern on a datetime axis), else as formatValue writes it, `numberFormat` (the theme's)
 * before the readable default (TODO 132.4).
 * @param {unknown} value
 * @param {{ type?: string, format?: string, timeOrigin?: number, timezone?: string } | null | undefined} config readAxis's
 * @param {string} [numberFormat]
 */
export function axisValueText(value, config, numberFormat = undefined) {
  const meta = config?.type === "datetime" ? { type: "datetime", origin: config.timeOrigin, timezone: config.timezone } : undefined;
  return formatValue(value, meta, config?.format || undefined, numberFormat);
}

/**
 * The values of `fields` at a row of `scope`: `row` indexes the scope's rows (the pick's
 * instance). Host values are read directly (a table's own columns, exact datetimes); the rest are
 * gathered into one array and read back once. Returns { field: value } (categories as their
 * values, missing as null).
 * @returns {Promise<Record<string, unknown>>}
 */
export async function rowValues(scope, fields, row) {
  const values = {}, gathered = [];
  for (const field of fields) {
    if (!scope?.has?.(field)) { values[field] = null; continue; }
    const host = scope.identityRows ? scope.hostColumn?.(field) : undefined;
    // A grid coordinate: its value at the row, from the grid (TODO 51).
    if (isGridDescriptor(host)) { values[field] = descriptorValue(host, row) ?? null; continue; }
    const column = host ?? scope.get(field);
    const categories = column?.categories;
    const source = categories ? column.codes : column;
    if (source instanceof JaxArray) gathered.push({ field, categories, source });
    else if (source && row < source.length) values[field] = decode(source[row], categories);
    else values[field] = null;
  }
  if (gathered.length) {
    const index = np.array([row], { dtype: np.int32 });
    const parts = gathered.map(({ source }) => np.take(source.ref, index.ref, 0).astype(np.float32));
    index.dispose();
    const all = np.concatenate(parts);
    const read = await all.data();
    gathered.forEach(({ field, categories }, i) => (values[field] = decode(read[i], categories)));
  }
  return values;
}
function decode(value, categories) {
  if (categories) {
    const code = Math.round(Number(value));
    return code >= 0 && code < categories.length ? categories[code] : null;
  }
  if (typeof value === "bigint") return value;
  return missing(value) ? null : value;
}

/**
 * The lines of a tooltip: { label, text } per field, in order. `values` are the row's values by
 * field, `plotted` the mark's plotted position by channel (x, y, z), `meta(field)` a column's
 * metadata, `name(field)` its display name and `numberFormat` the theme's number format.
 * @param {{ field?: string, plotted?: string, label?: string, format?: string }[]} fields
 * @param {Record<string, unknown>} values
 * @param {{ meta?: (field: string) => unknown, name?: (field: string) => string | undefined,
 *   plotted?: Record<string, unknown>, axisMeta?: (axis: string) => unknown, numberFormat?: string }} [options]
 * @returns {{ label: string, text: string }[]}
 */
export function tooltipLines(fields, values, { meta = () => undefined, name = (field) => field, plotted = {}, axisMeta = () => undefined, numberFormat = undefined } = {}) {
  const lines = fields.map((item) => {
    if (item.plotted) return { label: item.label ?? item.plotted, text: formatValue(plotted[item.plotted], axisMeta(item.plotted), item.format, numberFormat) };
    return { label: item.label ?? name(item.field) ?? item.field, text: formatValue(values[item.field], meta(item.field), item.format, numberFormat) };
  });
  // An interval's two ends under one name (a Histogram bar's x0 and x1 are both "v"): one line.
  return lines.reduce((merged, line) => {
    const last = merged.at(-1);
    if (last && last.label === line.label && !last.range) merged[merged.length - 1] = { label: line.label, text: `${last.text} – ${line.text}`, range: true };
    else merged.push(line);
    return merged;
  }, []).map(({ label, text }) => ({ label, text }));
}
