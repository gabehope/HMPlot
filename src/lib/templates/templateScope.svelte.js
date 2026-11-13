// @ts-check
// A template instance's scope (TODO 130.2): its parts' handles by id, and its contract's main
// part, so the other parts follow the main part's visibility. Python templates reach it through
// the scene's Template node (its `contract` prop), built-in templates through TemplateHost.
import { getContext, setContext, untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";

export const TEMPLATE_SCOPE = Symbol("template scope");

/**
 * A Template node's contract prop: its kind (the settings group's label), its main part or its
 * legend entries, and its named parts, by node id.
 * @typedef {{ kind?: string, main?: string, legendEntries?: { swatch: string, parts: string[] }[], parts?: Record<string, string> }} Contract
 */

/**
 * Followers take the leader's effective `visible` (the viewer's legend click or pane edit, its
 * prop, a theme or group default) in their derived layer, below anything set on them: a
 * follower's own visible= still wins, and nothing here is a viewer's edit for Python. Returns
 * the teardown, which clears what it derived.
 * @param {any} leader The main part's options.
 * @param {any[]} followers The other parts' options.
 */
export function followVisibility(leader, followers) {
  const apply = () => {
    const visible = leader.get("visible") !== false;
    for (const options of followers) options.derive("visible", visible);
  };
  apply();
  const stop = leader.on(apply, "visible");
  return () => {
    stop();
    for (const options of followers) if (options.has("visible")) options.clear("visible", { layer: "derived" });
  };
}

/**
 * A contract's followings: [leader, followers] by part id. `ids` are the parts registered. With a
 * main part, every other part follows it; else each legend entry's parts follow its swatch.
 * @param {Contract | undefined} contract
 * @param {string[]} ids
 * @returns {[string, Set<string>][]}
 */
export function followings(contract, ids) {
  const main = contract?.main;
  if (main !== undefined) return [[main, new Set(ids.filter((id) => id !== main))]];
  return (contract?.legendEntries ?? []).map((entry) => [entry.swatch, new Set(entry.parts.filter((id) => id !== entry.swatch))]);
}

/**
 * The scope of one template instance; call it while its component initializes. `contract()`
 * reads `{ main }` (the main part's id) or `{ legendEntries }` (each entry's swatch and parts).
 * A scope hands the enclosing template's scope only its parts that follow no other (with a main
 * part, that one mark). A built-in template's scope is `isolated`: the scene node holding it is
 * that one mark.
 * @param {() => Contract | undefined} contract
 * @param {{ isolated?: boolean }} [options]
 */
export function templateScope(contract, { isolated = false } = {}) {
  /** @type {any} */
  const outer = isolated ? null : getContext(TEMPLATE_SCOPE) ?? null;
  // Parts by id and cell: a Facet or Partition inside the template mounts each part once per
  // cell (its facet and group key), and each cell's parts follow that cell's leader.
  const handles = new SvelteMap();
  const follows = (/** @type {string} */ id) => {
    const value = contract();
    return value?.main !== undefined ? id !== value.main
      : (value?.legendEntries ?? []).some((entry) => entry.swatch !== id && entry.parts.includes(id));
  };
  const scope = {
    outer,
    /** Register a part's handle under its id (and cell key); returns the unregister. */
    part(/** @type {string} */ id, /** @type {any} */ handle, cell = "") {
      const key = `${id}\u0000${cell}`, entry = { id, cell, handle };
      handles.set(key, entry);
      const forwarded = outer && !follows(id) ? outer.part(id, handle, cell) : undefined;
      return () => {
        forwarded?.();
        if (handles.get(key) === entry) handles.delete(key);
      };
    },
  };
  setContext(TEMPLATE_SCOPE, scope);
  $effect(() => {
    const entries = [...handles.values()], stops = [];
    // The marks' options are read here, tracked: a part's getMark() is undefined until it mounts.
    const options = (/** @type {any} */ entry) => entry.handle?.getMark?.()?.options;
    const pairs = followings(contract(), [...new Set(entries.map((entry) => entry.id))]).flatMap(([main, others]) =>
      entries.filter((entry) => entry.id === main).map((leader) => [options(leader),
        entries.filter((entry) => others.has(entry.id) && entry.cell === leader.cell).map(options).filter(Boolean)]));
    // Untracked: deriving runs the followers' option listeners, which must not become this
    // effect's dependencies (one that writes state it reads would re-run it without end).
    untrack(() => {
      for (const [leader, followers] of pairs)
        if (leader && followers.length) stops.push(followVisibility(leader, followers));
    });
    return () => { for (const stop of stops) stop(); };
  });
  // The settings pane (slice 9c): with a main part the template reads as that one mark, so its
  // other parts are not listed; named parts (contract.parts, those without a name= of their
  // own) are listed by their part names.
  $effect(() => {
    const value = contract(), entries = [...handles.values()], restore = [];
    const options = (/** @type {any} */ entry) => entry.handle?.getMark?.()?.options;
    const names = new Map(Object.entries(value?.parts ?? {}).map(([name, id]) => [id, name]));
    const marks = entries.map((entry) => [entry.id, options(entry)]).filter(([, found]) => found);
    untrack(() => {
      for (const [id, found] of marks) {
        // Each undo restores only the key it set: another scope may set the other.
        const key = value?.main !== undefined && id !== value.main ? "hidden" : names.has(id) ? "label" : null;
        if (!key) continue;
        const previous = found.presentation[key];
        found.setPresentation({ [key]: key === "hidden" ? true : names.get(id) });
        restore.push(() => { if (!found.isDisposed) found.setPresentation({ [key]: previous }); });
      }
    });
    return () => { for (const undo of restore) undo(); };
  });
  return scope;
}
