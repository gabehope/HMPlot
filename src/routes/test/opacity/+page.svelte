<script>
  // Point opacity fixtures: a translucent constant-opacity mark, an opaque reference mark,
  // and a brushable mark whose unbrushed rows fade through interaction feedback; and
  // translucent path marks (plots.paths); and Rects with antialiasing off and with 4x MSAA
  // (plots.edgesOff, plots.edgesMsaa: TODO 59's analytic edges); and three series in one Line
  // (plots.series: TODO 62, hover, select and brush take whole series, and hover fades nothing);
  // and nearest without a tooltip (plots.nearest: TODO 72), a 1 px Line of the three series and
  // two small points, whose @nearest widens and enlarges what the tolerant pick finds.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Plot, Data, Filter, Points, Line, Segments, Arrows3D, Rect, categorical, continuous, where, less, greater_equal, divide, clip, view, mean } from "$lib/index";
  const scalarSection = $derived(page.url.searchParams.get("section") === "scalar");
  let limit = $state(8);
  const scalarRows = { id: Array.from({ length: 2048 }, (_, i) => i),
    x: Array.from({ length: 2048 }, (_, i) => i % 32), y: Array.from({ length: 2048 }, (_, i) => Math.floor(i / 32)) };
  const fixedColor = continuous({ domain: [0, 2048], colormap: "viridis" });
  let plot = $state(), translucent = $state(), brushed = $state();
  const plots = $state({}), marks = $state({});
  onMount(() => {
    window.opacityFixture = { get plot() { return plot; }, get translucent() { return translucent; }, get brushed() { return brushed; }, plots, marks,
      setLimit(value) { limit = value; } };
    return () => { delete window.opacityFixture; };
  });
  const data = { x: [10, 20, 30, 40], y: [15, 15, 15, 15] };
  // 6.11 A5: overlapping 3D points with and without hover must rasterize alike (no halos).
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cloud = { x: Array.from({ length: 1500 }, random), y: Array.from({ length: 1500 }, random), z: Array.from({ length: 1500 }, random) };
  // Off the pixel grid: a turned Rect, and two side by side whose shared edge crosses pixels
  // off center (x 21.725: a quarter or half a pixel in, at device pixel ratio 1 or 2).
  const edgeProps = { width: 300, height: 200, toneMapping: 0, x: { domain: [0, 30] }, y: { domain: [0, 20] } };
  const cloudProps = { width: 400, height: 400, type: "3d", axes3d: false, toneMapping: 0, x: { domain: [0, 1] }, y: { domain: [0, 1] }, z: { domain: [0, 1] } };
  // Three flat series, 11 rows each (a: rows 0-10 at y 5, b: 11-21 at 15, c: 22-32 at 25).
  const cities = { day: [], value: [], city: [] };
  for (const [k, city] of ["a", "b", "c"].entries())
    for (let day = 0; day <= 10; day++) { cities.day.push(day); cities.value.push(5 + 10 * k); cities.city.push(city); }
  const cityColors = categorical({ domain: ["a", "b", "c"], range: ["#ff0000", "#00b000", "#0000ff"] });
  // Two points between the lines, far from them: (2, 20) and (8, 10).
  const dots = { x: [2, 8], y: [20, 10] };
</script>
{#if scalarSection}
  <Plot bind:this={plots.scalar} width={480} height={480} toneMapping={0} x={{ domain: [-1, 32] }} y={{ domain: [-1, 65] }}>
    <Data value={scalarRows}>
      <Filter where={greater_equal("id", 2048 - limit)}>
        <Points bind:this={marks.scalar} x="x" y="y" fill="id" fillScale={fixedColor} size={5}
          maxElements={32} opacity={clip(divide(view.time, 1000), 0, 1)} select />
      </Filter>
    </Data>
  </Plot>
  <Plot bind:this={plots.scalarFields} width={400} height={200} toneMapping={0} x={{ domain: [-1, 4] }} y={{ domain: [-1, 4] }}>
    <Data value={{ x: [0, 1, 2], y: [1, 1, 1] }}>
      <Points bind:this={marks.scalarFields} x="x" y="y" size={divide(view.time, 100)}
        fill={divide(view.time, 1000)} fillScale={continuous({ domain: [0, 1] })} opacity={mean("y")} />
      <Line bind:this={marks.scalarLine} x="x" y={2} color="#ff0000" width={divide(view.time, 250)}
        opacity={clip(divide(view.time, 1000), 0, 1)} />
    </Data>
  </Plot>
{:else}
<Plot bind:this={plot} data={data} width={500} height={300} axes2d x={{domain: [0, 50]}} y={{domain: [0, 50]}}>
  <Points bind:this={translucent} position={[[10, 40], [20, 40]]} size={20} fill="#0000ff" opacity={0.2} />
  <Points position={[[35, 40]]} size={20} fill="#00aa00" />
  <Points bind:this={brushed} x="x" y="y" size={20} fill="#ff0000" brush />
</Plot>
<Plot bind:this={plots.plain} data={cloud} {...cloudProps}>
  <Points bind:this={marks.plain} x="x" y="y" z="z" size={7} fill="#1f3a93" />
</Plot>
<Plot bind:this={plots.hover} data={cloud} {...cloudProps}>
  <!-- respond="hovered": a hover that fades (hover alone fades nothing, TODO 62.2). -->
  <Points bind:this={marks.hover} x="x" y="y" z="z" size={7} fill="#1f3a93" hover respond="hovered" />
</Plot>
<Plot bind:this={plots.paths} width={400} height={200} toneMapping={0} x={{domain: [0, 50]}} y={{domain: [0, 50]}}>
  <Line position={[[5, 10, 0], [45, 10, 0]]} color="#ff0000" width={12} opacity={0.5} />
  <Segments start={[[5, 25, 0]]} end={[[45, 25, 0]]} color="#00ff00" width={12} opacity={0.5} />
  <Arrows3D start={[[5, 40, 0]]} end={[[45, 40, 0]]} color="#0000ff" width={12} headWidth={24} headLength={16} opacity={0.5} />
</Plot>
{#each ["off", "msaa"] as antialias (antialias)}
  <Plot bind:this={plots[antialias === "off" ? "edgesOff" : "edgesMsaa"]} {...edgeProps} {antialias}
    name={antialias === "off" ? "Rect edges, antialiasing off" : "Rect edges, 4x MSAA"}>
    <Rect x0={4.13} x1={11.37} y0={3.21} y1={16.62} rotation={23} fill="#1f3a93" />
    <Rect x0={[15.29, 21.725]} x1={[21.725, 26.47]} y0={4.38} y1={[15.83, 12.06]} fill="#b03a2e" />
  </Plot>
{/each}
<div data-fixture="series">
  <Plot bind:this={plots.series} data={cities} width={400} height={240} axes2d toneMapping={0} x={{ domain: [-1, 11] }} y={{ domain: [0, 30] }}>
    <Line bind:this={marks.series} x="day" y="value" series="city" color="city" colorScale={cityColors}
      width={where("@hovered", 8, 4)} hover select brush />
  </Plot>
</div>
<div data-fixture="nearest">
  <Plot bind:this={plots.nearest} width={400} height={240} axes2d toneMapping={0} x={{ domain: [-1, 11] }} y={{ domain: [0, 30] }}>
    <Data value={cities}>
      <Line bind:this={marks.nearestLine} x="day" y="value" series="city" color="city" colorScale={cityColors}
        width={where("@nearest", 5, 1)} nearest hover />
    </Data>
    <Data value={dots}>
      <Points bind:this={marks.nearestPoints} x="x" y="y" fill="#ff00ff" size={where("@nearest", 7, 2.5)}
        nearest={{ radius: 12 }} hover />
    </Data>
  </Plot>
</div>
{/if}
