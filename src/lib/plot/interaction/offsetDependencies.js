/** Inspect authored channels and transform configuration for offset reads.
 * These predicates borrow configuration/scopes, never read data or retain offset buffers.
 * They deliberately depend on expression inspection rather than importing drag inversion. */
import { isExpression, expressionFields } from "../utils/expressions.js";
import { isOffsetField } from "../utils/offsets.js";

/**
 * Whether `value` reads a table's offsets: an "@offset:" field in a channel's value, or anywhere
 * in a transform's configuration. Long arrays and typed arrays are data, not configuration.
 */
export function readsOffsets(value, depth = 0) {
  if (typeof value === "string") return isOffsetField(value);
  if (isExpression(value))
    return [...expressionFields(value)].some(isOffsetField);
  if (
    !value ||
    typeof value !== "object" ||
    depth > 4 ||
    ArrayBuffer.isView(value) ||
    (Array.isArray(value) && value.length > 256)
  )
    return false;
  return (Array.isArray(value) ? value : Object.values(value)).some((item) =>
    readsOffsets(item, depth + 1),
  );
}

/**
 * Whether a transform between `scope` and its table reads offsets, so a drag changes the
 * scope's rows or columns (a Filter on moved("x")).
 */
export function scopeReadsOffsets(scope) {
  for (let at = scope, steps = 0; at && steps < 1000; steps++) {
    if (at.applyOffsets) return false;
    if (at.step && readsOffsets(at.step.config)) return true;
    at = at.physical ? at.view : (at.parent ?? at.snapshotOf);
  }
  return false;
}
