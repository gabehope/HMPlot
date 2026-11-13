<script>
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { Plot, Points, InputContext, Select, input } from "$lib/index";
  import { Normalize, Window } from "$lib/stats/index.js";
  import { definitions } from "$lib/plot/utils/transforms/index.js";
  import { normalize } from "../../../../tests/fixtures/stats/normalize.js";
  import { windowTransform } from "../../../../tests/fixtures/stats/window.js";
  definitions.set("LegacyNormalize", normalize);
  definitions.set("LegacyWindow", windowTransform);
  import Transform from "$lib/plot/transform.svelte";
  const kind = $derived(page.url.searchParams.get("kind") ?? "Normalize");
  const Pattern = $derived(kind === "Window" ? Window : Normalize);
  let data = $state({ x: [1, 3, 7] }), plots = $state({}), handles = $state({});
  onMount(() => {
    window.statsTemplates = {
      get plots() { return plots; }, get handles() { return handles; },
      async data(next) { data = next; await tick(); },
    };
    return () => delete window.statsTemplates;
  });
</script>

<InputContext>
  <Select name="method" label="Method" value="deviation" options={["deviation", "extent", "sum", "first", "max"]} />
{#each ["legacy", "template"] as variant}
  <Plot bind:this={plots[variant]} {data} width={320} height={240} axes2d={false}
    x={{ domain: [0, 8], padding: 0 }} y={{ domain: [-2, 8], padding: 0 }} animation={false}>
    {#if variant === "legacy"}
      <Transform kind={`Legacy${kind}`} field="x" as="result" {...kind === "Normalize" ? { method: input("method") } : {}} bind:this={handles[variant]}>
        <Points x="x" y="result" size={8} fill="#f00" />
      </Transform>
    {:else}
      <Pattern field="x" as="result" {...kind === "Normalize" ? { method: input("method") } : {}} bind:this={handles[variant]}>
        <Points x="x" y="result" size={8} fill="#f00" />
      </Pattern>
    {/if}
  </Plot>
{/each}
</InputContext>
