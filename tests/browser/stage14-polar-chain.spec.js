import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

async function point(page) {
  return page.evaluate(async () => {
    const plot = window.stage14PolarChain.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    // Source picks and the geometry assertions use the fixture's 400 CSS-pixel frame.
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let x = 0, y = 0, count = 0;
    for (let row = 0; row < canvas.height; row++) for (let column = 0; column < canvas.width; column++) {
      const i = (row * canvas.width + column) * 4,
        r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (b > 120 && b > 1.8 * r && b > 1.2 * g) {
        x += column; y += row; count++;
      }
    }
    const root = document.querySelector("section.plot").getBoundingClientRect(),
      surface = document.querySelector("section.plot .canvas").getBoundingClientRect(),
      scale = canvas.width / root.width;
    return { x: x / count, y: y / count, count, error: plot.getRenderError(),
      scale, offset: [(surface.left - root.left) * scale, (surface.top - root.top) * scale] };
  });
}

test("polar points compose through a three-level sqrt/log Cartesian chain", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/stage14-polar-chain");
  await page.waitForFunction(() => window.stage14PolarChain?.disk?.getFrameOptions());
  const first = await point(page);
  expect(first.error).toBe("");
  expect(first.count).toBeGreaterThan(20);
  expect(first.x).toBeGreaterThan(235);
  expect(first.x).toBeLessThan(340);
  expect(first.y).toBeGreaterThan(225);
  expect(first.y).toBeLessThan(330);
  const canvas = page.locator("canvas").first(), bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + (first.x - first.offset[0]) / first.scale,
    bounds.y + (first.y - first.offset[1]) / first.scale);
  await expect.poll(() => page.evaluate(() =>
    Math.abs((window.stage14PolarChain.lastPick?.axisValue?.x ?? Infinity) - 6))).toBeLessThan(0.05);
  const picked = await page.evaluate(() => window.stage14PolarChain.lastPick.axisValue);
  expect(Math.abs(picked.y - 1)).toBeLessThan(0.05);

  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14PolarChain.move(8));
  await expect.poll(() => page.evaluate(() =>
    window.stage14PolarChain.chart.getFrameOptions().get("_frameXRange")?.[1])).toBe(8);
  const moved = await point(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys,
      existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter(key => !existing.has(key)).length;
  }, before.renderKeys);
  expect(moved.error).toBe("");
  expect(moved.count).toBeGreaterThan(20);
  expect(moved.x).toBeLessThan(first.x - 50);
  expect(Math.abs(moved.y - first.y)).toBeLessThan(8);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

test("live WGSL gather matches the CPU operation chain through three nested frames", async ({ page }) => {
  await page.goto("/test/stage14-mixed-chain");
  await page.waitForFunction(() => window.stage14MixedChain?.disk?.getFrameOptions());
  const result = await page.evaluate(async () => {
    const { resolveCoordinateOperations } = await import("/src/lib/plot/utils/coordinateOperations.js");
    const { framePoint } = await import("/src/lib/plot/utils/framePlacement.js");
    const { GATHER_VERTEX_SOURCE, VERTEX_PARAMS_BYTES, packVertexParams, vertexReference } =
      await import("/src/lib/plot/utils/connectionGather.js");
    const options = window.stage14MixedChain.disk.getFrameOptions();
    const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
    const samples = [[0, 1, 0], [6, 1, 0], [12, 0.5, 0]];
    const input = new Float32Array(samples.flatMap((row) => [...row, 0]));
    const indices = Int32Array.from([0, 1, 2]);
    const readback = async () => {
      const operations = resolveCoordinateOperations(options, { includePlacement: false });
      const packed = packVertexParams({ rows: 3, operations,
        fields: [{ stride: 4, components: 3, weights: [1, 1, 1] }] });
      const expected = vertexReference(packed, { src0: input, rows: indices }, new Float32Array(24));
      const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
      const source = device.createBuffer({ size: input.byteLength, usage: storage });
      const rows = device.createBuffer({ size: indices.byteLength + 4, usage: storage });
      const dummy = device.createBuffer({ size: 16, usage: storage });
      const output = device.createBuffer({ size: 96, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const uniform = device.createBuffer({ size: VERTEX_PARAMS_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const download = device.createBuffer({ size: 96, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      device.queue.writeBuffer(source, 0, input);
      device.queue.writeBuffer(rows, 0, indices);
      device.queue.writeBuffer(uniform, 0, packed);
      const types = ["read-only-storage", "read-only-storage", "read-only-storage", "read-only-storage",
        "read-only-storage", "read-only-storage", "storage", "uniform"];
      const layout = device.createBindGroupLayout({ entries: types.map((type, binding) =>
        ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })) });
      const pipeline = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module: device.createShaderModule({ code: GATHER_VERTEX_SOURCE }), entryPoint: "vertex" } });
      const buffers = [source, dummy, dummy, dummy, dummy, rows, output, uniform];
      const group = device.createBindGroup({ layout, entries: buffers.map((buffer, binding) =>
        ({ binding, resource: { buffer } })) });
      const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(1); pass.end();
      encoder.copyBufferToBuffer(output, 0, download, 0, 96);
      device.queue.submit([encoder.finish()]);
      await download.mapAsync(GPUMapMode.READ);
      const actual = Array.from(new Float32Array(download.getMappedRange().slice(0)));
      download.unmap();
      [source, rows, dummy, output, uniform, download].forEach((buffer) => buffer.destroy());
      return { expected: Array.from(expected), actual,
        cpu: samples.map((sample) => framePoint(options, sample)),
        kinds: operations.map((operation) => operation.kind) };
    };
    const state = await readback();
    device.destroy();
    return state;
  });
  expect(result.kinds).toContain("polar");
  expect(result.kinds).toContain("scale");
  expect(result.kinds).toContain("spherical-map2d");
  result.actual.forEach((value, index) => {
    if (index % 8 >= 3) return;
    expect(value).toBeCloseTo(result.expected[index], 3);
    expect(value).toBeCloseTo(result.cpu[Math.floor(index / 8)][index % 8], 3);
  });
});
