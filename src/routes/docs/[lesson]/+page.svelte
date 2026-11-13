<script>
  import DocsPage from "$lib/docs/DocsPage.svelte";
  let { data } = $props();
</script>
<DocsPage {data}>
  {#snippet content()}{#if data.Content}{#key data.id}<data.Content />{/key}{/if}{/snippet}
</DocsPage>
