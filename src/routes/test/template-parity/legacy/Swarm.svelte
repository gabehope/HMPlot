<script lang="ts">
  // A copy of the hand-written Swarm before it became a template (TODO 130.3), for parity.
  import { categoryField, Dodge, Points, ThemeDefaults, DATA_CONTEXT } from "$lib/plot/composition.js";
  import { getContext, untrack } from "svelte";
  import type { SwarmProps } from "$lib/plot/publicTypes.js";
  let { x, y, orientation = undefined, padding = 1, seed = 42, name, ...props }: SwarmProps = $props();
  const data: any = getContext(DATA_CONTEXT);
  let mark = $state<any>(), dodge = $state<any>();
  const axis = $derived.by(() => {
    if (orientation) return orientation === "horizontal" ? "y" : "x";
    try {
      const scope = data?.read(), cx = categoryField(scope, x), cy = categoryField(scope, y);
      if (cx === cy) throw Error("Swarm needs exactly one categorical position axis or an explicit orientation.");
      return cx ? "x" : "y";
    } catch (error) { return untrack(() => { throw error; }); }
  });
  export const getLegendSource = () => mark?.getLegendSource();
  export const getMark = () => mark?.getMark();
  export const whenSettled = async () => { await dodge?.whenSettled(); };
</script>

<ThemeDefaults kind="Swarm"><Dodge bind:this={dodge} {name} {x} {y} axis={axis} as="__swarmOffset" {padding} {seed}>
  <Points bind:this={mark} {x} {y} {...props} />
</Dodge></ThemeDefaults>
