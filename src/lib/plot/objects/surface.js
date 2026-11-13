import { BasePlotObject } from "./base.js";
import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardNodeMaterial,
  DoubleSide,
} from "three/webgpu";
import { attribute, vec3, positionLocal, normalLocal } from "three/tsl";
import { aspect3dPositionNode, aspect3dNormalNode } from "../utils/frameNodes.js";
import {
  transformPoint,
  vertexNormals,
  surfaceMesh,
} from "../utils/surfaceMesh.js";
import { unitOpacity } from "../utils/opacity.js";
export class Surface extends BasePlotObject {
  static componentName = "Surface";
  constructor(options, view, invalidate) {
    super(options, view, invalidate);
    this.material = new MeshStandardNodeMaterial({ side: DoubleSide });
    this.geometry = new BufferGeometry();
    this.data = null;
    for (const key of ["lit", "transparent"])
      this.option(key);
    // Uniforms, not rebuilds: switching them needs no new shader (17.5).
    this.quantizeFlag = this.flagOption("quantize");
    this.scaleChannelOptions("value");
    for (const key of [
      "cmapIndex",
      "levels",
      "valueBounds",
      "valueRange",
      "opacity",
      "fillColor",
    ])
      this.option(key, true);
    // The vertices are transformed on the CPU with the axis options, so any option change
    // refreshes the geometry; only the keys above (option()) change the material's graph.
    this.unregister.push(options.on(() => this.updateVertices()));
    // A solid surface bakes its color into the material.
    this.unregister.push(options.on(() => { if (this.data?.solid && !this.updating) this.build(); }, "fillColor"));
  }
  update(data) {
    const mesh = surfaceMesh(data);
    this.data = {
      ...mesh,
      solid: typeof data.fill === "string" ? data.fill : null,
    };
    // build() below covers a new solid color.
    this.updating = true;
    try { if (typeof data.fill === "string") this.options.set("fillColor", data.fill); }
    finally { this.updating = false; }
    this.build();
  }
  /** Place the data's vertices with the current axis options (no material rebuild). */
  updateVertices() {
    if (!this.data || this.isDisposed) return;
    const { vertices, triangles, values } = this.data;
    const transformed = vertices.map((v) => transformPoint(v, this.options));
    const positions = transformed.flat(), normals = vertexNormals(transformed, triangles).flat();
    const position = this.geometry.getAttribute?.("position");
    if (this.placedData === this.data && position?.array.length === positions.length) {
      // The same mesh placed anew: update its arrays in place. (A swapped geometry could draw
      // from destroyed buffers: three 0.183's RenderObject.setGeometry() keeps the old
      // vertexBuffers until the node graph is rebuilt.)
      position.array.set(positions);
      position.needsUpdate = true;
      const normal = this.geometry.getAttribute("normal");
      normal.array.set(normals);
      normal.needsUpdate = true;
      this.invalidate();
      return;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute("value", new Float32BufferAttribute(values, 1));
    geometry.setAttribute(
      "uv",
      new Float32BufferAttribute(
        vertices.flatMap((v) => [(v[0] + 1) / 2, (v[1] + 1) / 2]),
        2,
      ),
    );
    geometry.setIndex(triangles);
    const old = this.geometry;
    this.geometry = geometry;
    this.placedData = this.data;
    old.dispose();
    this.count = triangles.length ? 1 : 0;
    this.invalidate();
  }
  build() {
    if (!this.data || this.isDisposed) return;
    this.updateVertices();
    const { solid } = this.data;
    this.valueNode = attribute("value", "float");
    const color = this.getColorNode(this.getValueNode());
    if (solid) {
      this.material.color.set(this.options.get("fillColor"));
      this.material.colorNode = null;
      this.material.emissiveNode = this.lit
        ? vec3(0)
        : vec3(this.material.color);
    } else {
      this.material.colorNode = this.lit ? color.rgb : vec3(0);
      this.material.emissiveNode = this.lit ? vec3(0) : color.rgb;
    }
    this.material.positionNode = aspect3dPositionNode(this.options, positionLocal);
    this.material.normalNode = aspect3dNormalNode(this.options, normalLocal);
    this.material.opacityNode = this.opacityNode && unitOpacity(this.opacityNode);
    this.applyBlend(this.transparent);
    this.material.needsUpdate = true;
    this.invalidate();
  }
}
