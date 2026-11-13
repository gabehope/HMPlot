import { RenderTarget, FloatType, NearestFilter } from "three/webgpu";
import { mrt, vec4 } from "three/tsl";
/** A data-only pass: no color conversion, filtering, blending or extra beauty
 * attachment. Two float32 textures use WebGPU's standard 32-byte/sample budget.
 */
export class PickingPass {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.renderTarget = new RenderTarget(1, 1, {
      count: 2,
      type: FloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      samples: 0,
    });
    this.renderTarget.textures[0].name = "output";
    this.renderTarget.textures[1].name = "world";
    this.mrt = mrt({ output: vec4(0), world: vec4(0) });
  }
  getTexture(name) {
    return this.renderTarget.textures[name === "world" ? 1 : 0];
  }
  render(renderer) {
    this.renderTarget.setSize(
      renderer.domElement.width,
      renderer.domElement.height,
    );
    const previous = renderer.getRenderTarget(),
      previousMRT = renderer.getMRT();
    try {
      renderer.setRenderTarget(this.renderTarget);
      renderer.setMRT(this.mrt);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setMRT(previousMRT);
    }
  }
  dispose() {
    this.renderTarget.dispose();
  }
}
