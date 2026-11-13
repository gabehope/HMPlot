/**
 * Analytic edges for flat 2D rectangles (TODO 59): coverage computed in the shader from the
 * distances to a rectangle's four edges, so Rect, Bar and Histogram edges are smooth on a
 * canvas drawn without MSAA (`antialias="off"` or `"smaa"`).
 *
 * A mark builds with them only while its Plot's antialiasing is not MSAA (objects/prism.js), and
 * then blends. Even so, the edges apply only while `analyticEdges` is 1: the live canvas's scene
 * pass sets it when that pass has one sample (scenes/interactive.svelte). Exports (4x MSAA), the
 * picking pass, minimaps and surface textures draw with it at 0: the plain rectangle, opaque,
 * as with MSAA, so a PNG is the same whatever the screen uses and a pick follows pixel centers.
 */
import { uniform, vec2, vec3, vec4, float, length, clamp, min, cameraProjectionMatrix, viewportSize } from "three/tsl";

/** 1 while a single-sampled live canvas draws; 0 otherwise (exports, picking, minimaps). */
export const analyticEdges = uniform(0);

/**
 * The analytic rectangle at one corner of its quad. `own`, `acrossX` and `acrossY` are world
 * positions: this vertex's corner and its neighbors across the rectangle in its x and y
 * directions. Their screen images span a parallelogram (an affine frame chain; or an
 * axis-aligned box through separable log or sqrt scales), so distances to its edges are affine
 * in screen space and interpolate exactly. `q` is the corner in the unit square, +-0.5.
 *
 * Coverage is a one-pixel box filter across each pair of edges: the exact area, sub-pixel
 * widths included. Two rectangles side by side then let the background through where their
 * shared edge crosses a pixel (up to a quarter of it), as SVG renderers do. Where `grow` (a
 * boolean node: an opaque mark in normal blending) holds, edges move out by half a pixel on
 * sides of at least 2 pixels, tapering to none at 1 pixel: a neighbor covers the seam, and a
 * sub-pixel side keeps its area.
 *
 * Returns the world offset that pushes the corner out to its fringe's end (half a pixel, a pixel
 * where grown; 0 while `analyticEdges` is 0) and the coverage node for the fragment stage (1
 * while it is 0).
 */
export function rectangleEdges(own, acrossX, acrossY, q, grow = false) {
  // Device pixels per world unit: the 2D camera is orthographic and axis-aligned
  // (BasePlotObject.applyPixelOffset makes the same assumption).
  const pixels = vec2(cameraProjectionMatrix.element(0).x, cameraProjectionMatrix.element(1).y)
    .mul(viewportSize).mul(0.5).abs();
  const ex = acrossX.sub(own).xy.mul(pixels), ey = acrossY.sub(own).xy.mul(pixels),
    lx = length(ex), ly = length(ey);
  // Unit directions across the rectangle; a zero-width side keeps 0 (it draws nothing).
  const ux = lx.greaterThan(1e-6).select(ex.div(lx.max(1e-6)), vec2(0)),
    uy = ly.greaterThan(1e-6).select(ey.div(ly.max(1e-6)), vec2(0));
  // The sine between the sides: a pixel across an edge is 1 / sine along the other side.
  const sine = ux.x.mul(uy.y).sub(ux.y.mul(uy.x)).abs(),
    width = lx.mul(sine), height = ly.mul(sine);
  const growth = (side) => grow ? grow.select(clamp(side.sub(1), 0, 1).mul(0.5), float(0)) : float(0);
  const gx = growth(width), gy = growth(height);
  // Each side moves out as far as its fringe reaches: half a pixel past the (grown) edge.
  const kx = analyticEdges.mul(gx.add(0.5)), ky = analyticEdges.mul(gy.add(0.5)),
    push = ux.mul(kx).add(uy.mul(ky)).negate().div(sine.max(0.25));
  // Signed distances (pixels, positive inside) to the low and high x and y edges.
  const sx = q.x.add(0.5), sy = q.y.add(0.5),
    spanX = width.add(kx.mul(2)), spanY = height.add(ky.mul(2));
  const distances = vec4(
    sx.mul(spanX).sub(kx).add(gx), sx.oneMinus().mul(spanX).sub(kx).add(gx),
    sy.mul(spanY).sub(ky).add(gy), sy.oneMinus().mul(spanY).sub(ky).add(gy),
  ).toVarying("vRectangleEdges");
  const across = (low, high) => clamp(min(low, 0.5).add(min(high, 0.5)), 0, 1);
  const coverage = analyticEdges.greaterThan(0.5).select(
    across(distances.x, distances.y).mul(across(distances.z, distances.w)), float(1));
  return { offset: vec3(push.div(pixels), 0), coverage };
}
