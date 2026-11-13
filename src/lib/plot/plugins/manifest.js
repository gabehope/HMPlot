// @ts-check
/**
 * A plugin package's manifest (TODO 138.4): what Python knows of a plugin without running it.
 * `node scripts/plugin-manifest.mjs plugin.js` writes it beside the file. Python reads it to
 * validate parameters and puts { name, version, hash } in a scene's state; the browser loads the
 * file and checks it against the hash.
 *
 *   { name, version, apiVersion, main: the file's name, hash: "sha256-<base64>",
 *     hooks: { effect: { kind: { parameters } }, shade: {...}, transform: {...} } }
 */
import { createPluginRegistry, PLUGIN_STAGES } from "./registry.js";
import { pluginHash } from "./hash.js";

/**
 * The manifest of `plugin` (a definePlugin object, or the plain object a plugin file exports),
 * loaded from `source` (the file's text or bytes) named `main`. Its setup runs once, in a registry
 * of its own, with `libraries` as hm's three, tsl and jax. `version` is the plugin's own unless
 * given.
 * @param {import("./registry.js").Plugin} plugin
 * @param {string | Uint8Array} source
 * @param {{ main: string, version?: string, libraries?: { three?: unknown, tsl?: unknown, jax?: unknown } }} options
 */
export function pluginManifest(
  plugin,
  source,
  { main, version = plugin?.version, libraries = {} },
) {
  const registry = createPluginRegistry(libraries);
  registry.register(plugin);
  const { name, apiVersion } = plugin;
  if (typeof version !== "string" || !version)
    throw Error(
      `Plugin "${name}": a manifest needs its version (the plugin's version: "1.0.0", or --version).`,
    );
  // Pages carry the file as text, and the browser hashes that text's bytes: UTF-8, no BOM.
  if (typeof source !== "string") {
    try {
      source = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(source);
    } catch {
      throw Error(`Plugin "${plugin.name}": its file is not UTF-8 text.`);
    }
  }
  if (source.startsWith("\ufeff"))
    throw Error(
      `Plugin "${plugin.name}": its file starts with a byte order mark; save it as UTF-8 without one.`,
    );
  if (typeof main !== "string" || !main || /[\\/]/.test(main))
    throw Error(
      `Plugin "${name}": main is the plugin file's name, beside its manifest; got ${JSON.stringify(main)}.`,
    );
  /** @type {Record<string, Record<string, { parameters: unknown }>>} */
  const hooks = {};
  for (const stage of PLUGIN_STAGES)
    hooks[stage] = Object.fromEntries(
      registry
        .kinds(stage)
        .map((kind) => [
          kind,
          { parameters: registry.get(stage, kind)?.parameters ?? {} },
        ]),
    );
  return { name, version, apiVersion, main, hash: pluginHash(source), hooks };
}
