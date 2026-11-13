<script lang="ts">
  import ComponentError from "./componentError.svelte";
  import { getContext, setContext, onDestroy, untrack, tick } from 'svelte';
  import { DATA_CONTEXT, createDataScope } from './utils/categorical.js';
  import { createGraphData, graphScope, graphStructure, graphTable } from './utils/graphData.js';
  import { identityForData } from './utils/interaction.js';
  import { FORCE_CONTEXT } from './utils/forceContext.js';
  import { initializePlot } from '../jaxExtensions/setup.js';
  import { ROOT_CONTENT_CONTEXT, pendingRootContent } from './utils/rootFrameSelection.js';
  import { statusChannel } from './utils/componentStatus.svelte.js';
  import type { Snippet } from 'svelte';
  // GraphData's explicit pair of tables (graphData.svelte): the graph scope its children read.
  let { nodes, edges, nodeKey = 'id', source = 'source', target = 'target', children }:
    { nodes: any; edges: any; nodeKey?: string; source?: string; target?: string; children?: Snippet } = $props();
  let nodeTable = createDataScope();
  const edgeTable = createDataScope();
  let nodeIdentity, observationKey;
  const releaseRootPending = pendingRootContent(getContext(ROOT_CONTENT_CONTEXT));
  let current = $state.raw<any>(), error = $state('');
  // The scene runtime waits for this async selection: a pending status, and whenSettled.
  let pending = $state(false), work = Promise.resolve();
  export const { subscribe } = statusChannel(() => ({ kind: 'GraphData', pending, error, mounted: true }));
  export async function whenSettled() {
    let seen;
    do { seen = work; await seen; await tick(); } while (seen !== work);
  }
  // An explicit pair of tables starts an independent graph, including its layout capability.
  setContext(FORCE_CONTEXT, undefined);
  setContext(DATA_CONTEXT, { read() {
    if (!current) throw Error(error || 'GraphData is preparing.');
    return current;
  } });
  $effect(() => {
    const settings = { nodes, edges, nodeKey, source, target };
    let canceled = false;
    try {
      const shared = identityForData(settings.nodes), key = shared ? shared.key : settings.nodeKey;
      // Graph IDs resolve endpoints; an existing table keeps its observation identity/key.
      // A new identity or mapping gets a fresh adapter, so rekeying cannot mutate the old table.
      if (shared !== nodeIdentity || JSON.stringify(key) !== JSON.stringify(observationKey)) {
        nodeTable.dispose(); nodeTable = createDataScope({ key });
        nodeIdentity = shared; observationKey = key;
      }
      // Read the table columns synchronously, as Data does. A nested $state column
      // replacement must be an effect dependency rather than an untracked async read.
      nodeTable.update(settings.nodes); edgeTable.update(settings.edges);
    } catch (reason) {
      error = reason?.message ?? String(reason); releaseRootPending();
      return () => { canceled = true; };
    }
    pending = true;
    const job: Promise<void> = work = initializePlot().then(async () => {
      if (canceled) return;
      const graph = createGraphData({ ...settings, nodes: nodeTable, edges: edgeTable });
      let view = graphScope(graph); graph.dispose();
      try {
        await graphStructure(view);
        const edges = await graphTable(view, 'edges'); view.dispose(); view = edges;
        if (canceled) { view.dispose(); return; }
        const previous = untrack(() => current);
        current = view; error = ''; previous?.dispose();
        await tick(); if (!canceled) releaseRootPending();
      } catch (reason) { view.dispose(); throw reason; }
    }).catch(reason => { if (!canceled) { error = reason?.message ?? String(reason); releaseRootPending(); } })
      .finally(() => { if (work === job) pending = false; });
    return () => { canceled = true; };
  });
  onDestroy(() => { releaseRootPending(); current?.dispose(); nodeTable.dispose(); edgeTable.dispose(); });
</script>

{#if current}{@render children?.()}{/if}
<ComponentError kind="GraphData" {error} />
