import { copyPickingMaterial } from "../../picking/copyPickingMaterial.js";
import { SurfaceFrameGate, surfacePipelineKey } from "./surfaceFrameGate.js";
import { prepareCurves, curveRender } from "./curvedPaths.js";
import { refinesPieces } from "./curves.js";
import {
  Scene,
  OrthographicCamera,
  RenderTarget,
  FloatType,
  NearestFilter,
  Color,
  NoBlending,
} from "three/webgpu";
import {
  texture,
  mrt,
  vec4,
  float,
  uniform,
  instanceIndex,
  uv,
} from "three/tsl";
import { sourcePosition } from "../../picking/sourcePosition.js";
import { readPixel } from "../../picking/readPixel.js";
import { spherical, sphericalDomain, angularFactor, longitudeRadians, latitudeRadians, angularPeriod } from "./coordinates.js";
import { sampledRender } from "./sampledBuffers.js";
import { animationVersion } from "./markAnimation.js";
import { setLayeredScene, registryOf } from "./layerOrder.js";
import { limitError } from "./limits.js";
export class SurfaceTexture {
  constructor(mark, context) {
    this.mark = mark;
    this.context = context;
    this.renderer = mark.renderer;
    /** The view it draws in, which lists it while it exists. */
    this.view = mark.view;
    this.scene = new Scene();
    // A surface's chart is 2D: its marks layer in declaration order (Stage 22).
    setLayeredScene(this.scene, true);
    this.camera = new OrthographicCamera(-50, 50, 50, -50, 0.01, 2000);
    this.camera.position.z = 100;
    this.materials = new Map();
    this.pickMRT = mrt({ output: vec4(0) });
    this.revision = "";
    this.version = 0;
    this.disposed = false;
    this.resolution = null;
    this.frames = [];
    this.node = null;
    this.draws = 0;
    this.frameGate = new SurfaceFrameGate();
    this.view.drawing.surfaceTextures.add(this);
    mark.surfaceTexture = this;
  }
  configure(resolution) {
    const [w, h] =
      resolution ??
      (spherical(this.mark.options) ? [2048, 1024] : [1024, 1024]);
    const device = this.renderer.backend.device;
    const samples =
      // Offscreen surface textures keep 4x MSAA unless antialiasing is off (SMAA is on screen).
      (this.mark.options.getChildDefaults("plot")?.get("antialias") ?? "msaa") !== "off"
        ? 4
        : 0;
    const component = this.mark.componentName ?? "Heatmap";
    if (![w, h].every((n) => Number.isInteger(n) && n > 0))
      throw Error(
        `${component} textureResolution needs two positive whole numbers; received ${[w, h].join(", ")}.`,
      );
    if (Math.max(w, h) > device.limits.maxTextureDimension2D)
      throw limitError("texture", {
        component,
        what: "its textureResolution",
        count: Math.max(w, h),
        limit: device.limits.maxTextureDimension2D,
        hint: "Use a smaller textureResolution.",
        property: "textureResolution",
      });
    if (w * h * (samples ? 112 : 56) > device.limits.maxBufferSize)
      throw limitError("storage", {
        component,
        what: "its texture's color and picking cache",
        count: w * h * (samples ? 112 : 56),
        limit: device.limits.maxBufferSize,
        hint: "Use a smaller textureResolution.",
        property: "textureResolution",
      });
    const current = this.pending?.resolution ?? this.resolution;
    if (
      current?.[0] === w &&
      current?.[1] === h &&
      (this.pending?.samples ?? this.samples) === samples
    )
      return;
    this.retire(this.pending?.frames ?? []);
    const frames = Array.from({ length: 2 }, () => ({
      color: new RenderTarget(w, h, { depthBuffer: true, samples }),
      pick: new RenderTarget(w, h, {
        type: FloatType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: true,
      }),
    }));
    for (const frame of frames) frame.pick.texture.name = "output";
    this.pending = { frames, resolution: [w, h], samples };
    this.revision = "";
    if (!this.node) {
      this.node = texture(frames[0].color.texture);
      this.mark.childTextureNode = this.node;
      this.mark.build();
    }
  }
  retire(frames) {
    if (!frames.length) return;
    const dispose = () =>
      frames.forEach((f) => {
        f.color.dispose();
        f.pick.dispose();
      });
    const queue = this.renderer.backend.device?.queue;
    if (queue) queue.onSubmittedWorkDone().then(dispose, dispose);
    else dispose();
  }

  /**
   * The range a flat grid's quad spans along `axis`: its range, or where its cell bounds sit in
   * its bounds (Heatmap.setCellExtent, TODO 134.15), so children draw where the cells are.
   * @param {string} axis
   */
  cellRange(axis) {
    const range = this.mark.options.get(axis + "range"), extent = this.mark.cellExtent?.[axis];
    if (!extent) return range;
    const [b0, b1] = this.mark.options.get(axis + "bounds"),
      at = (v) => range[0] + ((v - b0) / (b1 - b0)) * (range[1] - range[0]);
    return [at(extent[0]), at(extent[1])];
  }

  render() {
    if (this.disposed || (!this.frames.length && !this.pending)) return false;
    registryOf(this.scene)?.flush();
    const resolution = this.pending?.resolution ?? this.resolution;
    const objects = [];
    this.scene.traverse((o) => {
      if (o.material) objects.push(o);
    });
    if (
      this.mark.manager.pendingUpdates ||
      objects.some((o) => o.manager?.pendingUpdates)
    )
      return false;
    const key = JSON.stringify([
      resolution,
      objects.map((o) => [
        o.uuid,
        this.context.objectIdReverseMap.get(o),
        o.visible,
        o.renderOrder,
        o.count,
        o.material.version,
        o.geometry?.uuid,
        o.progress?.value,
        o.surfaceVersion,
        animationVersion(o),
        o.options?.get("displayScale"),
        [...(o.fields ?? [])].map(([k, f]) => [k, f.version, f.animationVersion]),
      ]),
      this.mark.options.get("xbounds"),
      this.mark.options.get("ybounds"),
      this.mark.cellExtent,
      this.mark.options.get("coordinates"),
      this.mark.options.get("angleUnit"),
      this.mark.options.get("anglePeriod"),
      // Surface displacement does not alter the longitude–latitude color chart.
      objects.map((o) => Object.fromEntries(
        Object.entries(o.options?.transformed ?? {}).filter(([key]) => key !== "zScale" || !spherical(this.mark.options)),
      )),
    ]);
    const pipelineKey = surfacePipelineKey(
      objects,
      resolution,
      this.pending?.samples ?? this.samples,
      this.renderer.getPixelRatio(),
    );
    if (key === this.revision && this.frameGate.key === pipelineKey)
      return true;
    for (const [o, e] of this.materials)
      if (!objects.includes(o)) {
        e.material.dispose();
        this.materials.delete(o);
      }
    const r = this.renderer,
      back = this.pending
        ? this.pending.frames[0]
        : this.frames[1 - this.front],
      target = r.getRenderTarget(),
      oldMRT = r.getMRT(),
      color = r.getClearColor(new Color()),
      alpha = r.getClearAlpha(),
      previous = [];
    const domain = spherical(this.mark.options)
      ? {
          x: this.mark.options
            .get("xbounds")
            .map((v) => longitudeRadians(v, this.mark.options)),
          y: this.mark.options
            .get("ybounds")
            .map((v) => latitudeRadians(v, this.mark.options)),
        }
      : {
          x: this.cellRange("x"),
          y: this.cellRange("y"),
        };
    this.camera.left = domain.x[0];
    this.camera.right = domain.x[1];
    this.camera.bottom = domain.y[0];
    this.camera.top = domain.y[1];
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    if (!prepareCurves(this.scene, this.camera, ...resolution)) return false;
    try {
      r.setClearColor(0, 0);
      r.setMRT(null);
      r.setRenderTarget(back.color);
      curveRender(this.scene, () =>
        sampledRender(this.scene, null, () =>
          r.render(this.scene, this.camera),
        ),
      );
      for (const o of objects) {
        previous.push([o, o.material, o.visible]);
        const id = this.context.objectIdReverseMap.get(o) ?? 0;
        let entry = this.materials.get(o);
        if (
          !entry ||
          entry.source !== o.material ||
          entry.id !== id ||
          entry.version !== o.material.version
        ) {
          entry?.material.dispose();
          const material = copyPickingMaterial(o.material.clone(), o.material);
          material.transparent = false;
          material.blending = NoBlending;
          material.alphaToCoverage = false;
          material.alphaTest = Math.max(0.001, o.material.alphaTest);
          material.mrtNode = mrt({
            output: vec4(
              float(id),
              (refinesPieces(o)
                ? o.curvedPaths.index
                : o.sampling?.index) ?? float(instanceIndex),
              uv(),
            ),
          });
          entry = {
            material,
            source: o.material,
            id,
            version: o.material.version,
          };
          this.materials.set(o, entry);
        }
        o.material = entry.material;
      }
      r.setRenderTarget(back.pick);
      r.setMRT(this.pickMRT);
      curveRender(this.scene, () =>
        sampledRender(this.scene, null, () =>
          r.render(this.scene, this.camera),
        ),
      );
      // First use constructs the node pipelines and initializes screen-size
      // uniforms. Do not cache that pass: seam copies must all use the same
      // initialized uniforms in both color and ID targets. Keep the previous
      // published pair untouched until a second, complete pass is available.
      if (!this.frameGate.accept(pipelineKey)) {
        this.mark.invalidate();
        return false;
      }
      if (this.pending) {
        const old = this.frames;
        this.frames = this.pending.frames;
        this.resolution = this.pending.resolution;
        this.samples = this.pending.samples;
        this.front = 0;
        this.pending = null;
        this.retire(old);
      } else this.front = 1 - this.front;
      this.node.value = back.color.texture;
      this.version++;
      this.draws++;
      this.revision = key;
    } finally {
      for (const [o, m, v] of previous) {
        o.material = m;
        o.visible = v;
      }
      r.setRenderTarget(target);
      r.setMRT(oldMRT);
      r.setClearColor(color, alpha);
    }
    return true;
  }
  async pick(hit) {
    if (this.disposed || !this.resolution) return hit;
    const version = this.version,
      [w, h] = this.resolution;
    const data = await readPixel(
      this.renderer,
      this.frames[this.front].pick.texture,
      Math.min(w - 1, Math.max(0, Math.floor(hit.uv.x * w))),
      Math.min(h - 1, Math.max(0, Math.floor((1 - hit.uv.y) * h))),
    );
    if (this.disposed || this.version !== version) return null;
    const child = this.context.objectIdMap.get(Math.round(data[0]));
    if (!child || child.isDisposed) return hit;
    const point = this.mark.dataPoint(hit.uv),
      source = await sourcePosition(child, Math.round(data[1]));
    if (this.disposed || this.version !== version) return null;
    if (source && spherical(this.mark.options)) {
      const period = angularPeriod(this.mark.options);
      point[0] += Math.round((source[0] - point[0]) / period) * period;
    }
    return {
      ...hit,
      sourcePosition: source,
      radialOffset: source?.[2] ?? 0,
      object: child,
      eventObject: child,
      instanceId: Math.round(data[1]),
      surfaceUV: hit.uv.clone(),
      surface: this.mark,
      dataPoint: point,
      uv: hit.uv.clone().set(data[2], data[3]),
    };
  }
  dispose() {
    this.disposed = true;
    this.version++;
    this.view.drawing.surfaceTextures.delete(this);
    this.mark.surfaceTexture = undefined;
    this.mark.childTextureNode = undefined;
    for (const e of this.materials.values()) e.material.dispose();
    const frames = [...this.frames, ...(this.pending?.frames ?? [])];
    this.pending = null;
    this.frames = [];
    this.retire(frames);
  }
}
