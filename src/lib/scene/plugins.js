// @ts-check
/**
 * The plugins a scene's state names (TODO 138.4): { name, version, hash } each, never code. The
 * host gives the files: the widget asks the kernel, which reads the installed package's file; an
 * exported page embeds them; Python's export session serves them. Each file is checked against
 * the hash the state names, imported (an ES module whose default export is the plugin) and
 * registered in the library's registry, once per page. A plugin that cannot load is a warning, and
 * the scene draws without it: plugin.missing (no file for it here), plugin.failed (a hash that
 * does not match, a file that throws) or plugin.conflict (another copy of it is loaded already).
 */
import { plugins } from "../plot/plugins/library.js";
import { pluginHash } from "../plot/plugins/hash.js";
import { bytesToBase64 } from "../encoding/base64.js";
import { diagnostic, toDiagnostic } from "../plot/utils/diagnostics.js";

/**
 * @typedef {{ name: string, version: string, hash: string }} PluginRef
 * @typedef {(ref: PluginRef) => Promise<string | null | undefined> | string | null | undefined} PluginSource
 *   A plugin's file, or null when there is none here.
 */

/** What this page loaded from scenes, by name: { version, hash, source }. */
const loaded = new Map();
/** A load in progress, by name: two scenes naming a plugin load it once. */
const loading = new Map();

/**
 * The problem with a state's `plugins`, or "": a list of { name, version, hash } strings, each
 * name once.
 * @param {unknown} list
 */
export function pluginRefsProblem(list) {
  if (list === undefined) return "";
  if (!Array.isArray(list)) return `Scene: plugins is a list of { name, version, hash }; got ${JSON.stringify(list)}.`;
  const names = new Set();
  for (const ref of list) {
    if (!ref || typeof ref !== "object" || ["name", "version", "hash"].some((key) => typeof ref[key] !== "string" || !ref[key]))
      return `Scene: each of plugins is { name, version, hash }, strings; got ${JSON.stringify(ref)}.`;
    if (names.has(ref.name)) return `Scene: plugins names "${ref.name}" twice.`;
    names.add(ref.name);
  }
  return "";
}

/** A module's text as a module: a data: URL, which a page opened from a file can import too. @param {string} source */
const importSource = (source) =>
  import(/* @vite-ignore */ `data:text/javascript;base64,${bytesToBase64(new TextEncoder().encode(source))}`);

/** @param {string} code @param {string} message */
const warning = (code, message) =>
  toDiagnostic(diagnostic(code, message, { component: "Plugin" }), { severity: "warning", component: "Plugin" });

/**
 * Load one plugin, or say why it did not.
 * @param {PluginRef} ref @param {PluginSource} source
 * @param {{ registry: any, importModule: (source: string) => Promise<any> }} options
 */
async function loadPlugin(ref, source, { registry, importModule }) {
  const { name, version, hash } = ref;
  const present = loaded.get(name);
  if (present)
    return present.hash === hash
      ? null
      : warning("plugin.conflict",
        `Plugin "${name}" ${version} is not the copy this page loaded (${present.version}), which this scene draws with: reload the page to load ${version}.`);
  // Registered by the page's own JavaScript (registerPlugin): that copy draws.
  if (registry.names().includes(name)) return null;
  const failed = (/** @type {string} */ why) => warning("plugin.failed", `Plugin "${name}" failed: ${why} The scene draws without it.`);
  let text;
  try {
    text = await source(ref);
  } catch (error) {
    return failed(`its file did not load (${/** @type {any} */ (error)?.message ?? error}).`);
  }
  if (text == null)
    return warning("plugin.missing",
      `Plugin "${name}" (${version}) is not installed here, so the scene draws without it. Python installs its package and calls hm.use_plugin("${name}").`);
  const actual = pluginHash(text);
  if (actual !== hash)
    return failed(`its file does not match the hash the scene names (${hash}; the file's is ${actual}), so it was not run. Reinstall its package, or write its manifest again.`);
  let plugin;
  try {
    plugin = (await importModule(text))?.default;
  } catch (error) {
    return failed(`its file throws (${/** @type {any} */ (error)?.message ?? error}).`);
  }
  if (plugin?.name !== name)
    return failed(`its file's default export is ${plugin?.name ? `plugin "${plugin.name}"` : "not a plugin"}; it is { name: "${name}", apiVersion, setup }.`);
  try {
    registry.register(plugin);
  } catch (error) {
    return warning(/** @type {any} */ (error)?.code ?? "plugin.failed", /** @type {any} */ (error)?.message ?? String(error));
  }
  loaded.set(name, { version, hash, source: text });
  return null;
}

/**
 * Load the plugins `refs` names that this page has not, from `source`. Resolves to each name's
 * warning (null: it is loaded).
 * @param {PluginRef[] | undefined} refs
 * @param {PluginSource} source
 * @param {{ registry?: any, importModule?: (source: string) => Promise<any> }} [options]
 * @returns {Promise<Map<string, import("../plot/utils/diagnostics.js").Diagnostic | null>>}
 */
export async function loadScenePlugins(refs, source, { registry = plugins, importModule = importSource } = {}) {
  /** @param {PluginRef} ref */
  const load = async (ref) => {
    // Another scene loading it first: then this one finds it loaded (or tries again).
    while (loading.has(ref.name)) await loading.get(ref.name);
    const pending = loadPlugin(ref, source, { registry, importModule }).finally(() => loading.delete(ref.name));
    loading.set(ref.name, pending);
    return /** @type {const} */ ([ref.name, await pending]);
  };
  return new Map(await Promise.all((refs ?? []).map(load)));
}

/**
 * The files of the plugins `refs` names that this page loaded, for a page exporting itself:
 * { name: { hash, source } }.
 * @param {PluginRef[] | undefined} refs
 */
export function loadedPluginSources(refs) {
  /** @type {Record<string, { hash: string, source: string }>} */
  const out = {};
  for (const { name, hash } of refs ?? []) {
    const entry = loaded.get(name);
    if (entry?.hash === hash) out[name] = { hash, source: entry.source };
  }
  return out;
}

/** Forget what this page loaded (unit tests; the registry keeps its plugins). */
export function resetLoadedPlugins() {
  loaded.clear();
  loading.clear();
}
