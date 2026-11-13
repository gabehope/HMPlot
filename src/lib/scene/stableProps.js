// @ts-check
// A scene node's resolved props keep each value equal to the one before as that one (TODO 69.10;
// Stage 115.2), so a component sees a new object only where something changed.

/**
 * `next` with each value equal to `previous`'s (plain objects and lists, dates, expressions,
 * literals) replaced by that one, and `previous` itself when all are.
 * @param {unknown} next
 * @param {unknown} previous
 * @returns {unknown}
 */
export function stable(next, previous, depth = 0) {
  if (
    Object.is(next, previous) ||
    previous === null ||
    previous === undefined ||
    depth > 6
  )
    return next;
  if (typeof next !== "object" || typeof previous !== "object" || next === null)
    return next;
  if (next instanceof Date)
    return previous instanceof Date && previous.getTime() === next.getTime()
      ? previous
      : next;
  /**
   * A plain object or a short list: its own values are compared one by one.
   * @param {object} value
   * @returns {value is Record<string, unknown>}
   */
  const plain = (value) =>
    Array.isArray(value)
      ? value.length <= 256
      : Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null;
  if (
    !plain(next) ||
    !plain(previous) ||
    Array.isArray(next) !== Array.isArray(previous)
  )
    return next;
  const keys = Object.keys(next);
  let same = keys.length === Object.keys(previous).length;
  if (!same && depth !== 0) return next;
  // A list is filled by its keys ("0", "1", ...) as an object is.
  const out = /** @type {Record<string, unknown>} */ (
    Array.isArray(next) ? [] : {}
  );
  for (const name of keys) {
    if (!Object.hasOwn(previous, name)) {
      if (depth !== 0) return next;
      out[name] = next[name];
      same = false;
      continue;
    }
    out[name] = stable(next[name], previous[name], depth + 1);
    if (out[name] !== previous[name]) same = false;
  }
  if (same) return previous;
  // The props themselves keep each equal value; a value inside them that changed is new as a
  // whole (expressions and literals carry markers a copy would lose).
  return depth === 0 ? out : next;
}
