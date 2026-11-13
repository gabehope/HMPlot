<script>
  // The docs' Example component (R2.0b.4) alone, for docs-site.spec.js: /test/example?id=<id>.
  // Several ids (comma-separated) stack, each below a viewport-tall gap, so the later ones start
  // offscreen (TODO 68.2). Without a page's server data, each Example fetches its manifest record.
  import { page } from "$app/state";
  import Example from "$lib/docs/Example.svelte";
  const ids = $derived((page.url.searchParams.get("id") ?? "scatter-brush").split(","));
</script>

<!-- The docs' column width (DocsPage.svelte), which the snapshots are built at. -->
<main style="max-width: 820px; margin: 24px auto; font-family: system-ui, sans-serif;">
  {#each ids as id, i (id)}
    {#if i}<div class="gap" style="height: 150vh"></div>{/if}
    <Example {id} />
  {/each}
</main>
