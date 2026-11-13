import { installOutlineChannels, outlinePaint, boundaryCoverage, parameterDistance } from "./outlines.js";
import { CurvedPaths } from "../utils/curvedPaths.js";
import { curved } from "../utils/curves.js";
import { Segments } from "./segments.js";
import { drawable } from "./base.js";
import {
  MeshBasicNodeMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
} from "three/webgpu";
import {
  positionGeometry,
  uv,
  vec3,
  float,
  mix,
} from "three/tsl";
import { coordinateView } from "../utils/viewContext.js";

// One instance is a complete band interval or a complete capped error bar.
export class Uncertainty extends Segments {
  static componentName = "ErrorBars";
  static curvedPaths = false;
  // In their own spherical frame, bands and error bars follow meridians and parallels.
  lonLatPieces = true;
  constructor(options, view, invalidate, band) {
    super(
      options,
      view,
      invalidate,
      band
        ? new MeshBasicNodeMaterial({
            transparent: true,
            side: DoubleSide,
            depthWrite: false,
          })
        : undefined,
      band,
    );
    this.band = band;
    // In a curved chain a band interval or an error bar is split into adaptive pieces
    // with the Line rule (utils/curvedPaths.js): a band so both edges meet the
    // tolerance, a bar so an angular or warped interval follows its arc. An
    // axis-aligned bar under separable log/sqrt parents stays one piece.
    this.curvedPaths = new CurvedPaths(this);
    this.exportKind = band ? "band" : "errorbars";
    if (band) {
      this.option("outlineColor", true);
      this.option("outlineWidth", true);
      installOutlineChannels(this);
    }
    this.isConnectedPath = false;
    this.updateGeometry();
    this.build();
  }
  /** An error bar always has its caps (Segments' cap="bar"); a band has none. */
  get capActive() {
    return !this.material?.isMeshBasicNodeMaterial;
  }
  /** The cross rows every refinement view asked for (utils/curvedPaths.js): the
   * mesh is shared, so it keeps the largest. One row is the straight quad. */
  setCrossRows() {
    const views = [this.curvedPaths, ...(this.curvedPaths?.views.values() ?? [])];
    const rows = Math.min(64, Math.max(1, ...views.map((view) => view?.crossRows ?? 1)));
    if (rows === this.crossRows) return;
    this.crossRows = rows;
    this.updateGeometry();
  }
  updateGeometry(doInvalidate = true) {
    if (!this.material?.isMeshBasicNodeMaterial) return super.updateGeometry(doInvalidate);
    // A strip of rows from the lower (v = 0) to the upper (v = 1) edge, in two columns that
    // meet at u = 0.5: where an Area's edges cross inside the interval, the shader moves the
    // middle column to the crossing, so each side is its own triangle (one quad over a
    // crossing is a bow tie whose triangles overlap; TODO 67.1). Elsewhere the middle column
    // stands at the interval's end and the second quad is empty.
    const old = this.geometry, g = new BufferGeometry();
    const rows = this.crossRows ?? 1, positions = [], uvs = [];
    for (let k = 0; k < rows; k++) {
      const v0 = k / rows, v1 = (k + 1) / rows;
      for (const [a, b] of [[0, 0.5], [0.5, 1]])
        for (const [x, y] of [[a, v0], [b, v0], [b, v1], [a, v0], [b, v1], [a, v1]]) {
          positions.push(x, y, 0);
          uvs.push(x, y);
        }
    }
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    if (old) this.replaceGeometry(g);
    else this.geometry = g;
    if (doInvalidate) this.invalidate();
  }
  build() {
    if (!this.material) return;
    if (this.band && !curved(this.options) && this.vertexBuffersExceeded([
      "start", "end", "previous", "next", this.categoryColorActive ? "categoryColor" : "color",
      "interactionOpacity", ...(this.categoryOutlineActive ? ["categoryOutline"] : []), "outlineWidth", "outlineOpacity"])) return;
    // A 2D spherical frame draws lon/lat pieces; a 3D globe has no band path yet.
    const unsupported = this.options.get("coordinates") === "spherical" &&
      coordinateView(this.options) !== "2d";
    this.userData.unsupported = unsupported;
    if (this.material.isMeshBasicNodeMaterial) {
      // Each instance spans [t0, t1] of its source interval: the whole interval, or one
      // piece of it in a nonlinear frame. Both edges are sampled in data space and each
      // vertex is mapped, so a sloped edge follows a Line drawn through the same points.
      this.curvedBuilt = curved(this.options);
      const pieces = this.curvedBuilt && this.curvedPaths && this.startNode && this.endNode;
      // Select a piece's exact end parameters: a mix at x = 1 can round one ulp
      // past a cut at a horizon, where the chain no longer maps the point.
      const from = pieces ? this.curvedPaths.meta.y : float(0), to = pieces ? this.curvedPaths.meta.z : float(1);
      const edges = (t) => [mix(this.startNode ?? vec3(0), this.endNode ?? vec3(0), t),
        mix(this.previousNode ?? vec3(0), this.nextNode ?? vec3(0), t)];
      // Where an Area's upper edge crosses its lower one inside [from, to] (they are linear in
      // the interval's parameter in data space), the middle column stands at the crossing.
      let middle = to;
      if (this.options.allowCrossing) {
        const component = this.options.get("uncertaintyAxis") === 0 ? "x" : "y",
          [lowerA, upperA] = edges(from), [lowerB, upperB] = edges(to),
          a = upperA[component].sub(lowerA[component]), b = upperB[component].sub(lowerB[component]);
        middle = a.mul(b).lessThan(0).select(mix(from, to, a.div(a.sub(b))), to);
      }
      const column = positionGeometry.x,
        along = column.lessThan(0.25).select(from, column.greaterThan(0.75).select(to, middle));
      const [lower, upper] = edges(along);
      // Map each vertex from its source point, so a cross-section that a curved
      // chain bends (an angular span in polar, a warped parent) follows it.
      // On an orthographic map the band runs on behind the horizon (its pieces
      // are not cut there) and the material discards the back by its facing.
      const horizon = {}, refined = { tolerant: true, unwrapRoot: true };
      // The vertex with whether the chain maps it (the validity contract, TODO 136.11).
      const { position: mapped, valid: inside } = this.mapPosition(vec3(0), mix(lower, upper, positionGeometry.y),
        { ...refined, horizon });
      this.material.maskNode = horizon.facing ? horizon.facing.toVarying().greaterThanEqual(0) : null;
      // An interior vertex the chain cannot map (behind a horizon) collapses onto
      // its lower edge point and fades, never stretching a triangle across the
      // plot. The refinement pass keeps both edges valid.
      const p = inside.select(mapped, this.mapPosition(vec3(0), lower, refined).position);
      const valid = this.sampling.index
        .lessThan(4294967040)
        .and(
          (this.options.allowCrossing
            ? float(1).greaterThan(0)
            : (this.options.get("uncertaintyAxis") === 0
                ? lower.x.lessThanEqual(upper.x)
                : lower.y.lessThanEqual(upper.y))
          )
            .and(drawable(lower.x, lower.y, upper.x, upper.y)),
        );
      this.material.positionNode = valid
        .and(float(unsupported ? 0 : 1).greaterThan(0))
        .select(p, vec3(0));
      const color = this.getColorNode(this.getValueNode());
      const fill = (this.lineColorNode ?? color).rgb,
        across = uv().y;
      this.material.colorNode = outlinePaint(this, fill, boundaryCoverage(this,
        [parameterDistance(across), parameterDistance(across.oneMinus())])).color;
      // Bands are transparent: row opacity dims them (base.rowAlpha).
      this.material.opacityNode = valid.and(inside)
        .select(float(1), float(0))
        .toVarying()
        .mul(this.rowAlpha({ fallback: 0.2 }));
      this.material.depthWrite = false;
    } else {
      // Segments draws the caps (applyCaps).
      super.build();
      if (unsupported) this.material.lineWidthNode = float(0);
    }
    this.material.needsUpdate = true;
  }

  get storageOverflow() { return !!this.band; }
}
