<script>
  // Stage 7 fixtures: RGB color channels and custom colormaps, one plot per case so PNG
  // exports can be classified by color.
  import { onMount } from "svelte";
  import { Plot, Points, Text, GeoJSON, Legend, Theme, Image, Heatmap, Data, Interpolate, Points3D, Arrows3D, Text3D, Rect, Prism, Mapping, categorical, createTheme, continuous } from "$lib/index";
import { Bar, Histogram } from "$lib/charts/index.js";
  import { numpy as np } from "@hmplot/jax";
  import { initializePlot } from "$lib/jaxExtensions/setup.js";
  const plots = $state({}), marks = $state({});
  // TODO 69.17: the theme over the 3D plots below, which the test replaces after mount.
  const solidTheme = createTheme({ extends: "minimal" });
  onMount(() => { window.colorFixture = { plots, marks, solidTheme, setGeoValid: (valid) => { geoColor = valid ? geoGood : geoBad; } }; return () => { delete window.colorFixture; }; });
  const x = [10, 30, 50, 70, 90], y = [50, 50, 50, 50, 50];
  // Integer columns are 0-255.
  const integers = { x, y, r: Uint8Array.from([255, 0, 0, 255, 0]), g: Uint8Array.from([0, 255, 0, 255, 0]), b: Uint8Array.from([0, 0, 255, 0, 0]) };
  // Float rows are 0-1.
  const rows = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 0, 0]];
  const rgba = [[1, 0, 0, 1], [1, 0, 0, 0.2], [1, 0, 0, 1], [1, 0, 0, 0.2], [1, 0, 0, 1]];
  const values = { x, y, value: [0, 0.25, 0.5, 0.75, 1] };
  const redBlue = continuous({ domain: [0, 1], colormap: ["#ff0000", "#0000ff"] });
  const stepped = continuous({ domain: [0, 1], colormap: { colors: ["#ff0000", "#00ff00", "#0000ff"], space: "srgb", positions: [0, 0.9, 1] } });
  const magma = createTheme({ colormap: "Magma" });
  const bad = { x, y, r: [2, 0, 0, 0, 0], g: [0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0] };
  // 7C A9: GPU-array RGB on GeoJSON takes the async range check (300 is out of the 0-255 range).
  const squares = { type: "FeatureCollection", features: [0, 1].map((i) => ({ type: "Feature", id: i, properties: { name: `s${i}` },
    geometry: { type: "Polygon", coordinates: [[[i * 40 + 10, 20], [i * 40 + 40, 20], [i * 40 + 40, 60], [i * 40 + 10, 60], [i * 40 + 10, 20]]] } })) };
  const geoBad = np.array([[300, 0, 0], [0, 0, 0]], { dtype: np.int32 });
  const geoGood = "#ff0000";
  let geoColor = $state.raw(geoBad);
  // 7C B1: Image colors follow the RGB dtype rule; Heatmap rejects an RGB grid.
  const quadrants = [[[1, 0, 0], [0, 1, 0]], [[0, 0, 1], [1, 1, 0]]];
  // Half-intensity bytes: 128 must render as 128, not clamp to 255 as a 0-1 float would.
  // GPU arrays are made once the WebGPU device is up (arrays made before it live on the CPU).
  let quadrantBytes = $state.raw(), quadrantFloats = $state.raw(), brightFloats = $state.raw();
  onMount(() => {
    initializePlot().then(() => {
      const half = [128, 0, 0, 0, 128, 0, 0, 0, 128, 128, 128, 0];
      quadrantBytes = np.array(half, { dtype: np.int32 }).reshape([2, 2, 3]);
      quadrantFloats = np.array(new Float32Array(half.map((v) => v / 255))).reshape([2, 2, 3]);
      brightFloats = np.array(new Float32Array(half.map((v) => v / 64))).reshape([2, 2, 3]);
    });
  });
  const tooBright = [[[2, 0, 0], [0, 1, 0]], [[0, 0, 1], [1, 1, 0]]];
  // Tone mapping off, so rendered colors equal the requested ones.
  const common = { width: 360, height: 140, axes2d: true, toneMapping: 0, x: { domain: [0, 100] }, y: { domain: [0, 100] } };
</script>

<Plot bind:this={plots.integers} data={integers} {...common}>
  <Points bind:this={marks.integers} x="x" y="y" fill={{ r: "r", g: "g", b: "b" }} size={12} />
</Plot>
<Plot bind:this={plots.rows} {...common}>
  <Points x={x} y={y} fill={rows} size={12} />
</Plot>
<!-- Alpha probes blend over white, without a grid line through their centers. -->
<Plot bind:this={plots.rgba} {...common} axes2d={false}>
  <Points x={x} y={y} fill={rgba} size={12} />
</Plot>
<Plot bind:this={plots.custom} data={values} {...common} name="Custom colormap">
  <Points bind:this={marks.custom} x="x" y="y" fill="value" fillScale={redBlue} size={12} name="Custom points" />
  <Legend for={marks.custom} channel="fill" label="Custom" position="right" />
</Plot>
<Plot bind:this={plots.stepped} data={values} {...common}>
  <Points x="x" y="y" fill="value" fillScale={stepped} size={12} />
</Plot>
<Theme value={magma}>
  <Plot bind:this={plots.theme} data={values} {...common}>
    <Points x="x" y="y" fill="value" size={12} />
  </Plot>
</Theme>
<Plot bind:this={plots.bad} data={bad} {...common}>
  <Points x="x" y="y" fill={{ r: "r", g: "g", b: "b" }} size={12} />
</Plot>
<!-- 7C A4: Points blend RGBA alpha (and plain opacity arrays). -->
<Plot bind:this={plots.rgba2d} {...common} axes2d={false}>
  <Points bind:this={marks.rgba2d} x={x} y={y} fill={rgba} size={12} />
</Plot>
<!-- 7C A2: a Text with N x 4 colors draws translucent glyphs. -->
<Plot bind:this={plots.rgbaLabel} {...common}>
  <Text bind:this={marks.rgbaLabel} x={x} y={y} text={["M", "M", "M", "M", "M"]} color={rgba} size={40} />
</Plot>
<!-- 7C A2: per-row fill, outline, size and alpha need 9 vertex buffers on points; WebGPU allows 8. -->
<Plot bind:this={plots.overflow} {...common}>
  <Points bind:this={marks.overflow} x={x} y={y} fill={rgba} outlineColor={rows} outlineWidth={0.6} size={[20, 22, 24, 26, 28]} />
</Plot>
<Plot bind:this={plots.geoBad} {...common} axes2d={false} name="GeoJSON RGB recovery">
  <GeoJSON bind:this={marks.geoBad} data={squares} fill={geoColor} />
</Plot>
<!-- 7C B1: Image takes [H, W, 3] floats 0-1 or integers 0-255; Heatmap points to Image. -->
<Plot bind:this={plots.imageFloat} {...common} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
  <Image data={quadrants} pixelated />
</Plot>
{#if quadrantBytes}
  <Plot bind:this={plots.imageInt} {...common} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Image data={quadrantBytes} pixelated />
  </Plot>
  <Plot bind:this={plots.imageGpu} {...common} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Image data={quadrantFloats} pixelated />
  </Plot>
  <Plot bind:this={plots.imageGpuBad} {...common} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Image data={brightFloats} pixelated />
  </Plot>
{/if}
<Plot bind:this={plots.imageBad} {...common} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
  <Image data={tooBright} pixelated />
</Plot>
<Plot bind:this={plots.heatmapRgb} {...common} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
  <Heatmap fill={quadrants} />
</Plot>
<!-- 7C B1: categorical Grid heatmaps share the image path; their palette colors render exactly. -->
<Data value={{ x: [0, 1, 0, 1], y: [0, 0, 1, 1], region: ["a", "a", "b", "b"] }}>
  <Interpolate x="x" y="y" values={["region"]} resolution={[8, 8]}>
    <Plot x={{ domain: [0, 1] }} y={{ domain: [0, 1] }} bind:this={plots.catGrid} width={360} height={140} axes2d toneMapping={0}>
      <Heatmap fill="region" fillScale={categorical({ domain: ["a", "b"], range: ["#4c78a8", "#808080"] })} />
    </Plot>
  </Interpolate>
</Data>
<!-- TODO 69.17: 3D marks with no color of their own take the theme's (Points3D the Points fill,
     Arrows3D the Arrows color, Text3D the Text color) and follow a theme change; an explicit fill
     and a fill scale keep theirs. One sphere alone at the center, for its outline; unlit and
     without tone mapping, so exports show the requested colors. -->
<Theme value={solidTheme}>
  <Plot bind:this={plots.solid} type="3d" width={300} height={300} toneMapping={0} axes3d={false}
    x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }} z={{ domain: [-1, 1] }}>
    <Points3D bind:this={marks.sphere} x={[0]} y={[0]} z={[0]} size={60} />
  </Plot>
  <Plot bind:this={plots.solidMarks} type="3d" width={300} height={300} toneMapping={0} axes3d={false}
    x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }} z={{ domain: [-1, 1] }}>
    <Points3D bind:this={marks.coarse} x={[-0.5]} y={[0.5]} z={[0]} size={30} fill="#ff8800" detail={1} />
    <Points3D x={[0.5]} y={[0.5]} z={[0]} size={30} fill={[1]} fillScale={redBlue} />
    <Arrows3D start={[[-0.8, -0.2, 0]]} end={[[0.8, -0.2, 0]]} width={8} headWidth={16} headLength={16} />
    <Text3D text="HM" position={[0, -0.7, 0]} size={30} />
  </Plot>
  <!-- TODO 73.6: Rect, Histogram, Bar and Prism with no fill take the theme's first palette color
       and follow a theme change; an explicit fill and a Mapping's keep theirs. Left to right, a
       mark each: Rect, Histogram (two bins of 18 to 30), Bar, Prism, a Rect filled #ff8800 and a
       Bar under a Mapping's #0000ff. -->
  <Plot bind:this={plots.filled} data={{ center: [40], far: [88], top: [80] }} {...common} axes2d={false}>
    <Rect x0={[2]} x1={[12]} y0={[10]} y1={[90]} />
    <Histogram x={Array.from({ length: 120 }, (_, i) => 18 + (i % 13))} bins={2} />
    <Bar x="center" y="top" orientation="vertical" bandFraction={8} />
    <Prism x={[55]} y={[50]} width={8} depth={80} z0={0} z1={0} />
    <Rect x0={[66]} x1={[76]} y0={[10]} y1={[90]} fill="#ff8800" />
    <Mapping fill="#0000ff"><Bar x="far" y="top" orientation="vertical" bandFraction={8} /></Mapping>
  </Plot>
</Theme>
