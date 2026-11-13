/** Numeric scale resources. The normalizer owns source units; the encoding owns output units. */
import { categorical } from "./categorical.js";
import { SCALE_TRANSFORMS, transformConstant, checkMidpoint, inTransformDomain } from "./scaleTransforms.js";
import { normalizeColormap } from "./colormap.js";
import { color as parseColor } from "d3";
const sources = new Set(["data", "source"]);
let nextScaleId = 0;

function bounds(value, name, allowEqual = false) {
  if (!Array.isArray(value) || value.length !== 2 ||
      !value.every((item) => typeof item === "number" && Number.isFinite(item)) ||
      (!allowEqual && value[0] === value[1]))
    throw Error(`${name} must contain two ${allowEqual ? "" : "distinct "}finite numbers${/domain/.test(name) ? " (or [low, mid, high] for a diverging scale)" : ""}; received ${JSON.stringify(value)}.`);
  return [...value];
}

function normalizationConfig(config) {
  const transform = config.transform ?? "linear";
  const domainSource = config.domainSource ?? "data";
  if (!SCALE_TRANSFORMS[transform]) throw Error(`Unsupported normalization transform: ${transform}`);
  if (!sources.has(domainSource)) throw Error(`domainSource must be "data" or "source".`);
  // "symmetric": the inferred extent, widened to be centered on zero (R2.0).
  const symmetric = config.domain === "symmetric" || (config.symmetric === true && config.domain === undefined);
  // d3's diverging domain, [low, mid, high] (2026-10-22: written by agents, it threw at startup
  // and took the page down): the domain's ends, and its middle as the midpoint.
  if (Array.isArray(config.domain) && config.domain.length === 3) {
    if (config.midpoint !== undefined)
      throw Error("Normalization domain [low, mid, high] already gives the midpoint; pass domain [low, high] with midpoint, or the three values alone.");
    config = { ...config, domain: [config.domain[0], config.domain[2]], midpoint: config.domain[1] };
  }
  const domain = config.domain === undefined || symmetric ? undefined : bounds(config.domain, "Normalization domain");
  if (transform === "log" && domain && domain.some((value) => value <= 0))
    throw Error("Log normalization needs positive domain endpoints.");
  if (transform === "sqrt" && domain && domain.some((value) => value < 0))
    throw Error("Square-root normalization needs nonnegative domain endpoints.");
  const constant = transformConstant(config.constant, "Normalization constant");
  const midpoint = checkMidpoint(config.midpoint, domain, "Normalization");
  if (midpoint !== undefined && !inTransformDomain(transform, midpoint))
    throw Error(`Normalization midpoint ${midpoint} is outside the ${transform} transform's domain.`);
  return { domain, transform, domainSource, ...(symmetric ? { symmetric: true } : {}),
    ...(transform === "symlog" || config.constant !== undefined ? { constant } : {}),
    ...(midpoint !== undefined ? { midpoint } : {}) };
}
/** An inferred extent grows to hold the midpoint (TODO 39.2): its value stays the center. */
const withMidpoint = (extent, midpoint) => extent && midpoint !== undefined
  ? [Math.min(extent[0], midpoint), Math.max(extent[1], midpoint)] : extent;
/** An inferred extent as the normalization reads it: centered on zero when symmetric. */
const settled = (extent, config) => {
  if (!extent) return extent;
  if (!config.symmetric) return withMidpoint(extent, config.midpoint);
  const m = Math.max(Math.abs(extent[0]), Math.abs(extent[1]));
  return [-m, m];
};

export function createNormalization(config = {}) {
  let current = normalizationConfig(config), version = 0;
  const id = `normalization-${++nextScaleId}`;
  const listeners = new Set(), contributions = new Map();
  let inferred = null;
  const notify = () => { version++; for (const listener of listeners) listener(); };
  const extentOf = (entries) => entries.length
    ? [Math.min(...entries.map((entry) => Math.min(...entry))),
       Math.max(...entries.map((entry) => Math.max(...entry)))]
    : null;
  const recompute = () => {
    const next = extentOf([...contributions.values()]);
    if (JSON.stringify(next) !== JSON.stringify(inferred)) { inferred = next; notify(); }
  };
  return {
    isNormalization: true,
    id,
    get version() { return version; },
    get domain() { return current.domain ? [...current.domain] : inferred && settled([...inferred], current); },
    get transform() { return current.transform; },
    /** symlog's constant (1 unless set). */
    get constant() { return current.constant ?? 1; },
    /** The value mapped to the middle of the range, or undefined. */
    get midpoint() { return current.midpoint; },
    get domainSource() { return current.domainSource; },
    get explicit() { return current.domain !== undefined; },
    snapshot() { return { ...current, domain: current.domain && [...current.domain] }; },
    preview(owner, extent) {
      if (current.domain) return [...current.domain];
      const values = [...contributions].filter(([key]) => key !== owner).map(([, value]) => value);
      if (extent) values.push(bounds(extent, "Inferred extent", true));
      return settled(extentOf(values), current);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(patch) {
      const next = normalizationConfig({ ...current, ...patch });
      if (JSON.stringify(next) !== JSON.stringify(current)) { current = next; notify(); }
      return this;
    },
    contribute(owner, extent) {
      if (extent == null) { contributions.delete(owner); recompute(); return () => {}; }
      const next = bounds(extent, "Inferred extent", true);
      contributions.set(owner, next);
      recompute();
      return () => { if (contributions.get(owner) === next) this.release(owner); };
    },
    release(owner) { if (contributions.delete(owner)) recompute(); },
  };
}

function encodingConfig(config) {
  const hasRange = config.range !== undefined;
  const hasColormap = config.colormap !== undefined;
  if (hasRange && hasColormap)
    throw Error("A continuous encoding accepts a numeric range or a colormap, not both.");
  const range = hasRange ? bounds(config.range, "Encoding range") : undefined;
  // A name stays a string; custom maps normalize to {colors, space, positions}.
  const colormap = hasRange ? undefined : normalizeColormap(config.colormap ?? "Viridis");
  const levels = config.levels ?? 10;
  if (!Number.isInteger(levels) || levels < 1)
    throw Error("Quantization levels must be a positive integer.");
  // The color of a missing value (NaN or null) in a colormapped channel (TODO 73.3); unset, the
  // theme's `missing` color.
  const missing = config.missing ?? undefined;
  if (missing !== undefined && (typeof missing !== "string" || !missing.trim()))
    throw Error("A continuous scale's missing must be a CSS color, such as missing: \"#92989f\".");
  if (missing !== undefined && hasRange)
    throw Error("A continuous scale's missing is a color for a colormap: a scale with a numeric range (sizes, widths) has none.");
  return { range, colormap, quantize: Boolean(config.quantize), levels, ...(missing !== undefined ? { missing } : {}) };
}

export function continuous(config = {}) {
  // d3's color range (scaleLinear().range(["#2166ac", "#f7f7f7", "#b2182b"])) is a colormap here
  // (2026-10-23: as range it threw at startup and took the page down).
  if (config.colormap == null && Array.isArray(config.range) && config.range.length >= 2 &&
      config.range.every((item) => typeof item === "string" && parseColor(item)))
    config = { ...config, colormap: config.range, range: undefined };
  const normalization = config.normalization ?? createNormalization(config);
  if (!normalization.isNormalization) throw Error("Expected a normalization resource.");
  if (config.normalization && ["domain", "transform", "domainSource", "constant", "midpoint"].some((key) => config[key] !== undefined))
    throw Error("Configure domain, transform, constant, midpoint, and domainSource on the shared normalization resource.");
  let current = encodingConfig(config), version = 0;
  // Only an explicit colormap overrides the inherited (theme) default on marks.
  let colormapExplicit = config.colormap !== undefined && config.colormap !== null;
  const id = `scale-${++nextScaleId}`, listeners = new Set();
  const notify = () => { version++; for (const listener of listeners) listener(); };
  const stop = normalization.subscribe(notify);
  // A label titles the guide of every mark sharing this scale (else the first mark's label).
  const title = config.label === undefined || config.label === null ? undefined : String(config.label);
  // Typed as the public ContinuousScale, so `fillScale={continuous(...)}` checks in apps.
  return /** @type {Omit<import("../publicTypes.js").ContinuousScale, "normalization"> & { normalization: any } & Record<string, any>} */ ({
    isContinuous: true,
    id,
    title,
    normalization,
    get version() { return version; },
    get domain() { return normalization.domain; },
    get range() { return current.range && [...current.range]; },
    get colormap() { return current.colormap; },
    get colormapExplicit() { return colormapExplicit; },
    get quantize() { return current.quantize; },
    get levels() { return current.levels; },
    get missing() { return current.missing; },
    snapshot() { return { ...current, range: current.range && [...current.range], normalization: normalization.id, ...(title !== undefined ? { label: title } : {}) }; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(patch) {
      const input = { ...current, ...patch };
      if (patch.range !== undefined) { delete input.colormap; delete input.missing; }
      if (patch.colormap !== undefined) delete input.range;
      // missing: null returns to the theme's missing color.
      if (patch.missing === null) delete input.missing;
      // colormap: null returns to the default, which themes may override.
      if (patch.colormap === null) delete input.colormap;
      const explicit = patch.colormap !== undefined ? patch.colormap !== null
        : patch.range !== undefined ? false : colormapExplicit;
      const next = encodingConfig(input);
      if (JSON.stringify(next) !== JSON.stringify(current) || explicit !== colormapExplicit) {
        current = next; colormapExplicit = explicit; notify();
      }
      return this;
    },
    dispose() { stop(); listeners.clear(); },
  });
}

/** The output range of an automatic size or width scale (CSS pixels) when none is configured. */
export const AUTOMATIC_RANGES = Object.freeze({ size: [4, 16], width: [1, 6] });

/** A frame resolves one automatic encoding for each semantic field and output family. */
export function createScaleRegistry() {
  const entries = new Map(), categories = new Map();
  const configured = (family, config) => {
    const encoding = { ...config };
    if (family in AUTOMATIC_RANGES && encoding.range === undefined) encoding.range = [...AUTOMATIC_RANGES[family]];
    if (family !== "color" && encoding.range === undefined)
      throw Error(`Automatic ${family} scales need a numeric output range.`);
    return encoding;
  };
  return {
    resolve(identity, family, config = {}) {
      if (!identity) throw Error("Automatic scales need a named source column.");
      const key = JSON.stringify([identity, family]);
      if (!entries.has(key)) {
        entries.set(key, { identity, family, scale: continuous(configured(family, config)) });
      }
      return entries.get(key).scale;
    },
    updateDefaults(family, config = {}, prefix = "") {
      const next = continuous(configured(family, config));
      const norm = next.normalization.snapshot(), encoding = next.snapshot();
      next.dispose();
      for (const entry of entries.values()) {
        if (entry.family !== family || prefix && !entry.identity.startsWith(prefix)) continue;
        entry.scale.normalization.update(norm);
        entry.scale.update(encoding.range
          ? { range: encoding.range, quantize: encoding.quantize, levels: encoding.levels }
          : { colormap: config.colormap ?? null, quantize: encoding.quantize, levels: encoding.levels, missing: encoding.missing ?? null });
      }
    },
    resolveCategory(identity, family, palette) {
      if (!identity) throw Error("Automatic categories need a named source column.");
      const key = JSON.stringify([identity, family, family === "shape" ? null : palette]);
      if (!categories.has(key)) categories.set(key,
        categorical(family === "shape" ? {} : { range: palette }));
      return categories.get(key);
    },
    entries() { return [...entries.values()].map((entry) => entry.scale); },
    dispose() {
      for (const { scale } of entries.values()) scale.dispose();
      entries.clear();
      categories.clear();
    },
  };
}
