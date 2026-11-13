<script>
  import { overrideViewContext } from "../utils/viewContext.js";
  import { readable } from "svelte/store";
  import {
    createSceneContext,
    createParentObject3DContext,
    createCameraContext,
  } from "@threlte/core";
  import { getContext, setContext, onDestroy, untrack } from "svelte";
  import { getOptionsContext, setOptionsContext } from "../utils/context.js";
  import { useInteractivity } from "../../picking/context.js";
  import { SurfaceTexture } from "../utils/surfaceTexture.js";
  import { reportDataError } from "../utils/dataErrors.js";
  let { mark: suppliedMark, resolution, children } = $props();
  // The owning Heatmap creates and owns this scene for its entire lifetime.
  const mark = untrack(() => suppliedMark);
  if (getContext("hmplot-surface-children"))
    throw Error("Recursive textured heatmaps are not supported.");
  setContext("hmplot-surface-children", true);
  const parent = getOptionsContext(),
    options = mark.options.splitUnique("texture", "group", "Surface marks");
  // Its marks draw on the surface's chart (TODO 136.12: the view context).
  overrideViewContext(options, { mode: "chart" });
  options.set("shape", parent.get("shape") ?? "circle");
  setOptionsContext(options);
  const coordinateStore = mark.options.store("coordinates");
  const samplesStore =
    mark.options.getChildDefaults("plot")?.store("antialias") ?? readable("msaa");
  const layer = new SurfaceTexture(mark, useInteractivity());
  createSceneContext(layer.scene);
  createParentObject3DContext(layer.scene);
  createCameraContext().camera.set(layer.camera);
  $effect(() => {
    const requested = resolution;
    $coordinateStore;
    $samplesStore;
    let active = true;
    mark.renderer
      .init()
      .then(() => {
        if (active && !layer.disposed) {
          layer.configure(requested);
          layer.error = null;
          // Its own error only: clearing the plot's message wiped other marks' errors (TODO 32.5).
          reportDataError(mark.view, layer, "");
          mark.invalidate();
        }
      })
      .catch((e) => {
        layer.error = e.message;
        reportDataError(mark.view, layer, e.message);
        console.error("Surface texture:", e);
      });
    return () => (active = false);
  });
  onDestroy(() => {
    reportDataError(mark.view, layer, "");
    layer.dispose();
    options.dispose();
  });
</script>

{@render children?.()}
