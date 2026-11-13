// @ts-check
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { hostRows, shapeOf } from "./data.js";
import { deviceArray } from "./deviceParams.js";
import { lowerBound } from "./numeric/search.js";
import { temporalColumn, UNIT_MS } from "./columns.js";
import { timezone as checkZone } from "./datetime.js";
import { isCategory } from "./categorical.js";

/**
 * Casts (R2.0 "Types"): expression operators that give one use of a value a type, where a schema
 * types a column for its whole scope. The result carries its type to scales, legends, brushes
 * and tooltips, as a column of that type would.
 *
 *   as_category(x, {domain})  categories: with a domain, those, in that order, and values
 *                             outside it missing, matched on the GPU with no read back; without
 *                             one, the distinct values (numbers ascending)
 *   as_ordinal(x, {domain})   the same, ordered; text needs a domain (its alphabetical order is
 *                             rarely the right one: low, medium, high)
 *   as_numeric(x)             text parsed as numbers, booleans as 0 and 1
 *   as_datetime(x, {unit, timezone})  numbers in `unit` (ms) or ISO 8601 text, as times
 *   as_duration(x, {unit})    numbers in `unit` (ms) as durations
 *
 * Text is parsed once per category on the host, never per row.
 */
export const CAST_OPS = Object.freeze(["as_category", "as_ordinal", "as_numeric", "as_datetime", "as_duration"]);
/** @type {Readonly<Record<string, readonly string[]>>} */
const KEYS = { as_category: ["domain"], as_ordinal: ["domain"], as_numeric: [], as_datetime: ["unit", "timezone"], as_duration: ["unit"] };
/** @param {unknown} value */
const token = (value) => `${typeof value}:${String(value)}`;

/**
 * @typedef {import("./expressionPlanTypes.js").ResolvedOperand} ResolvedOperand
 * @typedef {import("./expressionPlanTypes.js").OwnExpressionResource} OwnExpressionResource
 * @typedef {import("./dataViewTypes.js").DictionaryColumn} DictionaryColumn
 * @typedef {keyof typeof UNIT_MS} TimeUnit
 * @typedef {{ __expressionLiteral: true, domain?: readonly unknown[], unit?: TimeUnit,
 *   timezone?: string }} CastOptions
 */

/**
 * A cast's options, checked, as an expression literal.
 * @param {string} op one of CAST_OPS @param {unknown} [options] @returns {Readonly<CastOptions>}
 */
export function castOptions(op, options = {}) {
  const { __expressionLiteral, ...given } = /** @type {Record<string, unknown>} */ (options ?? {});
  const unknown = Object.keys(given).filter((key) => given[key] !== undefined && !KEYS[op].includes(key));
  if (unknown.length) throw Error(`${op}() takes ${KEYS[op].length ? KEYS[op].join(" and ") : "no options"}; received ${unknown.join(", ")}.`);
  /** @type {CastOptions} */
  const out = { __expressionLiteral: true };
  if (given.domain !== undefined) {
    if (!Array.isArray(given.domain) || !given.domain.length || !given.domain.every(isCategory))
      throw Error(`${op}() domain is a list of categories (text, numbers or booleans).`);
    if (new Set(given.domain.map(token)).size !== given.domain.length) throw Error(`${op}() domain values must be unique.`);
    out.domain = Object.freeze([...given.domain]);
  }
  if (given.unit !== undefined) {
    if (typeof given.unit !== "string" || !Object.hasOwn(UNIT_MS, given.unit)) throw Error(`${op}() unit is one of ${Object.keys(UNIT_MS).join(", ")}; received ${JSON.stringify(given.unit)}.`);
    out.unit = /** @type {TimeUnit} */ (given.unit);
  }
  // timezone() throws for a zone Temporal does not know.
  if (given.timezone !== undefined) out.timezone = checkZone(/** @type {string} */ (given.timezone));
  return Object.freeze(out);
}

/**
 * `table[code]` per row on the GPU, NaN where a code is missing (-1, or NaN).
 * @param {DictionaryColumn["codes"]} codes @param {readonly number[]} table
 * @param {OwnExpressionResource} own @returns {JaxArray}
 */
function lookup(codes, table, own) {
  const raw = codes instanceof JaxArray ? codes.ref : np.array(Array.from(codes, Number), { dtype: np.float32 });
  const c = raw.astype(np.float32);
  const index = np.where(np.logicalAnd(np.isfinite(c.ref), c.ref.greaterEqual(0)), c, table.length).astype(np.int32);
  return own(np.take(deviceArray([...table, NaN]), index, 0));
}

/**
 * Each value's index in `sorted` (ascending numbers) where it equals one, else NaN: a binary
 * search on the GPU against the domain, with no read back. `order` maps sorted positions to codes.
 * @param {JaxArray | ArrayLike<unknown>} values @param {number[]} sorted @param {number[]} order
 * @param {OwnExpressionResource} own @returns {JaxArray}
 */
function match(values, sorted, order, own) {
  const x = (values instanceof JaxArray ? values.ref : np.array(Array.from(values, Number), { dtype: np.float32 })).astype(np.float32);
  const keys = deviceArray(sorted);
  const at = lowerBound(keys, x);
  const index = np.clip(at, 0, Math.max(0, sorted.length - 1)).astype(np.int32);
  const found = np.take(keys, index.ref, 0).equal(x);
  const codes = np.take(deviceArray(order), index, 0);
  return own(np.where(found, codes, NaN));
}

/**
 * A computed operand (not host rows) as float32 on the device: a new reference to its array, or
 * an upload of a host value.
 * @param {unknown} value @returns {JaxArray}
 */
const deviceFloats = (value) =>
  (value instanceof JaxArray ? value.ref : np.array(/** @type {number | number[]} */ (value))).astype(np.float32);

/**
 * A cast of `arg` (an evaluated operand: { value, metadata, categories }). `dictionary(arg)` is
 * the operand as { codes, categories } when it is categorical (text, booleans), else as is.
 * @param {string} op one of CAST_OPS @param {ResolvedOperand} arg
 * @param {unknown} castOptionsLiteral the node's options, checked by castOptions when it was built
 * @param {{ own: OwnExpressionResource, dictionary: (value: unknown) => unknown }} resources
 * @returns {ResolvedOperand}
 */
export function castValue(op, arg, castOptionsLiteral, { own, dictionary }) {
  const options = /** @type {Partial<CastOptions>} */ (castOptionsLiteral ?? {});
  const metadata = arg.metadata ?? {};
  const candidate = arg.categories ? { codes: arg.value, categories: arg.categories } : dictionary(arg.value);
  /** @type {DictionaryColumn | null} */
  const dict = /** @type {Partial<DictionaryColumn> | null | undefined} */ (candidate)?.categories
    ? /** @type {DictionaryColumn} */ (candidate)
    : null;
  const categorical = dict !== null;
  if (op === "as_numeric") {
    if (categorical) {
      const table = dict.categories.map((c) => typeof c === "boolean" ? Number(c) : typeof c === "number" ? c
        : String(c).trim() === "" ? NaN : Number(String(c).trim()));
      return { value: lookup(dict.codes, table, own), metadata: { type: "numeric" } };
    }
    if (metadata.type === "datetime" || metadata.type === "duration")
      throw Error(`as_numeric() of a ${metadata.type}: subtract a time, or divide a duration by its unit, instead.`);
    const value = arg.value instanceof JaxArray && arg.value.dtype === "bool" ? own(arg.value.ref.astype(np.float32)) : arg.value;
    return { value, metadata: { type: "numeric" } };
  }
  if (op === "as_category" || op === "as_ordinal") {
    const type = op === "as_ordinal" ? "ordinal" : "categorical";
    let domain = options.domain ? [...options.domain] : null;
    if (categorical) {
      if (!domain) {
        if (type === "ordinal" && dict.categories.some((c) => typeof c === "string"))
          throw Error("as_ordinal() of text needs a domain, in order: as_ordinal(x, {domain: [\"low\", \"medium\", \"high\"]}).");
        domain = dict.categories.every((c) => typeof c === "number") ? [...dict.categories].sort((a, b) => a - b) : [...dict.categories];
      }
      const at = new Map(domain.map((c, i) => [token(c), i]));
      const table = dict.categories.map((c) => at.get(token(c)) ?? NaN);
      return { value: lookup(dict.codes, table, own), categories: domain, metadata: { type, domain, ordered: type === "ordinal", source: arg.source } };
    }
    if (!domain) {
      // The distinct values of a column the scope holds on the host (a Data's or Provider's).
      if (!hostRows(arg.value))
        throw Error(`${op}() of a computed value needs a domain, the categories in order: ${op}(x, {domain: [1, 2, 3]}).`);
      domain = [...new Set(Array.from(arg.value, Number).filter(Number.isFinite))].sort((a, b) => a - b);
    }
    // Numbers match their numeric categories; text in the domain matches no number.
    const numeric = domain.map((c, i) => [typeof c === "number" ? c : typeof c === "boolean" ? Number(c) : Number.NaN, i])
      .filter(([v]) => Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
    // Not categorical: the operand's values are a device array or host rows.
    const rows = /** @type {JaxArray | ArrayLike<unknown>} */ (arg.value);
    const value = numeric.length ? match(rows, numeric.map(([v]) => v), numeric.map(([, i]) => i), own)
      : own(np.full([shapeOf(rows)[0] ?? 0], NaN));
    return { value, categories: domain, metadata: { type, domain, ordered: type === "ordinal", source: arg.source } };
  }
  const unit = options.unit ?? "ms", factor = UNIT_MS[unit];
  if (op === "as_duration") {
    if (categorical) {
      const table = dict.categories.map((c) => Number(c) * factor);
      return { value: lookup(dict.codes, table, own), metadata: { type: "duration", unit: "ms" } };
    }
    const value = hostRows(arg.value) ? Float64Array.from(arg.value, (v) => Number(v) * factor)
      : own(deviceFloats(arg.value).mul(factor));
    return { value, metadata: { type: "duration", unit: "ms" } };
  }
  // as_datetime: a time already only takes the zone.
  if (metadata.type === "datetime") return { ...arg, metadata: { ...metadata, timezone: options.timezone ?? metadata.timezone } };
  const zone = options.timezone ?? "UTC";
  if (categorical) {
    // Each category is parsed once; rows take their category's time from the origin.
    const times = temporalColumn(dict.categories, { unit, relative: true });
    return { value: lookup(dict.codes, Array.from(times.values), own), metadata: { type: "datetime", origin: times.origin, timezone: zone, unit: "ms" } };
  }
  if (hostRows(arg.value)) {
    // Host numbers (a Data column) are float64: exact times relative to the first.
    const times = temporalColumn(arg.value, { unit, relative: true });
    return { value: times.values, metadata: { type: "datetime", origin: times.origin, timezone: zone, unit: "ms" } };
  }
  // Computed numbers are float32 already: epoch milliseconds step by 131 s at 2026 dates.
  const value = own(deviceFloats(arg.value).mul(factor));
  return { value, metadata: { type: "datetime", origin: 0, timezone: zone, unit: "ms" } };
}
