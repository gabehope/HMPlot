import { Temporal } from "@js-temporal/polyfill";
import { cartesian2D, hasAxisOverride } from "./axisStyle.js";
import { placedFrame } from "./framePlacement.js";
import { tryFrameDimensionMapping, frameDimensionScales, isDegenerateFrameError } from "./frameMapping.js";
import { numpy as np } from "@hmplot/jax";
import { deviceParams, deviceScalar } from "./deviceParams.js";
import {axisCategory} from "./categorical.js";
import { measureLabelWidths, labelFontRevision } from "./labelAtlas.js";
import { revisionKey } from "./snapshotAxisOptions.js";
import { LIMITS, limitError } from "./limits.js";
import { withGenericFamily } from "./defaultFont.js";
import {
  spherical,
  sphericalDomain,
  angularFactor,
  angularPeriod,
  longitudeOrigin,
  longitudeRadians,
  polarAngleRadians,
  latitudeRadians,
  inverseLongitude,
  inverseLatitude,
  projectionY,
  inverseY,
  wrapLongitude,
  jointProjectionOf,
  MERCATOR_LIMIT,
} from "./coordinates.js";
import { ticks, tickIncrement, format } from "d3";
import { transformForward, jaxTransformForward, transformTicks } from "./scaleTransforms.js";
import {
  automaticInterval,
  coarserInterval,
  calendarTicks,
  formatDatetime,
  timeInterval,
  timezone,
} from "./datetime.js";
import { breakRules, breakTable, breakPosition, breakTime, breakPositions } from "./breaks.js";
import { modelCalendar, modelTicks, formatModel } from "./modelCalendars.js";
import { compactTicks, groupsThousands, themeNumberFormat, tickLabel } from "./numberLabels.js";
import { viewContextOf, ViewContext } from "./viewContext.js";
import { countWork } from "./workCounters.js";
/** A datetime axis's breaks (TODO 53.5; utils/breaks.js) as a table, or null. */
export function axisBreaks(config) {
  if (config.type !== "datetime" || !config.breaks || (Array.isArray(config.breaks) && !config.breaks.length)) return null;
  return breakTable(config.breaks, config.timezone, config.timeOrigin);
}
/**
 * Two-level datetime labels (TODO 53.4): the tick labels by the ticks' unit, and a second row at
 * the coarser unit's boundaries: under hours (and finer) the date, under days and weeks the
 * month and year, under months the year. Years have none.
 */
const TWO_LEVEL = {
  millisecond: ["%H:%M:%S.%L", "%b %-d, %Y"], second: ["%H:%M:%S", "%b %-d, %Y"],
  minute: ["%H:%M", "%b %-d, %Y"], hour: ["%H:%M", "%b %-d, %Y"],
  day: ["%-d", "%b %Y"], week: ["%-d", "%b %Y"], month: ["%b", "%Y"],
};
export { datetimeCoordinates } from "./datetime.js";
const pair = (v, fallback) => v?.toArray?.() ?? v ?? fallback;
export const axisDefaults = {
  type: "numeric",
  timeOrigin: 0,
  timezone: "UTC",
  format: "",
  major: true,
  minor: false,
  step: 0,
  tickCount: 0,
  majorInterval: "",
  minorInterval: "",
  subdivisions: 5,
  minorStep: 0,
  padding: 0.04,
  grid: "off",
  line: true,
  ticks: true,
  tickSize: null,
  tickDirection: "outside",
  titleFontWeight: 700,
  gridColor: null,
  gridWidth: 1,
  gridDash: [],
  lineWidth: null,
  tickWidth: 1,
  arrow: "none",
  arrowSize: 7,
  labelOverlap: "hide",
  tickLabelAngle: 0,
  tickLabelAlign: "auto",
  tickLabelPlacement: "outside",
  tickLabelOffset: 3,
  titlePosition: "end",
  titleAngle: "auto",
  titlePlacement: "inside",
  titleOffset: 7,
  // Datetime axes (TODO 53): a second row of labels at the coarser unit's boundaries (x axes),
  // intervals removed from the axis (breaks), and a model calendar's ticks and labels.
  context: true,
  breaks: [],
  calendar: "",
};
export const axisKey = (axis, key) =>
  `axis${axis.toUpperCase()}${key[0].toUpperCase() + key.slice(1)}`;
export function readAxis(options, axis) {
  const node = options.child("plot");
  return Object.fromEntries(
    Object.entries(axisDefaults).map(([k, v]) => [
      k,
      k === "grid" && !cartesian2D(options) && !hasAxisOverride(node, axisKey(axis, k))
        ? "off" : k === "gridColor" ? node.get(axisKey(axis, k)) || v : node.get(axisKey(axis, k)) ?? v,
    ]),
  );
}
export function validateAxis(axis) {
  if (
    !["numeric", "datetime"].includes(axis.type) ||
    !["off", "major", "major-minor"].includes(axis.grid)
  )
    throw Error("Invalid axis type or grid setting.");
  if (
    !Number.isFinite(axis.step) ||
    axis.step < 0 ||
    !Number.isInteger(axis.tickCount) ||
    axis.tickCount < 0 ||
    !Number.isInteger(axis.subdivisions) ||
    axis.subdivisions < 2 ||
    !Number.isFinite(axis.minorStep) ||
    axis.minorStep < 0 ||
    !Number.isFinite(axis.padding) || axis.padding < 0 ||
    (axis.lineWidth !== null && (!Number.isFinite(axis.lineWidth) || axis.lineWidth < 0)) ||
    (axis.tickSize !== null && (!Number.isFinite(axis.tickSize) || axis.tickSize < 0)) ||
    !Number.isFinite(axis.titleFontWeight) || axis.titleFontWeight < 1 || axis.titleFontWeight > 1000 ||
    !Number.isFinite(axis.gridWidth) || axis.gridWidth < 0 ||
    !Number.isFinite(axis.tickWidth) || axis.tickWidth < 0 ||
    !Number.isFinite(axis.arrowSize) || axis.arrowSize < 0 ||
    !Number.isFinite(axis.tickLabelAngle) ||
    !Number.isFinite(axis.tickLabelOffset) || axis.tickLabelOffset < 0 ||
    !(axis.titleAngle === "auto" || Number.isFinite(Number(axis.titleAngle))) ||
    !Number.isFinite(axis.titleOffset) || axis.titleOffset < 0 ||
    !Number.isFinite(axis.timeOrigin)
  )
    throw Error(
      "Axis tick sizes and spacing must be nonnegative; tick counts must be whole numbers and minor subdivisions at least two.",
    );
  if (typeof axis.line !== "boolean" || typeof axis.ticks !== "boolean" ||
      !["outside", "inside", "both"].includes(axis.tickDirection) ||
      !(axis.gridColor === null || typeof axis.gridColor === "string") ||
      !Array.isArray(axis.gridDash) || axis.gridDash.some(v => !Number.isFinite(v) || v < 0))
    throw Error("Plot/Frame axis: pass boolean line/ticks, tickDirection outside/inside/both, a gridColor string and nonnegative gridDash lengths.");
  if (!["none", "start", "end", "both"].includes(axis.arrow) ||
      !["hide", "show"].includes(axis.labelOverlap) ||
      !["auto", "start", "middle", "end"].includes(axis.tickLabelAlign) ||
      !["inside", "outside"].includes(axis.tickLabelPlacement) ||
      !["start", "middle", "end"].includes(axis.titlePosition) ||
      !["inside", "outside"].includes(axis.titlePlacement))
    throw Error("Invalid axis arrow or label placement setting.");
  if (axis.type === "datetime") {
    timezone(axis.timezone);
    timeInterval(axis.majorInterval);
    timeInterval(axis.minorInterval);
    formatDatetime(axis.timeOrigin, axis.format, axis.timezone);
    breakRules(axis.breaks);
    if (axis.calendar) {
      modelCalendar(axis.calendar);
      if (breakRules(axis.breaks).length) throw Error("A model calendar's axis has no breaks.");
    }
  } else format(axis.format || ".4~g");
  return axis;
}
/**
 * Which category labels show (TODO 134): a category's label names data, so it hides only where
 * it would overlap the last one shown, by its measured extent along the axis (its width on x,
 * its line height on y, either turned by tickLabelAngle) and a small gap. Before, every label
 * needed max(55, 7 per character) px whichever way it ran, which dropped every other row of a
 * horizontal bar chart. Sets each tick's showLabel.
 */
function showLabelsApart(majors, options, axis, config, pixels, gap) {
  const style = options.child?.("plot"), size = Number(style?.get?.("axisFontSize")) || 12;
  const angle = (config.tickLabelAngle * Math.PI) / 180, along = axis === "x" ? Math.cos(angle) : Math.sin(angle);
  // Along y with no angle only the line height counts: no widths to measure.
  const widths = typeof document === "undefined" || along === 0
    ? majors.map((t) => 0.6 * size * t.label.length)
    : measureLabelWidths(majors.map((t) => t.label), withGenericFamily(style?.get?.("axisFontFamily"))).map((w) => (w * size) / 64);
  // The extent along the axis of text `width` wide and a line high.
  const across = axis === "x" ? Math.sin(angle) : Math.cos(angle);
  const extent = (width) => Math.abs(along) * width + Math.abs(across) * size * 1.2;
  let previous = null;
  majors.forEach((t, i) => {
    const at = t.fraction * pixels, half = extent(widths[i]) / 2;
    t.showLabel = config.labelOverlap === "show" || !previous || at - half - previous.end >= gap;
    if (t.showLabel) previous = { end: at + half };
  });
}

/**
 * The denser automatic ticks (TODO 136.17, as Vega-Lite's and Observable Plot's): a 2D Cartesian
 * linear numeric axis. Datetime, log and other transforms, polar, geo and 3D axes keep theirs.
 */
function denseTicks(options, axis, config) {
  // Guide proxies read a Cartesian view of a curved or 3D frame (a polar radius, a globe's or a
  // warped frame's ticks, a Surface's axes): only a frame in a Plot's view, with its context.
  return axis !== "z" && config.type !== "datetime" && !options.sparseTicks &&
    viewContextOf(options) !== null && cartesian2D(options) &&
    (options.get(`${axis}Transform`) ?? "linear") === "linear";
}
/**
 * About how many major ticks an axis `pixels` long asks for when its tickCount is automatic:
 * one per 80 px along x and per 45 px along y on a 2D Cartesian linear axis (TODO 136.17: two or
 * three per axis read as sparse), else one per 90 px.
 * @param {any} options @param {string} axis @param {number} pixels @param {any} [config]
 */
export function automaticTickCount(options, axis, pixels, config = readAxis(options, axis)) {
  const per = denseTicks(options, axis, config) ? (axis === "y" ? 45 : 80) : 90;
  return Math.max(2, Math.floor(pixels / per));
}
/**
 * The tick count an automatic domain is rounded with (TODO 136.17): fixed, not the axis's
 * pixels, so linked plots, facet cells, resizes and exports of one union agree. 5 rather than
 * d3's 10: the coarser step is more often a multiple of the step the ticks take on screen.
 */
export const NICE_COUNT = 5;
/** d3's tick step over [lo, hi] for about `count` ticks, as a number. */
const tickStepOf = (lo, hi, count) => {
  const inc = tickIncrement(lo, hi, count);
  return inc > 0 ? inc : -1 / inc;
};
const onStep = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-6;
/**
 * The step that puts ticks on both ends of a rounded domain (TODO 136.17), where `step`, the one
 * chosen for the axis's pixels, misses them: the rounding's own step when `step` is coarser, else
 * the largest 1-2-5 step below `step` that divides it. 0 when the ends are on `step`'s ticks,
 * are not a rounded domain's, or the view is zoomed out past twice the domain.
 * @param {number[]} bounds @param {number} step @param {number} shown the span the ticks cover
 */
export function endStep([lo, hi], step, shown) {
  if (!(hi > lo) || !(step > 0) || shown > 2 * (hi - lo)) return 0;
  const rounded = tickStepOf(lo, hi, NICE_COUNT);
  if (!onStep(lo, rounded) || !onStep(hi, rounded) || (onStep(lo, step) && onStep(hi, step))) return 0;
  if (step >= rounded) return rounded;
  for (let e = Math.floor(Math.log10(rounded)); e > Math.floor(Math.log10(rounded)) - 3; e--)
    for (const m of [5, 2, 1]) {
      const d = e < 0 ? m / 10 ** -e : m * 10 ** e;
      if (d < rounded && d <= step * (1 + 1e-9) && onStep(rounded, d)) return d;
    }
  return 0;
}
/**
 * An automatic domain rounded out to tick values (TODO 136.17, as d3's scale.nice()): each end
 * moves outward to a multiple of the step d3's ticks take over the result for about `count`
 * ticks. `step` (the axis's own) is used instead of the automatic one. An end in `keep`
 * stays, as does one whose padding already reaches past the tick at or beyond `data`'s end (the
 * unpadded domain: data from 0, or up to 10, keep their padded ends past the ticks at 0 and 10
 * rather than adding a step of empty room, or a tick below 0).
 * @param {number[]} domain @param {number[]} data @param {number} [count]
 * @param {{ keep?: boolean[], step?: number }} [options]
 * @returns {number[]}
 */
export function niceDomain(domain, data, count = NICE_COUNT, { keep = [false, false], step = 0 } = {}) {
  let [lo, hi] = domain;
  if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return [lo, hi];
  const round = (value, inc, up) => {
    const f = up ? Math.ceil : Math.floor;
    return inc > 0 ? f(value / inc) * inc : f(value * -inc) / -inc;
  };
  for (let i = 0; i < 10; i++) {
    const inc = step > 0 ? step : tickIncrement(lo, hi, count);
    if (!Number.isFinite(inc) || inc === 0) break;
    const a = round(domain[0], inc, false), b = round(domain[1], inc, true),
      next = [
        keep[0] || round(data[0], inc, false) >= domain[0] ? domain[0] : a,
        keep[1] || round(data[1], inc, true) <= domain[1] ? domain[1] : b,
      ];
    if (next[0] === lo && next[1] === hi) break;
    [lo, hi] = next;
    if (step > 0) break;
  }
  return [lo, hi];
}
/**
 * An axis's settings as axisLayout returns them in `config`, without laying out its ticks: what
 * the layout solver reads of each axis once per solve (TODO 143.4).
 * @param {any} options @param {string} axis
 */
export function axisConfig(options, axis) {
  const config = validateAxis(readAxis(options, axis));
  return !jointProjectionOf(options) && spherical(options) && options.get("projection") === "orthographic"
    ? { ...config, grid: "off" } : config;
}

/**
 * `area`: the share of `visible` the plot's own area covers along the axis ([0, 1] when
 * omitted), as fractions in the ticks' orientation (y from the bottom). Ticks are chosen for that
 * span, as many as the whole length allows, as before (TODO 134.12): `visible` is the whole canvas, margins
 * included, so a 240 px histogram's y axis chose ticks for a span 1.6 times its own and drew
 * only "0", and a market-hours axis with breaks chose months for its margin past the last close.
 * Fractions stay relative to `visible`.
 * @param {any} options @param {string} axis @param {number[]} visible @param {number} pixels
 * @param {number[] | null} [area]
 */
export function axisLayout(options, axis, visible, pixels, area = null) {
  // One layout per options state, axis, view and size (TODO 143.4): the overlay, the layout
  // solver and the view ask for the same axis many times a frame. Keyed by the options'
  // revisions and the font's (label widths are measured), so any change lays it out again.
  const revision = options?.revision === undefined ? null : revisionKey(options);
  const key = revision && !revision.includes("NaN")
    ? `${revision}|${labelFontRevision()}|${axis}|${visible?.[0]},${visible?.[1]}|${pixels}|${area?.[0]},${area?.[1]}` : null;
  let cache = key ? LAYOUTS.get(options) : undefined;
  if (key && cache?.has(key)) return cache.get(key);
  const layout = layOutAxis(options, axis, visible, pixels, area);
  if (key) {
    if (!cache || cache.size >= 32) LAYOUTS.set(options, (cache = new Map()));
    cache.set(key, layout);
  }
  return layout;
}
/** Each options node's recent layouts, by key (axisLayout). */
const LAYOUTS = new WeakMap();
/** @param {any} options @param {string} axis @param {number[]} visible @param {number} pixels @param {number[] | null} [area] */
function layOutAxis(options, axis, visible, pixels, area = null) {
  countWork("axisLayout");
  // A joint projection's map has no edge axes: its overlay draws a graticule (mapGuides.js).
  if (jointProjectionOf(options))
    return { major: [], minor: [], reference: [], config: validateAxis(readAxis(options, axis)) };
  if(spherical(options)&&options.get('projection')==='orthographic'){
    const domain=sphericalDomain(options)[axis]??[-1,1],proxy={...options,sparseTicks:true,angular:true,get:k=>k==='coordinates'?'cartesian':k===axis+'bounds'||k===axis+'range'?domain:k===axis+'Transform'?'linear':options.get(k),child:k=>options.child(k)};
    // Its grid is the overlay's graticule (orthographicGuides.js), never straight rules (TODO 135.5).
    const layout=axisLayout(proxy,axis,visible,pixels,area);
    return {...layout,config:{...layout.config,grid:'off'}};
  }
  const config = validateAxis(readAxis(options, axis)),
    bounds = pair(options.get(`${axis}bounds`), [-1, 1]),
    range = spherical(options)
      ? bounds.map((v) =>
          axis === "x"
            ? longitudeRadians(v, options)
            : projectionY(
                options.get("projection") === "mercator"
                  ? Math.max(
                      -MERCATOR_LIMIT,
                      Math.min(MERCATOR_LIMIT, v * angularFactor(options)),
                    )
                  : latitudeRadians(v, options),
                options.get("projection"),
              ),
        )
      : pair(options.get(`${axis}range`), [-50, 50]),
    kind = options.get(`${axis}Transform`) ?? "linear";
  if (config.type === "datetime" && kind !== "linear")
    throw Error("Datetime axes require a linear coordinate transform.");
  const empty = { major: [], minor: [], reference: [], config };
  // A degenerate or transform-incompatible domain (e.g. log over [0, 10]) draws no ticks.
  const mapping = spherical(options) ? null : tryFrameDimensionMapping(options, axis);
  if (!spherical(options) && !mapping) return empty;
  const [forward, inverse] = spherical(options)
      ? axis === "x"
        ? [(v) => longitudeRadians(v, options), (v) => inverseLongitude(v, options)]
        : [
            (v) =>
              projectionY(
                options.get("projection") === "mercator"
                  ? Math.max(
                      -MERCATOR_LIMIT,
                      Math.min(MERCATOR_LIMIT, v * angularFactor(options)),
                    )
                  : latitudeRadians(v, options),
                options.get("projection"),
              ),
            (v) =>
              inverseLatitude(inverseY(v, options.get("projection")), options),
          ]
      : [mapping.forward, mapping.inverse],
    low = forward(bounds[0]),
    high = forward(bounds[1]),
    span = high - low,
    outputSpan = range[1] - range[0];
  if (
    ![...visible, ...bounds, ...range, low, high].every(Number.isFinite) ||
    !span ||
    !outputSpan ||
    visible[0] === visible[1]
  )
    return empty;
  // Half a pixel wider than the area: a tick on its edge (a bar's 0 baseline) is not lost to
  // rounding in the inverse mapping.
  const slack = pixels > 0 ? 0.5 / pixels : 0;
  const [a0, a1] = area && area[1] > area[0] ? [Math.max(0, area[0] - slack), Math.min(1, area[1] + slack)] : [0, 1],
    shown = [visible[0] + a0 * (visible[1] - visible[0]), visible[0] + a1 * (visible[1] - visible[0])];
  const toData = (world) =>
      world === range[0]
        ? bounds[0]
        : world === range[1]
          ? bounds[1]
          : inverse(low + ((world - range[0]) / outputSpan) * span),
    wholeSpan = visible.map(toData);
  const data = shown.map((world) =>
      world === range[0]
        ? bounds[0]
        : world === range[1]
          ? bounds[1]
          : inverse(low + ((world - range[0]) / outputSpan) * span),
    ),
    min =
      spherical(options) && axis === "y"
        ? Math.max(
            Math.min(...data),
            -(options.get("projection") === "mercator"
              ? MERCATOR_LIMIT
              : Math.PI / 2) / angularFactor(options),
          )
        : Math.min(...data),
    max =
      spherical(options) && axis === "y"
        ? Math.min(
            Math.max(...data),
            (options.get("projection") === "mercator"
              ? MERCATOR_LIMIT
              : Math.PI / 2) / angularFactor(options),
          )
        : Math.max(...data),
    // The span the ticks cover: the plot's area where one is given (the canvas's count over the
    // narrower area crowded the labels, and thinning them left steps of 0.4; TODO 136.1).
    count = config.tickCount || automaticTickCount(options, axis, pixels * (a1 - a0), config);
  if (!Number.isFinite(min) || !Number.isFinite(max))
    return { major: [], minor: [], reference: [], config };
  const fraction = (value) =>
    (range[0] + ((forward(value) - low) / span) * outputSpan - visible[0]) /
    (visible[1] - visible[0]);
  const explicit = (step) => {
    if (!(step > 0)) return [];
    const first = Math.ceil(min / step);
    const length = Math.max(0, Math.floor(max / step) - first + 1);
    if (length > LIMITS.axisTicks.value)
      throw limitError("axisTicks", { count: length });
    return Array.from(
      { length },
      (_, i) => (first + i) * step,
    );
  };
  const category=axisCategory(options,axis),categoryDomain=category?.domain,
    dense = !category && denseTicks(options, axis, config);
  if(category && (spherical(options)||kind!=="linear"||config.type==="datetime"))throw Error("Categorical axes require Cartesian linear coordinates.");
  let major,
    minor = [],
    // Two-level labels (datetime x axes; axes.x.context=false keeps one row).
    twoLevel = null;
  if(category) { const first=Math.max(0,Math.ceil(min)),last=Math.min(categoryDomain.length-1,Math.floor(max)),step=Math.max(1,Math.ceil((last-first+1)/Math.max(1,pixels/2))),start=Math.ceil(first/step)*step; major=Array.from({length:Math.max(0,Math.floor((last-start)/step)+1)},(_,i)=>start+i*step); } else if (config.type === "datetime") {
    // With breaks, positions are times less the time removed: ticks come from the times between
    // the visible positions, at the interval the positions' span calls for; a tick inside a
    // break (or at its start, which shares its end's position) is at the break's end.
    const breaks = axisBreaks(config), cal = modelCalendar(config.calendar);
    const start = (breaks ? breakTime(breaks, min) : min) + config.timeOrigin,
      end = (breaks ? breakTime(breaks, max) : max) + config.timeOrigin,
      // Ticks inside breaks are dropped, so there may be more times than pixels allow; at most 64
      // times as many (a view across a long break, such as a first ±1 ms domain at a break's
      // end, gets no ticks instead of millions of steps through the break).
      budget = pixels * Math.min(64, Math.max(1, (end - start) / Math.max(max - min, 1e-9)));
    let interval = timeInterval(config.majorInterval) ?? automaticInterval((max - min) * (cal ? cal.days * 86400000 : 1), count);
    // A tick inside a break moves to its end (a day's tick to the session's open), once.
    const place = (times) => {
      const out = [];
      for (const t of times) {
        const position = breakPosition(breaks, t - config.timeOrigin);
        if (!out.length || Math.abs(position - out.at(-1)) > 1e-6) out.push(position);
      }
      return out;
    };
    if (cal) {
      // A model calendar's ticks, in the column's units (TODO 53.6).
      major = modelTicks(cal, min, max, count, interval, Math.ceil(pixels / 2) + 2);
      if (config.minor || config.grid === "major-minor")
        minor = modelTicks(cal, min, max, count * config.subdivisions, config.minorInterval, pixels);
    } else {
      major = place(calendarTicks(start, end, count, config.timezone, interval, budget));
      // A break gathers the times inside it at its end, so an interval suited to the positions'
      // span can leave a tick at each session's open and more inside it (TODO 69.16: market
      // hours' axis read 09:30 at every open): with breaks, coarser intervals until the ticks are
      // about as few as the axis asks for.
      for (let next; breaks && !config.majorInterval && major.length > 2 * count && (next = coarserInterval(interval));) {
        interval = next;
        major = place(calendarTicks(start, end, count, config.timezone, interval, budget));
      }
    }
    if (config.context && axis === "x" && TWO_LEVEL[interval.unit]) twoLevel = { unit: interval.unit, formats: TWO_LEVEL[interval.unit] };
    if (!cal && (config.minor || config.grid === "major-minor"))
      minor = place(calendarTicks(
        start,
        end,
        count * config.subdivisions,
        config.timezone,
        config.minorInterval,
        budget,
      ));
  } else {
    // The transform's own tick rule (log decades, symlog's 0 and ±10^k), else linear ticks.
    const own = transformTicks(kind, min, max, count, options.get(`${axis}TransformConstant`) ?? 1);
    // The plot's own span; where that gives fewer than two ticks (d3.ticks(0.1, 0.9, 2) is
    // [0.5]), the whole canvas's, margins included, as before.
    let linear = ticks(min, max, count);
    if (linear.length < 2 && area) linear = ticks(Math.min(...wholeSpan), Math.max(...wholeSpan), count);
    // A rounded domain's ends on labeled ticks (TODO 136.17), at any size.
    const ends = dense && !config.step && !config.tickCount && linear.length > 1
      ? endStep(bounds, linear[1] - linear[0], max - min) : 0;
    if (ends) linear = explicit(ends);
    major = config.step ? explicit(config.step) : own?.major ?? linear;
    if (own) minor = own.minor;
    else if (config.minorStep)
      minor = explicit(config.minorStep);
    else if (major.length > 1)
      minor = explicit((major[1] - major[0]) / config.subdivisions);
  }
  // A position's time (from the origin): itself, or through the axis's breaks.
  const breaksHere = config.type === "datetime" ? axisBreaks(config) : null;
  const timeOf = (value) => breakTime(breaksHere, value);
  // A time's text: in a model calendar (its units), else Gregorian in the axis's zone.
  const calendarHere = config.type === "datetime" ? modelCalendar(config.calendar) : null;
  const timeText = (value, pattern, span) => calendarHere
    ? formatModel(calendarHere, value, pattern, span === undefined ? undefined : span * calendarHere.days)
    : formatDatetime(timeOf(value) + config.timeOrigin, pattern, config.timezone, span);
  const majorSet = new Set(major.map((v) => v.toPrecision(12)));
  minor = minor.filter((v) => !majorSet.has(v.toPrecision(12)));
  const labels = new Map();
  // Numbers: the axis's format, else the theme's (TODO 132.4) on a linear quantitative axis (not
  // an angle: a globe's, a spherical frame's or a polar angle; not log or other transforms, whose
  // decades it would round alike), else decimals, grouped when a tick reaches 10,000 (TODO 133.6).
  const themed = kind === "linear" && !options.angular && !spherical(options);
  const numberFormat = config.format || (themed ? themeNumberFormat(options) : undefined);
  const numberText = (value, grouped) =>
    numberFormat ? format(numberFormat)(value) : tickLabel(value, grouped);
  const convert = (values, labelled, grouped = labelled && groupsThousands(values)) =>
    values
      .map((value) => {
        let label = labelled
          ? config.type === "datetime"
            ? timeText(value, config.format || twoLevel?.formats[0] || "", max - min)
            : numberText(
                spherical(options) && axis === "x"
              ? inverseLongitude(wrapLongitude(longitudeRadians(value, options)), options)
                  : value,
                grouped,
              ) +
              (spherical(options) && options.get("angleUnit") === "degrees"
                ? "°"
                : "")
          : "";
        if(category && labelled) label=category.label(categoryDomain[value]);
        if (label) labels.set(label, (labels.get(label) ?? 0) + 1);
        return { value, fraction: fraction(value), label };
      })
      .filter(
        (t) =>
          Number.isFinite(t.fraction) && t.fraction >= 0 && t.fraction <= 1,
      )
      .sort((a, b) => a.fraction - b.fraction);
  const majors = convert(major, true);
  // Ticks sharing four or more leading digits (deep in a zoom) read as the digits that change
  // beside an offset, as Matplotlib's do, where each would round to the same label (TODO 136.10).
  // Only outside labels, and on x unturned ones: the offset takes room past them (a second row
  // on x), which inside or turned labels would cover.
  const compact = dense && !numberFormat && !spherical(options) && config.tickLabelPlacement === "outside" &&
    (axis !== "x" || !config.tickLabelAngle)
    ? compactTicks(majors.map((t) => t.value))
    : null;
  if (compact) majors.forEach((t, i) => (t.label = compact.labels[i]));
  let previous = -Infinity;
  // A time label shown twice is an hour repeated at a change of UTC offset: its offset tells them
  // apart. Under a second row, only a repeat within one of its periods (one day) is; day numbers
  // under a month row repeat by design.
  const period = (t) => (twoLevel ? timeText(t.value, twoLevel.formats[1]) + "|" : "") + t.label;
  const repeats = new Map();
  if (config.type === "datetime") for (const t of majors) repeats.set(period(t), (repeats.get(period(t)) ?? 0) + 1);
  const repeatsHours = !calendarHere && (!twoLevel || !["day", "week", "month"].includes(twoLevel.unit));
  for (const t of majors) {
    if (config.type === "datetime" && !config.format && repeatsHours && repeats.get(period(t)) > 1)
      t.label +=
        " " +
        formatDatetime(timeOf(t.value) + config.timeOrigin, "%Z", config.timezone);
    if (category || dense) continue;
    const space = Math.max(55, t.label.length * 7);
    t.showLabel = config.labelOverlap === "show" || t.fraction * pixels - previous >= space;
    if (t.showLabel) previous = t.fraction * pixels;
  }
  if (category) showLabelsApart(majors, options, axis, config, pixels, 4);
  // Denser numbers (TODO 136.17) hide by their measured extent too, a little further apart.
  else if (dense) showLabelsApart(majors, options, axis, config, pixels, 8);
  // The second row: at the first tick, then where the coarser unit changes.
  const context = [];
  if (twoLevel) {
    let last = null, previousAt = -Infinity;
    for (const t of majors) {
      const label = timeText(t.value, twoLevel.formats[1]);
      if (label === last) continue;
      last = label;
      const at = t.fraction * pixels, space = Math.max(55, label.length * 7);
      if (config.labelOverlap !== "show" && at - previousAt < space) {
        // The first period is a sliver at the edge: the next one's label takes its place.
        if (context.length === 1) { context[0] = { value: t.value, fraction: t.fraction, label }; previousAt = at; }
        continue;
      }
      previousAt = at;
      context.push({ value: t.value, fraction: t.fraction, label });
    }
  }
  const minors = convert(minor, false).filter(
    (t, i, a) => i === 0 || (t.fraction - a[i - 1].fraction) * pixels >= 2,
  );
  const rules = options.child("plot").get("referenceRules") ?? [];
  const onAxis = (value) => config.type === "datetime"
    ? breakPosition(breaksHere, referenceValue(value, config.timezone) - config.timeOrigin) : referenceValue(value);
  const reference = rules
    .filter((r) => r.axis === axis)
    .map((r) => {
      const value = onAxis(r.value);
      return { ...r, value, fraction: fraction(value) };
    })
    .filter(
      (r) => Number.isFinite(r.fraction) && r.fraction >= 0 && r.fraction <= 1,
    );
  // Bands (TODO 46): the part of [from, to] inside the axis, as fractions of it.
  const bands = (options.child("plot").get("referenceBands") ?? [])
    .filter((b) => b.axis === axis)
    .map((b) => {
      const from = onAxis(b.from), to = onAxis(b.to), f0 = fraction(from), f1 = fraction(to);
      return { ...b, from, to, fractions: [Math.max(0, Math.min(f0, f1)), Math.min(1, Math.max(f0, f1))] };
    })
    .filter((b) => b.fractions.every(Number.isFinite) && b.fractions[1] > b.fractions[0]);
  return { major: majors, minor: minors, context, offset: compact?.text ?? null, reference, bands, config };
}
/**
 * How far past a y axis's end its compact labels' offset sits, in font sizes (its middle): above
 * the top, or below the bottom when the x axis is on top (its labels are above).
 */
export const OFFSET_RISE = 1.2;
/**
 * The margin an x axis's labels need beyond `margin` (the axis option): with a second row of
 * datetime labels (TODO 53.4) or a compact labels' offset, room for both rows and the second's
 * descenders.
 */
export function labelMargin(layout, margin, { fontSize = 11, tickSize = 5 } = {}) {
  if (!layout?.context?.length && !layout?.offset) return margin;
  const offset = layout.config?.tickLabelOffset ?? 3;
  return Math.max(margin, Math.ceil(tickSize + offset + 2 * fontSize + 2 + 0.3 * fontSize));
}
export function axisTicks(options, axis, visible, pixels) {
  return axisLayout(options, axis, visible, pixels).major.filter(
    (t) => t.showLabel,
  );
}

// Polar guides are laid out in X angle and Y radius-offset source values.
/**
 * A polar frame's bands (TODO 46) as annular sectors in data units: an x band spans its angles
 * over the whole radial domain, a y band its radii over the whole turn. Each is `outer` and
 * `inner` arcs sampled at the same angles (at most about 2 degrees apart), with the band's
 * style: the frame chain maps the points, so a nested or placed polar frame bends them too.
 */
export function polarBands(options) {
  const bands = options.child("plot").get("referenceBands") ?? [];
  if (!bands.length) return [];
  // A radial band goes once around: a full turn in the angle unit, or the angular domain when it
  // is one ("extent"). An angular band runs from the disk's center (the radius value that maps to
  // 0) to its edge.
  const period = angularPeriod(options), extent = options.get("angleUnit") === "extent",
    angular = extent ? pair(options.get("xbounds"), [0, period]) : [0, Math.abs(period)],
    bounds = pair(options.get("ybounds"), [0, 1]), base = Number(options.get("baseRadius") ?? 0), scale = Number(options.get("radialScale") ?? 1),
    center = scale ? -base / scale || 0 : Math.min(...bounds), edge = Math.max(...bounds),
    radial = [Math.min(center, edge), edge];
  const clamp = (value, [a, b]) => Math.min(Math.max(value, Math.min(a, b)), Math.max(a, b));
  return bands.flatMap((band) => {
    const from = referenceValue(band.from), to = referenceValue(band.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return [];
    const [a0, a1] = band.axis === "x" ? [Math.min(from, to), Math.max(from, to)] : angular,
      [r0, r1] = band.axis === "y" ? [clamp(Math.min(from, to), radial), clamp(Math.max(from, to), radial)] : radial;
    if (!(a1 > a0) || !(r1 > r0)) return [];
    const steps = Math.max(1, Math.ceil((a1 - a0) / Math.abs(period) * 180)),
      angles = Array.from({ length: steps + 1 }, (_, i) => a0 + (a1 - a0) * i / steps);
    return [{ ...band, outer: angles.map((a) => [a, r1]), inner: angles.map((a) => [a, r0]) }];
  });
}
export function polarAxisLayout(options, pixels = 360) {
  const styles = options.child("plot"),
    period = angularPeriod(options),
    origin = options.get("angleUnit") === "extent"
      ? pair(options.get("xbounds"), [0, period])[0] : 0,
    angularBounds = pair(options.get("xbounds"), [origin, origin + period]),
    configuredStep = styles.get(axisKey("x", "step")) ?? 0,
    angularProxy = {
      ...options,
      sparseTicks: true,
      // An angle: no theme number format (TODO 132.4).
      angular: true,
      get: (key) =>
        key === "coordinates"
          ? "cartesian"
          : key === "xbounds" || key === "xrange"
            ? angularBounds
          : key === "xTransform"
            ? "linear"
          : key === "projection"
          ? "equirectangular"
            : options.get(key),
      // Drawn as a flat 2D chart (TODO 136.12: the view context).
      viewContext: new ViewContext(viewContextOf(options), { mode: "2d" }),
      child: (key) => {
        const child = options.child(key);
        return key !== "plot"
          ? child
          : {
              get: (name) =>
                name === axisKey("x", "step") && !(configuredStep > 0)
                  ? period / 8
                  : child.get(name),
            };
      },
    },
    angular = axisLayout(
      angularProxy,
      "x",
      angularBounds,
      Math.max(360, pixels),
    ),
    radialBounds = pair(options.get("ybounds"), [0, 1]),
    base = options.get("baseRadius") ?? 0,
    scale = options.get("radialScale") ?? 1,
    radialRange = radialBounds.map((value) => base + scale * value),
    radialProxy = {
      ...options,
      sparseTicks: true,
      get: (key) =>
        key === "coordinates"
          ? "cartesian"
          : key === "ybounds"
            ? radialBounds
            : key === "yrange"
              ? radialRange
              : options.get(key),
      child: (key) => options.child(key),
    },
    radial =
      scale > 0 && radialRange.every(Number.isFinite) && radialRange[0] !== radialRange[1]
        ? axisLayout(radialProxy, "y", radialRange, Math.max(180, pixels / 2))
        : { major: [], minor: [], reference: [], config: readAxis(options, "y") };
  const angles = (values) => {
    const seen = new Set();
    return values
      .map((tick) => ({ ...tick, angle: polarAngleRadians(tick.value, options) }))
      .filter((tick) => {
        const key = Math.round(
          ((((tick.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))) * 1e9,
        );
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  const radii = (values) =>
    values
      .map((tick) => ({ ...tick, radius: base + scale * tick.value }))
      .filter((tick) => Number.isFinite(tick.radius) && tick.radius > 0);
  const angularReference = angles(angular.reference), radialReference = radii(radial.reference);
  const sameAngle = (a, b) => Math.abs(Math.atan2(Math.sin(a.angle - b.angle),
    Math.cos(a.angle - b.angle))) < 1e-8;
  const withoutAngularReference = (values) => angles(values).filter((tick) =>
    !angularReference.some((rule) => sameAngle(tick, rule)));
  const withoutRadialReference = (values) => radii(values).filter((tick) =>
    !radialReference.some((rule) => Math.abs(tick.radius - rule.radius) < 1e-8));
  return {
    angular: { ...angular, major: withoutAngularReference(angular.major),
      minor: withoutAngularReference(angular.minor), reference: angularReference },
    radial: { ...radial, major: withoutRadialReference(radial.major),
      minor: withoutRadialReference(radial.minor), reference: radialReference },
  };
}
// An ISO date or date and time without an offset ("2024-03-01", "2024-03-01T09:30"): a wall
// time, read in the axis's zone (eval pilot 2026-10-12: an agent's "2024-03-01" band was refused).
const WALL_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/;
/**
 * A rule's or band's value as a number: a Date, an ISO string with an offset, or a wall time
 * in `zone` (the axis's), in epoch ms.
 */
export function referenceValue(value, zone = "UTC") {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return value;
  if (!WALL_TIME.test(value)) return /(Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
  try {
    return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone(zone)).epochMilliseconds;
  } catch {
    return NaN;
  }
}
const referenceValid = (value) =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (value instanceof Date && Number.isFinite(value.getTime())) ||
  (typeof value === "string" && Number.isFinite(referenceValue(value)));
const REFERENCE_VALUES = 'a number, a Date, or an ISO date such as "2024-03-01" (in the axis\'s time zone) or "2024-03-01T12:00:00Z"';
/**
 * Bands (TODO 46): [{ axis: "x" | "y", from, to, label?, color?, opacity? }], a shaded span of
 * an axis behind the marks and grid. from and to are values on the axis (numbers, Dates or ISO
 * dates with an offset), in either order; opacity is 0 to 1 (default 0.1).
 */
export function validateBands(bands) {
  if (!Array.isArray(bands)) throw Error("Bands must be a list.");
  for (const b of bands) {
    if (!b || typeof b !== "object") throw Error("Each band is an object: { axis, from, to }.");
    if (!["x", "y"].includes(b.axis)) throw Error(`A band's axis is "x" or "y"; received ${JSON.stringify(b.axis)}.`);
    if (!referenceValid(b.from) || !referenceValid(b.to))
      throw Error(`A band's from and to are each ${REFERENCE_VALUES}; received ${JSON.stringify([b.from, b.to])}.`);
    if (b.color !== undefined && !/^#[a-f\d]{6}$/i.test(b.color)) throw Error("Use a six-digit hex band color.");
    if (b.opacity !== undefined && !(typeof b.opacity === "number" && b.opacity >= 0 && b.opacity <= 1))
      throw Error("A band's opacity must be between 0 and 1.");
    if (b.label !== undefined && typeof b.label !== "string") throw Error("A band's label must be a string.");
  }
  return bands;
}
/** A rule's dash as marks take it (dashProps): true for the default, one length, or lengths. */
const DEFAULT_RULE_DASH = [6, 4];
function ruleDash(dash, axis) {
  if (dash === undefined || dash === null || dash === false) return undefined;
  if (dash === true) return DEFAULT_RULE_DASH;
  if (typeof dash === "number" && dash > 0) return [dash, dash];
  if (Array.isArray(dash) && dash.length && dash.every((v) => Number.isFinite(v) && v > 0)) return dash;
  throw Error(`${axis === "x" ? "An" : "A"} ${axis} reference rule's dash is true, a dash length in pixels, or [dash, gap, ...] in pixels, each positive; received ${JSON.stringify(dash)}.`);
}
export function validateRules(rules) {
  if (!Array.isArray(rules)) throw Error("Reference lines must be a list.");
  return rules.map((r) => {
    if (!["x", "y"].includes(r.axis) || !referenceValid(r.value))
      throw Error(`A rule needs axis "x" or "y" and a value that is ${REFERENCE_VALUES}; received ${JSON.stringify(r.value)}.`);
    if (r.width !== undefined && (!Number.isFinite(r.width) || r.width < 0))
      throw Error(`${r.axis === "x" ? "An" : "A"} ${r.axis} reference rule's width must be nonnegative; received ${JSON.stringify(r.width)}.`);
    if (r.color && !/^#[a-f\d]{6}$/i.test(r.color))
      throw Error(`${r.axis === "x" ? "An" : "A"} ${r.axis} reference rule's color is a six-digit hex color ("#c44e52"); received ${JSON.stringify(r.color)}.`);
    if (r.dash === undefined) return r;
    const { dash, ...rest } = r, normalized = ruleDash(dash, r.axis);
    return normalized ? { ...rest, dash: normalized } : rest;
  });
}
/**
 * A value on a frame's axis as a pointer readout writes it (a Crosshair's, TODO 45): finer than
 * the ticks, to about a thousandth of `span` (the visible extent). A category as it is; a
 * datetime (counted from the axis's time origin) in the axis's zone, with the time of day once
 * the span is under a few months; a longitude wrapped; degrees with "°". An axis's own format
 * wins. Missing gives "".
 */
export function axisReadout(options, axis, value, span = 0) {
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const config = readAxis(options, axis), step = span / 1000;
  if (config.type === "datetime") {
    const cal = modelCalendar(config.calendar);
    if (cal) return formatModel(cal, value, config.format || (span * cal.days < 2 ? "%b %-d, %Y %H:%M" : "%b %-d, %Y"));
    const pattern = config.format || (!(step > 0) ? "" : step < 1 ? "%b %d %H:%M:%S.%L" : step < 60000 ? "%b %d %H:%M:%S"
      : step < 7200000 ? "%b %d %H:%M" : step < 30 * 86400000 ? "%b %d, %Y" : "%b %Y");
    return formatDatetime(value + config.timeOrigin, pattern, config.timezone, span);
  }
  const shown = spherical(options) && axis === "x" ? inverseLongitude(wrapLongitude(longitudeRadians(value, options)), options) : value;
  const degrees = options.get("angleUnit") === "degrees" && (spherical(options) || (options.get("coordinates") === "polar" && axis === "x"));
  const digits = step > 0 ? Math.min(12, Math.max(0, -Math.floor(Math.log10(step)))) : undefined;
  const text = config.format ? format(config.format)(shown)
    : digits === undefined || Math.abs(shown) >= 1e15 ? format(".4~g")(shown) : shown.toFixed(digits);
  return text + (degrees ? "°" : "");
}
/** Convert a picked world coordinate through the same mapping used by ticks. */
export function axisValue(options, axis, world) {
  const placement = placedFrame(options), index = "xyz".indexOf(axis);
  if (placement) {
    const m = placement.matrix.elements;
    if ([0,1,2].some(i=>i!==index && Math.abs(m[i*4+index])>1e-10))
      throw Error("Axis brushing requires a separable Cartesian frame; this frame is rotated.");
    world = (world-m[12+index])/m[index*5];
  }
  const mapping = tryFrameDimensionMapping(options, axis);
  if (!mapping) return NaN;
  const value = mapping.inverse(world);
  const config = readAxis(options, axis);
  return config.type === "datetime" ? breakTime(axisBreaks(config), value) + config.timeOrigin : value;
}
/**
 * GPU counterpart of axisWorld for a whole column. Consumes `input`; nonfinite for
 * values outside a log/sqrt domain and for every value when a domain is degenerate. Domains,
 * ranges and the frame placement reach the kernels from a buffer (deviceParams), so zooming or
 * resizing compiles nothing new (TODO 17.1). On a datetime axis, `input` counts milliseconds
 * from `origin` (a datetime column's own origin; 0 for epoch milliseconds).
 */
export function axisWorldArray(options, axis, input, origin = 0) {
  const config = readAxis(options, axis);
  let value = (config.type === "datetime" ? input.sub(deviceScalar(config.timeOrigin - origin)) : input).astype(np.float32);
  const breaks = config.type === "datetime" ? axisBreaks(config) : null;
  if (breaks) value = breakPositions(breaks, value);
  let stages;
  try { stages = frameDimensionScales(options, axis); }
  catch (error) {
    if (!isDegenerateFrameError(error)) { value.dispose(); throw error; }
    const nan = np.zeros(value.shape, { dtype: np.float32 }).add(NaN);
    value.dispose();
    return nan;
  }
  for (const stage of stages) {
    const low = transformForward(stage.transform, stage.domain[0], stage.constant),
      high = transformForward(stage.transform, stage.domain[1], stage.constant);
    const [start, scale, offset, constant] = deviceParams([low, (stage.range[1] - stage.range[0]) / (high - low),
      stage.range[0], stage.constant]);
    const t = jaxTransformForward(stage.transform, value, constant);
    value.dispose(); constant.dispose();
    value = t.sub(start).mul(scale).add(offset);
  }
  const placement = placedFrame(options), index = "xyz".indexOf(axis);
  if (!placement) return value;
  const m = placement.matrix.elements;
  const [scale, offset] = deviceParams([m[index * 5], m[12 + index]]);
  return value.mul(scale).add(offset);
}
/** Convert a data value into the world coordinate used by a Cartesian axis. */
export function axisWorld(options, axis, value) {
  const config = readAxis(options, axis),
    source = config.type === "datetime"
      ? breakPosition(axisBreaks(config), (value instanceof Date ? value.getTime() : value) - config.timeOrigin) : value;
  const mapping = tryFrameDimensionMapping(options, axis);
  if (!mapping) return NaN;
  const mapped = mapping.forward(source), placement=placedFrame(options), index="xyz".indexOf(axis);
  return placement ? mapped * placement.matrix.elements[index*5] + placement.matrix.elements[12+index] : mapped;
}
