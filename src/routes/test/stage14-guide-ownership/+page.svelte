<script>
  import { Plot, Frame, Facet, Points } from "$lib/index";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const scene = params.get("scene") ?? "inherited";
  let plot = $state();
  $effect(() => {
    window.stage14GuideOwnership = { get plot() { return plot; }, scene };
    return () => { delete window.stage14GuideOwnership; };
  });
  const rows = { g: ["a", "a", "b", "b"], x: [0.2, 0.8, 0.3, 0.7], y: [1, 3, 2, 4] };
</script>

{#if scene === "inherited"}
  <!-- A ranged child that owns X and inherits Y from the root. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d x={{ domain: [0, 10], step: 2 }} y={{ domain: [0, 10], step: 2 }}>
    <Frame x={{ domain: [0, 1], step: 0.2, range: [2, 8] }}>
      <Points position={[[0.5, 5]]} size={4} />
    </Frame>
  </Plot>
{:else if scene === "nested-inherited"}
  <!-- Two inherited levels: neither child redraws the root's axes. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d x={{ domain: [0, 10], step: 2 }} y={{ domain: [0, 10], step: 2 }}>
    <Frame>
      <Frame>
        <Points position={[[2, 8]]} size={4} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "facets"}
  <!-- Embedded facet cells with a shared Y: each cell has its own X only. -->
  <Plot bind:this={plot} data={rows} width={600} height={400} axes2d y={{ domain: [0, 5], step: 1 }}>
    <Facet column="g" layout="bands" scales="shared">
      <Points x="x" y="y" size={4} />
    </Facet>
  </Plot>
{/if}
