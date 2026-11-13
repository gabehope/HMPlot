// A small Mapbox Vector Tile (MVT 2.x) encoder for tests (TODO 24): the unit tests and the
// browser specs build their tiles with it. Geometry is given in tile coordinates (y down):
// points as [[x, y], ...], lines as [[[x, y], ...], ...], polygons as rings [[[x, y], ...], ...]
// with the closing point repeated.

function writer() {
  const bytes = [];
  const out = {
    bytes,
    varint(value) {
      let v = value;
      while (v >= 0x80) {
        bytes.push((v % 0x80) | 0x80);
        v = Math.floor(v / 0x80);
      }
      bytes.push(v);
      return out;
    },
    key(field, type) { return out.varint(field * 8 + type); },
    raw(field, data) { out.key(field, 2).varint(data.length); bytes.push(...data); return out; },
    string(field, text) { return out.raw(field, [...new TextEncoder().encode(text)]); },
    packed(field, values) {
      const inner = writer();
      for (const value of values) inner.varint(value);
      return out.raw(field, inner.bytes);
    },
    double(field, value) {
      const view = new DataView(new ArrayBuffer(8));
      view.setFloat64(0, value, true);
      out.key(field, 1);
      bytes.push(...new Uint8Array(view.buffer));
      return out;
    },
  };
  return out;
}

const zigzag = (value) => (value < 0 ? -2 * value - 1 : 2 * value);
const command = (id, count) => (count << 3) | id;

function geometry(type, shape) {
  const out = [];
  let x = 0, y = 0;
  const moveTo = (points, id) => {
    out.push(command(id, points.length));
    for (const [px, py] of points) {
      out.push(zigzag(px - x), zigzag(py - y));
      x = px;
      y = py;
    }
  };
  if (type === 1) moveTo(shape, 1);
  else if (type === 2) for (const line of shape) { moveTo([line[0]], 1); moveTo(line.slice(1), 2); }
  else if (type === 3)
    for (const ring of shape) {
      moveTo([ring[0]], 1);
      moveTo(ring.slice(1, -1), 2);
      out.push(command(7, 1));
    }
  return out;
}

function value(item) {
  const out = writer();
  if (typeof item === "string") out.string(1, item);
  else if (typeof item === "boolean") out.key(7, 0).varint(item ? 1 : 0);
  else if (Number.isInteger(item) && item >= 0) out.key(5, 0).varint(item);
  else if (Number.isInteger(item)) out.key(6, 0).varint(zigzag(item));
  else out.double(3, item);
  return out.bytes;
}

/**
 * Encode layers: [{ name, extent = 4096, version = 2, features: [{ id?, type: 1 | 2 | 3,
 * properties = {}, geometry }] }] into tile bytes (a Uint8Array).
 */
export function encodeVectorTile(layers) {
  const tile = writer();
  for (const layer of layers) {
    const out = writer(), keys = [], values = [], keyIndex = new Map(), valueIndex = new Map();
    out.key(15, 0).varint(layer.version ?? 2).string(1, layer.name);
    for (const feature of layer.features) {
      const tags = [];
      for (const [key, item] of Object.entries(feature.properties ?? {})) {
        if (!keyIndex.has(key)) { keyIndex.set(key, keys.length); keys.push(key); }
        const id = `${typeof item}:${item}`;
        if (!valueIndex.has(id)) { valueIndex.set(id, values.length); values.push(item); }
        tags.push(keyIndex.get(key), valueIndex.get(id));
      }
      const body = writer();
      if (feature.id !== undefined) body.key(1, 0).varint(feature.id);
      if (tags.length) body.packed(2, tags);
      body.key(3, 0).varint(feature.type);
      body.packed(4, geometry(feature.type, feature.geometry));
      out.raw(2, body.bytes);
    }
    for (const key of keys) out.string(3, key);
    for (const item of values) out.raw(4, value(item));
    out.key(5, 0).varint(layer.extent ?? 4096);
    tile.raw(3, out.bytes);
  }
  return new Uint8Array(tile.bytes);
}
