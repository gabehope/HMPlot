<script>
  import { Plot, Frame, Data, Points, Line, Arrows3D, connect } from "$lib/index";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const scene = params.get("scene") ?? "root";
  let plot = $state(), a = $state(), b = $state(), c = $state(), center = $state([0, 0]);
  $effect(() => {
    window.stage14GlobeConnect = { get plot() { return plot; }, scene, setCenter(value) { center = value; } };
    return () => { delete window.stage14GlobeConnect; };
  });
  // One row: three places on the globe, and (for the chart scene) a chart point.
  const rows = { lon0: [-60], lat0: [40], lon1: [50], lat1: [30], lon2: [150], lat2: [-10], cx: [1], cy: [1] };
</script>

{#if scene === "root"}
  <!-- Two points on a root globe joined by a connector: a great circle, drawn
       over a reference Line with the same ends. A third point lies behind the
       horizon: its connector is cut at the limb. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} coordinates="spherical" projection="orthographic"
    projectionCenter={center} x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <Line position={[[-60, 40], [50, 30]]} color="#d43735" width={8} />
    <Data value={rows}>
      <Points bind:this={a} x="lon0" y="lat0" size={5} fill="#1a5fd0" />
      <Points bind:this={b} x="lon1" y="lat1" size={5} fill="#1a5fd0" />
      <Points bind:this={c} x="lon2" y="lat2" size={5} fill="#1a5fd0" />
      {#if a && b}<Line connections={connect(a, b)} color="#13bd4e" width={3} />{/if}
      <!-- Arrows3D sizes are world units: the globe's radius is 1 (100 px). -->
      {#if b && c}<Arrows3D connections={connect(b, c)} color="#8a2be2" width={0.03} headLength={0.1} headWidth={0.08} />{/if}
    </Data>
  </Plot>
{:else if scene === "chart"}
  <!-- An endpoint in a chart warped onto the globe connects to one on the globe:
       the chart's (1, 1) is longitude 60, latitude 40. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="spherical" projection="orthographic"
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Line position={[[-60, -10], [60, 40]]} color="#d43735" width={8} />
      <Data value={rows}>
        <Points bind:this={a} x="lon0" y="lat2" size={5} fill="#1a5fd0" />
        <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [0, 60], visible: false }}
          y={{ domain: [0, 1], range: [0, 40], visible: false }}>
          <Points bind:this={b} x="cx" y="cy" size={5} fill="#1a5fd0" />
        </Frame>
        {#if a && b}<Line connections={connect(a, b)} color="#13bd4e" width={3} />{/if}
      </Data>
    </Frame>
  </Plot>
{:else if scene === "placed"}
  <!-- An endpoint in a pixel-placed inset on the globe: its chain does not pass
       through the globe's own longitude and latitude, so the connector reports it. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} coordinates="spherical" projection="orthographic"
    x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <Data value={rows}>
      <Points bind:this={a} x="lon0" y="lat0" size={5} fill="#1a5fd0" />
      <Frame placement={{ anchor: [20, 10], size: [60, 60] }} x={{ domain: [0, 1], visible: false }}
        y={{ domain: [0, 1], visible: false }}>
        <Points bind:this={b} x="cx" y="cy" size={5} fill="#1a5fd0" />
      </Frame>
      {#if a && b}<Line connections={connect(a, b)} color="#13bd4e" width={3} />{/if}
    </Data>
  </Plot>
{/if}
