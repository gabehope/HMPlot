// @ts-check
import { createPluginRegistry } from "./registry.js";

// Numerical consumers share the registry without importing Three.js. The public library
// entry installs its modules before registering plugins; setup reads them at registration.
/** @type {{ three?: unknown, tsl?: unknown, jax?: unknown, grid?: typeof import("./transformGrid.js").pluginGrid, math?: Pick<typeof import("../../math/distributions.js"), "studentTTable" | "studentTOnDevice"> }} */
export const pluginLibraries = {};
export const plugins = createPluginRegistry(pluginLibraries);
