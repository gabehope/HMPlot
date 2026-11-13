import { limitError } from "./limits.js";

// A monotonic, uniformly spaced series can locate the visible interval without
// reading positions. Parallel 256-value reductions preserve peaks in each bin.
export class TimeSeriesSampling {
  /** @param {GPUDevice} device @param {string} [component] the mark, named in errors */
  constructor(device, component = "Line") {
    this.device = device;
    this.component = component;
    this.buffers = [];
  }
  create(size, usage = GPUBufferUsage.STORAGE) {
    const b = this.device.createBuffer({ size: Math.max(16, size), usage });
    this.buffers.push(b);
    return b;
  }
  pipeline(code) {
    return this.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: this.device.createShaderModule({ code }),
        entryPoint: "main",
      },
    });
  }
  run(encoder, pipeline, buffers, groups) {
    const p = encoder.beginComputePass();
    p.setPipeline(pipeline);
    p.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: buffers
          .map((buffer, binding) => ({ binding, resource: { buffer } }))
          .filter((e) => pipeline !== this.gather || e.binding !== 0),
      }),
    );
    p.dispatchWorkgroups(groups);
    p.end();
  }
  prepare(source, indices, total, stride, count, active, first, last) {
    const d = this.device,
      bins = Math.max(1, Math.floor((count - 1) / 2)),
      length = Math.max(1, last - first),
      chunks = Math.ceil(Math.ceil(length / bins) / 256);
    const size = bins * chunks * 16;
    if (size > d.limits.maxStorageBufferBindingSize)
      throw limitError("storage", {
        component: this.component,
        what: "its time-series reduction",
        count: size,
        limit: d.limits.maxStorageBufferBindingSize,
      });
    if (!this.scratch || this.scratch.size < size) {
      const old = this.scratch;
      this.scratch = this.create(2 ** Math.ceil(Math.log2(Math.max(16, size))));
      if (old) {
        this.buffers = this.buffers.filter((b) => b !== old);
        d.queue.onSubmittedWorkDone().then(() => old.destroy());
      }
    }
    if (!this.params)
      this.params = this.create(
        48,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      );
    d.queue.writeBuffer(
      this.params,
      0,
      new Uint32Array([
        total,
        stride,
        count,
        bins,
        first,
        last,
        chunks,
        active.length,
        ...["start", "end", "previous", "next"].map((n) =>
          active.findIndex(([name]) => name === n),
        ),
      ]),
    );
    const common = `struct Params {total:u32,stride:u32,count:u32,bins:u32,first:u32,last:u32,chunks:u32,fields:u32,start:u32,end:u32,previous:u32,next:u32} @group(0) @binding(0) var<storage,read> source:array<f32>; @group(0) @binding(1) var<uniform> p:Params;`;
    this.reduce ??= this.pipeline(
      common +
        `@group(0) @binding(2) var<storage,read_write> scratch:array<vec4f>;
      @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.bins*p.chunks){return;}let bin=i/p.chunks;let chunk=i%p.chunks;let a=p.first+(p.last-p.first)*bin/p.bins;let b=p.first+(p.last-p.first)*(bin+1u)/p.bins;let start=a+chunk*256u;var lo=3.4e38;var hi=-3.4e38;var il=a;var ih=a;for(var j=start;j<min(start+256u,b);j++){let v=source[min(j,p.total-1u)*p.stride+1u];if(v<lo){lo=v;il=j;}if(v>hi){hi=v;ih=j;}}scratch[i]=vec4f(lo,hi,f32(il),f32(ih));}`,
    );
    this.gather ??= this.pipeline(
      common +
        `@group(0) @binding(2) var<storage,read> scratch:array<vec4f>;@group(0) @binding(3) var<storage,read_write> indices:array<u32>;
      fn vertex(v:u32)->u32{if(v==0u){return p.first;}if(v>=p.bins*2u+1u){return min(p.last,p.total);}let bin=(v-1u)/2u;var lo=3.4e38;var hi=-3.4e38;var il=p.first;var ih=p.first;for(var c=0u;c<p.chunks;c++){let s=scratch[bin*p.chunks+c];if(s.x<lo){lo=s.x;il=u32(s.z);}if(s.y>hi){hi=s.y;ih=u32(s.w);}}return select(min(il,ih),max(il,ih),(v-1u)%2u==1u);}
      @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.count){return;}let a=vertex(i);let b=vertex(i+1u);indices[i]=min(a,p.total-1u);for(var f=0u;f<p.fields;f++){var row=min(a,p.total-1u);if(f==p.end){row=max(1u,b)-1u;}else if(f==p.previous){row=min(vertex(select(i-1u,0u,i==0u)),p.total-1u);}else if(f==p.next){row=max(1u,vertex(i+2u))-1u;}indices[(f+1u)*p.count+i]=row;}}`,
    );
    const enc = d.createCommandEncoder();
    this.run(
      enc,
      this.reduce,
      [source, this.params, this.scratch],
      Math.ceil((bins * chunks) / 64),
    );
    this.run(
      enc,
      this.gather,
      [source, this.params, this.scratch, indices],
      Math.ceil(count / 64),
    );
    d.queue.submit([enc.finish()]);
  }
  dispose() {
    const old = this.buffers;
    this.device.queue
      .onSubmittedWorkDone()
      .then(() => old.forEach((b) => b.destroy()));
    this.buffers = [];
  }
}
