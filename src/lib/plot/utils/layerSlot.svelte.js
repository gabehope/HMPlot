import { injectPlugin, useThrelte, useScene } from "@threlte/core";
import { LayerSlot, layerRegistry, isDrawingObject } from "./layerOrder.js";
import { useViewServices } from "./viewServices.js";

/**
 * Give the calling mark component (NamedMark, GeoJSON) its layer slot (Stage 22). `marker`
 * reads the component's empty <template> marker, whose document position is the mark's
 * declaration order. Every descendant <T> drawing object registers with the slot through a
 * Threlte plugin, at a sub-index fixed when its <T> initializes (template order); a nested
 * mark component injects its own plugin and takes over its subtree.
 */
export function useLayerSlot(marker) {
  const { renderer, invalidate } = useThrelte();
  const { scene } = useScene();
  const view = useViewServices();
  const slot = new LayerSlot();
  injectPlugin("plotLayer", (args) => {
    const sub = slot.nextSub();
    $effect.pre(() => {
      const ref = args.ref;
      if (!isDrawingObject(ref)) return;
      return slot.add(sub, ref);
    });
  });
  // After mount: before insertion the marker has no document position.
  $effect(() => {
    const node = marker();
    if (!node) return;
    const registry = layerRegistry(scene, renderer, view, invalidate);
    registry.attach(slot, node);
    return () => registry.detach(slot);
  });
  return slot;
}
