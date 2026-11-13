<script lang="ts">
  import ComponentError from "./componentError.svelte";
  import { getContext, setContext, onDestroy, untrack, tick } from 'svelte';
  import { FORCE_CONTEXT, layoutRelation, registerLayoutView } from './utils/forceContext.js';
  import { useViewServices } from './utils/viewServices.js';
  import { DATA_CONTEXT } from './utils/categorical.js';
  import { graphTable } from './utils/graphData.js';
  import { ROOT_CONTENT_CONTEXT, pendingRootContent } from './utils/rootFrameSelection.js';
  import { statusChannel } from './utils/componentStatus.svelte.js';
  import { readTable } from './utils/readback.js';
  import type { NodesProps } from './publicTypes.js';
  let { children, drag = false }: NodesProps = $props();
  const parent: any = getContext(DATA_CONTEXT), force: any = getContext(FORCE_CONTEXT);
  const releaseRootPending = pendingRootContent(getContext(ROOT_CONTENT_CONTEXT));
  let current = $state.raw<any>(), error = $state('');
  // The scene runtime waits for this async selection: a pending status, and whenSettled.
  let pending = $state(false), work = Promise.resolve();
  export const { subscribe } = statusChannel(() => ({ kind: 'Nodes', pending, error, mounted: true }));
  export async function whenSettled() {
    let seen;
    do { seen = work; await seen; await tick(); } while (seen !== work);
  }
  /** Its rows on the host (TODO 145.1): { length, version, columns }, once the layout has run. */
  export async function read(options = {}) {
    await whenSettled();
    if (!current) throw Error(error || 'Nodes has no rows yet.');
    const release = current.retain?.();
    try { return await readTable(current, { ...options, component: 'Nodes' }); }
    finally { release?.(); }
  }
  const viewServices = useViewServices();
  $effect(() => registerLayoutView(force, viewServices));
  setContext(FORCE_CONTEXT, layoutRelation(force, 'nodes', () => drag));
  setContext(DATA_CONTEXT, { read() {
    if (!current) throw Error(error || 'Nodes is preparing.');
    return current;
  } });
  $effect(() => {
    const scope = parent?.read() ?? force?.read('edges');
    const abort = new AbortController();
    pending = true;
    const job: Promise<void> = work = graphTable(scope, 'nodes', { signal: abort.signal }).then(async view => {
      if (abort.signal.aborted) { view.dispose(); return; }
      const previous = untrack(() => current);
      current = view; error = ''; previous?.dispose();
      await tick(); if (!abort.signal.aborted) releaseRootPending();
    }).catch(reason => { if (!abort.signal.aborted) { error = reason?.message ?? String(reason); releaseRootPending(); } })
      .finally(() => { if (work === job) pending = false; });
    return () => abort.abort();
  });
  onDestroy(() => { releaseRootPending(); current?.dispose(); });
</script>

{#if current}{@render children?.()}{/if}
<ComponentError kind="Nodes" {error} />
