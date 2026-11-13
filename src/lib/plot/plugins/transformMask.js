import { jit, numpy as np } from "@hmplot/jax";
import { asArray, shapeOf } from "../utils/data.js";

// Normalize once in one device program; publication should not add separate
// comparison and conversion dispatches to every masked transform update.
const normalizedMask = jit((mask) => mask.greater(0).astype(np.int32));

/** An independent publication may keep physical rows while hiding inactive results.
 * Buffers are adopted by the caller before this validates them. A supplied count is a promise
 * by the kernel; omitting it lets the shared runner compute the visible count once.
 */
export function transformMask(kind, output, result, size, own) {
  if (result.valid == null) {
    if (result.count != null)
      throw Error(`${kind}: return count only with a valid mask.`);
    return {};
  }
  if (output !== "newRows" || result.provenance?.rows != null)
    throw Error(`${kind}: return valid only for independent newRows output.`);
  if (shapeOf(result.valid).length !== 1 || shapeOf(result.valid)[0] !== size)
    throw Error(`${kind}: valid must have one value per output row.`);
  const count = result.count;
  if (
    count !== undefined &&
    (!Number.isInteger(count) || count < 0 || count > size)
  )
    throw Error(
      `${kind}: count must be an integer from zero to the output row count.`,
    );
  const mask = own(
    size
      ? normalizedMask(asArray(result.valid))
      : np.zeros([0], { dtype: np.int32 }),
  );
  return { valid: mask, count };
}
