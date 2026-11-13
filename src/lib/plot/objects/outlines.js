import { float, mix, min, smoothstep, screenDPR, vec2, vec4, length, dFdx, dFdy,
  cameraProjectionMatrix, cameraViewMatrix, modelWorldMatrix, viewportSize, screenCoordinate, dot, clamp } from "three/tsl";
import { BufferedField } from "../utils/proputils.js";
import { ScalarType, ColorType } from "./types.js";
import { unitOpacity } from "../utils/opacity.js";

export const OUTLINE_KEYS = ["outlineColor", "outlineWidth", "outlineOpacity"];
const styles = new WeakMap();

/** Resolve per-instance styles on the vertex stage, with compact shared varyings. */
function outlineStyle(mark) {
  const color = mark.categoryOutlineActive && mark.categoryOutlineNode
    ? mark.categoryOutlineNode : mark.outlineColorNode;
  const width = mark.outlineWidthNode, opacity = mark.outlineOpacityNode;
  const previous = styles.get(mark);
  if (previous && previous.color === color && previous.width === width && previous.opacity === opacity) return previous;
  const paint = color ? vec4(color, opacity ?? float(1)) : null;
  const result = { color, width, opacity,
    widthValue: width && mark.fields.get("outlineWidth")?.isBufferNode ? width.toVarying() : width ?? float(0),
    paint: paint && (mark.categoryOutlineActive || mark.fields.get("outlineOpacity")?.isBufferNode) ? paint.toVarying() : paint,
  };
  styles.set(mark, result);
  return result;
}

/** Shared inspector definitions; every outline width is CSS pixels (points too, TODO 133.5). */
export function ensureOutlineOptions(options) {
  options.ensure("outlineColor", new ColorType({ defaultValue: "#30343b", label: "Outline color" }));
  const width = new ScalarType({ defaultValue: 0, min: 0, max: 20, step: 0.25, label: "Outline width" });
  options.ensure("outlineWidth", width);
  options.ensure("outlineOpacity", new ScalarType({ defaultValue: 1, min: 0, max: 1,
    step: 0.01, label: "Outline opacity" }));
  // A definition may already belong to a different mark on the shared root.
  options.presentationTypes.set("outlineWidth", { ...width.ui(), type: width });
  return OUTLINE_KEYS;
}

/** Ordinary fields own literal and per-row styles, including settings-pane edits and animation. */
export function installOutlineChannels(mark) {
  mark.hasOutlines = true;
  for (const [key, fallback] of [["outlineWidth", 0], ["outlineOpacity", 1]])
    mark.manager.registerField(new BufferedField(new ScalarType({ defaultValue: fallback,
      targetNodes: [key + "Node"] }), mark, { onDirty: () => mark.build() }), key);
  if (!mark.fields.has("categoryOutline"))
    mark.manager.registerField(new BufferedField(new ColorType({ targetNodes: ["categoryOutlineNode"] }),
      mark, { onDirty: () => mark.build() }), "categoryOutline");
}

export function setOutlineColors(mark, active) {
  if (!!mark.categoryOutlineActive === active) return;
  mark.categoryOutlineActive = active;
  mark.build();
}

/** A border overlays the fill; its opacity does not dim the interior or replace mark opacity. */
export function outlinePaint(mark, fill, coverage) {
  const style = outlineStyle(mark);
  const opacity = style.paint?.a ?? mark.outlineOpacityNode ?? float(1);
  const alpha = outlineAlpha(opacity);
  const edge = coverage.mul(alpha);
  const color = style.paint?.rgb ?? fill;
  return { color: mix(fill, color, edge), border: color, coverage: edge };
}

export function outlineAlpha(opacity) {
  return unitOpacity(opacity);
}

/** Pixel distance to source boundaries; refinement joins are never boundaries. */
export function boundaryCoverage(mark, distances) {
  const width = outlineWidth(mark).mul(mark.displayScaleNode ?? float(1)).mul(screenDPR);
  const distance = distances.reduce((a, b) => min(a, b), float(1e9));
  return smoothstep(width.sub(0.5), width.add(0.5), distance).oneMinus().mul(width.greaterThan(0));
}

/** The outline's width in CSS pixels: a finite, nonnegative value, else 0. */
export function outlineWidth(mark) {
  const raw = outlineStyle(mark).widthValue;
  return raw.abs().lessThan(1e30).select(raw.max(0), float(0));
}

export function parameterDistance(parameter) {
  return parameter.div(length(vec2(dFdx(parameter), dFdy(parameter))).max(1e-9));
}

/** Exact distances to mapped boundaries, sharing packed endpoints within the varying budget. */
export function screenBoundaryDistances(points, edges) {
  const screen = (p) => {
    const clip = cameraProjectionMatrix.mul(cameraViewMatrix.mul(modelWorldMatrix.mul(vec4(p, 1))));
    const ndc = clip.xy.div(clip.w);
    return vec2(ndc.x.mul(0.5).add(0.5).mul(viewportSize.x), ndc.y.mul(-0.5).add(0.5).mul(viewportSize.y));
  };
  // WebGPU guarantees only 16 varying locations. Share corners and pack two vec2 endpoints
  // into each location, leaving room for colormaps, row opacity and per-row outline styles.
  const projected = points.map(screen), packed = [];
  for (let i = 0; i < projected.length; i += 2) {
    if (i + 1 < projected.length) {
      const pair = vec4(projected[i], projected[i + 1]).toVarying();
      packed.push(pair.xy, pair.zw);
    } else packed.push(projected[i].toVarying());
  }
  return edges.map(([a, b]) => {
    const from = packed[a], to = packed[b], d = to.sub(from), at = screenCoordinate.xy;
    const t = clamp(dot(at.sub(from), d).div(dot(d, d).max(1e-9)), 0, 1);
    return length(at.sub(from.add(d.mul(t))));
  });
}
