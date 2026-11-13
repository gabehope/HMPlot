// @ts-check
// Text's numbers as labels (TODO 143.6). A label of a number is written as a tooltip writes it:
// in Text's `format` (a d3-format string, or a %-pattern for a datetime column), else the
// theme's numbers.format, else readably (four significant digits, whole numbers exact, thousands
// grouped from 10,000). A missing value is no label. Strings pass as they are.
import { format as numberFormat } from "d3";
import { Array as JaxArray } from "@hmplot/jax";
import { formatValue } from "./tooltip.js";
import { themeNumberFormat } from "./numberLabels.js";
import { capability } from "./markKinds.js";

/**
 * Text's `format` checked: "axis" (axisText.svelte.js), a d3-format string, or a %-pattern for
 * dates. Returns the format; throws naming the forms.
 * @param {unknown} format
 */
export function textFormat(format) {
  if (typeof format === "string" && format) {
    if (format === "axis") return format;
    try {
      numberFormat(format);
      return format;
    } catch {
      if (format.includes("%")) return format;
    }
  }
  throw Error(`Text format is a d3-format string for numbers (",.0f", ".1%", "$,.2f"), a %-pattern for dates ("%b %d"), or "axis" (an axis's @ field written as its readout); received ${JSON.stringify(format)}.`);
}

/**
 * `text` with its numbers written as labels: one value, an array (typed arrays included) or a
 * dictionary column ({codes, categories}, its numeric categories written).
 * @param {unknown} text
 * @param {{ format?: string, meta?: { type?: string, origin?: number, timezone?: string } | null,
 *   numberFormat?: string }} [options] `meta`: the column's datetime or duration type
 */
export function numericTexts(text, { format, meta, numberFormat: themed } = {}) {
  /** @param {unknown} value */
  const write = (value) => {
    if (typeof value !== "number") return value;
    return Number.isFinite(value) ? formatValue(value, meta ?? undefined, format, themed) : "";
  };
  if (typeof text === "number") return write(text);
  if (Array.isArray(text)) return text.some((v) => typeof v === "number") ? text.map(write) : text;
  if (ArrayBuffer.isView(text) && !(text instanceof DataView))
    return Array.from(/** @type {ArrayLike<number>} */ (/** @type {unknown} */ (text)), write);
  const dictionary = /** @type {{ categories?: unknown[] } | null} */ (text);
  if (dictionary && typeof dictionary === "object" && Array.isArray(dictionary.categories) &&
      dictionary.categories.some((v) => typeof v === "number"))
    return { ...dictionary, categories: dictionary.categories.map(write) };
  return text;
}

/**
 * A preparation's text as labels (namedMark), for a mark whose text is labels (markKinds.js
 * `labels`): its numbers written by its `_textFormat` and `_textMeta` (both removed from
 * `props`) and the theme's number format in `options`. A column or expression computed on the
 * GPU is read back first: the returned promise settles once `props.text` holds the labels; host
 * text is rewritten at once (null).
 * @param {string} kind @param {Record<string, any>} props
 * @param {{ get?: (key: string) => unknown } | null | undefined} options
 * @returns {Promise<void> | null}
 */
export function labelNumbers(kind, props, options) {
  if (!capability(kind, "labels")) return null;
  const settings = { format: props._textFormat, meta: props._textMeta, numberFormat: themeNumberFormat(options) };
  delete props._textFormat;
  delete props._textMeta;
  const text = props.text;
  if (text instanceof JaxArray) {
    const scalar = text.shape.length === 0;
    return text.ref.data().then((values) => {
      props.text = numericTexts(scalar ? values[0] : Array.from(values), settings);
    });
  }
  props.text = numericTexts(text, settings);
  return null;
}
