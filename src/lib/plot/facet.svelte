<script>
  import Core from "./facetCore.svelte";
  import DataBoundary from "./dataBoundary.svelte";
  let { data = undefined, key = undefined, schema = undefined, children, ...props } = $props();
  let handle = $state();
  export const getFrames = (...args) => handle?.getFrames(...args);
  export const getPlots = (...args) => handle?.getPlots(...args);
  export const exportCells = (...args) => handle?.exportCells(...args);
  export const whenSettled = (...args) => handle?.whenSettled(...args);
  export const exportPNG = (...args) => handle?.exportPNG(...args);
  export const exportSVG = (...args) => handle?.exportSVG(...args);
  export const exportPDF = (...args) => handle?.exportPDF(...args);
  export const getTransform = (...args) => handle?.getTransform(...args);
  export const openSettings = (...args) => handle?.openSettings(...args);
  export const closeSettings = (...args) => handle?.closeSettings(...args);
  export const subscribeSettings = (...args) =>
    handle?.subscribeSettings(...args);
  export const getSelection = () => handle?.getSelection?.();
  export const getBrush = () => handle?.getBrush?.();
  export const getHover = () => handle?.getHover?.();
  export const getLegendSource = () => handle?.getLegendSource?.();
  /** The uniquely named endpoint mark repeated in the cells (embedded Facets), for connect(). */
  export const endpoint = (...args) => handle?.endpoint(...args);
</script>

{#if data !== undefined}<DataBoundary {data} {key} {schema}
    ><Core {...props} bind:this={handle}>{@render children?.()}</Core
    ></DataBoundary
  >
{:else}<Core {...props} bind:this={handle}>{@render children?.()}</Core>{/if}
