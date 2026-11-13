// @ts-check
/**
 * Conditional colors (2026-10-22). fill=where(focus, literal("#e4572e"), literal("#3677a8")) is
 * how D3 (`d => d.on ? red : gray`) and Vega-Lite (a condition) color a highlight, and what agents
 * write; it crashed building a numeric array from the color text ("Invalid type for full"). A
 * color channel whose value is a where() over color constants is rewritten into the form that
 * works: a where() over their indices, with a categorical scale from index to color. The colors
 * name themselves, so the mark publishes no legend entries for the channel (namedMark.svelte). A leaf may be literal("#hex") or a
 * plain string that is a CSS color and names no column of the scope.
 */
import { color as parseColor } from "d3";
import { categorical } from "./categorical.js";
import { isExpression, rebuildExpression } from "./expressions.js";
import { isLiteral } from "./names.js";

const CHANNELS = ["fill", "color", "outlineColor"];
/** One scale per list of colors, so a re-preparation keeps the scale's identity. */
const scales = new Map();

/** @param {unknown} node @param {{ has?: (name: string) => boolean } | null | undefined} scope */
function colorOf(node, scope) {
  const value = isLiteral(node) ? /** @type {{ value: unknown }} */ (node).value : node;
  if (typeof value !== "string" || !parseColor(value)) return undefined;
  if (!isLiteral(node) && scope?.has?.(value)) return undefined;
  return value;
}

/** @param {unknown} node @param {Set<string>} out @param {any} scope @returns {boolean} */
function collect(node, out, scope) {
  if (isExpression(node) && /** @type {any} */ (node).op === "where")
    return collect(/** @type {any} */ (node).args[1], out, scope) && collect(/** @type {any} */ (node).args[2], out, scope);
  const color = colorOf(node, scope);
  if (color === undefined) return false;
  out.add(color);
  return true;
}

/** @param {unknown} node @param {Map<string, number>} index @param {any} scope @returns {unknown} */
function rewrite(node, index, scope) {
  if (isExpression(node) && /** @type {any} */ (node).op === "where") {
    const [test, a, b] = /** @type {any} */ (node).args;
    return rebuildExpression(/** @type {any} */ (node), [test, rewrite(a, index, scope), rewrite(b, index, scope)]);
  }
  return index.get(/** @type {string} */ (colorOf(node, scope)));
}

/**
 * `props` with each conditional color channel rewritten; unchanged (the same object) otherwise.
 * An explicit scale on the channel is the author's: the channel is left as written.
 * @template {Record<string, any>} T @param {T} props @param {any} scope @returns {T}
 */
export function literalColorChannels(props, scope) {
  let out = props;
  for (const key of CHANNELS) {
    const value = props[key];
    if (!isExpression(value) || /** @type {any} */ (value).op !== "where" || props[key + "Scale"]) continue;
    const colors = new Set();
    if (!collect(value, colors, scope)) continue;
    const list = [...colors], id = list.join("|");
    let scale = scales.get(id);
    if (!scale) scales.set(id, (scale = Object.assign(categorical({ domain: list.map((_, i) => i), range: list }), { conditional: true })));
    out = { ...out, [key]: rewrite(value, new Map(list.map((c, i) => [c, i])), scope), [key + "Scale"]: scale };
  }
  return out;
}

/**
 * A mark's legend categories without its conditional color channels, which name their own colors.
 * @param {Record<string, any>} metadata @returns {Record<string, any>}
 */
export const legendCategories = (metadata) =>
  Object.fromEntries(Object.entries(metadata ?? {}).filter(([, meta]) => !meta?.scale?.conditional));
