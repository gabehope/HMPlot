// Grid tables (TODO 51): a table whose rows are every combination of its dimensions'
// coordinates, in C order (the first dimension outermost, the last varying fastest). It is
// logically a long-form table: the coordinates are columns beside the variables, computed when
// read from each dimension's 1-D coordinates (gridColumns.js), so only the variables' values are
// stored. Nodes that know nothing of grids see rows and columns; grid-aware ones (Heatmap,
// Image, Slice) read this model. Pure: the model, its checks and its index arithmetic.
//
// The model (a scope's `grid`):
// - dims: [{ name, size, stride, coords, edges, metadata, rotation }] in C order. `coords` are a
//   dimension's host values: a Float64Array for numbers and times (a datetime's milliseconds
//   from `metadata.origin`, as a datetime column's are), or an array of categories for a
//   categorical dimension (a grouped Density's keys). `edges` are the cells' bounds (size + 1,
//   in the order of the coordinates; midpoints unless given), numeric dimensions only.
//   `rotation` (TODO 51 decision 14): a Calculate that wrapped a longitude (0…359 to 0…179,
//   −180…−1) leaves the coordinates increasing with one wrap; the dimension's sorted order
//   starts at this index. `stride` is the rows between consecutive coordinates.
// - fields: the variables known to be gridded (an Interpolate's values, a Density's density). Any other
//   column of the table with one value per row is gridded too.
// - coords2d: a curvilinear grid's positions, { dims: [a, b] (dimension indices, a < b), columns:
//   { name: values over those two dimensions, C order } }, the device columns a Calculate
//   computed (a rotated pole) or a dataset's 2-D coordinates (lat(y, x), lon(y, x)).

/** Cell bounds from coordinates: the midpoints, and half a step beyond each end. */
export function edgesFrom(coords) {
  const n = coords.length, edges = new Float64Array(n + 1);
  if (n === 1) {
    edges[0] = coords[0] - 0.5;
    edges[1] = coords[0] + 0.5;
    return edges;
  }
  for (let i = 1; i < n; i++) edges[i] = (coords[i - 1] + coords[i]) / 2;
  edges[0] = coords[0] - (coords[1] - coords[0]) / 2;
  edges[n] = coords[n - 1] + (coords[n - 1] - coords[n - 2]) / 2;
  return edges;
}

/** 1 for strictly increasing values, -1 for strictly decreasing, 0 otherwise. */
export function direction(values) {
  if (values.length < 2) return 1;
  const sign = Math.sign(values[1] - values[0]);
  if (!sign) return 0;
  for (let i = 1; i < values.length; i++) if (!(Math.sign(values[i] - values[i - 1]) === sign)) return 0;
  return sign;
}

/**
 * Where an increasing sequence with one wrap starts its sorted order (TODO 51 decision 14): a
 * longitude a Calculate wrapped, 0…179 then −180…−1, is a rotation of the dimension. The index
 * of the wrap (its smallest value), or -1 when the values are not such a sequence.
 */
export function rotationOf(values) {
  const n = values.length;
  let wrap = -1;
  for (let i = 1; i < n; i++) {
    if (values[i] > values[i - 1]) continue;
    if (wrap >= 0 || !(values[i] < values[i - 1])) return -1;
    wrap = i;
  }
  // Sorted from the wrap on, the values must still increase across the end: last < first.
  return wrap > 0 && values[n - 1] < values[0] ? wrap : -1;
}

/** A dimension's coordinates in increasing order: a rotated one read from its wrap. */
export function sortedCoords(dim) {
  const { coords, rotation = 0 } = dim;
  if (!rotation) return coords;
  const out = new Float64Array(coords.length);
  for (let i = 0; i < coords.length; i++) out[i] = coords[(i + rotation) % coords.length];
  return out;
}

const categorical = (metadata) => ["categorical", "ordinal", "boolean"].includes(metadata?.type);

/**
 * A checked, frozen grid model from its parts: `dims` ([{ name, coords, edges?, metadata?,
 * rotation? }]), `fields` and `coords2d`. `rows`, when given, must be the product of the sizes.
 */
export function normalizeGrid({ dims, fields = [], coords2d = null }, rows = undefined) {
  if (!Array.isArray(dims) || !dims.length) throw Error("A grid table needs at least one dimension.");
  const names = new Set();
  let stride = 1;
  const out = new Array(dims.length);
  for (let k = dims.length - 1; k >= 0; k--) {
    const dim = dims[k], name = dim?.name;
    if (typeof name !== "string" || !name) throw Error("Each grid dimension needs a name.");
    if (names.has(name)) throw Error(`Grid dimension ${name} is listed twice.`);
    names.add(name);
    const metadata = dim.metadata ?? null, isCategory = categorical(metadata) ||
      (Array.isArray(dim.coords) && dim.coords.some((value) => typeof value === "string" || typeof value === "boolean"));
    let coords = dim.coords, edges = null, rotation = dim.rotation ?? 0;
    const size = coords?.length;
    if (!Number.isInteger(size) || size < 1) throw Error(`Grid dimension ${name} needs at least one coordinate.`);
    if (isCategory) coords = Object.freeze([...coords]);
    else {
      coords = Float64Array.from(coords, Number);
      if (!coords.every(Number.isFinite)) throw Error(`Grid dimension ${name}'s coordinates must be finite numbers.`);
      if (rotation) {
        if (rotationOf(coords) !== rotation) throw Error(`Grid dimension ${name}'s rotation does not match its coordinates.`);
      } else if (!direction(coords))
        throw Error(`Grid dimension ${name}'s coordinates must be strictly increasing or decreasing.`);
      if (dim.edges != null) {
        edges = Float64Array.from(dim.edges, Number);
        if (edges.length !== size + 1 || !edges.every(Number.isFinite))
          throw Error(`Grid dimension ${name}'s edges need ${size + 1} finite values.`);
        if (!rotation && direction(edges) !== direction(coords) && size > 1)
          throw Error(`Grid dimension ${name}'s edges must run in the order of its coordinates.`);
      } else edges = rotation ? null : edgesFrom(coords);
      if (rotation) {
        // A rotated dimension's cells are bounded in its sorted order.
        const sorted = sortedCoords({ coords, rotation });
        edges = edgesFrom(sorted);
      }
    }
    out[k] = Object.freeze({ name, size, stride, coords, edges, rotation,
      metadata: metadata ?? (isCategory ? { type: "categorical", domain: coords } : { type: "numeric" }) });
    stride *= size;
  }
  if (rows !== undefined && stride !== rows)
    throw Error(`A grid of shape [${out.map((d) => d.size).join(", ")}] has ${stride} rows; the table has ${rows}.`);
  let curvilinear = null;
  if (coords2d) {
    const [a, b] = coords2d.dims ?? [];
    if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a < b && b < out.length))
      throw Error("A curvilinear grid's positions span two of its dimensions.");
    curvilinear = Object.freeze({ dims: Object.freeze([a, b]), columns: Object.freeze({ ...coords2d.columns }),
      ...(coords2d.x ? { x: coords2d.x, y: coords2d.y } : {}) });
  }
  return Object.freeze({ dims: Object.freeze(out), fields: Object.freeze([...new Set(fields)]), coords2d: curvilinear,
    size: stride, shape: Object.freeze(out.map((d) => d.size)) });
}

/** The dimension named `name`, or undefined. */
export const gridDim = (grid, name) => grid?.dims.find((dim) => dim.name === name);
/** Whether `name` is one of the grid's coordinates (a dimension, or a curvilinear position). */
export const isCoordinate = (grid, name) => Boolean(gridDim(grid, name) || (grid?.coords2d && Object.hasOwn(grid.coords2d.columns, name)));

/**
 * A 1-D coordinate as a host descriptor (TODO 51 decision 7): hostColumn gives it instead of an
 * array, so keys code it by index with no per-row copy: code = floor(row / stride) mod size.
 */
export function coordinateDescriptor(grid, name) {
  const dim = gridDim(grid, name);
  if (!dim || (grid.coords2d && Object.hasOwn(grid.coords2d.columns, name))) return undefined;
  // One per dimension, so caches keyed by it keep (a Join's row mapping).
  let described = descriptors.get(dim);
  if (!described) descriptors.set(dim, (described = Object.freeze({ grid: true, name, size: dim.size, stride: dim.stride,
    coords: dim.coords, categories: categorical(dim.metadata) ? dim.coords : undefined })));
  return described;
}
const descriptors = new WeakMap();
export const isGridDescriptor = (value) => value?.grid === true && Number.isInteger(value.stride);

/** A descriptor's value at a row. */
export const descriptorValue = (descriptor, row) => descriptor.coords[Math.floor(row / descriptor.stride) % descriptor.size];

/**
 * A descriptor's key codes at `rows` (every row when omitted) as keyCodes gives them (TODO 51
 * decision 7): `order` lists the values that have rows, in the dimension's order, and `codes[i]`
 * indexes it; a row of -1 (missing) takes `order.length`.
 */
export function descriptorCodes(descriptor, rows = undefined, n = undefined) {
  const { size, stride, coords } = descriptor;
  const count = rows ? rows.length : n;
  // Which of the dimension's coordinates the rows reach.
  const present = new Uint8Array(size);
  if (rows) { for (const row of rows) if (row >= 0) present[Math.floor(row / stride) % size] = 1; }
  else present.fill(1);
  const rank = new Int32Array(size).fill(-1), order = [];
  for (let index = 0; index < size; index++) if (present[index]) { rank[index] = order.length; order.push(coords[index]); }
  const codes = new Int32Array(count);
  let missing = false;
  for (let i = 0; i < count; i++) {
    const row = rows ? rows[i] : i;
    if (row < 0) { codes[i] = order.length; missing = true; }
    else codes[i] = rank[Math.floor(row / stride) % size];
  }
  return { order, codes, missing };
}

/** A numeric dimension's extent: the outermost edges, ascending. */
export function dimExtent(dim) {
  const { edges } = dim;
  return edges[0] <= edges[edges.length - 1] ? [edges[0], edges[edges.length - 1]] : [edges[edges.length - 1], edges[0]];
}

/** Whether a dimension's coordinates and edges are evenly spaced (an Interpolate's, a Density's). */
export function evenlySpaced(dim) {
  if (dim.rotation || !dim.edges) return false;
  const { coords, edges } = dim, n = coords.length;
  if (n < 2) return true;
  const step = (coords[n - 1] - coords[0]) / (n - 1), tolerance = Math.abs(step) * 1e-4;
  if (!(step > 0)) return false;
  for (let i = 0; i < n; i++) if (Math.abs(coords[i] - (coords[0] + i * step)) > tolerance) return false;
  for (let i = 0; i <= n; i++) if (Math.abs(edges[i] - (coords[0] + (i - 0.5) * step)) > tolerance) return false;
  return true;
}

/**
 * The fractional cell index at each of `count` positions evenly across [lo, hi] (a texel's
 * centre, (k + 0.5) / count of the way), for a Heatmap's uneven axis (TODO 51 decision 9): the
 * value at a position blends the two cells whose centres bracket it, and positions in a cell's
 * outer half (before the first centre, after the last) take that cell. A rotated dimension maps
 * through its sorted order back to its rows; across the wrap the nearer cell is taken, so the
 * two ends are not blended. Descending coordinates give decreasing indices.
 */
export function remapTable(dim, lo, hi, count) {
  const n = dim.size, sorted = sortedCoords(dim), descending = !dim.rotation && n > 1 && sorted[1] < sorted[0];
  // Knots ascending in position: the centres, and the index each is.
  const position = new Float64Array(n), index = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const at = descending ? n - 1 - i : i;
    position[i] = sorted[at];
    index[i] = at;
  }
  const source = (sortedIndex) => (dim.rotation ? (sortedIndex + dim.rotation) % n : sortedIndex);
  const table = new Float32Array(count);
  let j = 0;
  for (let k = 0; k < count; k++) {
    const p = lo + ((k + 0.5) / count) * (hi - lo);
    if (n === 1 || p <= position[0]) { table[k] = source(index[0]); continue; }
    if (p >= position[n - 1]) { table[k] = source(index[n - 1]); continue; }
    while (j < n - 2 && position[j + 1] < p) j++;
    while (j > 0 && position[j] > p) j--;
    const t = (p - position[j]) / (position[j + 1] - position[j]);
    const a = source(index[j]), b = source(index[j + 1]);
    // Neighbouring rows blend; the two ends of a rotated dimension do not (the nearer is taken).
    table[k] = Math.abs(b - a) === 1 ? a + t * (b - a) : t < 0.5 ? a : b;
  }
  return table;
}

/** The cell of `dim` holding `value` (by its edges), or -1 outside them. */
export function cellAt(dim, value) {
  if (!dim.edges || !Number.isFinite(value)) return -1;
  const edges = dim.edges, n = dim.size, ascending = edges[n] >= edges[0];
  let lo = 0, hi = n;
  const before = (i) => (ascending ? edges[i] <= value : edges[i] >= value);
  if (!before(0) || (before(n) && value !== edges[n])) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (before(mid)) lo = mid; else hi = mid;
  }
  return dim.rotation ? (lo + dim.rotation) % n : lo;
}

/** The grid without dimension `name` (a Slice through it): the rest keep their coordinates. */
export function dropDimension(grid, name) {
  const at = grid.dims.findIndex((dim) => dim.name === name);
  if (at < 0) throw Error(`${name} is not a dimension of the grid.`);
  if (grid.dims.length === 1) return null;
  const dims = grid.dims.filter((_, k) => k !== at);
  // Positions over two other dimensions keep them (renumbered); over this one they are dropped.
  let coords2d = null;
  if (grid.coords2d && !grid.coords2d.dims.includes(at))
    coords2d = { ...grid.coords2d, dims: grid.coords2d.dims.map((k) => (k > at ? k - 1 : k)) };
  return normalizeGrid({ dims, fields: grid.fields, coords2d });
}

/**
 * The grid with a dimension's coordinates replaced (a Calculate's rewrite of it, TODO 51
 * decision 14): kept when the new coordinates are monotonic, or increasing with one wrap (a
 * rotation, recorded); otherwise null with the reason. Edges follow the new coordinates.
 */
export function replaceCoords(grid, name, coords, metadata = undefined) {
  const at = grid.dims.findIndex((dim) => dim.name === name);
  if (at < 0) throw Error(`${name} is not a dimension of the grid.`);
  const values = Float64Array.from(coords, Number);
  if (!values.every(Number.isFinite)) return { grid: null, reason: `${name} has missing values` };
  let rotation = 0;
  if (!direction(values)) {
    rotation = rotationOf(values);
    if (rotation < 0) return { grid: null, reason: `${name} is no longer monotonic` };
  }
  const dims = grid.dims.map((dim, k) => (k === at
    ? { name, coords: values, rotation, metadata: metadata ?? dim.metadata }
    : dim));
  return { grid: normalizeGrid({ dims, fields: grid.fields, coords2d: grid.coords2d }), reason: null };
}

/** The dimensions a Heatmap draws: `x` and `y` (dimension names, or the last two). */
export function drawnDims(grid, x = undefined, y = undefined) {
  const named = (value) => (typeof value === "string" ? value : undefined);
  const curvilinear = grid.coords2d;
  const find = (name) => grid.dims.findIndex((dim) => dim.name === name);
  if (curvilinear) {
    const [a, b] = curvilinear.dims;
    return { rows: a, columns: b, curvilinear: true,
      x: named(x) ?? curvilinear.x ?? grid.dims[b].name, y: named(y) ?? curvilinear.y ?? grid.dims[a].name };
  }
  let ix = named(x) !== undefined ? find(x) : -1, iy = named(y) !== undefined ? find(y) : -1;
  if (named(x) !== undefined && ix < 0) throw Error(`Heatmap.x: ${x} is not a dimension of the grid (${grid.dims.map((d) => d.name).join(", ")}).`);
  if (named(y) !== undefined && iy < 0) throw Error(`Heatmap.y: ${y} is not a dimension of the grid (${grid.dims.map((d) => d.name).join(", ")}).`);
  // By default the last two dimensions of more than one coordinate (a month selected from a
  // time series keeps a time dimension of one), else the last two.
  const longer = [...grid.dims.keys()].filter((k) => grid.dims[k].size > 1);
  const pool = longer.length >= 2 ? longer : [...grid.dims.keys()], n = pool.length;
  if (ix < 0 && iy < 0) [iy, ix] = n >= 2 ? [pool[n - 2], pool[n - 1]] : [-1, 0];
  else if (ix < 0) ix = [...pool].reverse().find((k) => k !== iy);
  else if (iy < 0) iy = [...pool].reverse().find((k) => k !== ix);
  return { rows: iy, columns: ix, curvilinear: false, x: grid.dims[ix]?.name, y: grid.dims[iy]?.name };
}

/**
 * The x and y extents of the dimensions a Heatmap draws by default (a Plot's bounds from a grid
 * table, TODO 51): numeric dimensions only, none for a curvilinear grid (its positions are on
 * the device).
 */
export function gridAxisBounds(grid) {
  if (!grid || grid.coords2d) return {};
  const drawn = drawnDims(grid), out = {};
  const x = grid.dims[drawn.columns], y = grid.dims[drawn.rows];
  if (x?.edges) out.x = dimExtent(x);
  if (y?.edges) out.y = dimExtent(y);
  return out;
}

/**
 * An evenly spaced dimension over [lo, hi] (an Interpolate's, a Density's): `size` cell centres that tile
 * it, or (`ends`) points from lo to hi whose end cells are half cells.
 */
export function evenDimension(name, [lo, hi], size, { ends = false } = {}) {
  // A degenerate extent (every value equal) is a unit-wide one around it.
  if (!(hi > lo)) [lo, hi] = [lo - 0.5, lo + 0.5];
  const span = hi - lo, coords = new Float64Array(size), edges = new Float64Array(size + 1);
  for (let i = 0; i < size; i++) coords[i] = lo + (ends ? (size > 1 ? i / (size - 1) : 0.5) : (i + 0.5) / size) * span;
  for (let i = 0; i <= size; i++)
    edges[i] = !ends ? lo + (i / size) * span : i === 0 ? lo : i === size ? hi : (coords[i - 1] + coords[i]) / 2;
  return { name, coords, edges };
}

/** A grid's shape as text: "time × lat × lon (12 × 180 × 360)". */
export const describeShape = (grid) =>
  `${grid.dims.map((d) => d.name).join(" × ")} (${grid.dims.map((d) => d.size).join(" × ")})`;
