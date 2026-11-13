import { defineConfig } from "vite";
import { replaceOnce } from "./guards.js";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const experiment = resolve(root, "tests/perf/investigations/primitives-123");
export default defineConfig({
  root: experiment,
  resolve: {
    alias: {
      $lib: resolve(root, "src/lib/index.ts"),
      "@hmplot/jax": resolve(root, "vendor/jax-js/dist/index.js"),
    },
    dedupe: ["svelte", "three", "@hmplot/jax", "@threlte/core"],
  },
  plugins: [
    {
      name: "isolated-experiment",
      enforce: "pre",
      transform(code, id) {
        const patch = (needle, replacement) =>
          replaceOnce(code, needle, replacement, id);
        if (id.endsWith("/src/lib/plot/utils/dataView.js")) {
          code =
            `import { scanCompact as experimentalCompact } from ${JSON.stringify(resolve(experiment, "candidates.js"))};\n` +
            code;
          code = patch(
            "if (prefix) return np.arange(count).astype(np.int32);",
            'if (globalThis.__recordPrimitiveCalls) globalThis.__primitiveCalls.compact++;\n  if (prefix) return np.arange(count).astype(np.int32);\n  if (globalThis.__primitiveMode === "scan") return experimentalCompact(mask.ref, count);',
          );
        }
        if (id.endsWith("/src/lib/plot/utils/transforms/filter.js")) {
          code =
            `import { scanBucket as experimentalBucket } from ${JSON.stringify(resolve(experiment, "candidates.js"))};\n` +
            code;
          code = patch(
            "const [indices, shown] = bucketRows(",
            'const [indices, shown] = (globalThis.__primitiveMode === "scan" ? experimentalBucket : bucketRows)(',
          );
          code = patch(
            "size < rows\n        ? () => {",
            "size < rows\n        ? () => {\n            if (globalThis.__recordPrimitiveCalls) globalThis.__primitiveCalls.bucket++;",
          );
        }
        if (id.endsWith("/src/lib/plot/utils/slice.js")) {
          code =
            `import { experimentalBrackets } from ${JSON.stringify(resolve(experiment, "runtime.js"))};\n` +
            code;
          code = patch(
            "const brackets = jit(",
            "const baselineBrackets = jit(",
          );
          code = patch(
            "const [lo, hi] = brackets(",
            "const [lo, hi] = experimentalBrackets(baselineBrackets,",
          );
        }
        if (id.endsWith("/MovingParticles.svelte")) {
          code = patch(
            "if (import.meta.env.DEV) window.__movingParticles",
            "if (true) window.__movingParticles",
          );
          code = patch(
            "get plot() { return plot; },",
            "get plot() { return plot; },\n      setPlaying(value) { play(value); },",
          );
        }
        return code;
      },
    },
    svelte({ configFile: false, compilerOptions: { dev: false } }),
  ],
  build: {
    target: "es2022",
    outDir: resolve(root, "primitive-build"),
    emptyOutDir: true,
  },
});
