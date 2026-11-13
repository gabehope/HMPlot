import { test, expect } from "./fixtures.js";

test("static and live connectors follow a polar, log/sqrt, spherical endpoint chain", { tag: "@gpu" }, async ({ page }) => {
  await page.goto("/test/stage14-connections-mixed");
  await page.waitForFunction(() => window.stage14ConnectionsMixed?.connector?.getMark?.(), null, { timeout: 15000 });
  const probe = async () => page.evaluate(async () => {
    const { framePoint } = await import("/src/lib/plot/utils/framePlacement.js");
    const { resolveCoordinateOperations } = await import("/src/lib/plot/utils/coordinateOperations.js");
    const { plot, source, target, connector } = window.stage14ConnectionsMixed;
    await plot.whenSettled();
    const mark = connector.getMark(), renderer = mark.renderer, counters = mark.view.diagnostics.counters, device = renderer.backend.device;
    await device.queue.onSubmittedWorkDone();
    const read = async (name) => {
      const field = mark.fields.get(name), attribute = field?.bufferNodeSource;
      if (!attribute) return null;
      const gpu = renderer.backend.get(attribute)?.buffer;
      if (!gpu) return null;
      const staging = device.createBuffer({ size: 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(gpu, 0, staging, 0, 16);
      device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const values = Array.from(new Float32Array(staging.getMappedRange()).slice(0, 3));
      staging.destroy();
      return values;
    };
    const operations = resolveCoordinateOperations(source.getMark().options, { includePlacement: false });
    return { start: await read("start"), end: await read("end"),
      source: framePoint(source.getMark().options, [6, 1, 0]),
      target: framePoint(target.getMark().options, [-0.8, -0.7, 0]),
      polarRadialScale: operations.find((operation) => operation.kind === "polar")?.radial,
      polarFitScale: operations.find((operation) => operation.kind === "fit")?.sx,
      gathers: counters.connectionGathers,
      matches: counters.connectionMatches,
      error: plot.getRenderError() };
  });
  const before = await probe();
  expect(before.error).toBe("");
  expect(before.start).not.toBeNull();
  expect(before.polarRadialScale).toBe(1);
  expect(before.polarFitScale).toBeLessThan(100);
  expect(Math.hypot(...before.start.slice(0, 2))).toBeGreaterThan(0.1);
  before.start.forEach((value, axis) => expect(value).toBeCloseTo(before.source[axis], 3));
  before.end.forEach((value, axis) => expect(value).toBeCloseTo(before.target[axis], 3));
  await page.evaluate(() => window.stage14ConnectionsMixed.center([20, 0]));
  await expect.poll(async () => (await probe()).start?.[0]).not.toBeCloseTo(before.start[0], 2);
  const after = await probe();
  expect(after.error).toBe("");
  after.start.forEach((value, axis) => expect(value).toBeCloseTo(after.source[axis], 3));
  expect(after.gathers).toBeGreaterThan(before.gathers);
  // A projection-center edit only moves the mapping: the live gather follows
  // it, and no endpoint republishes or rematches.
  expect(after.matches - before.matches).toBe(0);
});
