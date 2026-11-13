<script>
  import { Plot, Frame, Rect, Area, Line } from "$lib/index";
import { ErrorBars } from "$lib/charts/index.js";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const scene = params.get("scene") ?? "globe";
  let plot = $state(), probe = $state(), center = $state([0, 0]);
  $effect(() => {
    window.stage14LonLat = { get plot() { return plot; }, get probe() { return probe; }, scene, setCenter(value) { center = value; } };
    return () => { delete window.stage14LonLat; };
  });
</script>

{#if scene === "globe"}
  <!-- A root globe: a lon/lat box, one across the east limb, a band along
       latitude 40, and a longitude error bar, with Lines on their edges. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} coordinates="spherical" projection="orthographic"
    projectionCenter={center} x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <Rect bind:this={probe} x0={[-40]} x1={[20]} y0={[-30]} y1={[10]} fill="#13bd4e" />
    <Rect x0={[60]} x1={[130]} y0={[-50]} y1={[-20]} fill="#1a5fd0" />
    <Area opacity={0.2} x={[-60, -20, 20, 60]} lower={[35, 35, 35, 35]} upper={[45, 45, 45, 45]} fill="#8a2be2" />
    <ErrorBars position={[[-10, -60]]} lower={[-40]} upper={[40]} orientation="horizontal" color="#202020" width={2} capSize={0} />
    <Line position={[[-40, 10], [20, 10]]} interpolation="angular" color="#d43735" width={2} />
  </Plot>
{:else if scene === "map"}
  <!-- A root Mercator map: a lon/lat box is an axis-aligned rectangle, and
       one across the antimeridian (160..200) shows at both edges. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} coordinates="spherical" projection="mercator"
    x={{ domain: [-180, 180], visible: false }} y={{ domain: [-80, 80], visible: false }}>
    <Rect x0={[-40]} x1={[20]} y0={[-30]} y1={[10]} fill="#13bd4e" />
    <Rect x0={[160]} x1={[200]} y0={[30]} y1={[50]} fill="#1a5fd0" />
  </Plot>
{:else if scene === "child"}
  <!-- A globe child fitted into a Cartesian root holds a lon/lat box. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }}>
    <Frame coordinates="spherical" projection="orthographic" radialScale={0}
      x={{ domain: [-180, 180], range: [-0.8, 0.8], visible: false }}
      y={{ domain: [-90, 90], range: [-0.8, 0.8], visible: false }}>
      <Rect x0={[-40]} x1={[20]} y0={[-30]} y1={[10]} fill="#13bd4e" />
      <Line position={[[-40, 10], [20, 10]]} interpolation="angular" color="#d43735" width={2} />
    </Frame>
  </Plot>
{/if}
