import { isViewStateSubtree } from "./viewState.js";

/**
 * What each mark kind can do (TODO 32.7): one table instead of kind lists in namedMark,
 * namedData, keyedLifecycle, connections, connectionPrepare, scaleBindings and frameMarks,
 * which disagreed (Arrows had keyed staging but not per-row drawing). It is keyed by
 * kind (namedMark's `kind`), not declared on the object classes: a kind is known before its
 * object exists, and one kind can draw with two classes (a polar Rect is a PolarRect). Every
 * kind declares every capability (tests/unit/mark-kinds.test.js).
 *
 * - rows: each row is its own instance (false: a raster is one grid).
 * - hiddenRows: how it draws a Filter's hidden rows (paddedMode in namedMark): "scattered"
 *   (every row, the hidden ones at row opacity 0), "masked" (hidden rows missing, as NaN
 *   bounds), "prefix" (a straight Line: the visible rows first, drawn up to the count), or
 *   null (it reads the visible rows compacted).
 * - keyed: keyed updates stage its instances (enter and exit, keyedLifecycle.js).
 * - endpoint: it can be a connection endpoint; connections: it takes a `connections` prop;
 *   curves: it draws a `curve` between its points.
 * - points: a point mark: nearby and graphical brushes pick it, and its rows take their
 *   feedback opacity as a component prop.
 * - series: it draws series, paths of rows (`series` splits them; without it the mark is one):
 *   hover, select and a graphical brush take whole series (TODO 62).
 * - seriesChannel: the channel whose category column splits its series when `series` is not
 *   given (a Line's color, an Area's fill), as ggplot, Vega-Lite and Plot group (TODO 136.17).
 * - dodge: Dodge can offset it (one flat point mark).
 * - endpointOffsets: its endpoints carry pixel offsets (Dodge) to connections.
 * - geometricWidth: `width` is a length in data units, not a scaled channel.
 * - segmentRows: its rows are the vertices of segments (a row's opacity maps to its segment).
 * - xyzPosition: its x, y and z channels combine into one position (false: they are its own
 *   fields, bounds or grid axes).
 * - rowColors: it takes per-row categorical or RGB colors.
 * - symbols: flat point symbols, with shape and outline channels.
 * - drag: `drag` moves its rows (TODO 38.3): a pick names a row, and x, y and z are its
 *   position channels.
 * - gridTable: it draws a field of a grid table over two of its dimensions (TODO 51,
 *   gridMarks.js); a Filter over the grid draws every cell, the hidden ones transparent.
 * - baseline: it can be drawn from a baseline (bars, histograms, areas): baselineAxes says on
 *   which axes an end of its extent at 0 is that baseline (TODO 134.27).
 * - regions: it draws regions, not rows: a tolerant pick takes it only under the pointer
 *   (MarkBinding.pickArea).
 * - frameEdges: a component of its composed start or end that is a bare @view_x_min (and so on)
 *   is the frame edge, read in the shader from the camera of each draw (utils/frameEdges.js).
 * - caps: it draws bar caps at its ends (`cap`, `capSize`), so a Mapping's or theme's capSize
 *   reaches it (ErrorBars' theme, TODO 130.3).
 * - strokeWidth: `width` is a per-row stroke through the width scale, consumed by a render
 *   field: a literal width is pixels (world units for Arrows3D), and so is an expression of
 *   literals (`_widthPixels`, TODO 62.4).
 * - frame: what Frames it can draw in (frameMarks.js): "nested" (any chain, nested coordinate
 *   overrides included), "intervals" and "patches" (refined through any chain), "flat" (any
 *   nonlinear or anchored chain, not a nested coordinate override; a flat Prism counts as a
 *   patch), "warped" (a texture whose grid vertices map through the chain), or null (a
 *   Cartesian range frame with linear parents only).
 *
 * How an update reaches a published preparation (utils/markUpdatePlan.js, TODO 118.2):
 * - liveChannels: the channels a current-column write replaces in the prepared fields, without
 *   preparing again (empty: every changed channel prepares).
 * - liveWriter: the geometry writer family that writes them (proceduralChannels.js):
 *   "position" (x, y and z restack one position field), "corners" (a rectangle's x0..z1 rebuild
 *   its position and extent together), "labels" (a label's position, size and offsets, and its
 *   row opacity: it writes only channels whose dependencies are known to have changed, keeps a
 *   scattered mask it does not rewrite, and leaves a laid-out or feedback-composed label to
 *   preparation), or null.
 * - retains: what its published request keeps beyond the live dependencies: "static" (the
 *   dependency key of every channel, so an update that changes nothing it reads keeps the
 *   preparation, its atlas and fields: static reuse, opt-in per family because each needs
 *   complete invalidation checks), or null.
 * - feedbackChannels: the channels an interaction's membership change rewrites in place
 *   (Points' hovered size) instead of planning the update again.
 * - labels: its text channel is labels (TODO 143.6, numericText.js): numbers in it are written
 *   as tooltips write them (or in its `format`), a datetime column as dates, and a value
 *   computed on the GPU is read back before the preparation publishes.
 */
const POSITION_CHANNELS = Object.freeze(["position", "x", "y", "z"]);
const positionWriter = { liveWriter: "position", liveChannels: POSITION_CHANNELS };
const mark = (capabilities) =>
  Object.freeze({
    rows: true,
    hiddenRows: null,
    keyed: false,
    endpoint: false,
    connections: false,
    curves: false,
    points: false,
    series: false,
    seriesChannel: null,
    dodge: false,
    endpointOffsets: false,
    geometricWidth: false,
    segmentRows: false,
    xyzPosition: true,
    rowColors: true,
    symbols: false,
    outlines: false,
    frame: null,
    drag: false,
    gridTable: false,
    regions: false,
    baseline: false,
    strokeWidth: false,
    caps: false,
    frameEdges: false,
    liveChannels: Object.freeze([]),
    liveWriter: null,
    retains: null,
    feedbackChannels: Object.freeze([]),
    labels: false,
    ...capabilities,
  });
const point = {
  hiddenRows: "scattered",
  keyed: true,
  endpoint: true,
  points: true,
  endpointOffsets: true,
  drag: true,
};

// Table order is the order of the derived lists (ENDPOINT_KINDS and CONNECTION_KINDS reach the
// Python registry).
export const MARK_CAPABILITIES = Object.freeze({
  Anchor: mark({ keyed: true, endpoint: true, frame: "nested" }),
  Points: mark({
    ...point,
    ...positionWriter,
    dodge: true,
    symbols: true,
    outlines: true,
    frame: "nested",
    feedbackChannels: Object.freeze(["size"]),
  }),
  Points3D: mark({ ...point, ...positionWriter, frame: "flat" }),
  Text: mark({
    ...point,
    endpointOffsets: false,
    frame: "nested",
    liveWriter: "labels",
    liveChannels: Object.freeze([...POSITION_CHANNELS, "size", "dx", "dy", "opacity"]),
    retains: "static",
    labels: true,
  }),
  Text3D: mark({ rowColors: false, frame: "nested" }),
  Rect: mark({
    outlines: true,
    baseline: true,
    hiddenRows: "scattered",
    keyed: true,
    endpoint: true,
    geometricWidth: true,
    frame: "patches",
    xyzPosition: false,
    liveWriter: "corners",
    liveChannels: Object.freeze(["x0", "x1", "y0", "y1", "z0", "z1"]),
  }),
  Prism: mark({
    baseline: true,
    hiddenRows: "scattered",
    keyed: true,
    endpoint: true,
    geometricWidth: true,
    frame: "flat",
    xyzPosition: false,
  }),
  Line: mark({
    hiddenRows: "prefix",
    connections: true,
    curves: true,
    series: true,
    seriesChannel: "color",
    segmentRows: true,
    strokeWidth: true,
    frame: "nested",
  }),
  Segments: mark({
    hiddenRows: "scattered",
    keyed: true,
    endpoint: true,
    connections: true,
    curves: true,
    strokeWidth: true,
    caps: true,
    frameEdges: true,
    frame: "nested",
  }),
  Arrows3D: mark({
    hiddenRows: "scattered",
    keyed: true,
    endpoint: true,
    connections: true,
    curves: true,
    strokeWidth: true,
    frame: "nested",
  }),
  Area: mark({ outlines: true, baseline: true, hiddenRows: "masked", series: true, seriesChannel: "fill", segmentRows: true, xyzPosition: false, regions: true, frame: "intervals" }),
  ErrorBars: mark({ hiddenRows: "masked", keyed: true, frame: "intervals" }),
  Flow: mark({ outlines: true }),
  GeoJSON: mark({ outlines: true }),
  // Polygon's triangles (TODO 47.4): a Filter's hidden rows at row opacity 0; the corners are
  // start, end and control1, so x, y and z are not its channels. Cartesian frames only for now
  // (its edges are straight between mapped corners).
  Polygon: mark({ outlines: true, hiddenRows: "scattered", xyzPosition: false }),
  Heatmap: mark({ rows: false, xyzPosition: false, rowColors: false, gridTable: true, regions: true, frame: "warped" }),
  Image: mark({ rows: false, xyzPosition: false, rowColors: false, gridTable: true, regions: true, frame: "warped" }),
  Surface: mark({ rows: false, xyzPosition: false, rowColors: false, regions: true }),
});

/**
 * The axes on which a mark's extent ending at 0 rests on a baseline, which the axis is not
 * padded past (TODO 134.27): a Rect's edges (histograms, waterfalls, bars drawn as rectangles),
 * an Area's value axis, and a Prism's extents only when they are a Bar's (`__barSizeX`/`Y`: a
 * hexbin's or a tile's Prism is padded as before). Across the bars the extent is the band's
 * share around a position, which ends at 0 only for a position half a share from 0.
 * @param {string} kind @param {Record<string, unknown>} props @returns {string[]}
 */
export function baselineAxes(kind, props) {
  if (!capability(kind, "baseline")) return [];
  if (kind === "Area") return [String(props.axis ?? "y")];
  if (kind === "Prism") return [props.width === "__barSizeX" && "x", props.depth === "__barSizeY" && "y"].filter((a) => typeof a === "string");
  return ["x", "y"];
}

/** The kind's value of `capability` (a kind not in the table has none). */
export const capability = (kind, name) => MARK_CAPABILITIES[kind]?.[name];

/** Channels consumed directly by render fields; other channels may construct geometry. */
export function scalarAppearance(kind, channel) {
  if (["outlineWidth", "outlineOpacity", "outlineColor"].includes(channel)) return capability(kind, "outlines") === true;
  if (channel === "opacity") return capability(kind, "rows") === true;
  if (channel === "size") return ["Points", "Points3D", "Text"].includes(kind);
  if (channel === "width") return capability(kind, "strokeWidth") === true;
  if (channel === "fill" || channel === "color")
    return ["Points", "Points3D", "Text", "Line", "Segments", "Arrows3D", "Polygon"].includes(kind);
  return false;
}

/**
 * How a mark draws a padded view (a Filter's rows, utils/dataView.js; TODO 17.3b), or null for
 * the compacted rows: its kind's `hiddenRows` form, unless something needs the rows packed or
 * keyed. "scattered": every physical row, the hidden ones at row opacity 0 (picking discards
 * them too). "masked": hidden rows missing (NaN bounds), so a band breaks there as at a missing
 * row (TODO 17.14c). "prefix": a straight Line's valid-first rows, drawn up to the count. The
 * lengths stay fixed as the kept rows change, so nothing recompiles. Compacted: series, Dodge,
 * row-dependent or tweened channel animation, enter or exit, a matched connection endpoint
 * (it needs key tokens for its rows, Stage 15), physical rows past the allocated capacity, and
 * a curved or surface Line. A mark animated by the `animation` switch alone keeps the scattered
 * or masked form when its physical rows are its table's (`rowIdentity`: a Filter over the
 * table), whose rows keep their identity as the kept rows change (TODO 32.12); a straight
 * Line's valid-first rows reorder with the mask, so it reads them compacted. Out of
 * namedMark.svelte (TODO 32.6).
 */
export function hiddenRowsForm(kind, props, { physical, placement = false, animation, animates = false, rowIdentity = false, endpoint = false, limit = Infinity }) {
  if (!physical || props.series !== undefined || placement) return null;
  if (["channels", "tweened"].some((key) => Object.keys(animation?.[key] ?? {}).length) ||
      ["procedural", "stepped"].some((key) => Object.entries(animation?.[key] ?? {}).some(([channel, expression]) =>
        !scalarAppearance(kind, channel) || !isViewStateSubtree(expression) || props[channel + "Scale"]?.isCategorical)) ||
      props.enterEffect !== undefined || props.exitEffect !== undefined) return null;
  if (endpoint || physical.capacity > limit) return null;
  const form = capability(kind, "hiddenRows") ?? null;
  if (animates && (!rowIdentity || form === "prefix")) return null;
  if (form !== "prefix") return form;
  return (props.curve ?? "linear") === "linear" && !props.surface && props.progress === undefined ? "prefix" : null;
}

/** The kinds whose `capability` is `value` (truthy when omitted), in table order. */
export function kindsWith(name, value) {
  return Object.keys(MARK_CAPABILITIES).filter((kind) =>
    value === undefined
      ? Boolean(MARK_CAPABILITIES[kind][name])
      : MARK_CAPABILITIES[kind][name] === value,
  );
}
