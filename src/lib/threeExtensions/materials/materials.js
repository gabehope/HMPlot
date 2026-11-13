import {
  uv,
  vec2,
  clamp,
  max,
  texture,
  float,
  length,
  abs,
  mod,
  dFdx,
  dFdy,
  fwidth,
  mix,
  negate,
  mat2,
  smoothstep,
  vec4,
  fract,
  atan,
  TWO_PI,
  Fn,
  If,
} from "three/tsl";
import { COLORMAP_ROWS, colormapTexture } from "../materials/colormaps.js";
import { tslTransform, transformCode } from "../../plot/utils/scaleTransforms.js";

const COLORMAP_COUNT = COLORMAP_ROWS;

function linearstep(a, b, x) {
  return clamp(x.sub(a).div(b.sub(a)), 0.0, 1.0);
}

/**
 * `quantize` is a boolean (baked into the shader) or a float uniform node (1 quantizes), so a
 * mark can switch it without a new shader.
 */
export function applyColorMapNode({
  valueNode,
  cmapIndexNode,
  levelsNode,
  quantize,
}) {
  // Apply colormap
  let normalized = clamp(valueNode, 0.0, 1.0 - 1e-3);

  if (quantize) {
    const safeLevels = float(max(levelsNode, 1));
    const stepped = (value) => clamp(value.mul(safeLevels).floor(), 0, safeLevels.sub(1))
      .add(0.5)
      .div(safeLevels);
    normalized = quantize.isNode ? switched(quantize.greaterThan(0.5), normalized, stepped) : stepped(normalized);
  }
  const cmapRow = float(cmapIndexNode).add(0.5).div(float(COLORMAP_COUNT));
  const outcolor = texture(colormapTexture, vec2(normalized, cmapRow)).rgb; //.toVar();
  return outcolor;
}

export function applyContourNode({
  colorNode,
  valueNode,
  gradNode,
  levelsNode,
  lineWidthNode,
  lineFeatherNode,
  contourColorNode,
  contourStrengthNode,
}) {
  const uvcoord = uv();
  const safeLevels = float(max(levelsNode, 1));
  const quantized = clamp(valueNode, 0.0, 1.0 - 1e-3).mul(safeLevels);

  // Differentiate the displayed scalar in screen space. Stored texture gradients
  // are piecewise and can disagree with filtering and color transforms.
  const ssderiv = vec2(dFdx(valueNode), dFdy(valueNode)).mul(safeLevels);

  const w1 = lineWidthNode.sub(lineFeatherNode.mul(0.5));
  const d = clamp(length(ssderiv), 1e-5);
  const looped = negate(abs(mod(quantized, 1.0).sub(0.5))).add(0.5);
  const contourLine = linearstep(
    d.mul(w1.add(lineFeatherNode)),
    d.mul(w1),
    looped,
  );
  return vec4(
    mix(
      colorNode.rgb,
      contourColorNode.rgb,
      contourLine.mul(contourStrengthNode)
        // Draw interior isolines only, never paint flat/empty regions as level 0.
        .mul(quantized.greaterThan(0.5).and(quantized.lessThan(safeLevels.sub(0.5))))
        .mul(length(ssderiv).greaterThan(1e-8)),
    ),
    colorNode.a,
  );
}

/**
 * `input`, or `change(input)` where `condition` holds, as statements in order. A select() over
 * two expressions that share a node can compile to if/else with the shared node generated only
 * in the first branch, which leaves it unset in the other (a heatmap then read 0).
 */
function switched(condition, input, change) {
  return Fn(() => {
    const value = input.toVar(), result = value.toVar();
    If(condition, () => { result.assign(change(value)); });
    return result;
  })();
}

/** A transform's code for a uniform that selects it in the shader (utils/scaleTransforms.js). */
export { transformCode };

// Keep the render-specific CPU and TSL mappings together; axis-scale semantics differ.
export { renderScaleNode as applyScale } from "../../plot/utils/scaleTransforms.js";

/**
 * Whether `valueNode` is inside its transform's domain (a bool node), or null when every value
 * is (linear, symlog, a baked transform without a domain). Outside it a value is missing (TODO
 * 39.1): its row is not drawn and not picked.
 */
export function scaleValid({ valueNode, valueTransform }) {
  const valid = tslTransform(valueTransform, null).valid;
  return valid ? valid(valueNode) : null;
}

export function derivScale({
  valueNode,
  derivativeNode,
  valueTransform,
  boundsNode,
  constantNode = null,
  midpointNode = null,
}) {
  const { apply: transform, derivative: dtransform } = tslTransform(valueTransform, constantNode);
  const transformedvmin = transform(boundsNode.x);
  const transformedvmax = transform(boundsNode.y);
  let range = transformedvmax.sub(transformedvmin);
  if (midpointNode) {
    // Each half spans half the output: its slope is 0.5 / (its transformed width).
    const m = transform(midpointNode.y), v = transform(valueNode);
    const half = range.mul(v.sub(m)).lessThan(0).select(m.sub(transformedvmin), transformedvmax.sub(m)).mul(2);
    range = midpointNode.x.greaterThan(0.5).select(half, range);
  }
  return dtransform(valueNode).mul(derivativeNode).div(range);
}

export function applyGrid({
  colorNode,
  uvNode,
  polar,
  offsetNode,
  cellsNode,
  cellsWidthNode,
  cellColorNode,
  sectionsNode,
  sectionsWidthNode,
  sectionColorNode,
  gridStrengthNode,
}) {
  let coord = vec2(uvNode).sub(0.5);

  if (polar) {
    coord = vec2(length(coord), atan(coord.y, coord.x).div(TWO_PI).add(0.5));
  }

  const offset = vec2(offsetNode);
  const cellCoord = coord.add(offset).mul(vec2(cellsNode));
  const cellDist = fract(cellCoord.add(0.5)).sub(0.5).abs();

  const cellAAx = fwidth(cellCoord.x);
  const cellAAy = fwidth(cellCoord.y);

  const cellHalfWidthX = float(cellsWidthNode).mul(0.5).mul(cellAAx);
  const cellHalfWidthY = float(cellsWidthNode).mul(0.5).mul(cellAAy);

  const cellLineX = float(1).sub(
    smoothstep(
      cellHalfWidthX.sub(cellAAx),
      cellHalfWidthX.add(cellAAx),
      cellDist.x,
    ),
  );
  const cellLineY = float(1).sub(
    smoothstep(
      cellHalfWidthY.sub(cellAAy),
      cellHalfWidthY.add(cellAAy),
      cellDist.y,
    ),
  );

  const cellMask = max(cellLineX, cellLineY);

  const sectionCoord = coord.add(offset).mul(vec2(sectionsNode));
  const sectionDist = fract(sectionCoord.add(0.5)).sub(0.5).abs();
  const sectionAAx = fwidth(sectionCoord.x);
  const sectionAAy = fwidth(sectionCoord.y);
  const sectionHalfWidthX = float(sectionsWidthNode).mul(0.5).mul(sectionAAx);
  const sectionHalfWidthY = float(sectionsWidthNode).mul(0.5).mul(sectionAAy);
  const sectionLineX = float(1).sub(
    smoothstep(
      sectionHalfWidthX.sub(sectionAAx),
      sectionHalfWidthX.add(sectionAAx),
      sectionDist.x,
    ),
  );
  const sectionLineY = float(1).sub(
    smoothstep(
      sectionHalfWidthY.sub(sectionAAy),
      sectionHalfWidthY.add(sectionAAy),
      sectionDist.y,
    ),
  );
  const sectionMask = max(sectionLineX, sectionLineY);

  const withCells = mix(
    colorNode,
    vec4(cellColorNode.rgb, 1.0),
    cellMask.mul(gridStrengthNode),
  );
  return vec4(
    mix(
      withCells,
      vec4(sectionColorNode.rgb, 1.0),
      sectionMask.mul(gridStrengthNode),
    ),
  );
}
