// @ts-check
/**
 * The first-party plugins (TODO 138.5/138.8): effects and computations outside the core (src/lib/plot imports
 * none of them) and register through the same contract as anyone's. The JavaScript package's
 * entry (index.ts) and the scene runtime the Python bundles run (scene/SceneRenderer.svelte)
 * register them at startup, so users see no change.
 */
import { plugins } from "../plot/plugins/library.js";
import sky from "./sky/index.js";
import atmosphere from "./atmosphere/index.js";
import density from "./density/index.js";
import geometry from "./geometry.js";
import contour from "./contour/index.js";
import regression from "./regression/index.js";
import communityGraph from "./communityGraph.js";

export const FIRST_PARTY_PLUGINS = Object.freeze([
  sky,
  atmosphere,
  communityGraph,
  geometry,
  density,
  contour,
  regression,
]);

/** Register the first-party plugins in the library's registry; registering again does nothing. */
export function registerFirstPartyPlugins() {
  for (const plugin of FIRST_PARTY_PLUGINS) plugins.register(plugin);
}
