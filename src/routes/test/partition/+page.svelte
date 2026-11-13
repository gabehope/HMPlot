<script>
  // Partition fixtures (Stage 11): groups repeat children in one frame, share the parent's
  // scales and legend, and expose their keys through the handle.
  import { onMount } from "svelte";
  import { Plot, Partition, Facet, Frame, Legend, Points, Line, Area, Density } from "$lib/index";
  let overlay = $state(), overlayPlot = $state(), grouped = $state(), groupedPlot = $state(),
    nested = $state(), plain = $state(), inFacet = $state(), facetPlot = $state(),
    density = $state(), densityPlot = $state(), brushed = $state(), brushedPlain = $state(),
    missing = $state(), missingPlot = $state(), missingPlain = $state(),
    outerPartition = $state(), innerPartition = $state(), framed = $state(), framedPlot = $state(),
    sparse = $state(), sparsePlot = $state(), categories = $state(), categoriesPlot = $state(),
    categoriesPlain = $state(), fill = $state(), fillPlot = $state(), fillPlain = $state();
  let legendGroups = $state(true);
  let showFacetInPartition = $state(false);
  onMount(() => {
    window.partitionFixture = {
      get overlay() { return overlay; }, get overlayPlot() { return overlayPlot; },
      get grouped() { return grouped; }, get groupedPlot() { return groupedPlot; },
      get nested() { return nested; }, get plain() { return plain; },
      get inFacet() { return inFacet; }, get facetPlot() { return facetPlot; },
      get density() { return density; }, get densityPlot() { return densityPlot; },
      get brushed() { return brushed; },
      get brushedPlain() { return brushedPlain; },
      get missing() { return missing; }, get missingPlot() { return missingPlot; },
      get missingPlain() { return missingPlain; },
      get outerPartition() { return outerPartition; }, get innerPartition() { return innerPartition; },
      get framed() { return framed; }, get framedPlot() { return framedPlot; },
      get sparse() { return sparse; }, get sparsePlot() { return sparsePlot; },
      get categories() { return categories; }, get categoriesPlot() { return categoriesPlot; },
      get categoriesPlain() { return categoriesPlain; },
      get fill() { return fill; }, get fillPlot() { return fillPlot; }, get fillPlain() { return fillPlain; },
    };
    window.partitionDrop = dropSpecies;
    window.partitionLegendGroups = (value) => { legendGroups = value; };
    window.partitionShowFacet = (value) => { showFacetInPartition = value; };
    return () => { delete window.partitionFixture; };
  });
  const species = ["Adelie", "Gentoo", "Chinstrap"];
  const n = 90;
  const base = {
    x: Array.from({ length: n }, (_, i) => (i % 30) * 3),
    // Each species occupies its own x range, so a density per species has its own peak.
    xd: Array.from({ length: n }, (_, i) => (i % 30) * 3 + 90 * Math.floor(i / 30)),
    y: Array.from({ length: n }, (_, i) => 10 + Math.floor(i / 30) * 25 + ((i * 17) % 20)),
    species: Array.from({ length: n }, (_, i) => species[Math.floor(i / 30)]),
    sex: Array.from({ length: n }, (_, i) => (i % 2 ? "Female" : "Male")),
    // Every fifth row has no sex recorded.
    sexMissing: Array.from({ length: n }, (_, i) => (i % 5 === 0 ? null : i % 2 ? "Female" : "Male")),
    // Chinstrap rows are all Male, so species x sexSkew has an empty combination.
    sexSkew: Array.from({ length: n }, (_, i) => (i >= 60 || i % 2 === 0 ? "Male" : "Female")),
  };
  let rows = $state(base);
  function dropSpecies() {
    const keep = rows.species.map((value) => value !== "Chinstrap");
    rows = Object.fromEntries(Object.entries(rows).map(([key, values]) =>
      [key, values.filter((_, i) => keep[i])]));
  }
  // A categorical position column under a Partition: the axis must show the category labels.
  const categorical = {
    category: ["A", "B", "C", "D", "E", "F"],
    value: [3, 5, 2, 6, 4, 1],
    group: ["g1", "g1", "g1", "g2", "g2", "g2"],
  };
</script>

<h3>One line per species, one frame</h3>
<div data-fixture="overlay">
  <Plot bind:this={overlayPlot} data={rows} width={420} height={260} axes2d legend>
    <Partition bind:this={overlay} by="species">
      <Line x="x" y="y" label="Trend" width={3} />
    </Partition>
  </Plot>
</div>

<h3>Same marks without a Partition</h3>
<div data-fixture="plain">
  <Plot bind:this={plain} data={rows} width={420} height={260} axes2d>
    <Line x="x" y="y" label="Trend" width={3} />
  </Plot>
</div>

<h3>One legend entry per group</h3>
<div data-fixture="grouped">
  <Plot bind:this={groupedPlot} data={rows} width={420} height={260} axes2d legend
    x={{ domain: [0, 90] }} y={{ domain: [0, 90] }}>
    <Partition bind:this={grouped} by="species" {legendGroups}>
      <Points x="x" y="y" label="Points" size={3.5} />
    </Partition>
  </Plot>
</div>

<h3>Nested keys</h3>
<div data-fixture="nested">
  <Plot data={rows} width={420} height={260} axes2d>
    <Partition bind:this={nested} by={["species", "sex"]}>
      <Points x="x" y="y" size={2.5} />
    </Partition>
  </Plot>
</div>

<h3>A key with missing values keeps every row</h3>
<div data-fixture="missing">
  <Plot bind:this={missingPlot} data={rows} width={420} height={260} axes2d>
    <Partition bind:this={missing} by="sexMissing">
      <Points x="x" y="y" size={2.5} brush />
    </Partition>
  </Plot>
</div>
<div data-fixture="missing-plain">
  <Plot bind:this={missingPlain} data={rows} width={420} height={260} axes2d>
    <Points x="x" y="y" size={2.5} brush />
  </Plot>
</div>

<h3>Partition inside Partition</h3>
<div data-fixture="nested-partition">
  <Plot data={rows} width={420} height={260} axes2d>
    <Partition bind:this={outerPartition} by="species">
      <Partition bind:this={innerPartition} by="sex">
        <Points x="x" y="y" size={2.5} />
      </Partition>
    </Partition>
  </Plot>
</div>

<h3>Nested legendGroups labels join every level</h3>
<div data-fixture="nested-legend">
  <Plot data={rows} width={420} height={260} axes2d legend>
    <Partition by="species" legendGroups>
      <Partition by="sex" legendGroups>
        <Points x="x" y="y" label="Points" size={2.5} />
      </Partition>
    </Partition>
  </Plot>
</div>

<h3>A Frame inside each group</h3>
<div data-fixture="framed">
  <Plot bind:this={framedPlot} data={rows} width={420} height={260} axes2d>
    <Partition bind:this={framed} by="species">
      <Frame x={{ domain: [0, 90] }} y={{ domain: [0, 90] }}>
        <Line x="x" y="y" />
      </Frame>
    </Partition>
  </Plot>
</div>

<h3>A combination with no rows still mounts</h3>
<div data-fixture="sparse">
  <Plot bind:this={sparsePlot} data={rows} width={420} height={260} axes2d>
    <Partition bind:this={sparse} by={["species", "sexSkew"]}>
      <Points x="x" y="y" size={2.5} />
    </Partition>
  </Plot>
</div>

<h3>Categorical x under a Partition</h3>
<div data-fixture="categories">
  <Plot bind:this={categoriesPlot} data={categorical} width={420} height={260} axes2d x={{ labelOverlap: "show" }}>
    <Partition bind:this={categories} by="group">
      <Points x="category" y="value" size={4} />
    </Partition>
  </Plot>
</div>
<div data-fixture="categories-plain">
  <Plot bind:this={categoriesPlain} data={categorical} width={420} height={260} axes2d x={{ labelOverlap: "show" }}>
    <Points x="category" y="value" size={4} />
  </Plot>
</div>

<h3>Fill by the key gives the scale legend</h3>
<div data-fixture="fill">
  <Plot bind:this={fillPlot} data={rows} width={420} height={260} axes2d>
    <Partition bind:this={fill} by="species">
      <Points x="x" y="y" fill="species" size={2.5} />
    </Partition>
    <Legend channel="fill" label="Species" position="bottom" />
  </Plot>
</div>
<div data-fixture="fill-plain">
  <Plot bind:this={fillPlain} data={rows} width={420} height={260} axes2d>
    <Points x="x" y="y" fill="species" size={2.5} />
    <Legend channel="fill" label="Species" position="bottom" />
  </Plot>
</div>

<h3>Facet inside Partition is an error</h3>
<div data-fixture="facet-in-partition">
  {#if showFacetInPartition}
    <svelte:boundary>
      <Plot data={rows} width={420} height={200} axes2d>
        <Partition by="species">
          <Facet column="sex">
            <Points x="x" y="y" />
          </Facet>
        </Partition>
      </Plot>
      {#snippet failed(error)}<div class="boundary-error">{error.message}</div>{/snippet}
    </svelte:boundary>
  {/if}
</div>

<h3>Partition inside a Facet cell</h3>
<div data-fixture="in-facet">
  <Facet bind:this={facetPlot} data={rows} column="sex">
    <Plot height={200} axes2d>
      <Partition bind:this={inFacet} by="species">
        <Points x="x" y="y" size={2.5} />
      </Partition>
    </Plot>
  </Facet>
</div>

<h3>A density per group, drawn in one frame</h3>
<div data-fixture="density">
  <Plot bind:this={densityPlot} data={rows} width={420} height={260} axes2d
    x={{ domain: [0, 270] }} y={{ domain: [0, 0.02] }}>
    <Partition bind:this={density} by="species">
      <Density x="xd" resolution={64}>
        <Area x="x" upper="density" fill="species" opacity={0.8} />
      </Density>
    </Partition>
  </Plot>
</div>

<h3>Brushing the shared frame constrains every group</h3>
<div data-fixture="brushed">
  <Plot bind:this={brushed} data={rows} width={420} height={260} axes2d
    x={{ domain: [0, 90] }} y={{ domain: [0, 90] }}>
    <Partition by="species">
      <Points x="x" y="y" size={3} brush />
    </Partition>
  </Plot>
</div>

<div data-fixture="brushed-plain">
  <Plot bind:this={brushedPlain} data={rows} width={420} height={260} axes2d
    x={{ domain: [0, 90] }} y={{ domain: [0, 90] }}>
    <Points x="x" y="y" size={3} brush />
  </Plot>
</div>
