import { getWebGPUDevice } from "@hmplot/jax";
import { initializePlot } from "../../src/lib/jaxExtensions/setup.js";
import { PathMetadata } from "../../src/lib/plot/utils/pathMetadata.js";
import { TimeSeriesSampling } from "../../src/lib/plot/utils/timeSeriesSampling.js";
export async function reductions() {
  await initializePlot();
  const d = getWebGPUDevice(),
    buffers = [];
  d.pushErrorScope("validation");
  const create = (data) => {
    const b = d.createBuffer({
      size: Math.max(16, data.byteLength),
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
    d.queue.writeBuffer(b, 0, data);
    buffers.push(b);
    return b;
  };
  const read = async (buffer, size) => {
    const staging = d.createBuffer({
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    try {
      const e = d.createCommandEncoder();
      e.copyBufferToBuffer(buffer, 0, staging, 0, size);
      d.queue.submit([e.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      return [...new Uint32Array(staging.getMappedRange()).slice()];
    } finally {
      if (staging.mapState === "mapped") staging.unmap();
      staging.destroy();
    }
  };
  const meta = new PathMetadata(d),
    reducer = new TimeSeriesSampling(d);
  try {
    const n = 600,
      start = new Float32Array(n * 2),
      end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      start[2 * i] = i;
      end[2 * i] = i + 1;
    }
    start[200 * 2] = NaN;
    start[401 * 2] = NaN;
    const result = meta.build(create(start), create(end), n, 2, 1);
    // Copy test-only metadata through a GPU storage pass; production never reads it.
    const out = create(new Uint32Array(14));
    const module = d.createShaderModule({
      code: `@group(0) @binding(0) var<storage,read> prefix:array<vec2u>;@group(0) @binding(1) var<storage,read> paths:array<vec4u>;@group(0) @binding(2) var<storage,read_write> out:array<u32>;@compute @workgroup_size(1) fn main(){out[0]=prefix[599].x;out[1]=prefix[599].y;for(var i=0u;i<3u;i++){out[2u+i*4u]=paths[i].x;out[3u+i*4u]=paths[i].y;out[4u+i*4u]=paths[i].z;out[5u+i*4u]=0u;}}`,
    });
    const pipeline = d.createComputePipeline({
        layout: "auto",
        compute: { module, entryPoint: "main" },
      }),
      enc = d.createCommandEncoder(),
      pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      d.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [result.prefix, result.paths, out].map((buffer, binding) => ({
          binding,
          resource: { buffer },
        })),
      }),
    );
    pass.dispatchWorkgroups(1);
    pass.end();
    d.queue.submit([enc.finish()]);
    const metadata = await read(out, 56);
    const values = new Float32Array(1024 * 2);
    for (let i = 0; i < 1024; i++) {
      values[i * 2] = i;
      values[i * 2 + 1] = Math.sin(i * 0.03);
    }
    values[300 * 2 + 1] = 10;
    values[301 * 2 + 1] = -10;
    const indices = create(new Uint32Array(17 * 5));
    reducer.prepare(
      create(values),
      indices,
      1024,
      2,
      17,
      [["start"], ["end"], ["previous"], ["next"]],
      0,
      1024,
    );
    const rows = await read(indices, 17 * 5 * 4);
    return {
      metadata,
      rows,
      error: (await d.popErrorScope())?.message ?? null,
    };
  } finally {
    await d.queue.onSubmittedWorkDone();
    meta.dispose();
    reducer.dispose();
    buffers.forEach((b) => b.destroy());
  }
}
