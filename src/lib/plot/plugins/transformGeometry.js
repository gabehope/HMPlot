import { deviceArray } from "../utils/deviceParams.js";
import { shapeOf } from "../utils/data.js";
import { limitError } from "../utils/limits.js";
import { numericColumn } from "../utils/dataView.js";

/** A numeric host copy aligned to the input rows, without narrowing authored Float64 data.
 * Views whose row order differs from the source use their resolved numeric column instead.
 * The returned array belongs to the caller and never aliases the authored table.
 */
export async function transformHostColumn(kind, scope, name) {
  if (typeof name !== "string" || !name)
    throw Error(`${kind}: hostColumn needs a nonempty numeric column name.`);
  const host =
    scope.identityRows === true ? scope.hostColumn?.(name) : undefined;
  if (
    host &&
    (Array.isArray(host) || ArrayBuffer.isView(host)) &&
    !(host instanceof BigInt64Array) &&
    !(host instanceof BigUint64Array) &&
    host.length === scope.length
  )
    return Float64Array.from(host, Number);
  const column = numericColumn(scope, name);
  try {
    return Float64Array.from(await column.ref.data(), Number);
  } finally {
    column.dispose();
  }
}

/** Triangle rows are the public polygon mesh representation, not arbitrary view metadata.
 * Each row supplies three 2D corners and an edge bit mask (a-b=1, b-c=2, c-a=4).
 */
export function transformGeometry(kind, geometry, columns, count) {
  if (geometry == null) return {};
  if (geometry !== "triangles")
    throw Error(
      `${kind}: geometry must be "triangles"; omit it for ordinary rows.`,
    );
  for (const name of ["__corner0", "__corner1", "__corner2", "__edges"]) {
    const shape = shapeOf(columns[name]);
    const rank = name === "__edges" ? 1 : 2;
    if (
      shape.length !== rank ||
      shape[0] !== count ||
      (rank === 2 && shape[1] !== 2)
    )
      throw Error(
        `${kind}: triangle geometry needs ${name} with shape [${count}${rank === 2 ? ", 2" : ""}].`,
      );
  }
  return { triangles: true };
}

/** Upload flat host numbers without folding changing values into kernel source. Caller owns it. */
export function transformArray(
  kind,
  values,
  { shape = [values.length], dtype = "float32" } = {},
  maxBytes,
) {
  if (
    !["float32", "int32"].includes(dtype) ||
    !Array.isArray(shape) ||
    !shape.length ||
    shape.some((size) => !Number.isInteger(size) || size < 0) ||
    shape.reduce((a, b) => a * b, 1) !== values.length
  )
    throw Error(
      `${kind}: array needs flat numbers, a matching shape, and dtype float32 or int32.`,
    );
  if (values.length * 4 > maxBytes)
    throw limitError("storage", {
      component: kind,
      what: "its uploaded array",
      count: values.length * 4,
      limit: maxBytes,
    });
  return deviceArray(values, { dtype }).reshape(shape);
}
