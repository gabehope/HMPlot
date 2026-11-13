/**
 * Vite plugin for apps that use jax-js themselves (TODO Stage 23).
 *
 * hmplot bundles its own jax-js (`@hmplot/jax`, a patched jax-js 0.1.25). A JAX array
 * belongs to the jax-js copy that made it, so arrays from an app's own `@jax-js/jax` are a second
 * copy's arrays: hmplot reads them back to the CPU and uploads them again, and warns once.
 * This plugin resolves the app's `@jax-js/jax` imports to hmplot's copy instead, so there is
 * one jax-js (one GPU device) and arrays pass straight in:
 *
 *   // vite.config.js
 *   import { hmplotJax } from "hmplot/vite";
 *   export default defineConfig({ plugins: [hmplotJax(), svelte()] });
 *
 * The app then runs hmplot's jax-js version (see hmplot's vendor/jax-js/PATCHES.md) for
 * its own code too; the public API is upstream jax-js's.
 */
import { fileURLToPath } from "node:url";

/** @returns {import("vite").Plugin} */
export function hmplotJax() {
  // Resolve as hmplot's own imports do, from this package, where npm puts bundled
  // dependencies; the app and hmplot then load the same module.
  const importer = fileURLToPath(import.meta.url);
  return {
    name: "hmplot:jax",
    enforce: "pre",
    async resolveId(id, _importer, options) {
      if (id !== "@jax-js/jax") return null;
      return this.resolve("@hmplot/jax", importer, { ...options, skipSelf: true });
    },
  };
}
