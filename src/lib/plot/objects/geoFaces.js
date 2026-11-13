import { coordinatePoint, directionNode, chainedCoordinates, orthographicFacing } from "../utils/coordinateNodes.js";
import { angularFactor, longitudeOrigin, jointProjectionOf } from "../utils/coordinates.js";
import { Scatter } from "./scatter.js";
import { drawable } from "./base.js";
import {
  MeshStandardNodeMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
} from "three/webgpu";
import {
  vec3,
  float,
  positionGeometry,
  positionView,
  positionWorld,
  cameraPosition,
  mix,
  dFdx,
  dFdy,
  cross,
  normalize,
  faceDirection,
} from "three/tsl";
import { BufferedField } from "../utils/proputils.js";
import { PositionType, ScalarType } from "./types.js";
import { collapsed, isFinitePoint } from "../utils/mappedValidity.js";
import { onCoordinateView, coordinateView } from "../utils/viewContext.js";
export class GeoFaces extends Scatter {
  // Builds at the end of its constructor, after its fields (Scatter.setup skips its build).
  static buildsItself = true;
  static componentName = "GeoJSON";
  static sampleable = false;
  constructor(options, view, invalidate, material = new MeshStandardNodeMaterial({ side: DoubleSide })) {
    super(
      options,
      view,
      invalidate,
      material,
    );
    // Generated triangulation needs a topology-aware vector backend. Never
    // let the Scatter base class classify triangles as point symbols.
    this.exportKind = "geo-faces";
    for (const name of ["cornerB", "cornerC"])
      this.manager.registerField(
        new BufferedField(
          new PositionType({ targetNodes: [name + "Node"] }),
          this,
          { onDirty: () => this.build() },
        ),
        name,
      );
    this.manager.registerField(
      new BufferedField(new ScalarType({ targetNodes: ["heightNode"] }), this, {
        onDirty: () => this.build(),
      }),
      "height",
    );
    this.unregister.push(onCoordinateView(this.options, () => this.build()));
    this.build();
  }
  updateGeometry() {
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3),
    );
    this.replaceGeometry(g);
  }
  // Each face reads three corners and a height per row besides Scatter's channels (2026-10-22:
  // with hover and respond a GeoJSON needed 9 vertex buffers of 8, so its pipeline was invalid
  // and nothing drew). Counted here, the last fields past the budget read from storage.
  vertexBufferFields() {
    // geoPresent and the outline fields are GeoJSON's own (geojson.svelte registers them).
    return ["position", "cornerB", "cornerC", "height", "geoPresent", "geoOutlineColor", "geoPointOutline",
      ...super.vertexBufferFields().filter((name) => name !== "position")];
  }
  build() {
    if (!this.material) return;
    if (this.vertexBuffersExceeded(this.vertexBufferFields())) return;
    const a = this.coordinatesNode ?? vec3(0),
      b = this.cornerBNode ?? a,
      c = this.cornerCNode ?? a;
    const height = this.heightNode ?? float(0),
      // Nearly coincident extrusion faces flicker under perspective depth
      // precision, so snap only visually negligible heights to the surface.
      effectiveHeight = height.greaterThan(1e-4).select(height, float(0)),
      view = coordinateView(this.options);
    // The worker keeps every triangle inside one longitude extent, so its
    // corners map unwrapped. On an orthographic map a corner behind the
    // horizon keeps its projection; the fragment cut below removes the back.
    const facing = (p) => orthographicFacing(this, p),
      local = { unwrap: true, unclipped: facing(a) !== null };
    // A joint projection's map (TODO 39.5): corners keep their projection, and a triangle with a
    // corner off the map (albers-usa outside its insets), or corners in two insets, is dropped.
    const corners = !chainedCoordinates(this.options) && jointProjectionOf(this.options) ? [] : null;
    // Each corner with whether the chain maps it (the validity contract, TODO 136.11).
    const root = (q) => ({ position: q.position, valid: q.valid.and(isFinitePoint(q.position)) });
    const vertex = (p) => {
      const q = vec3(p.xy, p.z.mul(view === "2d" ? float(0) : effectiveHeight));
      if (chainedCoordinates(this.options)) return this.mapPosition(vec3(0), q, { local });
      if (corners) {
        const joint = {};
        corners.push(joint);
        return root(coordinatePoint(this, q, { ...local, unclipped: true, joint }));
      }
      return this.options.get("coordinates") === "spherical"
        ? root(coordinatePoint(this, q, local))
        : this.mapPosition(vec3(0), q);
    };
    const q = positionGeometry;
    // Each corner mapped once: the position and the validity check share it (mapping a corner
    // twice doubled the projection's cost, and a joint projection's corners would count six).
    const mapped = [vertex(a), vertex(b), vertex(c)], [va, vb, vc] = mapped.map((corner) => corner.position);
    const mappedValid = drawable(a.x, a.y).and(mapped[0].valid).and(mapped[1].valid).and(mapped[2].valid);
    let valid = mappedValid;
    if (corners?.length === 3) {
      const [ja, jb, jc] = corners.map((joint) => joint.xy);
      valid = valid.and(ja.z.greaterThan(0.5)).and(jb.z.greaterThan(0.5)).and(jc.z.greaterThan(0.5))
        .and(ja.w.equal(jb.w)).and(jb.w.equal(jc.w));
    }
    // Interpolate transformed vertices: every pass (including picking) uses this mesh. A face
    // with a corner the chain cannot map, or off a joint map, collapses to a point.
    this.material.positionNode = collapsed(valid, va.mul(q.x).add(vb.mul(q.y)).add(vc.mul(q.z)));
    const top = a.z.equal(1).and(b.z.equal(1)).and(c.z.equal(1)),
      bottom = a.z.equal(0).and(b.z.equal(0)).and(c.z.equal(0)),
      globe = this.options.get("coordinates") === "spherical" &&
        coordinateView(this.options) === "3d" &&
        this.options.get("sphericalView") !== "projected";
    const visible = valid.and(
      top.or(
        effectiveHeight.greaterThan(0)
          .and(float(view === "2d" ? 0 : 1).greaterThan(0))
          // Bottom faces are inside a globe and otherwise compete with the
          // opaque base sphere in the depth buffer.
          .and(globe ? bottom.not() : float(1).greaterThan(0)),
      ),
    );
    const color = this.getColorNode(this.getValueNode());
    const lit = this.lit && view !== "2d";
    this.applyMeshColor(color.rgb, lit);
    const faceNormal = normalize(
      cross(dFdx(positionView), dFdy(positionView)),
    ).mul(faceDirection);
    const source = a.mul(q.x).add(b.mul(q.y)).add(c.mul(q.z));
    const globeTop = directionNode(source, angularFactor(this.options), longitudeOrigin(this.options));
    this.material.normalNode =
      globe
        ? top.select(
            effectiveHeight.greaterThan(0).select(globeTop, globeTop.mul(-1)),
            faceNormal,
          )
        : faceNormal;
    // Orthographic projection is linear in 3D, and so is the facing: its
    // interpolated zero is the chord's crossing, within the worker's
    // subdivision sagitta of the true horizon.
    const front = facing(a)
      ? facing(a).mul(q.x).add(facing(b).mul(q.y)).add(facing(c).mul(q.z)).toVarying()
        .greaterThanEqual(0).select(float(1), float(0))
      : float(1);
    // During a center gesture the last complete mesh can still belong to the preceding
    // longitude extent. Clip its interpolated longitude at the current map boundary while
    // the worker prepares the new cut. Picking uses this same fragment alpha.
    const seam = corners?.length === 3 && this.options.get("projection") !== "albers-usa"
      ? corners[0].lambda.mul(q.x).add(corners[1].lambda.mul(q.y)).add(corners[2].lambda.mul(q.z))
        .toVarying().abs().lessThanEqual(Math.PI + 1e-5).select(float(1), float(0))
      : float(1);
    // Feature opacity and lifecycle fades share the ordinary continuous row alpha.
    this.material.opacityNode = visible
      .select(this.rowAlpha(), float(0))
      .toVarying().mul(front).mul(seam);
    this.material.alphaTest = 0.001;
    this.applyMeshBlend();
    this.material.needsUpdate = true;
  }
}

/**
 * A live VectorTile's extruded buildings (TODO 66.3): GeoFaces whose corners carry their own
 * elevation (the slot's height is 1), shaded without the scene's lights, since a basemap's plot
 * need not have any: roofs in the buildings' fill, walls darker, those turned toward a fixed
 * light from the south-west a little brighter. The normal comes from the triangle's world
 * position, turned toward the camera (the face seen).
 */
export class TileBuildings extends GeoFaces {
  /** Not part of the flat basemap (vectorTileLive.svelte): drawn with depth. */
  isTileBuildings = true;
  applyMeshColor(color) {
    const normal = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
    const seen = normal.dot(cameraPosition.sub(positionWorld)).greaterThanEqual(0).select(normal, normal.negate());
    const wall = float(0.62).add(seen.x.mul(-0.6).add(seen.z.mul(0.8)).max(0).mul(0.24));
    this.material.colorNode = vec3(0);
    this.material.emissiveNode = color.mul(mix(wall, float(1), seen.y.abs()));
  }
}
