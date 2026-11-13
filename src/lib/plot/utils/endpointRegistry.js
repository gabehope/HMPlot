/**
 * The endpoint registry (Stage 15): one per View (renderer), so a consumer never sees another
 * View's endpoints. Every mount of an endpoint-capable mark registers one entry (namedMark);
 * repeated definitions (embedded Facet cells, Partition groups) register one entry per cell
 * under one definition key. A connection resolves a mount with a cell to its whole definition
 * (byDefinition) and any other mount to itself: definition keys follow settings-tree labels,
 * so unnamed marks in repeated Frames (an {#each}) share one without being one mark. Entries hold references, never copies: the GPU mark (its live
 * field buffers), and the prepared frame on screen (`shown`, whose jax arrays namedMark
 * retains until the next publish). Nothing here reads pixels, the DOM, or GPU buffers.
 *
 * Entry (created by namedMark, normalized by register):
 *   definition   endpointDefinition(options): the authored scope path, aliases read as "*"
 *   name         the authored `name` prop (facet.endpoint(name) selects by it), or undefined
 *   label        settings-tree label, for messages
 *   kind         namedMark kind ("Anchor", "Points", "Prism", ...)
 *   compound     compound mark kind when mounted by one ("Bar", ...), else undefined
 *   cell         null, or {key, ordinal, facet, partition}: getters that read the live
 *                Facet cell / Partition group, so reordered cells re-sort without re-registering.
 *                key: `[facetCellKey, partitionRuntimeKey].filter(Boolean).join("/")` (the
 *                runtime handle key of SceneNode); ordinal: number[] outer→inner.
 *   scopes       Facet options nodes enclosing the mount (embedded cells do not inherit from
 *                the Facet's options, so byName matches them through this list)
 *   mark, options (mark.options), frameOptions (enclosing frame's options), frameKey
 *   renderer
 *   shown        null until published, then {keyTokens, tokensRequested, owner, ownerId,
 *                aggregate, scope, props, lifecycle}: the frame on screen (keyTokens are the
 *                union rows while a keyed lifecycle runs)
 *   revision     {data, frame}: data counts published frames; frame is the JSON of the frame
 *                mapping chain and placement, changed only when those change
 *   connectionBacked  the mark draws from `connections` (cannot be an endpoint yet)
 *   refresh()    re-prepare the mark (namedMark revision++)
 */
import { definitionKey } from "./guides.js";
import { compareOrdinals, duplicateEndpointNameError } from "./connections.js";

const registries = new WeakMap();
/** The endpoint registry of a View (keyed by its renderer). */
export function endpointRegistry(renderer) {
  let registry = registries.get(renderer);
  if (!registry) registries.set(renderer, (registry = createEndpointRegistry()));
  return registry;
}
/** The definition key a connection resolves for mounts in cells: every cell's mount of one
 * authored mark shares it. */
export const endpointDefinition = (options) => definitionKey(options, { repeated: true });

/** Whether `scope` (an options node) encloses `options`. */
function enclosedBy(options, scope) {
  for (let node = options; node; node = node.defaults) if (node === scope) return true;
  return false;
}

export function createEndpointRegistry() {
  const entries = new Set(), marks = new WeakMap(), listeners = new Set();
  const definitionDemands = new Map(), nameDemands = new Set(), entryDemands = new Map();
  let queued = [], scheduled = false, disposed = false, sequence = 0;
  const notify = (entry, change) => {
    if (disposed) return;
    queued.push({ entry, change });
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const changes = queued;
      queued = [];
      if (disposed) return;
      listeners.forEach((fn) => fn(changes));
    });
  };
  // Definitions follow renamed ancestors; recompute them before any lookup.
  const refile = () => { for (const entry of entries) entry.definition = endpointDefinition(entry.options); };
  const inside = (entry, scope) => entry.scopes?.includes(scope) || enclosedBy(entry.options, scope);
  const demandedEntry = (entry) => (definitionDemands.get(entry.definition) ?? 0) > 0 ||
    (entryDemands.get(entry) ?? 0) > 0 ||
    [...nameDemands].some((demand) => demand.name === entry.name && inside(entry, demand.scope));
  // A demanded endpoint that published without asking for key tokens prepares once more.
  const needsTokens = (entry) => entry.shown && !entry.shown.tokensRequested && !entry.shown.keyTokens;
  const refreshForTokens = (entry) => {
    if (entry.tokenRefresh || !needsTokens(entry) || !demandedEntry(entry)) return;
    entry.tokenRefresh = true;
    queueMicrotask(() => { if (entries.has(entry)) entry.refresh?.(); });
  };
  const sorted = (list) => list.sort((a, b) => compareOrdinals(a.cell?.ordinal, b.cell?.ordinal) || a.sequence - b.sequence);

  const registry = {
    /** Add a mount's entry (see the module comment); returns the unregister function. */
    register(entry) {
      if (disposed) return () => {};
      entry.definition = endpointDefinition(entry.options ?? entry.mark?.options);
      entry.options ??= entry.mark?.options;
      entry.scopes ??= [];
      entry.shown ??= null;
      entry.revision = { data: 0, frame: entry.revision?.frame ?? "" };
      entry.sequence = sequence++;
      entries.add(entry);
      if (entry.mark) marks.set(entry.mark, entry);
      notify(entry, "register");
      refreshForTokens(entry);
      return () => {
        if (!entries.delete(entry)) return;
        if (entry.mark && marks.get(entry.mark) === entry) marks.delete(entry.mark);
        notify(entry, "unregister");
      };
    },
    /**
     * Record a mount's new state: `shown` (a published frame; bumps revision.data) and/or
     * `frame` (the frame revision string; bumps only when it changed).
     */
    update(entry, { shown = undefined, frame = undefined } = {}) {
      if (!entries.has(entry)) return;
      if (shown !== undefined) {
        entry.shown = shown;
        entry.revision.data++;
        entry.tokenRefresh = false;
        notify(entry, "data");
        refreshForTokens(entry);
      }
      if (frame !== undefined && frame !== entry.revision.frame) {
        entry.revision.frame = frame;
        notify(entry, "frame");
      }
    },
    /** The entry of a mark object (a handle's getMark()), or undefined. */
    entryOf: (mark) => (mark ? marks.get(mark) : undefined),
    /** Every live entry, in registration order. */
    entries: () => (refile(), [...entries]),
    /** Every mount of a definition, in cell order (Facet cells row-major, then Partition groups). */
    byDefinition(definition) {
      refile();
      return sorted([...entries].filter((entry) => entry.definition === definition));
    },
    /**
     * The uniquely named endpoint definition inside a Facet or Partition scope (its options
     * node): `{definition, entries}` in cell order, or null when nothing by that name is
     * mounted yet. Two definitions with one name is an error.
     */
    byName(scope, name, { scopeKind = "Facet" } = {}) {
      refile();
      const found = [...entries].filter((entry) => entry.name === name && inside(entry, scope));
      const definitions = [...new Set(found.map((entry) => entry.definition))];
      if (definitions.length > 1) throw Error(duplicateEndpointNameError(scopeKind, name, definitions.length));
      if (!definitions.length) return null;
      return { definition: definitions[0], entries: sorted(found) };
    },
    /**
     * A consumer needs endpoints with key tokens: a definition (a key string), one mount
     * (`{entry}`), or a named definition in a scope (`{scope, name}`). The mounts compute them
     * from then on, and those that already published without them prepare once more. Returns
     * the release function.
     */
    demand(target) {
      let release;
      const counted = (map, key) => {
        map.set(key, (map.get(key) ?? 0) + 1);
        return () => {
          const count = (map.get(key) ?? 1) - 1;
          if (count > 0) map.set(key, count);
          else map.delete(key);
        };
      };
      if (typeof target === "string") release = counted(definitionDemands, target);
      else if (target?.entry) release = counted(entryDemands, target.entry);
      else {
        const demand = { scope: target.scope, name: target.name };
        nameDemands.add(demand);
        release = () => nameDemands.delete(demand);
      }
      refile();
      for (const entry of entries) refreshForTokens(entry);
      let released = false;
      return () => { if (!released) { released = true; release(); } };
    },
    /** Whether an entry (or a definition key) is demanded by some consumer. */
    demanded(target) {
      if (typeof target === "string") return (definitionDemands.get(target) ?? 0) > 0;
      if (!target || !entries.has(target)) return false;
      target.definition = endpointDefinition(target.options);
      return demandedEntry(target);
    },
    /** Called with the batched changes `[{entry, change: "register"|"unregister"|"data"|"frame"}]`. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      disposed = true;
      entries.clear();
      listeners.clear();
      definitionDemands.clear();
      nameDemands.clear();
      entryDemands.clear();
    },
  };
  return registry;
}
