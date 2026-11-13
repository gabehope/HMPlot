import { format } from "d3";
import { validateAxisAppearance } from "./axisStyle.js";
import { resolveAxes3d } from "./axes3dLayout.js";
import { normalizeColormap } from "./colormap.js";
import { validateShape, validateShapeName } from "./shapes.js";
import { PARTIAL_SECTIONS, themePartial, themePartials, themes, themePreset } from "./themePresets.js";
import { resolveStyles } from "./vectorTileStyle.js";
export const THEME_CONTEXT = Symbol("HMPlot theme");

import { MARK_KINDS } from "./themeKinds.js";
export { MARK_KINDS };
const MARK_KEYS = new Set([
  "capSize", "color", "dashSize", "dashed", "fill", "font",
  "gapSize", "headLength", "headWidth", "lit", "opacity", "outlineColor",
  "outlineWidth", "outlineOpacity", "rotation", "shape", "size", "transparent", "width",
]);
const TYPOGRAPHY_KEYS = new Set(["fontFamily", "fontSize", "color"]);
const AXIS_POSITION_KEYS = ["line", "ticks", "tickSize", "tickDirection", "titleFontWeight", "gridColor", "gridWidth", "gridDash", "arrow", "arrowSize", "titlePosition", "titleAngle", "titlePlacement", "titleOffset", "tickLabelAngle", "tickLabelAlign", "tickLabelPlacement", "tickLabelOffset"];
const AXIS_KEYS = new Set([
  ...AXIS_POSITION_KEYS, "frame", "mask", "threeD",
  "color", "fontFamily", "fontSize", "grid", "lineWidth", "marginBottom",
  "marginLeft", "marginRight", "marginTop", "textColor", "tickSize",
]);
// Legends (TODO 132.2): text, where the Plot's own legend sits, how entries flow, swatches and
// the legend title. Sizes in CSS pixels; an unset one keeps the look before themes set it.
const GUIDE_KEYS = new Set(["fontFamily", "fontSize", "textColor", "position", "layout", "swatchSize", "swatchShape", "titleFontSize", "titleFontWeight"]);
function checkGuides(guides) {
  checkKeys(guides, GUIDE_KEYS, "theme.guides");
  if (guides.position !== undefined && !["top", "bottom", "left", "right"].includes(guides.position))
    throw Error('theme.guides.position must be "top", "bottom", "left" or "right".');
  if (guides.layout !== undefined && !["auto", "inline", "stacked"].includes(guides.layout))
    throw Error('theme.guides.layout must be "auto", "inline" or "stacked".');
  if (guides.swatchShape !== undefined && !["auto", "circle", "square"].includes(guides.swatchShape))
    throw Error('theme.guides.swatchShape must be "auto", "circle" or "square".');
  for (const key of ["swatchSize", "titleFontSize"])
    if (guides[key] !== undefined && !(Number.isFinite(guides[key]) && guides[key] > 0))
      throw Error(`theme.guides.${key} must be a positive number of pixels.`);
  if (guides.titleFontWeight !== undefined && !(Number.isInteger(guides.titleFontWeight) && guides.titleFontWeight >= 100 && guides.titleFontWeight <= 900))
    throw Error("theme.guides.titleFontWeight must be a whole number from 100 to 900, such as 600.");
}
// The title block of Plots and Facets (TODO 132.1): sizes in CSS pixels; an unset size follows
// the theme's text size (title 1.35x, subtitle +1, caption -1).
const TITLE_KEYS = new Set(["align", "fontSize", "fontWeight", "subtitleFontSize", "captionFontSize", "spacing"]);
function checkTitle(title) {
  checkKeys(title, TITLE_KEYS, "theme.title");
  if (title.align !== undefined && !["left", "center", "right"].includes(title.align))
    throw Error('theme.title.align must be "left", "center" or "right".');
  for (const key of ["fontSize", "subtitleFontSize", "captionFontSize"])
    if (title[key] !== undefined && !(Number.isFinite(title[key]) && title[key] > 0))
      throw Error(`theme.title.${key} must be a positive number of pixels.`);
  if (title.spacing !== undefined && !(Number.isFinite(title.spacing) && title.spacing >= 0))
    throw Error("theme.title.spacing must be a nonnegative number of pixels.");
  if (title.fontWeight !== undefined && !(Number.isInteger(title.fontWeight) && title.fontWeight >= 100 && title.fontWeight <= 900))
    throw Error("theme.title.fontWeight must be a whole number from 100 to 900, such as 600.");
}
// Inputs (TODO 132.3): the accent of sliders, checkboxes and focus rings (default the palette's
// first color) and their text size in CSS pixels (default the theme's text size). Their font is
// the theme's typography; a page's --hm-controls-* custom properties win over both.
const CONTROL_KEYS = new Set(["accentColor", "fontSize"]);
function checkControls(controls) {
  checkKeys(controls, CONTROL_KEYS, "theme.controls");
  if (controls.accentColor !== undefined && (typeof controls.accentColor !== "string" || !controls.accentColor.trim()))
    throw Error('theme.controls.accentColor must be a CSS color, such as "#0f766e".');
  if (controls.fontSize !== undefined && !(Number.isFinite(controls.fontSize) && controls.fontSize > 0))
    throw Error("theme.controls.fontSize must be a positive number of pixels.");
}

/**
 * The inline style an input sets from its theme (TODO 132.3): --hm-theme-accent, --hm-theme-font
 * and --hm-theme-font-size, which inputStyles.css reads under the page's --hm-controls-* ones. An
 * "inherit" font sets none, so the input takes its host's: `unresolved` is the theme before
 * resolveHostText replaced "inherit" (a Theme resolves it against its own parent element).
 */
export function controlStyle(theme, unresolved = theme) {
  const accent = theme?.controls?.accentColor ?? theme?.palette?.[0],
    font = unresolved?.typography?.fontFamily === "inherit" ? undefined : theme?.typography?.fontFamily,
    size = theme?.controls?.fontSize ?? theme?.typography?.fontSize;
  return [
    typeof accent === "string" && `--hm-theme-accent:${accent}`,
    typeof font === "string" && font !== "inherit" && `--hm-theme-font:${font}`,
    Number.isFinite(size) && `--hm-theme-font-size:${size}px`,
  ].filter(Boolean).join(";");
}
// Animation (TODO 132.7): the timing of animated changes and the enter and exit effects of keyed
// rows, the Plot's animationDuration and animationEasing and a mark's enterEffect and exitEffect
// where they are not set. It does not turn animation on: a Plot's or mark's `animation` does.
const ANIMATION_KEYS = new Set(["duration", "easing", "enter", "exit"]);
/** animation.js `easings` (tests/unit/theme.test.js keeps the two the same). */
export const THEME_EASINGS = ["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"];
function checkTiming(values, path) {
  if (values.duration !== undefined && !(Number.isFinite(values.duration) && values.duration >= 0))
    throw Error(`${path}.duration must be a nonnegative number of milliseconds, such as 300.`);
  if (values.easing !== undefined && !THEME_EASINGS.includes(values.easing))
    throw Error(`${path}.easing must be one of ${THEME_EASINGS.map((name) => `"${name}"`).join(", ")}.`);
}
function checkAnimation(animation) {
  checkKeys(animation, ANIMATION_KEYS, "theme.animation");
  checkTiming(animation, "theme.animation");
  for (const key of ["enter", "exit"]) {
    const value = animation[key], path = `theme.animation.${key}`;
    if (value === undefined || typeof value === "boolean" || value === "fade") continue;
    if (!object(value))
      throw Error(`${path} must be true, false, "fade" or { effect: "fade", duration, easing }.`);
    checkKeys(value, new Set(["effect", "duration", "easing"]), path);
    if (value.effect !== undefined && value.effect !== "fade") throw Error(`${path}.effect must be "fade".`);
    checkTiming(value, path);
  }
}
const VIEW_KEYS = new Set(["background"]);
// Numbers (TODO 132.4): `format`, a d3-format string ("$,.2f", ".1%") that ticks, legends and
// tooltips use where they set no format of their own. Dates keep theirs.
function checkNumbers(numbers) {
  checkKeys(numbers, new Set(["format"]), "theme.numbers");
  if (numbers.format === undefined) return;
  try { if (typeof numbers.format !== "string" || !numbers.format) throw Error(); format(numbers.format); }
  catch { throw Error(`theme.numbers.format must be a d3-format string, such as ",.2f" or "$,.0f", not ${JSON.stringify(numbers.format)}.`); }
}

const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

function checkObject(value, path) {
  if (!object(value)) throw Error(`${path} must be an object.`);
}

function checkKeys(value, keys, path) {
  checkObject(value, path);
  for (const key of Object.keys(value))
    if (!keys.has(key))
      throw Error(key === "displayScale"
        ? `${path}.displayScale was removed (TODO 137.5); a theme sets the marks' size, width and outlineWidth instead.`
        : `Unsupported theme property ${path}.${key}.`);
}

/**
 * A theme definition with `extends` resolved: each base (a preset or partial name, a theme
 * definition or a theme resource, itself resolved), merged left to right, then the definition's
 * own keys, as mergeThemes merges (objects merge; arrays and scalars replace). A partial theme
 * lends only its section (partialLayer), and takes only that section from its own bases. A cycle
 * is an error. (TODO 132.7: `extends` as a list.)
 */
export function resolveTheme(input, seen = []) {
  if (!input) return {};
  const resource = typeof input.snapshot === "function";
  const value = resource ? input.snapshot() : input;
  if (!object(value)) return value;
  // A resource's snapshot is resolved: its keys are not all its own, so only definitions warn.
  if (!resource) checkPartial(value);
  if (value.extends === undefined) return value;
  const { extends: bases, ...own } = value;
  const group = partialGroup(value);
  const layers = (Array.isArray(bases) ? bases : [bases]).map((base) => {
    let parent;
    if (typeof base === "string") {
      parent = base.includes("/") ? themePartial(base) : themePreset(base);
      if (!parent) throw Error(base.includes("/")
        ? `theme.extends: unknown partial theme "${base}"; choose from ${Object.keys(themePartials).join(", ")}.`
        : `theme.extends: unknown preset "${base}"; choose from ${Object.keys(themes).join(", ")}.`);
    } else if (object(base) || base?.isTheme) parent = base;
    else throw Error("theme.extends must be a preset or partial theme name, a theme definition or a theme, or a list of them.");
    if (seen.includes(parent)) throw Error("theme.extends: a theme cannot extend itself (a cycle of extends).");
    const layer = partialLayer(resolveTheme(parent, [...seen, value, parent]));
    return group ? sectionOnly(layer, PARTIAL_SECTIONS[group]) : layer;
  });
  return mergeThemes(...layers, own);
}

/** The group ("axes", "legend", ...) a theme's name makes it a partial of, or undefined. */
function partialGroup(value) {
  const name = value?.name;
  if (typeof name !== "string" || !name.includes("/")) return undefined;
  const group = name.slice(0, name.indexOf("/")).toLowerCase();
  return Object.hasOwn(PARTIAL_SECTIONS, group) ? group : undefined;
}
const sectionOnly = (theme, section) => (theme?.[section] === undefined ? {} : { [section]: theme[section] });
/**
 * What a resolved theme lends when merged under another (`extends`, a nested Theme): a partial
 * lends only its section, never its name or other keys; any other theme lends all of itself.
 */
export function partialLayer(theme) {
  const group = partialGroup(theme);
  return group ? sectionOnly(theme, PARTIAL_SECTIONS[group]) : theme;
}
const partialWarnings = new Set();
/** A partial theme definition setting keys outside its section warns, once per message. */
function checkPartial(value) {
  const group = partialGroup(value);
  if (!group) return;
  const section = PARTIAL_SECTIONS[group];
  const outside = Object.keys(value).filter((key) => !["name", "extends", section].includes(key));
  if (!outside.length) return;
  const message = `Theme: the partial theme "${value.name}" sets ${outside.map((key) => `theme.${key}`).join(", ")}, outside its section (theme.${section}); put those in a full theme, or name it without "${group}/".`;
  if (partialWarnings.has(message)) return;
  partialWarnings.add(message);
  console.warn(message);
}

export function validateTheme(input = {}) {
  checkObject(input, "theme");
  input = resolveTheme(input);
  const allowed = new Set(["name", "view", "typography", "axes", "guides", "title", "numbers", "controls", "animation", "marks", "palette", "colormap", "missing", "shapes", "vectorTile"]);
  for (const key of Object.keys(input))
    if (!allowed.has(key)) throw Error(`Unsupported theme property theme.${key}.`);
  if (input.name !== undefined && typeof input.name !== "string")
    throw Error("theme.name must be a string.");
  if (input.view !== undefined) checkKeys(input.view, VIEW_KEYS, "theme.view");
  if (input.typography !== undefined)
    checkKeys(input.typography, TYPOGRAPHY_KEYS, "theme.typography");
  if (input.axes !== undefined) {
    checkKeys(input.axes, AXIS_KEYS, "theme.axes");
    validateAxisAppearance(input.axes, "theme.axes");
    if (input.axes.threeD !== undefined) {
      checkObject(input.axes.threeD, "theme.axes.threeD");
      resolveAxes3d(input.axes.threeD);
    }
  }
  if (input.guides !== undefined) checkGuides(input.guides);
  if (input.title !== undefined) checkTitle(input.title);
  if (input.numbers !== undefined) checkNumbers(input.numbers);
  if (input.controls !== undefined) checkControls(input.controls);
  if (input.animation !== undefined) checkAnimation(input.animation);
  if (input.palette !== undefined) {
    if (!Array.isArray(input.palette) || !input.palette.length || input.palette.some((v) => typeof v !== "string"))
      throw Error("theme.palette must be a nonempty array of colors.");
  }
  if (input.shapes !== undefined) {
    checkObject(input.shapes, "theme.shapes");
    for (const [name, definition] of Object.entries(input.shapes)) {
      try { validateShapeName(name); validateShape(definition, name); }
      catch (error) { throw Error(`theme.shapes.${name}: ${error.message}`); }
    }
  }
  if (input.colormap !== undefined) {
    try { normalizeColormap(input.colormap); }
    catch (error) { throw Error(`theme.colormap: ${error.message}`); }
  }
  if (input.missing !== undefined && (typeof input.missing !== "string" || !input.missing.trim()))
    throw Error("theme.missing must be a CSS color, such as \"#92989f\".");
  if (input.vectorTile !== undefined) {
    checkObject(input.vectorTile, "theme.vectorTile");
    try { resolveStyles(input.vectorTile); }
    catch (error) { throw Error(error.message.replace(/^VectorTile: /, "").replace(/^styles/, "theme.vectorTile")); }
  }
  if (input.marks !== undefined) {
    checkObject(input.marks, "theme.marks");
    for (const [kind, values] of Object.entries(input.marks)) {
      if (kind !== "default" && !MARK_KINDS.has(kind))
        throw Error(`Unsupported theme mark kind theme.marks.${kind}.`);
      checkKeys(values, MARK_KEYS, `theme.marks.${kind}`);
    }
  }
  return plainCopy(input);
}
// A deep copy of a JSON-like theme that also reads through proxies (a Svelte $state object),
// which structuredClone rejects.
const plainCopy = (value) => Array.isArray(value) ? value.map(plainCopy)
  : object(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainCopy(item)]))
  : value;

export function mergeThemes(...inputs) {
  const merge = (left, right) => {
    if (!object(right)) return Array.isArray(right) ? [...right] : right;
    const output = object(left) ? { ...left } : {};
    for (const [key, value] of Object.entries(right))
      output[key] = object(value) ? merge(output[key], value) : Array.isArray(value) ? [...value] : value;
    return output;
  };
  return inputs.filter(Boolean).reduce(merge, {});
}

/**
 * A theme's "inherit" fonts and text colors (TODO 132.5), as the host's: `host` is the computed
 * {fontFamily, color} of the element the plots sit in, or null before it is known, when the
 * `fallback` theme's value at the same place applies (the parent theme's), else none. A font key
 * takes the host's font, a color key its color, in typography, axes, guides, title and marks.
 */
export function resolveHostText(theme, host, fallback = undefined) {
  const sections = ["typography", "axes", "guides", "title"];
  if (!themeInherits(theme)) return theme;
  const resolve = (values, before) => {
    if (!values || typeof values !== "object") return values;
    const out = { ...values };
    for (const [key, value] of Object.entries(out)) {
      if (value !== "inherit" || !HOST_TEXT_KEY.test(key)) continue;
      const own = host?.[/font/i.test(key) ? "fontFamily" : "color"] ?? before?.[key];
      if (own !== undefined && own !== "inherit") out[key] = own;
      else delete out[key];
    }
    return out;
  };
  const out = { ...theme };
  for (const section of sections) if (out[section]) out[section] = resolve(out[section], fallback?.[section]);
  if (out.marks)
    out.marks = Object.fromEntries(Object.entries(out.marks).map(([kind, values]) => [kind, resolve(values, fallback?.marks?.[kind])]));
  return out;
}

/**
 * typography's "inherit" is the whole theme's text (TODO 132.5): it replaces the fonts and text
 * colors of the axes, the legends and Text marks, which presets set (a theme built on one carries
 * them). Changes `merged` in place, copying the sections it changes.
 */
export function inheritText(merged) {
  const targets = { fontFamily: [["axes", "fontFamily"], ["guides", "fontFamily"], ["marks", "Text", "font"]],
    color: [["axes", "textColor"], ["guides", "textColor"], ["marks", "Text", "color"]] };
  for (const [key, paths] of Object.entries(targets)) {
    if (merged?.typography?.[key] !== "inherit") continue;
    for (const path of paths) {
      const field = path.at(-1), parents = path.slice(0, -1);
      let target = merged;
      for (const part of parents) target = target[part] = { ...(target[part] ?? {}) };
      target[field] = "inherit";
    }
  }
}

const HOST_TEXT_KEY = /font$|fontFamily$|color$|Color$/;

/** Whether a theme names "inherit" for a font or a text color (resolveHostText). */
export function themeInherits(theme) {
  const sections = ["typography", "axes", "guides", "title"].map((key) => theme?.[key]);
  for (const values of [...sections, ...Object.values(theme?.marks ?? {})])
    if (values && Object.entries(values).some(([key, value]) => value === "inherit" && HOST_TEXT_KEY.test(key))) return true;
  return false;
}

export function themeSnapshot(value) {
  if (!value) return {};
  return validateTheme(typeof value.snapshot === "function" ? value.snapshot() : value);
}

export function createTheme(input = {}) {
  let value = validateTheme(input), version = 1;
  const listeners = new Set(), id = crypto.randomUUID();
  const notify = () => listeners.forEach((fn) => fn(value, version));
  return {
    isTheme: true,
    id,
    get version() { return version; },
    snapshot() { return structuredClone(value); },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    update(patch) {
      if (patch && Object.hasOwn(patch, "extends"))
        throw Error("theme.update() cannot change extends; replace({ extends, ... }) rebases a theme.");
      value = validateTheme(mergeThemes(value, patch));
      version++;
      notify();
      return this;
    },
    replace(next) {
      value = validateTheme(next);
      version++;
      notify();
      return this;
    },
  };
}

/**
 * The 3D marks that take their 2D counterpart's color from a theme, and only its color (TODO
 * 69.17): a Points symbol name, its pixel size and outline mean nothing on a solid sphere, nor
 * Text's pixel size on Text3D's world units. An entry of the 3D mark's own wins.
 */
const COLOR_FROM = { Points3D: ["Points", "fill"], Arrows3D: ["Arrows", "color"], Text3D: ["Text", "color"] };
/**
 * Ordinary marks without a theme color use palette[0], below explicit defaults and entries.
 * A null entry clears an inherited color while retaining this fallback (HMPlot and Ink).
 * Compounds inherit through their parts, below Mappings, rather than overriding them here.
 */
const PALETTE_COLOR = {
  Rect: "fill", Prism: "fill", Points: "fill", Area: "fill",
  Line: "color", ErrorBars: "color", Segments: "color", Arrows: "color",
};

export function markTheme(theme, kind) {
  // A callout is text in the theme's one type scale (TODO 134.29): Text's entry (and the
  // typography) below an entry of its own.
  if (kind === "Callout")
    return { ...markTheme(theme, "Text"), ...Object.fromEntries(Object.entries(theme?.marks?.Callout ?? {}).filter(([, value]) => value !== undefined)) };
  const typography = kind === "Text"
    ? {
        color: theme?.typography?.color,
        font: theme?.typography?.fontFamily,
        size: theme?.typography?.fontSize,
      }
    : {};
  const [counterpart, key] = COLOR_FROM[kind] ?? [];
  const flatColor = counterpart ? markTheme(theme, counterpart)[key] : undefined;
  // An open flat symbol still has a visible outline. A solid 3D counterpart has no such
  // outline: use the palette rather than hiding it with a transparent inherited fill.
  const inherited = key === "fill" && flatColor === "transparent" ? theme?.palette?.[0] : flatColor;
  const paletteKey = PALETTE_COLOR[kind], palette = paletteKey ? theme?.palette?.[0] : undefined;
  const own = { ...(theme?.marks?.[kind] ?? {}) };
  if (paletteKey && own[paletteKey] == null) delete own[paletteKey];
  return Object.fromEntries(
    Object.entries({
      ...(palette === undefined ? {} : { [paletteKey]: palette }),
      ...typography,
      ...(theme?.marks?.default ?? {}),
      ...(inherited === undefined ? {} : { [key]: inherited }),
      ...own,
    }).filter(([, value]) => value !== undefined),
  );
}

export function themeOptionValues(theme) {
  const view = theme?.view ?? {}, typography = theme?.typography ?? {}, axes = theme?.axes ?? {}, guides = theme?.guides ?? {},
    title = theme?.title ?? {};
  const root = {
    // Default colormap for continuous fills without an explicit one.
    cmapIndex: theme?.colormap,
    // A missing value's color in a colormapped channel, unless its scale sets one (TODO 73.3).
    valueMissing: theme?.missing,
    legendFontSize: guides.fontSize ?? typography.fontSize,
    legendTextColor: guides.textColor ?? typography.color,
    legendFontFamily: guides.fontFamily ?? typography.fontFamily,
    legendLayout: guides.layout,
    legendSwatchSize: guides.swatchSize,
    legendSwatchShape: guides.swatchShape,
    legendTitleFontSize: guides.titleFontSize,
    legendTitleFontWeight: guides.titleFontWeight,
    titleAlign: title.align,
    titleFontSize: title.fontSize,
    titleFontWeight: title.fontWeight,
    subtitleFontSize: title.subtitleFontSize,
    captionFontSize: title.captionFontSize,
    titleSpacing: title.spacing,
    // The default number format of ticks, legends and tooltips (TODO 132.4).
    numberFormat: theme?.numbers?.format,
    // Animated changes' timing where a Plot or mark sets none, and keyed rows' enter and exit
    // effects where a mark sets none (TODO 132.7). Plots' and marks' own nodes read through.
    animationDuration: theme?.animation?.duration,
    animationEasing: theme?.animation?.easing,
    enterEffect: theme?.animation?.enter,
    exitEffect: theme?.animation?.exit,
  };
  const plot = {
    background: view.background,
    legendPosition: guides.position,
    axisFontSize: axes.fontSize ?? typography.fontSize,
    // Rule and band labels are annotations: Text's size, as Callout's (TODO 134.29).
    annotationFontSize: markTheme(theme, "Text").size,
    axisFontFamily: axes.fontFamily ?? typography.fontFamily,
    // Axis text is text: the theme's text color, as legends use (axes.textColor overrides it).
    // axes.color is the axis lines' and ticks' color; many themes make it too faint for text.
    axisTextColor: axes.textColor ?? typography.color ?? axes.color,
    axisLineColor: axes.color ?? typography.color,
    axisLineWidth: axes.lineWidth,
    axisTickSize: axes.tickSize,
    axisFrame: axes.frame,
    axisMask: axes.mask,
    axisThreeD: axes.threeD,
    axisMarginLeft: axes.marginLeft,
    axisMarginRight: axes.marginRight,
    axisMarginTop: axes.marginTop,
    axisMarginBottom: axes.marginBottom,
    axisXGrid: axes.grid,
    axisYGrid: axes.grid,
    axisZGrid: axes.grid,
    ...Object.fromEntries(["X", "Y", "Z"].flatMap(axis =>
      AXIS_POSITION_KEYS.map(key => [`axis${axis}${key[0].toUpperCase()}${key.slice(1)}`, axes[key]]))),
  };
  return {
    root: Object.fromEntries(Object.entries(root).filter(([, v]) => v !== undefined)),
    plot: Object.fromEntries(Object.entries(plot).filter(([, v]) => v !== undefined)),
  };
}
