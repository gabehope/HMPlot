import { numpy as np } from "@hmplot/jax";
import { capability } from "./markKinds.js";

/**
 * How many drawn pieces a segment of `kind` becomes (TODO 32.7, the row-to-instance map): a
 * Line with a basis curve draws 3 per segment, a surface Line 64 (both: 192); other kinds 1.
 */
export function piecesPerSegment(kind, props) {
  if (kind !== "Line") return 1;
  return (props?.curve === "basis" ? 3 : 1) * (props?.surface ? 64 : 1);
}

/**
 * A per-row value (an opacity or an interaction mask) on a mark whose rows are the vertices of
 * segments (markKinds `segmentRows`: Line, Area), as one value per drawn piece: each
 * segment takes the larger of its two rows', repeated for its pieces (TODO 32.6: namedMark
 * copied this twice). Other kinds keep their rows. Consumes `values`.
 */
export function segmentValues(values, kind, props, dtype = np.float32) {
  if (!capability(kind, "segmentRows")) return values;
  const n = values.shape[0];
  const segments = n > 1
    ? np.maximum(values.ref.slice([0, n - 1]), values.ref.slice([1, n]))
    : np.zeros([0], { dtype });
  values.dispose();
  const pieces = piecesPerSegment(kind, props);
  if (pieces === 1 || !segments.shape[0]) return segments;
  const repeated = np.repeat(segments.ref, pieces, 0);
  segments.dispose();
  return repeated;
}
