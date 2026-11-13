import { boundaryCoverage, outlinePaint, screenBoundaryDistances } from "./outlines.js";
import { Scatter } from "./scatter.js";
import { drawable } from "./base.js";
import { MeshBasicNodeMaterial, BufferGeometry, Float32BufferAttribute, DoubleSide } from "three/webgpu";
import { vec3, float, positionGeometry, min } from "three/tsl";
import { BufferedField } from "../utils/proputils.js";
import { PositionType, ScalarType } from "./types.js";
import { collapsed } from "../utils/mappedValidity.js";

/**
 * Filled triangles, one per row (TODO 47.4): the primitive the Polygon mark draws, for polygons
 * triangulated on the host (Polygon's vertex rows) and the triangles transforms make on the GPU
 * (contour bands, Voronoi cells, hulls). A row's corners are `position`, `cornerB` and
 * `cornerC`, each mapped through the frame; `edges` flags which of its edges (bit 0: a-b,
 * bit 1: b-c, bit 2: c-a) are its polygon's own, where the outline is drawn, `outlineWidth`
 * pixels wide, from the triangle's barycentric coordinates. Flat 2D, unlit.
 */
export class Triangles extends Scatter {
  // Builds at the end of its constructor, after its fields (Scatter.setup skips its build).
  static buildsItself = true;
  static outlines = true;
  static componentName = "Polygon";
  static sampleable = false;
  constructor(options, view, invalidate) {
    super(options, view, invalidate, new MeshBasicNodeMaterial({ side: DoubleSide }));
    this.exportKind = "triangles";
    // Legends show a filled swatch.
    this.legendArea = true;
    for (const name of ["cornerB", "cornerC"])
      this.manager.registerField(
        new BufferedField(new PositionType({ targetNodes: [name + "Node"] }), this, { onDirty: () => this.build() }),
        name,
      );
    this.manager.registerField(
      new BufferedField(new ScalarType({ targetNodes: ["edgesNode"] }), this, { onDirty: () => this.build() }),
      "edges",
    );
    this.build();
  }
  updateGeometry() {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3));
    this.replaceGeometry(g);
  }
  build() {
    if (!this.material) return;
    if (this.vertexBuffersExceeded(["position", "cornerB", "cornerC", "edges",
      this.categoryColorActive ? "categoryColor" : "fill", "interactionOpacity",
      ...(this.categoryOutlineActive ? ["categoryOutline"] : []), "outlineWidth", "outlineOpacity"])) return;
    const a = this.coordinatesNode ?? vec3(0), b = this.cornerBNode ?? a, c = this.cornerCNode ?? a, q = positionGeometry;
    // Each corner through the frame; the interior is linear between them.
    const vertex = (p) => this.mapPosition(vec3(0), vec3(p.xy, 0));
    // Each corner mapped once, shared by the position, the validity check and the outline.
    const corners = [vertex(a), vertex(b), vertex(c)], [va, vb, vc] = corners.map((corner) => corner.position);
    // A corner the chain cannot map: the triangle draws nothing (TODO 136.3: it stretched toward
    // the sentinel; 136.11: by the corners' valid bits, and it collapses to a point).
    const valid = drawable(a.x, a.y).and(drawable(b.x, b.y)).and(drawable(c.x, c.y))
      .and(corners[0].valid).and(corners[1].valid).and(corners[2].valid);
    this.material.positionNode = collapsed(valid, va.mul(q.x).add(vb.mul(q.y)).add(vc.mul(q.z)));
    const color = this.getColorNode(this.getValueNode());
    // The outline: device pixels from the fragment to the nearest flagged edge, as a segment
    // between its two mapped corners on screen (a sliver's other corner may lie within the
    // outline's width of an edge's line, so a barycentric distance would outline all of it).
    let edge = float(0);
    if (this.edgesNode) {
      const flags = this.edgesNode.toVarying(), far = float(1e9);
      const bit = (k) => flags.div(2 ** k).floor().mod(2).greaterThan(0.5);
      const [ab, bc, ca] = screenBoundaryDistances([va, vb, vc], [[0, 1], [1, 2], [2, 0]]);
      const distance = min(min(bit(0).select(ab, far), bit(1).select(bc, far)), bit(2).select(ca, far));
      edge = boundaryCoverage(this, [distance]);
    }
    this.material.colorNode = outlinePaint(this, color.rgb, edge).color;
    // Row opacity (a Filter's hidden rows, selection dimming) and the mark's opacity.
    this.material.opacityNode = valid.select(float(1), float(0)).toVarying().mul(color.a);
    this.material.alphaTest = 0.001;
    this.applyBlend(this.blended());
    this.material.depthWrite = !this.material.transparent;
    this.material.needsUpdate = true;
  }
}
