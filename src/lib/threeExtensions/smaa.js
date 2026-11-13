import SMAANode from "three/addons/tsl/display/SMAANode.js";
import { NoBlending, QuadMesh, RendererUtils, Vector2 } from "three/webgpu";
import { Fn, abs, max, step, dot, float, vec2, vec4, uv, varyingProperty, convertToTexture } from "three/tsl";

/**
 * SMAA whose edge detection compares alpha as well as color (TODO 58). The plot canvas is
 * transparent and its scene premultiplied, so a mark's edge against the page is a change of
 * alpha. Three's color edge detection compares RGB only, against 0.1, and SMAA runs before the
 * output conversion, in linear light, where a dark mark (#333 is about 0.03) against
 * transparency never counts as an edge. Only the edge pass changes: the weights and blending
 * passes are three's, and blending already carries alpha.
 */
const quad = /*@__PURE__*/ new QuadMesh(), size = /*@__PURE__*/ new Vector2();
let rendererState;

class AlphaSMAANode extends SMAANode {
  /**
   * Three's passes, with a transparent clear: RendererUtils.resetRendererState clears to opaque
   * black, which turned the plot's transparent background black (TODO 58).
   */
  updateBefore(frame) {
    const { renderer } = frame;
    rendererState = RendererUtils.resetRendererState(renderer, rendererState);
    renderer.setClearColor(0x000000, 0);
    const drawing = renderer.getDrawingBufferSize(size);
    this.setSize(drawing.width, drawing.height);
    for (const [target, material] of [[this._renderTargetEdges, this._materialEdges],
      [this._renderTargetWeights, this._materialWeights], [this._renderTargetBlend, this._materialBlend]]) {
      renderer.setRenderTarget(target);
      quad.material = material;
      quad.render(renderer);
    }
    RendererUtils.restoreRendererState(renderer, rendererState);
  }

  setup(builder) {
    const output = super.setup(builder);
    const source = this.textureNode, threshold = 0.1;
    const edges = Fn(() => {
      const vOffset0 = varyingProperty("vec4", "vOffset0"),
        vOffset1 = varyingProperty("vec4", "vOffset1"),
        vOffset2 = varyingProperty("vec4", "vOffset2");
      const center = source.sample(uv()).toVar();
      const delta = (point) => { const t = abs(center.sub(source.sample(point))); return max(t.r, t.g, t.b, t.a); };
      // Left and top deltas, thresholded; a pixel without an edge is discarded.
      const d = vec4().toVar();
      d.x.assign(delta(vOffset0.xy));
      d.y.assign(delta(vOffset0.zw));
      const found = step(vec2(threshold, threshold), d.xy).toVar();
      dot(found, vec2(1, 1)).equal(0).discard();
      // Local contrast adaptation over the direct and two-away neighborhoods, as SMAA does.
      d.z.assign(delta(vOffset1.xy));
      d.w.assign(delta(vOffset1.zw));
      const most = max(d.x, d.y, d.z, d.w).toVar();
      d.z.assign(delta(vOffset2.xy));
      d.w.assign(delta(vOffset2.zw));
      most.assign(max(most, d.z, d.w));
      found.mulAssign(step(float(0.5).mul(most), d.xy));
      return vec4(found, 0, 0);
    });
    this._materialEdges.fragmentNode = edges().context(builder.getSharedContext());
    this._materialEdges.needsUpdate = true;
    // The blend pass writes premultiplied color and alpha as they are.
    this._materialBlend.blending = NoBlending;
    this._materialBlend.needsUpdate = true;
    return output;
  }
}

/** SMAA of a node (a pass's texture), alpha-aware; apply it in linear light, before output. */
export const alphaSmaa = (node) => new AlphaSMAANode(convertToTexture(node));
