import { outlinePaint, boundaryCoverage, parameterDistance, screenBoundaryDistances } from "./outlines.js";
import { PrismObject, patchStrip } from "./prism.js";
import { drawable } from "./base.js";
import { BufferGeometry, Float32BufferAttribute } from "three/webgpu";
import { vec3, vec4, float, reference, positionGeometry, uniform } from "three/tsl";
import { refinesPieces } from "../utils/curves.js";
import { buildCoordinateOperations, bendingOperation } from "../utils/coordinateOperations.js";

/** Annular sectors use one bounded shared mesh; source intervals remain
 * instanced GPU attributes. The mesh is exact in their own polar frame and
 * under affine fits or placements. Where an ancestor bends it (log/sqrt
 * parents, a polar parent, a globe), a sector refines as a patch between its
 * corners in polar source space (angle along, radius across). */
const MAX_SEGMENTS = 2048;

export class PolarRectObject extends PrismObject {
  // A polar Rect's sectors.
  static componentName = "Rect";
  static numericCoordinateKeys = new Set(["anglePeriod", "baseRadius", "radialScale"]);
  constructor(options, view, invalidate) { super(options, view, invalidate, true); this.exportKind = "polar-rect"; }
  sectorSegments = 64;
  // The widest sector in angle units (marks/polarRect.svelte measures it; Infinity until known):
  // segments per turn times its share of a turn is what the shared mesh needs.
  widestSpan = Infinity;
  setWidestSpan(value) { this.widestSpan = value; }
  // The frame's drawn size, CSS pixels per unit of radius (marks/polarRect.svelte measures it
  // each frame), for those that lay out by it (a Pie's labels).
  pixelsPerUnit = 0;
  pixelListeners = new Set();
  setPixelsPerUnit(value) {
    if (value === this.pixelsPerUnit) return;
    this.pixelsPerUnit = value;
    for (const listener of this.pixelListeners) listener(value);
  }
  /** Calls `listener` with the drawn size now (when known) and whenever it changes; returns the unsubscribe. */
  watchPixelsPerUnit(listener) {
    this.pixelListeners.add(listener);
    if (this.pixelsPerUnit > 0) listener(this.pixelsPerUnit);
    return () => this.pixelListeners.delete(listener);
  }
  refinesChain() {
    try {
      return buildCoordinateOperations(this.options).slice(1)
        .some((operation) => bendingOperation(operation, this.options));
    } catch { return false; }
  }
  patchRotation() { return 0; }
  // The mesh holds MAX_SEGMENTS segments, vertex x their whole-number index; a uniform divides
  // it and the draw range takes the first sectorSegments, so a new count rebuilds nothing.
  // A getter, not a field: the base constructor may build before fields are set.
  get segmentCount() { return (this.segmentUniform ??= uniform(this.sectorSegments ?? 64)); }
  setSectorSegments(value) {
    const next = Math.max(8, Math.min(MAX_SEGMENTS, 8 * Math.ceil(value / 8)));
    if (next === this.sectorSegments) return;
    this.sectorSegments = next;
    this.segmentCount.value = next;
    if (!this.patchGeometry && this.geometry) {
      this.geometry.drawRange.count = next * 6;
      this.invalidate();
    }
  }
  /** A picked uv as the angle and radius parameters along the sector, 0 to 1. */
  pickUV(uv) {
    if (!this.patchGeometry) uv.x = Math.min(1, Math.max(0, uv.x / (this.sectorSegments ?? 64)));
    return uv;
  }
  updateGeometry(invalidate = true) {
    this.patchGeometry = refinesPieces(this);
    if (this.patchGeometry) {
      this.replaceGeometry(patchStrip(this.crossRows ?? 1));
      if (invalidate) this.invalidate();
      return;
    }
    const vertices = [], uvs = [];
    const vertex = (i, radius) => { vertices.push(i, radius, 0); uvs.push(i, radius); };
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      vertex(i, 0); vertex(i + 1, 0); vertex(i + 1, 1);
      vertex(i, 0); vertex(i + 1, 1); vertex(i, 1);
    }
    const geometry = new BufferGeometry();
    geometry.setDrawRange(0, (this.sectorSegments ?? 64) * 6);
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    // Picking reads the segment index and radius; pickUV makes the index the position along
    // the sector, 0 to 1, as the refined patch mesh's.
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    this.replaceGeometry(geometry);
    if (invalidate) this.invalidate();
  }
  build() {
    if (!this.material) return;
    const patch = refinesPieces(this);
    this.curvedBuilt = patch;
    if (patch !== !!this.patchGeometry) this.updateGeometry(false);
    if (!patch && this.vertexBuffersExceeded(this.vertexBufferFields())) return;
    const lo = this.coordinatesNode ?? vec3(0), hi = this.extentNode ?? lo, q = positionGeometry;
    // Along the sector, 0 to 1 (the shared mesh's x is a segment index).
    const along = patch ? q.x : q.x.div(this.segmentCount);
    const angle = lo.x.add(hi.x.sub(lo.x).mul(along));
    const inner = lo.y, outer = hi.y;
    const radius = inner.add(outer.sub(inner).mul(q.y));
    const source = vec3(angle, radius, 0);
    const unit = this.options.get("angleUnit"),
      bounds = reference("xbounds", "vec2", this.options.transformed),
      revolution = unit === "custom"
        ? reference("anglePeriod", "float", this.options.transformed)
        : unit === "extent" ? bounds.y.sub(bounds.x).abs()
          : float(unit === "radians" ? 2 * Math.PI : 360);
    const effectiveInner = reference("baseRadius", "float", this.options.transformed)
      .add(inner.mul(reference("radialScale", "float", this.options.transformed)));
    const valid = drawable(lo.x, hi.x, inner, outer)
      .and(lo.z.equal(0)).and(hi.z.equal(0))
      .and(hi.x.greaterThanEqual(lo.x))
      .and(hi.x.sub(lo.x).lessThanEqual(revolution)).and(outer.greaterThanEqual(inner))
      .and(effectiveInner.greaterThanEqual(0));
    const refined = patch ? this.patchPosition((s, t) =>
      vec3(lo.x.add(hi.x.sub(lo.x).mul(s)), inner.add(outer.sub(inner).mul(t)), 0)) : null;
    // The validity contract (TODO 136.11): a sector drops whole when a corner does not map. A polar
    // chain's validity is per axis (angle, radius), so its four corners see every value.
    const corners = refined ? null : [vec3(lo.x, inner, 0), vec3(lo.x, outer, 0), vec3(hi.x, inner, 0), vec3(hi.x, outer, 0)]
      .map((p) => this.mapPosition(vec3(0), p));
    const shown = refined ? valid : corners.reduce((all, corner) => all.and(corner.valid), valid);
    this.material.positionNode = shown.select(refined ? refined.position
      : this.mapPosition(vec3(0), source).position, vec3(0));
    const color = this.getColorNode(this.getValueNode());
    const u = patch ? q.x.lessThan(0.5).select(this.curvedPaths.meta.y, this.curvedPaths.meta.z) : along;
    const full = hi.x.sub(lo.x).sub(revolution).abs().lessThan(1e-5);
    const parameters = vec4(u, q.y, full.select(float(1),float(0)),
      effectiveInner.lessThan(1e-7).select(float(1),float(0))).toVarying();
    const v = parameters.y;
    const far = float(1e9);
    const caps = patch ? [parameterDistance(parameters.x), parameterDistance(parameters.x.oneMinus())]
      : screenBoundaryDistances(corners.map((corner) => corner.position), [[0, 1], [2, 3]]);
    const border = boundaryCoverage(this, [parameters.z.greaterThan(0).select(far, caps[0]), parameters.z.greaterThan(0).select(far, caps[1]),
      parameters.w.greaterThan(0).select(far, parameterDistance(v)), parameterDistance(v.oneMinus())]);
    this.applyMeshColor(outlinePaint(this, color.rgb, border).color, false);
    // The same continuous row alpha drives rendering, keyed fades and picking visibility.
    this.material.opacityNode = (refined ? shown.and(refined.inside) : shown)
      .select(float(1), float(0)).toVarying().mul(this.rowAlpha());
    this.material.alphaTest = 0.001;
    this.applyMeshBlend();
    this.material.needsUpdate = true;
  }
}
