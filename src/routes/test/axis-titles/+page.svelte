<script>
  // Axis titles from the plotted column (TODO 21 Part T), one scene per ?case=. The spec reads
  // the .x-title / .y-title texts of every frame overlay (and .box-title in 3D).
  import { onMount } from "svelte";
  import { Theme, Plot, Data, Facet, Frame, Fold, Points, Points3D, Line, Text, Rect, Area,  Heatmap, Interpolate, Stack, Density, categorical, col, multiply } from "$lib/index";
import { Bin } from "$lib/stats/index.js";
import { Histogram, Bar, BoxPlot, Violin, Lollipop } from "$lib/charts/index.js";
  const scene = typeof location === "undefined" ? "named" : new URLSearchParams(location.search).get("case") ?? "named";
  const dynamicMargins = typeof location === "undefined" || !new URLSearchParams(location.search).has("fixedMargins");
  let plotWidth = $state(480);
  let plot = $state(), mixed = $state(true), yName = $state("b");
  // The "domains" scene's y domain, from ?domain=lo,hi and setDomain.
  let yFormat = $state(new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("format") ?? undefined);
  let yDomain = $state(new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("domain")?.split(",").map(Number) ?? [0, 10]);
  const n = 12;
  const base = {
    id: Array.from({ length: n }, (_, i) => i),
    g: Array.from({ length: n }, (_, i) => ["p", "q", "r"][i % 3]),
    a: Array.from({ length: n }, (_, i) => (i * 37) % 100),
    b: Array.from({ length: n }, (_, i) => ((i * 53) % 100) * 10),
    c: Array.from({ length: n }, (_, i) => ((i * 71) % 100) / 10),
  };
  // `rename` renames column b (the "named" scene's y column).
  const data = $derived.by(() => {
    const { b, ...rest } = base;
    return { ...rest, [yName]: b };
  });
  const grid = {
    lon: Array.from({ length: 16 }, (_, i) => i % 4),
    lat: Array.from({ length: 16 }, (_, i) => Math.floor(i / 4)),
    elev: Array.from({ length: 16 }, (_, i) => Math.sin(i) + 2),
  };
  onMount(() => {
    window.axisTitles = {
      scene, get plot() { return plot; },
      setMixed(value) { mixed = value; },
      rename(value) { yName = value; },
      setDomain(value) { yDomain = value; },
      setFormat(value) { yFormat = value; },
      setWidth(value) { plotWidth = value; },
    };
    return () => { delete window.axisTitles; };
  });
</script>

{#if scene.startsWith("defaults")}
  <div style="width:100%" data-sizing-container>
    <Plot bind:this={plot} data={base}
      {...(scene === "defaults-fixed" ? { width: 620, height: 320 } : {})}
      {...(scene === "defaults-full" ? { responsive: true } : {})}
      {...(scene === "defaults-hidden" ? { axes2d: false } : {})}
      {...(scene === "defaults-grid-off" ? { x: { grid: "off" }, y: { grid: "off" } } : {})}
      {...(scene === "defaults-map" ? { coordinates: "spherical", projection: "mercator" } : {})}
      {...(scene === "defaults-polar" ? { coordinates: "polar" } : {})}
      {...(scene.startsWith("defaults-3d") ? { type: "3d" } : {})}
      {...(scene === "defaults-3d-explicit" ? { axes3d: true, x: { grid: "major" } } : {})}>
      {#if scene.startsWith("defaults-3d")}<Points3D x="a" y="b" z="c" />
      {:else}<Points x="a" y="b" />{/if}
    </Plot>
  </div>
{:else if scene === "polar"}
  <!-- A polar plot's outer labels (TODO 136.10 slice 7): wide, its disk fills the height and the
       90 degree label takes the top; narrow, its disk fills the width and the side labels take it. -->
  {#each [{ width: 420, height: 320 }, { width: 240, height: 320 }] as size, i}
    <div data-polar={i}>
      <Plot data={{ angle: [0, 90, 180, 270], radius: [1, 2, 3, 2] }} coordinates="polar"
        baseRadius={0} radialScale={1} axes2d {...size}
        x={{ domain: [0, 360], step: 45 }} y={{ domain: [0, 3], step: 1, format: ".1f" }}>
        <Points x="angle" y="radius" />
      </Plot>
    </div>
  {/each}
  <!-- A globe's equator label runs outward from the limb. -->
  <div data-globe>
    <Plot coordinates="spherical" projection="orthographic" radialScale={0} axes2d width={320} height={320}
      rules={[{ axis: "y", value: 0, label: "Equator" }]}>
      <Points position={[[0, 0]]} />
    </Plot>
  </div>
{:else if scene === "motion"}
  <!-- The motion rules (TODO 136.10 slice 4): y from 0 to a million, so a zoom to the bottom
       narrows the labels and a pan to the top widens them again. -->
  <Plot bind:this={plot} data={{ v: [0, 1], w: [0, 1000000] }} width={420} height={240}>
    <Points x="v" y="w" />
  </Plot>
{:else if scene === "margins"}
  <!-- Margins fit the axes (TODO 136.10): long category names and an outside title on an auto
       left side; the same plot with the left side pinned. -->
  <Theme value={{ axes: { titlePlacement: "outside" } }}>
    {#each [undefined, 20] as axisMarginLeft}
      <Plot data={{ v: [1, 2, 3], name: ["Ruthenium oxide", "Iron", "Zinc"] }}
        width={420} height={240} axes2d {axisMarginLeft} y={{ label: "Compound" }}>
        <Points x="v" y="name" />
      </Plot>
    {/each}
  </Theme>
{:else if scene === "figure"}
  <!-- A Plot's height is the whole figure (TODO 136.10 slice 3): the title and the bottom legend
       take their room from it; the plain plot (no legend, not even the default one for its
       categorical fill, TODO 136.17) has a canvas that is all of it. -->
  {#each [{ title: "Compounds", subtitle: "By mass", legend: true }, { legend: false }, { legend: { position: "right" } }] as heading}
    <Plot data={{ v: [1, 2, 3], w: [3, 1, 2], kind: ["a", "b", "c"] }} width={420} height={260}
      axes2d {...heading}>
      <Points x="v" y="w" fill="kind" />
    </Plot>
  {/each}
{:else if scene === "theme"}
  <Theme value={{ axes: { titlePosition: "middle", titlePlacement: "outside" } }}>
    <Plot bind:this={plot} data={base} width={420} height={300} axes2d
      x={{ label: "Horizontal title" }} y={{ label: "Vertical title" }}>
      <Points x="a" y="b" />
    </Plot>
  </Theme>
{:else if scene === "theme-override"}
  <Theme value={{ axes: { titlePosition: "middle", titlePlacement: "outside" } }}>
    <Plot bind:this={plot} data={base} width={420} height={300} axes2d
      x={{ label: "Horizontal title", titlePlacement: "inside", titlePosition: "end" }}>
      <Points x="a" y="b" />
    </Plot>
  </Theme>
{:else if scene === "named"}
  <Plot bind:this={plot} {data} width={420} height={300} axes2d>
    <Points x="a" y={yName} size={3} />
    <Line x="a" y={yName} />
    <Text x={5} y={yName} text="g" />
  </Plot>
{:else if scene === "mixed"}
  <Plot bind:this={plot} data={base} width={420} height={300} axes2d>
    <Points x="a" y="b" size={3} />
    {#if mixed}<Points x="a" y="c" size={3} />{/if}
  </Plot>
{:else if scene === "unnamed"}
  <Plot bind:this={plot} data={base} width={420} height={300} axes2d>
    <Points x={base.a.map((v) => v * 2)} y={col("b")} size={3} />
  </Plot>
{:else if scene === "expression"}
  <Plot bind:this={plot} data={base} width={420} height={300} axes2d>
    <Points x="a" y={multiply(col("b"), 2)} size={3} />
  </Plot>
{:else if scene === "explicit"}
  <Plot y={{ label: "" }} bind:this={plot} data={base} width={420} height={300} axes2d x={{ label: "Alpha" }}>
    <Points x="a" y="b" size={3} />
  </Plot>
{:else if scene === "scale"}
  <Plot x={{ scale: categorical({ domain: ["p", "q", "r"], label: "Group" }) }} bind:this={plot} data={base} width={420} height={300} axes2d>
    <Points x="g" y="b" size={3} />
  </Plot>
{:else if scene === "histogram"}
  <Plot bind:this={plot} data={base} width={420} height={300} axes2d>
    <Histogram x="a" bins={5} />
  </Plot>
{:else if scene === "density"}
  <Plot bind:this={plot} data={base} width={420} height={300} axes2d>
    <Density x="a"><Line x="x" y="density" /></Density>
  </Plot>
{:else if scene === "ribbon-horizontal"}
  <Plot bind:this={plot} data={base} width={420} height={300} axes2d>
    <Area opacity={0.2} orientation="horizontal" y="id" lower="c" upper="c" />
  </Plot>
{:else if scene === "bin"}
  <Plot bind:this={plot} data={base} width={420} height={300} axes2d>
    <Bin x="a" bins={5}><Rect x0="x0" x1="x1" y0={0} y1="count" /></Bin>
  </Plot>
{:else if scene === "stack"}
  <Plot bind:this={plot} data={base} width={420} height={300} axes2d>
    <Stack x="id" y="b"><Area x="id" upper="y1" lower="y0" /></Stack>
  </Plot>
{:else if scene === "bar" || scene === "boxplot" || scene === "violin" || scene === "lollipop"}
  <!-- An explicit category scale, as the gallery's BoxPlot and Violin use (over a plain string
       column their statistics' marks can otherwise meet the axis before it has one). -->
  <Plot x={{ scale: categorical({ domain: ["p", "q", "r"] }) }} bind:this={plot} data={base} width={420} height={300} axes2d>
    {#if scene === "bar"}<Bar x="g" y="b" />
    {:else if scene === "boxplot"}<BoxPlot x="g" y="b" />
    {:else if scene === "violin"}<Violin x="g" y="b" />
    {:else}<Lollipop x="g" y="b" />{/if}
  </Plot>
{:else if scene === "fields"}
  <Plot bind:this={plot} data={base} width={640} height={300} axes2d>
    <Facet fields={["a", "b", "c"]}><Points x="id" y="value" size={2.5} /></Facet>
  </Plot>
{:else if scene === "fields-label"}
  <Plot bind:this={plot} data={base} width={640} height={300} axes2d y={{ label: "Value" }}>
    <Facet fields={["a", "b", "c"]}><Points x="id" y="value" size={2.5} /></Facet>
  </Plot>
{:else if scene === "categories"}
  <Plot bind:this={plot} data={base} width={640} height={300} axes2d>
    <Facet column="g" layout="grid"><Points x="a" y="b" size={2.5} /></Facet>
  </Plot>
{:else if scene === "fold"}
  <Plot bind:this={plot} data={base} width={640} height={300} axes2d>
    <Fold fields={["a", "b"]}><Facet column="key" layout="grid"><Points x="id" y="value" size={2.5} /></Facet></Fold>
  </Plot>
{:else if scene === "pairs"}
  <Data value={base}>
    <Facet pairs={{ x: ["a", "b"], y: ["c"] }}>
      <Plot height={220} axes2d><Points x="x" y="y" size={2.5} /></Plot>
    </Facet>
  </Data>
{:else if scene === "outer"}
  <!-- One set of outer axes (TODO 136.10 slice 5): three cells wrapped two to a row share both
       scales, so x is labeled on the lowest cell of each column and y on the left column, and
       the cells' plot areas line up. -->
  <Data value={base}>
    <Facet column="g" wrap={2}>
      <Plot height={220} axes2d><Points x="a" y="b" size={2.5} /></Plot>
    </Facet>
  </Data>
{:else if scene === "twin"}
  <Plot bind:this={plot} data={base} width={480} height={300} axes2d y={{ label: "Temp" }}>
    <Points x="a" y="b" size={3} />
    <Frame y={{ domain: [0, 10], side: "right" }}><Line x="a" y="c" /></Frame>
  </Plot>
{:else if scene === "domains"}
  <!-- A y domain the spec changes (TODO 136.10): the gutters it lands on are the ones the plot
       opens with at that domain, whatever it showed before. -->
  <Plot bind:this={plot} data={base} width={plotWidth} height={300} {dynamicMargins} axes2d y={{ domain: yDomain, ...(yFormat ? { format: yFormat } : {}) }}>
    <Points x="a" y="c" size={3} />
  </Plot>
{:else if scene === "stacked"}
  <!-- Two twin y axes on the right (TODO 136.10): the solver stacks the second past the first's
       wide labels and fits both. -->
  <Plot bind:this={plot} data={base} width={520} height={300} axes2d>
    <Points x="a" y="b" size={3} />
    <Frame y={{ domain: [0, 2000000], side: "right" }}><Line x="a" y="b" /></Frame>
    <Frame y={{ domain: [0, 10], side: "right" }}><Line x="a" y="c" /></Frame>
  </Plot>
{:else if scene === "inherit"}
  <!-- A child Frame that owns y and inherits x: its x vote titles the root's x axis. -->
  <Plot bind:this={plot} data={base} width={480} height={300} axes2d>
    <Frame y={{ domain: [0, 10], side: "right" }}><Points x="a" y="c" size={3} /></Frame>
  </Plot>
{:else if scene === "3d"}
  <Plot bind:this={plot} data={base} type="3d" width={420} height={360} axes3d>
    <Points3D x="a" y="b" z="c" size={6} />
  </Plot>
{:else if scene === "3d-off"}
  <Plot bind:this={plot} data={base} type="3d" width={420} height={360} axes3d axisTitles={false}>
    <Points3D x="a" y="b" z="c" size={6} />
  </Plot>
{:else if scene === "surface"}
  <Plot bind:this={plot} data={grid} type="3d" width={420} height={360} axes3d>
    <Interpolate x="lon" y="lat" values={["elev"]} resolution={[8, 8]}><Heatmap fill="elev" surfaceMode /></Interpolate>
  </Plot>
{/if}
