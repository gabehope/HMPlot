<script>
  // TODO 70: one Plot per case of the export guide's "What is not exported as vector" list, by
  // ?case=<id>, for document-export.spec.js (each case's SVG against its PNG). `window.vectorExport`.
  import { Plot, Frame, GeoJSON, Points, Line, Segments, Arrows3D, Area,  Text, Rect, Prism, Polygon, Dodge, Anchor, Heatmap, Data, DAG, Edges, Routes, Points3D, connect, continuous, categorical, GraphData } from "$lib/index";
import { Arrows, ErrorBars, Bar, Pie, DensityContour, DensityBands, BoxPlot, Smooth, Violin, Ecdf, RuleX, RuleY } from "$lib/charts/index.js";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const name = params.get("case") ?? "points-value";
  const ArrowMark = name.startsWith("segments-arrow") ? Segments : Arrows;
  const arrowProps = name.startsWith("segments-arrow") ? { cap: "arrow", ...(name.endsWith("dash") ? { dash: [6, 4] } : {}) } : {};
  let plot = $state(), dodgePoints = $state(), dodgeAnchors = $state(), linkFrom = $state(), linkTo = $state();
  // boxplot-visibility, smooth-visibility (TODO 69.7): the compound mark and its visible prop.
  let compound = $state(), shown = $state(true);
  // rule-bounds: the Line's data, which widen() makes ten units wide.
  let ruleLine = $state({ x: [1, 6], y: [3, 5] });
  $effect(() => {
    window.vectorExport = { get plot() { return plot; }, get compound() { return compound; }, name,
      widen: () => (ruleLine = { x: [1, 11], y: [3, 5] }), show: (value) => (shown = value) };
    return () => { delete window.vectorExport; };
  });
  // A deterministic noise in [0, 1).
  const noise = (i, k = 0) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  // No default legend (TODO 136.17): these cases compare the marks' pixels, not the legend's.
  const common = { width: 320, height: 240, responsive: false, toneMapping: 0, axes2d: false, background: "white", legend: false };
  const box = { x: { domain: [0, 10] }, y: { domain: [0, 10] } };
  const groups = ["a", "b", "c"], palette = categorical({ domain: groups, range: ["#e4572e", "#2a6fdb", "#1aa340"] });
  // Five columns of points over a 0-10 square with a value from 0 to 1.
  const grid = (() => {
    const x = [], y = [], v = [], g = [];
    for (let i = 0; i < 25; i++) { x.push(1 + (i % 5) * 2); y.push(1 + Math.floor(i / 5) * 2); v.push(i / 24); g.push(groups[i % 3]); }
    return { x, y, v, g };
  })();
  const waves = (() => {
    const x = [], y = [], v = [], g = [], s = [];
    for (const [k, group] of groups.entries())
      for (let i = 0; i <= 8; i++) { x.push(1 + i); y.push(2 + 3 * k + Math.sin(i * 0.9 + k)); v.push(i / 8); g.push(group); s.push(k); }
    return { x, y, v, g, s };
  })();
  const pairs = { x0: [1, 2, 3, 4, 5, 6], y0: [1, 6, 2, 7, 3, 8], x1: [3, 4, 5, 6, 7, 9], y1: [4, 9, 5, 9, 6, 9],
    v: [0, 0.2, 0.4, 0.6, 0.8, 1], g: ["a", "b", "c", "a", "b", "c"] };
  const bars = { x: ["a", "b", "c"], y: [4, 7, 5], v: [0.1, 0.5, 0.9] };
  const tiles = { x0: [1, 4, 7, 1, 4, 7], x1: [3.5, 6.5, 9.5, 3.5, 6.5, 9.5], y0: [1, 1, 1, 5, 5, 5], y1: [4.5, 4.5, 4.5, 8.5, 8.5, 8.5],
    v: [0, 0.2, 0.4, 0.6, 0.8, 1], g: ["a", "b", "c", "a", "b", "c"] };
  const samples = (() => {
    const g = [], value = [];
    for (let i = 0; i < 150; i++) { g.push(groups[i % 3]); value.push((i % 3) * 2 + 3 * noise(i) + 2 * noise(i, 1)); }
    return { g, value };
  })();
  // Two clusters of points for DensityContour.
  const cloud = (() => {
    const x = [], y = [];
    for (let i = 0; i < 300; i++) { const c = i % 2; x.push(3 + 4 * c + 1.4 * (noise(i, 2) - 0.5) + 1.4 * (noise(i, 3) - 0.5)); y.push(4 + 2 * c + 1.4 * (noise(i, 4) - 0.5) + 1.4 * (noise(i, 5) - 0.5)); }
    return { x, y };
  })();
  const sectors = { region: ["North", "East", "South", "West"], sales: [42, 18, 27, 13], v: [0, 0.33, 0.66, 1] };
  const dodged = { id: [1, 2, 3], x: [6, 6, 6], y: [5, 5, 5], ex: [1, 1, 1], ey: [2, 5, 8] };
  const edges = { source: ["A", "A", "B", "C"], target: ["B", "C", "D", "D"] };
  // Three lines as features with a category each (GeoJSON boundaries colored by a column).
  const features = { type: "FeatureCollection", features: ["a", "b", "c"].map((kind, k) => ({ type: "Feature", properties: { kind },
    geometry: { type: "LineString", coordinates: [[-120, -30 + 30 * k], [-40, -10 + 30 * k], [40, -30 + 30 * k], [120, -10 + 30 * k]] } })) };
  const heat = { x: [0, 1, 2, 0, 1, 2], y: [0, 0, 0, 1, 1, 1], v: [0, 0.2, 0.4, 0.6, 0.8, 1] };
  const map = { coordinates: "spherical", x: { domain: [-180, 180], visible: false }, y: { domain: [-90, 90], visible: false } };
  // TODO 70.6, 2D marks in a 3D view: a 0-10 cube (100 world units across), seen by the default
  // camera unless a case sets one.
  const cube = { type: "3d", x: { domain: [0, 10] }, y: { domain: [0, 10] }, z: { domain: [0, 10] } };
  const cloud3d = (() => {
    const x = [], y = [], z = [], g = [];
    for (let i = 0; i < 60; i++) { x.push(10 * noise(i, 6)); y.push(10 * noise(i, 7)); z.push(10 * noise(i, 8)); g.push(groups[i % 3]); }
    return { x, y, z, g };
  })();
  // A trefoil knot seen from the front: it passes over and under itself. Its crossings join the
  // first half of its length (blue) to the second (orange): complementary colors, so the parity
  // check sees which strand is in front and their antialiased mix is gray.
  const knot = (() => {
    const x = [], y = [], z = [], half = [];
    for (let i = 0; i <= 240; i++) {
      const a = (i / 240) * 2 * Math.PI;
      x.push(Math.sin(a) + 2 * Math.sin(2 * a)); y.push(Math.cos(a) - 2 * Math.cos(2 * a)); z.push(-Math.sin(3 * a)); half.push(i < 120 ? "a" : "b");
    }
    return { x, y, z, half, s: Array(241).fill(0) };
  })(), halves = categorical({ domain: ["a", "b"], range: ["#2a6fdb", "#db942a"] });
  // Rows through the camera: the near plane cuts the segments and the line, and hides the points behind it.
  const through = (() => {
    const x0 = [], y0 = [], z0 = [], x1 = [], y1 = [], z1 = [], x = [], y = [], z = [], g = [];
    for (let i = 0; i < 9; i++) {
      x0.push(1 + i); y0.push(2 + (i % 3) * 3); z0.push(10); x1.push(9 - i); y1.push(8 - (i % 3) * 3); z1.push(0);
      x.push(1 + i); y.push(5 + 3 * Math.sin(i)); z.push(i * 10 / 8); g.push(groups[i % 3]);
    }
    return { x0, y0, z0, x1, y1, z1, x, y, z, g };
  })();
</script>

{#if name === "points-value"}
  <Plot bind:this={plot} {...common} {...box} data={grid}>
    <Points x="x" y="y" fill="v" fillScale={continuous({ domain: [0, 1] })} size={20} shape="square" />
  </Plot>
{:else if name === "points-missing"}
  <!-- TODO 73.3: missing values (null) draw in the theme's missing color, or the scale's. (The
    domain stops short of Viridis's yellow end, whose hue sits on the parity check's bin edge.) -->
  <Plot bind:this={plot} {...common} {...box} data={{ ...grid, a: grid.v.map((v, i) => (i % 4 === 1 ? null : v)),
    b: grid.v.map((v, i) => (i % 4 === 3 ? null : v)), up: grid.y.map((y) => y + 0.9) }}>
    <Points x="x" y="y" fill="a" fillScale={continuous({ domain: [0, 1.25] })} size={10} shape="square" />
    <Points x="x" y="up" fill="b" fillScale={continuous({ domain: [0, 1], colormap: "BuPu", missing: "#e4572e" })} size={10} shape="square" />
  </Plot>
{:else if name === "points-quantized"}
  <Plot bind:this={plot} {...common} {...box} data={grid}>
    <Points x="x" y="y" fill="v" fillScale={continuous({ domain: [0, 1], colormap: "Plasma", quantize: true, levels: 4 })} size={20} shape="square" />
  </Plot>
{:else if name === "points-custom"}
  <!-- A custom map in HSL, a log transform (the zero is missing: not drawn), and a mark opacity. -->
  <Plot bind:this={plot} {...common} {...box} data={{ ...grid, w: grid.v.map((v) => v * 99) }}>
    <Points x="x" y="y" fill="w" opacity={0.8} size={20} shape="square"
      fillScale={continuous({ domain: [1, 99], transform: "log", colormap: { colors: ["#ff0000", "#0000ff"], space: "hsl" } })} />
  </Plot>
{:else if name === "points-diverging"}
  <Plot bind:this={plot} {...common} {...box} data={{ ...grid, d: grid.v.map((v) => v * 3 - 1) }}>
    <Points x="x" y="y" fill="d" fillScale={continuous({ colormap: "RdBu", midpoint: 0 })} size={20} shape="square" />
  </Plot>
{:else if name === "size-width-scales"}
  <!-- Export uses the shader's size/width mapping, including degenerate and nonlinear domains. -->
  <Plot bind:this={plot} {...common} {...box}>
    {#each [
      { value: 5, color: "#e4572e" }, // A constant field infers the equal domain [5, 5].
      { value: 2.5, domain: [10, 0], color: "#2a6fdb" },
      { value: 1.5, domain: [-1, 3], midpoint: 0, color: "#1aa340" },
      { value: 10, domain: [1, 100], transform: "log", color: "#7a36b4" },
      { value: 2, domain: [-2, 6], transform: "symlog", constant: 2, midpoint: 0, color: "#00bbbb" },
    ] as setting, i}
      {@const scale = continuous({ domain: setting.domain, transform: setting.transform, constant: setting.constant,
        midpoint: setting.midpoint, range: [6, 26] })}
      <Points x={[2]} y={[1 + 2 * i]} size={[setting.value]} sizeScale={scale} fill={setting.color} shape="square" />
      <Segments start={[[5, 1 + 2 * i]]} end={[[9, 1 + 2 * i]]} width={[setting.value]} widthScale={scale} color={setting.color} />
    {/each}
  </Plot>
{:else if name === "line-value"}
  <Data value={waves}>
    <Plot bind:this={plot} {...common} {...box}>
      <Line x="x" y="y" series="g" color="v" colorScale={continuous({ domain: [0, 1], colormap: "Turbo" })} width={4} />
    </Plot>
  </Data>
{:else if name === "segments-value"}
  <Plot bind:this={plot} {...common} {...box} data={pairs}>
    <Segments start={["x0", "y0"]} end={["x1", "y1"]} color="v" colorScale={continuous({ domain: [0, 1], colormap: "Turbo" })} width={4} />
  </Plot>
{:else if name === "rect-value"}
  <Plot bind:this={plot} {...common} {...box} data={tiles}>
    <Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="v" fillScale={continuous({ domain: [0, 1], colormap: "Viridis" })} />
  </Plot>
{:else if name === "pie-value"}
  <Plot bind:this={plot} {...common} data={sectors}>
    <Pie value="sales" category="region" padAngle={3} fill="v" fillScale={continuous({ domain: [0, 1], colormap: "Viridis" })} />
  </Plot>
{:else if name === "polar-rect-value"}
  <Plot bind:this={plot} {...common} data={tiles} coordinates="polar" x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="v" fillScale={continuous({ domain: [0, 1], colormap: "Viridis" })} />
  </Plot>
{:else if name === "contour-lines"}
  <Plot bind:this={plot} {...common} {...box} data={cloud}>
    <DensityContour x="x" y="y" thresholds={6} width={3} />
  </Plot>
{:else if name === "contour-bands"}
  <Plot bind:this={plot} {...common} {...box} data={cloud}>
    <DensityBands x="x" y="y" thresholds={6} />
  </Plot>
{:else if name === "text-value"}
  <Plot bind:this={plot} {...common} {...box} data={{ ...grid, label: grid.v.map((v) => v.toFixed(1)) }}>
    <Text x="x" y="y" text="label" color="v" colorScale={continuous({ domain: [0, 1], colormap: "Turbo" })} size={22} />
  </Plot>
{:else if name === "errorbars-value"}
  <Plot bind:this={plot} {...common} {...box} data={{ x: [2, 4, 6, 8], y: [5, 5, 5, 5], lo: [2, 3, 1, 4], hi: [8, 7, 9, 6], v: [0, 0.33, 0.66, 1] }}>
    <ErrorBars x="x" y="y" lower="lo" upper="hi" color="v" colorScale={continuous({ domain: [0, 1], colormap: "Turbo" })} width={3} />
  </Plot>
{:else if name === "arrows-value"}
  <Plot bind:this={plot} {...common} {...box} data={pairs}>
    <Arrows start={["x0", "y0"]} end={["x1", "y1"]} color="v" colorScale={continuous({ domain: [0, 1], colormap: "Turbo" })} width={3} />
  </Plot>
{:else if name === "arrows3d-value"}
  <Plot bind:this={plot} {...common} {...box} data={pairs}>
    <Arrows3D start={["x0", "y0"]} end={["x1", "y1"]} color="v" colorScale={continuous({ domain: [0, 1], colormap: "Turbo" })} width={3} />
  </Plot>
{:else if name === "polygon-value"}
  <Plot bind:this={plot} {...common} {...box} data={{ x: [1, 4, 2.5, 5, 9, 7], y: [1, 1, 5, 4, 4, 9], id: [0, 0, 0, 1, 1, 1], v: [0, 0, 0, 1, 1, 1] }}>
    <Polygon x="x" y="y" series="id" fill="v" fillScale={continuous({ domain: [0, 1], colormap: "Viridis" })} />
  </Plot>
{:else if name === "line-category"}
  <Data value={waves}>
    <Plot bind:this={plot} {...common} {...box}>
      <Line x="x" y="y" series="g" color="g" width={4} />
    </Plot>
  </Data>
{:else if name === "line-color-change"}
  <!-- One series whose color changes along it: runs that meet at the same vertex. -->
  <Data value={{ x: [1, 2, 3, 4, 5, 6, 7, 8, 9], y: [2, 6, 3, 7, 4, 8, 5, 9, 6], g: ["a", "a", "a", "b", "b", "b", "c", "c", "c"], s: Array(9).fill("one") }}>
    <Plot bind:this={plot} {...common} {...box} colorScale={palette}>
      <Line x="x" y="y" series="s" color="g" width={4} />
    </Plot>
  </Data>
{:else if name === "segments-category"}
  <Plot bind:this={plot} {...common} {...box} data={pairs} colorScale={palette}>
    <Segments start={["x0", "y0"]} end={["x1", "y1"]} color="g" width={4} />
  </Plot>
{:else if name === "arrows-category"}
  <Plot bind:this={plot} {...common} {...box} data={pairs} colorScale={palette}>
    <Arrows start={["x0", "y0"]} end={["x1", "y1"]} color="g" width={3} />
  </Plot>
{:else if name === "arrows3d-category"}
  <Plot bind:this={plot} {...common} {...box} data={pairs} colorScale={palette}>
    <Arrows3D start={["x0", "y0"]} end={["x1", "y1"]} color="g" width={3} />
  </Plot>
{:else if name === "area-category"}
  <Plot bind:this={plot} {...common} {...box} data={waves} fillScale={palette}>
    <Area x="x" upper="y" series="g" fill="g" lower={0} opacity={0.6} />
  </Plot>
{:else if name === "ribbon-category"}
  <Plot bind:this={plot} {...common} {...box} data={{ ...waves, lo: waves.y.map((y) => y - 0.8), hi: waves.y.map((y) => y + 0.8) }} fillScale={palette}>
    <Area opacity={0.2} x="x" lower="lo" upper="hi" series="g" fill="g" />
  </Plot>
{:else if name === "errorbars-category"}
  <Plot bind:this={plot} {...common} {...box} data={{ x: [2, 4, 6, 8], y: [5, 5, 5, 5], lo: [2, 3, 1, 4], hi: [8, 7, 9, 6], g: ["a", "b", "c", "a"] }} colorScale={palette}>
    <ErrorBars x="x" y="y" lower="lo" upper="hi" color="g" width={3} />
  </Plot>
{:else if name === "text-category"}
  <Plot bind:this={plot} {...common} {...box} data={{ ...grid, label: grid.g }} colorScale={palette}>
    <Text x="x" y="y" text="label" color="g" size={28} />
  </Plot>
{:else if name === "rect-category"}
  <Plot bind:this={plot} {...common} {...box} data={tiles} fillScale={palette}>
    <Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="g" />
  </Plot>
{:else if name === "bar-category"}
  <Plot bind:this={plot} {...common} data={bars} fillScale={palette}>
    <Bar x="x" y="y" fill="x" />
  </Plot>
{:else if name === "prism-category"}
  <Plot bind:this={plot} {...common} {...box} data={{ x: [2, 5, 8], y: [3, 6, 4], g: ["a", "b", "c"] }} fillScale={palette}>
    <Prism x="x" y="y" z0={0} z1={1} width={2} depth={3} shape="hexagon" fill="g" />
  </Plot>
{:else if name === "boxplot"}
  <Plot bind:this={plot} {...common} data={samples} fillScale={palette} x={{ scale: categorical({ domain: groups }) }}>
    <BoxPlot x="g" y="value" fill="g" />
  </Plot>
{:else if name === "boxplot-visibility"}
  <!-- One group with an outlier (100): a box, whiskers, a median and an outlier. -->
  <Plot bind:this={plot} {...common} data={{ g: ["a", "a", "a", "a", "a", "a"], value: [0, 1, 2, 3, 4, 100] }}
    x={{ scale: categorical({ domain: ["a"] }) }}>
    <BoxPlot bind:this={compound} x="g" y="value" visible={shown} />
  </Plot>
{:else if name === "smooth-visibility"}
  <!-- A fitted line and its confidence band. -->
  <Plot bind:this={plot} {...common} data={{ x: [0, 1, 2, 3, 4, 5], y: [0, 1, 2, 3, 4, 100] }}>
    <Smooth bind:this={compound} x="x" y="y" visible={shown} />
  </Plot>
{:else if name === "violin"}
  <Plot bind:this={plot} {...common} data={samples} fillScale={palette} x={{ scale: categorical({ domain: groups }) }}>
    <Violin x="g" y="value" fill="g" />
  </Plot>
{:else if name === "ecdf"}
  <Plot bind:this={plot} {...common} data={samples} colorScale={palette}>
    <Ecdf x="value" by="g" width={3} />
  </Plot>
{:else if name === "rule-category"}
  <Plot bind:this={plot} {...common} {...box} data={{ x: [2, 5, 8], g: ["a", "b", "c"] }} colorScale={palette}>
    <RuleX x="x" color="g" width={3} />
  </Plot>
{:else if name === "geojson-category"}
  <Plot bind:this={plot} {...common} {...map} projection="equirectangular">
    <GeoJSON data={features} color="kind" width={3} />
  </Plot>
{:else if name === "line-dash"}
  <Plot bind:this={plot} {...common} {...box}>
    <Line x={[1, 3, 5, 7, 9]} y={[2, 8, 3, 8, 2]} dash={[10, 5]} color="#e4572e" width={3} />
  </Plot>
{:else if name === "line-dash-polar"}
  <!-- TODO 73.2: a refined (polar) Line's dashes, in CSS pixels along its curve. -->
  <Plot bind:this={plot} {...common} coordinates="polar" x={{ domain: [0, 360] }} y={{ domain: [0, 10] }}>
    <Line x={[0, 90, 180, 270]} y={[8, 5, 8, 5]} dash={[10, 5]} color="#e4572e" width={3} />
  </Plot>
{:else if name === "segments-dash"}
  <Plot bind:this={plot} {...common} {...box} data={pairs}>
    <Segments start={["x0", "y0"]} end={["x1", "y1"]} dash={8} color="#2a6fdb" width={3} />
  </Plot>
{:else if name === "rule-bounds"}
  <!-- TODO 64.10: a RuleY spans the visible domain (the axes' box); a Line sets the automatic
       x domain. -->
  <Plot bind:this={plot} {...common} axes2d data={ruleLine}>
    <Line x="x" y="y" color="#2a6fdb" width={2} />
    <RuleY y={4} color="#e4572e" width={2} />
  </Plot>
{:else if name === "rows-auto"}
  <!-- TODO 130.1: rows="auto" draws one point at a constant position over ten rows; a point with
       domains={false} leaves the automatic domains to the others. -->
  <Plot bind:this={plot} {...common} axes2d data={{ x: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], y: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }}>
    <Points x="x" y="y" fill="#2a6fdb" size={6} />
    <Points x={4.5} y={2} rows="auto" fill="#e4572e" size={12} />
    <Points x={100} y={100} rows="auto" domains={false} fill="#1aa340" size={12} />
  </Plot>
{:else if name === "segments-cap"}
  <!-- TODO 130.1: cap="bar" draws a 16 px bar across each end, a diagonal segment's across it. -->
  <Plot bind:this={plot} {...common} {...box}>
    <Segments start={[[2, 2], [5, 2]]} end={[[2, 8], [8, 8]]} cap="bar" capSize={16} color="#e4572e" width={3} />
  </Plot>
{:else if name === "text-align-auto"}
  <!-- TODO 130.1: align="auto" ends a label offset left at its point, starts one offset right
       there, and centers one barely offset. -->
  <Plot bind:this={plot} {...common} {...box} colorScale={palette}
    data={{ y: [3, 5, 7], text: ["left", "mid", "right"], offset: [-30, 2, 30], g: ["a", "c", "b"] }}>
    <!-- Large glyphs keep this alignment probe independent of small-text antialiasing. -->
    <Text x={5} y="y" text="text" dx="offset" color="g" align="auto" size={32} box />
  </Plot>
{:else if name === "rule-dash"}
  <Plot bind:this={plot} {...common} {...box} data={{ x: [3, 7], y: [5, 2] }}>
    <RuleX x="x" dash={[10, 4]} color="#e4572e" width={2} />
    <RuleY y="y" dash color="#2a6fdb" width={2} />
  </Plot>
{:else if name === "routes-dash"}
  <Data value={edges}>
    <GraphData source="source" target="target"><DAG   nodeWidth={1} nodeHeight={0.6}>
      <Plot bind:this={plot} {...common}>
        <Edges><Routes color="#1aa340" width={3} dash={[8, 4]} /></Edges>
      </Plot>
    </DAG></GraphData>
  </Data>
{:else if name === "line-basis"}
  <Plot bind:this={plot} {...common} {...box}>
    <Line x={[1, 3, 5, 7, 9]} y={[2, 8, 3, 8, 2]} curve="basis" color="#e4572e" width={4} />
  </Plot>
{:else if name === "line-curve-map"}
  <Plot bind:this={plot} {...common} {...map} projection="equirectangular">
    <Line x={[-150, -90, -30, 30, 90, 150]} y={[-40, 30, -20, 40, -30, 20]} curve="catmull-rom" color="#e4572e" width={4} />
  </Plot>
{:else if name === "segments-curve-ortho"}
  <Plot bind:this={plot} {...common} {...map} projection="orthographic">
    <Segments start={[[-40, -20]]} end={[[40, 20]]} control1={[[0, 50]]} curve="quadratic" color="#2a6fdb" width={4} />
  </Plot>
{:else if name === "arrows-curve" || name === "segments-arrow-curve"}
  <Plot bind:this={plot} {...common} {...box}>
    <ArrowMark bind:this={compound} {...arrowProps} start={[[1, 2], [2, 8]]} end={[[9, 2], [8, 5]]} control1={[[5, 9], [6, 9]]} curve="quadratic" color="#e4572e" width={3} />
  </Plot>
{:else if name === "arrows-geometry" || name === "segments-arrow-geometry" || name === "segments-arrow-dash"}
  <!-- TODO 67.2: separate rows (not a path): horizontal, vertical, diagonal, reversed, shorter
       than the head (0.2 units, 6.4 px) and zero-length. 32 px per unit across, 24 up. -->
  <Plot bind:this={plot} {...common} {...box}>
    <ArrowMark bind:this={compound} {...arrowProps} start={[[1, 1], [7, 1], [1, 4], [9, 9], [2, 8], [8, 7]]} end={[[5, 1], [7, 5], [4, 7], [5, 9], [2.2, 8], [8, 7]]}
      color="#e4572e" width={3} />
  </Plot>
{:else if name === "arrows-width" || name === "segments-arrow-width"}
  <Plot bind:this={plot} {...common} {...box}>
    <ArrowMark bind:this={compound} {...arrowProps} start={[[1, 2], [1, 5], [1, 8]]} end={[[9, 2], [9, 5], [9, 8]]}
      color="#e4572e" width={[2, 4, 6]} widthScale={continuous({ domain: [2, 6], range: [10, 20] })} />
  </Plot>
{:else if name === "arrows3d-curve"}
  <Plot bind:this={plot} {...common} {...box}>
    <Arrows3D start={[[1, 2], [2, 8]]} end={[[9, 2], [8, 5]]} control1={[[5, 9], [6, 9]]} curve="quadratic" color="#2a6fdb" width={3} />
  </Plot>
{:else if name === "dodge-connectors"}
  <Plot bind:this={plot} {...common} {...box} data={dodged}>
    <Dodge x="x" axis="y" as="lift" padding={10}>
      <Points bind:this={dodgePoints} x="x" y="y" dy="lift" size={6} fill="#e4572e" />
    </Dodge>
    <Anchor bind:this={dodgeAnchors} x="ex" y="ey" />
    {#if dodgePoints && dodgeAnchors}
      <Segments connections={connect(dodgePoints, dodgeAnchors, { key: "id" })} color="#1aa340" width={3} />
    {/if}
  </Plot>
{:else if name === "points-offset"}
  <!-- A pixel offset (Dodge writes these): right 40 and up 30 CSS pixels from the blue point. -->
  <Plot bind:this={plot} {...common} {...box}>
    <Points x={[5]} y={[5]} size={7} fill="#2a6fdb" />
    <Points x={[5]} y={[5]} dx={[40]} dy={[30]} size={7} fill="#e4572e" />
    <Text x={[5]} y={[5]} text={["T"]} dx={-40} dy={30} size={24} color="#1aa340" />
  </Plot>
{:else if name === "connector-curve"}
  <!-- Connectors (world-space rows) with a link curve. -->
  <Plot bind:this={plot} {...common} {...box} data={{ id: [1, 2, 3], x0: [1, 1, 1], y0: [2, 5, 8], x1: [9, 9, 9], y1: [8, 2, 5] }}>
    <Anchor bind:this={linkFrom} x="x0" y="y0" />
    <Anchor bind:this={linkTo} x="x1" y="y1" />
    {#if linkFrom && linkTo}
      <Segments connections={connect(linkFrom, linkTo, { key: "id" })} curve="link-horizontal" color="#2a6fdb" width={3} />
    {/if}
  </Plot>
{:else if name === "seam-band"}
  <!-- A band across the antimeridian of a map inset in a Cartesian plot, which the seam cuts. -->
  <Plot bind:this={plot} {...common} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Frame {...map} projection="equirectangular" placement={{ anchor: [0.5, 0.5], size: [300, 150] }}>
      <Area x={[140, 170, 200, 230]} upper={[-10, 0, -20, -5]} lower={-60} fill="#2a6fdb" />
    </Frame>
  </Plot>
{:else if name === "seam-rect"}
  <!-- A lon/lat box across the same seam, and one beside it. -->
  <Plot bind:this={plot} {...common} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Frame {...map} projection="equirectangular" placement={{ anchor: [0.5, 0.5], size: [300, 150] }}>
      <Rect x0={[150, 100]} x1={[210, 130]} y0={[-20, 30]} y1={[20, 60]} fill="#e4572e" />
    </Frame>
  </Plot>
{:else if name === "seam-joint"}
  <Plot bind:this={plot} {...common} {...map} projection="equal-earth">
    <Rect x0={[150]} x1={[210]} y0={[10]} y1={[40]} fill="#e4572e" />
    <Area x={[140, 170, 200, 230]} upper={[-10, 0, -20, -5]} lower={-50} fill="#2a6fdb" />
  </Plot>
{:else if name === "blend-additive"}
  <Plot bind:this={plot} {...common} {...box} data={grid}>
    <Points x="x" y="y" fill="#2a6fdb" size={12} blend="additive" />
  </Plot>
{:else if name === "plot-3d"}
  <Plot bind:this={plot} {...common} type="3d" data={grid}>
    <Points x="x" y="y" fill="#e4572e" size={5} />
  </Plot>
{:else if name === "scatter-3d"}
  <Plot bind:this={plot} {...common} {...cube} data={cloud3d}>
    <Points x="x" y="y" z="z" fill="g" fillScale={palette} size={8} />
  </Plot>
{:else if name === "line-3d"}
  <Data value={knot}>
    <Plot bind:this={plot} {...common} type="3d-y-up" x={{ domain: [-3.5, 3.5] }} y={{ domain: [-3.5, 3.5] }}
      z={{ domain: [-1.5, 1.5] }} cameraPosition={[0, 0, 190]} cameraTarget={[0, 0, 0]}>
      <Line x="x" y="y" z="z" series="s" color="half" colorScale={halves} width={10} />
    </Plot>
  </Data>
{:else if name === "text-3d"}
  <!-- Seen from the front: a label in front of a far point, one behind a near point (the point
       hides it) and one at its point's depth (drawn over it), in boxes of the complementary color,
       so the parity check sees which is in front. A label's x puts it where its point projects
       (x -40 world units at a depth of 220 is -29.1 at 160; x 25 at 160 is 34.4 at 220). Labels
       do not overlap one another: on screen they are drawn in order, not by depth. -->
  <Plot bind:this={plot} {...common} {...cube} type="3d-y-up" cameraPosition={[0, 0, 190]} cameraTarget={[0, 0, 0]}>
    <Points x={[1]} y={[5]} z={[1]} fill="#2a6fdb" size={22} />
    <Points x={[7.5, 5]} y={[5, 8]} z={[9, 5]} fill="#db942a" size={22} />
    <Text x={[2.09]} y={[5]} z={[9]} text={["NEAR"]} color="white" size={22} box={{ fill: "#db942a", outlineWidth: 0 }} />
    <Text x={[8.44, 5]} y={[5, 8]} z={[1, 5]} text={["FAR", "TIE"]} color="white" size={22} box={{ fill: "#2a6fdb", outlineWidth: 0 }} />
  </Plot>
{:else if name === "near-3d"}
  <Plot bind:this={plot} {...common} {...cube} type="3d-y-up" data={through} colorScale={palette} fillScale={palette}
    cameraPosition={[0, 0, 40]} cameraTarget={[0, 0, 0]} cameraNear={10}>
    <Segments start={["x0", "y0", "z0"]} end={["x1", "y1", "z1"]} color="g" width={4} />
    <Line x="x" y="y" z="z" color="#e4572e" width={5} />
    <Points x="x" y="y" z="z" fill="g" size={7} />
  </Plot>
{:else if name === "dash-3d"}
  <Plot bind:this={plot} {...common} {...cube} data={pairs}>
    <Segments start={["x0", "y0", "x0"]} end={["x1", "y1", "y1"]} dash={[6, 3]} color="#2a6fdb" width={3} />
  </Plot>
{:else if name === "fills-3d"}
  <!-- A flat Rect halfway back, over a Polygon and an Area on the back wall (where marks without
       z lie), with points in front of it and behind it. (Fills on one plane overlapping each other
       z-fight on the GPU: tests/unit/document-export.test.js checks their order.) -->
  <Plot bind:this={plot} {...common} {...cube}>
    <Data value={{ x: [1, 6, 1], y: [1, 1, 6] }}><Polygon x="x" y="y" fill="#2a6fdb" /></Data>
    <Area x={[5, 7, 9]} upper={[6, 9, 7]} lower={4.5} fill="#1aa340" opacity={1} />
    <Rect x0={[3]} x1={[7]} y0={[3]} y1={[7]} z0={5} z1={5} fill="#db942a" />
    <Points x={[4, 6, 5, 4, 6]} y={[4, 6, 5, 6, 4]} z={[8, 8, 2, 2, 9]} fill="#e4572e" size={7} />
  </Plot>
{:else if name === "arrows-3d"}
  <Plot bind:this={plot} {...common} {...cube}>
    <Arrows start={[[1, 1, 1], [9, 1, 9], [1, 9, 5]]} end={[[9, 9, 9], [1, 9, 1], [9, 1, 5]]} color="#e4572e" width={3} />
    <ErrorBars x={[3, 5, 7]} y={[5, 5, 5]} z={[2, 5, 8]} lower={[2, 3, 4]} upper={[8, 7, 6]} color="#2a6fdb" width={3} />
  </Plot>
{:else if name === "curve-3d"}
  <!-- A curve through 3D points, and segments bent by a log z axis. -->
  <Plot bind:this={plot} {...common} {...cube} z={{ domain: [1, 100], transform: "log" }}>
    <Line x={[1, 3, 5, 7, 9]} y={[2, 8, 3, 8, 2]} z={[2, 50, 5, 90, 10]} curve="catmull-rom" color="#e4572e" width={4} />
    <Segments start={[[1, 9, 1], [9, 9, 1]]} end={[[9, 1, 100], [1, 1, 100]]} color="#2a6fdb" width={3} />
  </Plot>
{:else if name === "bar-3d"}
  <!-- A Bar draws through a flat Prism: a 2D mark, vector in a 3D view. -->
  <Plot bind:this={plot} {...common} type="3d" data={bars} fillScale={palette}>
    <Bar x="x" y="y" fill="x" />
  </Plot>
{:else if name === "prism-3d"}
  <!-- A Prism written as such is a 3D mark, flat (z0 = z1) too: the view stays one image. -->
  <Plot bind:this={plot} {...common} {...cube} data={cloud3d}>
    <Points x="x" y="y" z="z" fill="g" fillScale={palette} size={8} />
    <Prism x={[5]} y={[5]} width={2} depth={2} z0={1} z1={1} shape="hexagon" fill="#7a36b4" />
  </Plot>
{:else if name === "mixed-3d"}
  <Plot bind:this={plot} {...common} {...cube} data={cloud3d} fillScale={palette}>
    <Points x="x" y="y" z="z" fill="g" size={8} />
    <Points3D x={[5]} y={[5]} z={[5]} size={8} fill="#1aa340" />
  </Plot>
{:else if name === "heatmap"}
  <Plot bind:this={plot} {...common} data={heat}>
    <Heatmap x="x" y="y" value="v" />
  </Plot>
{/if}
