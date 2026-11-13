import { test, expect } from "./fixtures.js";

// TODO 136.11 (135.2): curved paths refine in batches of 1,024 with a parallel scan, so a mark
// past 1,024 draws every path.
test("curved paths past 1,024 all draw", async ({ page }) => {
  await page.goto("/test/curved-path-batches");
  await page.waitForFunction(() => window.curvedPathBatches?.plot?.whenSettled);
  await page.locator("canvas").waitFor();
  const sample = () => page.evaluate(async () => {
    const plot = window.curvedPathBatches.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const { width, height } = canvas, pixels = context.getImageData(0, 0, width, height).data;
    let green = 0, lowGreen = 0, blueLeft = 0, blueRight = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const [r, g, b] = pixels.subarray(offset, offset + 4), x = (offset / 4) % width, y = Math.floor(offset / 4 / width);
      if (g > 110 && g > r * 1.5 && g > b * 1.2) { green++; if (y > height / 2) lowGreen++; }
      if (b > 150 && b > r * 1.6 && b > g * 1.1) {
        if (x < width / 4) blueLeft++;
        if (x > (width * 3) / 4) blueRight++;
      }
    }
    return { green, low: lowGreen / Math.max(1, green), blueLeft, blueRight, error: plot.getRenderError() };
  });
  await expect.poll(async () => (await sample()).green).toBeGreaterThan(1000);
  const drawn = await sample();
  expect(drawn.error).toBe("");
  // Rows past 1,024 are the routes below the equator: about 15 of 39 rows, not 2.5 of 25.6.
  expect(drawn.low, JSON.stringify(drawn)).toBeGreaterThan(0.3);
  expect(drawn.blueLeft, JSON.stringify(drawn)).toBeGreaterThan(20);
  // A connected Line of 2,000 points draws end to end.
  expect(drawn.blueRight, JSON.stringify(drawn)).toBeGreaterThan(20);
});

// The scan's passes on their own, against the serial prefix they replaced, over 12 blocks of 256:
// each path's first piece and its distance along the path (reset where a path drew nothing or
// does not start where the one before it ended), the total, the overflow flag and cross rows.
test("the curved path scan matches a serial prefix", async ({ page }) => {
  await page.goto("/test/curved-path-batches");
  const results = await page.evaluate(async () => {
    const { curvedPathShader, PATH_PARAMS_LAYOUT: L, PATH_PARAMS_BYTES } = await import("/src/lib/plot/utils/curvedPathShader.js");
    const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
    const errors = [];
    device.onuncapturederror = (e) => errors.push(e.error.message);
    const module = device.createShaderModule({ code: curvedPathShader });
    const layout = device.createBindGroupLayout({
      entries: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((binding) => ({
        binding, visibility: GPUShaderStage.COMPUTE,
        buffer: { type: binding === 5 ? "uniform" : binding < 2 || binding >= 6 ? "read-only-storage" : "storage" },
      })),
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipeline = (entryPoint) => device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint } });
    const buffer = (data, usage) => {
      const b = device.createBuffer({ size: Math.max(16, data.byteLength), usage: usage | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
      device.queue.writeBuffer(b, 0, data);
      return b;
    };
    const run = async (n, overflowAt = -1) => {
      // A deterministic noise in [0, 1).
      const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
      const starts = new Float32Array(n * 2), ends = new Float32Array(n * 2), counts = new Float32Array(n * 8);
      for (let i = 0; i < n; i++) {
        const connected = i > 0 && noise(i, 1) < 0.7;
        starts.set(connected ? ends.subarray((i - 1) * 2, i * 2) : [i, -i], i * 2);
        ends.set([i + 0.5, noise(i, 2)], i * 2);
        const emitted = i === overflowAt ? -1 : noise(i, 3) < 0.15 ? 0 : 1 + Math.floor(noise(i, 4) * 8);
        counts.set([emitted, 0, emitted > 0 ? noise(i, 5) : 0, 0, 0, emitted > 0 ? 1 + Math.floor(noise(i, 6) * 4) : 0, 0, 0], i * 8);
      }
      const params = new ArrayBuffer(PATH_PARAMS_BYTES);
      new Uint32Array(params).set([n, 2, 64, 0], L.source / 4);
      const bound = [
        buffer(starts, GPUBufferUsage.STORAGE), buffer(ends, GPUBufferUsage.STORAGE),
        buffer(counts, GPUBufferUsage.STORAGE), buffer(new Float32Array(4), GPUBufferUsage.STORAGE),
        buffer(new Uint32Array(4 + Math.ceil(n / 256) * 4), GPUBufferUsage.STORAGE), buffer(new Uint8Array(params), GPUBufferUsage.UNIFORM),
        buffer(new Uint32Array(4), GPUBufferUsage.STORAGE), buffer(new Float32Array(4), GPUBufferUsage.STORAGE),
        buffer(new Float32Array(4), GPUBufferUsage.STORAGE),
      ];
      const group = device.createBindGroup({ layout, entries: bound.map((b, binding) => ({ binding, resource: { buffer: b } })) });
      const encoder = device.createCommandEncoder();
      for (const [name, groups] of [["scanBlocks", Math.ceil(n / 256)], ["scanTops", 1], ["scanRows", Math.ceil(n / 256)]]) {
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline(name)); pass.setBindGroup(0, group); pass.dispatchWorkgroups(groups); pass.end();
      }
      const read = (source, size) => {
        const target = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        encoder.copyBufferToBuffer(source, 0, target, 0, size);
        return target;
      };
      const countsRead = read(bound[2], counts.byteLength), resultRead = read(bound[4], 16);
      device.queue.submit([encoder.finish()]);
      await Promise.all([countsRead.mapAsync(GPUMapMode.READ), resultRead.mapAsync(GPUMapMode.READ)]);
      const gpu = new Float32Array(countsRead.getMappedRange().slice(0)), result = [...new Uint32Array(resultRead.getMappedRange().slice(0))];
      // The serial prefix the scan replaced (curvedPathShader.js before TODO 136.11).
      let total = 0, distance = 0, rows = 1, overflow = 0, worstFirst = 0, worstDistance = 0;
      for (let i = 0; i < n; i++) {
        const c = counts.subarray(i * 8, i * 8 + 4);
        if (c[0] < 0) { overflow = 1; continue; }
        rows = Math.max(rows, counts[i * 8 + 5]);
        if (i > 0 && (starts[i * 2] !== ends[i * 2 - 2] || starts[i * 2 + 1] !== ends[i * 2 - 1])) distance = 0;
        if (c[0] > 0) {
          worstFirst = Math.max(worstFirst, Math.abs(gpu[i * 8 + 1] - total));
          worstDistance = Math.max(worstDistance, Math.abs(gpu[i * 8 + 3] - distance));
        }
        if (c[0] === 0) distance = 0; else { total += c[0]; distance += c[2]; }
      }
      return { result, expected: [total, overflow, rows], worstFirst, worstDistance };
    };
    const out = [await run(3000), await run(700, 300)];
    const info = await module.getCompilationInfo();
    return [...out, errors.concat(info.messages.map((m) => m.message))];
  });
  const [scan, overflowing, errors] = results;
  expect(errors).toEqual([]);
  expect(scan.result.slice(0, 3)).toEqual(scan.expected);
  expect(scan.worstFirst).toBe(0);
  expect(scan.worstDistance).toBeLessThan(1e-3);
  expect(overflowing.result[1]).toBe(1);
});
