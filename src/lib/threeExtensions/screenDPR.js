// three's screenDPR is one shared node, but its setup() makes a new uniform(1) for every
// material that builds with it, and its per-render update() writes the pixel ratio into the
// latest of those only. A material built before another one keeps a ratio of 1: at a device
// pixel ratio of 2 its points (PointsNodeMaterial), line widths, labels and pixel offsets draw
// at half size until something rebuilds it. (Screen size and viewport do not have this problem:
// their uniforms share one module-level vector.) One uniform for every material fixes it.
import { ScreenNode } from "three/webgpu";
import { uniform } from "three/tsl";

const setup = ScreenNode.prototype.setup;
let ratio = null;
ScreenNode.prototype.setup = function (builder) {
  if (this.scope !== ScreenNode.DPR) return setup.call(this, builder);
  ratio ??= uniform(1);
  this._output = ratio;
  return ratio;
};
