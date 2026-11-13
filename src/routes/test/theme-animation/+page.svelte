<script>
  // TODO 132.7: a theme's animation section. The theme fades keyed rows in and out over 1500 ms,
  // linearly. Themed's Rect sets only animation; Unanimated's sets no animation, so nothing
  // fades (the theme turns nothing on); Cancelled is under a nested Theme whose enter and exit
  // are false; PlotDuration's Plot sets its own animationDuration, 3000 ms. x encodes each key.
  import { onMount } from "svelte";
  import { Theme, Plot, Rect, add } from "$lib/index";
  const NAMES = ["Themed", "Unanimated", "Cancelled", "PlotDuration"];
  let keys = $state(["a", "b", "c"]);
  const rows = $derived.by(() => {
    const x = keys.map((key) => key.charCodeAt(0) - 96);
    return { id: keys, x, y: x };
  });
  const plots = $state({}), marks = $state({});
  /** A Rect's instances now (its position field's rows) and each one's row opacity. */
  async function readOpacity(name) {
    const mark = marks[name].getMark(), field = mark.fields.get("interactionOpacity");
    const count = mark.fields.get("position")?.count;
    if (!field?.bufferNodeSource || field.count !== count) return { rows: count, opacity: null };
    const renderer = mark.renderer, device = renderer.backend.device;
    const staging = device.createBuffer({ size: Math.max(16, count * 4), usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(renderer.backend.get(field.bufferNodeSource).buffer, 0, staging, 0, count * 4);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const opacity = Array.from(new Float32Array(staging.getMappedRange())).slice(0, count);
    staging.destroy();
    return { rows: count, opacity };
  }
  onMount(() => {
    window.themeAnimation = { kindPlots: plots, kindMarks: marks, readOpacity, setKindKeys: (next) => { keys = next; } };
  });
</script>

<Theme value={{ extends: ["hmplot", "animation/fade"], animation: { duration: 1500, easing: "linear" } }}>
  {#each NAMES as name (name)}
    <Theme value={name === "Cancelled" ? { animation: { enter: false, exit: false } } : {}}>
      <Plot bind:this={plots[name]} data={rows} key="id" width={150} height={110} x={{ domain: [0, 6] }} y={{ domain: [0, 6] }}
        animationDuration={name === "PlotDuration" ? 3000 : undefined}>
        <Rect bind:this={marks[name]} x0="x" x1={add("x", 0.5)} y0={0} y1="y" animation={name === "Unanimated" ? undefined : true} />
      </Plot>
    </Theme>
  {/each}
</Theme>
