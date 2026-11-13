<script>
  // An example's Svelte program alone, as a user's page would mount it, for the
  // Svelte-versus-Python check (R2.0b.3, docs-site.spec.js): /test/example-svelte?id=<id>.
  import { page } from "$app/state";
  const programs = import.meta.glob("/src/examples/*/*.svelte");
  const id = $derived(page.url.searchParams.get("id"));
  let Program = $state();
  $effect(() => {
    const load = programs[`/src/examples/${id}/${id}.svelte`];
    if (!load) throw Error(`No example ${id}`);
    load().then((module) => (Program = module.default));
  });
</script>

<!-- Match the Python export's width and inherited typography (SceneRenderer.svelte). -->
<main style="width: 818px; margin: 24px auto; font: 13px system-ui; color: #30343b;">
  {#if Program}<Program />{/if}
</main>
