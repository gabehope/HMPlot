import { asArray, shapeOf, lineArrays, disposeArrays } from "./data.js";
import { curveControls } from "./curves.js";
import { rectangleDomainArrays } from "./rectangles.js";

const CURVES_WITH_CONTROLS = ["catmull-rom", "monotone-x", "monotone-y"];

/**
 * Inputs to numeric domain summaries, separate from paint and CSS-sized glyph styling.
 * A consumer may resolve authored column names to their current immutable column identities.
 * Returning null from that resolver disables reuse for a dependency it cannot certify (for
 * example a view-state expression). Text's alignment/box/displayScale are applied to retained
 * metrics afterwards by labelInsets; text, font and numeric footprint inputs belong here.
 * @param {string} kind
 * @param {Record<string, unknown>} props
 * @param {{ glyphs?: { x?: boolean, y?: boolean, z?: boolean } | null,
 *   resolve?: (value: unknown, channel: string) => unknown }} [options]
 * @returns {Record<string, unknown> | null}
 */
export function domainInputs(kind, props, { glyphs = null, resolve = value => value } = {}) {
  const names = ["position", "x", "y", "z", "x0", "x1", "y0", "y1", "z0", "z1",
    "lower", "upper", "baseline", "start", "end", "control1", "control2", "axis"];
  if (kind === "Prism") names.push("width", "depth", "rotation", "shape");
  if (kind === "Line") names.push("curve", "curveAlpha");
  if (kind === "Line" || kind === "Area") names.push("series");
  if (kind === "Text") names.push("text", "font", "size", "dx", "dy");
  if (glyphs && Object.values(glyphs).some(Boolean)) names.push("size");
  const inputs = { glyphX: Boolean(glyphs?.x), glyphY: Boolean(glyphs?.y), glyphZ: Boolean(glyphs?.z) };
  for (const name of names) {
    const value = props[name];
    if (value === undefined) continue;
    const dependency = resolve(value, name);
    if (dependency === null) return null;
    inputs[name] = dependency;
  }
  return inputs;
}

/**
 * The arrays whose extents set a mark's automatic axis domains (TODO 17.2a/b; out of
 * namedMark.svelte, TODO 32.6): [{ axis, fields }] for each axis `skip` keeps, a field being an
 * owned array or { array, column } for one column of a 2D one (finiteExtents takes the column).
 * By kind:
 * - Prism: its footprint box (rotated) on every axis;
 * - Area along x: lower and upper on x, x on y;
 * - otherwise position's column, or x, x0 and x1 (and on the value axis, `axis` or y: lower,
 *   upper and baseline, an Area's 0 when it has none, as the mark fills to; TODO 67.1);
 *   ErrorBars at positions add lower and upper on their axis; start, end
 *   and control points add their columns; a curved Line (catmull-rom, monotone) adds its
 *   control points, which a curve can reach past its rows.
 * - Points sized in data units (`glyphs`, the axes where a point's size is a length: x, and y
 *   when the plot keeps a data unit equal on both): each center -+ half its size, so a point's
 *   whole disk is inside the automatic domain (TODO 67.3: Pack's circles were cut at the edges).
 * The caller disposes the fields (readDomains does).
 * @param {string} kind
 * @param {Record<string, unknown>} props
 * @param {{ skip?: (axis: string) => boolean, markOptions?: object | null,
 *   glyphs?: { x?: boolean, y?: boolean, z?: boolean } | null }} [options]
 */
export function domainFields(kind, props, { skip = () => false, markOptions, glyphs = null } = {}) {
  const collected = [];
  // A Prism's rotated footprint bounds every axis: built once, not once per axis (33.2).
  let prismBox;
  const numbers = (v) => asArray(typeof v === "number" ? [v] : v);
  const columnOf = (value, i) => shapeOf(value).length === 2 && shapeOf(value)[1] > i;
  for (const [i, axis] of [..."xyz"].entries()) {
    if (skip(axis)) continue;
    // A curvilinear grid table's cell corners (TODO 51): x and y, as columns of one array.
    if ((kind === "Heatmap" || kind === "Image") && props._gridMesh) {
      if (i < 2) collected.push({ axis, fields: [{ array: props._gridMesh.corners.ref, column: i }] });
      continue;
    }
    if (kind === "Prism") {
      prismBox ??= rectangleDomainArrays(kind, props);
      collected.push({ axis, fields: [{ array: prismBox.lower.ref, column: i }, { array: prismBox.upper.ref, column: i }] });
      continue;
    }
    const fields = props.position !== undefined && columnOf(props.position, i)
      ? [{ array: asArray(props.position), column: i }]
      : (kind === "Area" && props.axis === "x"
          ? (axis === "x" ? [props.lower ?? 0, props.upper] : axis === "y" ? [props.x] : [])
          : [props[axis], props[axis + "0"], props[axis + "1"],
            ...(axis === (props.axis ?? "y") ? [props.lower ?? (kind === "Area" ? 0 : undefined), props.upper, props.baseline] : [])])
        .filter((v) => v !== undefined)
        .map(numbers);
    // A completed current-column Rect write supplies the same normalized vector corners
    // as its GPU geometry. Both endpoints contribute, even when raw channel props remain.
    if (kind === "Rect" && props.position !== undefined && columnOf(props.extent, i))
      fields.push({ array: asArray(props.extent), column: i });
    if (kind === "ErrorBars" && props.position !== undefined && axis === (props.axis ?? "y"))
      for (const bound of [props.lower, props.upper]) if (bound !== undefined) fields.push(numbers(bound));
    for (const end of ["start", "end", "control1", "control2"])
      if (props[end] !== undefined && columnOf(props[end], i)) fields.push({ array: asArray(props[end]), column: i });
    if (kind === "Line" && CURVES_WITH_CONTROLS.includes(props.curve) && shapeOf(props.position)[0] > 1) {
      const segments = lineArrays(props.position, markOptions, true, false, undefined);
      let controls;
      try {
        controls = curveControls(segments, "Line", props.curve, props.curveAlpha ?? 0.5);
        for (const q of Object.values(controls)) if (q.shape[1] > i) fields.push({ array: q.ref, column: i });
      } finally {
        disposeArrays(segments);
        if (controls) disposeArrays(controls);
      }
    }
    if (glyphs?.[axis] && props.size !== undefined && fields.length) {
      // The center's column, then its two edges in its place.
      const center = fields.shift(), values = center?.array ? center.array.slice([], center.column) : center;
      const half = typeof props.size === "number" ? props.size / 2 : asArray(props.size).mul(0.5);
      fields.unshift(values.ref.sub(typeof half === "number" ? half : half.ref), values.add(half));
    }
    if (fields.length) collected.push({ axis, fields });
  }
  if (prismBox) Object.values(prismBox).forEach((a) => a.dispose());
  return collected;
}

/**
 * The domain a mark that draws no finite values reports (an empty Filter, a column of NaN): the
 * old [0, 1], flagged, so that it counts only where no mark draws anything (TODO 67.1: an empty
 * Filter's mark widened its plot to 0).
 */
export const emptyDomain = () => Object.assign([0, 1], { empty: true });

/** The [min, max] over the domains marks report, leaving out empty ones unless all are; null for none. */
export function unionDomains(domains) {
  const drawn = domains.filter((domain) => !domain.empty), used = drawn.length ? drawn : domains;
  if (!used.length) return null;
  const union = [Math.min(...used.map((d) => d[0])), Math.max(...used.map((d) => d[1]))];
  // An end some bar or area rests on (its 0 baseline) stays unpadded (TODO 134.27).
  const anchored = [0, 1].map((i) => used.some((d) => d.anchored?.[i] && d[i] === union[i]));
  if (anchored[0] || anchored[1]) union.anchored = anchored;
  // An end a Heatmap's or Image's bounds place is padded but not rounded to ticks (TODO 136.17).
  const exact = [0, 1].map((i) => used.some((d) => d.exact?.[i] && d[i] === union[i]));
  if (exact[0] || exact[1]) union.exact = exact;
  const screen = used.filter(domain => domain.screen);
  if (screen.length) {
    union.screen = [0, 1].map(i => Math.max(...screen.map(domain => domain.screen[i])));
    if (screen.some(domain => domain.crossScreen)) union.crossScreen = [0, 1].map(i => Math.max(...screen.map(domain => domain.crossScreen?.[i] ?? 0)));
  }
  return union;
}
