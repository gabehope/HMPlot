import { installOutlineChannels, outlinePaint, boundaryCoverage, parameterDistance } from "./outlines.js";
import { prismFootprint } from "../utils/rectangles.js";
import { Scatter } from "./scatter.js";
import { drawable } from "./base.js";
import { always } from "../utils/mappedValidity.js";
import {
  MeshStandardNodeMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
} from "three/webgpu";
import {
  vec3,
  positionGeometry,
  float,
  cos,
  sin,
  positionView,
  dFdx,
  dFdy,
  cross,
  normalize,
  faceDirection,
} from "three/tsl";
import { BufferedField } from "../utils/proputils.js";
import { PositionType, ScalarType } from "./types.js";
import { refinesPieces } from "../utils/curves.js";
import { buildCoordinateOperations } from "../utils/coordinateOperations.js";
import { nonlinearFrame, frameDimensionStages } from "../utils/frameMapping.js";
import { rectangleEdges } from "../utils/analyticEdges.js";
import { antialiasSamples } from "../utils/antialias.js";
import { onCoordinateView, coordinateView } from "../utils/viewContext.js";

/** A patch mesh: a strip of rows from the lower (y = 0) to the upper (y = 1)
 * edge, between a refined piece's start (x = 0) and end (x = 1). Its UV is the
 * same pair (picking writes it). */
export function patchStrip(rows) {
  const positions = [], uvs = [];
  for (let k = 0; k < rows; k++) {
    const v0 = k / rows, v1 = (k + 1) / rows;
    for (const [x, y] of [[0, v0], [1, v0], [1, v1], [0, v0], [1, v1], [0, v1]]) {
      positions.push(x, y, 0);
      uvs.push(x, y);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
class ExtentType extends PositionType {
  get name() {
    return "extent";
  }
}
class TurnType extends ScalarType {
  get name() {
    return "turn";
  }
}
export class PrismObject extends Scatter {
  // Builds at the end of its constructor, after its fields (Scatter.setup skips its build).
  static buildsItself = true;
  // A Rect draws with this class too: prism.svelte names its instances (TODO 32.8).
  static componentName = "Prism";
  // Where a chain bends a flat Rect's edges, each row refines as a patch
  // between its four corners, like a band interval (utils/curvedPaths.js).
  static curvedPaths = true;
  curvedFields = ["position", "extent", "turn"];
  curvedPatch = true;
  // In its own spherical frame a Rect is a lon/lat patch (interpolationOf).
  lonLatPieces = true;
  turnActive = false;
  constructor(options, view, invalidate, outlines = false) {
    super(
      options,
      view,
      invalidate,
      new MeshStandardNodeMaterial({ side: DoubleSide }),
    );
    this.exportKind = "prism";
    if (outlines) installOutlineChannels(this);
    this.manager.registerField(
      new BufferedField(new ExtentType({ targetNodes: ["extentNode"] }), this, {
        onDirty: () => this.build(),
      }),
    );
    this.manager.registerField(
      new BufferedField(new TurnType({ targetNodes: ["turnNode"] }), this, {
        onDirty: () => this.build(),
      }),
    );
    this.unregister.push(onCoordinateView(this.options, () => {
      this.updateGeometry();
      this.build();
    }));
    this.option("extrusionAxis", false, () => this.build());
    this.option("flat", false, () => {
      this.updateGeometry();
      this.build();
    });
    // Analytic edges follow the Plot's antialiasing (TODO 59): a change rebuilds.
    const plot = this.options.getChildDefaults("plot");
    if (plot?.has("antialias"))
      this.unregister.push(plot.on(() => { this.build(); this.invalidate(); }, "antialias"));
    this.build();
  }
  /** Whether this mark draws a flat 2D rectangle with analytic edges (TODO 59): on a Plot whose
   * antialiasing is not MSAA, for a rectangle whose screen image is a parallelogram, so not a
   * refined patch, and not turned through a log, sqrt or symlog scale (its corners would not
   * make one). */
  analyticRectangle() {
    const o = this.options;
    if (coordinateView(o) !== "2d" || (o.get("extrusionAxis") ?? "z") !== "z" ||
        (o.get("shape") ?? "rectangle") !== "rectangle" || ["polar", "spherical"].includes(o.get("coordinates"))) return false;
    if (antialiasSamples(o.getChildDefaults("plot")?.get("antialias") ?? "msaa") > 1 || refinesPieces(this)) return false;
    const turned = this.turnActive || Number(o.get("rotation") ?? 0) !== 0;
    return !(turned && ["x", "y"].some((axis) => frameDimensionStages(o, axis)
      .some(({ source }) => (source.get(axis + "Transform") ?? "linear") !== "linear")));
  }
  /** A flat 2D rectangle refines where its chain bends straight edges, as a
   * Line's: under a polar or spherical operation, or when turned under a
   * nested log/sqrt parent. An axis-aligned Rect under separable log/sqrt
   * parents stays exact whole; at a log root, Lines and edges stay straight. */
  refinesChain() {
    const o = this.options;
    if (coordinateView(o) !== "2d" || (o.get("extrusionAxis") ?? "z") !== "z" ||
        (o.get("shape") ?? "rectangle") !== "rectangle") return false;
    if ((this.turnActive || Number(o.get("rotation") ?? 0) !== 0) && nonlinearFrame(o)) return true;
    try {
      return buildCoordinateOperations(o).some((operation) =>
        operation.kind === "polar" || operation.kind.startsWith("spherical"));
    } catch { return false; }
  }
  /** The patch turn in radians, or null for the per-row turn field. */
  patchRotation() {
    return this.turnActive ? null : Number(this.options.get("rotation") ?? 0) * Math.PI / 180;
  }
  /** The cross rows every refinement view asked for; the mesh is shared, so
   * it keeps the largest. One row is a straight cross-section. */
  setCrossRows() {
    const views = [this.curvedPaths, ...(this.curvedPaths?.views.values() ?? [])];
    const rows = Math.min(64, Math.max(1, ...views.map((view) => view?.crossRows ?? 1)));
    if (rows === this.crossRows) return;
    this.crossRows = rows;
    this.updateGeometry();
  }
  /** A refined patch vertex: the piece's parameter along its edges, the row
   * across, mapped from its source point through the whole chain. A vertex
   * the chain cannot map (behind a horizon) collapses onto the lower edge and
   * is reported outside, to fade. */
  patchPosition(corner) {
    const meta = this.curvedPaths.meta,
      u = positionGeometry.x.lessThan(0.5).select(meta.y, meta.z),
      // A patch across a repeating root map's antimeridian stays one piece; on
      // an orthographic map it runs on behind the horizon, which `facing` cuts.
      horizon = {},
      // The vertex with whether the chain maps it (the validity contract, TODO 136.11).
      { position: mapped, valid: inside } = this.mapPosition(vec3(0), corner(u, positionGeometry.y),
        { tolerant: true, unwrapRoot: true, horizon });
    // Else the lower edge, on the contract (mapped, possibly invalid): the vertex fades either way.
    return { position: inside.select(mapped, this.mapPosition(vec3(0), corner(u, float(0)),
      { tolerant: true, unwrapRoot: true }).position), inside, facing: horizon.facing ?? null };
  }
  updateGeometry(invalidate = true) {
    this.patchGeometry = refinesPieces(this);
    if (this.patchGeometry) {
      this.replaceGeometry(patchStrip(this.crossRows ?? 1));
      if (invalidate) this.invalidate();
      return;
    }
    // An analytic rectangle is a quad, its corners pushed out in the shader (build).
    this.quadGeometry = this.analyticRectangle();
    if (this.quadGeometry) {
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(prismFootprint("rectangle").flatMap((p) => [...p, 1]), 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      this.replaceGeometry(g);
      if (invalidate) this.invalidate();
      return;
    }
    const shape = this.options.get("shape") ?? "rectangle",
      polygon = prismFootprint(shape),
      count = polygon.length;
    const vertices = [],
      face = (a, b, c) => vertices.push(...a, ...b, ...c),
      flat =
        this.options.get("flat") ||
        (coordinateView(this.options) === "2d" &&
          (this.options.get("extrusionAxis") ?? "z") === "z");
    for (let i = 0; i < count; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % count];
      face([0, 0, 1], [...a, 1], [...b, 1]);
      if (!flat) {
        face([0, 0, 0], [...b, 0], [...a, 0]);
        face([...a, 0], [...b, 0], [...b, 1]);
        face([...a, 0], [...b, 1], [...a, 1]);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    g.computeVertexNormals();
    this.replaceGeometry(g);
    if (invalidate) this.invalidate();
  }
  build() {
    if (!this.material) return;
    const patch = refinesPieces(this), analytic = this.analyticRectangle();
    this.curvedBuilt = patch;
    if (patch !== !!this.patchGeometry || analytic !== !!this.quadGeometry) this.updateGeometry(false);
    if (!patch && this.vertexBuffersExceeded(this.vertexBufferFields())) return;
    const lo = this.coordinatesNode ?? vec3(0),
      hi = this.extentNode ?? lo,
      angle = (
        this.turnActive
          ? (this.turnNode ?? float(0))
          : (this.rotationNode ?? float(0))
      ).mul(Math.PI / 180),
      q = positionGeometry;
    const axis = this.options.get("extrusionAxis") ?? "z",
      plane = [..."xyz"].filter((a) => a !== axis);
    // The footprint point at (s, t) across the turned footprint, at height r along the axis.
    const at = (s, t, r) => {
      const a = s.mul(hi[plane[0]].sub(lo[plane[0]])),
        b = t.mul(hi[plane[1]].sub(lo[plane[1]]));
      const u = a.mul(cos(angle)).sub(b.mul(sin(angle))),
        v = a.mul(sin(angle)).add(b.mul(cos(angle)));
      return vec3(...[..."xyz"].map((k) =>
        k === axis
          ? lo[k].add(hi[k].sub(lo[k]).mul(r))
          : lo[k]
              .add(hi[k])
              .mul(0.5)
              .add(k === plane[0] ? u : v),
      ));
    };
    // A patch corner: (u, v) across the turned footprint, on the top face.
    const corner = (s, t) => {
      const a = s.sub(0.5).mul(hi.x.sub(lo.x)), b = t.sub(0.5).mul(hi.y.sub(lo.y));
      return vec3(lo.x.add(hi.x).mul(0.5).add(a.mul(cos(angle)).sub(b.mul(sin(angle)))),
        lo.y.add(hi.y).mul(0.5).add(a.mul(sin(angle)).add(b.mul(cos(angle)))), hi.z);
    };
    const refined = patch ? this.patchPosition(corner) : null;
    const p = at(q.x, q.y, q.z), own = refined ? null : this.mapPosition(vec3(0), p),
      placed = own?.position;
    // An analytic rectangle's corner moves out to where its edges' fringe ends, and its edges'
    // coverage is the alpha. Opaque in "normal" blending, its edges grow by up to half a pixel,
    // so rectangles side by side (a Histogram's bars) leave no seam (utils/analyticEdges.js).
    const grow = (this.options.get("blend") ?? "normal") === "normal" &&
      (this.opacityNode ?? float(1)).greaterThanEqual(1);
    const across = analytic ? [this.mapPosition(vec3(0), at(q.x.negate(), q.y, q.z)),
      this.mapPosition(vec3(0), at(q.x, q.y.negate(), q.z))] : null;
    const edges = analytic ? rectangleEdges(placed, across[0].position, across[1].position, q, grow) : null;
    // A solid drops whole when a corner does not map (a bar from 0 on a log axis), rather than
    // stretching to the sentinel (TODO 136.11). The validity of a separable chain is per axis, so
    // a corner and its two neighbors see every axis value; a solid checks its extreme corners,
    // turned the corners of the turned square its footprint is inscribed in.
    const turned = this.turnActive || Number(this.options.get("rotation") ?? 0) !== 0,
      extremes = turned ? [[-0.5, -0.5, 0], [0.5, 0.5, 1], [-0.5, 0.5, 0], [0.5, -0.5, 1]].map(([s, t, r]) => at(float(s), float(t), float(r)))
        : [lo, hi];
    const corners = refined ? always() : own.valid.and(analytic ? across[0].valid.and(across[1].valid)
      : extremes.map((point) => this.mapPosition(vec3(0), point).valid).reduce((a, b) => a.and(b)));
    const valid = drawable(lo.x, lo.y, lo.z).and(corners)
      // A spherical frame draws only a refined lon/lat patch (no solid prisms).
      .and(
        float(
          this.options.get("coordinates") === "spherical" && !patch ? 0 : 1,
        ).greaterThan(0),
      );
    this.material.positionNode = valid.select(
      refined ? refined.position : edges ? placed.add(edges.offset) : placed,
      vec3(0),
    );
    const color = this.getColorNode(this.getValueNode()).rgb;
    const lit = this.lit && coordinateView(this.options) !== "2d";
    // Source parameters survive adaptive patch refinement; only the true footprint borders
    // have distance zero. Pixel derivatives keep the stroke constant through zoom and warps.
    const u = patch ? q.x.lessThan(0.5).select(this.curvedPaths.meta.y, this.curvedPaths.meta.z) : q.x.add(0.5);
    const v = patch ? q.y : q.y.add(0.5);
    // Keep source parameters and the flat-footprint flag in one location. Reading lo/hi
    // in the fragment stage otherwise exceeds the varying budget in lit 3D Rects.
    const boundary = this.hasOutlines ? vec3(u, v, lo.z.equal(hi.z).select(float(1), float(0))).toVarying() : null;
    const border = boundary ? boundaryCoverage(this, [parameterDistance(boundary.x), parameterDistance(boundary.x.oneMinus()),
      parameterDistance(boundary.y), parameterDistance(boundary.y.oneMinus())]).mul(boundary.z) : float(0);
    this.applyMeshColor(this.hasOutlines ? outlinePaint(this, color, border).color : color, lit);
    this.material.normalNode = normalize(
      cross(dFdx(positionView), dFdy(positionView)),
    ).mul(faceDirection);
    // Zero-alpha rows are hidden in rendering and picking; fractional row alpha blends.
    const shown = (refined ? valid.and(refined.inside) : valid)
      .select(float(1), float(0))
      .toVarying()
      .mul(this.rowAlpha());
    this.material.opacityNode = edges ? shown.mul(edges.coverage) : shown;
    this.material.alphaTest = 0.001;
    this.material.maskNode = refined?.facing ? refined.facing.toVarying().greaterThanEqual(0) : null;
    this.applyMeshBlend(analytic);
    this.material.needsUpdate = true;
  }

  vertexBufferFields() {
    return ["position", "extent", ...(this.turnActive ? ["turn"] : []),
      this.categoryColorActive ? "categoryColor" : "fill", "interactionOpacity",
      ...(this.hasOutlines ? [...(this.categoryOutlineActive ? ["categoryOutline"] : []), "outlineWidth", "outlineOpacity"] : [])];
  }
}
