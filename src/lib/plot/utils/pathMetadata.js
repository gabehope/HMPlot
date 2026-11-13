// @ts-check
import { limitError } from "./limits.js";
/**
 * A cached GPU plan for path membership and visible-row prefixes. The owner keeps
 * its buffers until the queue finishes; build() borrows endpoint buffers. Planning
 * records passes explicitly, and value-only updates replay the same allocation graph.
 * @typedef {{pipeline: GPUComputePipeline, buffers: GPUBuffer[], groups: number}} ScanPass
 * @typedef {{prefix: GPUBuffer, paths: GPUBuffer}} PathIndexBuffers
 */
// Parallel path detection. Each serial scan is bounded to 256 values; the
// hierarchy is scanned recursively. Only index metadata is duplicated.
export class PathMetadata {
  /** @param {GPUDevice} device @param {string} [component] the mark, named in errors */
  constructor(device, component = "Line") {
    this.device = device;
    this.component = component;
    /** @type {GPUBuffer[]} */
    this.buffers = [];
    /** @type {Map<string, GPUComputePipeline>} */
    this.pipelines = new Map();
    /** @type {string | undefined} */
    this.key = undefined;
    /** @type {((start: GPUBuffer, end: GPUBuffer) => void) | null} */
    this.commands = null;
    /** @type {PathIndexBuffers | undefined} */
    this.result = undefined;
  }
  /** @param {string} code @param {string} [entryPoint] */
  pipeline(code, entryPoint = "main") {
    const key = entryPoint + code;
    let pipeline = this.pipelines.get(key);
    if (!pipeline) {
      pipeline = this.device.createComputePipeline({
        layout: "auto",
        compute: {
          module: this.device.createShaderModule({ code }),
          entryPoint,
        },
      });
      this.pipelines.set(key, pipeline);
    }
    return pipeline;
  }
  /** @param {number} size */
  buffer(size) {
    const b = this.device.createBuffer({
      size: Math.max(16, size),
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.UNIFORM |
        GPUBufferUsage.COPY_DST,
    });
    this.buffers.push(b);
    return b;
  }
  /**
   * @param {GPUCommandEncoder} encoder
   * @param {GPUComputePipeline} pipeline
   * @param {GPUBuffer[]} buffers
   * @param {number} groups
   */
  dispatch(encoder, pipeline, buffers, groups) {
    const p = encoder.beginComputePass();
    p.setPipeline(pipeline);
    p.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: buffers.map((buffer, binding) => ({
          binding,
          resource: { buffer },
        })),
      }),
    );
    p.dispatchWorkgroups(groups);
    p.end();
  }
  /**
   * Append the scan hierarchy in execution order; return its owned output buffer.
   * No commands run while planning. All passes borrow this owner's buffers.
   * @param {GPUBuffer} input
   * @param {number} n
   * @param {ScanPass[]} passes
   * @returns {GPUBuffer}
   */
  planScan(input, n, passes) {
    const groups = Math.ceil(n / 256),
      output = this.buffer(n * 8),
      sums = this.buffer(groups * 8),
      params = this.buffer(16);
    this.device.queue.writeBuffer(params, 0, new Uint32Array([n, 0, 0, 0]));
    const code = `@group(0) @binding(0) var<storage,read> input:array<vec2u>; @group(0) @binding(1) var<storage,read_write> output:array<vec2u>; @group(0) @binding(2) var<storage,read_write> sums:array<vec2u>; @group(0) @binding(3) var<uniform> p:vec4u;
    @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id:vec3u){let begin=id.x*256u; var sum=vec2u(0); for(var i=begin;i<min(begin+256u,p.x);i++){sum+=input[i];output[i]=sum;}sums[id.x]=sum;}`;
    passes.push({
      pipeline: this.pipeline(code),
      buffers: [input, output, sums, params],
      groups,
    });
    if (groups > 1) {
      const prefixes = this.planScan(sums, groups, passes);
      const add = `@group(0) @binding(0) var<storage,read_write> output:array<vec2u>; @group(0) @binding(1) var<storage,read> sums:array<vec2u>; @group(0) @binding(2) var<uniform> p:vec4u; @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.x){return;}let block=i/256u;if(block>0u){output[i]+=sums[block-1u];}}`;
      passes.push({
        pipeline: this.pipeline(add),
        buffers: [output, prefixes, params],
        groups: Math.ceil(n / 64),
      });
    }
    return output;
  }
  /**
   * @param {GPUBuffer} starts
   * @param {GPUBuffer} ends
   * @param {number} n
   * @param {number} stride
   * @param {number} subdivisions
   * @returns {PathIndexBuffers}
   */
  build(starts, ends, n, stride, subdivisions) {
    // Reuse the same allocation graph for value-only updates.
    const key = [n, stride, subdivisions].join();
    if (this.key === key && this.commands && this.result) {
      this.commands(starts, ends);
      return this.result;
    }
    this.disposeBuffers();
    this.key = key;
    if (n * 16 > this.device.limits.maxStorageBufferBindingSize)
      throw limitError("storage", {
        component: this.component,
        what: "its path index",
        count: n * 16,
        limit: this.device.limits.maxStorageBufferBindingSize,
      });
    const flags = this.buffer(n * 8),
      params = this.buffer(16);
    this.device.queue.writeBuffer(
      params,
      0,
      new Uint32Array([n, stride, subdivisions, 0]),
    );
    const common = `@group(0) @binding(0) var<storage,read> starts:array<f32>; @group(0) @binding(1) var<storage,read> ends:array<f32>; @group(0) @binding(2) var<uniform> p:vec4u;
    fn valid(i:u32)->bool{for(var a=0u;a<min(3u,p.y);a++){let j=i*p.z*p.y+a;if(!(abs(starts[j])<3.4e38&&abs(ends[j])<3.4e38)){return false;}}return true;}`;
    const classify = this.pipeline(
      common +
        `@group(0) @binding(3) var<storage,read_write> flags:array<vec2u>; @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.x){return;}let ok=valid(i);var begin=i==0u;if(i>0u){begin=!valid(i-1u);}flags[i]=vec2u(u32(ok&&begin),u32(ok));}`,
    );
    // Record the scan dispatches once, replay their bindings into fresh encoders.
    /** @type {ScanPass[]} */
    const passes = [];
    const prefix = this.planScan(flags, n, passes);
    const paths = this.buffer(n * 16);
    const pack = this.pipeline(
      common +
        `@group(0) @binding(3) var<storage,read> prefix:array<vec2u>; @group(0) @binding(4) var<storage,read_write> paths:array<u32>; @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.x||!valid(i)){return;}let idPath=prefix[i].x-1u;var begin=i==0u;var end=i+1u==p.x;if(i>0u){begin=!valid(i-1u);}if(i+1u<p.x){end=!valid(i+1u);}if(begin){paths[idPath*4u]=i;paths[idPath*4u+2u]=prefix[i].y-1u;}if(end){paths[idPath*4u+1u]=i+1u;}}`,
    );
    this.commands = (start, end) => {
      const enc = this.device.createCommandEncoder();
      this.dispatch(
        enc,
        classify,
        [start, end, params, flags],
        Math.ceil(n / 64),
      );
      for (const pass of passes)
        this.dispatch(enc, pass.pipeline, pass.buffers, pass.groups);
      this.dispatch(
        enc,
        pack,
        [start, end, params, prefix, paths],
        Math.ceil(n / 64),
      );
      this.device.queue.submit([enc.finish()]);
    };
    this.result = { prefix, paths };
    this.commands(starts, ends);
    return this.result;
  }
  disposeBuffers() {
    const old = this.buffers;
    this.buffers = [];
    this.device.queue
      .onSubmittedWorkDone()
      .then(() => old.forEach((b) => b.destroy()));
  }
  dispose() {
    this.disposeBuffers();
    this.commands = null;
    this.pipelines.clear();
  }
}
