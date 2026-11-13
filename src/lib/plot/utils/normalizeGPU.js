// Bounded reductions over the displayed raw values. No CPU tensor readbacks.
export class NormalizeGPU {
  constructor(device) {
    this.device = device;
    this.buffers = [];
    this.pipelines = new Map();
  }
  pipe(kind) {
    if (this.pipelines.has(kind)) return this.pipelines.get(kind);
    const code =
      kind === "apply"
        ? `
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read> bounds:array<vec2f>;
@group(0) @binding(2) var<storage,read_write> output:array<f32>;
struct P{n:u32,mode:u32,pad:vec2u} @group(0) @binding(3) var<uniform> p:P;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.n){return;}let b=bounds[0];if(p.mode==2u){output[i]=input[i]/max(max(abs(b.x),abs(b.y)),1e-8);}else{output[i]=clamp((input[i]-b.x)/(b.y-b.x+1e-8),0.,1.);}}
`
        : `
@group(0) @binding(0) var<storage,read> input:array<${kind === "first" ? "f32" : "vec2f"}>;
@group(0) @binding(1) var<storage,read_write> output:array<vec2f>;
struct P{n:u32,pad:vec3u} @group(0) @binding(2) var<uniform> p:P;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let start=id.x*256u;if(start>=p.n){return;}var lo=3.402823e38;var hi=-3.402823e38;for(var i=start;i<min(start+256u,p.n);i++){let v=input[i];${kind === "first" ? "lo=min(lo,v);hi=max(hi,v);" : "lo=min(lo,v.x);hi=max(hi,v.y);"}}output[id.x]=vec2f(lo,hi);}`;
    const pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: this.device.createShaderModule({ code }),
        entryPoint: "main",
      },
    });
    this.pipelines.set(kind, pipeline);
    return pipeline;
  }
  buffer(bytes) {
    const b = this.device.createBuffer({
      size: Math.max(32, bytes),
      usage:
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.UNIFORM |
        GPUBufferUsage.COPY_DST,
    });
    this.buffers.push(b);
    return b;
  }
  prepare(count) {
    if (this.count === count) return;
    this.release();
    this.count = count;
    this.levels = [];
    let n = count;
    do {
      const size = Math.ceil(n / 256);
      this.levels.push({
        n,
        size,
        out: this.buffer(size * 8),
        params: this.buffer(32),
      });
      n = size;
    } while (n > 1);
    this.params = this.buffer(16);
  }
  run(input, output, count, mode) {
    this.prepare(count);
    const d = this.device,
      enc = d.createCommandEncoder();
    let src = input;
    this.levels.forEach((level, i) => {
      const p = this.pipe(i ? "reduce" : "first");
      d.queue.writeBuffer(
        level.params,
        0,
        new Uint32Array([level.n, 0, 0, 0, 0, 0, 0, 0]),
      );
      const bind = d.createBindGroup({
        layout: p.getBindGroupLayout(0),
        entries: [src, level.out, level.params].map((buffer, binding) => ({
          binding,
          resource: { buffer },
        })),
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(p);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.ceil(level.size / 64));
      pass.end();
      src = level.out;
    });
    const p = this.pipe("apply");
    d.queue.writeBuffer(
      this.params,
      0,
      new Uint32Array([count, mode === "symmetric" ? 2 : 1, 0, 0]),
    );
    const bind = d.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: [input, src, output, this.params].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
    const pass = enc.beginComputePass();
    pass.setPipeline(p);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(count / 256));
    pass.end();
    d.queue.submit([enc.finish()]);
  }
  release() {
    const old = this.buffers.splice(0);
    this.device.queue
      .onSubmittedWorkDone()
      .then(() => old.forEach((b) => b.destroy()));
  }
  dispose() {
    this.release();
  }
}
