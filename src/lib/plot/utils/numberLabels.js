// @ts-check
// Default number labels for axis and colorbar ticks (TODO 133.6): decimal notation, with
// thousands grouped once a guide reaches 10,000, so a log axis reads 10,000 rather than 1e+4.
// Four-digit numbers stay ungrouped (years read 2020), and only values too small or large to
// read as decimals (under 0.0001, from 10^15) keep an exponent. An explicit format wins, then a
// theme's `numbers.format` (TODO 132.4; themeNumberFormat).
import { format } from "d3";

const exponent = format(".4~g");

/** Whether a guide labelling `values` groups thousands: one of them reaches 10,000. */
export const groupsThousands = (/** @type {Iterable<number>} */ values) => {
  for (const value of values)
    if (Math.abs(value) >= 1e4 && Math.abs(value) < 1e15) return true;
  return false;
};

const exponential = (/** @type {number} */ value) =>
  value !== 0 && (Math.abs(value) < 1e-4 || Math.abs(value) >= 1e15);

/**
 * The fewest decimals (to 12) that write `value` exactly, allowing the float noise a tick picks
 * up on its way through a scale (29.99999999 writes as 30).
 * @param {number} value
 */
function decimals(value) {
  for (let digits = 0; digits < 12; digits++) {
    const scaled = value * 10 ** digits;
    if (
      Math.abs(scaled - Math.round(scaled)) <=
      1e-6 * Math.max(1, Math.abs(scaled))
    )
      return digits;
  }
  return 12;
}

/**
 * A tick at a round value (an axis's), exactly.
 * @param {number} value @param {boolean} [grouped] from groupsThousands over the guide's ticks
 */
export function tickLabel(value, grouped = false) {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  if (exponential(value)) return exponent(value);
  return format(`${grouped ? "," : ""}.${decimals(value)}f`)(value);
}

/**
 * A tick at any value (a colorbar's, evenly along its colormap), to `digits` significant digits.
 * @param {number} value @param {boolean} [grouped] @param {number} [digits]
 */
export function roundedLabel(value, grouped = false, digits = 3) {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  if (exponential(value)) return format(`.${digits}~g`)(value);
  return format(`${grouped ? "," : ""}.${digits}~r`)(value);
}

/**
 * A single value (a tooltip's, TODO 132.4), to `digits` significant digits but never fewer than
 * its whole part: 3.142, 1235, 12,345 (an integer stays exact); grouped from 10,000.
 * @param {number} value @param {number} [digits]
 */
export function valueLabel(value, digits = 4) {
  if (!Number.isFinite(value) || value === 0 || exponential(value))
    return roundedLabel(value, false, digits);
  // Whether to group is decided on the value as shown: 9999.7 rounds to 10,000.
  if (Math.abs(value) >= 10 ** (digits - 1)) {
    const whole = Math.round(value);
    return tickLabel(whole, Math.abs(whole) >= 1e4);
  }
  return roundedLabel(value, false, digits);
}

/**
 * The theme's number format (theme.numbers.format, TODO 132.4) as an options scope reads it, or
 * undefined: the format ticks, colorbars, ramps and tooltips use where they set none of their own.
 * @param {{ get?: (key: string) => unknown } | null | undefined} options
 * @returns {string | undefined}
 */
export function themeNumberFormat(options) {
  const value = options?.get?.("numberFormat");
  return typeof value === "string" && value ? value : undefined;
}

/**
 * A legend's number format: its mark's legendTickFormat where one was set (".3~g", the option's
 * default, included), else the theme's, else undefined (the readable default).
 * @param {{ get?: (key: string) => unknown, isExplicit?: (key: string) => boolean } | null | undefined} options
 * @returns {string | undefined}
 */
export function legendNumberFormat(options) {
  const own = options?.isExplicit?.("legendTickFormat")
    ? options.get?.("legendTickFormat")
    : undefined;
  return typeof own === "string" && own ? own : themeNumberFormat(options);
}

/**
 * A slider's value beside it and in {$name} placeholders (TODO 132.3): its own d3-format string,
 * else, with a numeric step, the step's decimals (step 0.001 writes 12.345), else the readable
 * default a tooltip uses (valueLabel). Thousands group from 10,000. A theme's numbers.format is
 * for data values, not a control's (an opacity is not money).
 * @param {unknown} value @param {string | undefined} [own] @param {unknown} [step]
 */
export function inputNumberLabel(value, own = undefined, step = undefined) {
  const number = Number(value);
  if (own) return format(own)(number);
  if (
    typeof step !== "number" ||
    !(step > 0) ||
    !Number.isFinite(number) ||
    exponential(number)
  )
    return valueLabel(number);
  return format(`${Math.abs(number) >= 1e4 ? "," : ""}.${decimals(step)}f`)(
    number,
  );
}

/**
 * Compact labels for ticks that share four or more leading digits (TODO 136.10's follow-up), as
 * Matplotlib's offset: 932,000.001 and 932,000.002 read 0.001 and 0.002 beside "+932,000", where
 * each would otherwise round to 932,000. Null when the ticks read well as they are.
 * @param {number[]} values the ticks, in any order
 * @returns {{ offset: number, text: string, labels: string[] } | null} `labels` in `values`' order
 */
export function compactTicks(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return null;
  const lo = Math.min(...finite),
    hi = Math.max(...finite),
    span = hi - lo;
  if (!(span > 0)) return null;
  // The offset is the roundest value that leaves every label within the power of ten just above
  // the span: the digits that change, with the ticks' own decimals; at or below the ticks (labels
  // from 0) where one is as round, else nearest their middle (signed labels). It is a multiple of
  // that power, so it is written exactly.
  const power = Math.floor(Math.log10(span)) + 1,
    unit = 10 ** power;
  if (Math.max(Math.abs(lo), Math.abs(hi)) / unit < 1e3) return null;
  let offset = 0;
  for (
    let k =
      Math.floor(Math.log10(Math.max(Math.abs(lo), Math.abs(hi)))) - power;
    k >= 0;
    k--
  ) {
    const step = unit * 10 ** k,
      fits = (/** @type {number} */ at) =>
        Math.max(Math.abs(lo - at), Math.abs(hi - at)) < unit;
    const below = Number(
      (
        (hi <= 0 ? Math.ceil(hi / step) : Math.floor(lo / step)) * step
      ).toPrecision(15),
    );
    offset = fits(below)
      ? below
      : Number((Math.round((lo + hi) / 2 / step) * step).toPrecision(15));
    if (fits(offset)) break;
  }
  const sorted = [...new Set(finite)].sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++)
    step = Math.min(step, sorted[i] - sorted[i - 1]);
  const digits = Math.min(
    20,
    Math.max(0, decimals(step), -Math.floor(Math.log10(step)) + 1),
  );
  const residuals = values.map((value) =>
    Number.isFinite(value)
      ? Number((value - offset).toFixed(digits)) || 0
      : value,
  );
  const grouped = groupsThousands(residuals);
  const size = Math.abs(offset);
  const text =
    size >= 1e15
      ? format(`.${Math.max(0, Math.floor(Math.log10(size)) - power)}~e`)(size)
      : format(`,.${Math.min(15, Math.max(0, -power))}~f`)(size);
  return {
    offset,
    text: (offset < 0 ? "\u2212" : "+") + text,
    labels: residuals.map((value) => tickLabel(value, grouped)),
  };
}
