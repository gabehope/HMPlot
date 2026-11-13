<script lang="ts">
  import { createScreenMappingRelay } from "./utils/screenMapping.js";
  import { provideAnimationGroup } from "./utils/animationGroupContext.js";
  import Core from "./viewCore.svelte";
  import DataBoundary from "./dataBoundary.svelte";
  import Theme from "./theme.svelte";
  import { getContext, onDestroy, untrack } from "svelte";
  import { PANELS_CONTEXT } from "./utils/panels.svelte.js";
  import { THEME_CONTEXT } from "./utils/theme.js";
  import { themes } from "./utils/themePresets.js";
  import type { PlotProps, PlotHandle, ScreenMapping } from "./publicTypes.js";
  let {
    data = undefined,
    key = undefined,
    schema = undefined,
    animationGroup = undefined,
    children,
    type = $bindable("2d"),
    ...props
  }: PlotProps = $props();
  provideAnimationGroup(() => animationGroup);
  let handle = $state<any>();
  const inheritedTheme = getContext(THEME_CONTEXT);
  const mapping = createScreenMappingRelay();
  export const getScreenMapping = (): ScreenMapping | null => mapping.getScreenMapping();
  export const subscribeScreenMapping = (listener: (mapping: ScreenMapping | null) => void): (() => void) => mapping.subscribeScreenMapping(listener);
  $effect(() => {
    mapping.connect(handle);
    return () => mapping.connect(null);
  });
  onDestroy(() => mapping.dispose());
  export const openSettings: PlotHandle["openSettings"] = (...args) => handle?.openSettings(...args);
  export const closeSettings: PlotHandle["closeSettings"] = (...args) => handle?.closeSettings(...args);
  export const beginUpdate: PlotHandle["beginUpdate"] = (...args) => handle?.beginUpdate(...args);
  export const whenSettled: PlotHandle["whenSettled"] = (...args) => handle?.whenSettled(...args);
  export const whenAnimationsFinished: PlotHandle["whenAnimationsFinished"] = (...args) =>
    handle?.whenAnimationsFinished(...args);
  export const exportPNG: PlotHandle["exportPNG"] = (...args) => handle?.exportPNG(...args);
  export const exportVideo: PlotHandle["exportVideo"] = (...args) => handle?.exportVideo(...args);
  export const exportSVG: PlotHandle["exportSVG"] = (...args) => handle?.exportSVG(...args);
  export const exportPDF: PlotHandle["exportPDF"] = (...args) => handle?.exportPDF(...args);
  export const getAxisLayout = (...args) => handle?.getAxisLayout(...args);
  export const getDiagnostics = (...args) => handle?.getDiagnostics(...args);
  export const getLegendSource = (...args) => handle?.getLegendSource(...args);
  export const getMinimapSource = (...args) =>
    handle?.getMinimapSource(...args);
  export const getRenderError: PlotHandle["getRenderError"] = (...args) => handle?.getRenderError(...args);
  export const getRenderDiagnostic = (...args) => handle?.getRenderDiagnostic?.(...args);
  export const listDiagnostics = (...args) => handle?.listDiagnostics?.(...args) ?? [];
  export const prepareLints = () => handle?.prepareLints?.();
  export const setViewport: PlotHandle["setViewport"] = (...args) => handle?.setViewport(...args) ?? Promise.resolve();
  export const getViewport: PlotHandle["getViewport"] = (...args) => handle?.getViewport(...args);
  export const fit: PlotHandle["fit"] = (...args) => handle?.fit(...args);
  // LinkViews' domain groups (TODO 136.14), kept here so a Core that remounts (data given or
  // removed) joins them again.
  let domainGroups = $state.raw<any[]>([]);
  export function joinDomainGroup(group) {
    domainGroups = [...domainGroups, group];
    return () => { domainGroups = domainGroups.filter((g) => g !== group); };
  }
  // Inside Panels (TODO 136.16): one shared x, drawn on the last Plot only.
  const panel = (getContext(PANELS_CONTEXT) as any)?.join({ joinDomainGroup, setViewport });
  onDestroy(() => panel?.leave());
  const shown = $derived(panel ? {
    ...props,
    x: panel.x(props.x),
    onviewportchange: (viewport) => { props.onviewportchange?.(viewport); panel.viewportChanged(viewport); },
  } : props);
  $effect(() => {
    const core = handle, groups = domainGroups;
    if (!core?.joinDomainGroup || !groups.length) return;
    const leaves = untrack(() => groups.map((group) => core.joinDomainGroup(group)));
    return () => leaves.forEach((leave) => leave?.());
  });
  export const getCamera: PlotHandle["getCamera"] = (...args) => handle?.getCamera?.(...args);
  export const setCamera: PlotHandle["setCamera"] = (...args) => handle?.setCamera?.(...args);
  export const getAnimationTime: PlotHandle["getAnimationTime"] = (...args) => handle?.getAnimationTime?.(...args);
  export const setAnimationTime: PlotHandle["setAnimationTime"] = (...args) => handle?.setAnimationTime?.(...args);
  export const getAnimationTimeFrozen: PlotHandle["getAnimationTimeFrozen"] = (...args) => handle?.getAnimationTimeFrozen?.(...args);
  export const holdAnimations: PlotHandle["holdAnimations"] = (...args) => handle?.holdAnimations(...args);
  export const getDescription: PlotHandle["getDescription"] = () => handle?.getDescription?.() ?? "";
  export const getDescriptionModel = () => handle?.getDescriptionModel?.() ?? null;
  export const getTitle: PlotHandle["getTitle"] = () => handle?.getTitle?.() ?? "";
  export const subscribeDescription: PlotHandle["subscribeDescription"] = (listener) => handle?.subscribeDescription?.(listener) ?? (() => {});
  export const subscribeSettings: PlotHandle["subscribeSettings"] = (...args) =>
    handle?.subscribeSettings(...args);
  export const getAxes = (...args) => handle?.getAxes(...args);
  export const getFrames: PlotHandle["getFrames"] = (...args) => handle?.getFrames(...args);
  export const getSelection: PlotHandle["getSelection"] = () => handle?.getSelection?.();
  export const getBrush: PlotHandle["getBrush"] = () => handle?.getBrush?.();
  export const clearBrush: PlotHandle["clearBrush"] = () => handle?.clearBrush?.();
  export const getHover: PlotHandle["getHover"] = () => handle?.getHover?.();
  export const getOffsets: PlotHandle["getOffsets"] = () => handle?.getOffsets?.();
  export const resetOffsets: PlotHandle["resetOffsets"] = (columns = undefined) => handle?.resetOffsets?.(columns);
  export const applyOffsets: PlotHandle["applyOffsets"] = () => handle?.applyOffsets?.();
</script>

{#snippet content()}{#if data !== undefined}<DataBoundary {data} {key} {schema}
    ><Core
      {...shown}
      bind:type
      autoBounds={props.autoBounds ?? true}
      bind:this={handle}>{@render children?.()}</Core
    ></DataBoundary
  >
{:else}<Core {...shown} bind:type bind:this={handle}
    >{@render children?.()}</Core
  >{/if}
{/snippet}

{#if inheritedTheme}{@render content()}
{:else}<Theme value={themes.hmplot}>{@render content()}</Theme>{/if}
