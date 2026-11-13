// Arrow tables as Data (TODO 48.2): an apache-arrow Table or RecordBatch becomes an object of
// columns the Data scope prepares like any other. Read by the vectors' own structure (type ids,
// typed-array chunks, validity bitmaps), so a Data scope never imports apache-arrow; only
// fetchArrow does, lazily (providers.js).
import { typedColumn as column } from "./columns.js";

// Arrow's type ids (Schema.fbs), as apache-arrow's Type enum numbers them.
const TYPE = { Null: 1, Int: 2, Float: 3, Binary: 4, Utf8: 5, Bool: 6, Decimal: 7, Date: 8, Time: 9, Timestamp: 10,
  Interval: 11, List: 12, Struct: 13, Union: 14, FixedSizeBinary: 15, FixedSizeList: 16, Map: 17, Duration: 18,
  LargeBinary: 19, LargeUtf8: 20, Dictionary: -1 };
const NAMES = Object.fromEntries(Object.entries(TYPE).map(([name, id]) => [id, name]));
// TimeUnit: SECOND, MILLISECOND, MICROSECOND, NANOSECOND.
const TIME_UNIT_MS = [1e3, 1, 1e-3, 1e-6];

/** Whether `value` is an Arrow Table or RecordBatch (from any copy of apache-arrow). */
export function isArrowTable(value) {
  return Boolean(value) && typeof value === "object" && Array.isArray(value.schema?.fields) &&
    typeof value.getChild === "function" && Number.isInteger(value.numRows);
}

const chunksOf = (vector) => vector.data ?? [];
/** Whether row `i` of a chunk is present (its validity bit is set). */
function validity(data) {
  const bitmap = data.nullBitmap;
  if (!data.nullCount || !bitmap?.length) return null;
  const offset = data.offset ?? 0;
  return (i) => (bitmap[(offset + i) >> 3] & (1 << ((offset + i) & 7))) !== 0;
}
const hasNulls = (vector) => chunksOf(vector).some((data) => validity(data));

/** One value per row as a Float64Array: `read(data, i)` for present rows, NaN for missing ones. */
function floats(vector, read) {
  const out = new Float64Array(vector.length);
  let at = 0;
  for (const data of chunksOf(vector)) {
    const valid = validity(data);
    for (let i = 0; i < data.length; i++) out[at + i] = valid && !valid(i) ? NaN : read(data, i);
    at += data.length;
  }
  return out;
}
/** A chunk's own values: a slice's values already start at it; an unsliced chunk's may be
 * padded past its length. */
const valuesOf = (data, stride = 1) => {
  const values = data.values, start = (data.offset ?? 0) * stride;
  return values.length === data.length * stride ? values : values.subarray(start, start + data.length * stride);
};

/** A half-precision float from its 16 bits (Arrow stores Float16 as a Uint16Array). */
function half(bits) {
  const sign = bits & 0x8000 ? -1 : 1, exponent = (bits >> 10) & 0x1f, fraction = bits & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function numeric(vector, type) {
  // Precision: HALF, SINGLE, DOUBLE.
  if (type.typeId === TYPE.Float && type.precision === 0) return floats(vector, (data, i) => half(valuesOf(data)[i]));
  const floatNumbers = type.typeId === TYPE.Float;
  const wide = type.typeId === TYPE.Int && type.bitWidth === 64;
  if (!hasNulls(vector)) {
    // One typed array: a single chunk as it is (no copy), several concatenated.
    const array = vector.toArray();
    if (wide || floatNumbers || !(array instanceof Uint32Array)) return array;
    return Float64Array.from(array); // uint32 is not a GPU dtype marks read; exact as float64
  }
  if (wide) {
    // Exact BigInts on the host, missing rows NaN (Data scopes read such an array as numbers).
    const out = new Array(vector.length);
    let at = 0;
    for (const data of chunksOf(vector)) {
      const valid = validity(data), values = valuesOf(data);
      for (let i = 0; i < data.length; i++) out[at + i] = valid && !valid(i) ? NaN : values[i];
      at += data.length;
    }
    return out;
  }
  return floats(vector, (data, i) => Number(valuesOf(data)[i]));
}

/** Dictionary codes over one category list, merging the chunks' dictionaries; missing is -1. */
function dictionary(vector, type) {
  const categories = [], index = new Map(), codes = new Int32Array(vector.length);
  let at = 0;
  for (const data of chunksOf(vector)) {
    const valid = validity(data), indices = valuesOf(data), values = data.dictionary?.toArray?.() ?? [];
    const remap = Array.from(values, (value) => {
      const key = value === null || value === undefined ? null : typeof value === "bigint" ? Number(value) : value;
      if (key === null) return -1;
      if (!index.has(key)) { index.set(key, categories.length); categories.push(key); }
      return index.get(key);
    });
    for (let i = 0; i < data.length; i++) codes[at + i] = valid && !valid(i) ? -1 : remap[Number(indices[i])] ?? -1;
    at += data.length;
  }
  return { codes, categories, metadata: { type: type.isOrdered ? "ordinal" : "categorical", domain: categories } };
}

/** Strings as dictionary codes, categories in first appearance (as an inferred string column). */
function strings(vector) {
  const categories = [], index = new Map(), codes = new Int32Array(vector.length);
  let i = 0;
  for (const value of vector) {
    if (value === null || value === undefined) codes[i++] = -1;
    else {
      if (!index.has(value)) { index.set(value, categories.length); categories.push(value); }
      codes[i++] = index.get(value);
    }
  }
  return { codes, categories, metadata: { type: "categorical", domain: categories } };
}

const TEMPORAL_UNITS = { [TYPE.Timestamp]: (type) => TIME_UNIT_MS[type.unit], [TYPE.Duration]: (type) => TIME_UNIT_MS[type.unit],
  // DateUnit: DAY (Date32), MILLISECOND (Date64).
  [TYPE.Date]: (type) => (type.unit === 0 ? 864e5 : 1) };

/** One Arrow column as a Data column: a typed array, dictionary codes, or column() with a type. */
export function arrowColumn(vector, name = "column") {
  const type = vector.type, id = type?.typeId;
  switch (id) {
    case TYPE.Int:
    case TYPE.Float: {
      const values = numeric(vector, type);
      return id === TYPE.Int ? column(values, { type: "numeric", integer: true }) : values;
    }
    case TYPE.Bool:
      return column(Array.from(vector, (value) => (value === null || value === undefined ? null : Boolean(value))), { type: "boolean" });
    case TYPE.Utf8:
    case TYPE.LargeUtf8:
      return strings(vector);
    case TYPE.Dictionary:
      return dictionary(vector, type);
    case TYPE.Timestamp:
    case TYPE.Date:
    case TYPE.Duration: {
      // Epoch (or elapsed) milliseconds as float64, exact to a microsecond; the Data scope
      // stores them from the column's first time (columns.js temporalColumn).
      const factor = TEMPORAL_UNITS[id](type);
      const values = floats(vector, (data, i) => Number(valuesOf(data)[i]) * factor);
      return id === TYPE.Duration ? column(values, { type: "duration", unit: "ms" })
        : column(values, { type: "datetime", unit: "ms", timezone: id === TYPE.Timestamp ? type.timezone || "UTC" : "UTC" });
    }
    case TYPE.Decimal: {
      // Little-endian two's-complement words, 32 bits each (128- or 256-bit decimals).
      const scale = 10 ** (type.scale ?? 0), words = (type.bitWidth ?? 128) / 32, top = 1n << BigInt(words * 32);
      console.warn(`Arrow column ${name} is a decimal; it is read as floating-point numbers.`);
      return floats(vector, (data, i) => {
        const values = valuesOf(data, words);
        let value = 0n;
        for (let w = words - 1; w >= 0; w--) value = (value << 32n) | BigInt(values[i * words + w]);
        if (value >= top >> 1n) value -= top;
        return Number(value) / scale;
      });
    }
    case TYPE.FixedSizeList: {
      const size = type.listSize, child = type.children?.[0]?.type;
      if (![2, 3].includes(size) || child?.typeId !== TYPE.Float && child?.typeId !== TYPE.Int)
        throw Error(`Arrow column ${name} is a list of ${size}; only lists of 2 or 3 numbers (positions) are columns.`);
      // Plain [x, y] or [x, y, z] rows, as a position column is written by hand.
      const out = [];
      for (const data of chunksOf(vector)) {
        const valid = validity(data), values = valuesOf(data.children[0]);
        for (let i = 0; i < data.length; i++)
          out.push(Array.from({ length: size }, (_, k) => valid && !valid(i) ? NaN : Number(values[i * size + k])));
      }
      return out;
    }
    case TYPE.Null:
      return column(new Float32Array(vector.length).fill(NaN), { type: "numeric" });
    default:
      throw Error(`Arrow column ${name} is a ${NAMES[id] ?? `type ${id}`} column, which is not supported. ` +
        "Columns can be numbers, strings, dictionaries, booleans, timestamps, dates, durations, decimals or lists of 2 or 3 numbers.");
  }
}

/** An Arrow Table or RecordBatch as an object of columns, in its schema's order. */
export function arrowColumns(table) {
  const out = {};
  for (const field of table.schema.fields) out[field.name] = arrowColumn(table.getChild(field.name), field.name);
  return out;
}
