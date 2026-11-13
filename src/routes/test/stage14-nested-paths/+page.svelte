<script>
  import { Plot, Frame, Line, Segments, Arrows3D,  Area, Rect, GeoJSON, Points } from "$lib/index";
import { ErrorBars, Bar } from "$lib/charts/index.js";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const scene = params.get("scene") ?? "polar-log";
  const bandX = JSON.parse(params.get("bandX") ?? "[0, 0.5, 1]"),
    bandRange = JSON.parse(params.get("bandRange") ?? "[-150, 150]");
  let plot = $state(), center = $state([0, 0]), probe = $state();
  $effect(() => {
    window.stage14NestedPaths = { get plot() { return plot; }, get probe() { return probe; }, scene, lastPick: null,
      setCenter(value) { center = value; } };
    return () => { delete window.stage14NestedPaths; };
  });
  // A quarter turn at radius 1, then a spoke back toward the center.
  const turn = [[0, 1], [3, 1], [6, 1], [6, 0.2]];
  const pick = (event) => window.stage14NestedPaths.lastPick = {
    instanceId: event.instanceId, axisValue: event.axisValue };
</script>

{#if scene === "polar-log"}
  <!-- A ranged polar child inside a log parent: the arc bends twice, and so
       does an angular error bar. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [1, 100], transform: "log" }} y={{ domain: [1, 100], transform: "log" }}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], range: [10, 90], visible: false }}
      y={{ domain: [0, 1], range: [10, 90], visible: false }}>
      <Line position={turn} color="#13bd4e" width={6} />
      <ErrorBars orientation="horizontal" position={[[12, 0.5]]} lower={[9]} upper={[15]} color="#8a2be2" width={6} capSize={12} />
    </Frame>
  </Plot>
{:else if scene === "polar-on-globe"}
  <!-- A polar child fitted inside an orthographic globe. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
        x={{ domain: [0, 24], range: [-60, 60], visible: false }}
        y={{ domain: [0, 1], range: [-60, 60], visible: false }}>
        <Line position={[[0, 1], [6, 1], [12, 1], [18, 1], [24, 1]]} color="#13bd4e" width={6}
          onclick={pick} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "orthographic-child"}
  <!-- An orthographic child in a Cartesian root; the meridian crosses its horizon. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center} radialScale={0}
      x={{ domain: [-180, 180], range: [-0.8, 0.8], visible: false }}
      y={{ domain: [-90, 90], range: [-0.8, 0.8], visible: false }}>
      <Line position={[[-150, 0], [-90, 0], [-30, 0], [30, 0], [90, 0], [150, 0]]}
        color="#13bd4e" width={6} />
    </Frame>
  </Plot>
{:else if scene === "embedded-map"}
  <!-- An equirectangular inset, one pixel per degree; the path crosses the antimeridian. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Frame coordinates="spherical" projection="equirectangular"
      placement={{ anchor: [0.5, 0.5], size: [360, 180] }}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Line position={[[150, 20], [-150, 20]]} interpolation="angular" color="#13bd4e" width={6} />
      <Line position={[[120, -20], [240, -20]]} interpolation="angular" color="#1a5fd0" width={6} />
    </Frame>
  </Plot>
{:else if scene === "chart-in-polar"}
  <!-- A Cartesian chart warped by its polar parent. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24] }} y={{ domain: [0, 3] }}>
      <Frame coordinates="cartesian"
        x={{ domain: [0, 1], range: [0, 12] }}
        y={{ domain: [0, 1], range: [1, 2] }}>
        <Line position={[[0, 0.5], [1, 0.5]]} color="#13bd4e" width={6} onclick={pick} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "path-family"}
  <!-- Segments, Arrows and a cubic Link in an orthographic child. The blue
       arrow's end is behind the horizon (no head); the violet one's is visible. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center} radialScale={0}
      x={{ domain: [-180, 180], range: [-0.8, 0.8], visible: false }}
      y={{ domain: [-90, 90], range: [-0.8, 0.8], visible: false }}>
      <Segments start={[[-60, 40]]} end={[[150, 40]]} color="#13bd4e" width={6} />
      <!-- Arrows3D sizes are world units: the 400 px plot is 100 across (4 px each). -->
      <Arrows3D start={[[-60, 0]]} end={[[150, 0]]} color="#1a5fd0" width={1.5} headLength={4.5} headWidth={4.5} />
      <Arrows3D start={[[150, -15]]} end={[[-45, -15]]} color="#8a2be2" width={1.5} headLength={4.5} headWidth={4.5} />
      <Segments start={[[-60, -40]]} end={[[60, -40]]} control1={[[-20, -70]]} control2={[[20, -70]]}
        curve="cubic" color="#d43735" width={6} />
    </Frame>
  </Plot>
{:else if scene === "band-angular"}
  <!-- An angular Area band in a polar root: its cross-section is an arc, not a chord. -->
  <Plot bind:this={plot} coordinates="polar" angleUnit="custom" anglePeriod={24}
    width={400} height={400} x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 2], visible: false }}>
    <Area orientation="horizontal" y={[1, 2]} lower={[0, 0]} upper={[6, 6]} fill="#13bd4e" opacity={1} />
  </Plot>
{:else if scene === "band-nested"}
  <!-- An Area in a Cartesian chart warped by its polar parent, and an Area band in a
       polar child fitted inside log/log parents. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [1, 100], transform: "log" }} y={{ domain: [1, 100], transform: "log" }}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], range: [10, 90], visible: false }}
      y={{ domain: [0, 1], range: [10, 90], visible: false }}>
      <Area orientation="horizontal" y={[0.5, 1]} lower={[0, 0]} upper={[6, 6]} fill="#13bd4e" opacity={1} />
    </Frame>
  </Plot>
{:else if scene === "band-on-globe"}
  <!-- An Area in a Cartesian chart warped onto a globe; it runs behind the horizon. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Frame coordinates="cartesian"
        x={{ domain: [0, 1], range: bandRange, visible: false }}
        y={{ domain: [0, 1], range: [-30, 30], visible: false }}>
        <Area bind:this={probe} x={bandX} upper={bandX.map(() => 0.8)} lower={0.2} fill="#13bd4e" opacity={1} />
        <Line position={[[0, 0.9], [0.5, 0.9], [1, 0.9]]} color="#1a5fd0" width={4} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "errorbars-polar"}
  <!-- Angular error bars in a polar root arc; a radial one stays straight. -->
  <Plot bind:this={plot} coordinates="polar" angleUnit="custom" anglePeriod={24}
    width={400} height={400} x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 2], visible: false }}>
    <ErrorBars orientation="horizontal" position={[[3, 1.5]]} lower={[0]} upper={[6]} color="#13bd4e" width={6} capSize={24} />
    <ErrorBars orientation="vertical" position={[[15, 1]]} lower={[0.5]} upper={[1.5]} color="#1a5fd0" width={6} capSize={24} />
  </Plot>
{:else if scene === "errorbars-on-globe"}
  <!-- Error bars in a Cartesian chart warped onto a globe. The green bar runs
       behind the horizon (no cap at its cut end); the blue one is visible. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Frame coordinates="cartesian"
        x={{ domain: [0, 1], range: [-150, 150], visible: false }}
        y={{ domain: [0, 1], range: [-60, 60], visible: false }}>
        <ErrorBars bind:this={probe} orientation="horizontal" position={[[0.5, 0.75]]} lower={[0.05]} upper={[0.95]}
          color="#13bd4e" width={6} capSize={24} />
        <ErrorBars orientation="vertical" position={[[0.5, 0.5]]} lower={[0.1]} upper={[0.4]}
          color="#1a5fd0" width={6} capSize={24} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "rects-in-polar"}
  <!-- Rects in a Cartesian chart warped by its polar parent: an annular patch,
       a turned one, and a Line along the first one's lower edge. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 3], visible: false }}>
      <Frame coordinates="cartesian"
        x={{ domain: [0, 1], range: [0, 12] }}
        y={{ domain: [0, 1], range: [1, 2] }}>
        <Rect bind:this={probe} x0={[0.25]} x1={[0.75]} y0={[0.25]} y1={[0.75]} fill="#13bd4e" onclick={pick} />
        <Rect x0={[0.05]} x1={[0.15]} y0={[0.4]} y1={[0.6]} rotation={[90]} fill="#1a5fd0" />
        <Line position={[[0.25, 0.25], [0.75, 0.25]]} color="#d43735" width={2} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "sectors-in-log"}
  <!-- A polar sector in a polar child fitted inside log/log parents. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [1, 100], transform: "log" }} y={{ domain: [1, 100], transform: "log" }}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], range: [10, 90], visible: false }}
      y={{ domain: [0, 1], range: [10, 90], visible: false }}>
      <Rect x0={0} x1={6} y0={0.5} y1={1} fill="#13bd4e" />
      <Line position={[[0, 0.5], [6, 0.5]]} color="#d43735" width={2} />
    </Frame>
  </Plot>
{:else if scene === "rects-on-globe"}
  <!-- A Rect in a Cartesian chart warped onto a globe, cut at both limbs. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Frame coordinates="cartesian"
        x={{ domain: [0, 1], range: [-150, 150], visible: false }}
        y={{ domain: [0, 1], range: [-30, 30], visible: false }}>
        <Rect x0={[0.05]} x1={[0.95]} y0={[0.3]} y1={[0.7]} fill="#13bd4e" />
        <Line position={[[0, 0.9], [0.5, 0.9], [1, 0.9]]} color="#1a5fd0" width={4} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "turned-rect-log"}
  <!-- A turned Rect in a linear child of log/log parents: its edges curve, and
       a Line between two of its corners (hand-computed) runs along one. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [1, 100], transform: "log" }} y={{ domain: [1, 100], transform: "log" }}>
    <Frame x={{ domain: [0, 100], range: [10, 90], visible: false }}
      y={{ domain: [0, 100], range: [10, 90], visible: false }}>
      <Rect x0={[20]} x1={[60]} y0={[20]} y1={[40]} rotation={[30]} fill="#13bd4e" />
      <Line position={[[40 - 20 * Math.cos(Math.PI / 6) + 10 * Math.sin(Math.PI / 6), 30 - 20 * Math.sin(Math.PI / 6) - 10 * Math.cos(Math.PI / 6)],
        [40 + 20 * Math.cos(Math.PI / 6) + 10 * Math.sin(Math.PI / 6), 30 + 20 * Math.sin(Math.PI / 6) - 10 * Math.cos(Math.PI / 6)]]}
        color="#d43735" width={2} />
    </Frame>
  </Plot>
{:else if scene === "geojson-child"}
  <!-- A GeoJSON square in an orthographic child fitted into log/log parents,
       which bend it, with a Line along each edge (north, south, west, east). -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [1, 100], transform: "log" }} y={{ domain: [1, 100], transform: "log" }}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center} radialScale={0}
      x={{ domain: [-180, 180], range: [10, 90], visible: false }}
      y={{ domain: [-90, 90], range: [10, 90], visible: false }}>
      <GeoJSON data={{ type: "Feature", properties: {}, geometry: { type: "Polygon",
        coordinates: [[[-30, -20], [30, -20], [30, 20], [-30, 20], [-30, -20]]] } }}
        fill="#13bd4e" outlineWidth={0} />
      <Line position={[[-30, 20], [30, 20]]} interpolation="angular" color="#d43735" width={2} />
      <Line position={[[-30, -20], [30, -20]]} interpolation="angular" color="#d43736" width={2} />
      <Line position={[[-30, -20], [-30, 20]]} interpolation="angular" color="#d43737" width={2} />
      <Line position={[[30, -20], [30, 20]]} interpolation="angular" color="#d43738" width={2} />
    </Frame>
  </Plot>
{:else if scene === "geojson-in-polar"}
  <!-- A globe disk fitted into its polar parent's angles 1..2 (of 6, so 60
       degrees each) and radii 0.2..1.2, and bent by it: a GeoJSON square
       with a Line along each edge and points at its center and a corner. The
       parent's custom period does not reach the globe's degrees. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={6}
      x={{ domain: [0, 6], visible: false }} y={{ domain: [0, 1.2], visible: false }}>
      <Frame coordinates="spherical" projection="orthographic" radialScale={0}
        x={{ domain: [-180, 180], range: [1, 2], visible: false }} y={{ domain: [-90, 90], range: [0.2, 1.2], visible: false }}>
        <GeoJSON data={{ type: "Feature", properties: {}, geometry: { type: "Polygon",
          coordinates: [[[-50, -40], [50, -40], [50, 40], [-50, 40], [-50, -40]]] } }}
          fill="#13bd4e" outlineWidth={0} />
        <Line position={[[-50, 40], [50, 40]]} interpolation="angular" color="#d43735" width={2} />
        <Line position={[[-50, -40], [50, -40]]} interpolation="angular" color="#d43736" width={2} />
        <Line position={[[-50, -40], [-50, 40]]} interpolation="angular" color="#d43737" width={2} />
        <Line position={[[50, -40], [50, 40]]} interpolation="angular" color="#d43738" width={2} />
        <Points position={[[0, 0], [50, 40]]} size={4} fill="#1a5fd0" />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "bars-in-polar"}
  <!-- A Bar chart in a Cartesian chart bent by its polar parent: radial bars. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} data={{ x: [0.25, 0.75], v: [0.5, 1] }}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 3], visible: false }}>
      <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [0, 12] }} y={{ domain: [0, 1], range: [1, 2] }}>
        <Bar x="x" y="v" bandFraction={0.2} orientation="vertical" fill="#13bd4e" />
        <Line position={[[0.15, 0.5], [0.35, 0.5]]} color="#d43735" width={2} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "guides-in-polar"}
  <!-- A Cartesian chart bent by its polar parent, drawing its own guides. Its Line is a raw
       position, which names no column, so the titles are explicit labels. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 3], visible: false }}>
      <Frame coordinates="cartesian"
        x={{ domain: [0, 1], range: [0, 12], visible: true, label: "X", titlePosition:"end", titlePlacement:"inside" }}
        y={{ domain: [0, 1], range: [1, 2], visible: true, label: "Y", titlePosition:"end", titlePlacement:"inside" }}>
        <Line position={[[0, 0.5], [1, 0.5]]} color="#13bd4e" width={2} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "guides-full-turn"}
  <!-- A chart bent all the way around: its first and last X labels meet (titles are labels). -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 3], visible: false }}>
      <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [0, 24], label: "X" }} y={{ domain: [0, 1], range: [1, 2], label: "Y" }}>
        <Line position={[[0, 0.5], [1, 0.5]]} color="#13bd4e" width={2} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "guides-step"}
  <!-- A short bent X edge with an explicit tick step: the step still rules. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 3], visible: false }}>
      <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [0, 4], step: 0.1 }}
        y={{ domain: [0, 1], range: [1, 2] }}>
        <Line position={[[0, 0.5], [1, 0.5]]} color="#13bd4e" width={2} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "guides-on-globe"}
  <!-- A chart warped onto a globe past both limbs, drawing its guides. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [-150, 150], visible: true }}
        y={{ domain: [0, 1], range: [-40, 40], visible: true }}>
        <Line position={[[0, 0.5], [0.5, 0.5], [1, 0.5]]} color="#13bd4e" width={2} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "guides-polar-child"}
  <!-- A polar child fitted into log/log parents, drawing its rings and spokes. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [1, 100], transform: "log" }} y={{ domain: [1, 100], transform: "log" }}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], range: [10, 90], visible: true }}
      y={{ domain: [0, 1], range: [10, 90], visible: true }}>
      <Line position={turn} color="#13bd4e" width={2} />
    </Frame>
  </Plot>
{/if}
