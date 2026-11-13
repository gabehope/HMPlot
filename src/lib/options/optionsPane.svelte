<script module>
  // One settings pane open at a time, docked or floating, as popovers are (TODO 60).
  const openPanes = new Set();
</script>

<script>
  import { onDestroy, untrack, tick } from "svelte";
  import OptionsElement from "./optionsElement.svelte";
  import {
    mountedPlots,
    treeStore,
    scopes,
    survivingTarget,
    optionRows,
    groupedRows,
  } from "./inspector.js";
  /**
   * placement "drawer" (a Plot's or Facet's pane, TODO 60) slides in from the right inside its
   * parent element, so it stays within the plot, in a notebook too, when the plot is at least
   * DRAWER_MIN wide and tall; a smaller plot's pane floats beside its button instead, as
   * "popover" always does.
   */
  let { options, label, allowSharedDefaults = true, defaultsOnly = false, onclosed = undefined, placement = "popover", opened = $bindable(false) } = $props();
  const DRAWER_MIN = { width: 480, height: 320 };
  let floating = $state(true);
  const drawer = $derived(!floating);
  function fitsDrawer() {
    const host = panel?.parentElement?.getBoundingClientRect();
    // The size on screen: a phone zoomed out to fit a wide page shows the plot smaller.
    const viewport = window.visualViewport, scale = viewport?.scale ?? 1;
    if (!host || host.width * scale < DRAWER_MIN.width || host.height * scale < DRAWER_MIN.height) return false;
    // It docks at the plot's right edge, so that edge must be on screen.
    return host.right <= (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth) + 1;
  }
  // What each tree row is, beside its name (marks and groups show their type instead).
  const kindTags = { axis: "Frame", defaults: "All marks", plot: "Plot", theme: "Theme" };
  let panel, anchor, placementFrame;
  let content = $state();
  let searchInput = $state();
  let searchOpen = $state(false), infoOpen = $state(false);
  let shared = $state(untrack(() => defaultsOnly)),
    search = $state("");
  let selected = $state(untrack(() => `${options.uid}:view`)),
    collapsed = $state(new Set());
  let expanded = $state({}),
    left = $state(0),
    top = $state(0);
  let previousTargets = [], scrollTop = 0;
  let structureRevision = $state(0);
  // Closed panes keep their UI choices, but not tree or control subscriptions.
  $effect(() => {
    if (!opened) return;
    return treeStore(options.definitionRoot).subscribe((revision) => { structureRevision = revision; });
  });
  const targets = $derived.by(() => {
    if (!opened) return [];
    structureRevision;
    return scopes(options);
  });
  const target = $derived(
    shared
      ? {
          id: "shared",
          node: options.definitionRoot,
          kind: "shared",
          label: "Shared defaults",
          breadcrumb: ["Shared defaults"],
        }
      : (targets.find((t) => t.id === selected) ?? targets[0]),
  );
  const targetHelp = $derived(
    target.kind === "view"
      ? target.label === "Plot"
        ? "Controls this plot’s camera, projection, navigation, overview, and export."
        : "Controls the shared renderer, camera, projection, navigation, overview, and export."
      : target.kind === "axis"
        ? "Controls this coordinate frame’s scales, ticks, labels, grids, and reference lines."
        : target.kind === "defaults"
          ? "Defaults for marks in this plot. Group and mark overrides take precedence."
          : target.kind === "group"
            ? "Defaults for this group’s descendants. Mark overrides take precedence."
            : target.kind === "shared"
              ? "Defaults shared by mounted plots and their marks."
              : `Applies only to ${target.label}.`,
  );
  const rows = $derived.by(() => {
    structureRevision;
    return optionRows(target.node, "", {
      view: target.kind === "view",
      axis: target.kind === "axis",
      shared: target.kind === "shared",
    });
  });
  const groups = $derived(groupedRows(rows, search));
  const visibleTargets = $derived(
    targets.filter((item) => {
      let parent = item.depth ? item.parent : null;
      while (parent) {
        if (collapsed.has(parent)) return false;
        const ancestor = targets.find((t) => t.id === parent);
        parent = ancestor?.depth ? ancestor.parent : null;
      }
      return true;
    }),
  );
  $effect(() => {
    if (!opened) return;
    const next = targets;
    const recovered = survivingTarget(
      untrack(() => selected),
      previousTargets,
      next,
    );
    previousTargets = next;
    if (recovered !== untrack(() => selected)) selected = recovered;
  });
  function place() {
    if (drawer || !opened || !panel || !anchor?.isConnected) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const offsetX = viewport?.offsetLeft ?? 0,
      offsetY = viewport?.offsetTop ?? 0;
    left = Math.max(
      offsetX + 8,
      Math.min(a.right - p.width, offsetX + width - p.width - 8),
    );
    const below = a.bottom + 8;
    top =
      below + p.height <= offsetY + height - 8
        ? below
        : Math.max(offsetY + 8, a.top - p.height - 8);
    top = Math.min(top, Math.max(offsetY + 8, offsetY + height - p.height - 8));
    // Position before the first visible frame, including reopening after a
    // viewport resize. Waiting for a render effect exposes the old position.
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
  function schedulePlace() {
    cancelAnimationFrame(placementFrame);
    placementFrame = requestAnimationFrame(place);
  }
  const self = { close: (options) => close(options) };
  export async function open(element) {
    anchor = element;
    for (const other of [...openPanes]) if (other !== self) other.close({ restoreFocus: false });
    openPanes.add(self);
    // Decided at each opening; a pane that is open keeps its placement.
    const float = placement !== "drawer" || !fitsDrawer();
    if (float !== floating) {
      floating = float;
      await tick();
    }
    if (drawer) {
      opened = true;
      await tick();
      content.scrollTop = scrollTop;
      panel.focus({ preventScroll: true });
      return;
    }
    panel.showPopover();
    opened = true;
    await tick();
    content.scrollTop = scrollTop;
    place();
    schedulePlace();
  }
  export function close({ restoreFocus = true } = {}) {
    if (!opened) return;
    if (drawer) {
      closed();
      if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
      return;
    }
    panel.hidePopover();
    if (restoreFocus && anchor?.isConnected)
      anchor.focus({ preventScroll: true });
  }
  export function isAnchoredTo(element) {
    return opened && anchor === element;
  }
  function closed() {
    openPanes.delete(self);
    scrollTop = content?.scrollTop ?? scrollTop;
    opened = false;
    infoOpen = false;
    cancelAnimationFrame(placementFrame);
    onclosed?.();
  }
  function toggled(event) {
    if (event.newState === "open") { opened = true; return; }
    if (
      anchor?.isConnected &&
      (document.activeElement === document.body ||
        panel?.contains(document.activeElement))
    )
      anchor.focus({ preventScroll: true });
    closed();
  }
  // A docked pane closes as a popover does: on Escape with focus in its plot (or nowhere), and
  // on a press outside its plot; the plot itself stays usable while it is open.
  $effect(() => {
    if (!drawer || !opened) return;
    const host = panel.parentElement;
    const key = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const active = document.activeElement;
      if (active === document.body || host?.contains(active)) {
        event.preventDefault();
        close();
      }
    };
    const press = (event) => {
      if (!host?.contains(event.target) && !anchor?.contains?.(event.target)) close({ restoreFocus: false });
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", press, true);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", press, true);
    };
  });
  $effect(() => {
    if (drawer || !opened) return;
    const observer = new ResizeObserver(schedulePlace);
    if (anchor) observer.observe(anchor);
    let trackingFrame,
      lastRect = "";
    function trackAnchor() {
      const rect = anchor?.getBoundingClientRect();
      const next = rect
        ? `${rect.x},${rect.y},${rect.width},${rect.height}`
        : "";
      if (next !== lastRect) {
        lastRect = next;
        place();
      }
      trackingFrame = requestAnimationFrame(trackAnchor);
    }
    trackingFrame = requestAnimationFrame(trackAnchor);
    // Capture ancestor scrolling too; a host's scroller may move the anchor.
    window.addEventListener("scroll", schedulePlace, true);
    window.visualViewport?.addEventListener("resize", schedulePlace);
    window.visualViewport?.addEventListener("scroll", schedulePlace);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(trackingFrame);
      window.removeEventListener("scroll", schedulePlace, true);
      window.visualViewport?.removeEventListener("resize", schedulePlace);
      window.visualViewport?.removeEventListener("scroll", schedulePlace);
    };
  });
  function choose(id) {
    selected = id;
    infoOpen = false;
    if (content) content.scrollTop = 0;
  }
  function treeKey(event, item) {
    let next;
    const index = visibleTargets.findIndex((t) => t.id === item.id);
    if (event.key === "ArrowDown")
      next = visibleTargets[Math.min(index + 1, visibleTargets.length - 1)];
    if (event.key === "ArrowUp") next = visibleTargets[Math.max(index - 1, 0)];
    if (event.key === "Home") next = visibleTargets[0];
    if (event.key === "End") next = visibleTargets.at(-1);
    if (event.key === "ArrowRight") {
      const children = targets.filter(
        (t) => t.depth > 0 && t.parent === item.id,
      );
      if (collapsed.has(item.id)) {
        collapsed = new Set([...collapsed].filter((id) => id !== item.id));
        event.preventDefault();
      } else next = children[0];
    }
    if (event.key === "ArrowLeft") {
      if (
        targets.some((t) => t.depth > 0 && t.parent === item.id) &&
        !collapsed.has(item.id)
      ) {
        collapsed = new Set([...collapsed, item.id]);
        event.preventDefault();
      } else next = targets.find((t) => t.id === item.parent);
    }
    if (next) {
      event.preventDefault();
      choose(next.id);
      panel.querySelector(`[data-target="${next.id}"]`)?.focus();
    }
  }
  function sectionOpen(group) {
    return (
      !!search.trim() ||
      (expanded[`${target.id}:${group.id}`] ??
        false)
    );
  }
  function toggleSection(group) {
    if (search.trim()) return;
    const key = `${target.id}:${group.id}`;
    expanded = { ...expanded, [key]: !sectionOpen(group) };
  }
  function goToLevels() {
    search = "";
    expanded = { ...expanded, [`${target.id}:Appearance/Color mapping`]: true };
    requestAnimationFrame(() => {
      const field = panel.querySelector('[data-setting="levels"]');
      field?.scrollIntoView({ block: "nearest" });
      field?.querySelector("input:not([type=range])")?.focus();
    });
  }
  onDestroy(() => {
    close({ restoreFocus: false });
    cancelAnimationFrame(placementFrame);
  });
</script>

<svelte:window onresize={schedulePlace} />
<div
  bind:this={panel}
  class="pane"
  class:drawer
  class:floating={!drawer}
  class:open={opened}
  popover={drawer ? undefined : "auto"}
  role="dialog"
  tabindex="-1"
  onkeydown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
  }}
  aria-label={`Settings · ${label}`}
  ontoggle={drawer ? undefined : toggled}
  style:left={drawer ? undefined : `${left}px`}
  style:top={drawer ? undefined : `${top}px`}
>
  {#if opened}
  <header>
    <h2>Settings · {label}</h2>
    <button class="close" onclick={() => close()} aria-label="Close settings"
      >×</button
    >
  </header>
  {#if shared}
    <div class="banner">
      <strong>Editing shared defaults</strong>
      <p>
        Applies to: {$mountedPlots.filter(plot => plot.node.definitionRoot === options.definitionRoot).map((plot) => plot.label).join(", ")}. Local
        overrides are preserved.
      </p>
      {#if !defaultsOnly}<button
        onclick={() => {
          shared = false;
          selected = targets[0].id;
          search = "";
        }}>Return to {label}</button>{/if}
      >
    </div>
  {:else}
    <div class="tree" role="tree" aria-label="Settings targets">
      {#each visibleTargets as item (item.id)}
        {@const hasChildren = targets.some(
          (t) => t.depth > 0 && t.parent === item.id,
        )}
        <button
          role="treeitem"
          aria-level={item.depth + 1}
          aria-selected={selected === item.id}
          aria-expanded={hasChildren ? !collapsed.has(item.id) : undefined}
          tabindex={selected === item.id ? 0 : -1}
          class:active={selected === item.id}
          data-target={item.id}
          onclick={(event) => {
            if (hasChildren && event.target.closest(".branch"))
              collapsed = collapsed.has(item.id)
                ? new Set([...collapsed].filter((id) => id !== item.id))
                : new Set([...collapsed, item.id]);
            choose(item.id);
          }}
          onkeydown={(event) => treeKey(event, item)}
        >
          {#each { length: item.depth } as _}<span class="guide" aria-hidden="true"></span>{/each}
          <span class="branch" aria-hidden="true"
            >{hasChildren ? (collapsed.has(item.id) ? "▸" : "▾") : ""}</span
          >
          <span class="name">{item.label}</span>{#if item.kind === "mark" || item.kind === "group"}<small
            >{item.kind === "mark" ? (item.type ?? "Mark") : "Group"}</small
          >{:else if kindTags[item.kind]}<small aria-hidden="true">{kindTags[item.kind]}</small>{/if}
        </button>
      {/each}
    </div>
  {/if}
  <div class="context">
    <div class="context-heading">
      <div class="breadcrumb" aria-label="Selected settings target">
        {target.breadcrumb.join(" › ")}
      </div>
      <button class:active={searchOpen} class="icon-button" aria-label="Search settings" title="Search settings" aria-expanded={searchOpen} aria-pressed={searchOpen} onclick={async () => { infoOpen = false; searchOpen = !searchOpen; if (!searchOpen) search = ''; else { await tick(); searchInput?.focus(); } }}
        ><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.75" cy="6.75" r="4.25" /><path d="M10 10l3.75 3.75" /></svg></button>
      <button class:active={infoOpen} class="icon-button info-button" aria-label="About this settings target" title="About this target" aria-expanded={infoOpen} aria-pressed={infoOpen} onclick={() => { searchOpen = false; search = ''; infoOpen = !infoOpen; }}>i</button>
    </div>
    {#if infoOpen}<div class="info-drawer">
      {#if target.customCoordinates}<small>Custom positional mapping overrides this Axis.</small>{/if}
      <p>{targetHelp}</p>
      {#if target.node.presentation.channelProvenance}
        <dl class="provenance">
          {#each Object.entries(target.node.presentation.channelProvenance) as [channel, source]}
            <div><dt>{channel}</dt><dd>{source.kind === 'explicit' ? 'mark property' : source.label}</dd></div>
          {/each}
        </dl>
      {/if}
      {#each target.node.presentation.ignoredMappings ?? [] as item}
        <small>{item.source}.{item.property} is ignored: {item.reason}</small>
      {/each}
    </div>{/if}
  </div>
  {#if searchOpen}<input
    bind:this={searchInput}
    onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); search = ''; searchOpen = false; panel.querySelector('[aria-label="Search settings"]')?.focus(); } }}
    class="search"
    type="search"
    aria-label="Search settings"
    placeholder="Search this target…"
    bind:value={search}
  />{/if}
  <div class="content" bind:this={content}>
    {#each groups as group (group.id)}
      <details open={sectionOpen(group)} data-group={group.label}>
        <summary
          onclick={(event) => {
            event.preventDefault();
            toggleSection(group);
          }}
          ><span>{group.label}</span>{#if group.section !== "Plot"}<small
            >{group.section}</small
          >{/if}</summary
        >
        {#if group.label === "Grid"}<p class="section-help">
            Grid styling applies when Show grid is enabled.
          </p>{/if}
        {#if group.label === "Dashes"}<p class="section-help">
            Dash and gap lengths apply when Dashed line is enabled.
          </p>{/if}
        {#if group.label === "Contours"}<p class="section-help">
            Contour styling applies when Show contours is enabled.
            {#if rows.some((row) => row.key === "levels")}Spacing uses <button
                onclick={goToLevels}>Levels in Color mapping</button
              >.{/if}
          </p>{/if}
        {#each group.rows as row (row.id)}<OptionsElement {row} />{/each}
      </details>
    {/each}
    {#if !groups.length}<p class="empty">No matching settings.</p>{/if}
  </div>
  {#if allowSharedDefaults && !shared}<footer>
      <button
        onclick={() => {
          shared = true;
          search = "";
          if (content) content.scrollTop = 0;
        }}>Shared defaults…</button
      ><span>Affects multiple plots</span>
    </footer>{/if}
  {/if}
</div>

<style>
  /* Colors from the plot's theme (--hm-theme-*, set on the plot) unless the page sets
     --hm-controls-* (controlsTheme.js); the rest are mixed from them. */
  .pane {
    --bg: var(--hm-controls-background, var(--hm-theme-background, #fff));
    --fg: var(--hm-controls-color, var(--hm-theme-color, #252b38));
    --accent-base: var(--hm-controls-accent, #5261d8);
    --accent: color-mix(in srgb, var(--accent-base) 60%, var(--fg));
    --selected: color-mix(in srgb, var(--accent-base) 15%, var(--bg));
    --muted: color-mix(in srgb, var(--fg) 62%, var(--bg));
    --border: color-mix(in srgb, var(--fg) 13%, var(--bg));
    --field: color-mix(in srgb, var(--fg) 5%, var(--bg));
    --guide: color-mix(in srgb, var(--fg) 15%, var(--bg));
    color-scheme: var(--hm-theme-scheme, light);
    color: var(--fg);
    background: var(--bg);
    margin: 0;
    padding: 0;
    overflow: hidden;
    font: 13px/1.4 var(--hm-controls-font, system-ui, sans-serif);
    box-sizing: border-box;
    text-align: left;
  }
  .floating {
    position: fixed;
    inset: auto;
    width: 320px;
    max-width: calc(100dvw - 16px);
    height: 640px;
    max-height: calc(100dvh - 16px);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 14px 55px #101a352b;
  }
  .floating:popover-open {
    display: flex;
    flex-direction: column;
  }
  /* On a big enough plot, the same card docks inside the plot's right side, full height, and
     slides in (a drawer's behavior, a popover's look). */
  .drawer {
    position: absolute;
    top: 8px;
    right: 8px;
    bottom: 8px;
    z-index: 30;
    width: min(300px, 85%);
    min-height: 220px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 10px 36px #101a352b;
    transform: translateX(14px);
    opacity: 0;
    visibility: hidden;
    transition: transform 140ms ease, opacity 140ms ease, visibility 0s linear 140ms;
  }
  .drawer.open {
    transform: none;
    opacity: 1;
    visibility: visible;
    transition: transform 140ms ease, opacity 140ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .drawer, .drawer.open { transition: none; }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 8px 6px 12px;
    flex-shrink: 0;
  }
  h2 {
    font-size: 13px;
    margin: 0;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button,
  input {
    font: inherit;
    color: inherit;
  }
  button {
    cursor: pointer;
  }
  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .close {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    font-size: 20px;
    line-height: 26px;
    color: var(--muted);
  }
  .close:hover { background: var(--field); }
  /* The plot's own structure: one row per settings target, indented under its parent. */
  .tree {
    flex: 0 0 auto;
    max-height: min(150px, 34%);
    overflow: auto;
    margin: 0 6px;
    padding: 0 0 4px;
    border-bottom: 1px solid var(--border);
  }
  .tree button {
    display: flex;
    align-items: center;
    width: 100%;
    height: 24px;
    gap: 0;
    text-align: left;
    border: 0;
    border-radius: 5px;
    background: transparent;
    padding: 0 8px 0 4px;
    font-size: 12px;
  }
  .tree button:hover { background: var(--field); }
  .tree .active,
  .tree .active:hover {
    background: var(--selected);
    color: var(--accent);
  }
  .guide {
    flex: 0 0 14px;
    align-self: stretch;
    background: linear-gradient(var(--guide), var(--guide)) 6px 0 / 1px 100% no-repeat;
  }
  .branch {
    flex: 0 0 14px;
    color: var(--muted);
    font-size: 10px;
    text-align: center;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    font-size: 10px;
    color: var(--muted);
    font-weight: 400;
  }
  .tree small {
    margin-left: auto;
    padding-left: 8px;
    white-space: nowrap;
  }
  .context {
    padding: 6px 8px 2px 12px;
    flex-shrink: 0;
  }
  .context-heading { display:flex; align-items:center; gap:2px; min-height:24px; }
  .breadcrumb {
    font-size: 11px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1 1 auto;
  }
  .icon-button {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    background: transparent;
  }
  .icon-button:hover { background: var(--field); }
  .icon-button.active { color: var(--accent); background: var(--selected); }
  .icon-button svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; }
  .info-button { font: 600 12px/1 Georgia, serif; font-style: italic; }
  .info-drawer {
    margin: 4px 4px 0 0;
    padding: 7px 8px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--field);
  }
  .context p {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }
  .search {
    flex-shrink: 0;
    margin: 4px 12px 6px;
    width: calc(100% - 24px);
    box-sizing: border-box;
    background: var(--field);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 6px 9px;
  }
  .content {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
    scrollbar-gutter: stable;
    overflow-anchor: none;
    padding: 0 8px 12px 12px;
  }
  details {
    border-top: 1px solid var(--border);
    padding: 8px 0;
  }
  details:first-child { border-top: 0; }
  summary {
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
  }
  summary small {
    float: right;
  }
  footer {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    padding: 9px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  footer button,
  .banner button,
  .section-help button {
    border: 0;
    padding: 0;
    background: none;
    color: var(--accent);
    font-size: 11px;
  }
  footer span {
    font-size: 10px;
    color: var(--muted);
  }
  .banner {
    background: var(--field);
    border-block: 1px solid var(--border);
    padding: 10px 12px;
    font-size: 12px;
    flex-shrink: 0;
  }
  .banner p,
  .section-help {
    font-size: 11px;
    color: var(--muted);
    margin: 6px 0;
  }
  .empty {
    color: var(--muted);
    font-size: 12px;
  }
</style>
