<script lang="ts">
  import Transform from "./transform.svelte";
  import type { SummaryProps } from "./publicTypes.js";
  let {
    children,
    field,
    by = $bindable(),
    estimate = $bindable("mean"),
    interval = $bindable("none"),
    confidence = $bindable(0.95),
    samples = $bindable(1000),
    seed = $bindable(42),
    ...props
  }: SummaryProps = $props();
  let handle = $state<any>();
  function configure(patch) {
    if (Object.hasOwn(patch, "by")) by = patch.by;
    if (Object.hasOwn(patch, "estimate")) estimate = patch.estimate;
    if (Object.hasOwn(patch, "interval")) interval = patch.interval;
    if (Object.hasOwn(patch, "confidence")) confidence = patch.confidence;
    if (Object.hasOwn(patch, "samples")) samples = patch.samples;
    if (Object.hasOwn(patch, "seed")) seed = patch.seed;
  }
  export const subscribe = (listener) => handle.subscribe(listener);
  export const update = (patch) => handle.update(patch);
  export const whenSettled = () => handle.whenSettled();
  /** Its output as a data source (TODO 142.3): <Data value={handle}>. */
  export const dataSource = () => handle?.dataSource?.();
  /** Its output's rows on the host (TODO 145.1): `{ length, version, columns }`, after it settles. */
  export const read = (options) => handle.read(options);
</script>

<Transform bind:this={handle} kind="Summary" {...props} {field} {by} {estimate}
  {interval} {confidence} {samples} {seed} onconfigure={configure}>
  {@render children?.()}
</Transform>
