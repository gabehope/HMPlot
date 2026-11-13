import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import config from "./vite.config.mjs";
import { replaceOnce, requireFrames, waitForFrame } from "./guards.js";

test("every experiment patch matches the pinned baseline exactly once", () => {
  const transform = config.plugins.find(
    (p) => p.name === "isolated-experiment",
  ).transform;
  for (const path of [
    "src/lib/plot/utils/dataView.js",
    "src/lib/plot/utils/transforms/filter.js",
    "src/lib/plot/utils/slice.js",
    "src/routes/examples/interactions/MovingParticles.svelte",
  ]) {
    const code = execFileSync("git", ["show", `0041638d:${path}`], {
      encoding: "utf8",
    });
    assert.notEqual(transform(code, `/${path}`), code);
  }
  for (const code of ["missing", "target target"])
    assert.throws(
      () => replaceOnce(code, "target", "changed", "fixture"),
      /expected one/,
    );
});

test("stalled settlement and frames fail within the deadline; live windows require frames", async () => {
  const oldRequest = globalThis.requestAnimationFrame,
    oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 1);
  globalThis.cancelAnimationFrame = clearTimeout;
  try {
    await assert.rejects(
      waitForFrame({ whenSettled: () => new Promise(() => {}) }, 0, 10),
      /within 10 ms/,
    );
    await assert.rejects(
      waitForFrame(
        {
          whenSettled: async () => {},
          getDiagnostics: () => ({ completedFrame: 0 }),
        },
        0,
        10,
      ),
      /within 10 ms/,
    );
    await waitForFrame(
      {
        whenSettled: async () => {},
        getDiagnostics: () => ({ completedFrame: 1 }),
      },
      0,
      10,
    );
    assert.throws(() => requireFrames(0), /no completed plot frames/);
    requireFrames(1);
  } finally {
    globalThis.requestAnimationFrame = oldRequest;
    globalThis.cancelAnimationFrame = oldCancel;
  }
});
