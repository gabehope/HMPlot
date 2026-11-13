import { injectInteractivityPlugin } from "./plugin.svelte.js";
import { setupInteractivity } from "./setupInteractivity.svelte.js";
import {
  setInteractivityContext,
  type InteractivityOptions,
} from "./context.js";
import { type PassNode, type Renderer } from "three/webgpu";

const interactivity = (
  scenePass: PassNode,
  renderer?: Renderer,
  options?: InteractivityOptions,
) => {
  const context = setInteractivityContext(scenePass, renderer, options);

  injectInteractivityPlugin();
  setupInteractivity(context);

  return context;
};

// exports
export { useInteractivity } from "./context.js";
export type {
  DomEvent,
  Intersection,
  IntersectionEvent,
  ThrelteEvents as EventMap,
  InteractivityProps,
} from "./types.js";
export { interactivity };
