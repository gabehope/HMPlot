import { isLiteral } from "./categorical.js";
import { isExpression } from "./expressions.js";
import { isColumnNode } from "./names.js";
import { prepareNamed } from "./namedData.js";

const TEXT_FIELDS = ["position", "x", "y", "z", "text", "font", "size", "dx", "dy"];

/**
 * Resolve a filtered Text's footprint on its existing physical rows. Membership masks both
 * coordinate extents and measured glyphs, so hidden labels contribute nothing and changing
 * membership does not specialize extent kernels by the compacted label count. Drawing and
 * keyed lifecycle still use the normal compacted rows.
 *
 * Authored row arrays, expressions/tweens, reordered series and hidden legend categories
 * cannot be certified as the same physical footprint; retain the ordinary compact path.
 * The caller owns the returned preparation and the state's usual categorical cache.
 */
/** @returns {(ReturnType<typeof prepareNamed> & {valid: import("@hmplot/jax").Array}) | null} */
export function preparePhysicalDomains(kind, channels, scope, options, state, frame, hidden = {}) {
  if (kind !== "Text" || !channels || channels.series !== undefined ||
      Object.values(hidden).some(values => values?.size)) return null;
  const physical = scope?.padded?.();
  if (!physical || scope.physical || physical.capacity * 16 > (state.limit ?? Infinity)) return null;
  const props = {};
  for (const key of TEXT_FIELDS) {
    let value = channels[key];
    if (value === undefined) continue;
    if (isColumnNode(value) && physical.has(value.args[0])) value = value.args[0];
    else if (isExpression(value)) return null;
    const raw = isLiteral(value) ? value.value : value;
    if (raw !== null && typeof raw === "object" || typeof raw === "function") return null;
    props[key] = value;
  }
  if (channels.sizeScale !== undefined) props.sizeScale = channels.sizeScale;
  const prepared = /** @type {ReturnType<typeof prepareNamed> & {valid: import("@hmplot/jax").Array}} */ (prepareNamed(props, physical, options, kind, state, frame));
  prepared.valid = physical.valid;
  return prepared;
}
