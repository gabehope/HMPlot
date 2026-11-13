// @ts-check
/**
 * The capacity registry (TODO 136.9): every limit on how much a component draws or computes, in
 * one place, with its unit, its value (a number, or "device" when it comes from the GPU's limits
 * and is computed where it is checked) and what happens past it:
 *   error     refused with limitError's message, which names the component
 *   clamp     reduced to fit (a coarser grid, zoom or subdivision)
 *   chunk     done in parts
 *   sample    rows sampled
 *   cut       rows past it not drawn, and the plot says so
 *   evict     a cache drops its least recently used entries
 *   fallback  a slower or approximate path
 * docs/LIMITATIONS.md lists them; tests/unit/limits.test.js keeps the two in step, and keeps
 * limit errors written elsewhere from coming back.
 */

/** @typedef {"error" | "clamp" | "chunk" | "sample" | "cut" | "evict" | "fallback"} LimitStrategy */
/**
 * @typedef {{ value: number | "device", unit: string, strategy: LimitStrategy, what: string,
 *   component: string, hint?: string }} Limit
 */

export const STRATEGIES = Object.freeze([
  "error",
  "clamp",
  "chunk",
  "sample",
  "cut",
  "evict",
  "fallback",
]);

// Each entry keeps its own type, so a fixed limit's value reads as a number.
/** @satisfies {Readonly<Record<string, Limit>>} */
export const LIMITS = Object.freeze({
  // Data size on the GPU: the device's buffer and texture limits.
  storage: {
    value: "device",
    unit: "bytes",
    strategy: "error",
    component: "Plot",
    what: "its data on the GPU",
    hint: "Draw fewer rows, or coarser data.",
  },
  texture: {
    value: "device",
    unit: "pixels",
    strategy: "error",
    component: "Plot",
    what: "a texture side",
    hint: "Use smaller images or a smaller export scale.",
  },
  vertexBuffers: {
    value: "device",
    unit: "vertex buffers",
    strategy: "error",
    component: "Plot",
    what: "its per-row channels",
    hint: "Give fewer channels per-row values.",
  },
  varyings: {
    value: "device",
    unit: "varyings",
    strategy: "error",
    component: "Plot",
    what: "its shader",
    hint: "Turn off outlines, lighting or per-row styles on this mark.",
  },
  marks: {
    value: "device",
    unit: "rows",
    strategy: "cut",
    component: "Plot",
    what: "rows of one mark (maxElements grows to the device's ceiling)",
  },
  sampledRows: {
    value: 1000,
    unit: "rows",
    strategy: "sample",
    component: "Line",
    what: "rows drawn with maxInstances (the minimap's default)",
  },
  animation: {
    value: "device",
    unit: "values",
    strategy: "error",
    component: "Plot",
    what: "animating values",
    hint: "Animate fewer rows or channels.",
  },
  // Paths and geometry.
  curvedPaths: {
    value: 1024,
    unit: "paths",
    strategy: "chunk",
    component: "Line",
    what: "curved or spherical paths refined in one batch",
  },
  curvedSubdivisions: {
    value: 65536,
    unit: "subdivisions",
    strategy: "clamp",
    component: "Line",
    what: "subdivisions over a batch of curved paths (256 per path)",
  },
  curvedPieces: {
    value: 4194304,
    unit: "pieces",
    strategy: "error",
    component: "Line",
    what: "the refined pieces of one curved mark",
    hint: "Draw fewer paths, zoom out, or raise the subdivision tolerance.",
  },
  curvedDetail: {
    value: "device",
    unit: "subdivisions",
    strategy: "error",
    component: "Line",
    what: "the detail of curved segments",
    hint: "Zoom out, or raise the subdivision tolerance.",
  },
  wrapCopies: {
    value: 16,
    unit: "copies",
    strategy: "error",
    component: "Plot",
    what: "a wrapped map view",
    hint: "Zoom in so fewer copies of the world show.",
  },
  shapes: {
    value: 233,
    unit: "shapes",
    strategy: "error",
    component: "Points",
    what: "custom shapes on one page",
    hint: "Reuse shapes, or draw some marks as Polygons.",
  },
  shapeSegments: {
    value: 4096,
    unit: "segments",
    strategy: "error",
    component: "Points",
    what: "a shape's outline",
    hint: "Simplify the path.",
  },
  exactShapeVertices: {
    value: 16,
    unit: "vertices",
    strategy: "fallback",
    component: "Points",
    what: "a polygon shape drawn exactly (past it, from a distance field)",
  },
  colormaps: {
    value: 224,
    unit: "colormaps",
    strategy: "error",
    component: "Plot",
    what: "custom colormaps on screen together",
    hint: "Reuse colormaps across marks.",
  },
  coordinateStages: {
    value: 16,
    unit: "stages",
    strategy: "error",
    component: "Frame",
    what: "a coordinate mapping",
    hint: "Nest fewer Frames.",
  },
  // Transforms and expressions.
  expressionDepth: {
    value: 64,
    unit: "levels",
    strategy: "error",
    component: "Calculate",
    what: "an expression's nesting",
    hint: "Split it into Calculate columns.",
  },
  expressionOperations: {
    value: 256,
    unit: "operations",
    strategy: "error",
    component: "Calculate",
    what: "an expression",
    hint: "Split it into Calculate columns.",
  },
  stackPairs: {
    value: 16777216,
    unit: "pairs",
    strategy: "error",
    component: "Stack",
    what: "totaling every (x, series) pair",
    hint: "Stack fewer x values or series.",
  },
  stackInsideOut: {
    value: 1024,
    unit: "series",
    strategy: "error",
    component: "Stack",
    what: 'order "insideOut" (it places series one at a time)',
    hint: 'Use order "asc" or "desc", or fewer series.',
  },
  dodgeUnits: {
    value: 16777216,
    unit: "units",
    strategy: "error",
    component: "Dodge",
    what: "a grid Dodge's expansion",
    hint: "Reduce the counts.",
  },
  partitionGroups: {
    value: 256,
    unit: "groups",
    strategy: "error",
    component: "Partition",
    what: "partitioning",
    hint: "Raise Partition limit= if that is intended.",
  },
  timeBins: {
    value: 100000,
    unit: "bins",
    strategy: "error",
    component: "Bin",
    what: "binning time",
    hint: "Use a longer interval.",
  },
  densityBins: {
    value: 16777216,
    unit: "bins",
    strategy: "clamp",
    component: "Density",
    what: "a Density's grid (it shrinks to fit)",
  },
  densityQueue: {
    value: 67108864,
    unit: "bytes",
    strategy: "chunk",
    component: "Density",
    what: "one kernel queue of a Density",
  },
  reduceRows: {
    value: 65536,
    unit: "rows",
    strategy: "chunk",
    component: "Calculate",
    what: "rows reduced in one pass (more go in 256 blocks)",
  },
  filterRows: {
    value: 65536,
    unit: "rows",
    strategy: "fallback",
    component: "Filter",
    what: "rows a Filter keeps in place (more compact into buckets)",
  },
  // Tiles.
  vectorTiles: {
    value: 16,
    unit: "tiles",
    strategy: "error",
    component: "VectorTile",
    what: "a fixed VectorTile",
    hint: "Use a lower zoom or a smaller box.",
  },
  liveTiles: {
    value: 48,
    unit: "tiles",
    strategy: "clamp",
    component: "VectorTile",
    what: "a live VectorTile (it loads a coarser zoom)",
  },
  tileCache: {
    value: 256,
    unit: "tiles",
    strategy: "evict",
    component: "VectorTile",
    what: "fetched tiles kept (and 64 MiB)",
  },
  // Axes.
  axisTicks: {
    value: 4096,
    unit: "ticks",
    strategy: "error",
    component: "Plot",
    what: "an axis",
    hint: "Set a larger tick spacing.",
  },
  axisBreaks: {
    value: 50000,
    unit: "intervals",
    strategy: "error",
    component: "Plot",
    what: "axis breaks",
    hint: "Use fewer rules.",
  },
  // Exports and templates.
  exportPixels: {
    value: 67108864,
    unit: "pixels",
    strategy: "error",
    component: "Scene",
    what: "an export",
    hint: "Reduce the export scale.",
  },
  vectorPrimitives: {
    value: 100000,
    unit: "primitives",
    strategy: "error",
    component: "Plot",
    what: "a vector export",
    hint: 'Raise primitiveBudget, or export with mode="auto", which draws the rest as an image.',
  },
  templateBytes: {
    value: 1048576,
    unit: "bytes",
    strategy: "error",
    component: "PortableTemplate",
    what: "a template's JSON",
    hint: "Keep data out of templates; pass it in.",
  },
  templateNodes: {
    value: 256,
    unit: "nodes",
    strategy: "error",
    component: "PortableTemplate",
    what: "a template's tree",
    hint: "Split it into smaller templates.",
  },
  templateDepth: {
    value: 32,
    unit: "levels",
    strategy: "error",
    component: "PortableTemplate",
    what: "a template's nesting",
    hint: "Split it into smaller templates.",
  },
  // A table read back to the host (TODO 145.1, utils/readback.js): the values code asks for.
  readback: {
    value: 16777216,
    unit: "bytes",
    strategy: "error",
    component: "read()",
    what: "a table read back to the host",
    hint: "Read fewer columns (read({ columns: [...] })), or fewer rows (read a Group, Filter or Sample of them).",
  },
});

const MIB = 1048576;
/** @param {number} n @param {string} unit */
const amount = (n, unit) =>
  unit === "bytes" && n >= MIB
    ? `${(n / MIB).toLocaleString("en-US", { maximumFractionDigits: 1 })} MiB`
    : `${n.toLocaleString("en-US")} ${unit}`;

/**
 * The one error for a limit with the "error" strategy: "<Component>: <what> needs <count>
 * <unit>; the limit is <limit>[ on this device]. <hint>" (with no count: "needs more than
 * <limit>"). Its code is `limit.<name>`; its diagnostic names the component and property.
 * @param {keyof typeof LIMITS} name
 * @param {{ component?: string, what?: string, count?: number, limit?: number,
 *   hint?: string, property?: string }} [details] The site's own words: the component the
 *   viewer wrote, what of it is too big, how big, and the limit when it is the device's or the
 *   viewer's (Partition limit=).
 */
export function limitError(name, details = {}) {
  const entry = LIMITS[name];
  if (!entry || entry.strategy !== "error")
    throw Error(
      `limitError: ${String(name)} is not a limit that refuses (limits.js).`,
    );
  const limit =
    details.limit ?? (entry.value === "device" ? undefined : entry.value);
  const component = details.component ?? entry.component,
    what = details.what ?? entry.what,
    hint = details.hint ?? entry.hint;
  const device = entry.value === "device" ? " on this device" : "";
  const size =
    limit === undefined
      ? `is past this device's limit`
      : details.count === undefined
        ? `needs more than ${amount(limit, entry.unit)}${device}`
        : `needs ${amount(details.count, entry.unit)}; the limit is ${amount(limit, entry.unit)}${device}`;
  const error = /** @type {Error & { code: string, diagnostic: object }} */ (
    Error(`${component}: ${what} ${size}.${hint ? ` ${hint}` : ""}`)
  );
  error.code = `limit.${name}`;
  error.diagnostic = {
    code: error.code,
    component,
    // The registry's component stands in for the site's: the reporter names its own (attributed).
    defaulted: details.component === undefined,
    property: details.property,
    details: { count: details.count, limit, unit: entry.unit },
  };
  return error;
}

/**
 * `error`'s message as `kind`'s, the component reporting it (a mark or a transform): a limit error
 * whose component is the registry's stand-in takes `kind` instead ("Points: a reduction by g
 * needs ..."), and any other message is prefixed with it.
 * @param {Error & { diagnostic?: { component?: string, defaulted?: boolean } }} error
 * @param {string} kind
 */
export function attributed(error, kind) {
  const diagnostic = error.diagnostic;
  if (
    diagnostic?.defaulted &&
    diagnostic.component &&
    error.message.startsWith(`${diagnostic.component}: `)
  ) {
    diagnostic.component = kind;
    diagnostic.defaulted = false;
    return `${kind}: ${error.message.slice(error.message.indexOf(": ") + 2)}`;
  }
  return error.message.startsWith(`${kind}: `)
    ? error.message
    : `${kind}: ${error.message}`;
}
