<script>
  // Legend fixtures (Stage 6): one legend per facet grid, definition-keyed entries, merged
  // category swatches, continuous ramps, shared colorbars, and vector colorbar export; a bare
  // Legend explaining a Line's colors (TODO 62.3).
  import { onMount } from "svelte";
  import { Plot, Facet, Frame, Points, Line, Legend, Theme, continuous, ordinal } from "$lib/index";
  let facet = $state(), embedded = $state(), merged = $state(), mergedPoints = $state(), ramp = $state(), rampPoints = $state(),
    colorbar = $state(), shared = $state(), numeric = $state(), numericPoints = $state(), categoryFacet = $state(), colorbarPoints = $state(), standalone = $state(),
    axesFacet = $state(), cellAxes = $state(), tallFacet = $state(), markFacet = $state(), cellPoints = $state(), cellPlot = $state(), plotFacet = $state(),
    flipFacet = $state(), flipLegend = $state(true), dates = $state(), datePoints = $state(), dataUnits = $state(), dataUnitPoints = $state(), diverging = $state(),
    missing = $state(), hostVars = $state();
  let rampScale = $state(continuous({ domain: [1, 1000], transform: "log", range: [4, 20] })), rampPosition = $state("right");
  let opacityPlot = $state(), opacityPoints = $state(), opacityLegend = $state(false);
  let opacityRows = $state({ x: [0.2, 0.5, 0.8], y: [0.5, 0.5, 0.5], alpha: [0.2, 0.5, 0.8] });
  onMount(() => {
    window.legendFixture = {
      longRamp(vertical) { rampScale = continuous({ domain: [135704, 648518358], range: [4, 28] }); rampPosition = vertical ? "right" : "bottom"; },
      get opacityPlot() { return opacityPlot; }, get opacityPoints() { return opacityPoints; },
      showOpacityLegend() { opacityLegend = true; },
      changeOpacity() { opacityRows = { ...opacityRows, alpha: [0.3, 0.6, 0.9] }; },
      get facet() { return facet; }, get embedded() { return embedded; }, get merged() { return merged; },
      get mergedPoints() { return mergedPoints; }, get ramp() { return ramp; }, get rampPoints() { return rampPoints; },
      get colorbar() { return colorbar; }, get shared() { return shared; },
      get numeric() { return numeric; }, get numericPoints() { return numericPoints; },
      get categoryFacet() { return categoryFacet; }, get standalone() { return standalone; },
      get axesFacet() { return axesFacet; }, get cellAxes() { return cellAxes; }, get tallFacet() { return tallFacet; },
      get markFacet() { return markFacet; }, get cellPoints() { return cellPoints; }, get plotFacet() { return plotFacet; },
      get flipFacet() { return flipFacet; }, setFacetLegend(value) { flipLegend = value; },
      get dates() { return dates; }, get datePoints() { return datePoints; },
      get dataUnits() { return dataUnits; }, get dataUnitPoints() { return dataUnitPoints; },
      get diverging() { return diverging; }, get missing() { return missing; }, get hostVars() { return hostVars; },
    };
    return () => { delete window.legendFixture; };
  });
  const n = 40;
  const rows = {
    x: Array.from({ length: n }, (_, i) => (i * 37) % 100),
    y: Array.from({ length: n }, (_, i) => (i * 53) % 100),
    group: Array.from({ length: n }, (_, i) => ["A", "B", "C", "D"][i % 4]),
    species: Array.from({ length: n }, (_, i) => ["Adelie", "Gentoo", "Chinstrap"][i % 3]),
    mass: Array.from({ length: n }, (_, i) => 1 + ((i * 29) % 1000)),
    value: Array.from({ length: n }, (_, i) => (i * 13) % 100),
  };
  const sharedFill = continuous({ domain: [0, 100], colormap: "Magma", label: "Shared value" });
  // Twelve groups: a tall external Facet whose lower cells mount only when scrolled to.
  const tall = { ...rows, dozen: Array.from({ length: n }, (_, i) => "G" + (i % 12)) };
  // Ten days apart from noon: a datetime column spanning about a year (noon keeps float32
  // rounding of raw millisecond values clear of a day boundary).
  const dated = { ...rows, when: Array.from({ length: n }, (_, i) => new Date(Date.UTC(2024, 0, 1, 12) + i * 10 * 86400000)) };
  const units = { ...rows, du: Array.from({ length: n }, (_, i) => 1 + (i % 10)) };
  // Three cities in one table, one Line (TODO 62's program).
  const cities = { day: [], value: [], city: [] };
  for (const [k, city] of ["Oslo", "Lima", "Pune"].entries())
    for (let day = 0; day < 20; day++) { cities.day.push(day); cities.value.push(10 + 8 * Math.sin(day / 3 + k * 2)); cities.city.push(city); }
</script>

<div data-fixture="opacity-ramp">
  <Plot bind:this={opacityPlot} data={opacityRows} width={320} height={200}
    x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Points bind:this={opacityPoints} x="x" y="y" opacity="alpha" />
    {#if opacityLegend}<Legend for={opacityPoints} channel="opacity" label="Alpha" />{/if}
  </Plot>
</div>

<h3>A bare Legend explains what the marks encode</h3>
<div data-fixture="bare">
  <Plot data={cities} width={420} height={200} axes2d>
    <Line x="day" y="value" series="city" color="city" width={2} />
    <Legend />
  </Plot>
</div>

<h3>External facet: one legend for four cells</h3>
<div data-fixture="facet">
  <Facet bind:this={facet} data={rows} column="group" legend>
    <Plot height={160} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
      <Points x="x" y="y" label="Points" size={3} fill="#547ba2" />
      <Points x="y" y="x" label="Mirror" size={3} fill="#c0504d" />
    </Plot>
  </Facet>
</div>

<h3>Facet with a category legend in each cell</h3>
<div data-fixture="category-facet">
  <Facet bind:this={categoryFacet} data={rows} column="group">
    <Plot height={160} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
      <Points x="x" y="y" fill="species" size={3.5} />
      <Legend channel="fill" label="Species" position="bottom" />
    </Plot>
  </Facet>
</div>

<h3>Embedded facet: one entry per definition</h3>
<div data-fixture="embedded">
  <Plot bind:this={embedded} data={rows} width={640} height={260} axes2d legend x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Facet column="group">
      <Points x="x" y="y" label="Points" size={3} fill="#547ba2" />
    </Facet>
  </Plot>
</div>

<h3>Fill and shape by one column</h3>
<div data-fixture="merged">
  <Plot bind:this={merged} data={rows} width={420} height={240} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Points bind:this={mergedPoints} x="x" y="y" fill="species" shape="species" size={4.5} />
    <Legend for={mergedPoints} channel="fill" label="Species" position="right" />
  </Plot>
</div>

<h3>Size ramp</h3>
<div data-fixture="ramp">
  <Plot bind:this={ramp} data={rows} width={420} height={240} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Points bind:this={rampPoints} x="x" y="y" size="mass" sizeScale={rampScale} fill="#547ba2" />
    <Legend for={rampPoints} channel="size" label="Mass" position={rampPosition} />
  </Plot>
</div>

<h3>Diverging colorbar</h3>
<div data-fixture="diverging">
  <!-- TODO 39.2: a midpoint maps [-2, 0] and [0, 10] to the colormap's halves. -->
  <Plot data={{ x: [-1, 0, 1], y: [0, 0, 0], change: [-2, 0, 10] }} width={420} height={200} axes2d legend={false}
    x={{ domain: [-1.5, 1.5] }} y={{ domain: [-1, 1] }} bind:this={diverging}>
    <Points x="x" y="y" fill="change" fillScale={continuous({ colormap: "Viridis", midpoint: 0 })} size={12} />
    <Legend channel="fill" label="Change" position="right" />
  </Plot>
</div>

<h3>Missing values</h3>
<div data-fixture="missing">
  <!-- TODO 73.3: a missing value draws in the scale's missing color, and the colorbar shows it. -->
  <Plot data={{ x: [-1, 0, 1], y: [0, 0, 0], v: [0, null, 1] }} width={420} height={200} axes2d legend={false} toneMapping={0}
    x={{ domain: [-1.5, 1.5] }} y={{ domain: [-1, 1] }} bind:this={missing}>
    <Points x="x" y="y" fill="v" fillScale={continuous({ domain: [0, 1], missing: "#e4572e" })} size={24} />
    <Legend channel="fill" label="Value" position="right" />
  </Plot>
</div>

<h3>Colorbar</h3>
<div data-fixture="colorbar">
  <Plot bind:this={colorbar} data={rows} width={420} height={240} axes2d legend={false} x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Points bind:this={colorbarPoints} x="x" y="y" fill="value" size={4} />
    <Legend channel="fill" label="Value" position="right" />
  </Plot>
  <Legend bind:this={standalone} for={colorbarPoints} channel="fill" label="Standalone" />
</div>

<h3>Shared colorbar: two marks, one scale resource</h3>
<div data-fixture="shared">
  <Plot bind:this={shared} data={rows} width={420} height={240} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Points x="x" y="y" fill="value" fillScale={sharedFill} size={4} />
    <Points x="y" y="x" fill="value" fillScale={sharedFill} size={2.5} />
    <Points x="x" y="x" fill="mass" size={2} label="Mass points" />
    <Legend channel="fill" position="right" />
  </Plot>
</div>

<h3>Categorical size, opacity and outline</h3>
<div data-fixture="numeric">
  <Plot bind:this={numeric} data={rows} width={420} height={240} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Points bind:this={numericPoints} x="x" y="y" fill="#547ba2" outlineWidth={0.9}
      size="species" sizeScale={ordinal({ domain: ["Adelie", "Gentoo", "Chinstrap"], range: [6, 12, 18] })}
      opacity="group" outlineColor="species" />
    <Legend for={numericPoints} channel="size" label="Size" position="right" />
    <Legend for={numericPoints} channel="opacity" label="Opacity" position="bottom" />
    <Legend for={numericPoints} channel="outlineColor" label="Outline" position="bottom" />
  </Plot>
</div>

<h3>Axes inside a Facet cell as a legend target</h3>
<div data-fixture="axes-facet">
  <Facet bind:this={axesFacet} data={rows} column="group">
    <Plot height={160}>
      <Frame bind:this={cellAxes}>
        <Points x="x" y="y" label="Cell axes points" size={3} fill="#547ba2" />
        <Legend for={cellAxes} position="bottom" />
      </Frame>
    </Plot>
  </Facet>
</div>

<h3>Legend for a mark and for a cell plot inside Facet cells</h3>
<div data-fixture="mark-facet">
  <Facet bind:this={markFacet} data={rows} column="group">
    <Plot height={160} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
      <Points bind:this={cellPoints} x="x" y="y" label="Cell points" size={3} fill="#547ba2" />
      <Legend for={cellPoints} position="bottom" />
    </Plot>
  </Facet>
</div>
<div data-fixture="plot-facet">
  <Facet bind:this={plotFacet} data={rows} column="group">
    <Plot bind:this={cellPlot} height={160} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
      <Points x="x" y="y" label="Plot points" size={3} fill="#547ba2" />
      <Legend for={cellPlot} position="bottom" />
    </Plot>
  </Facet>
</div>

<h3>Facet legend changed at runtime</h3>
<div data-fixture="flip-facet">
  <Facet bind:this={flipFacet} data={rows} column="group" legend={flipLegend}>
    <Plot height={160} legend axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
      <Points x="x" y="y" label="Flip points" size={3} fill="#547ba2" />
    </Plot>
  </Facet>
</div>

<h3>Datetime colorbar and ramp</h3>
<div data-fixture="dates">
  <Plot bind:this={dates} data={dated} width={420} height={240} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Points bind:this={datePoints} x="x" y="y" fill="when" size="when" sizeScale={continuous({ range: [4, 20] })} />
    <Legend for={datePoints} channel="fill" label="When" position="right" />
    <Legend for={datePoints} channel="size" label="When size" position="bottom" />
  </Plot>
</div>

<h3>Size ramp in data units</h3>
<div data-fixture="data-units">
  <Plot bind:this={dataUnits} data={units} width={420} height={240} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Points bind:this={dataUnitPoints} x="x" y="y" size="du" sizeUnits="data" sizeScale={continuous({ domain: [1, 10], range: [4, 20] })} fill="#547ba2" />
    <Legend for={dataUnitPoints} channel="size" label="Width" position="right" />
  </Plot>
</div>

<h3>Tall facet: cells mount as they scroll into view</h3>
<!-- The Facet's automatic legend lists the labeled points and explains their species. -->
<div data-fixture="tall-facet">
  <Facet bind:this={tallFacet} data={tall} column="dozen" wrap={1} legend>
    <Plot height={200} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
      <Points x="x" y="y" label="Tall points" size={3.5} fill="species" />
    </Plot>
  </Facet>
</div>

<h3>Default legends: categorical fill only; legend=false; legend with an explicit Legend (TODO 136.17, 134.9)</h3>
<div data-fixture="default-legend">
  <Plot data={rows} width={320} height={200} axes2d>
    <Points x="x" y="y" fill="species" />
    <Points x="y" y="x" fill="value" label="Valued" />
  </Plot>
  <Plot data={rows} width={320} height={200} axes2d legend={false}>
    <Points x="x" y="y" fill="species" />
  </Plot>
  <Plot data={rows} width={320} height={200} axes2d legend>
    <Points x="x" y="y" fill="species" />
    <Legend channel="fill" position="right" />
  </Plot>
</div>

<!-- "inherit" (TODO 132.5): the plot's text takes the host's font and color. -->
<section data-case="host" style="font-family: Georgia, serif; color: rgb(170, 20, 60)">
  <Theme value={{ extends: "dark", view: { background: "#ffffff" }, typography: { fontFamily: "inherit", color: "inherit" } }}>
    <Plot data={rows} width={320} height={200} title="Host text" axes2d>
      <Points x="x" y="y" fill="species" />
    </Plot>
  </Theme>
</section>

<!-- TODO 132.7: a host stylesheet's --hm-title-* and --hm-legend-* custom properties override
     the theme's title block and legend text, on screen and in exports; the legend's size is
     relative (1.25em), applied once however its guides nest. -->
<section data-case="host-vars" style="font-size: 16px; --hm-title-font: Georgia, serif; --hm-title-font-size: 30px; --hm-title-font-weight: 300; --hm-title-color: rgb(200, 0, 0); --hm-title-align: center; --hm-title-spacing: 20px; --hm-subtitle-font-size: 15px; --hm-caption-font-size: 9px; --hm-legend-font: Georgia, serif; --hm-legend-font-size: 1.25em; --hm-legend-color: rgb(0, 90, 0); --hm-legend-title-font-size: 13px; --hm-legend-title-font-weight: 800">
  <Plot bind:this={hostVars} data={rows} width={320} height={200} title="Styled title" subtitle="Styled subtitle" caption="Styled caption" axes2d>
    <Points x="x" y="y" fill="species" />
  </Plot>
</section>

<!-- theme.guides (TODO 132.2): the Plot's own legend at the top, its entries stacked, square
     16 px swatches and a bold title. -->
<section data-case="themed">
  <Theme value={{ guides: { position: "top", layout: "stacked", swatchSize: 16, swatchShape: "square", titleFontSize: 15, titleFontWeight: 700 } }}>
    <Plot data={rows} width={320} height={200} axes2d>
      <Points x="x" y="y" fill="species" />
    </Plot>
  </Theme>
</section>

<!-- Composed themes (TODO 132.7): `extends` lists a preset and a partial theme (the legend
     inline at the top), and a nested Theme makes the swatches square. -->
<section data-case="composed">
  <Theme value={{ extends: ["minimal", "legend/inline-top"] }}>
    <Theme value={{ guides: { swatchShape: "square" } }}>
      <Plot data={rows} width={320} height={200} axes2d>
        <Points x="x" y="y" fill="species" />
      </Plot>
    </Theme>
  </Theme>
</section>
