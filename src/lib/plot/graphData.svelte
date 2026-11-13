<script lang="ts">
  import ComponentError from "./componentError.svelte";
  import { tick } from 'svelte';
  import Data from './data.svelte';
  import GraphTables from './graphTables.svelte';
  import Transform from './transform.svelte';
  import { statusChannel } from './utils/componentStatus.svelte.js';
  import type { GraphDataProps } from './publicTypes.js';
  // One graph builder (TODO 137.3, absorbing FromEdges): explicit node and edge tables, edges
  // alone (nodes inferred from their endpoints) or neither (the surrounding data are the edges).
  // `reduce` aggregates edge attributes onto the nodes, inferred or supplied, through the
  // internal GraphData transform (utils/transforms/fromEdges.js).
  let { nodes = undefined, edges = undefined, nodeKey = undefined, source = undefined, target = undefined,
    nodeFrom = undefined, reduce = undefined, children }: GraphDataProps = $props();
  const NO_REDUCE = {};
  // Python's None arrives as null: absent, as undefined is.
  const mode = $derived(edges != null ? (nodes != null ? 'tables' : 'edges') : nodes != null ? 'invalid' : 'scope');
  const reduces = $derived(reduce != null && Object.keys(reduce).length > 0);
  const misuse = $derived(
    mode === 'invalid' ? 'GraphData: pass edges= with nodes=, or omit both to read the edges from the surrounding data.'
    : mode !== 'tables' && nodeKey != null && nodeKey !== 'id' ? `GraphData: nodeKey names a column of nodes=; inferred nodes' IDs are id, so omit nodeKey="${nodeKey}" or pass nodes=.`
    : nodeFrom != null && nodeFrom !== 'source' && nodeFrom !== 'target' ? 'GraphData nodeFrom: pass source or target.'
    : '');
  let tables = $state<any>(), transform = $state<any>();
  let tablesStatus = $state<any>(), transformStatus = $state<any>();
  // A part that unmounts (a mode or reduce change) takes its last status with it.
  $effect(() => {
    if (!tables) return;
    const stop = tables.subscribe((status: any) => { tablesStatus = status; });
    return () => { stop(); tablesStatus = undefined; };
  });
  $effect(() => {
    if (!transform) return;
    const stop = transform.subscribe((status: any) => { transformStatus = status; });
    return () => { stop(); transformStatus = undefined; };
  });
  export const { subscribe } = statusChannel(() => ({
    kind: 'GraphData',
    pending: !misuse && !!(tablesStatus?.pending || transformStatus?.pending),
    error: misuse || tablesStatus?.error || transformStatus?.error || '',
    mounted: true,
  }));
  export async function whenSettled() {
    await tick();
    await tables?.whenSettled();
    await tick();
    await transform?.whenSettled();
  }
</script>

{#snippet build()}
  <Transform bind:this={transform} kind="GraphData" source={source ?? undefined} target={target ?? undefined} nodeFrom={nodeFrom ?? undefined} reduce={reduce ?? NO_REDUCE}>
    {@render children?.()}
  </Transform>
{/snippet}

{#if misuse}
  <ComponentError kind="GraphData" error={misuse} />
{:else if mode === 'tables'}
  <GraphTables bind:this={tables} {nodes} {edges} nodeKey={nodeKey ?? undefined} source={source ?? undefined} target={target ?? undefined}>
    {#if reduces}{@render build()}{:else}{@render children?.()}{/if}
  </GraphTables>
{:else if mode === 'edges'}
  <Data value={edges}>{@render build()}</Data>
{:else}
  {@render build()}
{/if}
