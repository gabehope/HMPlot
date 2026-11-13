/**
 * Colormap specs and CPU sampling, matching the GPU lookup in
 * threeExtensions/materials/materials.js.
 *
 * A colormap is a built-in name ("Viridis"), an array of at least two opaque CSS colors
 * (interpolated in Lab), or { colors, space?, positions? } where space is "lab", "hsl",
 * or "srgb" and positions are ascending stops in [0, 1], one per color (evenly spaced
 * positions normalize to null, the default).
 */
import * as d3 from "d3";

export const COLORMAP_NAMES = Object.freeze([
  "Viridis", "BrBG", "BuGn", "BuPu", "Cividis", "Cool", "CubehelixDefault", "GnBu",
  "Greys", "Inferno", "Magma", "OrRd", "PRGn", "PiYG", "Plasma", "PuBu", "PuBuGn",
  "PuOr", "PuRd", "RdBu", "RdGy", "RdPu", "RdYlBu", "RdYlGn", "Sinebow", "Spectral",
  "Turbo", "Warm", "YlGn", "YlGnBu", "YlOrBr", "White",
]);
const SPACES = { lab: d3.interpolateLab, hsl: d3.interpolateHsl, srgb: d3.interpolateRgb };
/**
 * The color of a missing value (NaN or null) in a colormapped channel when neither its scale's
 * `missing` nor the theme's `missing` sets one (TODO 73.3): the neutral gray a categorical
 * scale's `unknown` defaults to, about 3:1 against white and 6:1 against a dark background.
 */
export const MISSING_COLOR = "#92989f";

/** The color a mark draws its missing values in, as its options hold it: a GeoJSON's own
 * missingColor when given (objects/geoAppearance.js), else the option its scale's or theme's
 * `missing` sets (objects/base.js missingColorNode). */
export function missingColorOf(mark) {
  // GeoJSON's option name, kept out of a literal get("...") call: the Python API generator reads
  // those as every component's options.
  const o = mark?.options, geo = "missingColor";
  const own = mark?.missingColorNode && o?.has?.(geo) && o.isExplicit?.(geo);
  return (own ? o.get(geo) : o?.get?.("valueMissing")) ?? MISSING_COLOR;
}

/**
 * Validate a colormap and return its canonical form: a built-in name string, or
 * { colors: hex[], space, positions } for custom maps.
 */
export function normalizeColormap(spec) {
  if (typeof spec === "string") {
    const name = spec.replace(/^./, (letter) => letter.toUpperCase());
    if (!COLORMAP_NAMES.includes(name))
      throw Error(`Unknown colormap: ${spec}. Use a name (${COLORMAP_NAMES.slice(0, 6).join(", ")}, ...), an array of colors, or {colors, space, positions}.`);
    return name;
  }
  const config = Array.isArray(spec) ? { colors: spec } : spec;
  if (!config || typeof config !== "object" || !Array.isArray(config.colors))
    throw Error("A colormap must be a name, an array of colors, or {colors, space, positions}.");
  const unknown = Object.keys(config).filter((key) => !["colors", "space", "positions"].includes(key));
  if (unknown.length) throw Error(`Unknown colormap property: ${unknown.join(", ")}; a colormap object takes colors, space and positions.`);
  if (config.colors.length < 2) throw Error("A custom colormap needs at least two colors.");
  const colors = config.colors.map((value) => {
    const parsed = typeof value === "string" ? d3.color(value) : null;
    if (!parsed) throw Error(`Invalid colormap color: ${JSON.stringify(value)}.`);
    // The colormap texture, legends, and exports are opaque; hex would silently drop alpha.
    if (!(parsed.opacity >= 1))
      throw Error(`Colormap colors must be opaque: ${JSON.stringify(value)} has alpha ${+(parsed.opacity || 0).toFixed(3)}. Use the mark's opacity for translucency.`);
    return parsed.formatHex();
  });
  const space = config.space ?? "lab";
  if (!SPACES[space]) throw Error(`Colormap space must be "lab", "hsl", or "srgb", not ${JSON.stringify(space)}.`);
  let positions = null;
  if (config.positions !== undefined && config.positions !== null) {
    const values = config.positions;
    if (!Array.isArray(values) || values.length !== colors.length)
      throw Error("Colormap positions need one number per color.");
    if (values.some((value, index) => typeof value !== "number" || !(value >= 0 && value <= 1) ||
        (index && value < values[index - 1])))
      throw Error("Colormap positions must be ascending numbers between 0 and 1.");
    // Evenly spaced positions are the default: normalize them away so equal maps share a key.
    const even = values.every((value, index) => Math.abs(value - index / (values.length - 1)) < 1e-9);
    positions = even ? null : [...values];
  }
  return { colors, space, positions };
}

/** A stable identity for a colormap: its name, or the normalized custom spec. */
export function colormapKey(spec) {
  const normalized = normalizeColormap(spec);
  return typeof normalized === "string" ? normalized : "custom:" + JSON.stringify(normalized);
}

/** (t in [0, 1]) -> CSS color for any colormap spec. */
export function colormapInterpolator(spec) {
  const normalized = normalizeColormap(spec);
  if (normalized === "White") return () => "#ffffff";
  if (typeof normalized === "string") return d3[`interpolate${normalized}`];
  const { colors, space, positions } = normalized;
  const piecewise = d3.piecewise(SPACES[space], colors);
  if (!positions) return piecewise;
  // Map t through the positions onto evenly spaced piecewise segments.
  const segment = d3.scaleLinear(positions, colors.map((_, index) => index / (colors.length - 1))).clamp(true);
  return (t) => piecewise(segment(t));
}

/**
 * The settings pane's view of a colormap option: the select label ("Custom" for a spec) and
 * a CSS gradient of 12 samples ("" when the value is not a valid colormap).
 */
export function colormapPreview(spec) {
  const label = typeof spec === "string" ? spec : "Custom";
  try {
    const interpolate = colormapInterpolator(spec);
    return { label, gradient: `linear-gradient(to right, ${d3.quantize(interpolate, 12).join(",")})` };
  } catch {
    return { label, gradient: "" };
  }
}

/** The samples in a row of the GPU colormap texture (threeExtensions/materials/colormaps.js). */
export const COLORMAP_SAMPLES = 512;

/** 512 RGBA float samples for the GPU colormap texture row. */
export function sampleColormap(spec, count = COLORMAP_SAMPLES) {
  const interpolate = colormapInterpolator(spec), data = new Float32Array(count * 4);
  for (let index = 0; index < count; index++) {
    const color = d3.rgb(interpolate(index / (count - 1)));
    data.set([color.r / 255, color.g / 255, color.b / 255, 1], index * 4);
  }
  return data;
}

/**
 * Hex color at scale position `t` in [0, 1], after the colormap's value range and
 * quantization: the same arithmetic as applyColorMapNode (clamp below 1, quantized levels
 * sample their midpoints).
 */
export function colormapColor(spec, t, { range = [0, 1], quantize = false, levels = 10 } = {}) {
  let value = Math.min(Math.max(range[0] + t * (range[1] - range[0]), 0), 1 - 1e-3);
  if (quantize) {
    const safe = Math.max(levels, 1);
    value = (Math.min(Math.floor(value * safe), safe - 1) + 0.5) / safe;
  }
  return d3.color(colormapInterpolator(spec)(value)).formatHex();
}

/**
 * Hex color the GPU draws for a scaled value (TODO 70.1): applyColorMapNode's clamp and
 * quantization, then the nearest of the texture row's COLORMAP_SAMPLES samples, as its nearest
 * filter reads them. `value` is the scale's output (its range applied). A NaN (a missing value)
 * reads as the map's end, as the shader's clamp returns it on Apple GPUs (WGSL leaves a NaN's
 * clamp to the implementation).
 */
export function colormapTexel(spec, value, { quantize = false, levels = 10, interpolate = colormapInterpolator(spec) } = {}) {
  let u = Number.isNaN(value) ? 1 - 1e-3 : Math.min(Math.max(value, 0), 1 - 1e-3);
  if (quantize) {
    const safe = Math.max(levels, 1);
    u = (Math.min(Math.floor(u * safe), safe - 1) + 0.5) / safe;
  }
  const index = Math.min(COLORMAP_SAMPLES - 1, Math.floor(u * COLORMAP_SAMPLES));
  return d3.color(interpolate(index / (COLORMAP_SAMPLES - 1))).formatHex();
}

/**
 * Gradient stops [{offset, color}] for a colorbar. Continuous maps use `count` evenly spaced
 * samples; quantized maps use two hard stops per level so the bands keep sharp edges.
 */
export function colormapStops(spec, { range = [0, 1], quantize = false, levels = 10, count = 24 } = {}) {
  if (!quantize) {
    return Array.from({ length: count }, (_, index) => {
      const offset = index / (count - 1);
      return { offset, color: colormapColor(spec, offset, { range }) };
    });
  }
  const stops = [];
  // Stops follow t; a quantized value range can make neighboring t share a level.
  const safe = Math.max(levels, 1), edges = [0];
  for (let level = 1; level < safe; level++) {
    const t = range[1] === range[0] ? NaN : (level / safe - range[0]) / (range[1] - range[0]);
    if (t > 0 && t < 1) edges.push(t);
  }
  edges.push(1);
  edges.sort((a, b) => a - b);
  for (let index = 0; index < edges.length - 1; index++) {
    const color = colormapColor(spec, (edges[index] + edges[index + 1]) / 2, { range, quantize, levels });
    stops.push({ offset: edges[index], color }, { offset: edges[index + 1], color });
  }
  return stops;
}
