// @ts-check
/** Own the renderer's device-loss, drawable-size and teardown hooks. Pause drawing before
 * waiting for tracked preparations and uploads; neither registry is owned here. */
import { getWebGPUDevice } from "@hmplot/jax";
import { releaseCanvas } from "../utils/layerOrder.js";
import { animationClock } from "../utils/animation.js";
import {
  rendererActivityChanged,
  settlePreparations,
} from "./viewSettlement.js";
import { settleRendererUploads } from "./uploadSettlement.js";
/**
 * @param {import("../utils/internalTypes.js").PlotRenderer} renderer
 * @param {import("../utils/internalTypes.js").ViewServices} view The renderer's view: its lifecycle
 *   follows the renderer's size and device, and its instrumentation of this renderer is
 *   released with it.
 */
export function installRendererDisposal(renderer, view) {
  const { lifecycle } = view;
  getWebGPUDevice().lost.then((info) => {
    lifecycle.deviceLost = info.message || info.reason || "Device lost";
    rendererActivityChanged(view);
    renderer.setAnimationLoop(null);
  });
  const resize = renderer.setSize.bind(renderer);
  lifecycle.drawable = false;
  renderer.setSize = (width, height, ...rest) => {
    lifecycle.drawable =
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0;
    rendererActivityChanged(view);
    if (!lifecycle.drawable) return;
    return resize(width, height, ...rest);
  };
  const dispose = renderer.dispose.bind(renderer);
  let requested = false;
  // Threlte calls dispose without a receiver. Stop rendering immediately, then
  // let descendant teardown and queued uploads finish before releasing resources.
  renderer.dispose = () => {
    animationClock(renderer).dispose();
    const instrumentation = view.diagnostics.instrumentation.current;
    if (instrumentation?.renderer === renderer) instrumentation.dispose();
    if (requested) return;
    requested = true;
    lifecycle.rendererResources.dispose();
    lifecycle.drawable = false;
    rendererActivityChanged(view);
    renderer.setAnimationLoop(null);
    releaseCanvas(renderer.domElement);
    queueMicrotask(() =>
      settlePreparations(view)
        .then(() => settleRendererUploads(renderer, lifecycle))
        .then(dispose, (error) => {
          console.error("Renderer cleanup:", error);
          dispose();
        }),
    );
  };
}
