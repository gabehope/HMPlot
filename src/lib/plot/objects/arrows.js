import { jointProjection } from "../utils/mapProjections.js";
import {curved as curvedPathEnabled} from "../utils/curves.js";
import {
  spherical,
  angularFactor,
  MERCATOR_LIMIT,
} from "../utils/coordinates.js";
import { pathPosition, pathPointNode, chainedCoordinates } from "../utils/coordinateNodes.js";
import { Segments } from "./segments.js";
import {
  CylinderGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  MeshStandardNodeMaterial,
} from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { interleaveGeometry } from "../utils/vertexBuffers.js";
import {
  attribute,
  positionLocal,
  normalLocal,
  vec3,
  float,
} from "three/tsl";
import { collapsed, isFinitePoint } from "../utils/mappedValidity.js";
import { coordinateView } from "../utils/viewContext.js";
export class Arrows3D extends Segments {
  static componentName = "Arrows3D";
  // The refinement pass measures pieces in world units: the head is capped by the path's length.
  worldDistances = true;
  constructor(options, view, invalidate) {
    super(options, view, invalidate, new MeshStandardNodeMaterial());
    this.exportKind = "solid-arrows";
  }
  // Arrows draw heads, not caps (Segments' cap="bar").
  get capActive() {
    return false;
  }
  updateGeometry(doInvalidate = true) {
    // 24 and 32 sides keep a shaft's and a head's outline within about 1% of its radius when an
    // arrow points at the camera (TODO 69.17); 100,000 arrows drew in 3.5 ms a frame, against
    // 3.4 ms with the 12 and 16 sides they had (docs/PERFORMANCE.md).
    const shaft = new CylinderGeometry(1, 1, 1, 24, 1, false),
      head = new ConeGeometry(1, 1, 32);
    shaft.translate(0, 0.5, 0);
    head.translate(0, 0.5, 0);
    shaft.setAttribute(
      "arrowPart",
      new Float32BufferAttribute(
        new Float32Array(shaft.attributes.position.count),
        1,
      ),
    );
    head.setAttribute(
      "arrowPart",
      new Float32BufferAttribute(
        new Float32Array(head.attributes.position.count).fill(1),
        1,
      ),
    );
    const old = this.geometry;
    // One interleaved buffer leaves vertex-buffer slots for endpoint, width, color and picking inputs.
    this.geometry = interleaveGeometry(mergeGeometries([shaft, head]));
    shaft.dispose();
    head.dispose();
    old?.dispose();
    if (doInvalidate) this.invalidate();
  }
  setup() {
    super.setup();
    this.option("headLength", true);
    this.option("headWidth", true);
    this.option("lit");
    this.build();
  }
  build() {
    if (!this.headLengthNode || this.vertexBufferLimitExceeded()) return;
    // Each end with whether the chain maps it (the validity contract, TODO 136.11).
    const mappedStart = this.mapPosition(vec3(0), this.startNode), mappedEnd = this.mapPosition(vec3(0), this.endNode);
    let start = this.applyEndpointOffset(mappedStart.position, "start"),
      end = this.applyEndpointOffset(mappedEnd.position, "end");
    let valid = mappedStart.valid.and(mappedEnd.valid).and(isFinitePoint(start, end));
    this.curvedBuilt = curvedPathEnabled(this.options);
    const curved = this.curvedBuilt && this.startNode && this.endNode;
    // A repeating root map unwraps longitude; a chained map is cut at its seam.
    const rootMap = curved && spherical(this.options) && !chainedCoordinates(this.options) &&
      coordinateView(this.options) !== "3d" && this.options.get("projection") !== "orthographic" &&
      !jointProjection(this.options.get("projection"));
    if (curved) {
      const meta = this.curvedPaths.meta;
      const middle = meta.y.add(meta.z).mul(0.5);
      const first = pathPosition(this, this.startNode, this.endNode, meta.y, middle),
        second = pathPosition(this, this.startNode, this.endNode, meta.z, middle);
      start = first.position;
      end = second.position;
      valid = first.valid.and(second.valid);
      if (rootMap) {
        const shift = start.x
          .sub(this.longitudeShift)
          .add(Math.PI)
          .div(2 * Math.PI)
          .floor()
          .mul(2 * Math.PI);
        start = start.sub(vec3(shift, 0, 0));
        end = end.sub(vec3(shift, 0, 0));
      }
    }
    const delta = end.sub(start),
      length =
        rootMap
          ? delta.x
              .abs()
              .greaterThan(Math.PI / 2)
              .or(
                coordinateView(this.options) === "2d" &&
                  this.options.get("projection") === "mercator"
                  ? pathPointNode(
                      this,
                      this.startNode,
                      this.endNode,
                      this.curvedPaths.meta.y
                        .add(this.curvedPaths.meta.z)
                        .mul(0.5),
                    )
                      .y.mul(angularFactor(this.options))
                      .abs()
                      .greaterThan(MERCATOR_LIMIT)
                  : float(0).greaterThan(1),
              )
              .select(0, delta.length())
          : delta.length(),
      direction = length
        .greaterThan(0)
        .select(delta.div(length.max(1e-30)), vec3(0, 1, 0));
    const up = direction.z
      .abs()
      .lessThan(0.99)
      .select(vec3(0, 0, 1), vec3(0, 1, 0));
    const right = direction.cross(up).normalize(),
      forward = right.cross(direction);
    const part = attribute("arrowPart", "float");
    // Width, head length and head width are world units: Arrows3D is geometry, as Points3D is
    // (docs/RENDERING.md), straight or curved, in 2D and 3D views (TODO 64.4: in a 2D view a
    // curved arrow, one with a curve or in a polar, map or globe frame, was sized in pixels; its
    // SVG export now outlines the tube in world space too).
    // A refined path's head spans headLength back from its true end along the final chord,
    // capped by the path's own length (meta.w is the world distance before this piece), never by the
    // last piece's; that piece's shaft then collapses under the head. Export draws the same head.
    const headSize = this.headLengthNode.mul(this.displayScaleNode);
    const headLength = curved
        ? this.curvedPaths.meta.w.add(length).min(headSize)
          .mul(this.curvedPaths.meta.z.greaterThanEqual(1).select(1, 0))
        : length.min(headSize),
      shaftLength = length.sub(headLength).max(0);
    const baseRadius = part
      .greaterThan(0.5)
      .select(
        this.headWidthNode.mul(this.displayScaleNode).div(2),
        this.applyWidth(float(1)).div(2),
      );
    // Collapse zero-length instances without CPU compaction. A finite fallback
    // frame also keeps normals and the picking material free of NaNs.
    // An end the chain cannot map: the arrow collapses (TODO 136.3: it drew a tube toward the
    // sentinel; 136.11: by the ends' valid bits).
    const radius = length.greaterThan(0).and(valid).select(baseRadius, 0);
    const segmentLength = part.greaterThan(0.5).select(headLength, shaftLength);
    const y = positionLocal.y.mul(segmentLength).add(part.mul(length.sub(headLength)));
    let position = start
      .add(right.mul(positionLocal.x.mul(radius)))
      .add(direction.mul(y))
      .add(forward.mul(positionLocal.z.mul(radius)));
    // In 2D the tube keeps its outline but not its depth: pinned to the axis's z it sits on
    // the mark plane, so declaration order decides what covers it (Stage 22). Seen from
    // above, the pixels are the same.
    if (coordinateView(this.options) !== "3d")
      position = vec3(position.x, position.y, start.z.add(direction.z.mul(y)));
    const n = normalLocal.div(
      vec3(radius.max(1e-8), segmentLength.max(1e-8), radius.max(1e-8)),
    );
    this.material.normalNode = right
      .mul(n.x)
      .add(direction.mul(n.y))
      .add(forward.mul(n.z))
      .normalize();
    this.material.positionNode = collapsed(valid, position);
    const color = this.getColorNode(this.getValueNode());
    this.material.colorNode = this.lit ? color.rgb : vec3(0);
    this.material.emissiveNode = this.lit ? vec3(0) : color.rgb;
    this.material.opacityNode = color.a;
    this.applyBlend(this.blended());
    // Rows at zero row opacity (a padded view's invalid rows, TODO 17.3b) are dropped, even
    // unblended; marks without a row-opacity field are unchanged.
    this.material.alphaTest = this.fields?.has("interactionOpacity") ? 0.001 : 0;
    this.material.needsUpdate = true;
  }
}
