import { normalizeShape, MAX_SHAPE_SEGMENTS, EXACT_SHAPE_VERTICES } from "./shapePaths.js";
import { limitError } from "./limits.js";
export { MAX_SHAPE_SEGMENTS, EXACT_SHAPE_VERTICES };

/**
 * The point-shape vocabulary: eight built-in symbols plus shapes registered with
 * registerShape (polygons or SVG paths; utils/shapePaths.js). Each name has a stable integer
 * code (built-ins 0-7 in CATEGORY_SHAPES order, custom shapes from 8 in registration order)
 * used by the per-point symbolCode attribute, the distance-field texture's layers
 * (utils/shapeFields.js), legends, and vector export. The registry is global per page.
 */
export const BUILTIN_SHAPES = Object.freeze([
  // The first eight keep their codes (0-7): category palettes and exports rely on them.
  "circle", "triangle", "diamond", "square", "hexagon", "plus", "cross", "star",
  // Polygons, drawn with the exact per-edge distance (TODO 55).
  "triangle-down", "triangle-left", "triangle-right", "pentagon", "octagon", "wye", "arrow", "chevron",
  // Open shapes (a hole) and pictograms (curves), drawn from the distance field.
  "circle-open", "square-open", "diamond-open", "triangle-open", "heart", "pin", "drop",
]);
/** Shapes per page (built-ins included): the distance-field texture has a layer per shape. */
export const MAX_SHAPES = 256;

// n vertices on the unit circle, the first at `angle` (radians), counterclockwise.
const regular = (n, angle, radius = 1) =>
  Array.from({ length: n }, (_, i) => [Math.cos(angle + (i * 2 * Math.PI) / n) * radius, Math.sin(angle + (i * 2 * Math.PI) / n) * radius]);
// A wye: three arms of half-width h reaching radius `length`, the first up.
function wye(h = 0.28, length = 0.95) {
  const points = [];
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 3, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
    const between = a + Math.PI / 3, inner = h / Math.sin(Math.PI / 3);
    points.push([u[0] * length - v[0] * h, u[1] * length - v[1] * h], [u[0] * length + v[0] * h, u[1] * length + v[1] * h],
      [Math.cos(between) * inner, Math.sin(between) * inner]);
  }
  return points;
}
const ring = (outer, inner) => {
  const path = (points) => `M${points.map(([x, y]) => `${+x.toFixed(6)} ${+y.toFixed(6)}`).join(" L")} Z`;
  return { path: `${path(outer)} ${path(inner)}`, fillRule: "evenodd" };
};
const circlePath = (r, cx = 0, cy = 0) => `M${cx + r} ${cy} A${r} ${r} 0 1 1 ${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r} ${cy} Z`;

function builtinDefinition(shape) {
  if (shape === "square") return [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  if (shape === "plus" || shape === "cross") {
    const a = 0.32,
      p = [[-a, -1], [a, -1], [a, -a], [1, -a], [1, a], [a, a], [a, 1], [-a, 1], [-a, a], [-1, a], [-1, -a], [-a, -a]];
    return shape === "cross" ? p.map(([x, y]) => [(x - y) / Math.SQRT2, (x + y) / Math.SQRT2]) : p;
  }
  if (shape === "star") return regular(10, Math.PI / 2).map(([x, y], i) => (i % 2 ? [x * 0.43, y * 0.43] : [x, y]));
  if (shape === "triangle") return regular(3, Math.PI / 2);
  if (shape === "hexagon") return regular(6, Math.PI / 2);
  if (shape === "diamond") return regular(4, Math.PI / 2);
  if (shape === "triangle-down") return regular(3, -Math.PI / 2);
  if (shape === "triangle-left") return regular(3, Math.PI);
  if (shape === "triangle-right") return regular(3, 0);
  if (shape === "pentagon") return regular(5, Math.PI / 2);
  if (shape === "octagon") return regular(8, Math.PI / 2 + Math.PI / 8);
  if (shape === "wye") return wye();
  if (shape === "arrow") return [[0, 1], [-0.8, 0.05], [-0.25, 0.05], [-0.25, -1], [0.25, -1], [0.25, 0.05], [0.8, 0.05]];
  if (shape === "chevron") return [[0, 0.9], [-1, -0.1], [-1, -0.75], [0, 0.25], [1, -0.75], [1, -0.1]];
  if (shape === "circle-open") return { path: `${circlePath(1)} ${circlePath(0.55)}`, fillRule: "evenodd" };
  if (shape === "square-open") return ring([[-1, -1], [1, -1], [1, 1], [-1, 1]], [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]]);
  if (shape === "diamond-open") return ring(regular(4, Math.PI / 2), regular(4, Math.PI / 2, 0.5));
  if (shape === "triangle-open") return ring(regular(3, Math.PI / 2), regular(3, Math.PI / 2, 0.42));
  if (shape === "heart")
    return "M0 -0.9 C-0.3 -0.6 -1 -0.15 -1 0.35 C-1 0.75 -0.7 0.95 -0.45 0.95 C-0.2 0.95 -0.05 0.8 0 0.65 " +
      "C0.05 0.8 0.2 0.95 0.45 0.95 C0.7 0.95 1 0.75 1 0.35 C1 -0.15 0.3 -0.6 0 -0.9 Z";
  if (shape === "pin")
    return { path: `M0 -1 C-0.33 -0.52 -0.72 -0.08 -0.72 0.25 A0.72 0.72 0 0 0 0.72 0.25 C0.72 -0.08 0.33 -0.52 0 -1 Z ${circlePath(0.28, 0, 0.25)}`, fillRule: "evenodd" };
  if (shape === "drop") return "M0 1 C0.33 0.52 0.72 0.08 0.72 -0.25 A0.72 0.72 0 0 0 -0.72 -0.25 C-0.72 0.08 -0.33 0.52 0 1 Z";
  return null;
}

// Each entry: { code, custom, definition, vertices, rings, contours, fillRule } (normalizeShape);
// the circle has no polygon (vertices and rings null).
const shapes = new Map(BUILTIN_SHAPES.map((name, code) => {
  const definition = builtinDefinition(name);
  if (!definition) return [name, { code, custom: false, definition: null, vertices: null, rings: null, contours: null, fillRule: "nonzero" }];
  return [name, { code, custom: false, ...normalizeShape(definition, name) }];
}));
const listeners = new Set();
let version = 0;

const RESERVED_3D = new Set(["sphere", "cube"]);
/** Check a custom shape name: ASCII identifier, not a built-in or 3D name. */
export function validateShapeName(name) {
  if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name))
    throw Error("Shape names must start with a letter and contain letters, digits, _ or -.");
  if (RESERVED_3D.has(name)) throw Error(`${name} is a 3D shape name and cannot be registered.`);
  if (BUILTIN_SHAPES.includes(name)) throw Error(`${name} is a built-in shape and cannot be redefined.`);
  return name;
}

/**
 * Check a shape definition as registerShape does, without registering it, and return its
 * canonical form: a vertex list, SVG path data, or { path | vertices, fillRule, viewBox }
 * (see normalizeShape in utils/shapePaths.js).
 */
export function validateShape(definition, name = "shape") {
  return normalizeShape(definition, name).definition;
}

function addShape(name, definition) {
  validateShapeName(name);
  const shape = normalizeShape(definition, name);
  const existing = shapes.get(name);
  if (existing) {
    if (JSON.stringify(existing.definition) !== JSON.stringify(shape.definition))
      throw Error(`Shape ${name} is already registered with a different outline.`);
    return { code: existing.code, added: false };
  }
  if (shapes.size >= MAX_SHAPES)
    throw limitError("shapes", { count: shapes.size - BUILTIN_SHAPES.length + 1, limit: MAX_SHAPES - BUILTIN_SHAPES.length });
  const code = shapes.size;
  shapes.set(name, { code, custom: true, ...shape });
  return { code, added: true };
}

function notify(names) {
  if (!names.length) return;
  version++;
  for (const listener of listeners) listener(names[0], names);
}

/**
 * Register a shape by name and return its code. `definition` is a polygon ([[x, y], ...] in
 * [-1, 1], y up), SVG path data in the same space, or { path | vertices, fillRule, viewBox }
 * (utils/shapePaths.js). Re-registering a name with the same definition returns the same
 * code; a different one is an error. Built-in names are reserved.
 */
export function registerShape(name, definition) {
  const { code, added } = addShape(name, definition);
  if (added) notify([name]);
  return code;
}

/**
 * Register several shapes ({name: definition}) with one notification, so the distance field
 * and the marks that draw a registered name hear of a batch once (themes, Python snapshots).
 * Returns the codes.
 */
export function registerShapes(entries) {
  const codes = {}, added = [];
  try {
    for (const [name, definition] of Object.entries(entries ?? {})) {
      const result = addShape(name, definition);
      codes[name] = result.code;
      if (result.added) added.push(name);
    }
  } finally {
    // Shapes registered before an invalid entry stay registered; marks must still hear of them.
    notify(added);
  }
  return codes;
}

/** Every registered shape name, in code order. */
export function shapeNames() {
  return [...shapes.keys()];
}
/** The integer code for a shape name, or -1. */
export function shapeCode(name) {
  return shapes.get(name)?.code ?? -1;
}
export function isShape(name) {
  return shapes.has(name);
}
export function isCustomShape(name) {
  return !!shapes.get(name)?.custom;
}
/**
 * The polygon a shape draws with the exact per-edge distance: the built-in polygons and simple
 * custom polygons of at most EXACT_SHAPE_VERTICES edges; null for the circle and for shapes
 * drawn from the distance field. Unknown names draw as squares.
 */
export function shapeVertices(name) {
  const entry = shapes.get(name) ?? shapes.get("square");
  return entry.vertices;
}
/**
 * A shape's outline: `rings` (closed polygons, for the distance field), `contours` (M/L/C
 * commands in shape space, for legends and export) and `fillRule`. Null for the circle;
 * unknown names are the square.
 */
export function shapeOutline(name) {
  const entry = shapes.get(name) ?? shapes.get("square");
  return entry.rings ? { rings: entry.rings, contours: entry.contours, fillRule: entry.fillRule } : null;
}
export function shapesVersion() {
  return version;
}
/**
 * Subscribe to shape registrations: listener(name, names) once per registration batch, with
 * `names` every shape the batch added. Returns an unsubscribe function.
 */
export function onShapeRegistered(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
