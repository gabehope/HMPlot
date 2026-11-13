<script>
  import { onMount } from "svelte";
  import Plot from "$lib/plot/plot.svelte";
  import Heatmap from "$lib/plot/marks/heatmap.svelte";
  import Facet from "$lib/plot/facet.svelte";
  import Points from "$lib/plot/bound/scatterPoints.svelte";
  import OptionsContext from "$lib/plot/optionsContext.svelte";
  import { optionsRoot } from "$lib/options/options.js";
  let first = $state(),
    second = $state(),
    external = $state();
  let width = $state(480),
    height = $state(320),
    mode = $state("2d"),
    hostMode = $state("2d");
  let name = $state("Inspector A"),
    secondName = $state("Inspector B"),
    marks = $state(true),
    mounted = $state(true),
    showTrigger = $state(true),
    showExport = $state(true),
    menu = $state(true),
    facetExport = $state(true),
    facetMenu = $state(true);
  const facetData = { group: ["a", "b"], x: [1, 2], y: [2, 1] };
  const values = Array.from({ length: 32 }, (_, y) =>
    Array.from({ length: 32 }, (_, x) => (x + y) / 62),
  );
  const shown = [
    "cmapIndex",
    "quantize",
    "levels",
    "valueTransform",
    "valueBounds",
    "valueRange",
    "opacity",
    "contour",
    "grid",
  ];
  function find(label, node = optionsRoot) {
    if (node.presentation.label === label) return node;
    for (const child of node.dependents.values()) {
      const result = find(label, child);
      if (result) return result;
    }
  }
  onMount(() => {
    window.__settingsFixture = {
      read: (target, key) => find(target)?.get(key),
      owner: (target, key) => find(target)?.owner(key)?.uid,
      diagnostics: () => first?.getDiagnostics(),
      settled: () => first?.whenSettled(),
      exportPNG: (scale) => first?.exportPNG({ scale }),
      openWithoutAnchor: () => first?.openSettings(),
    };
    return () => delete window.__settingsFixture;
  });
</script>

<svelte:head
  ><title>Settings regression fixture</title><link
    rel="icon"
    href="data:,"
  /></svelte:head
>
<aside>Host sidebar</aside>
<main>
  <h1>Settings regression fixture</h1>
  <nav>
    <button bind:this={external} onclick={() => first.openSettings(external)}
      >External settings</button
    >
    <button onclick={() => first.closeSettings()}>Close externally</button>
    <button onclick={() => (mode = mode === "2d" ? "3d" : "2d")}
      >Change bound view</button
    >
    <button onclick={() => (hostMode = hostMode === "2d" ? "3d" : "2d")}
      >Change host view</button
    >
    <button onclick={() => (marks = !marks)}>Toggle nested marks</button>
    <button onclick={() => (mounted = !mounted)}>Toggle mounted plots</button>
    <label
      >Width<input
        aria-label="Fixture width"
        type="number"
        bind:value={width}
      /></label
    >
    <label
      >Height<input
        aria-label="Fixture height"
        type="number"
        bind:value={height}
      /></label
    >
    <label>Name<input aria-label="Fixture name" bind:value={name} /></label>
    <label
      >Second name<input
        aria-label="Second fixture name"
        bind:value={secondName}
      /></label
    >
    <label
      ><input type="checkbox" bind:checked={showTrigger} />Built-in trigger</label
    >
    <label><input type="checkbox" bind:checked={showExport} />Export button</label>
    <label><input type="checkbox" bind:checked={menu} />Plot menu</label>
    <label><input type="checkbox" bind:checked={facetExport} />Facet export</label>
    <label><input type="checkbox" bind:checked={facetMenu} />Facet menu</label>
    <output aria-label="Bound view">{mode}</output>
  </nav>
  {#if mounted}
    <div class="clipped">
      <Plot
        bind:this={first}
        {name}
        {width}
        {height}
        bind:type={mode}
        settings={{ showTrigger, showExport, menu }}
      >
        <OptionsContext name="Layer group">
          {#if marks}<Heatmap
              name="Nested heatmap"
              fill={values}
              options={shown}
            />{/if}
        </OptionsContext>
      </Plot>
    </div>
    <Plot
      bind:this={second}
      name={secondName}
      width={480}
      height={320}
      type={hostMode}
    >
      <Heatmap
        name="Other heatmap"
        fill={values}
        options={shown}
      />
    </Plot>
    <!-- TODO 128: a Facet's showExport and menu reach its buttons and its cells' menus. -->
    <Facet
      name="Facet fixture"
      data={facetData}
      column="group"
      settings={{ showExport: facetExport, menu: facetMenu }}
    >
      <Plot height={260}>
        <Points x="x" y="y" />
      </Plot>
    </Facet>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    font: 13px system-ui;
    background: #f4f5f8;
  }
  aside {
    position: fixed;
    inset: 0 auto 0 0;
    width: 120px;
    padding: 16px;
    color: white;
    background: #252c3c;
  }
  main {
    margin-left: 170px;
    padding: 18px;
  }
  nav {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 24px;
    max-width: 900px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  input {
    width: 80px;
  }
  input[type="checkbox"] {
    width: auto;
  }
  .clipped {
    overflow: hidden;
    width: max-content;
    border-radius: 12px;
    margin-bottom: 24px;
  }
  button,
  input {
    font: inherit;
  }
</style>
