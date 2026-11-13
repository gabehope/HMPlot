import {
  vec2,
  float,
  Fn,
  min,
  max,
  abs,
  length,
  dot,
  clamp,
  cos,
  sin,
  If,
} from "three/tsl";
import { BUILTIN_SHAPES, shapeVertices, shapeCode, isShape } from "./shapes.js";
import { shapeFieldDistance } from "./shapeFields.js";
/** The built-in flat symbols, in the same order as CATEGORY_SHAPES and symbol codes. */
export const flatSymbols = BUILTIN_SHAPES;
/** Polygon vertices for a built-in or registered shape (unknown names draw as squares). */
export function symbolVertices(shape) {
  return shapeVertices(shape) ?? shapeVertices("square");
}
/** Whether a shape draws from the distance-field texture (a registered shape without an
 * exact polygon: curves, holes, several parts or many vertices). */
export const fieldShape = (shape) => shape !== "circle" && isShape(shape) && !shapeVertices(shape);

// Shape space at a rotation in degrees (counterclockwise). A square scales by |cos| + |sin|
// so that, turned, it still fits its quad.
function turn(p, rotation, square = false) {
  const angle = rotation.mul(Math.PI / 180), c = cos(angle), s = sin(angle);
  if (square) p = p.mul(abs(c).add(abs(s)));
  return vec2(c.mul(p.x).add(s.mul(p.y)), c.mul(p.y).sub(s.mul(p.x)));
}

/**
 * Signed Euclidean distance, shared by fill, inward outline and pick alpha: exact for the
 * circle and for polygons (per edge), from the distance-field texture for other shapes.
 */
export function symbolDistance(shape, p, rotation) {
  const q = turn(p, rotation, shape === "square");
  if (shape === "circle") return length(q).sub(1);
  if (fieldShape(shape)) return shapeFieldDistance(q, float(shapeCode(shape)));
  return polygonDistance(symbolVertices(shape), q);
}

/**
 * The distance for a per-point shape code (a float node): the circle's and the square's in
 * closed form, every other shape's from the distance-field texture. One texture read,
 * whatever the number of registered shapes, and a registration within the texture's capacity
 * rebuilds nothing.
 */
export function symbolCodeDistance(code, p, rotation) {
  const q = turn(p, rotation);
  const d = abs(turn(p, rotation, true)).sub(1);
  const square = length(max(d, 0)).add(min(max(d.x, d.y), 0));
  return code.equal(shapeCode("circle")).select(length(q).sub(1),
    code.equal(shapeCode("square")).select(square, shapeFieldDistance(q, code)));
}

// Exact distance to a polygon's edges, negative inside (crossing parity).
function polygonDistance(vertices, q) {
  return Fn(() => {
    const distance = float(100).toVar(),
      winding = float(1).toVar();
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const a = vec2(...vertices[i]),
        b = vec2(...vertices[j]),
        e = b.sub(a),
        v = q.sub(a);
      const projection = v.sub(e.mul(clamp(dot(v, e).div(dot(e, e)), 0, 1)));
      distance.assign(min(distance, dot(projection, projection)));
      const crosses = a.y.greaterThan(q.y).notEqual(b.y.greaterThan(q.y));
      // Horizontal edges never cross; epsilon only protects their unused division.
      const crossX = b.x
        .sub(a.x)
        .mul(q.y.sub(a.y))
        .div(b.y.sub(a.y).add(1e-12))
        .add(a.x);
      If(crosses.and(q.x.lessThan(crossX)), () => {
        winding.mulAssign(-1);
      });
    }
    return distance.sqrt().mul(winding);
  })();
}
