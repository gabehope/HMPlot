// A segment's screen-sized arrow end. The segment owner supplies mapped endpoints,
// row validity and the true-end flag; this module owns only its mesh and shader.
import { BufferGeometry, Float32BufferAttribute } from "three/webgpu";
import {
  Fn,
  vec2,
  vec4,
  float,
  mix,
  attribute,
  varyingProperty,
  cameraViewMatrix,
  cameraProjectionMatrix,
  cameraNear,
  screenSize,
  screenDPR,
} from "three/tsl";

export function arrowGeometry() {
  const geometry = new BufferGeometry();
  // x: distance along shaft/head, y: share of its width, z: shaft (0) or head (1).
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        0, -0.5, 0, 1, -0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0, 0,
        -0.5, 1, 1, 0, 1, 0, 0.5, 1,
      ],
      3,
    ),
  );
  return geometry;
}

export function setupArrowMaterial(material) {
  const { startNode: start, endNode: end, arrowHead: head } = material;
  material.vertexNode = Fn(() => {
    const rawA = cameraViewMatrix.mul(vec4(start, 1)),
      rawB = cameraViewMatrix.mul(vec4(end, 1)),
      near = cameraNear.negate();
    const trim = (a, b) => {
      const dz = b.z.sub(a.z);
      const t = near
        .sub(a.z)
        .div(dz.abs().max(1e-8).mul(dz.greaterThanEqual(0).select(1, -1)))
        .clamp(0, 1);
      return a.z.greaterThan(near).select(mix(a, b, t), a);
    };
    const ca = cameraProjectionMatrix.mul(trim(rawA, rawB)),
      cb = cameraProjectionMatrix.mul(trim(rawB, rawA)),
      pa = ca.xy.div(ca.w.abs().max(1e-8)).mul(screenSize).mul(0.5),
      pb = cb.xy.div(cb.w.abs().max(1e-8)).mul(screenSize).mul(0.5),
      delta = pb.sub(pa),
      length = delta.length(),
      direction = delta.div(length.max(1e-8)),
      normal = vec2(direction.y.negate(), direction.x),
      g = attribute("position", "vec3"),
      isHead = g.z.greaterThan(0.5),
      headLength = head.length.mul(screenDPR).min(length).mul(head.last)
        .mul(rawB.z.lessThanEqual(near)),
      along = isHead.select(
        length.sub(headLength).add(g.x.mul(headLength)),
        g.x.mul(length.sub(headLength)),
      ),
      width = isHead.select(head.width, material.lineWidthNode).mul(screenDPR),
      pixel = pa.add(direction.mul(along)).add(normal.mul(g.y).mul(width)),
      t = along.div(length.max(1e-8)),
      clip = mix(ca, cb, t);
    varyingProperty("vec3", "pickWorld").assign(mix(start, end, t));
    varyingProperty("float", "arrowVisible").assign(
      length
        .greaterThan(1e-5)
        .and(rawA.z.lessThanEqual(near).or(rawB.z.lessThanEqual(near)))
        .select(head.valid, 0),
    );
    if (material.dashed) {
      const distance = (material.distanceStartNode ?? float(0)).mul(
        screenSize.y.div(screenDPR),
      );
      varyingProperty("float", "arrowDistance").assign(
        distance.add(along.div(screenDPR)).mul(clip.w),
      );
      varyingProperty("float", "arrowW").assign(clip.w);
      varyingProperty("float", "arrowHead").assign(g.z);
    }
    return vec4(pixel.div(screenSize).mul(2).mul(clip.w), clip.z, clip.w);
  })();
  material.colorNode = Fn(() => {
    if (material.dashed) {
      const distance = varyingProperty("float", "arrowDistance").div(
        varyingProperty("float", "arrowW"),
      );
      distance
        .mod(material.dashSizeNode.add(material.gapSizeNode).max(1e-6))
        .greaterThan(material.dashSizeNode)
        .and(varyingProperty("float", "arrowHead").lessThan(0.5))
        .discard();
    }
    return vec4(
      material.lineColorNode,
      material.opacityNode.mul(varyingProperty("float", "arrowVisible")),
    );
  })();
  material.outputNode = material.shadeOutput
    ? material.shadeOutput(material.colorNode)
    : material.colorNode;
}
