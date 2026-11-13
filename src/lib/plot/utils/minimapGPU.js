import { curveRender, prepareCurves, releaseCurves } from "./curvedPaths.js";
import { sampledRender } from "./sampledBuffers.js";
import * as THREE from "three/webgpu";
import { texture, renderOutput, vec4 } from "three/tsl";

const owners = new WeakMap();

// A presentation-only WebGPU canvas samples the source renderer's overview target.
// No second Three scene, mark allocation, image encoding, or host transfer.
export class MinimapGPU {
  constructor(renderer, canvas) {
    this.renderer = renderer;
    this.curveSlot = {};
    this.device = renderer.backend.device;
    this.context = canvas.getContext("webgpu");
    if (!this.context) throw Error("Unable to initialize overview canvas.");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });
    this.canvas = canvas;
    owners.set(canvas, this);
    this.disposed = false;
    this.target = new THREE.RenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.colorTarget = new THREE.RenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      depthBuffer: false,
    });
    this.camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 2000);
    this.camera.position.z = 50;
    const value = texture(this.target.texture),
      alpha = value.a;
    this.colorKey = [renderer.toneMapping, renderer.outputColorSpace].join();
    const converted = renderOutput(
      vec4(value.rgb.div(alpha.max(1e-8)), alpha),
      renderer.toneMapping,
      renderer.outputColorSpace,
    );
    this.conversion = new THREE.RenderPipeline(renderer);
    this.conversion.outputColorTransform = false;
    this.conversion.outputNode = vec4(converted.rgb.mul(alpha), alpha);
    const shader = this.device.createShaderModule({
      code: `
      struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f }
      @vertex fn vs(@builtin(vertex_index) i:u32)->Vertex {
        let p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));
        var v:Vertex;v.position=vec4f(p[i],0.,1.);v.uv=vec2f(p[i].x*.5+.5,.5-p[i].y*.5);return v;
      }
      @group(0) @binding(0) var source:texture_2d<f32>;
      @group(0) @binding(1) var sampleSource:sampler;
      @fragment fn fs(v:Vertex)->@location(0) vec4f{return textureSample(source,sampleSource,v.uv);}
    `,
    });
    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs" },
      fragment: {
        module: shader,
        entryPoint: "fs",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.sampler = this.device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
    });
  }
  render(scene, fit, displayScale = 0.35, maxInstances = 1000, pixelRatio = window.devicePixelRatio || 1) {
    if(this.disposed) return false;
    const r = this.renderer,
      ratio = pixelRatio;
    const w = Math.max(1, Math.round(fit.width * ratio)),
      h = Math.max(1, Math.round(fit.height * ratio));
    const cx = fit.left + (fit.width / 2 - fit.x) / (fit.scaleX ?? fit.scale),
      cy = fit.top - (fit.height / 2 - fit.y) / (fit.scaleY ?? fit.scale);
    this.camera.left = cx - fit.width / (fit.scaleX ?? fit.scale) / 2;
    this.camera.right = cx + fit.width / (fit.scaleX ?? fit.scale) / 2;
    this.camera.bottom = cy - fit.height / (fit.scaleY ?? fit.scale) / 2;
    this.camera.top = cy + fit.height / (fit.scaleY ?? fit.scale) / 2;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene = scene;
    if (!prepareCurves(scene, this.camera, w, h, maxInstances, this.curveSlot))
      return false;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.target.setSize(w, h);
      this.colorTarget.setSize(w, h);
    }
    this.target.scissor.set(
      Math.round(fit.x * ratio),
      Math.round(
        (fit.height -
          fit.y -
          (fit.top - fit.bottom) * (fit.scaleY ?? fit.scale)) *
          ratio,
      ),
      Math.round((fit.right - fit.left) * (fit.scaleX ?? fit.scale) * ratio),
      Math.round((fit.top - fit.bottom) * (fit.scaleY ?? fit.scale) * ratio),
    );
    this.target.scissorTest = true;
    const colorKey = [r.toneMapping, r.outputColorSpace].join();
    if (colorKey !== this.colorKey) {
      const value = texture(this.target.texture),
        alpha = value.a;
      const converted = renderOutput(
        vec4(value.rgb.div(alpha.max(1e-8)), alpha),
        r.toneMapping,
        r.outputColorSpace,
      );
      this.conversion.outputNode = vec4(converted.rgb.mul(alpha), alpha);
      this.conversion.needsUpdate = true;
      this.colorKey = colorKey;
    }
    const old = r.getRenderTarget(),
      mrt = r.getMRT(),
      hidden = [];
    scene.traverse((o) => {
      if (o.userData?.omitOverview && o.visible) {
        hidden.push(o);
        o.visible = false;
      }
    });
    try {
      r.setMRT(null);
      r.setRenderTarget(this.target);
      const restore = [];
      scene.traverse((o) => {
        if (o.renderScaleNode) {
          const old = o.renderScaleNode.value;
          o.renderScaleNode.value = old * displayScale;
          restore.push(() => (o.renderScaleNode.value = old));
        }
        if (o.userData?.overviewScale) {
          const old = o.scale.clone();
          o.scale.multiplyScalar(displayScale);
          restore.push(() => o.scale.copy(old));
        }
      });
      try {
        curveRender(
          scene,
          () =>
            sampledRender(scene, maxInstances, () =>
              r.render(scene, this.camera),
            ),
          this.curveSlot,
        );
      } finally {
        for (const reset of restore) reset();
      }
      r.setRenderTarget(this.colorTarget);
      this.conversion.render();
    } finally {
      r.setRenderTarget(old);
      r.setMRT(mrt);
      for (const o of hidden) o.visible = true;
    }
    const tex = r.backend.get(this.colorTarget.texture).texture;
    const group = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: tex.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return true;
  }
  dispose() {
    if (this.scene) releaseCurves(this.scene, this.curveSlot);
    if(this.disposed)return;
    this.disposed=true;
    if(owners.get(this.canvas)===this){this.context.unconfigure();owners.delete(this.canvas);}
    const retire=()=>{this.target.dispose();this.colorTarget.dispose();this.conversion.dispose();};
    this.device.queue.onSubmittedWorkDone().then(retire,retire);
  }
}
