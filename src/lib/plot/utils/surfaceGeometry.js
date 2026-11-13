import { BufferGeometry, BufferAttribute, Vector3 } from 'three/webgpu';
import { framePoint, framePointOperations } from './framePlacement.js';
import { limitError } from './limits.js';
import { angularPeriod } from './coordinates.js';

export function surfaceDetail(value) {
  if (!Number.isFinite(value)) throw Error('Surface detail must be finite.');
  return Math.min(2048, Math.max(3, Math.floor(value)));
}
export function surfaceAllocation(detail, limits = {}, shape = "square") {
  const cells = surfaceDetail(detail), columns = shape === "circle" ? cells * 3 : cells, vertices = (cells + 1) * (columns + 1);
  const indexBytes = vertices > 65535 ? 4 : 2;
  const buffers = [vertices * 12, vertices * 12, vertices * 8, cells * columns * 6 * indexBytes];
  const bytes = buffers.reduce((a, b) => a + b, 0);
  if (Math.max(...buffers) > (limits.maxBufferSize ?? Infinity))
    throw limitError("storage", { component: "Heatmap", what: `its mesh at detail ${cells}`, count: Math.max(...buffers), limit: limits.maxBufferSize,
      hint: "Lower detail.", property: "detail" });
  return { cells, columns, vertices, indexBytes, bytes };
}

// Allocate typed storage directly; Three's PlaneGeometry builds large temporary JS arrays.
export function createSurfaceGeometry(detail, limits, shape = "square") {
  const { cells, columns, vertices, indexBytes } = surfaceAllocation(detail, limits, shape);
  const position = new Float32Array(vertices * 3), normal = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const indices = new (indexBytes === 4 ? Uint32Array : Uint16Array)(cells * columns * 6);
  for (let y = 0; y <= cells; y++) for (let x = 0; x <= columns; x++) {
    const i = y * (columns + 1) + x;
    const px = shape === "circle" ? y / cells * Math.cos(x / columns * Math.PI * 2) : x * (2 / columns) - 1;
    const py = shape === "circle" ? y / cells * Math.sin(x / columns * Math.PI * 2) : -(y * (2 / cells) - 1);
    position[i * 3] = px; position[i * 3 + 1] = py;
    normal[i * 3 + 2] = 1;
    uv[i * 2] = shape === "circle" ? (px + 1) / 2 : x / columns;
    uv[i * 2 + 1] = shape === "circle" ? (py + 1) / 2 : 1 - y / cells;
  }
  let index = 0;
  for (let y = 0; y < cells; y++) for (let x = 0; x < columns; x++) {
    const a = x + (columns + 1) * y, b = a + columns + 1, c = b + 1, d = a + 1;
    indices[index++] = a; indices[index++] = b; indices[index++] = d;
    indices[index++] = b; indices[index++] = c; indices[index++] = d;
  }
  const geometry = new BufferGeometry();
  geometry.type = shape === "circle" ? "RingGeometry" : "PlaneGeometry";
  geometry.parameters = { width: 2, height: 2, widthSegments: columns, heightSegments: cells };
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/**
 * A grid table's own cells (a curvilinear Heatmap, TODO 51): (rows + 1) x (columns + 1) corners,
 * vertex i * (columns + 1) + j at uv (j / columns, i / rows) and at its corner's data x and y
 * (`corners`, x then y per vertex: utils/gridMarks.js curvilinearCorners), which the shader maps
 * through the frame chain.
 */
export function createGridGeometry(rows, columns, limits = {}, corners = null) {
  const vertices = (rows + 1) * (columns + 1), indexBytes = vertices > 65535 ? 4 : 2;
  const bytes = [vertices * 12, vertices * 12, vertices * 8, rows * columns * 6 * indexBytes];
  if (Math.max(...bytes) > (limits.maxBufferSize ?? Infinity))
    throw limitError("storage", { component: "Heatmap", what: `its ${rows} x ${columns} curvilinear grid`, count: Math.max(...bytes), limit: limits.maxBufferSize,
      hint: "Draw a coarser grid." });
  const position = new Float32Array(vertices * 3), normal = new Float32Array(vertices * 3), uv = new Float32Array(vertices * 2);
  const indices = new (indexBytes === 4 ? Uint32Array : Uint16Array)(rows * columns * 6);
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
    const k = i * (columns + 1) + j;
    uv[k * 2] = j / columns; uv[k * 2 + 1] = i / rows;
    position[k * 3] = corners ? corners[k * 2] : uv[k * 2] * 2 - 1;
    position[k * 3 + 1] = corners ? corners[k * 2 + 1] : uv[k * 2 + 1] * 2 - 1;
    normal[k * 3 + 2] = 1;
  }
  let at = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
    const a = i * (columns + 1) + j, b = a + columns + 1;
    indices[at++] = a; indices[at++] = a + 1; indices[at++] = b;
    indices[at++] = b; indices[at++] = a + 1; indices[at++] = b + 1;
  }
  const geometry = new BufferGeometry();
  geometry.type = "PlaneGeometry";
  geometry.parameters = { width: 2, height: 2, widthSegments: columns, heightSegments: rows };
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("normal", new BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/** Grid cells per side that keep a warped Heatmap's cell chords within
 * `tolerance` pixels. A chord across h of a curve with screen second
 * derivative k deviates k h² / 8; a triangle split misses the twist, about
 * k' h² / 4 for the mixed derivative k'. Both are probed on a 9 × 9 lattice of
 * the mapped bounds (the whole chain and camera, as export maps points). */
export function warpDetail(options, camera, width, height, tolerance = 0.4) {
  const xb = options.get("xbounds"), yb = options.get("ybounds");
  if (!camera || !(width > 0) || !(height > 0) || !xb || !yb) return 16;
  const context = { camera, width, height };
  try { context.operations = framePointOperations(options, context); } catch { return 16; }
  const scratch = new Vector3();
  const pixel = (u, v) => {
    const mapped = framePoint(options, [xb[0] + u * (xb[1] - xb[0]), yb[0] + v * (yb[1] - yb[0]), 0], context);
    if (!mapped) return null;
    const p = mapped.isVector3 ? scratch.copy(mapped) : scratch.set(mapped[0], mapped[1], mapped[2] ?? 0);
    p.project(camera);
    return [p.x, p.y].every(Number.isFinite) ? [(p.x + 1) * width / 2, (1 - p.y) * height / 2] : null;
  };
  const h = 1 / 64, length = (p) => Math.hypot(p[0], p[1]);
  let bend = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const u = Math.min(1 - h, Math.max(h, i / 8)), v = Math.min(1 - h, Math.max(h, j / 8)),
      at = (du, dv) => pixel(u + du * h, v + dv * h), b = at(0, 0);
    if (!b) continue;
    for (const [du, dv] of [[1, 0], [0, 1]]) {
      const a = at(-du, -dv), c = at(du, dv);
      if (a && c) bend = Math.max(bend, length([a[0] - 2 * b[0] + c[0], a[1] - 2 * b[1] + c[1]]) / (h * h));
    }
    const corners = [at(1, 1), at(1, -1), at(-1, 1), at(-1, -1)];
    if (corners.every(Boolean)) bend = Math.max(bend, 2 * length([
      corners[0][0] - corners[1][0] - corners[2][0] + corners[3][0],
      corners[0][1] - corners[1][1] - corners[2][1] + corners[3][1]]) / (4 * h * h));
  }
  return Math.ceil(Math.sqrt(bend / (8 * Math.max(0.05, tolerance))));
}

/** A polar frame's drawn size: pixels per unit of radius, measured at its outer radius (the
 * larger |y bound|) through the whole chain and camera as half the wider of two diameters, so a
 * Pie's own placed Frame, an inset or a ranged Frame count at their drawn size. 0 when it cannot
 * be measured. */
export function ringPixelsPerUnit(options, camera, width, height) {
  const xb = options.get("xbounds"), yb = options.get("ybounds");
  if (!camera || !(width > 0) || !(height > 0) || !xb || !yb) return 0;
  const context = { camera, width, height };
  try { context.operations = framePointOperations(options, context); } catch { return 0; }
  const turn = angularPeriod(options), radius = Math.max(Math.abs(yb[0]), Math.abs(yb[1])), scratch = new Vector3();
  if (!(radius > 0) || !Number.isFinite(turn)) return 0;
  const pixel = (angle) => {
    const mapped = framePoint(options, [angle, radius, 0], context);
    if (!mapped) return null;
    const p = mapped.isVector3 ? scratch.copy(mapped) : scratch.set(mapped[0], mapped[1], mapped[2] ?? 0);
    p.project(camera);
    return [p.x, p.y].every(Number.isFinite) ? [(p.x + 1) * width / 2, (1 - p.y) * height / 2] : null;
  };
  let R = 0;
  for (const start of [xb[0], xb[0] + turn / 4]) {
    const a = pixel(start), b = pixel(start + turn / 2);
    if (a && b) R = Math.max(R, Math.hypot(a[0] - b[0], a[1] - b[1]) / 2);
  }
  return R / radius;
}

/** Segments per revolution that keep arcs at `radius` pixels within `tolerance` pixels of round:
 * a chord across 1/n of a turn sags R (2π/n)² / 8. */
export const ringSegments = (radius, tolerance = 0.5) =>
  radius > 0 ? Math.PI * Math.sqrt(radius / (2 * Math.max(0.05, tolerance))) : 64;
