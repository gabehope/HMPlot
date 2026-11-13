// @ts-check
/**
 * The library's plugin registry (TODO 138.3): one per page, holding the running library's own
 * three.js, TSL and jax, which a plugin's setup receives (a plugin never imports its own: two
 * three.js copies cannot share a node graph). registerPlugin is the public way in.
 */
import * as three from "three/webgpu";
import * as tsl from "three/tsl";
import * as jax from "@hmplot/jax";
import { definePlugin, PLUGIN_API_VERSION } from "./registry.js";
import { plugins, pluginLibraries } from "./runtime.js";
import { studentTTable, studentTOnDevice } from "../../math/distributions.js";
import { pluginGrid } from "./transformGrid.js";

Object.assign(pluginLibraries, {
  three,
  tsl,
  jax,
  grid: pluginGrid,
  math: Object.freeze({ studentTTable, studentTOnDevice }),
});
export { plugins };

/**
 * Register a plugin (from definePlugin): its setup runs once and declares its effects, shades and
 * transforms, and plots that name one draw it from then on. Registering the same plugin again
 * does nothing; another plugin of the same name, or one declaring a kind another registered,
 * throws a plugin.conflict error, and a setup that throws a plugin.failed one.
 * @param {import("./registry.js").Plugin} plugin
 */
export function registerPlugin(plugin) {
  plugins.register(plugin);
}

export { definePlugin, PLUGIN_API_VERSION };
