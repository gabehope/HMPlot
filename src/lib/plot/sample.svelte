<script lang="ts">
  import Transform from "./transform.svelte";
  import type { SampleProps } from "./publicTypes.js";
  let { children, size = $bindable(), seed = $bindable(42), ...props }: SampleProps = $props();
  let handle = $state<any>();
  function configure(patch) { if (Object.hasOwn(patch, "size")) size = patch.size; if (Object.hasOwn(patch, "seed")) seed = patch.seed; }
  export const subscribe = (listener) => handle.subscribe(listener);
  export const update = (patch) => handle.update(patch);
  export const whenSettled = () => handle.whenSettled();
  /** Its output as a data source (TODO 142.3): <Data value={handle}>. */
  export const dataSource = () => handle?.dataSource?.();
  /** Its output's rows on the host (TODO 145.1): `{ length, version, columns }`, after it settles. */
  export const read = (options) => handle.read(options);
</script>
<Transform bind:this={handle} kind="Sample" {...props} {size} {seed} onconfigure={configure}>{@render children?.()}</Transform>
