import { screenUV, viewportSize, vec2 } from "three/tsl";

/** WebGPU supports native sample counts of 1 and 4; higher modes add scene resolution. */
export function antialiasSamples(mode) {
  return ["msaa", "ssaa8", "ssaa16"].includes(mode) ? 4 : 0;
}

/** The hybrid modes render two/four times as many pixels before presentation downsamples. */
export function antialiasResolution(mode) {
  return mode === "ssaa16" ? 2 : mode === "ssaa8" ? Math.SQRT2 : 1;
}

/** A small reconstruction footprint in output pixels, independent of the sampling grid.
 * Plain bilinear minification has a narrower footprint at 2x than at sqrt(2)x, leaving the
 * higher mode visibly harder. Positive weights preserve premultiplied alpha without ringing.
 */
export function supersampledColor(scenePass) {
  const source = scenePass.getTextureNode();
  const offset = vec2(0.5).div(viewportSize);
  return source.sample(screenUV.add(offset)).add(source.sample(screenUV.sub(offset)))
    .add(source.sample(screenUV.add(vec2(offset.x, offset.y.negate()))))
    .add(source.sample(screenUV.add(vec2(offset.x.negate(), offset.y))))
    .mul(0.25);
}

/** Keep CSS-sized marks and placed/masked frames unchanged in a higher-resolution pass. */
export function withRenderScale(scene, scale, render) {
  if (scale === 1) return render();
  const scaled = [];
  try {
    scene.traverse(object => {
      if (!object.renderScaleNode) return;
      const node = object.renderScaleNode;
      scaled.push([node, node.value]);
      node.value *= scale;
    });
    return render();
  } finally {
    for (const [node, value] of scaled) node.value = value;
  }
}
