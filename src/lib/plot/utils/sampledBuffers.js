import { scaleTransformWgsl, transformCode, DEFAULT_TRANSFORM_CONSTANT } from "./scaleTransforms.js";
import {refinesPieces} from "./curves.js";
import { TimeSeriesSampling } from "./timeSeriesSampling.js";
import { PathMetadata } from "./pathMetadata.js";
import { spherical } from "./coordinates.js";
import { markBinding } from "./markBinding.js";
import { pathSamplingShader } from "./pathSampling.js";
import { StorageBufferAttribute } from "three/webgpu";
import {
  storage,
  uniform,
  instanceIndex,
  vec2,
  vec3,
  vec4,
  float,
  uint,
} from "three/tsl";
import { releaseAttribute } from "../../threeExtensions/array/attributeRelease.js";
import { Reservoir, instanceLimit } from "./sampling.js";
import { limitError } from "./limits.js";

/** The component a mark is, named in its errors. */
const markName = (mark) =>
  mark.componentName ?? mark.constructor?.componentName ?? "Plot";

/**
 * The packed storage binding, named: three names an unnamed buffer NodeBuffer_<node id>, so
 * every mark (every facet cell) would compile its own copy of the same shader (TODO 17.6).
 */
const sampledNode = (buffer, count) => storage(buffer, "float", count).setName("hmSampledRows");

/**
 * The world x of a uniform-x Line's first and last rows: its own x extent (namedMark keeps the
 * extents its automatic domains are read from) placed by the axis bounds, which are padded past
 * it. Without one (an explicit domain), the rows span the bounds' world range.
 */
function rowSpan(range, bounds, extent) {
  if (!extent || extent.empty || !bounds || !(bounds[1] - bounds[0]) || !(extent[1] > extent[0])) return range;
  const at = (x) => range[0] + ((x - bounds[0]) / (bounds[1] - bounds[0])) * (range[1] - range[0]);
  return [at(extent[0]), at(extent[1])];
}

// One packed storage binding supplements the original vertex attributes. Drawing
// with sampling disabled keeps their existing fast path and original identities.
export class SampledBuffers {
  constructor(mark) {
    this.mark = mark;
    this.enabled = uniform(0, "uint");
    this.stride = uniform(1, "uint");
    this.buffer = new StorageBufferAttribute(1, 1);
    this.node = sampledNode(this.buffer, 1);
    this.fields = new Map();
    this.rows = new Reservoir();
    this.capacity = 1;
    this.revision = "";
    this.offset = 1;
    this.resources = [];
  }
  field(name, channels, source) {
    let f = this.fields.get(name);
    if (!f) {
      // The offset is a uniform: fields are bound as their uploads finish, so a constant offset
      // would compile one shader per upload order (TODO 136.1: a filtered facet cell's Points
      // compiled its own pipeline).
      f = { offset: this.offset, channels, node: uniform(this.offset, "uint") };
      this.fields.set(name, f);
      this.offset += channels;
      this.stride.value = this.offset;
    }
    const base = instanceIndex.mul(this.stride).add(f.node),
      values = Array.from({ length: channels }, (_, i) =>
        this.node.element(base.add(i)),
      );
    const sampled =
      channels === 1
        ? values[0]
        : channels === 2
          ? vec2(...values)
          : channels === 3
            ? vec3(...values)
            : vec4(...values);
    return this.enabled.greaterThan(0).select(sampled, source);
  }
  get index() {
    return this.enabled
      .greaterThan(0)
      .select(
        this.node.element(instanceIndex.mul(this.stride)),
        float(instanceIndex),
      );
  }
  ensure(size) {
    if (size <= this.capacity) return;
    const old = this.buffer;
    this.capacity = 2 ** Math.ceil(Math.log2(size));
    const renderer = this.mark.renderer;
    const limit = renderer.backend.device.limits.maxStorageBufferBindingSize;
    if (this.capacity * 4 > limit)
      throw limitError("storage", {
        component: markName(this.mark),
        what: "its sample buffer",
        count: this.capacity * 4,
        limit,
        hint: "Lower maxInstances, or draw fewer rows.",
      });
    this.buffer = new StorageBufferAttribute(this.capacity, 1);
    // Use a fresh binding identity. Mutating node.value can leave a different
    // camera/picking bind group cached against the retired GPU buffer.
    this.node = sampledNode(this.buffer, this.capacity);
    for (const field of this.mark.fields.values()) field.rebind?.();
    this.mark.build();
    const queue = renderer.backend.device.queue;
    const release = () => releaseAttribute(renderer, old);
    // sampledRender can run between passes in a frame: submit open encoders
    // before retiring the old storage attribute.
    queueMicrotask(() => queue.onSubmittedWorkDone().then(release, release));

  }
  pipeline() {
    if (this.compute) return;
    const device = this.mark.renderer.backend.device;
    const shader = device.createShaderModule({
      code: `
   @group(0) @binding(0) var<storage,read> source:array<f32>;
   @group(0) @binding(1) var<storage,read> indices:array<u32>;
   @group(0) @binding(2) var<storage,read_write> dest:array<f32>;
   struct Params {count:u32,sourceStride:u32,channels:u32,destStride:u32,destOffset:u32,indexOffset:u32,pad0:u32,pad1:u32}
   @group(0) @binding(3) var<uniform> p:Params;
   @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.count){return;}let row=indices[p.indexOffset+i];for(var c=0u;c<p.channels;c++){dest[i*p.destStride+p.destOffset+c]=source[row*p.sourceStride+c];}dest[i*p.destStride]=f32(indices[i]);}
  `,
    });
    this.compute = device.createComputePipeline({
      layout: "auto",
      compute: { module: shader, entryPoint: "main" },
    });
  }
  prepare(limit) {
    if (refinesPieces(this.mark)) return () => {};
    if (this.rendering) return () => {};
    const mark = this.mark,
      renderer = mark.renderer,
      device = renderer.backend.device;
    const logicalCount =
      mark.isConnectedPath && mark.surface
        ? Math.floor(mark.count / 64)
        : mark.count;
    const adaptive =
      mark.isConnectedPath &&
      !mark.surface &&
      limit == null &&
      mark.options.get("sampling") === "uniform-x";
    const camera = mark.view?.navigation.controls.current?.object;
    const width = renderer.domElement.clientWidth || 1;
    const pixelCount = camera?.userData.plotRect?.width ?? width;
    let first = 0,
      last = logicalCount;
    if (adaptive && camera?.isOrthographicCamera) {
      const range = mark.options.get("xrange"),
        rect = camera.userData.plotRect ?? { left: 0, right: width };
      const lo =
        camera.position.x +
        camera.left +
        (rect.left / width) * (camera.right - camera.left);
      const hi =
        camera.position.x +
        camera.left +
        (rect.right / width) * (camera.right - camera.left);
      const [from, to] = rowSpan(range, mark.options.get("xbounds"), markBinding(mark)?.extents?.x);
      const indices = [lo, hi]
        .map((v) => ((v - from) / (to - from)) * logicalCount)
        .sort((a, b) => a - b);
      first = Math.max(
        0,
        Math.min(logicalCount - 1, Math.floor(indices[0]) - 1),
      );
      last = Math.max(
        first + 1,
        Math.min(logicalCount, Math.ceil(indices[1]) + 1),
      );
    }
    const cap = Math.min(
      adaptive
        ? Math.max(3, Math.min(last - first, Math.ceil(pixelCount) * 2 + 1))
        : Infinity,
      instanceLimit(limit),
      instanceLimit(mark.options.get("maxInstances")),
    );
    if (logicalCount <= cap || !this.fields.size) {
      this.enabled.value = 0;
      return () => {};
    }
    const subdivisions = mark.isConnectedPath && mark.surface ? 64 : 1,
      k = Math.floor(cap);
    const q = (mark.isConnectedPath || mark.band)
      ? [
          0,
          ...this.rows
            .sample(Math.max(0, logicalCount - 1), Math.max(0, k - 1))
            .map((i) => i + 1),
          logicalCount,
        ]
      : this.rows.sample(logicalCount, k);
    const count = k * subdivisions;
    const active = [...this.fields].filter(
      ([name]) => mark.fields.get(name)?.isBufferNode,
    );
    const key = JSON.stringify([
      k,
      first,
      last,
      adaptive,
      logicalCount,
      subdivisions,
      active.map(([name]) => [name, mark.fields.get(name).version, mark.fields.get(name).animationVersion]),
      mark.progress?.value,
      mark.options.get("xTransform"),
      mark.options.get("yTransform"),
      mark.options.get("zTransform"),
      ..."xyz".split("").map((axis) => mark.options.get(axis + "TransformConstant")),
      mark.options.get("xbounds"),
      mark.options.get("ybounds"),
      mark.options.get("zbounds"),
      mark.options.get("xrange"),
      mark.options.get("yrange"),
      mark.options.get("zrange"),
    ]);
    if (this.revision !== key) {
      this.pipeline();
      this.ensure(count * this.stride.value);
      if (!renderer.backend.get(this.buffer).buffer)
        renderer.backend.createStorageAttribute(this.buffer);
      const indexValues = new Uint32Array(count * (active.length + 1));
      for (let i = 0; i < count; i++)
        indexValues[i] = (mark.isConnectedPath || mark.band)
          ? q[Math.floor(i / subdivisions)] * subdivisions + (i % subdivisions)
          : q[i];
      active.forEach(([name], field) => {
        for (let i = 0; i < count; i++) {
          const j = Math.floor(i / subdivisions);
          let row = indexValues[i];
          if (mark.isConnectedPath || mark.band) {
            if (name === "end") row = q[j + 1] * subdivisions - 1;
            else if (name === "previous")
              row = q[mark.band ? j : Math.max(0, j - 1)] * subdivisions;
            else if (name === "next")
              row = q[Math.min(k, j + (mark.band ? 1 : 2))] * subdivisions - 1;
          }
          indexValues[(field + 1) * count + i] = row;
        }
      });
      if (!this.indices || this.indices.size < indexValues.byteLength) {
        this.indices?.destroy();
        this.indices = device.createBuffer({
          size: Math.max(4, 2 ** Math.ceil(Math.log2(indexValues.byteLength))),
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
      }
      device.queue.writeBuffer(this.indices, 0, indexValues);
      if (adaptive) {
        this.timeSeries ??= new TimeSeriesSampling(device, markName(mark));
        const src = mark.fields.get("start").buffer;
        this.timeSeries.prepare(
          renderer.backend.get(src).buffer,
          this.indices,
          logicalCount,
          src.itemSize,
          count,
          active,
          first,
          last,
        );
      } else if (mark.isConnectedPath || mark.band)
        this.connectedIndices(count, k, subdivisions, logicalCount, active);
      const encoder = device.createCommandEncoder();
      active.forEach(([name, layout], i) => {
        const field = mark.fields.get(name),
          src = renderer.backend.get(field.buffer).buffer;
        if (!src) return;
        let params = this.resources[i];
        if (!params) {
          params = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
          this.resources[i] = params;
        }
        device.queue.writeBuffer(
          params,
          0,
          new Uint32Array([
            count,
            field.buffer.itemSize,
            layout.channels,
            this.stride.value,
            layout.offset,
            (i + 1) * count,
            0,
            0,
          ]),
        );
        const group = device.createBindGroup({
          layout: this.compute.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: src } },
            { binding: 1, resource: { buffer: this.indices } },
            {
              binding: 2,
              resource: { buffer: renderer.backend.get(this.buffer).buffer },
            },
            { binding: 3, resource: { buffer: params } },
          ],
        });
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.compute);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(Math.ceil(count / 64));
        pass.end();
      });
      device.queue.submit([encoder.finish()]);
      if (mark.isConnectedPath)
        this.rebuildPath(count, subdivisions, logicalCount);
      this.revision = key;
    }
    const old = mark.count,
      progress = mark.progress?.value;
    this.rendering = true;
    this.enabled.value = 1;
    mark.count = count;
    if (mark.surface && mark.progress) mark.progress.value = 1;
    return () => {
      this.rendering = false;
      this.enabled.value = 0;
      mark.count = old;
      if (mark.progress) mark.progress.value = progress;
    };
  }
  connectedIndices(count, k, subdivisions, total, active) {
    const renderer = this.mark.renderer,
      device = renderer.backend.device;
    if (!this.indexPipeline) {
      this.indexPipeline = device.createComputePipeline({
        layout: "auto",
        compute: {
          module: device.createShaderModule({ code: pathSamplingShader }),
          entryPoint: "main",
        },
      });
      this.indexParams = device.createBuffer({
        // pathSamplingShader.Params has sixteen scalars (64 bytes). The
        // previous 48-byte allocation only covered the fields written below
        // and failed bind-group validation on stricter WebGPU backends.
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    if (!this.scratch || this.scratch.size < (k + 1) * 8) {
      this.scratch?.destroy();
      this.scratch = device.createBuffer({
        size: 2 ** Math.ceil(Math.log2((k + 1) * 8)),
        usage: GPUBufferUsage.STORAGE,
      });
    }
    const src = this.mark.fields.get("start").buffer,
      end = this.mark.fields.get("end").buffer;
    device.queue.writeBuffer(
      this.indexParams,
      0,
      new Uint32Array([
        count,
        k,
        subdivisions,
        total,
        src.itemSize,
        active.length,
        ...["start", "end", "previous", "next"].map((n) =>
          active.findIndex(([name]) => name === n),
        ),
        0,
        this.mark.band ? 1 : 0,
      ]),
    );
    this.metadata ??= new PathMetadata(device, markName(this.mark));
    const metadata = this.metadata.build(
      renderer.backend.get(src).buffer,
      renderer.backend.get(end).buffer,
      total,
      src.itemSize,
      subdivisions,
    );
    const buffers = [
      renderer.backend.get(src).buffer,
      renderer.backend.get(end).buffer,
      this.indices,
      this.scratch,
      this.indexParams,
      metadata.prefix,
      metadata.paths,
    ];
    const group = device.createBindGroup({
      layout: this.indexPipeline.getBindGroupLayout(0),
      entries: buffers
        .map((buffer, binding) => ({
          binding,
          resource: { buffer },
        }))
        .filter((e) => e.binding >= 2),
    });
    const enc = device.createCommandEncoder(),
      pass = enc.beginComputePass();
    pass.setPipeline(this.indexPipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(1);
    pass.end();
    device.queue.submit([enc.finish()]);
  }
  rebuildPath(count, subdivisions, logicalCount) {
    const mark = this.mark,
      renderer = mark.renderer,
      device = renderer.backend.device;
    const start = this.fields.get("start"),
      end = this.fields.get("end"),
      distance = this.fields.get("distance"),
      next = this.fields.get("next");
    if (!start || !end || !distance) return;
    // A short scan over the bounded simplified path rebuilds cumulative dash
    // distances; positions stay on the GPU. Invalid source intervals remain gaps.
    if (!this.pathPipeline) {
      const shader = device.createShaderModule({
        code: `
   @group(0) @binding(0) var<storage,read_write> data:array<f32>;
   @group(0) @binding(1) var<storage,read> indices:array<u32>;
   @group(0) @binding(2) var<storage,read> starts:array<f32>;
   @group(0) @binding(3) var<storage,read> ends:array<f32>;
   struct Params {count:u32,stride:u32,start:u32,end:u32,distance:u32,next:u32,sourceStride:u32,subdivisions:u32,total:u32,progress:f32,endIndices:u32,pad1:u32,bounds:array<vec4f,3>,kind:vec4u,constant:vec4f}
   @group(0) @binding(4) var<uniform> p:Params;
   ${scaleTransformWgsl("path")}
   fn transformed(x:f32,axis:u32)->f32 {let b=p.bounds[axis];let k=p.kind[axis];let c=p.constant[axis];let v=pathForward(x,k,c);let lo=pathForward(b.x,k,c);let hi=pathForward(b.y,k,c);return b.z+(v-lo)/(hi-lo)*(b.w-b.z);}
   fn inside(x:f32,axis:u32)->bool {return pathValid(x,p.kind[axis]);}
   @compute @workgroup_size(1) fn main(){var sum=0.;for(var i=0u;i<p.count;i+=p.subdivisions){let base=i*p.stride;let sourceStart=indices[i];var valid=sourceStart!=0xffffffffu;
    if(i>0u){var same=true;for(var a=0u;a<min(3u,p.sourceStride);a++){same=same&&data[base+p.start+a]==data[(i-p.subdivisions)*p.stride+p.end+a];}if(!same){sum=0.;}}
    if(indices[p.endIndices+i]==p.total*p.subdivisions-1u&&p.progress<1.){for(var a=0u;a<min(3u,p.sourceStride);a++){let last=(p.total*p.subdivisions-1u)*p.sourceStride;let v=mix(starts[last+a],ends[last+a],p.progress);for(var j=0u;j<p.subdivisions;j++){data[(i+j)*p.stride+p.end+a]=v;data[(i+j)*p.stride+p.next+a]=v;}if(i>=p.subdivisions){for(var j=0u;j<p.subdivisions;j++){data[(i-p.subdivisions+j)*p.stride+p.next+a]=v;}}}}
    var d=0.;for(var a=0u;a<min(3u,p.sourceStride);a++){let e=data[base+p.end+a];let s=data[base+p.start+a];valid=valid&&inside(e,a)&&inside(s,a);let delta=transformed(e,a)-transformed(s,a);d+=delta*delta;}
    for(var j=0u;j<p.subdivisions;j++){data[(i+j)*p.stride+p.distance]=sum;if(!valid){for(var a=0u;a<min(3u,p.sourceStride);a++){data[(i+j)*p.stride+p.end+a]=data[(i+j)*p.stride+p.start+a];}}}
    if(valid){sum+=sqrt(d);}else{sum=0.;}
   }}
  `,
      });
      this.pathPipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module: shader, entryPoint: "main" },
      });
      this.pathParams = device.createBuffer({
        size: 128,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    const src = mark.fields.get("start").buffer,
      ends = mark.fields.get("end").buffer,
      bytes = new ArrayBuffer(128),
      u = new Uint32Array(bytes),
      f = new Float32Array(bytes);
    u.set([
      count,
      this.stride.value,
      start.offset,
      end.offset,
      distance.offset,
      next?.offset ?? end.offset,
      src.itemSize,
      subdivisions,
      logicalCount,
    ]);
    u[10] =
      ([...this.fields]
        .filter(([name]) => mark.fields.get(name)?.isBufferNode)
        .findIndex(([name]) => name === "end") +
        1) *
      count;
    f[9] = mark.surface ? (mark.progress?.value ?? 1) : 1;
    for (let a = 0; a < 3; a++) {
      const axis = "xyz"[a],
        bounds = mark.options.get(axis + "bounds") ?? [-1, 1],
        range = mark.options.get(axis + "range") ?? [-50, 50];
      f.set([...bounds, ...range], 12 + a * 4);
      u[24 + a] = transformCode(mark.options.get(axis + "Transform"));
      f[28 + a] = mark.options.get(axis + "TransformConstant") ?? DEFAULT_TRANSFORM_CONSTANT;
    }
    device.queue.writeBuffer(this.pathParams, 0, bytes);
    const group = device.createBindGroup({
      layout: this.pathPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: renderer.backend.get(this.buffer).buffer },
        },
        { binding: 1, resource: { buffer: this.indices } },
        { binding: 2, resource: { buffer: renderer.backend.get(src).buffer } },
        { binding: 3, resource: { buffer: renderer.backend.get(ends).buffer } },
        { binding: 4, resource: { buffer: this.pathParams } },
      ],
    });
    const enc = device.createCommandEncoder(),
      pass = enc.beginComputePass();
    pass.setPipeline(this.pathPipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(1);
    pass.end();
    device.queue.submit([enc.finish()]);
  }
  dispose() {
    this.metadata?.dispose();
    this.timeSeries?.dispose();
    releaseAttribute(this.mark.renderer, this.buffer);
    this.indices?.destroy();
    this.resources.forEach((x) => x.destroy());
    this.pathParams?.destroy();
    this.indexParams?.destroy();
    this.scratch?.destroy();
  }
}
export function sampledRender(scene, limit, render) {
  const restore = [];
  try {
    scene.traverse((o) => {
      if (o.visible && o.sampling && !o.isDisposed)
        restore.push(o.sampling.prepare(limit));
    });
    return render();
  } finally {
    for (const fn of restore.reverse()) fn();
  }
}
