<script>
  // TODO 29.2: maxElements is the initial allocation; 40 points in a mark allocated for 16 grow
  // its buffers and all draw. Handles are on window.maxElements.
  import { Plot, Points } from "$lib/index";
  let plot = $state(), points = $state();
  const data = { x: Array.from({ length: 40 }, (_, i) => i), y: Array(40).fill(5) };
  /** Red pixels of a PNG export in the right tenth of the canvas (the last points). */
  async function lastPointsDrawn() {
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const x0 = Math.floor(canvas.width * 0.9), { data: pixels } = context.getImageData(x0, 0, canvas.width - x0, canvas.height);
    let red = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] - Math.max(pixels[i + 1], pixels[i + 2]) > 96) red++;
    return red;
  }
  $effect(() => {
    window.maxElements = { get plot() { return plot; }, get points() { return points; }, lastPointsDrawn };
    return () => { delete window.maxElements; };
  });
</script>

<Plot bind:this={plot} {data} width={400} height={120} toneMapping={0} axes2d={false} x={{ domain: [-1, 40] }} y={{ domain: [0, 10] }}>
  <Points bind:this={points} x="x" y="y" size={4} fill="#ff0000" maxElements={16} />
</Plot>
