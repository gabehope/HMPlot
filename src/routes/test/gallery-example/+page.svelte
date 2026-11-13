<script>
  // Keep coverage of the original interactive gallery fixtures as curated pairs replace them.
  import DocsPage from "$lib/docs/DocsPage.svelte";
  let { data } = $props();
</script>
<DocsPage {data} legacyPreview />
