/**
 * Embed a polar or spherical canonical shape into parent-data ranges with one
 * scale factor. Unused space is centered; reversing a parent range reverses
 * that axis without stretching the shape. The parent coordinate operation is
 * deliberately applied later, after this fit.
 */
export function fitCanonicalPoint(point, canonicalBounds, parentRanges) {
  const count = parentRanges.length;
  if (![2, 3].includes(count) || point.length < count || canonicalBounds.length < count)
    throw Error("Canonical fit requires matching two- or three-dimensional bounds and ranges.");
  const widths = [];
  for (let axis = 0; axis < count; axis++) {
    const source = canonicalBounds[axis], target = parentRanges[axis];
    if (![source, target].every((interval) => Array.isArray(interval) &&
      interval.length === 2 && interval.every(Number.isFinite) && interval[0] !== interval[1]))
      throw Error("Canonical fit intervals require two distinct finite values.");
    widths.push(Math.abs((target[1] - target[0]) / (source[1] - source[0])));
  }
  const scale = Math.min(...widths);
  return Array.from({ length: count }, (_, axis) => {
    const source = canonicalBounds[axis], target = parentRanges[axis];
    if (!Number.isFinite(point[axis])) return NaN;
    const sourceCenter = (source[0] + source[1]) / 2,
      targetCenter = (target[0] + target[1]) / 2,
      orientation = Math.sign((target[1] - target[0]) / (source[1] - source[0]));
    return targetCenter + (point[axis] - sourceCenter) * scale * orientation;
  });
}
