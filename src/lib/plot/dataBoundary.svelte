<script>
  import { getContext, setContext } from "svelte";
  import Data from "./data.svelte";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { FORCE_CONTEXT, layoutBoundary } from "./utils/forceContext.js";
  import { rootScope } from "./utils/dataView.js";
  let { data = undefined, key = undefined, schema = undefined, children } = $props();
  const parent = getContext(DATA_CONTEXT);
  let handle = $state();
  // An omitted data prop inherits its surrounding layout and table. Explicit data uses the
  // ordinary Data provider, including its live references, identity and clock adoption.
  setContext(FORCE_CONTEXT, layoutBoundary(getContext(FORCE_CONTEXT), () => data === undefined));
  const inherited = () => rootScope(parent?.read());
  export const getSelection = () => data === undefined ? inherited()?.identity?.selection : handle?.getSelection();
  export const getBrush = () => data === undefined ? inherited()?.identity?.brush : handle?.getBrush();
  export const getHover = () => data === undefined ? inherited()?.identity?.hover : handle?.getHover();
  export const getOffsets = () => data === undefined ? inherited()?.identity?.offsets : handle?.getOffsets();
  export const resetOffsets = (columns = undefined) => data === undefined ? inherited()?.identity?.offsets.clear(columns) : handle?.resetOffsets(columns);
  export const applyOffsets = () => data === undefined ? inherited()?.applyOffsets() : handle?.applyOffsets();
</script>

{#if data === undefined}
  {@render children?.()}
{:else}
  <Data value={data} {key} {schema} bind:this={handle}>{@render children?.()}</Data>
{/if}
