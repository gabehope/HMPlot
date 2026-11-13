<script>
  import { getContext, setContext, untrack, onDestroy } from "svelte";
  import registry from "./registry.json";
  import { VIEW_CONTEXT } from "../plot/utils/axisFrame.js";
  import { facetService, partitionGroup } from "../plot/utils/facetService.js";
  import SceneNode from "./SceneNode.svelte";
  import Theme from "../plot/theme.svelte";
  import { INPUT_CONTEXT, InputPending, foldConstants, resolveInputs } from "../plot/utils/inputs.js";
  import { InputStore } from "../plot/utils/inputStore.svelte.js";
  import { provideClockScope } from "../plot/utils/clockScope.js";
  import { stable } from "./stableProps.js";
  import { propCells } from "./propCells.svelte.js";
  import { provideReporter, useReporter } from "../plot/utils/reporter.js";
  import { ALIGN_GROUP, ALIGN_MEMBER, createAlignGroup } from "../plot/utils/alignGroup.svelte.js";
  import { createDomainGroup } from "../plot/utils/domainGroup.js";
  import { TEMPLATE_SCOPE, templateScope } from "../templates/templateScope.svelte.js";
  import { getOptionsContext, setOptionsContext } from "../plot/utils/context.js";
  // Kinds that own the settings pane's structure (a Plot's or Facet's scopes, a Frame's axes, a
  // layout's views): a Template holding one makes no settings group around it.
  const VIEW_KINDS = new Set(["Scene", "Plot", "Facet", "Frame", "Row", "Column", "LayoutGrid", "LinkViews", "Markdown", "Title"]);
  const holdsView = (item) => item.children.some((child) => child.kind !== "Slot" && (VIEW_KINDS.has(child.kind) || registry.components[child.kind]?.figure || holdsView(child)));
  const holdsMark = (item) => item.children.some((child) => child.kind !== "Slot" && ((registry.marks.includes(child.kind) && child.kind !== "Anchor") || holdsMark(child)));
  let { node, runtime, slotId = null, slotChildren = null } = $props();
  const facet = facetService();
  const partition = partitionGroup();
  const embeddedView = getContext(VIEW_CONTEXT);
  // A node repeated by a Facet cell and/or Partition groups registers one handle per instance:
  // the facet cell key, then each enclosing Partition's group key, joined by "/".
  const facetKey = facet?.key() ?? "", groupKey = partition?.runtimeKey ?? "";
  const key = [facetKey, groupKey].filter(Boolean).join("/");
  const instance = { facet: facetKey, partition: groupKey };
  let handle = $state(),
    element = $state(),
    layoutElement = $state();
  // Alignment groups (TODO 136.10 slice 5): a layout's direct Plot children line up their plot
  // areas; nothing deeper joins (a Plot's own children, a Facet's cells).
  const parentGroup = getContext(ALIGN_GROUP) ?? null;
  setContext(ALIGN_MEMBER, untrack(() => node.kind) === "Plot" ? parentGroup : null);
  const nodeSpec = registry.components[untrack(() => node.kind)];
  const ownGroup = nodeSpec?.layout ? createAlignGroup(() => layoutElement) : null;
  setContext(ALIGN_GROUP, ownGroup ?? (nodeSpec?.passthrough ? parentGroup : null));
  $effect(() => {
    if (ownGroup && layoutElement) return ownGroup.watch(layoutElement);
  });
  // Inputs (TODO 41). The Scene, an InputContext and each Template instance are input contexts:
  // their inputs are declared here at once, before any child renders, so a Plot placed before
  // its Slider resolves too. Every node's props then have their input reads replaced by the
  // values ("$name" strings only where a string names a column: the registry's stringReads).
  // A SceneNode keeps its node's id (SceneNode children are keyed by id), so its kind is fixed.
  const kind = untrack(() => node.kind), nodeId = untrack(() => node.id);
  // Its components' errors are this node's diagnostics (TODO 136.6, utils/reporter.js).
  provideReporter({ node: nodeId, kind, report: (owner, entry) => runtime._reportDiagnostic(owner, entry) });
  const reportInputs = useReporter(kind);
  const outerInputs = getContext(INPUT_CONTEXT) ?? null;
  const inputStore = registry.inputContexts.includes(kind) ? new InputStore(outerInputs) : null;
  if (inputStore) {
    setContext(INPUT_CONTEXT, inputStore);
    // The Scene is a clock scope (TODO 50): all its Plots, Playbacks and Simulates share one
    // clock. Its InputContexts and Template instances reuse it.
    provideClockScope();
    untrack(() => runtime.declareInputs(node, inputStore));
    $effect.pre(() => {
      const current = node;
      // A root replaced by another (SceneRenderer keys it by id) is unmounting: it declares nothing.
      if (current.id === nodeId) untrack(() => runtime.declareInputs(current, inputStore));
    });
    // The viewer's changes, and values read from the data, go to Python; Python's own do not.
    $effect(() => inputStore.subscribe((name, value, origin) => {
      if (origin !== "python") runtime.sendInput(inputStore, name, value);
    }));
  }
  const inputs = inputStore ?? outerInputs;
  const reads = new Set(registry.components[kind]?.stringReads ?? []);
  // A prop that takes a plain value may be an expression of inputs in a Python scene (TODO
  // 69.10): a Frame's placement turned by a Playback, a Force's dimensions from a select. Once the
  // reads are replaced it reads constants only, and is evaluated here (foldConstants). Channels
  // and transform expressions (the registry's stringReads) stay expressions: a mark reads a
  // constant from a uniform, so a new value compiles nothing.
  const fold = (props) => {
    let out = props;
    for (const [name, value] of Object.entries(props ?? {})) {
      if (reads.has(name)) continue;
      const next = foldConstants(value);
      if (next !== value) (out = out === props ? { ...props } : out)[name] = next;
    }
    return out;
  };
  // The props this node's component got last (TODO 69.10): the resources resolve each plain
  // object and list anew, so when an input this node reads changes, every other prop would reach
  // the component as a new object too, and a Frame turned by a Playback re-configured on each of
  // its frames. A value equal to the one before is handed on as that one (stable).
  let last = null;
  const resolved = $derived.by(() => {
    const raw = runtime.props(node, key, instance);
    try {
      // Transform owns its parameter expressions and settings layer. Resolving them here
      // would serialize their current values as viewer edits and freeze exported controls.
      const resolved = resolveInputs(kind === "Transform" ? { ...raw, params: undefined } : raw,
        inputs, node.kind, (name) => reads.has(name));
      if (kind === "Transform") resolved.params = raw.params;
      last = stable(fold(resolved), last);
      return { props: last, error: "" };
    } catch (error) {
      // An input still reading the data: the reads pass through, and the transform or mark that
      // receives them waits for the value (TODO 41.2).
      if (error instanceof InputPending) return { props: raw, error: "" };
      console.error(error);
      return { props: raw, error: error.message };
    }
  });
  $effect(() => reportInputs(resolved.error));
  // A Playback's play and pause go to Python, which keeps them as its `playing`.
  const playingChange = (playing) => runtime.sendPlaying(node.id, playing);
  const props = $derived(node.kind === "Playback" ? { ...resolved.props, inputOwner: node.id, onplayingchange: playingChange }
    : registry.inputs.includes(node.kind) ? { ...resolved.props, inputOwner: node.id }
    : node.kind === "InputContext" ? { ...resolved.props, store: inputStore } : resolved.props);
  // Each prop reaches the component as a value of its own (propCells.svelte.js).
  const { sync, props: shared } = propCells();
  untrack(() => sync(props));
  $effect.pre(() => {
    const next = props;
    untrack(() => sync(next));
  });
  const Component = $derived(runtime._components[node.kind]);
  // A Row's `widths` (TODO 69.16): each child's share of the row, in order, in a cell that grows
  // by its share over the smallest from min_width scaled the same way, so the shares hold at every
  // width and, with wrap, the row stacks once its narrowest share would start below min_width.
  // (Grow factors of 1 and more: a line whose factors sum below 1 would leave space unfilled.)
  const cells = $derived.by(() => {
    if (node.kind !== "Row" || !Array.isArray(props.widths) || !props.widths.length) return null;
    const shares = props.widths.map((share) => (Number(share) > 0 && Number.isFinite(Number(share)) ? Number(share) : 1));
    const least = Math.min(...shares), minWidth = props.minWidth ?? 320;
    return (index) => { const grow = (shares[index] ?? least) / least; return `${grow} 1 ${minWidth * grow}px`; };
  });
  // Template scopes (TODO 130.2): a Template's other marks follow its main part's visibility
  // (its `contract`); a Slot's children are the caller's, in the enclosing scope.
  const outerScope = getContext(TEMPLATE_SCOPE) ?? null;
  if (kind === "Template") {
    const scope = templateScope(() => props.contract);
    // A Template inside a Plot is one settings group (slice 9c), "lollipop 1" by its kind; one
    // that holds views (a Plot, Facet, Frame or layout), or no mark of its own, makes none.
    let outerOptions;
    try { outerOptions = getOptionsContext(); } catch { /* outside a Plot */ }
    const label = untrack(() => props.contract?.kind);
    const item = untrack(() => node);
    if (outerOptions && typeof label === "string" && !holdsView(item) && holdsMark(item)) {
      // A stable identifier (the same in every Facet cell and Partition group, which match
      // options by path); the label numbers the template's instances.
      const group = outerOptions.split(outerOptions.availableDependentIdentifier(`template:${label}`));
      const used = new Set([...outerOptions.dependents.values()].filter((other) => other !== group).map((other) => other.presentation.label));
      let index = 1;
      while (used.has(`${label} ${index}`)) index++;
      group.setPresentation({ kind: "group", label: `${label} ${index}`, type: "Group" });
      setOptionsContext(group);
      scope.group = group;
      scope.outerOptions = outerOptions;
      onDestroy(() => group.dispose());
    }
  }
  // A Slot's children are the caller's: the enclosing template scope, and outside the template's
  // settings group when the slot sits directly in it (a Frame or Partition the template put
  // above its slot still holds them).
  if (kind === "Slot") {
    setContext(TEMPLATE_SCOPE, outerScope?.outer ?? null);
    let current;
    try { current = getOptionsContext(); } catch { /* outside a Plot */ }
    if (outerScope?.group && current === outerScope.group) setOptionsContext(outerScope.outerOptions);
  }
  const markKind = registry.marks.includes(kind) && kind !== "Anchor";
  $effect(() => {
    const id = node.id, h = handle;
    if (markKind && outerScope && h) return untrack(() => outerScope.part(id, h, key));
  });
  let registered, unregister;
  $effect(() => {
    const id=node.id,h=handle,e=element;
    if(!h)return;
    untrack(()=>{
      if(registered?.id===id&&registered.handle===h&&registered.element===e)return;
      unregister?.();registered={id,handle:h,element:e};
      unregister=runtime.register(id,key,h,e,facet?.cell(),partition&&{key:partition.key,values:partition.values,label:partition.label});
    });
  });
  onDestroy(()=>unregister?.());
  $effect(() => {
    if (handle?.subscribe && node.kind !== "Legend") {
      const id = node.id,
        h = handle;
      return untrack(() => runtime.observeStatus(node, h));
    }
  });
  $effect(() => {
    if (handle?.subscribeDescription && node.kind === "Plot") {
      const n = node, h = handle;
      return untrack(() => runtime.observeDescription(n, h));
    }
  });
  $effect(() => {
    if (handle?.subscribeSettings) {
      const n = node,
        h = handle;
      return untrack(() => runtime.observeSettings(n, h));
    }
  });
  $effect(() => {
    if (node.kind === "LinkViews") {
      runtime.links.set(node.id, {
        ids: node.props.plots.map((p) => p.$ref),
        axes: props.axes ?? "xy",
      });
      return () => runtime.links.delete(node.id);
    }
  });
  // LinkViews' plots show one union domain on their linked axes by default (TODO 136.14):
  // each Plot joins the link's domain group once it is registered, and again only when one of
  // them is replaced (other nodes registering leave the group as it is).
  const handleKeys = new WeakMap();
  let handleCount = 0;
  const linkedHandles = () =>
    node.kind === "LinkViews"
      ? node.props.plots.map((p) => runtime.reference(p.$ref))
      : [];
  const linkedKey = $derived(
    linkedHandles()
      .map((h) => {
        if (!h) return "";
        if (!handleKeys.has(h)) handleKeys.set(h, ++handleCount);
        return handleKeys.get(h);
      })
      .join(),
  );
  $effect(() => {
    linkedKey;
    if (node.kind !== "LinkViews" || (props.scales ?? "shared") !== "shared") return;
    const axes = props.axes ?? "xy";
    return untrack(() => {
      const group = createDomainGroup(axes === "xy" ? ["x", "y"] : [axes]),
        leaves = linkedHandles().map((h) => h?.joinDomainGroup?.(group));
      return () => leaves.forEach((leave) => leave?.());
    });
  });
</script>

{#snippet children()}{#each node.children as child, index (child.id)}{#if cells}<div class="hm-cell" style:flex={cells(index)}><SceneNode
      node={child}
      {runtime}
      {slotId}
      {slotChildren}
    /></div>{:else}<SceneNode
      node={child}
      {runtime}
      {slotId}
      {slotChildren}
    />{/if}{/each}{/snippet}
{#if registry.components[node.kind]?.layout}
  <div
    bind:this={layoutElement}
    class="hm-layout"
    data-kind={node.kind}
    style:display={node.kind === "LayoutGrid" ? "grid" : "flex"}
    style:flex-direction={node.kind === "Row"
      ? "row"
      : "column"}
    style:flex-wrap={props.wrap ? "wrap" : undefined}
    style:gap={`${props.gap ?? 16}px`}
    style:grid-template-columns={node.kind === "LayoutGrid"
      ? `repeat(${props.columns ?? 2},minmax(0,1fr))`
      : undefined}
    style:--hm-min-width={`${props.minWidth ?? 320}px`}
  >
    {#if node.kind === "Scene" && props.theme}
      <Theme value={props.theme}>{@render children()}</Theme>
    {:else}
      {@render children()}
    {/if}
  </div>
{:else if (node.kind === "Plot")}
  <section class="hm-plot" bind:this={element}>
    {#if resolved.error}<div role="alert" class="hm-input-error">{resolved.error}</div>{/if}
    <Component {...shared} bind:this={handle}>{@render children()}</Component>
  </section>
{:else if (node.kind === "Facet" && !embeddedView) || nodeSpec?.figure || node.kind === "Minimap" || node.kind === "Legend" || node.kind === "Title" || node.kind === "Markdown"}
  <section
    class:hm-mini={node.kind === "Minimap"}
    class:hm-guide={node.kind === "Legend"}
    class:hm-text={node.kind === "Title" || node.kind === "Markdown"}
    class="hm-plot"
    bind:this={element}
  >
    <Component {...shared} bind:this={handle}>{@render children()}</Component>
  </section>
{:else if node.kind === "LinkViews"}<!-- Browser-local view link. -->
{:else if node.kind === "Slot" && node.id === slotId}{@render slotChildren?.()}
{:else if registry.components[node.kind]?.passthrough}<!-- Python Template/Slot: its children only, no element. -->{@render children()}
{:else if Component}
  {#if registry.components[node.kind].container}<Component
      {...shared}
      bind:this={handle}>{@render children()}</Component
    >
  {:else}<Component {...shared} bind:this={handle} />{/if}
{/if}

<style>
  .hm-layout {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    align-items: stretch;
  }
  .hm-layout[data-kind="Row"] > :global(*) {
    flex: 1 1 var(--hm-min-width);
    min-width: 0;
  }
  .hm-cell {
    min-width: 0;
  }
  .hm-cell:empty {
    display: none;
  }
  /* Inputs keep their natural control widths in a Row; plot children still share its width. */
  .hm-layout[data-kind="Row"] > :global(.hm-input) {
    flex: 0 1 auto;
    align-self: center;
  }
  .hm-plot {
    min-width: 0;
    width: 100%;
    overflow: hidden;
  }
  .hm-plot.hm-mini {
    width: fit-content;
    max-width: 100%;
  }
  .hm-plot.hm-guide { overflow: visible; }
  .hm-plot.hm-text { overflow: visible; }
  .hm-input-error {
    padding: 6px 10px;
    color: #a32b30;
    background: #fff0ef;
    font: 12px system-ui;
  }
</style>
