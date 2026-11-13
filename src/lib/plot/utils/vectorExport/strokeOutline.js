// A constant-width row, joined to its neighbors. Compound filled paths let SVG
// apply opacity once across changing widths instead of painting overlapping wedges.
export function strokeOutline(points, width, before, after) {
  const half = width / 2;
  const direction = (a, b) => {
    const x = b[0] - a[0], y = b[1] - a[1], length = Math.hypot(x, y);
    return length > 1e-9 ? [x / length, y / length] : null;
  };
  const offset = (p, n, scale) => [p[0] + n[0] * scale, p[1] + n[1] * scale];
  const side = (sign) => points.flatMap((p, i) => {
    const incoming = direction(i ? points[i - 1] : before ?? p, p);
    const outgoing = direction(p, i + 1 < points.length ? points[i + 1] : after ?? p);
    const a = incoming ?? outgoing, b = outgoing ?? incoming;
    if (!a || !b) return [];
    const n0 = [-a[1], a[0]], n1 = [-b[1], b[0]];
    const sum = [n0[0] + n1[0], n0[1] + n1[1]], length = Math.hypot(...sum);
    if (length < 1e-9) return [offset(p, n0, half * sign), offset(p, n1, half * sign)];
    const miter = sum.map(v => v / length), denominator = Math.abs(miter[0] * n0[0] + miter[1] * n0[1]);
    if (denominator >= 0.25) return [offset(p, miter, half * sign / denominator)];
    const outer = sign * (a[0] * b[1] - a[1] * b[0]) < 0;
    return outer ? [offset(p, n0, half * sign), offset(p, n1, half * sign)] : [p];
  });
  const left = side(1), right = side(-1);
  if (!left.length || !right.length) return '';
  const cap = (p, tangent, start) => {
    const angle = Math.atan2(tangent[1], tangent[0]) + (start ? -Math.PI / 2 : Math.PI / 2);
    return Array.from({ length: 11 }, (_, i) => offset(p, [Math.cos(angle - i * Math.PI / 10), Math.sin(angle - i * Math.PI / 10)], half));
  };
  const endDirection = direction(points.at(-2), points.at(-1)), startDirection = direction(points[0], points[1]);
  const outline = [...left, ...(!after && endDirection ? cap(points.at(-1), endDirection, false) : []),
    ...right.reverse(), ...(!before && startDirection ? cap(points[0], startDirection, true) : [])];
  return `M${outline.map(p => `${p[0]} ${p[1]}`).join(' L')} Z`;
}

export function varyingWidthOutline(pieces) {
  if (pieces.length < 2 || pieces.every(p => p.attrs['stroke-width'] === pieces[0].attrs['stroke-width'])) return null;
  const first = pieces[0].attrs;
  if (!pieces.every(p => p.attrs.stroke === first.stroke && p.attrs.opacity === first.opacity)) return null;
  const d = pieces.map((piece, i) => strokeOutline(piece.parts[0], piece.attrs['stroke-width'],
    pieces[i - 1]?.parts[0].at(-2), pieces[i + 1]?.parts[0][1])).join(' ');
  return { type: 'path', attrs: { d, fill: first.stroke, opacity: first.opacity } };
}
