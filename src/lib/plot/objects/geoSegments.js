import { Segments } from "./segments.js";
import { coordinatePoint, chainedCoordinates, orthographicFacing } from "../utils/coordinateNodes.js";
import { isFinitePoint } from "../utils/mappedValidity.js";
import { jointProjectionOf } from "../utils/coordinates.js";
import { mix, float } from "three/tsl";
/** GeoJSON boundaries arrive pre-clipped and subdivided under the worker budget.
 * They must not enter the general per-path adaptive scan a second time. */
export class GeoSegments extends Segments {
  static curvedPaths = false;
  static sampleable = false;
  constructor(...args) { super(...args); this.exportKind = "geo-segments"; }
  /** Unwrapped (the worker keeps each segment in one longitude extent) and,
   * on an orthographic map, unclipped: build() trims at the horizon. */
  get geoLocal() {
    return { unwrap: true, unclipped: this.options.get("projection") === "orthographic" };
  }
  /** Mapping on the validity contract (base.js mapPosition). */
  mapPosition(local, coordinates) {
    if (!coordinates) return super.mapPosition(local, coordinates);
    if (chainedCoordinates(this.options))
      return super.mapPosition(local, coordinates, { local: this.geoLocal });
    /** @param {{position: any, valid: any}} q */
    const placed = (q) => ({ position: local.add(q.position), valid: q.valid.and(isFinitePoint(q.position)) });
    // A joint projection's map (TODO 39.5): ends keep their projection; build() drops a segment
    // with an end off the map, or ends in two albers-usa insets.
    if (this.jointEnds) {
      const joint = {};
      this.jointEnds.set(coordinates, joint);
      return placed(coordinatePoint(this, coordinates, { ...this.geoLocal, unclipped: true, joint }));
    }
    return this.options.get("coordinates") === "spherical"
      ? placed(coordinatePoint(this, coordinates, this.geoLocal))
      : super.mapPosition(local, coordinates);
  }
  build() {
    this.jointEnds = this.options && !chainedCoordinates(this.options) && jointProjectionOf(this.options) ? new Map() : null;
    super.build();
    const ends = this.jointEnds && [this.jointEnds.get(this.startNode)?.xy, this.jointEnds.get(this.endNode)?.xy];
    if (this.material && ends?.[0] && ends[1]) {
      const onMap = ends[0].z.greaterThan(0.5).and(ends[1].z.greaterThan(0.5)).and(ends[0].w.equal(ends[1].w));
      this.material.lineWidthNode = onMap.select(this.material.lineWidthNode ?? float(1), float(0));
      this.material.needsUpdate = true;
      if (this.options.get("projection") !== "albers-usa") {
        // Trim the previous mesh's boundary segments at the current longitude extent, just
        // as GeoFaces clips its fragments. Never draw stale unwrapped geometry off the map.
        const [la, lb] = [this.jointEnds.get(this.startNode).lambda, this.jointEnds.get(this.endNode).lambda],
          delta = lb.sub(la), safe = delta.abs().lessThan(1e-12).select(float(1), delta),
          enter = float(-Math.PI).sub(la).div(safe), leave = float(Math.PI).sub(la).div(safe),
          lo = enter.min(leave).clamp(0, 1), hi = enter.max(leave).clamp(0, 1),
          start = this.material.startNode, end = this.material.endNode,
          visible = la.min(lb).lessThanEqual(Math.PI).and(la.max(lb).greaterThanEqual(-Math.PI));
        this.material.startNode = mix(start, end, lo);
        this.material.endNode = mix(start, end, hi);
        this.material.lineWidthNode = visible.select(this.material.lineWidthNode, float(0));
      }
    }
    const a = this.startNode, b = this.endNode,
      fa = a ? orthographicFacing(this, a) : null, fb = b ? orthographicFacing(this, b) : null;
    if (!this.material || !fa || !fb) return;
    // Orthographic projection is linear in 3D: the facing's zero along the
    // chord is at t = fa / (fa - fb), and it maps to the same mix of the
    // mapped ends. The rest of the chain is affine (frameCompatibility), so
    // the mix commutes with it. A segment wholly behind the horizon is dropped.
    const start = this.material.startNode, end = this.material.endNode,
      difference = fa.sub(fb),
      t = fa.div(difference.abs().lessThan(1e-12).select(float(1e-12), difference)),
      cut = mix(start, end, t.clamp(0, 1));
    this.material.startNode = fa.lessThan(0).select(cut, start);
    this.material.endNode = fb.lessThan(0).select(cut, end);
    this.material.lineWidthNode = fa.lessThan(0).and(fb.lessThan(0))
      .select(float(0), this.material.lineWidthNode ?? float(1));
    this.material.needsUpdate = true;
  }
}
