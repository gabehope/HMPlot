<script lang="ts">
  import { Regression, Line, Area, ThemeDefaults, DATA_CONTEXT, AXIS_NAMES_CONTEXT, channelTitle } from "../plot/composition.js";
  import type { SmoothProps } from "../plot/publicTypes.js";
  import { getContext, setContext } from "svelte";
  import TemplateHost from "../templates/TemplateHost.svelte";
  import definition from "./smooth.js";
  // A template (./smooth.js): the host expands it; this wrapper titles the axes and gives it its
  // parts and handle.
  let props: SmoothProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  // Axis titles: the fitted columns, not the Regression's outputs.
  setContext(AXIS_NAMES_CONTEXT, () => { const scope = data?.read(); return { x: channelTitle(scope, props.x), y: channelTitle(scope, props.y) }; });
  let host = $state<any>();
  export const getLegendSource = () => host?.getLegendSource();
  export const getMark = () => host?.getMark();
  export const whenSettled = () => host?.whenSettled();
  export const subscribeSettings = (listener: (values: Record<string, unknown>) => void) => host?.subscribeSettings(listener) ?? (() => {});
  /** The fit on screen: see Regression's fit(). */
  export const fit = () => host?.part("fit")?.fit() ?? Promise.resolve(null);
</script>

<TemplateHost {definition} parts={{ Regression, ThemeDefaults, Area, Line }} {props} bind:this={host} />
