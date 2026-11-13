<script>
  // TODO 136.9: each mark family in its widest configuration (per-row and colormapped channels,
  // outlines, picking, 3D lighting), for the varyings spec: no shader past WebGPU's 16
  // inter-stage locations.
  import {
    Plot,
    Rect,
    Points,
    Line,
    Area,
    Polygon,
    Text,
    Prism,
    Points3D,
    Segments,
    continuous,
    categorical,
  } from "$lib/index";
  const fillScale = continuous({ domain: [0, 1], colormap: "viridis" });
  const edgeScale = categorical({
    domain: ["a", "b"],
    range: ["#e60000", "#0050e6"],
  });
  const rows = {
    x: [1, 2, 3, 4],
    y: [1, 3, 2, 4],
    x1: [1.5, 2.5, 3.5, 4.5],
    y1: [2, 4, 3, 5],
    v: [0, 0.3, 0.6, 1],
    a: [0.4, 0.6, 0.8, 1],
    w: [1, 2, 3, 4],
    g: ["a", "b", "a", "b"],
    s: ["circle", "square", "triangle", "diamond"],
    t: ["A", "B", "C", "D"],
  };
  const flat = {
    width: 300,
    height: 200,
    x: { domain: [0, 5] },
    y: { domain: [0, 6] },
  };
  const cube = { ...flat, type: "3d", toneMapping: 4, z: { domain: [0, 2] } };
  const plots = $state({});
  const hits = [];
  const click = (event) => hits.push(event.rowIndex);
  $effect(() => {
    window.varyings = { plots };
    return () => delete window.varyings;
  });
</script>

<Plot
  bind:this={plots.flat}
  data={rows}
  {...flat}
  {fillScale}
  outlineColorScale={edgeScale}
>
  <Rect
    x0="x"
    x1="x1"
    y0="y"
    y1="y1"
    fill="v"
    opacity="a"
    outlineColor="g"
    outlineWidth="w"
    outlineOpacity="a"
    onclick={click}
  />
  <Points
    x="x"
    y="y"
    shape="s"
    size="w"
    fill="v"
    opacity="a"
    outlineColor="g"
    outlineWidth="w"
    onclick={click}
  />
  <Line
    x="x"
    y="y"
    color="v"
    colorScale={fillScale}
    width="w"
    opacity="a"
    onclick={click}
  />
  <Area
    x="x"
    upper="y"
    lower={0}
    fill="v"
    outlineColor="#e60000"
    outlineWidth={2}
    outlineOpacity={0.5}
  />
  <Polygon x="x" y="y" fill="#888888" outlineColor="#e60000" outlineWidth={3} />
  <Text x="x" y="y" text="t" fill="v" size="w" opacity="a" onclick={click} />
</Plot>
<Plot
  bind:this={plots.cube}
  data={rows}
  {...cube}
  {fillScale}
  outlineColorScale={edgeScale}
>
  <Rect
    x0="x"
    x1="x1"
    y0="y"
    y1="y1"
    z0={0}
    z1={1}
    fill="v"
    opacity="a"
    outlineColor="g"
    outlineWidth="w"
    outlineOpacity="a"
    onclick={click}
  />
  <Prism
    x="x"
    y="y"
    z0={0}
    z1={2}
    width={0.4}
    depth={0.4}
    fill="v"
    opacity="a"
    onclick={click}
  />
  <Points3D x="x" y="y" z="a" size="w" fill="v" opacity="a" onclick={click} />
  <Segments
    start={["x", "y", "a"]}
    end={["x1", "y1", "a"]}
    color="v"
    colorScale={fillScale}
    width="w"
    onclick={click}
  />
</Plot>
