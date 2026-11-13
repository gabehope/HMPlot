import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { examples } from "./scripts/vite-examples.js";

const cacheDir = process.env.VITE_CACHE_DIR || "node_modules/.vite";
/**
 * Whether vendor/jax-js/dist changed since a dev server last pre-bundled it into `cacheDir`. Vite
 * re-bundles dependencies only when the lockfile or this config changes, so a rebuilt fork (npm run
 * build:jax-fork, or a pull that brings one) kept serving the old copy (TODO Stage 25). Asked when
 * a dev server starts, of its own cache (scripts/build-thumbnails.mjs's server keeps another; TODO
 * 73.8), not when this file is imported.
 */
function jaxDistChanged(cacheDir) {
  const dist = "vendor/jax-js/dist", hash = createHash("sha256");
  try {
    for (const file of readdirSync(dist).sort()) hash.update(file).update(readFileSync(join(dist, file)));
  } catch {
    return false; // not built: the resolve error says what to do
  }
  const digest = hash.digest("hex"), stamp = join(cacheDir, "hmplot-jax.sha256");
  let previous = null;
  try { previous = readFileSync(stamp, "utf8"); } catch {}
  if (previous === digest) return false;
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(stamp, digest);
  return true;
}

/**
 * With HMPLOT_SLOW_REQUESTS set (the gate's server), a request still unanswered after 5 s is
 * logged, and again when it ends: with a failed test's trace (scripts/gate.mjs), it says whether a
 * stalled page load waited on this server or on Chrome (TODO 136.1b).
 */
function slowRequests() {
  return {
    name: "hmplot-slow-requests", apply: "serve",
    configureServer(server) {
      if (!process.env.HMPLOT_SLOW_REQUESTS) return;
      const log = message => server.config.logger.warn(`Slow request: ${message}`, { timestamp: true });
      server.middlewares.use((request, response, next) => {
        const start = Date.now(), what = `${request.method} ${request.url}`;
        const timer = setTimeout(() => log(`${what} unanswered after 5 s`), 5000);
        response.once("close", () => {
          clearTimeout(timer);
          const ms = Date.now() - start;
          if (ms >= 5000) log(`${what} ${response.writableEnded ? `answered ${response.statusCode}` : "closed unanswered"} after ${ms} ms`);
        });
        next();
      });
    },
  };
}

export default defineConfig({
  cacheDir,
  resolve: { dedupe: ["@hmplot/jax", "three", "svelte", "@threlte/core", "@threlte/extras"] },
  // vendor/: the bundled jax-js fork (@hmplot/jax, a file: dependency, so a symlink here).
  server: { fs: { allow: ["./tests", "./vendor"] } },
  // Pyodide loads its own files at run time; pre-bundled by esbuild (what Vite does with a
  // dependency in a real node_modules), the docs' Python cell hangs after loading numpy.
  // The linked jax-js fork is pre-bundled as a registry dependency would be (Vite leaves linked
  // packages unbundled by default), which is how an installed hmplot loads it.
  // Arrow and Parquet load on first use (dynamic imports): listed so the dev server bundles them
  // at start, not on first import, when it would reload the page (TODO 48.3). So does the docs'
  // Python editor (CodeMirror).
  optimizeDeps: {
    // As build.target: an older default lowers jax-js's private fields to helper calls,
    // which made dev-server profiles spend about 15% of their CPU in __privateAdd/__privateGet.
    esbuildOptions: { target: "es2022" },
    exclude: ["pyodide"],
    include: ["@hmplot/jax", "apache-arrow", "hyparquet", "hyparquet-compressors", "codemirror", "@codemirror/view",
      "@codemirror/state", "@codemirror/lang-python", "@codemirror/autocomplete", "@codemirror/lint"],
  },
  build: {
    emptyOutDir: false,
    // WebGPU browsers support native top-level await. Keep it native: the promise-wrapper
    // transform loses function hoisting for shared D3 exports when scene kinds are split.
    target: "es2022",
  },
  worker: {
    format: "es",
  },
  plugins: [
    { name: "hmplot-jax-dist", apply: "serve", config: (config) => jaxDistChanged(config.cacheDir ?? cacheDir) ? { optimizeDeps: { force: true } } : undefined },
    slowRequests(),
    examples(),
    sveltekit(),
  ],
});
