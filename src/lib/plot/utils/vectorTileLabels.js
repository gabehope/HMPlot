// Place names for VectorTile (TODO 35): which names show at a zoom, how large, and which win where
// they would overlap. After VersaTiles' own style for its Shortbread tiles
// (tiles.versatiles.org/assets/styles/colorful), as MapLibre places it under deck.gl's and
// CARTO's basemaps: each kind shows in a zoom range, the kinds are placed in priority order
// (countries, capitals, cities, ... neighbourhoods; within a kind the most populous first), and a
// name that would overlap one already placed is left out.

const stops = (...pairs) => pairs;
/**
 * The kinds, most important first: the zoom range [from, until) each shows in, its text size in
 * CSS pixels at zooms (interpolated between, held outside) for a style size of 13, and whether it
 * is drawn muted (state names, between the places color and the map's).
 */
export const PLACE_KINDS = [
  { kind: "country", from: 2, until: 9, size: stops([2, 8], [5, 13]) }, // large (way_area >= 9e7)
  { kind: "country", from: 2, until: 10, size: stops([3, 8], [5, 12]) },
  { kind: "country", from: 4, until: 10, size: stops([4, 8], [5, 11]) }, // small (way_area <= 1e7)
  { kind: "capital", from: 4, until: 12, size: stops([5, 12], [10, 16]) },
  { kind: "state_capital", from: 4, until: 14, size: stops([6, 11], [10, 15]) },
  { kind: "city", from: 6, until: 14, size: stops([7, 11], [10, 14]) },
  { kind: "state", from: 3, until: 10, size: stops([5, 8], [8, 12]), muted: true },
  { kind: "town", from: 7, until: 15, size: stops([8, 11], [12, 14]) },
  { kind: "village", from: 10, until: 16, size: stops([9, 11], [12, 14]) },
  { kind: "hamlet", from: 13, until: 18, size: stops([10, 11], [12, 14]) },
  { kind: "suburb", from: 10, until: 15, size: stops([11, 11], [13, 14]) },
  { kind: "quarter", from: 13, until: 16, size: stops([13, 13]) },
  { kind: "neighbourhood", from: 14, until: 18, size: stops([14, 12]) },
];
const INDEX = new Map([
  ["capital", 3], ["state_capital", 4], ["city", 5], ["state", 6], ["region", 6], ["province", 6],
  ["town", 7], ["village", 8], ["hamlet", 9], ["suburb", 10], ["macrohood", 10], ["borough", 10],
  ["quarter", 11], ["neighbourhood", 12], ["neighborhood", 12],
]);
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/**
 * A named point's kind (an index into PLACE_KINDS, or -1: never shown) and its weight within the
 * kind (population, else area). Reads Shortbread (place_labels' kind; boundary_labels'
 * admin_level and way_area), OpenMapTiles and Mapbox (class, capital) and Protomaps (kind,
 * kind_detail).
 */
export function placeKind(properties = {}) {
  const p = properties;
  const weight = number(p.population) || number(p.way_area);
  if (p.layerName === "boundary_labels" || p.kind === "country" || p.class === "country") {
    const level = Number(p.admin_level ?? (p.kind === "country" || p.class === "country" ? 2 : NaN));
    if (level === 4) return { kind: 6, weight };
    if (level !== 2) return { kind: -1, weight };
    const area = number(p.way_area);
    return { kind: !area ? 1 : area >= 9e7 ? 0 : area <= 1e7 ? 2 : 1, weight };
  }
  const name = String(p.kind_detail ?? p.kind ?? p.class ?? p.type ?? "");
  let kind = INDEX.get(name) ?? -1;
  // OpenMapTiles and Mapbox mark capitals on their cities and towns: 2 a country's, 4 a state's.
  if ((kind === 5 || kind === 7) && Number(p.capital) === 2) kind = 3;
  else if ((kind === 5 || kind === 7) && Number(p.capital) === 4) kind = 4;
  return { kind, weight };
}

function sizeAt(size, zoom) {
  if (zoom <= size[0][0]) return size[0][1];
  for (let i = 1; i < size.length; i++)
    if (zoom <= size[i][0]) return size[i - 1][1] + ((size[i][1] - size[i - 1][1]) * (zoom - size[i - 1][0])) / (size[i][0] - size[i - 1][0]);
  return size.at(-1)[1];
}
/** The text sizes names are drawn at, for a style size of 13: each name takes the nearest. */
export const SIZE_CLASSES = [9, 11, 13, 15];
const WORLD = 512, CELL = 128;

/**
 * The names to draw at a (fractional) `zoom`, in groups by text size and tone: [{ key, size,
 * muted, position, text }].
 * `candidates`: { position (the plot's units), coordinates ([longitude, latitude]), text, kind,
 * weight } with kind from placeKind. `size` is the style's size (13 by default); sizes scale with
 * it. Overlap is judged in Web Mercator pixels at `zoom` (screen pixels on a Mercator map, and
 * near enough elsewhere), with the text's width estimated from its length.
 */
export function placeLabels(candidates, zoom, { size = 13 } = {}) {
  const scale = WORLD * 2 ** zoom, factor = size / 13;
  const shown = candidates
    .filter((c) => c.kind >= 0 && zoom >= PLACE_KINDS[c.kind].from && zoom < PLACE_KINDS[c.kind].until)
    .sort((a, b) => a.kind - b.kind || b.weight - a.weight);
  // Placed boxes by grid cell (TODO 63.8): a name is checked against the names near it, not every
  // name placed (2,000 candidates took 12 ms against all of them).
  const cells = new Map(), groups = new Map(), names = new Set();
  const each = (x, y, w, h, visit) => {
    for (let i = Math.floor((x - w) / CELL); i <= Math.floor((x + w) / CELL); i++)
      for (let j = Math.floor((y - h) / CELL); j <= Math.floor((y + h) / CELL); j++) if (visit(`${i} ${j}`)) return true;
    return false;
  };
  for (const c of shown) {
    if (names.has(c.text)) continue;
    const px = sizeAt(PLACE_KINDS[c.kind].size, zoom);
    const snapped = SIZE_CLASSES.reduce((best, value) => (Math.abs(value - px) < Math.abs(best - px) ? value : best));
    const drawn = snapped * factor;
    const [lon, lat] = c.coordinates, phi = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    const x = ((lon + 180) / 360) * scale, y = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * scale;
    // Half the box: 0.55 em per character and 1.2 em of line, with 2 pixels of room.
    const w = (0.55 * drawn * [...c.text].length) / 2 + 2, h = 0.6 * drawn + 2;
    if (each(x, y, w, h, (cell) => cells.get(cell)?.some((b) => Math.abs(b[0] - x) < b[2] + w && Math.abs(b[1] - y) < b[3] + h))) continue;
    const box = [x, y, w, h];
    each(x, y, w, h, (cell) => void (cells.get(cell) ?? cells.set(cell, []).get(cell)).push(box));
    names.add(c.text);
    const muted = !!PLACE_KINDS[c.kind].muted, key = `${drawn}${muted ? " muted" : ""}`;
    const group = groups.get(key) ?? groups.set(key, { key, size: drawn, muted, position: [], text: [] }).get(key);
    group.position.push(c.position);
    group.text.push(c.text);
  }
  return [...groups.values()].sort((a, b) => a.size - b.size);
}
