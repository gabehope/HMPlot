<script>
  // A built-in template's host (TODO 130.2): expands a definition (define.js) synchronously,
  // with no scene runtime or input context of its own, inside its theme kind's defaults, and
  // answers for its main part. `parts` holds exactly the components the definition mounts, so a
  // wrapper imports only what it draws.
  import { onDestroy, untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import HostNode from "./HostNode.svelte";
  import ThemeDefaults from "../plot/themeDefaults.svelte";
  import { endpointDescriptor } from "../plot/utils/connections.js";
  import { templateScope } from "./templateScope.svelte.js";
  import registry from "../scene/registry.json" with { type: "json" };
  import { definitionKinds, evaluate, mainKind, mainPath, mounted, parameterValues, pathOf, textSetting } from "./instantiate.js";
  import { getOptionsContext, setOptionsContext } from "../plot/utils/context.js";
  import { FieldType, SelectType } from "../plot/objects/types.js";
  import { createDomainGroup } from "../plot/utils/domainGroup.js";

  // `children`: the caller's, rendered at the definition's slot. `onviewportchange(id, viewport)`
  // hears a linked Plot's viewport change, by its id (a figure's main view, for its caller).
  let { definition, parts, props, children = undefined, onviewportchange = undefined } = $props();
  // The definition and parts are fixed for an instance.
  const { main, kind, endpoint } = untrack(() => {
    for (const kind of definitionKinds(definition))
      if (!parts[kind]) throw Error(`${definition.kind}: its host was not given the part ${kind}.`);
    return { main: mainPath(definition), kind: definition.kind, endpoint: definition.endpoint };
  });
  // Its settings (define.js): parameters in the settings pane, in a group of the template's own
  // that its parts' options sit in; the caller's value sets the field, an edit there the
  // parameter, and both reach Python as the template's props.
  const settings = untrack(() => Object.entries(definition.settings ?? {}));
  const group = settings.length ? untrack(() => getOptionsContext().splitUnique(props.name, "group", kind)) : null;
  /** @type {Record<string, unknown>} */
  let settingValues = $state.raw({});
  if (group) {
    setOptionsContext(group);
    for (const [name, setting] of settings)
      group.ensure(setting.option, setting.options
        ? new SelectType({ defaultValue: definition.params[name], options: setting.options })
        : new FieldType({ defaultValue: definition.params[name], ui: { ui: "text" } }));
    group.setDisplayList(settings.map(([, setting]) => setting.option));
    const read = () => {
      settingValues = Object.fromEntries(settings.map(([name, setting]) => {
        const value = group.get(setting.option);
        if (!setting.text) return [name, value];
        // A text field mid-edit ("1,") keeps the last value it parsed to.
        return [name, textSetting(value, settingValues[name] ?? definition.params[name])];
      }));
    };
    read();
    for (const [, setting] of settings) onDestroy(group.on(read, setting.option));
    onDestroy(() => group.dispose());
  }
  $effect.pre(() => {
    for (const [name, setting] of settings)
      if (props[name] !== undefined) group?.set(setting.option, props[name]);
  });
  const params = $derived(parameterValues(definition, group ? { ...props, ...settingValues } : props));
  // Reactive, so a caller that read getMark() before a part mounted (a Legend for this mark,
  // under a Transform that mounts its children once it has run) reads it again.
  const instances = new SvelteMap();
  // Its scope: the other marks follow the main part's visibility (templateScope.svelte.js).
  const scope = templateScope(() => ({ main }), { isolated: true });
  const marks = untrack(() => {
    const paths = new Set();
    const walk = (item, path) => {
      if (registry.marks.includes(item.kind) && item.kind !== "Anchor") paths.add(path);
      item.children.forEach((child, index) => walk(child, `${path}.${index}`));
    };
    walk(definition.root, "0");
    return paths;
  });
  const parted = new Map();
  const register = (path, instance) => {
    parted.get(path)?.();
    parted.delete(path);
    if (instance && marks.has(path)) parted.set(path, scope.part(path, instance));
    return instance ? instances.set(path, instance) : instances.delete(path);
  };
  // A prop the template refuses, with the error that names the fix (Bar's width), and one it
  // needs (a chart's required options).
  $effect.pre(() => {
    for (const [key, message] of Object.entries(definition.forbid ?? {}))
      if (props[key] !== undefined) throw Error(message);
    for (const [key, message] of Object.entries(definition.required ?? {}))
      if (props[key] == null) throw Error(message);
  });
  // Connections: the main part registers as this template's endpoint (its kind's attachments,
  // connections.js), named by the caller's name, its value axis the nearest enclosing
  // transform's (BarGeometry's for a Bar).
  const endpointSpec = endpoint && untrack(() => ({
    kind, markKind: mainKind(definition), name: () => props.name,
    valueAxis: () => {
      for (let path = main; path.includes("."); ) {
        path = path.slice(0, path.lastIndexOf("."));
        const axis = instances.get(path)?.valueAxis?.();
        if (axis != null) return axis;
      }
      return null;
    },
  }));

  // Linked views (TODO 136.16): each link's Plots show one union domain on its axes (a domain
  // group, as LinkViews' plots do) and pan and zoom together on them. A Plot's viewport change
  // goes to the others in its links; a change that comes back unchanged stops there.
  const links = untrack(() => (definition.links ?? []).map((link) => ({
    axes: link.axes, paths: link.parts.map((id) => pathOf(definition, id)),
  })));
  const linked = new Set(links.flatMap((link) => link.paths));
  const signatures = new Map(), handlers = new Map(), ids = new Map();
  for (const link of untrack(() => definition.links ?? []))
    for (const id of link.parts) ids.set(pathOf(definition, id), id);
  // While one change is passed on, the changes it causes in the others are not passed back.
  let linking = false;
  const viewportChanged = (path, viewport) => {
    const signature = JSON.stringify(viewport);
    if (signatures.get(path) === signature) return;
    signatures.set(path, signature);
    onviewportchange?.(ids.get(path), viewport);
    if (linking) return;
    linking = true;
    try {
      for (const link of links)
        if (link.paths.includes(path))
          for (const other of link.paths)
            if (other !== path) {
              if (link.axes === "xy") signatures.set(other, signature);
              instances.get(other)?.setViewport?.(viewport, link.axes);
            }
    } finally {
      linking = false;
    }
  };
  const extra = (path) => {
    if (!linked.has(path)) return undefined;
    if (!handlers.has(path)) handlers.set(path, { onviewportchange: (viewport) => viewportChanged(path, viewport) });
    return handlers.get(path);
  };
  // The domain groups, joined once every Plot of a link has mounted, and again only when one is
  // replaced (other parts registering leave them as they are).
  const handleKeys = new WeakMap();
  let handleCount = 0;
  const linkedKey = $derived(links.map((link) => link.paths.map((path) => {
    const handle = instances.get(path);
    if (!handle) return "";
    if (!handleKeys.has(handle)) handleKeys.set(handle, ++handleCount);
    return handleKeys.get(handle);
  }).join()).join(";"));
  $effect(() => {
    linkedKey;
    return untrack(() => {
      const leaves = [];
      for (const link of links) {
        const handles = link.paths.map((path) => instances.get(path));
        if (handles.some((handle) => !handle?.joinDomainGroup)) continue;
        const group = createDomainGroup(link.axes === "xy" ? ["x", "y"] : [link.axes]);
        leaves.push(...handles.map((handle) => handle.joinDomainGroup(group)));
      }
      return () => leaves.forEach((leave) => leave?.());
    });
  });

  // The main part's settings are the template's (TODO 130.2): the settings pane and Python's
  // scene runtime subscribe here, and listeners follow whichever main part is mounted, now or
  // later (a Transform mounts its children once it has run), each with its unsubscribe.
  // A template with settings adds the ones the viewer edited, as its props (Histogram's bins): a
  // value the caller passed or an input drives is theirs, not an edit to send back.
  const listeners = new Map();
  const edited = () => Object.fromEntries(settings
    .filter(([, setting]) => group.inLayer(setting.option, "user"))
    .map(([name]) => [name, untrack(() => settingValues)[name]]));
  // Until the main part reports, there is nothing whole to send (a listener reads its first
  // values as the baseline, and every later difference as an edit).
  let markValues = null;
  const notify = (listener) => { if (markValues) listener(group ? { ...markValues, ...edited() } : markValues); };
  const follow = (current, listener) => current?.subscribeSettings?.((values) => {
    markValues = values;
    notify(listener);
  });
  $effect(() => {
    const current = instances.get(main);
    if (!current?.subscribeSettings) return;
    for (const listener of listeners.keys()) listeners.set(listener, follow(current, listener));
    return () => {
      for (const [listener, stop] of listeners) { stop?.(); listeners.set(listener, undefined); }
    };
  });
  // A pause after typing in a setting's field before it is sent.
  $effect(() => {
    if (!group) return;
    settingValues;
    const timer = setTimeout(() => { for (const listener of listeners.keys()) notify(listener); }, 300);
    return () => clearTimeout(timer);
  });
  /** Follow the main part's settings (its mark options), as a mark's handle does. */
  export const subscribeSettings = (listener) => {
    listeners.set(listener, follow(untrack(() => instances.get(main)), listener));
    return () => { listeners.get(listener)?.(); listeners.delete(listener); };
  };
  /** The part the definition names with `id` (a Histogram's Bin, for its subscribe). */
  export const part = (id) => instances.get(pathOf(definition, id));
  /** A parameter's value now, a setting's edit included (Histogram's normalization). */
  export const parameter = (name) => params[name];
  export const getMark = () => instances.get(main)?.getMark?.();
  export const getLegendSource = () => instances.get(main)?.getLegendSource?.();
  /** Settles when every part has. */
  export const whenSettled = () => Promise.all([...instances.values()].map((part) => part.whenSettled?.()));
  const self = { getMark };
  /** This template as a connection endpoint: `at` is its main part's attachment or its own. */
  export const endpointOf = (config = {}) => endpointDescriptor({ handle: self, at: config.at, kind });
</script>

{#snippet tree()}
  <HostNode {definition} item={definition.root} path="0" {parts} {props} {params} {register} {main} endpoint={endpointSpec}
    content={children} extra={links.length ? extra : undefined} />
{/snippet}

{#if definition.theme && !definition.theme.routed}
  <ThemeDefaults kind={definition.theme.kind} defaults={definition.theme.defaults} only={definition.theme.only} beneath={definition.theme.beneath}
    values={evaluate(definition.theme.values ?? {}, params, definition.kind, props)}>{@render tree()}</ThemeDefaults>
{:else}
  {@render tree()}
{/if}
