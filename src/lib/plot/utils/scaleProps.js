/**
 * A channel's scale is one object (TODO 137.4): fillScale, colorScale, sizeScale, widthScale (and
 * GeoJSON's heightScale) take continuous() or categorical(), which carry the domain, range and
 * transform. The flat per-channel keys that did this before (fillDomain, sizeRange,
 * widthTransform, ...) were removed; each is an error naming its replacement. colormap stays: a
 * continuous fill's or color's colormap, beside an automatic scale.
 *
 * Inside, the marks' options keep their own names (valueBounds, scaleRange, cmapIndex, ...).
 */
export const REMOVED_SCALE_PROPS = Object.freeze([
  "fillDomain", "fillRange", "fillTransform", "colorDomain", "colorRange", "colorTransform",
  "sizeDomain", "sizeRange", "sizeTransform", "widthDomain", "widthRange", "widthTransform",
  "heightDomain", "heightRange",
]);
/** Marks whose continuous color is their `color` channel (the rest color `fill`): line marks and text. */
const COLOR_MARKS = new Set(["Line", "Segments", "Arrows", "Arrows3D", "Text", "Text3D"]);
/** The channel a mark's continuous colormap colors: "color" for line marks, else "fill". */
export const colorChannel = (kind) => COLOR_MARKS.has(kind) ? "color" : "fill";
/**
 * The prop a settings-pane option stands for: the pane edits the marks' options by their own
 * names, and a Python scene hears the edit as the prop (scene/runtime.svelte.js). A domain, range
 * or transform edit has no prop of its own since the flat keys went (TODO 137.4): it stays on
 * screen, as an edit of a scale resource's settings does.
 */
export function settingProp(kind, option) {
  return option === "cmapIndex" ? "colormap" : option;
}

/** The error for a removed flat scale prop: the scale object that replaces it, in both languages. */
export function removedScaleProp(kind, key) {
  const [, channel, part] = /** @type {RegExpMatchArray} */ (key.match(/^(\w+?)(Domain|Range|Transform)$/));
  const colors = channel === "fill" || channel === "color";
  const python = (name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  const [js, py] = part === "Domain"
    ? ["continuous({ domain: [lo, hi] })", "hm.continuous(domain=[lo, hi])"]
    : part === "Transform" ? ['continuous({ transform: "log" })', 'hm.continuous(transform="log")']
    : colors ? ["continuous({ colormap: [...colors] })", "hm.continuous(colormap=[...])"]
    : ["continuous({ range: [lo, hi] })", "hm.continuous(range=[lo, hi])"];
  const categories = channel === "height" ? "" : ` (categorical({ domain${part === "Range" ? ", range" : ""} }) for categories)`;
  return `${kind}: ${key} was removed; a channel's scale is one object: ${channel}Scale={${js}}${categories}. ` +
    `Python: ${python(channel)}_scale=${py}.`;
}

/** Migration for the marks' renamed pixel-offset channels. */
export function removedOffsetProp(kind, key) {
  const replacement = key === "offsetX" ? "dx" : key === "offsetY" ? "dy" : null;
  return replacement ? `${kind}: ${key} was removed; pass ${replacement} for a pixel offset.` : null;
}

/**
 * `props` with colormap as the mark's cmapIndex option. A removed flat scale prop is an error
 * naming its replacement, and so is a colormap beside a scale object for the colors. Returns
 * `props` itself when neither is set. `kind` names the mark.
 */
export function scaleProps(props, kind) {
  if (!props) return props;
  for (const key of Object.keys(props)) {
    const message = removedOffsetProp(kind, key);
    if (message) throw Error(message);
  }
  const removed = REMOVED_SCALE_PROPS.find((key) => props[key] !== undefined);
  if (removed) throw Error(removedScaleProp(kind, removed));
  // A mark's displayScale was removed too (TODO 137.5): its size and width say how big it is.
  if (props.displayScale !== undefined)
    throw Error(`${kind}: displayScale was removed; set its pixel sizes (size, width, outlineWidth, dash, cap and head sizes, offsets) directly.`);
  if (props.colormap === undefined) return props;
  for (const channel of ["fill", "color"])
    if (props[`${channel}Scale`] !== undefined)
      throw Error(`${kind}: colormap and ${channel}Scale both set the ${channel} colors; set the colormap on the scale, or drop ${channel}Scale.`);
  const { colormap, ...out } = props;
  return { ...out, cmapIndex: colormap };
}

/**
 * A line's dashes (R2.0): dash is true (4 px dashes and gaps), a dash length in CSS pixels (gaps
 * as long), or [dash, gap] in CSS pixels, measured along the drawn path (TODO 73.2); false or
 * absent draws a solid line. Inside, the marks keep dashed, dashSize and gapSize.
 */
export function dashProps(props, kind) {
  if (!props || props.dash === undefined) return props;
  const { dash, ...out } = props;
  if (dash === false || dash === null) return { ...out, dashed: false };
  if (dash === true) return { ...out, dashed: true };
  if (typeof dash === "number" && dash > 0) return { ...out, dashed: true, dashSize: dash, gapSize: dash };
  if (Array.isArray(dash) && dash.length === 2 && dash.every((v) => typeof v === "number" && v >= 0))
    return { ...out, dashed: true, dashSize: dash[0], gapSize: dash[1] };
  throw Error(`${kind}.dash is true, a dash length in pixels, or [dash, gap] in pixels.`);
}
