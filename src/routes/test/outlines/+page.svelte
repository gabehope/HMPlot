<script>
  import { Plot, Rect, Points, Area,  Polygon, GeoJSON, where, greater, continuous, categorical, animate } from "$lib/index";
import { DensityBands } from "$lib/charts/index.js";
  import { page } from "$app/state";
  const channels = page.url.searchParams.has("channels");
  const fillScale = continuous({domain:[0,1],colormap:"viridis"});
  const edgeScale = categorical({domain:["red"],range:["#e60000"]});
  const plots = $state({});
  const hits = [];
  let alpha = $state(1), geoAlpha = $state(1), width = $state(4), whole = $state(1), shown = $state(true), animated = $state(false), hollow = $state(false);
  // Geometry probes must not count the red borders of automatic legend swatches.
  const settings = { width: 400, height: 240, legend: false, axes2d: false, axisMask: false, toneMapping: 0,
    x: { domain: [0, 4], visible: false }, y: { domain: [0, 3], visible: false }, background: "white" };
  const data = { left: [0.5, 2.5], right: [1.5, 3.5], bottom: [1, 1], top: [2, 2], alpha: [1, 0], border: [4, 8] };
  const geo = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: {
    type: "Polygon", coordinates: [[[0.5,1],[1.5,1],[1.5,2],[0.5,2],[0.5,1]]] } }] };
  const style = { fill: "#d0d0d0", outlineColor: "#e60000", outlineWidth: 4, opacity: 1 };
  $effect(() => {
    window.outlines = { plots, hits, animate:()=>{animated=true;}, hollow:()=>{hollow=true;},
      set: (a, w = 4, o = 1, g = a) => { alpha = a; geoAlpha = g; width = w; whole = o; }, remove: () => { shown = false; } };
    return () => { delete window.outlines; };
  });
</script>

{#if shown}
  <div class="plots">
    <Plot bind:this={plots.rect} data={data} {...settings}>
      <Rect x0="left" x1="right" y0="bottom" y1="top" {...style} outlineWidth={width} outlineOpacity={animated ? animate(alpha,{duration:500,easing:"linear"}) : alpha}
        opacity={whole} onclick={e=>hits.push(e.rowIndex)} />
    </Plot>
    <Plot bind:this={plots.rows} data={data} {...settings}>
      <Rect x0="left" x1="right" y0="bottom" y1="top" {...style} outlineWidth="border" outlineOpacity={where(greater("alpha", 0), 1, 0)} />
    </Plot>
    <Plot bind:this={plots.polygon} data={{x:[0.5,1.5,1.5,0.5], y:[1,1,2,2]}} {...settings}>
      <Polygon x="x" y="y" {...style} outlineOpacity={alpha} />
    </Plot>
    <Plot bind:this={plots.area} data={{x:[0.5,1,1.5], y:[2,2,2]}} {...settings}>
      <Area x="x" upper="y" lower={1} {...style} outlineOpacity={alpha} />
    </Plot>
    <Plot bind:this={plots.ribbon} data={{x:[0.5,1,1.5], low:[1,1,1], high:[2,2,2]}} {...settings}>
      <Area x="x" lower="low" upper="high" {...style} outlineOpacity={alpha} />
    </Plot>
    <Plot bind:this={plots.points} data={{x:[1,3], y:[1.5,1.5], alpha:[1,0]}} {...settings}>
      <Points x="x" y="y" size={64} {...style} fill={hollow ? "transparent" : style.fill} outlineWidth={6.4} outlineOpacity={where(greater("alpha", 0), alpha, 0)} />
    </Plot>
    <Plot bind:this={plots.polar} {...settings} coordinates="polar" angleUnit="radians">
      <Rect x0={0} x1={Math.PI / 2} y0={0.5} y1={2} {...style} outlineOpacity={alpha} />
    </Plot>
    <Plot bind:this={plots.geo} {...settings} antialias="off">
      <GeoJSON data={geo} {...style} outlineOpacity={geoAlpha} />
    </Plot>
    {#if channels}
      <Plot bind:this={plots.numericPolygon} data={{x:[0.5,1.5,1.5,0.5], y:[1,1,2,2],
        value:[0.5,0.5,0.5,0.5], border:[4,4,4,4], alpha:[1,1,1,1], edge:["red","red","red","red"]}} {...settings}>
        <Polygon x="x" y="y" fill="value" {fillScale}
          outlineWidth="border" outlineOpacity="alpha" outlineColor="edge" outlineColorScale={edgeScale} />
      </Plot>
      <Plot bind:this={plots.numericPolar} data={{lo:[0,Math.PI/2], hi:[Math.PI/2,Math.PI],
        value:[0.5,0.8], border:[4,8], alpha:[1,0], edge:["red","red"]}} {...settings} coordinates="polar" angleUnit="radians">
        <Rect x0="lo" x1="hi" y0={0.5} y1={2} fill="value" {fillScale}
          outlineWidth="border" outlineOpacity={where(greater("alpha",0),1,0)} outlineColor="edge"
          outlineColorScale={edgeScale} />
      </Plot>
      <Plot bind:this={plots.contours} data={{x:[0.8,0.9,1,1.1,1.2,2.8,2.9,3,3.1,3.2],
        y:[1.4,1.5,1.6,1.5,1.4,1.4,1.5,1.6,1.5,1.4]}} {...settings}>
        <DensityBands x="x" y="y" bandwidth={0.25} resolution={32} thresholds={5}
          outlineWidth={2} outlineColor="#e60000" outlineOpacity={1} />
      </Plot>
      <Plot bind:this={plots.numericBand} data={{x:[0.5,1,1.5],low:[1,1,1],high:[2,2,2],
        value:[0.5,0.5,0.5],border:[4,4,4],alpha:[1,1,1],edge:["red","red","red"]}} {...settings}>
        <Area x="x" lower="low" upper="high" fill="value" {fillScale} opacity={1}
          outlineWidth="border" outlineOpacity="alpha" outlineColor="edge" outlineColorScale={edgeScale} />
      </Plot>
      <Plot bind:this={plots.numericPoints} data={{x:[1,3],y:[1.5,1.5],value:[0.5,0.8],edge:["red","red"],
        alpha:[1,0.5],rim:[6.4,6.4]}} {...settings}>
        <Points x="x" y="y" fill="value" {fillScale} size={[64,64]} dx={[0,2]} dy={[0,1]}
          outlineColor="edge" outlineColorScale={edgeScale} outlineWidth="rim" outlineOpacity="alpha" />
      </Plot>
      <Plot bind:this={plots.numericBox} data={{left:[0.5,2.5],right:[1.5,3.5],value:[0.5,0.8],
        border:[4,8],alpha:[1,0.5],edge:["red","red"]}} {...settings} type="3d" axes3d={false} z={{domain:[0,3]}}>
        <Rect x0="left" x1="right" y0={1} y1={2} z0={0} z1={1.5} fill="value" {fillScale}
          outlineColor="edge" outlineColorScale={edgeScale} outlineWidth="border" outlineOpacity="alpha" />
      </Plot>
    {/if}
  </div>
{/if}

<style>.plots { display:grid; grid-template-columns:repeat(2,400px); gap:12px; padding:12px; }</style>
