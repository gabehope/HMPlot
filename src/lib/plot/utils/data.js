// @ts-check
import {
  jaxTransformForward,
  transformClamped,
  DEFAULT_TRANSFORM_CONSTANT,
} from "./scaleTransforms.js";
import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import { uploadColumn, deviceScalar, deviceParams } from "./deviceParams.js";
import { adoptJax } from "./foreignJax.js";
import { markAnimation } from "./markAnimation.js";

/** Typed arrays jax-js cannot hold; they widen to float32, which is exact for their range. */
const NARROW_INTEGER_ARRAYS = [
  Uint8Array,
  Uint8ClampedArray,
  Int8Array,
  Uint16Array,
  Int16Array,
];
/**
 * A plain array of numbers as np.array reads it, except that null is missing (NaN; Float32Array
 * reads it as 0) and BigInts are numbers (TODO 48.1). Any other array is returned as it is.
 */
/** @param {unknown[]} values */
function plainNumbers(values) {
  let convert = false;
  for (const v of values)
    if (v === null || typeof v === "bigint") convert = true;
    else if (v !== undefined && typeof v !== "number") return values;
  return convert
    ? Float32Array.from(values, (v) =>
        v === null || v === undefined ? NaN : Number(v),
      )
    : values;
}
/** @param {unknown} value @returns {JaxArray} */
function upload(value) {
  // Integer-ness (the RGB 0-255 rule) survives through column metadata (columns.js) and the
  // host typed array itself, not the GPU dtype: int32 GPU arithmetic truncates.
  if (
    ArrayBuffer.isView(value) &&
    NARROW_INTEGER_ARRAYS.some((Type) => value instanceof Type)
  )
    value = Float32Array.from(
      /** @type {Uint8Array | Uint8ClampedArray | Int8Array | Uint16Array | Int16Array} */ (
        value
      ),
    );
  // WebGPU kernels have no 64-bit types: float64 and 64-bit integer columns reach the GPU as
  // float32, as plain number arrays do (exact integers up to 2^24; TODO 48.1).
  else if (value instanceof Float64Array) value = new Float32Array(value);
  else if (value instanceof BigInt64Array || value instanceof BigUint64Array)
    value = Float32Array.from(value, Number);
  else if (Array.isArray(value)) value = plainNumbers(value);
  // np.array folds a short constant-filled column into kernels as a literal; a new constant
  // would then compile new kernels (13.8 N4, TODO 17.1).
  return (
    uploadColumn(value) ??
    np.array(/** @type {Parameters<typeof np.array>[0]} */ (value))
  );
}

/**
 * Device copies of Data columns (TODO 26.6). A Data scope retains the host arrays it holds, and
 * asArray hands out references to one device copy of each: every mark, transform and expression
 * that reads the column shares it, and an update that keeps the column (the same array object)
 * uploads nothing. Before, each consumer uploaded its own copy on every run (the earthquakes'
 * depth slider uploaded nine 290 KB columns per step). The copy is disposed when the last scope
 * holding the array releases it (an update that replaces or drops the column, or dispose).
 */
/** @type {WeakMap<object, {users: number, array: JaxArray | null}>} */
const deviceColumns = new WeakMap();
/** @param {object} values */
export function retainColumn(values) {
  const entry = deviceColumns.get(values);
  if (entry) entry.users++;
  else deviceColumns.set(values, { users: 1, array: null });
}
/** @param {object} values */
export function releaseColumn(values) {
  const entry = deviceColumns.get(values);
  if (!entry || --entry.users > 0) return;
  entry.array?.dispose();
  deviceColumns.delete(values);
}

/** Borrow caller arrays; every returned array belongs to the caller. */
/** @param {unknown} value @returns {JaxArray} */
export function asArray(value) {
  if (isChannelScalar(value)) value = value.value;
  value = adoptJax(value); // An array from another jax-js copy (TODO 23.0b).
  // JIT tracers have the same array/ref ownership contract, but are not JaxArray instances.
  // Returning np.array(tracer) would borrow it without a ref and let an expression free it.
  if (isDeviceArray(value)) return value.ref;
  const column = deviceColumns.get(/** @type {object} */ (value));
  if (column) return (column.array ??= upload(value)).ref;
  return upload(value);
}
/** JAX arrays and JIT tracers share shape and reference ownership. */
/** Device arrays include symbolic arrays while JAX traces a compiled program.
 * @param {unknown} value @returns {value is JaxArray}
 */
export const isDeviceArray = (value) =>
  value instanceof JaxArray ||
  (Array.isArray(/** @type {Partial<JaxArray> | null} */ (value)?.shape) &&
    typeof (/** @type {Partial<JaxArray>} */ (value).astype) === "function" &&
    typeof (/** @type {Partial<JaxArray>} */ (value).dispose) === "function");
// A numeric expression remains a scaled channel when it has one host value. In particular,
// fill={0.5} is a literal color; fill={divide(1, 2)} is a value for the color scale.
const CHANNEL_SCALAR = Symbol("channel scalar");
/** @param {number} value */
export const channelScalar = (value) => ({ [CHANNEL_SCALAR]: true, value });
/** @param {unknown} value @returns {value is ReturnType<typeof channelScalar>} */
export const isChannelScalar = (value) =>
  /** @type {ReturnType<typeof channelScalar> | null} */ (value)?.[
    CHANNEL_SCALAR
  ] === true;
/**
 * Host rows: an array or an indexed typed array. A DataView is outside the column protocol.
 * @param {unknown} value @returns {value is ArrayLike<unknown>}
 */
export const hostRows = (value) =>
  Array.isArray(value) ||
  (ArrayBuffer.isView(value) && !(value instanceof DataView));
/** @param {unknown} value @returns {number[]} */
export function shapeOf(value) {
  if (/** @type {Partial<JaxArray> | null} */ (value)?.shape)
    return /** @type {JaxArray} */ (value).shape;
  if (!hostRows(value)) return [];
  return [
    value.length,
    ...(value.length && hostRows(value[0]) ? shapeOf(value[0]) : []),
  ];
}
/** @param {Record<string, unknown>} values @param {string} [primary] */
export function validateFields(values, primary = "position") {
  const shape = shapeOf(values[primary]);
  const count =
    values[primary] == null
      ? 0
      : shape.length > 1
        ? shape[0]
        : shape[0] === 0
          ? 0
          : 1;
  for (const [key, value] of Object.entries(values)) {
    const dims = shapeOf(value);
    const vector = [
      "position",
      "start",
      "end",
      "control1",
      "control2",
    ].includes(key);
    if (
      vector &&
      dims.length &&
      dims[0] &&
      ![2, 3].includes(/** @type {number} */ (dims.at(-1)))
    )
      throw new Error(`${key} must contain 2D or 3D positions`);
    const buffered =
      dims.length > 1 ||
      (!vector &&
        dims.length === 1 &&
        (value instanceof JaxArray || key !== "size"));
    if (buffered && dims[0] !== count)
      throw new Error(`${key} has ${dims[0]} rows; expected ${count}`);
  }
  return count;
}
/** @param {import("../objects/base.js").BasePlotObject} mark
 * @param {Record<string, unknown>} values @param {string} [primary] */
export function updateFields(mark, values, primary = "position") {
  try {
    validateFields(values, primary);
  } catch (error) {
    mark.count = 0;
    mark.invalidate();
    console.error("Invalid plot fields:", error);
    return Promise.resolve(false);
  }
  const shape = JSON.stringify(shapeOf(values[primary]));
  const categoryTopology = mark.options?.get("_categoryTopology");
  const animation = markAnimation(mark);
  animation.snap =
    (animation.shape !== undefined && animation.shape !== shape) ||
    (animation.topology !== undefined &&
      animation.topology !== categoryTopology);
  animation.topology = categoryTopology;
  animation.shape = shape;
  // Room for every row before any field is written (TODO 29.2: past maxElements, grow).
  const rows = shapeOf(
    /** @type {{codes?: unknown} | null} */ (values[primary])?.codes ??
      values[primary],
  )[0];
  if (rows > (mark.manager?.maxElements ?? Infinity))
    mark.ensureCapacity?.(rows);
  const batch = mark.manager.nextBatchId;
  return Promise.all(
    Object.entries(values).map(([key, value]) =>
      mark.fields
        .get(key)
        ?.update(
          /** @type {import("./effectiveFieldBinding.js").FieldValue} */ (
            value
          ),
          batch,
        ),
    ),
  );
}
/**
 * A column through one scale onto `range` (jax). Consumes `input`. A value outside the
 * transform's domain maps to NaN (a missing value, TODO 39.1). `constant`: symlog's c.
 * @param {JaxArray} input @param {string} [kind] @param {number[]} [bounds]
 * @param {number[]} [range] @param {number} [constant]
 */
export function transformArray(
  input,
  kind = "linear",
  bounds = [-1, 1],
  range = [-50, 50],
  constant = DEFAULT_TRANSFORM_CONSTANT,
) {
  const f = (/** @type {number} */ x) =>
    transformClamped(kind ?? "linear", x, constant);
  const [c] = kind === "symlog" ? deviceParams([constant]) : [constant];
  const data = jaxTransformForward(kind ?? "linear", input, c);
  input.dispose();
  if (kind === "symlog") /** @type {JaxArray} */ (c).dispose();
  const denominator = f(bounds[1]) - f(bounds[0]);
  // Domains follow the data: they reach the kernels from a buffer (TODO 17.1).
  const [low, span, width, start] = deviceParams([
    f(bounds[0]),
    Math.abs(denominator) < 1e-8 ? 1e-8 : denominator,
    range[1] - range[0],
    range[0],
  ]);
  return data.sub(low).div(span).mul(width).add(start);
}
/**
 * Line segments of consecutive rows. `validCount` (a padded view's valid-first rows, TODO 17.3b):
 * only the first `validCount` rows form the line, so the last one's `next` neighbour is its own end,
 * as if the rows stopped there; the caller draws the first validCount - 1 segments. Each segment's
 * `distance` is 0: a dashed Line measures its path on screen, on the GPU (TODO 73.2,
 * utils/dashDistances.js); the field stays for the sampled path's rebuild (sampledBuffers.js).
 */
/** @param {unknown} position @param {unknown} options @param {boolean} [connected]
 * @param {boolean} [world] @param {number | JaxArray} [validCount] */
export function lineArrays(
  position,
  options,
  connected = false,
  world = false,
  validCount = undefined,
) {
  if (!position || shapeOf(position)[0] < 2)
    return { start: [], end: [], distance: [] };
  const x = asArray(position);
  if (x.shape.length !== 2 || ![2, 3].includes(x.shape[1])) {
    x.dispose();
    throw new Error("Line position must have shape [N, 2|3]");
  }
  const distance = np.zeros([x.shape[0] - 1, 1]);
  const neighbors = connected
    ? {
        previous:
          x.shape[0] === 2
            ? x.ref.slice([0, 1])
            : np.concatenate([x.ref.slice([0, 1]), x.ref.slice([0, -2])], 0),
        next:
          x.shape[0] === 2
            ? x.ref.slice([1, 2])
            : validCount === undefined
              ? np.concatenate([x.ref.slice([2]), x.ref.slice([-1])], 0)
              : // Rows from validCount on are not part of the line: stop at each segment's end.
                np.where(
                  np
                    .arange(x.shape[0] - 1)
                    .astype(np.int32)
                    .add(2)
                    .less(deviceScalar(validCount, { dtype: "int32" }))
                    .reshape([-1, 1]),
                  np.concatenate([x.ref.slice([2]), x.ref.slice([-1])], 0),
                  x.ref.slice([1]),
                ),
      }
    : {};
  return {
    ...neighbors,
    start: x.ref.slice([0, -1]),
    end: x.slice([1]),
    distance,
  };
}
/** @template T @param {T} value @param {number} vertexCount */
export function segmentAttribute(value, vertexCount) {
  const shape = shapeOf(value);
  if (shape.length && shape[0] === vertexCount)
    return asArray(value).slice([0, -1]);
  return value;
}
/** @param {Record<string, unknown>} values */
export function disposeArrays(values) {
  for (const value of Object.values(values))
    if (value instanceof JaxArray) value.dispose();
}
