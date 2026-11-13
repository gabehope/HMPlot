/**
 * jax-js as hmplot runs it: the bundled fork `@hmplot/jax` (jax-js 0.1.25 with the
 * patches in vendor/jax-js/PATCHES.md; TODO Stage 23). Build JAX inputs with this module, so they
 * belong to the same jax-js instance, and the same GPU device, as the plots that read them:
 *
 *   import { numpy as np } from "hmplot/jax";
 *
 * An app that also imports `@jax-js/jax` directly can point it at this fork with the Vite plugin
 * in `hmplot/vite`; without it, arrays from the app's own jax-js are copied through the host.
 */
export * from "@hmplot/jax";
