<script>
  // Observe the published ordinary view without downloading columns on every update.
  import { getContext } from 'svelte';
  import { DATA_CONTEXT } from '$lib/plot/utils/categorical.js';
  let { name, scopes } = $props();
  const context = getContext(DATA_CONTEXT);
  $effect(() => {
    const view = context.read();
    scopes[name] = view;
    return () => { if (scopes[name] === view) delete scopes[name]; };
  });
</script>
