import { onDestroy } from "svelte";
import { withGenericFamily } from "./defaultFont.js";
import { ScalarType, SelectType } from "../objects/types.js";

/** The title block's options (TODO 132.1), which theme.title sets; 0 sizes follow the text size. */
const TITLE_OPTIONS = [
  ["titleAlign", () => new SelectType({ defaultValue: "left", options: ["left", "center", "right"], ui: false })],
  ["titleFontSize", () => new ScalarType({ defaultValue: 0, ui: false })],
  ["titleFontWeight", () => new ScalarType({ defaultValue: 600, ui: false })],
  ["subtitleFontSize", () => new ScalarType({ defaultValue: 0, ui: false })],
  ["captionFontSize", () => new ScalarType({ defaultValue: 0, ui: false })],
  ["titleSpacing", () => new ScalarType({ defaultValue: 8, ui: false })],
];
/** Register the title block's options on a Plot's or Facet's scope, where theme.title reaches them. */
export function ensureTitleOptions(options) {
  for (const [key, type] of TITLE_OPTIONS) options.ensure(key, type());
}

/** The legends' look (TODO 132.2), which theme.guides sets; "auto" and 0 keep the look before. */
const LEGEND_OPTIONS = [
  ["legendLayout", () => new SelectType({ defaultValue: "auto", options: ["auto", "inline", "stacked"], ui: false })],
  ["legendSwatchSize", () => new ScalarType({ defaultValue: 0, ui: false })],
  ["legendSwatchShape", () => new SelectType({ defaultValue: "auto", options: ["auto", "circle", "square"], ui: false })],
  ["legendTitleFontSize", () => new ScalarType({ defaultValue: 0, ui: false })],
  ["legendTitleFontWeight", () => new ScalarType({ defaultValue: 500, ui: false })],
];
export const LEGEND_KEYS = LEGEND_OPTIONS.map(([key]) => key);
/** Register the legends' options on a Theme's scope, where theme.guides reaches them. */
export function ensureLegendOptions(options) {
  for (const [key, type] of LEGEND_OPTIONS) options.ensure(key, type());
}

/**
 * The theme's text style as an options scope resolves it (guides' font, size and color, which
 * a Theme sets from its typography): for titles, Title and Markdown (TODO 46). Reactive; call it
 * in a component's script.
 */
export function themeText(options) {
  let revision = $state(0);
  const keys = ["legendFontFamily", "legendFontSize", "legendTextColor", ...(options?.has?.("titleAlign") ? TITLE_OPTIONS.map(([key]) => key) : [])];
  const stops = options ? keys.map((key) => options.on(() => revision++, key)) : [];
  onDestroy(() => stops.forEach((stop) => stop()));
  const read = (key) => options?.get?.(key);
  return {
    get family() { revision; return withGenericFamily(read("legendFontFamily")); },
    get size() { revision; return Number(read("legendFontSize")) || 12; },
    get color() { revision; return read("legendTextColor") ?? "#40505d"; },
    // The title block (TODO 132.1): theme.title, else sizes from the text size.
    get align() { revision; return read("titleAlign") ?? "left"; },
    get titleSize() { revision; return Number(read("titleFontSize")) || Math.round(this.size * 1.35); },
    get titleWeight() { revision; return Number(read("titleFontWeight")) || 600; },
    get subtitleSize() { revision; return Number(read("subtitleFontSize")) || this.size + 1; },
    get captionSize() { revision; return Number(read("captionFontSize")) || Math.max(8, this.size - 1); },
    get spacing() { revision; const value = Number(read("titleSpacing")); return Number.isFinite(value) ? value : 8; },
  };
}
