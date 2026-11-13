// A docs Example's live view (TODO 68.1): the scene runtime, its renderer and the GPU. Example.svelte
// imports this module only when an example goes live (near the viewport, with WebGPU), a Run, or
// Show tree, so pages load their prose, previews and source without the plotting runtime.
import { SceneRuntime } from "../scene/runtime.svelte.js";
import { initializePlot } from "../jaxExtensions/setup.js";

export { default as SceneRenderer } from "../scene/SceneRenderer.svelte";

// A column's base64 payload as bytes. Uint8Array.from(atob(text), callback) took 48 ms for the
// Lorenz example's 1.2 MB; this loop takes a few (TODO 68.3).
function decode(text) {
  const binary = atob(text), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Draws a scene payload ({state, columns}) live in `view` ({runtime, live}, the Example's state):
 * creates its runtime once, applies the scene, and sets `live` when it has settled, so the
 * preview stays until the plot has drawn. Throws without WebGPU. `cancelled()` stops it between steps.
 */
export async function present(view, payload, cancelled) {
  performance.mark?.("hmplot:gpu-start");
  await initializePlot();
  performance.measure?.("hmplot:gpu", "hmplot:gpu-start");
  if (cancelled()) return;
  view.runtime ??= new SceneRuntime(() => {});
  performance.mark?.("hmplot:apply-start");
  await view.runtime.apply(payload.state, async (key) => ({ descriptor: payload.columns[key].descriptor, payload: decode(payload.columns[key].payload) }));
  performance.measure?.("hmplot:apply", "hmplot:apply-start");
  if (cancelled()) return;
  await view.runtime.settle();
  performance.measure?.("hmplot:settle", "hmplot:apply-start");
  if (!cancelled()) view.live = true;
}
