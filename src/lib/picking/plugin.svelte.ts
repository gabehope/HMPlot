import { untrack } from "svelte";
import { injectPlugin, isInstanceOf } from "@threlte/core";
import { useInteractivity } from "./context.js";
import type { ThrelteEvents } from "./types.js";
export const interactivityEventNames: (keyof ThrelteEvents)[] = [
  "onclick",
  "oncontextmenu",
  "ondblclick",
  "onwheel",
  "onpointerup",
  "onpointercancel",
  "onpointerdown",
  "onpointerover",
  "onpointerout",
  "onpointerenter",
  "onpointerleave",
  "onpointermove",
  "onpointermissed",
  // The tolerant pick's row (TODO 72): a mark with nearest or a tooltip.
  "onnearestenter",
  "onnearestmove",
  "onnearestleave",
];
export const injectInteractivityPlugin = () => {
  injectPlugin("interactivity", (args) => {
    if (!isInstanceOf(args.ref, "Object3D")) return;
    const { addInteractiveObject, removeInteractiveObject } =
      useInteractivity();
    // An object with a handler, or one that is explicitly pickable (`_pickable`: a mark whose
    // brush or unified tooltip reads its pick without a handler of its own), draws its pick.
    const hasEventHandlers = $derived(args.props._pickable === true || interactivityEventNames.some(
      (eventName) => typeof args.props[eventName] === "function",
    ));
    // Callback changes must not unregister the object: that changes its GPU
    // picking ID and makes an in-flight hover look like a different object.
    $effect.pre(() => {
      const ref = args.ref;
      if (!hasEventHandlers) return;
      addInteractiveObject(ref, untrack(() => args.props));
      return () => removeInteractiveObject(ref);
    });
    $effect.pre(() => {
      const ref = args.ref;
      const props = args.props;
      if (hasEventHandlers) addInteractiveObject(ref, props);
    });
    return {
      pluginProps: [...interactivityEventNames, "_pickable"],
    };
  });
};
