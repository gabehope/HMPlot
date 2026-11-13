// What a workload would compile on WebGPU, observed on the cpu backend (TODO 17.0b, Stage 23).
// Kernels are recorded as the WGSL the bundled jax-js fork generates for them
// (webgpuShaderSource): equal sources share one pipeline. Sort and argsort share one shader per
// dtype once the array is longer than two full workgroups (512 rows at the default limits), one
// per power of two below; other routines still write their shapes into their shaders.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { init, defaultDevice, webgpuShaderSource } from "@hmplot/jax";

await init("cpu");
defaultDevice("cpu");

// The backend chunk exports getBackend under a minified name ("s" in 0.1.24 and 0.1.25).
const dist = dirname(fileURLToPath(import.meta.resolve("@hmplot/jax")));
const chunk = readdirSync(dist).find((file) => /^backend-.*\.js$/.test(file));
const internals = chunk ? await import(pathToFileURL(join(dist, chunk)).href) : {};
const backend = typeof internals.s === "function" ? internals.s("cpu") : null;
if (!backend?.prepareKernelSync || !backend?.prepareRoutineSync)
  throw Error("jax-js internals changed: update the kernel hook in tests/unit/compiled-programs.js");

function routineKey(routine) {
  const { name, type } = routine;
  if (name === "Sort" || name === "Argsort") {
    const n = type.inputShapes[0].at(-1);
    const size = n > 512 ? "full" : 2 ** Math.ceil(Math.log2(n || 1));
    return `routine ${name} ${type.inputDtypes[0]} ${size}`;
  }
  return `routine ${name} ${JSON.stringify(type)}`;
}

let recording = null;
for (const [name, describe] of [["prepareKernelSync", (kernel) => kernel], ["prepareRoutineSync", routineKey]]) {
  const original = backend[name].bind(backend);
  backend[name] = (source) => {
    recording?.push(describe(source));
    return original(source);
  };
}

/** The programs `run` dispatches: each kernel's WGSL, and routines by name and shape class. */
export async function kernelsOf(run) {
  const seen = (recording = []);
  try { await run(); } finally { recording = null; }
  return new Set(await Promise.all(seen.map((s) => typeof s === "string" ? s : webgpuShaderSource(s))));
}

/** Run `first`, then `second`; the second must compile nothing the first did not. */
export async function assertReused(first, second, label) {
  const before = await kernelsOf(first), after = await kernelsOf(second);
  const added = [...after].filter((kernel) => !before.has(kernel));
  if (process.env.SHOW_KERNELS && added.length) console.log("ADDED", label, added.length, added.join("\n----\n").slice(0, +(process.env.SHOW_KERNELS) > 1 ? +process.env.SHOW_KERNELS : 4000));
  assert.deepEqual(added, [], `${label}: the second run compiled ${added.length} new program(s)`);
}
