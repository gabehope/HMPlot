<script lang="ts">
  import { onDestroy } from "svelte";
  import Transform from "./transform.svelte";
  import { createJoinTable } from "./utils/tableJoin.js";
  import { isPipelineReference, pipelineSource } from "./utils/pipelineReference.js";
  import type { JoinProps } from "./publicTypes.js";
  let { children, data, ...props }: JoinProps = $props();
  let handle = $state<any>();
  // The joined table reaches the transform as a reference (utils/tableJoin.js): a new table
  // replans the join, and a Facet keys its pipelines by the table's identity and version.
  const tables = createJoinTable();
  onDestroy(() => tables.dispose());
  // data={handle} (TODO 140): another transform's live output, joined as it publishes; the
  // reference is fixed for the Join's life. Until that output exists the Join waits.
  let fixed: any = null;
  const table = $derived.by(() => {
    if (data === undefined) return undefined;
    if (!isPipelineReference(data)) return tables.table(data);
    const source = pipelineSource(data, "Join");
    // Fixed while its transform lives; a remounted one (a scene update) is the same reference.
    if (source && fixed && source !== fixed && fixed.alive)
      throw Error("Join: data references one pipeline output for the Join's life; make another Join for another output.");
    if (source) fixed = source;
    const output = source?.current();
    return output ? tables.live(output) : undefined;
  });
  // While a referenced output is pending there is no Transform yet: nothing to follow.
  const unsubscribed = () => undefined;
  export const subscribe = (listener) => (handle ? handle.subscribe(listener) : unsubscribed);
  export const update = (patch) => handle.update(patch);
  export const whenSettled = () => handle?.whenSettled();
  /** Its output as a data source (TODO 142.3): <Data value={handle}>. */
  export const dataSource = () => handle?.dataSource?.();
  /** Its output's rows on the host (TODO 145.1): `{ length, version, columns }`, after it settles. */
  export const read = (options) => handle.read(options);
</script>
<!-- A reference whose output does not exist yet: the Join (and what draws it) waits for it. -->
{#if !(isPipelineReference(data) && table === undefined)}
  <Transform bind:this={handle} kind="Join" data={table} {...props}>{@render children?.()}</Transform>
{/if}
