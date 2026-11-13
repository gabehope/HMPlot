<script>
  // TODO 38 fixtures: offsets read through moved(), set from code (38.1) and by dragging (38.3).
  // Each section has its own table; rows are told apart by color (red is always row 0 or the
  // row a test drags).
  import { onMount } from "svelte";
  import { Data, Plot, Facet, Filter, Calculate, Group, Points, moved, greater, animate, categorical, mean } from "$lib/index";
  const RED = "#d62728", BLUE = "#1f77b4", GREEN = "#2ca02c", PURPLE = "#9467bd";
  const colors = categorical({ domain: ["a", "b", "c", "d"], range: [RED, BLUE, GREEN, PURPLE] });
  const table = { id: ["a", "b", "c", "d"], x: [1, 2, 3, 4], y: [1, 2, 3, 4] };
  const matrix = { id: ["a", "b", "c"], p: [2, 5, 8], q: [8, 5, 2] };
  const logged = { id: ["a"], v: [3], y: [5] };
  const polar = { id: ["a"], angle: [45], radius: [2] };
  const cities = { id: ["a"], lon: [10], lat: [20] };
  const picks = { id: ["a", "b", "c"], x: [2, 5, 8], y: [5, 5, 5] };
  const strip = { id: ["a", "b"], g: ["one", "two"], v: [3, 6] };
  const animated = { id: ["a"], x: [3], y: [5] };
  const grouped = { id: ["a", "b", "c", "d"], g: ["a", "a", "b", "b"], gx: [3, 3, 7, 7], w: [2, 4, 6, 8] };
  const groupColors = categorical({ domain: ["a", "b"], range: [RED, BLUE] });
  const domains = { x: { domain: [0, 10] }, y: { domain: [0, 10] } };
  const sameArea = { axisMarginLeft: 48, axisMarginBottom: 32 };
  const handles = $state({});
  onMount(() => {
    window.drag = handles;
    return () => { delete window.drag; };
  });
</script>

<div class="grid">
<!-- The same area in every plot (an automatic margin fits each one's own titles), so a drag's
  pixels are the same distance in each. -->
<section id="moved">
  <Data bind:this={handles.data} value={table} key="id">
    <h3>moved()</h3>
    <Plot bind:this={handles.follows} width={260} height={160} axes2d {...domains} {...sameArea}>
      <Points bind:this={handles.followsPoints} x={moved("x")} y={moved("y")} size={11} fill="id" fillScale={colors} drag />
    </Plot>
    <h3>Without moved()</h3>
    <Plot bind:this={handles.fixed} width={260} height={160} axes2d {...domains} {...sameArea}>
      <Points x="x" y="y" size={11} fill="id" fillScale={colors} drag />
    </Plot>
    <h3>Filter on moved(x) &gt; 3</h3>
    <Plot bind:this={handles.filtered} width={260} height={160} axes2d {...domains} {...sameArea}>
      <Filter where={[greater(moved("x"), 3)]}>
        <Points bind:this={handles.filteredPoints} x={moved("x")} y="y" size={11} fill="id" fillScale={colors} />
      </Filter>
    </Plot>
  </Data>
</section>

<section id="matrix">
  <h3>Scatterplot matrix</h3>
  <Data bind:this={handles.matrixData} value={matrix} key="id">
    <Facet bind:this={handles.matrix} pairs={["p", "q"]} link="grid">
      <Plot height={150} axes2d x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
        <Points x={moved("x")} y={moved("y")} size={11} fill="id" fillScale={colors} drag />
      </Plot>
    </Facet>
  </Data>
</section>

<section id="log">
  <h3>Log x</h3>
  <Plot bind:this={handles.log} data={logged} key="id" width={260} height={160} axes2d
    x={{ domain: [1, 100], transform: "log" }} y={{ domain: [0, 10] }}>
    <Points x={moved("v")} y="y" size={11} fill={RED} drag="x" />
  </Plot>
</section>

<section id="polar">
  <h3>Polar</h3>
  <Plot bind:this={handles.polar} data={polar} key="id" coordinates="polar" baseRadius={0} radialScale={1}
    x={{ domain: [0, 360] }} y={{ domain: [0, 3] }} axes2d width={240} height={240}>
    <Points x={moved("angle")} y={moved("radius")} size={11} fill={RED} drag />
  </Plot>
</section>

<section id="map">
  <h3>Mercator map</h3>
  <Plot bind:this={handles.map} data={cities} type="2d" width={260} height={200} coordinates="spherical" projection="mercator"
    x={{ domain: [-180, 180], visible: false }} y={{ domain: [-80, 80], visible: false }}>
    <Points x={moved("lon")} y={moved("lat")} size={11} fill={RED} drag />
  </Plot>
</section>

<section id="selection">
  <h3>Selection</h3>
  <Data bind:this={handles.picksData} value={picks} key="id">
    <Plot bind:this={handles.picks} width={260} height={160} axes2d {...domains}>
      <Points x={moved("x")} y="y" size={11} fill="id" fillScale={colors} select selectionOpacity={1} drag="x" />
    </Plot>
  </Data>
</section>

<section id="strip">
  <h3>Strip plot</h3>
  <Data bind:this={handles.stripData} value={strip} key="id">
    <Plot bind:this={handles.strip} legend={false} width={260} height={160} axes2d y={{ domain: [0, 10] }}>
      <Points x="g" y={moved("v")} size={11} fill="id" fillScale={colors} drag />
    </Plot>
  </Data>
</section>

<section id="animated">
  <h3>animate()</h3>
  <Data bind:this={handles.animatedData} value={animated} key="id">
    <Plot bind:this={handles.animated} width={260} height={160} axes2d {...domains}>
      <Points x={animate(moved("x"), { duration: 1500, easing: "linear" })} y="y" size={11} fill={RED} drag="x" />
    </Plot>
  </Data>
</section>
<section id="aggregate">
  <h3>Group mean</h3>
  <Data bind:this={handles.groupedData} value={grouped} key="id">
    <Plot bind:this={handles.aggregate} width={260} height={160} axes2d {...domains}>
      <Calculate columns={{ w2: moved("w") }}>
        <Group by={["g", "gx"]} columns={{ m: mean("w2") }}>
          <Points x="gx" y="m" size={11} fill="g" fillScale={groupColors} drag />
        </Group>
      </Calculate>
    </Plot>
  </Data>
</section>
</div>

<style>
  /* Every section fits the test viewport (1500 x 1100), so pointer coordinates need no scrolling. */
  .grid { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
  #matrix { width: 420px; }
  h3 { margin: 2px 0; font-size: 13px; }
</style>
