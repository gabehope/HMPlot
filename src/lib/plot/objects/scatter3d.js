import { Scatter } from "./scatter.js";
import { MeshStandardNodeMaterial } from "three/webgpu";
import * as THREE from "three/webgpu";
import { positionLocal, vec3 } from "three/tsl";
import { collapsed } from "../utils/mappedValidity.js";
import { SPHERE_DETAIL } from "./defaultOptions.js";

export class Points3D extends Scatter {
  static componentName = "Points3D";
  constructor(options, view, invalidate) {
    super(options, view, invalidate, new MeshStandardNodeMaterial());
  }

  updateGeometry(doInvalidate = true) {
    // A cube stays flat; anything else is a sphere, its icosahedron subdivided `detail` times (0-4).
    const detail = this.options?.get("detail");
    const nextGeometry = this.options?.get("shape") == "cube"
      ? new THREE.BoxGeometry(1, 1, 1)
      : new THREE.IcosahedronGeometry(1, Number.isFinite(detail) ? Math.min(4, Math.max(0, Math.round(detail))) : SPHERE_DETAIL);
    this.replaceGeometry(nextGeometry);

    if (doInvalidate) {
      this.invalidate();
    }
  }

  build() {
    const valueNode = this.getValueNode();
    const colorNode = this.getColorNode(valueNode);

    // An instance the chain cannot map collapses to a point (TODO 136.11).
    const { position, valid } = this.mapPosition(vec3(0));
    this.setValues(collapsed(valid, this.applyScale(positionLocal).add(position)), colorNode);
    this.applyBlend(this.blended());
    this.material.needsUpdate = true;
  }
}
