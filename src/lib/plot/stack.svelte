<script lang="ts">
  import Transform from "./transform.svelte";
  import type { StackProps } from "./publicTypes.js";
  let {
    children,
    y = $bindable(),
    series = $bindable(),
    ...props
  }: StackProps = $props();
  let handle = $state<any>();
  function configure(patch) {
    if (Object.hasOwn(patch, "y")) y = patch.y;
    if (Object.hasOwn(patch, "series")) series = patch.series;
  }
  export const subscribe = (listener) => handle.subscribe(listener);
  export const update = (patch) => handle.update(patch);
  export const whenSettled = () => handle.whenSettled();
  /** Its output as a data source (TODO 142.3): <Data value={handle}>. */
  export const dataSource = () => handle?.dataSource?.();
  /** Its output's rows on the host (TODO 145.1): `{ length, version, columns }`, after it settles. */
  export const read = (options) => handle.read(options);
</script>

<Transform
  bind:this={handle}
  kind="Stack"
  {...props}
  {y}
  {series}
  onconfigure={configure}>{@render children?.()}</Transform
>
