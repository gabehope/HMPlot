import { DataArrayTexture, HalfFloatType, RedFormat, LinearFilter, ClampToEdgeWrapping, DataUtils } from "three/webgpu";
import { texture } from "three/tsl";
import { shapeNames, shapeOutline, onShapeRegistered } from "./shapes.js";

/**
 * Point shapes as signed distance fields (TODO 55): one layer per shape code in a shared
 * array texture, so a per-point shape channel draws any registered shape with one texture
 * read, whatever its outline. A layer covers [-FIELD_EXTENT, FIELD_EXTENT]² of shape space
 * (a rotated unit square reaches √2) and holds the full signed distance, negative inside, in
 * shape units, so an outline band of any width reads from it.
 *
 * No mipmaps: a distance field is 1-Lipschitz, so a bilinear sample stays within a texel's
 * width of the true distance however far the field is minified, where averaged mip levels
 * would blur its zero line.
 */
export const FIELD_SIZE = 128;
export const FIELD_EXTENT = 1.5;

/**
 * The field of an outline ({ rings, fillRule }, or null for the circle) on a size × size grid
 * of texel centers, rows from the bottom (y = -extent) up. Inside is decided by the fill rule
 * from a scanline's crossings; the distance is the nearest edge's, exact.
 */
export function signedDistanceField(outline, size = FIELD_SIZE, extent = FIELD_EXTENT) {
  const field = new Float32Array(size * size), step = (2 * extent) / size;
  if (!outline) {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      field[r * size + c] = Math.hypot(-extent + (c + 0.5) * step, -extent + (r + 0.5) * step) - 1;
    return field;
  }
  let count = 0;
  for (const ring of outline.rings) count += ring.length;
  const edges = new Float64Array(count * 4);
  let e = 0;
  for (const ring of outline.rings)
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
      edges[e++] = ax; edges[e++] = ay; edges[e++] = bx; edges[e++] = by;
    }
  const evenOdd = outline.fillRule === "evenodd", crossings = [];
  for (let r = 0; r < size; r++) {
    const y = -extent + (r + 0.5) * step;
    // Where the edges cross this row, left to right, and which way (for the winding number).
    crossings.length = 0;
    for (let k = 0; k < edges.length; k += 4) {
      const ay = edges[k + 1], by = edges[k + 3];
      if ((ay <= y) !== (by <= y)) {
        const ax = edges[k], bx = edges[k + 2];
        crossings.push([ax + ((y - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
      }
    }
    crossings.sort((a, b) => a[0] - b[0]);
    let next = 0, winding = 0, parity = 0;
    for (let c = 0; c < size; c++) {
      const x = -extent + (c + 0.5) * step;
      while (next < crossings.length && crossings[next][0] < x) { winding += crossings[next][1]; parity ^= 1; next++; }
      let best = Infinity;
      for (let k = 0; k < edges.length; k += 4) {
        const ax = edges[k], ay = edges[k + 1], dx = edges[k + 2] - ax, dy = edges[k + 3] - ay;
        const length = dx * dx + dy * dy;
        const t = length > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
        const px = ax + t * dx - x, py = ay + t * dy - y, d = px * px + py * py;
        if (d < best) best = d;
      }
      const inside = evenOdd ? parity === 1 : winding !== 0;
      field[r * size + c] = inside ? -Math.sqrt(best) : Math.sqrt(best);
    }
  }
  return field;
}

let state = null, generation = 0;

function allocate(capacity) {
  const layer = FIELD_SIZE * FIELD_SIZE, data = new Uint16Array(layer * capacity);
  const old = state?.texture;
  if (old) data.set(old.image.data.subarray(0, layer * state.filled));
  const next = new DataArrayTexture(data, FIELD_SIZE, FIELD_SIZE, capacity);
  next.type = HalfFloatType;
  next.format = RedFormat;
  next.minFilter = next.magFilter = LinearFilter;
  next.wrapS = next.wrapT = ClampToEdgeWrapping;
  next.generateMipmaps = false;
  next.needsUpdate = true;
  state = { texture: next, capacity, filled: state?.filled ?? 0 };
  generation++;
  // Marks drawing from the old texture rebuild on this registration, synchronously.
  if (old) queueMicrotask(() => old.dispose());
}

/**
 * The shared field texture with a layer for every registered shape (created on first use).
 * It grows in powers of two, at least 16 layers; each growth is a new texture and a new
 * generation (shapeFieldGeneration), and marks sampling it rebuild. A registration within the
 * capacity only uploads the new layers.
 */
export function shapeFieldTexture() {
  const names = shapeNames();
  if (!state || state.capacity < names.length) allocate(Math.max(16, 2 ** Math.ceil(Math.log2(names.length))));
  if (state.filled < names.length) {
    const layer = FIELD_SIZE * FIELD_SIZE, data = state.texture.image.data;
    for (let code = state.filled; code < names.length; code++) {
      const field = signedDistanceField(shapeOutline(names[code]));
      for (let i = 0; i < layer; i++) data[code * layer + i] = DataUtils.toHalfFloat(field[i]);
    }
    state.filled = names.length;
    state.texture.needsUpdate = true;
  }
  return state.texture;
}
/** Changes when the field texture is replaced (a growth): marks sampling it must rebuild. */
export const shapeFieldGeneration = () => generation;

// A registration fills its layers at once when the field is in use.
onShapeRegistered(() => { if (state) shapeFieldTexture(); });

/** The signed distance of shape-space point `q` (a vec2 node) in the field's layer `layer`. */
export function shapeFieldDistance(q, layer) {
  return texture(shapeFieldTexture(), q.add(FIELD_EXTENT).div(2 * FIELD_EXTENT)).depth(layer).r;
}
