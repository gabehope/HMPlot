// Copy to test/ in the patched upstream checkout. Copy the accepted baseline's vendor/jax-js/dist
// to stage123-baseline-dist beside test/. Run in Vitest's real-Chrome browser harness.
// Final paired GPU scan timing; output readback is included and samples alternate order.
import * as candidate from "@jax-js/jax";
import * as baseline from "../stage123-baseline-dist/index.js";
import { test, expect } from "vitest";
test("bounded scan crossover", async () => {
  const libraries = { baseline, candidate };
  const available = await candidate.init();
  await baseline.init();
  expect(available).toContain("webgpu");
  for (const device of ["webgpu"]) {
    for (const lib of Object.values(libraries)) lib.defaultDevice(device);
    const lengths =
      device === "webgpu"
        ? [257, 513, 65537, 262144, 500001, 1048576, 2097152]
        : [257, 513, 65537];
    for (const n of lengths) {
      const methods = {},
        inputs = {},
        samples = { baseline: [], candidate: [] };
      for (const [name, lib] of Object.entries(libraries)) {
        inputs[name] = lib.numpy.ones([n], { dtype: lib.numpy.int32 });
        methods[name] = lib.jit((x) => lib.numpy.cumsum(x));
        const result = await methods[name](inputs[name].ref).data();
        expect(result.every((v, i) => v === i + 1)).toBe(true);
      }
      for (let repeat = 0; repeat < 14; repeat++)
        for (const name of repeat % 2
          ? ["candidate", "baseline"]
          : ["baseline", "candidate"]) {
          const start = performance.now();
          await methods[name](inputs[name].ref).data();
          if (repeat >= 2) samples[name].push(performance.now() - start);
        }
      Object.values(inputs).forEach((x) => x.dispose());
      console.log("SCAN", JSON.stringify({ device, n, samples }));
    }
  }
}, 180000);
