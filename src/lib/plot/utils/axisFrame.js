import { TRANSFORM_NAMES, transformConstant } from "./scaleTransforms.js";
const AXIS_DIMENSIONS = { domain: "bounds", transform: "Transform", range: "range", constant: "TransformConstant" };
const AXIS_SUFFIXES = {
  format: "Format",
  timezone: "Timezone",
  type: "Type",
  grid: "Grid",
  major: "Major",
  minor: "Minor",
  step: "Step",
  subdivisions: "Subdivisions",
  majorInterval: "MajorInterval",
  minorInterval: "MinorInterval",
  tickCount: "TickCount",
  minorStep: "MinorStep",
  padding: "Padding",
  line: "Line",
  ticks: "Ticks",
  tickSize: "TickSize",
  tickDirection: "TickDirection",
  titleFontWeight: "TitleFontWeight",
  gridColor: "GridColor",
  gridWidth: "GridWidth",
  gridDash: "GridDash",
  lineWidth: "LineWidth",
  tickWidth: "TickWidth",
  arrow: "Arrow",
  arrowSize: "ArrowSize",
  labelOverlap: "LabelOverlap",
  tickLabelAngle: "TickLabelAngle",
  tickLabelAlign: "TickLabelAlign",
  tickLabelPlacement: "TickLabelPlacement",
  tickLabelOffset: "TickLabelOffset",
  titlePosition: "TitlePosition",
  titleAngle: "TitleAngle",
  titlePlacement: "TitlePlacement",
  titleOffset: "TitleOffset",
  context: "Context",
  breaks: "Breaks",
  calendar: "Calendar",
};

export const VIEW_CONTEXT = Symbol("coordinate view");
export const AXIS_CONTEXT = Symbol("coordinate frame");
export function groupedAxis(config = {}, { allowAuto = false } = {}) {
  const result = {},
    scales = {};
  const maps = AXIS_DIMENSIONS;
  for (const a of "xyz") {
    const c = config[a];
    if (c === undefined) continue;
    if (!c || typeof c !== "object" || Array.isArray(c))
      throw Error(`Axis ${a} must be a configuration object.`);
    for (const [key, suffix] of Object.entries(maps))
      if (c[key] !== undefined) {
        const name = a + suffix;
        if (key === "domain" && c[key] === "auto" && allowAuto) continue;
        // A domain of dates (Python's datetime, date or datetime64; TODO 136.14, 135.7) is a
        // time axis counting from its origin: the origin given, else the domain's start. The
        // columns it plots shift onto that origin as they bind.
        if (key === "domain" && Array.isArray(c[key]) && c[key].some((v) => v instanceof Date)) {
          const times = c[key].map((v) => (v instanceof Date ? v.getTime() : NaN));
          if (times.length !== 2 || !times.every(Number.isFinite) || times[0] === times[1])
            throw Error(`${a}.domain requires two distinct dates (or two distinct finite numbers).`);
          const given = c.origin instanceof Date ? c.origin.getTime() : c.origin,
            origin = Number.isFinite(given) ? given : times[0];
          result[name] = times.map((t) => t - origin);
          result["axis" + a.toUpperCase() + "TimeOrigin"] = origin;
          if (c.type === undefined) result["axis" + a.toUpperCase() + "Type"] = "datetime";
          continue;
        }
        if (key === "domain" && Array.isArray(c[key]) && c[key].some((v) => typeof v === "string"))
          throw Error(`${a}.domain lists categories (${JSON.stringify(c[key].slice(0, 3))}${c[key].length > 3 ? ", ..." : ""}): give the axis a categorical scale, ${a}={{ scale: categorical({ domain: [...] }) }} (Python ${a}={"scale": hm.categorical(domain=[...])}), or leave the domain out to list the column's categories.`);
        if (
          (key === "domain" || key === "range") &&
          (!Array.isArray(c[key]) ||
            c[key].length !== 2 ||
            !c[key].every(Number.isFinite) ||
            c[key][0] === c[key][1])
        )
          throw Error(`${a}.${key} requires two distinct finite values.`);
        if (key === "transform" && !TRANSFORM_NAMES.includes(c[key]))
          throw Error(`Invalid ${a} transform.`);
        if (key === "constant") transformConstant(c[key], `${a}.constant`);
        result[name] = c[key];
      }
    if (c.scale !== undefined) scales[a] = c.scale;
    if (c.invert !== undefined) {
      if (typeof c.invert !== "boolean") throw Error(`${a}.invert must be true or false.`);
      result[a + "Invert"] = c.invert;
    }
    if (
      c.side !== undefined &&
      !(
        a === "x" ? ["top", "bottom"] : a === "y" ? ["left", "right"] : []
      ).includes(c.side)
    )
      throw Error(`Invalid ${a} axis side.`);
    for (const [key, value] of Object.entries(c)) {
      if (["domain", "transform", "range", "scale", "invert", "constant"].includes(key)) continue;
      if (key === "label") {
        result["axisLabel" + a.toUpperCase()] = value;
        continue;
      }
      // visible (R2.0; the frame's option keeps its name, frameXShow) and side.
      if (key === "visible" || key === "side") {
        result["frame" + a.toUpperCase() + (key === "visible" ? "Show" : "Side")] = value;
        continue;
      }
      if (key === "origin") {
        // A date is its milliseconds (the origin of a datetime axis).
        result["axis" + a.toUpperCase() + "TimeOrigin"] = value instanceof Date ? value.getTime() : value;
        continue;
      }
      const suffix = AXIS_SUFFIXES[key];
      if (!suffix) {
        // The keys that contain what was written (interval: majorInterval, minorInterval).
        const known = [...Object.keys(AXIS_SUFFIXES), "domain", "transform", "range", "scale", "invert", "constant", "label", "visible", "side", "origin"];
        const near = known.filter((name) => name.toLowerCase().includes(String(key).toLowerCase()));
        throw Error(`Unknown ${a} axis property ${key}` + (near.length ? `; did you mean ${near.join(" or ")}?` : `; the axis keys are ${known.join(", ")}.`));
      }
      result["axis" + a.toUpperCase() + suffix] = value;
    }
  }
  return { values: result, scales };
}
/**
 * Where a removed Plot prop went (R2.0: a Plot's x, y and z are its only axis API), or undefined
 * for any other name. The axis style (axisFontSize, the margins) is a Theme's axes, and stays a
 * setting of the settings pane.
 */
export function removedAxisProp(key) {
  if (key === "axes") return "set x={{...}}, y={{...}} and z={{...}}";
  const axis = /^([xyz])(bounds|range|Scale|Transform)$/.exec(key) ?? /^axisLabel([XYZ])$/.exec(key);
  if (axis) {
    const field = { bounds: "domain", range: "range", Scale: "scale", Transform: "transform" }[axis[2]] ?? "label";
    return `set ${axis[1].toLowerCase()}={{ ${field} }}`;
  }
}
export const positionalOption = (key) =>
  /^[xyz](bounds|range|Transform)$/.test(key);

const AXIS_SETTINGS = new Map([..."xyz"].flatMap((axis) => {
  const cap = axis.toUpperCase();
  return [
    ...Object.entries(AXIS_DIMENSIONS).map(([field, suffix]) => [axis + suffix, [axis, field]]),
    ...Object.entries(AXIS_SUFFIXES).map(([field, suffix]) => ["axis" + cap + suffix, [axis, field]]),
    ...Object.entries({ invert: axis + "Invert", label: "axisLabel" + cap, visible: "frame" + cap + "Show",
      side: "frame" + cap + "Side", origin: "axis" + cap + "TimeOrigin" }).map(([field, option]) => [option, [axis, field]]),
  ];
}));

/** The axis and public field edited by an internal frame setting, or null. */
export function axisSetting(name) {
  return AXIS_SETTINGS.get(name) ?? null;
}
