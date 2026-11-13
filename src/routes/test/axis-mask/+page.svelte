<script>
  import { onMount } from "svelte";
  import { Plot, Frame, Facet, Points, Line, Rect, Text } from "$lib/index";
  const scene = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("case") ?? "points";
  let plot = $state(), points = $state(), masked = $state(true), frameLines = $state(true);
  let antialias = $state("msaa");
  const clicks = [];
  const red = "#d02a32", axis = { domain: [0, 10], grid: "off", line: false, arrow: "none" };
  onMount(() => {
    window.axisMaskTest = { get plot() { return plot; }, get points() { return points; }, clicks, scene,
      mask: value => { masked = value; }, lines: value => { frameLines = value; },
      sampling: value => { antialias = value; } };
    return () => { delete window.axisMaskTest; };
  });
</script>

<Plot bind:this={plot} width={480} height={360} responsive={false} x={axis} y={axis}
  {antialias}
  axes2d={scene === "hidden" ? false : undefined}
  axisMask={masked} background="transparent" toneMapping={0}
  data={scene === "facet" ? { group: ["A", "A", "B", "B"], x: [0, 10, 0, 10], y: [5, 5, 5, 5] }
    : scene === "brush" ? { x: [-1, 1, 5, 9, 11], y: [5, 5, 5, 5, 5] } : undefined}>
  {#if scene === "points" || scene === "hidden"}
    <Points bind:this={points} x={[0, 10, 5, 5]} y={[5, 5, 0, 10]} size={60} fill={red}
      onclick={() => clicks.push("point")} />
  {:else if scene === "line"}
    <Line x={[-3, 13]} y={[2, 8]} width={20} color={red} />
  {:else if scene === "fill"}
    <Rect x0={[-2]} x1={[12]} y0={[2]} y1={[8]} fill={red} />
  {:else if scene === "text"}
    <Text x={[0, 10]} y={[5, 5]} text={["MASK", "MASK"]} size={38} color={red} />
  {:else if scene === "nested"}
    <Frame x={{ domain: [0, 10], range: [2, 8] }} y={{ domain: [0, 10], range: [2, 8] }} axisMask={masked}>
      <Frame x={{ domain: [0, 10], range: [-2, 12] }} y={{ domain: [0, 10], range: [1, 9] }} axisMask={masked}>
        <Rect x0={[-5]} x1={[15]} y0={[-5]} y1={[15]} fill={red} />
      </Frame>
    </Frame>
  {:else if scene === "facet"}
    <Facet column="group"><Points x="x" y="y" size={80} fill={red} /></Facet>
  {:else if scene === "placed"}
    <Frame x={{ domain: [0, 10], line: frameLines }} y={{ domain: [0, 10], line: frameLines }}
      placement={{ anchor: [5, 5], size: [240, 140], rotation: [0, 0, 25] }} axisMask={masked} axisFrame>
      <Rect x0={[-5]} x1={[15]} y0={[-5]} y1={[15]} fill={red} />
    </Frame>
  {:else if scene === "brush"}
    <Points bind:this={points} x="x" y="y" size={16} fill={red} brush />
  {/if}
</Plot>
