<script>
  // Mark families inside a nonlinear (log parent) range frame and an anchored frame.
  // Each probe point has its own color at a known child-data position, so a test can
  // locate it in the PNG export by color and sample the pixels between two probes.
  import { Plot, Frame, Points, Rect,  Segments, Text3D, Line, GeoJSON, Area, Prism } from "$lib/index";
import { ErrorBars } from "$lib/charts/index.js";
  import { onMount } from "svelte";
  let nonlinear = $state(), anchored = $state(), anchoredText = $state(), anchoredRect = $state(), plain = $state();
  let geoAnchored = $state(), geoNonlinear = $state(), sloped = $state(), families = $state(), lowEnd = $state();
  let anchor = $state([50, 50]);
  // Getters keep the handle valid while bindings re-render.
  onMount(() => {
    window.frameMarks = {
      get nonlinear() { return nonlinear; }, get anchored() { return anchored; },
      get anchoredText() { return anchoredText; }, get anchoredRect() { return anchoredRect; },
      get plain() { return plain; },
      get geoAnchored() { return geoAnchored; }, get geoNonlinear() { return geoNonlinear; },
      get sloped() { return sloped; }, get families() { return families; }, get lowEnd() { return lowEnd; },
      moveAnchor: (next) => { anchor = next; },
    };
    return () => { delete window.frameMarks; };
  });
  const probes = ["#00c800", "#c800c8", "#00c8c8", "#c8c800"];
  const square = { type: "Feature", properties: {}, geometry: { type: "Polygon",
    coordinates: [[[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]]] } };
</script>
<Plot bind:this={nonlinear} width={650} height={420} axes2d x={{domain: [1, 1000], transform: "log"}} y={{domain: [0, 100]}}>
  <!-- A child that sets its own domain is linear inside the log parent. -->
  <Frame x={{domain: [0, 100], range: [10, 1000]}} y={{domain: [0, 100], range: [20, 80]}}>
    <Rect x0={[40]} x1={[60]} y0={[40]} y1={[60]} fill="#dd0000" />
    <Area x={[0, 25, 50, 75, 100]} lower={[5, 5, 5, 5, 5]} upper={[25, 25, 25, 25, 25]} fill="#0000dd" opacity={1} />
    <Segments start={[[10, 90]]} end={[[90, 90]]} color="#444444" />
    <Text3D position={[20, 70]} text="T" />
    {#each [[40, 40], [60, 60], [50, 5], [50, 25]] as position, i}
      <Points position={[position]} size={4} fill={probes[i]} />
    {/each}
  </Frame>
</Plot>
<Plot bind:this={anchored} width={650} height={420} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Frame placement={{anchor, size: [200, 200]}} x={{domain: [0, 10]}} y={{domain: [0, 10]}}>
    <!-- hover registers the rect for picking. -->
    <Rect bind:this={anchoredRect} x0={[4]} x1={[6]} y0={[4]} y1={[6]} fill="#dd0000" hover respond={false} />
    {#each [[4, 4], [6, 6], [1, 1], [2, 2]] as position, i}
      <Points position={[position]} size={4} fill={probes[i]} />
    {/each}
  </Frame>
</Plot>
<Plot bind:this={anchoredText} width={300} height={200} x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Frame placement={{anchor: [50, 50], size: [100, 100]}} x={{domain: [0, 10]}} y={{domain: [0, 10]}}>
    <Text3D position={[5, 5]} text="Here" color="#dd0000" />
  </Frame>
</Plot>
<!-- One sloped band interval under a log parent, with a Line along its upper edge.
     The edge is a curve on screen; probes at child x = 50 bracket it. Pinned margins keep the
     pixel grid the tolerances were set on. -->
<Plot bind:this={sloped} width={650} height={420} axes2d x={{domain: [1, 1000], transform: "log"}} y={{domain: [0, 100]}} axisMarginLeft={80} axisMarginRight={24} axisMarginTop={24} axisMarginBottom={64}>
  <Frame x={{domain: [0, 100], range: [10, 100]}} y={{domain: [0, 100], range: [20, 80]}}>
    <Area x={[0, 100]} lower={[0, 0]} upper={[10, 90]} fill="#0000dd" opacity={1} />
    <Line position={[[0, 10], [100, 90]]} color="#222222" width={3} />
    {#each [[50, 70], [50, 10]] as position, i}
      <Points position={[position]} size={4} fill={probes[i]} />
    {/each}
  </Frame>
</Plot>
<!-- One mark per family in a log-parent frame (child x 0..100 -> parent 10..100). The two
     probes at child (0, 0) and (100, 100) calibrate the mapping for pixel checks. The cubic
     link is an S whose midpoint (50, 60) has a vertical tangent, so building the curve in
     data space and mapping each sample puts it far from where mapping the control points
     first would. -->
<Plot bind:this={families} width={650} height={420} axes2d x={{domain: [1, 1000], transform: "log"}} y={{domain: [0, 100]}}>
  <Frame x={{domain: [0, 100], range: [10, 100]}} y={{domain: [0, 100], range: [10, 90]}}>
    <Segments start={[[0, 30]]} end={[[100, 90]]} control1={[[100, 30]]} control2={[[0, 90]]} curve="cubic" color="#0000dd" width={4} />
    <Area x={[60, 100]} upper={[20, 20]} lower={5} fill="#ff9900" opacity={1} />
    <ErrorBars x={[20]} y={[15]} lower={[5]} upper={[25]} color="#00aaaa" width={4} />
    <Prism x={[42]} y={[12]} width={[10]} depth={[10]} z0={0} z1={0} shape="hexagon" fill="#888800" />
    <Text3D position={[80, 45]} text="Tx" color="#dd0000" />
    <Points position={[[0, 0]]} size={4} fill={probes[0]} />
    <Points position={[[100, 100]]} size={4} fill={probes[1]} />
  </Frame>
</Plot>
<!-- A straight line across two decades of a log parent from its low end (child x 0 -> parent
     10): its pieces met the subdivision tolerance only as drawn, never at each parameter. -->
<Plot bind:this={lowEnd} width={650} height={300} axes2d x={{domain: [1, 1000], transform: "log"}} y={{domain: [0, 100]}}>
  <Frame x={{domain: [0, 100], range: [10, 1000]}} y={{domain: [0, 100], range: [20, 80]}}>
    <Segments start={[[0, 50]]} end={[[100, 50]]} color="#dd0000" width={3} />
  </Frame>
</Plot>
<!-- Three marks and no child frames: each mark should prepare once on mount. -->
<Plot bind:this={plain} width={300} height={200} x={{domain: [0, 10]}} y={{domain: [0, 10]}}>
  <Points position={[[2, 2], [8, 8]]} size={4} fill="#547ba2" />
  <Line position={[[0, 0], [10, 10]]} color="#30343b" />
  <Rect x0={[4]} x1={[6]} y0={[4]} y1={[6]} fill="#cf8955" />
</Plot>
<!-- GeoJSON renders in mesh space, so anchored and nonlinear frames must reject it. -->
<Plot bind:this={geoAnchored} width={300} height={200} x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Frame placement={{anchor: [50, 50], size: [100, 100]}} x={{domain: [0, 10]}} y={{domain: [0, 10]}}>
    <GeoJSON data={square} fill="#dd0000" />
  </Frame>
</Plot>
<Plot bind:this={geoNonlinear} width={300} height={200} x={{domain: [1, 1000], transform: "log"}} y={{domain: [0, 100]}}>
  <Frame x={{domain: [0, 10], range: [10, 1000]}} y={{domain: [0, 10], range: [20, 80]}}>
    <GeoJSON data={square} fill="#dd0000" />
  </Frame>
</Plot>
