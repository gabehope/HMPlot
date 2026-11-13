import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
// The app's own jax-js code (src/JaxInputs.svelte) imports @jax-js/jax; the plugin makes that
// hmplot's bundled jax-js, so its arrays pass into plots without a copy (TODO 23.0a).
import { hmplotJax } from "hmplot/vite";
export default defineConfig({
  plugins: [hmplotJax(), svelte()],
  build: { target: "esnext" },
});
