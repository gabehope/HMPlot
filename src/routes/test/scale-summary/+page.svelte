<script>
  import { onMount, tick } from "svelte";
  import { Plot, Points, Image, gridTable, add, divide } from "$lib/index";
  const scene = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("scene") ?? "mutable";
  let plot = $state(), mark = $state(), size = $state(12), imageOpacity = $state(1);
  let sizeUnits = $state("px");
  const x = Float32Array.of(1, 2, 3), y = Float32Array.of(2, 4, 6);
  const colors = {
    r: Uint8Array.of(255, 0, 0, 255, 255, 0),
    g: Uint8Array.of(0, 255, 0, 255, 0, 255),
    b: Uint8Array.of(0, 0, 255, 0, 255, 255),
  };
  let grid = $state.raw(gridTable({ dims: { lat: [0.5, 1.5], lon: [0.5, 1.5, 2.5] }, columns: colors }));
  const axis = { padding: 0, grid: "off" };
  onMount(() => {
    window.scaleSummaryFixture = {
      get plot() { return plot; }, get mark() { return mark; }, arrays: { x, y },
      async mutate() { x[1] = 20; y[2] = 40; size = 14; await tick(); },
      async units(value) { sizeUnits = value; await tick(); },
      async moveGrid() {
        grid = gridTable({ dims: { lat: [4, 8], lon: [10, 12, 14] }, columns: colors });
        imageOpacity = 0.9; await tick();
      },
      bounds() {
        const frame = plot.getAxes()[0].getFrameOptions();
        return { x: [...frame.get("xbounds")], y: [...frame.get("ybounds")] };
      },
      async snapshot() {
        await plot.whenSettled();
        const { blob } = await plot.exportSVG({ mode: "vector" });
        const svg = new DOMParser().parseFromString(await blob.text(), "image/svg+xml");
        const circles = color => [...svg.querySelectorAll(`circle[fill="${color}"]`)].map(circle =>
          [Number(circle.getAttribute("cx")), Number(circle.getAttribute("cy"))]);
        const radii = [...svg.querySelectorAll('circle[fill="#8e3db3"]')].map(circle => Number(circle.getAttribute("r")));
        return { bounds: this.bounds(), units: mark.getLegendSource().guideMark().options.get("sizeUnits"),
          fixed: circles("#8e3db3"), radii, moving: circles("#e2439b"),
          frames: plot.getDiagnostics().completedFrame, error: plot.getRenderError() };
      },
    };
    return () => delete window.scaleSummaryFixture;
  });
</script>

<Plot bind:this={plot} width={480} height={320} responsive={false} autoBounds={true} axisMask={false}
  toneMapping={0} background="#ffffff" settings="hidden" x={axis} y={axis}
  data={scene === "image" ? grid : scene === "time" ? { x: [1, 2], y: [2, 3] } : scene === "pointer" ? { row: [0, 1, 2] } : undefined}>
  {#if scene === "mutable"}
    <Points bind:this={mark} {x} {y} {size} fill="#8e3db3" opacity={1} outlineWidth={0} />
  {:else if scene === "units"}
    <Points bind:this={mark} x={[1, 2, 3]} y={[1, 2, 3]} size={2} {sizeUnits}
      fill="#8e3db3" opacity={1} outlineWidth={0} />
  {:else if scene === "time"}
    <Points x={[0, 3]} y={[0, 1]} size={12} fill="#8e3db3" opacity={1} outlineWidth={0} />
    <Points bind:this={mark} x="x" y={add("y", divide("@time", 1000))} size={12}
      fill="#e2439b" opacity={1} outlineWidth={0} />
  {:else if scene === "pointer"}
    <Points x={[1, 2, 3]} y={[1, 2, 3]} size={12} fill="#8e3db3" opacity={1} outlineWidth={0} />
    <Points bind:this={mark} x="@pointer_x" y={1.5} size={16} fill="#e2439b" opacity={1} outlineWidth={0} />
  {:else if scene === "image"}
    <Image bind:this={mark} fill={{ r: "r", g: "g", b: "b" }} opacity={imageOpacity} pixelated />
  {/if}
</Plot>
