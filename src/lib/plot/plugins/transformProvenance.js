import { numpy as np } from "@hmplot/jax";
import { asArray, shapeOf } from "../utils/data.js";
import { scalar } from "../utils/dataView.js";

/** Validate source links before publication. Output buffers were already adopted by the
 * caller, so rejection and cancellation use the runner's ordinary cleanup path.
 */
export async function transformProvenance(
  kind,
  output,
  result,
  { n, length, valid, count, scope },
  context,
) {
  let order;
  const mappedRows = result.provenance?.rows;
  if (output === "subset" || mappedRows != null) {
    const selected = output === "subset" ? result.rows : mappedRows;
    const shape = shapeOf(selected);
    if (shape.length !== 1)
      throw Error(
        `${kind}: rows must contain a one-dimensional buffer of input row indices.`,
      );
    order = context.own(
      shape[0] ? asArray(selected) : np.zeros([0], { dtype: np.int32 }),
    );
    if (shape[0]) {
      const inRange = np.logicalAnd(
        order.ref.greaterEqual(0),
        order.ref.less(n),
      );
      const integers = ["int32", "uint32"].includes(order.dtype)
        ? order.ref.equal(order.ref)
        : order.ref.equal(np.floor(order.ref));
      if (!(await scalar(np.all(np.logicalAnd(inRange, integers)))))
        throw Error(
          `${kind}: rows must contain integer indices within the input.`,
        );
      if (
        !(await scalar(
          np.all(np.take(valid.ref, order.ref.astype(np.int32), 0)),
        ))
      )
        throw Error(`${kind}: rows must select visible input rows.`);
    }
    if (count !== undefined && count !== shape[0])
      throw Error(`${kind}: columns must have one value per returned row.`);
    count = shape[0];
    if (order.dtype !== "int32")
      order = context.own(order.ref.astype(np.int32));
  }
  let provenance;
  if (result.provenance != null) {
    const value = result.provenance;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some(
        (key) => !["kind", "rows", "codes", "ids", "fields"].includes(key),
      )
    )
      throw Error(
        `${kind}: provenance must contain rows, or codes and ids with optional fields.`,
      );
    if (
      value.kind !== undefined &&
      (typeof value.kind !== "string" || !value.kind)
    )
      throw Error(`${kind}: provenance.kind must be a nonempty string.`);
    if (mappedRows == null && value.codes == null && value.ids == null) {
      if (
        !Array.isArray(value.fields) ||
        value.fields.some(
          (field) =>
            typeof field !== "string" ||
            !Object.hasOwn(result.columns ?? {}, field),
        )
      )
        throw Error(
          `${kind}: descriptive provenance.fields must name output columns.`,
        );
      return {
        order,
        count,
        provenance: { kind: value.kind ?? kind, fields: value.fields },
      };
    }
    if (mappedRows != null) {
      if (value.codes != null || value.ids != null || value.fields != null)
        throw Error(
          `${kind}: pass provenance.rows or grouped provenance, not both.`,
        );
    } else {
      if (
        shapeOf(value.codes).length !== 1 ||
        shapeOf(value.codes)[0] !== length ||
        shapeOf(value.ids).length !== 1 ||
        shapeOf(value.ids)[0] !== count
      )
        throw Error(
          `${kind}: provenance.codes needs one group ID per input buffer row and ids one per output row.`,
        );
      if (
        value.fields != null &&
        (!Array.isArray(value.fields) ||
          value.fields.some(
            (field) =>
              typeof field !== "string" ||
              !scope.has(field) ||
              !Object.hasOwn(result.columns ?? {}, field),
          ))
      )
        throw Error(
          `${kind}: provenance.fields must name grouping columns present in both input and output.`,
        );
      const codes = context.own(
          length ? asArray(value.codes) : np.zeros([0], { dtype: np.int32 }),
        ),
        ids = context.own(
          count ? asArray(value.ids) : np.zeros([0], { dtype: np.int32 }),
        );
      for (const [array, minimum] of [
        [codes, -1],
        [ids, 0],
      ]) {
        if (
          array.shape[0] &&
          !(await scalar(
            np.all(
              np.logicalAnd(
                ["int32", "uint32"].includes(array.dtype)
                  ? array.ref.equal(array.ref)
                  : array.ref.equal(np.floor(array.ref)),
                np.logicalAnd(
                  array.ref.greaterEqual(minimum),
                  array.ref.less(2147483647),
                ),
              ),
            ),
          ))
        )
          throw Error(
            `${kind}: provenance group IDs must be integers from ${minimum} to 2147483646.`,
          );
      }
      provenance = {
        kind: value.kind ?? kind,
        fields: value.fields,
        codes: context.own(
          np
            .where(valid.ref.greater(0), codes.ref, -1)
            .slice([0, n])
            .astype(np.int32),
        ),
        ids: context.own(ids.ref.astype(np.int32)),
        rows: scope,
      };
    }
  }
  return { order, count, provenance };
}
