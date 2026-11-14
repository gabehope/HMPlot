# hmplot/vite

A Vite plugin that makes an app's own @jax-js/jax imports hmplot's jax-js, so arrays pass straight in.

JavaScript only.

## Example

```svelte
// vite.config.js
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { hmplotJax } from "hmplot/vite";

export default defineConfig({ plugins: [hmplotJax(), sveltekit()] });
```

## Exports

- `hmplotJax()` (`Vite plugin`): Resolves the app's imports of @jax-js/jax to hmplot's bundled jax-js (hmplot/jax), so the app and its plots share one jax-js and one GPU device. Without it, arrays from the app's own copy are read back and uploaded again, with a warning.

## Usage

A jax-js array belongs to the jax-js copy that made it, and each copy has its own GPU device. hmplot bundles its own jax-js ([hmplot/jax](package-jax)); an app that also imports `@jax-js/jax` has a second copy, whose arrays hmplot reads back to the CPU and uploads again (once per array, with a warning). Add the plugin before the Svelte plugin to give the app hmplot's copy instead, so arrays pass straight in. The app's own jax-js code then runs hmplot's jax-js version, whose API is upstream jax-js 0.1.25's.

In TypeScript, point `@jax-js/jax` at hmplot's types too, as the two copies' classes are separate types:

```json
{ "compilerOptions": { "paths": { "@jax-js/jax": ["./node_modules/hmplot/dist/jax.d.ts"] } } }
```

With another bundler, alias `@jax-js/jax` to `hmplot/jax`. An app that builds its arrays with `hmplot/jax` alone needs no plugin. See docs/USAGE.md, "Apps that use jax-js themselves".
