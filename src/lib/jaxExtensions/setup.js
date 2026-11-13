import { init, defaultDevice, getWebGPUDevice } from "@hmplot/jax";
import { fontReady } from "../plot/utils/defaultFont.js";
import { diagnostic } from "../plot/utils/diagnostics.js";

let initialization, lostReason;
export function assertGPUAvailable(){if(lostReason)throw Error(`WebGPU device lost: ${lostReason}. Reload to initialize a new device.`);}
/**
 * Initialize the shared JAX/Three WebGPU device in the browser, and load the default font
 * (Source Sans 3) so text is laid out once, in it.
 * Plot calls this on mount; call it yourself before creating JAX input arrays.
 * Concurrent calls share one initialization. Failed initialization can be retried.
 * @returns {Promise<string[]>}
 */
export function initializePlot() {
  if(lostReason)return Promise.reject(Error(`WebGPU device lost: ${lostReason}. Reload to initialize a new device.`));
  if (typeof window === "undefined")
    return Promise.reject(new Error("initializePlot() requires a browser."));
  if (!initialization) {
    initialization = (async () => {
      // The font loads beside the device; it never rejects (a failure leaves a fallback font).
      const [backends] = await Promise.all([init(), fontReady()]);
      // Coded, so a notebook view can tell a browser without WebGPU (it shows a static image
      // instead, TODO 71) from other failures, a lost device among them.
      if (!backends.includes("webgpu"))
        throw diagnostic(
          "webgpu.unavailable",
          "WebGPU backend is unavailable in this browser/runtime.",
        );
      defaultDevice("webgpu");
      getWebGPUDevice().lost.then(info=>{lostReason=info.message||info.reason||"unknown reason";});
      return backends;
    })();
    initialization.catch(() => {
      initialization = undefined;
    });
  }
  return initialization;
}
