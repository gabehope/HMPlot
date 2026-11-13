<script>
  import { Plot, Frame, Line, Rect, Heatmap, Image, Data, Filter, Calculate, Slice, gridTable, subtract, multiply, greater, continuous, categorical } from "$lib/index";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const scene = params.get("scene") ?? "polar-root";
  const west = Number(params.get("west") ?? 150);
  let plot = $state(), probe = $state(), reference = $state(), center = $state([0, 0]), at = $state(0.5);
  $effect(() => {
    window.stage14Heatmap = { get plot() { return plot; }, get probe() { return probe; }, get reference() { return reference; },
      scene, lastPick: null, setCenter(value) { center = value; }, setAt(value) { at = value; } };
    return () => { delete window.stage14Heatmap; };
  });
  // A 4 × 2 grid of distinct values, and of saturated colors for crisp cells.
  const values = [[0, 1, 2, 3], [4, 5, 6, 7]];
  const colors = [[[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0]], [[1, 0, 1], [0, 1, 1], [1, 0.5, 0], [0.5, 0, 1]]];
  const pick = (event) => window.stage14Heatmap.lastPick = { axisValue: event.axisValue };
  // TODO 51: grid tables. A field equal to its latitude on uneven latitudes, and its evenly
  // gridded twin: drawn alike wherever both have cells.
  const globe = scene === "grid-uneven-globe";
  const lons = globe ? [-135, -45, 45, 135] : [0.5, 1.5, 2.5, 3.5];
  // Both span latitudes -90 to 90 (the uneven one's end cells reach them): a plot's domain.
  const unevenLat = [-80, -60, -45, -30, 0, 10, 30, 60, 80], evenLat = Array.from({ length: 180 }, (_, i) => i - 89.5);
  const byLatitude = (lat) => gridTable({ dims: { lat, lon: lons }, columns: { v: lat.flatMap((value) => lons.map(() => value)) } });
  // A 3 x 3 grid sheared by its positions (px = i + j / 2, py = j): a parallelogram.
  const sheared = gridTable({ dims: { j: [0, 1, 2], i: [0, 1, 2] }, columns: { v: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    positions: { dims: ["j", "i"], columns: { px: [0, 1, 2, 0.5, 1.5, 2.5, 1, 2, 3], py: [0, 0, 0, 1, 1, 1, 2, 2, 2] }, x: "px", y: "py" } });
  const square = gridTable({ dims: { lat: [0.5, 1.5], lon: [0.5, 1.5] }, columns: { v: [1, 2, 3, 4] } });
  // Colors by cell as { r, g, b } columns (0-255), and the same image as rows from the top.
  const cells = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255]];
  const colored = gridTable({ dims: { lat: [0.5, 1.5], lon: [0.5, 1.5, 2.5] },
    columns: { r: Uint8Array.from(cells, (c) => c[0]), g: Uint8Array.from(cells, (c) => c[1]), b: Uint8Array.from(cells, (c) => c[2]) } });
  const coloredRows = [cells.slice(3).map((c) => c.map((v) => v / 255)), cells.slice(0, 3).map((c) => c.map((v) => v / 255))];
  // Longitudes 0 to 270 wrapped by a Calculate to -180..180: one wrap, a rotation.
  const around = gridTable({ dims: { lat: [0.5, 1.5], lon: [0, 90, 180, 270] }, columns: { v: [1, 2, 3, 4, 1, 2, 3, 4] } });
  // A field over time: a Slice through time draws its lat x lon slices, blended between steps.
  // TODO 134.15: a 4 x 4 matrix, value 4 * row + column, in grays from black to white.
  const matrix = [0, 1, 2, 3].map((row) => [0, 1, 2, 3].map((column) => 4 * row + column));
  const grays = continuous({ domain: [0, 15], colormap: ["#000000", "#ffffff"] });
  const timed = gridTable({ dims: { time: [0, 1, 2], lat: [0.5, 1.5], lon: [0.5, 1.5] },
    columns: { v: [0, 1, 2, 3, 10, 11, 12, 13, 20, 21, 22, 23] } });
</script>

{#if scene === "polar-root"}
  <!-- A polar root: angle along x (four 90-degree columns), radius along y. -->
  <Plot bind:this={plot} coordinates="polar" angleUnit="custom" anglePeriod={24}
    width={400} height={400} x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 2], visible: false }}>
    <Image data={colors} pixelated />
  </Plot>
{:else if scene === "polar-heatmap"}
  <!-- A scalar Heatmap in a polar root picks its source coordinates. -->
  <Plot bind:this={plot} coordinates="polar" angleUnit="custom" anglePeriod={24}
    width={400} height={400} x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 2], visible: false }}>
    <Heatmap fill={values} onclick={pick} />
  </Plot>
{:else if scene === "log-parent"}
  <!-- A linear child of log/log parents: cell edges follow the logs. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [1, 100], transform: "log" }} y={{ domain: [1, 100], transform: "log" }}>
    <Frame x={{ domain: [0, 1], range: [10, 90], visible: false }} y={{ domain: [0, 1], range: [10, 90], visible: false }}>
      <Image data={colors} pixelated />
    </Frame>
  </Plot>
{:else if scene === "chart-in-polar"}
  <!-- A Cartesian chart bent by its polar parent: an annular heatmap. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="polar" angleUnit="custom" anglePeriod={24}
      x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 3], visible: false }}>
      <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [0, 12], visible: false }}
        y={{ domain: [0, 1], range: [1, 2], visible: false }}>
        <Image data={colors} pixelated />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "placed"}
  <!-- A pixel-anchored Cartesian inset: the heatmap fills the same box as a Rect. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Frame placement={{ anchor: [0.5, 0.5], size: [120, 80] }}
      x={{ domain: [0, 1], visible: false }} y={{ domain: [0, 1], visible: false }}>
      <Image data={colors} pixelated />
    </Frame>
    <Frame placement={{ anchor: [0.5, 0.2], size: [120, 80] }}
      x={{ domain: [0, 1], visible: false }} y={{ domain: [0, 1], visible: false }}>
      <Rect x0={[0]} x1={[1]} y0={[0]} y1={[1]} fill="#808080" />
    </Frame>
  </Plot>
{:else if scene === "on-globe"}
  <!-- An Image on a chart warped onto a globe, reaching past both limbs, and
       a Line along its middle row. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [-150, 150], visible: false }}
        y={{ domain: [0, 1], range: [-40, 40], visible: false }}>
        <Image data={colors} pixelated />
        <Line position={[[0, 0.5], [0.5, 0.5], [1, 0.5]]} color="#202020" width={2} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "on-map"}
  <!-- A chart on a root flat map: its grid maps through the map. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="spherical" projection="equirectangular"
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [-60, 60], visible: false }}
        y={{ domain: [0, 1], range: [-30, 30], visible: false }}>
        <Heatmap fill={values} />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "on-map-seam"}
  <!-- A chart across the antimeridian of a root flat map centered on it: its
       grid keeps the map's longitude unwrapped and stays one piece. -->
  <Plot bind:this={plot} type="2d" width={400} height={400}>
    <Frame coordinates="spherical" projection="equirectangular"
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [150, 210], visible: false }}
        y={{ domain: [0, 1], range: [-30, 30], visible: false }}>
        <Image data={colors} pixelated />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "inset-seam"}
  <!-- A chart across the antimeridian of a placed map inset (one extent):
       the part past 180 degrees appears at the inset's west edge. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Frame coordinates="spherical" projection="equirectangular"
      placement={{ anchor: [0.5, 0.5], size: [360, 180] }}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Frame coordinates="cartesian" x={{ domain: [0, 1], range: [west, west + 60], visible: false }}
        y={{ domain: [0, 1], range: [-30, 30], visible: false }}>
        <Image data={colors} pixelated />
      </Frame>
    </Frame>
  </Plot>
{:else if scene === "root-globe"}
  <!-- A root orthographic globe covered by an Image: the back is hidden. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} coordinates="spherical" projection="orthographic"
    projectionCenter={center} x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <Image data={colors} pixelated />
  </Plot>
{:else if scene === "root-equal-earth"}
  <!-- A root equal-earth map centered at 45°, covered by an Image: its seam (225°, that is
       -135°) cuts the red column [-180°, -90°], which shows at both edges (TODO 39.5). -->
  <Plot bind:this={plot} type="2d" width={400} height={400} coordinates="spherical" projection="equal-earth"
    projectionCenter={[45, 0]} x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
    <Image data={colors} pixelated />
  </Plot>
{:else if scene === "root-mercator"}
  <!-- A root Mercator map covered by an Image. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} coordinates="spherical" projection="mercator"
    x={{ domain: [-180, 180], visible: false }} y={{ domain: [-80, 80], visible: false }}>
    <Image data={colors} pixelated />
  </Plot>
{:else if scene === "globe-child"}
  <!-- An Image in its own orthographic child, fitted into a Cartesian root. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }}>
    <Frame coordinates="spherical" projection="orthographic" projectionCenter={center} radialScale={0}
      x={{ domain: [-180, 180], range: [-0.8, 0.8], visible: false }}
      y={{ domain: [-90, 90], range: [-0.8, 0.8], visible: false }}>
      <Image data={colors} pixelated />
    </Frame>
  </Plot>
{:else if scene === "grid-uneven" || scene === "grid-uneven-globe"}
  {#each [byLatitude(unevenLat), byLatitude(evenLat)] as table, k}
    <Data value={table}>
      {#if globe}
        <Plot bind:this={() => (k ? reference : plot), (value) => (k ? (reference = value) : (plot = value))} type="2d" width={400} height={400}
          coordinates="spherical" projection="orthographic" x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
          <Heatmap fill="v" fillScale={continuous({ domain: [-80, 80] })} />
        </Plot>
      {:else}
        <Plot bind:this={() => (k ? reference : plot), (value) => (k ? (reference = value) : (plot = value))} type="2d" width={400} height={400}
          axes2d={false} x={{ domain: [0, 4] }} y={{ domain: [-90, 90] }}>
          <Heatmap fill="v" fillScale={continuous({ domain: [-80, 80] })} />
        </Plot>
      {/if}
    </Data>
  {/each}
{:else if scene === "grid-curvilinear"}
  <Data value={sheared}>
    <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false} x={{ domain: [-1, 5] }} y={{ domain: [-1, 3] }}>
      <Heatmap fill="v" />
    </Plot>
  </Data>
{:else if scene === "grid-filter"}
  <Data value={square}>
    <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false} x={{ domain: [0, 2] }} y={{ domain: [0, 2] }}>
      <Filter where={[greater("v", 2.5)]}><Heatmap fill="v" tooltip /></Filter>
    </Plot>
  </Data>
{:else if scene === "grid-image"}
  <Data value={colored}>
    <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false} x={{ domain: [0, 3] }} y={{ domain: [0, 2] }}>
      <Image fill={{ r: "r", g: "g", b: "b" }} pixelated />
    </Plot>
  </Data>
  <Plot bind:this={reference} type="2d" width={400} height={400} axes2d={false} x={{ domain: [0, 3] }} y={{ domain: [0, 2] }}>
    <Image data={coloredRows} xbounds={[0, 3]} ybounds={[0, 2]} pixelated />
  </Plot>
{:else if scene === "grid-wrap"}
  <Data value={around}>
    <!-- The wrapped grid spans -135 to 225 (sorted from -90), the unwrapped one -45 to 315. -->
    <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false} x={{ domain: [-135, 225] }} y={{ domain: [0, 2] }}>
      <Calculate columns={{ lon: subtract("lon", multiply(360, greater("lon", 180))) }}><Heatmap fill="v" fillScale={continuous({ domain: [1, 4] })} /></Calculate>
    </Plot>
    <Plot bind:this={reference} type="2d" width={400} height={400} axes2d={false} x={{ domain: [-45, 315] }} y={{ domain: [0, 2] }}>
      <Heatmap fill="v" fillScale={continuous({ domain: [1, 4] })} />
    </Plot>
  </Data>
{:else if scene === "grid-slice"}
  <Data value={timed}>
    <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false} x={{ domain: [0, 2] }} y={{ domain: [0, 2] }}>
      <Slice field="time" {at}><Heatmap fill="v" fillScale={continuous({ domain: [0, 23] })} /></Slice>
    </Plot>
  </Data>
{:else if scene === "matrix-categorical"}
  {#each [false, true] as rectangles}
    <Plot bind:this={() => rectangles ? reference : plot, value => rectangles ? reference = value : plot = value}
      width={400} height={400} autoBounds legend={false}
      x={{ scale: categorical({ domain: ["C1", "C2", "T1", "T2"] }), invert: params.has("invert") }}
      y={{ scale: categorical({ domain: ["Gene A", "Gene B", "Gene C", "Gene D"] }), invert: params.has("invert") }}>
      {#if rectangles}
        <Rect x0={matrix.flatMap(row => row.map((_, j) => j - 0.5))} x1={matrix.flatMap(row => row.map((_, j) => j + 0.5))}
          y0={matrix.flatMap((row, i) => row.map(() => i - 0.5))} y1={matrix.flatMap((row, i) => row.map(() => i + 0.5))}
          fill={matrix.flat()} fillScale={grays} />
      {:else}
        <Heatmap fill={matrix} fillScale={grays} />
      {/if}
    </Plot>
  {/each}
{:else if scene === "matrix"}
  <!-- A plain 4 x 4 grid and no domains: sharp cells on its indices, and blended when asked. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false} autoBounds>
    <Heatmap fill={matrix} fillScale={grays} />
  </Plot>
  <Plot bind:this={reference} type="2d" width={400} height={400} axes2d={false} autoBounds>
    <Heatmap fill={matrix} fillScale={grays} pixelated={false} />
  </Plot>
{:else if scene === "matrix-far"}
  <!-- The 4 x 4 grid beside a line at x = 10: its cells stay on their indices, and so does a
       mark drawn on it. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false} autoBounds>
    <Heatmap fill={matrix} fillScale={grays}>
      <Rect x0={[1.75]} x1={[2.25]} y0={[1.75]} y1={[2.25]} fill="#ff0000" />
    </Heatmap>
    <Line position={[[10, 0], [10, 3]]} color="#ff0000" width={2} />
  </Plot>
{:else if scene === "map-inset"}
  <!-- An Image in a placed equirectangular inset. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Frame coordinates="spherical" projection="equirectangular"
      placement={{ anchor: [0.5, 0.5], size: [100, 100] }}
      x={{ domain: [-180, 180], visible: false }} y={{ domain: [-90, 90], visible: false }}>
      <Image data={colors} pixelated />
    </Frame>
  </Plot>
{/if}
