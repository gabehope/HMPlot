import { numpy as np } from "@hmplot/jax";
import { modelCalendar } from "./modelCalendars.js";
const TYPES = new Set(["numeric", "categorical", "ordinal", "boolean", "datetime", "duration", "geometry"]);

export function normalizeSchemaEntry(entry) {
  if (entry == null) return null;
  const value = typeof entry === "string" ? { type: entry } : { ...entry };
  if (!TYPES.has(value.type)) throw Error(`Unknown logical column type: ${value.type}.`);
  if ((value.type === "categorical" || value.type === "ordinal") && value.domain !== undefined) {
    if (!Array.isArray(value.domain) || new Set(value.domain.map((v) => `${typeof v}:${String(v)}`)).size !== value.domain.length)
      throw Error("Categorical and ordinal domains must contain unique values.");
  }
  if (["datetime", "duration"].includes(value.type) && value.unit !== undefined &&
      !["ns", "us", "ms", "s", "m", "h", "d"].includes(value.unit))
    throw Error(`Unsupported temporal unit: ${value.unit}.`);
  if (value.type !== "datetime" && value.timezone !== undefined)
    throw Error("timezone is only valid for datetime columns.");
  // Times in a model calendar (TODO 53.6): numbers since a reference date, as NetCDF keeps them.
  if (value.calendar !== undefined) {
    if (value.type !== "numeric") throw Error('A model calendar\'s times are a numeric column: { type: "numeric", calendar, calendarUnits }.');
    modelCalendar({ name: value.calendar, units: value.calendarUnits });
  }
  return Object.freeze(value);
}

/**
 * A column of `values` with a logical type ({ type: "ordinal", domain }, "datetime" with a unit
 * and timezone, ...), where a schema would type it: typedColumn([2, 1, 2], { type: "ordinal" }).
 */
export function typedColumn(values, options = {}) {
  const metadata = normalizeSchemaEntry(options.type ? options : { ...options, type: options.logicalType });
  if (!metadata) throw Error("typedColumn requires a logical type.");
  return Object.freeze({ __hmplotColumn: true, values, metadata });
}

export function isTypedColumn(value) {
  return Boolean(value?.__hmplotColumn);
}

function token(value) { return `${typeof value}:${String(value)}`; }

export const UNIT_MS = Object.freeze({ ns: 1e-6, us: 1e-3, ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5 });
const FLOAT32_EXACT = 1n << 24n;
const hostArray = (values) => Array.isArray(values) || (ArrayBuffer.isView(values) && !(values instanceof DataView));
const bigIntArray = (values) => values instanceof BigInt64Array || values instanceof BigUint64Array;

/**
 * A datetime or duration column on the host as milliseconds (TODO 48.1), float64 so keys and
 * joins compare exact times (TODO 43); the GPU gets float32 (data.js upload). A datetime is
 * kept relative to its first finite time (`origin`, epoch milliseconds), as Python's datetime64
 * columns are: float32 epoch milliseconds step by 131 s at 2026 dates. Values are Dates, numbers
 * in `unit`, or BigInts (subtracted exactly before the conversion); null is missing (NaN).
 */
export function temporalColumn(values, { unit = "ms", relative = true } = {}) {
  // An unknown unit is an error, not milliseconds (TODO 69.6).
  if (!Object.hasOwn(UNIT_MS, unit)) throw Error(`Unsupported temporal unit: ${unit}.`);
  const factor = UNIT_MS[unit];
  if (bigIntArray(values)) {
    const origin = relative && values.length ? values[0] : 0n;
    const zero = typeof origin === "bigint" ? origin : BigInt(origin);
    return { values: Float64Array.from(values, (v) => Number(v - zero) * factor), origin: relative ? Number(zero) * factor : 0 };
  }
  // An ISO string (a CSV's dates, TODO 53) is a time: with its offset, else UTC as naive times are.
  const iso = (v) => Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(v) || /^\d{4}-\d{2}(?:-\d{2})?$/.test(v) ? v : v.replace(" ", "T") + "Z");
  const ms = (v) => v === null || v === undefined || v === "" ? NaN : v instanceof Date ? v.getTime()
    : typeof v === "string" && Number.isNaN(Number(v)) ? iso(v.trim()) : Number(v) * factor;
  let origin = 0;
  if (relative) for (const v of values) { const t = ms(v); if (Number.isFinite(t)) { origin = t; break; } }
  return { values: Float64Array.from(values, (v) => ms(v) - origin), origin };
}

/** Host typed arrays whose values are integers (the RGB 0-255 rule reads this). */
export function integerTypedArray(values) {
  return ArrayBuffer.isView(values) && !(values instanceof Float32Array || values instanceof Float64Array) &&
    !(values instanceof DataView);
}

/** 2 or 3 when every present item of `values` is an array of that many numbers, else 0. */
function pointWidth(values) {
  let width = 0;
  for (const item of values) {
    if (item === null || item === undefined) continue;
    if (!Array.isArray(item) || (item.length !== 2 && item.length !== 3) || !item.every((v) => typeof v === "number")) return 0;
    if (width && item.length !== width) return 0;
    width = item.length;
  }
  return width;
}

export function prepareColumn(value, schema = undefined) {
  const descriptor = isTypedColumn(value) ? value : null;
  const own = descriptor?.metadata ?? value?.metadata ?? null, entry = normalizeSchemaEntry(schema);
  // A column already counting from its origin (Python's times) keeps it when a schema gives the
  // same type: the schema would read its offsets as times since 1970.
  const explicit = entry && own?.origin !== undefined && entry.type === own.type
    ? { ...entry, origin: own.origin, gpuUnit: own.gpuUnit, ...(own.sourceOrigin !== undefined ? { sourceOrigin: own.sourceOrigin } : {}) }
    : entry ?? own;
  let values = descriptor?.values ?? value;
  const metadata = explicit ? { ...explicit } : inferColumnMetadata(values);
  if (metadata?.type === "numeric" && metadata.integer === undefined && integerTypedArray(values)) metadata.integer = true;
  if (!metadata) {
    // Rows holding positions as [x, y] or [x, y, z] (deck.gl's getSourcePosition, 2026-10-23: an
    // array of row objects with start: [lon, lat]) are an N x 2 or N x 3 column, as Python's
    // np.column_stack gives; a missing row is NaN.
    const width = Array.isArray(values) ? pointWidth(values) : 0;
    if (width) {
      const flat = new Float32Array(values.length * width).fill(NaN);
      values.forEach((item, row) => { if (Array.isArray(item)) for (let k = 0; k < width; k++) flat[row * width + k] = Number(item[k]); });
      // `owned`: a device array made here, which the caller disposes (a scope, when replaced).
      return { values: np.array(flat, { dtype: np.float32 }).reshape([values.length, width]), metadata: { type: "numeric" }, owned: true };
    }
    if (Array.isArray(values) || ArrayBuffer.isView(values)) {
      const present = [...values].filter((item) => item !== null && item !== undefined && !(typeof item === "number" && Number.isNaN(item)));
      if (!present.length) throw Error("All-missing untyped columns require an explicit schema.");
      throw Error(`Column contains incompatible value types near ${present.slice(0, 4).map((item) => JSON.stringify(item)).join(", ")}.`);
    }
    return { values, metadata: null };
  }
  if (metadata.type === "geometry") return { values, metadata };
  // Already prepared: a column with an origin (Python's datetime64 columns, resources.js), or a
  // duration in milliseconds.
  let ready = metadata.origin !== undefined ||
    (metadata.type === "duration" && (metadata.unit ?? "ms") === "ms" && (values instanceof Float32Array || values instanceof Float64Array));
  // Dictionary-coded text (an Arrow dictionary, a pandas categorical): each category is parsed
  // once, and each row takes its category's time (R2.0).
  if ((metadata.type === "datetime" || metadata.type === "duration") && !ready && values?.codes && values?.categories) {
    const parsed = temporalColumn(values.categories, { unit: metadata.unit ?? "ms", relative: false }).values;
    const rows = Float64Array.from(values.codes, (code) => (code >= 0 && code < parsed.length ? parsed[code] : NaN));
    const origin = metadata.type === "datetime" ? rows.find(Number.isFinite) ?? 0 : 0;
    values = rows.map((ms) => ms - origin);
    if (metadata.type === "datetime") metadata.origin = origin;
    metadata.gpuUnit = "ms";
    ready = true;
  }
  if ((metadata.type === "datetime" || metadata.type === "duration") && !ready && hostArray(values)) {
    const temporal = temporalColumn(values, { unit: metadata.unit ?? "ms", relative: metadata.type === "datetime" });
    values = temporal.values;
    if (metadata.type === "datetime") metadata.origin = temporal.origin;
    metadata.gpuUnit = "ms";
  }
  if (metadata.type === "numeric") {
    // Float32Array reads null as 0; a missing number is NaN, as undefined already is (TODO 48.1).
    if (Array.isArray(values) && values.includes(null)) values = values.map((v) => v ?? NaN);
    // 64-bit integers stay exact on the host (keys, joins); the GPU holds float32 (data.js).
    if (bigIntArray(values) || (Array.isArray(values) && values.some((v) => typeof v === "bigint"))) {
      metadata.integer = true;
      for (const v of values) if (typeof v === "bigint" && (v > FLOAT32_EXACT || v < -FLOAT32_EXACT)) { metadata.inexact = true; break; }
    }
  }
  if (["categorical", "ordinal", "boolean"].includes(metadata.type) && !values?.codes && explicit) {
    if (!Array.isArray(values) && !ArrayBuffer.isView(values))
      throw Error(`${metadata.type} columns require a one-dimensional host array or dictionary encoding.`);
    const categories = metadata.domain ? [...metadata.domain] : [];
    const lookup = new Map(categories.map((v, i) => [token(v), i]));
    const codes = Int32Array.from(values, (v) => {
      if (v === null || v === undefined || typeof v === "number" && !Number.isFinite(v)) return -1;
      const key = token(v);
      if (!lookup.has(key)) {
        if (metadata.domain) return -1;
        lookup.set(key, categories.length); categories.push(v);
      }
      return lookup.get(key);
    });
    values = { codes, categories, metadata };
    metadata.domain = categories;
  } else if (["categorical", "boolean"].includes(metadata.type) && !explicit && (Array.isArray(values) || ArrayBuffer.isView(values))) {
    metadata.domain = [...new Map([...values]
      .filter((v) => v !== null && v !== undefined)
      .map((v) => [token(v), v])).values()];
  } else if (values && typeof values === "object" && values.codes && values.categories) {
    values = { ...values, metadata };
    metadata.domain ??= [...values.categories];
  }
  return { values, metadata };
}

export function inferColumnMetadata(value) {
  if (value?.metadata?.type) return { ...value.metadata };
  if (value?.codes && value?.categories) return { type: "categorical", domain: [...value.categories] };
  const values = Array.isArray(value) || ArrayBuffer.isView(value) ? value : null;
  if (!values) return null;
  let kind = null;
  for (const item of values) {
    if (item == null || typeof item === "number" && Number.isNaN(item)) continue;
    const next = item instanceof Date ? "datetime" : typeof item === "boolean" ? "boolean" :
      typeof item === "string" ? "categorical" : typeof item === "number" || typeof item === "bigint" ? "numeric" : null;
    if (!next) return null;
    if (kind && kind !== next) {
      if (new Set([kind, next]).size === 2 && [kind, next].every((v) => v === "numeric")) continue;
      return null;
    }
    kind = next;
  }
  return kind ? { type: kind, ...(kind === "datetime" ? { unit: "ms", timezone: "UTC" } : {}) } : null;
}
