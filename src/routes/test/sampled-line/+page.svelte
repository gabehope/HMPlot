<script>
  // A Line with sampling="uniform-x" over 20,000 evenly spaced rows under an automatic x domain,
  // which the axis pads past the first and last x. Zoomed in, the sampled rows must span the
  // visible x range. redColumns() reads which pixel columns of a PNG export the red line tints.
  // Handles are on window.sampledLine.
  import { Plot, Line } from "$lib/index";
  let plot = $state();
  const n = 20000, data = { x: Array.from({ length: n }, (_, i) => 1000 + i * 0.5), y: Array.from({ length: n }, (_, i) => Math.sin(i / 40)) };
  /** For each pixel column of a PNG export, whether the red line tints it. */
  async function redColumns() {
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height), columns = Array(canvas.width).fill(false);
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] - Math.max(pixels[i + 1], pixels[i + 2]) > 96) columns[(i / 4) % canvas.width] = true;
    return columns;
  }
  $effect(() => {
    window.sampledLine = { get plot() { return plot; }, redColumns };
    return () => { delete window.sampledLine; };
  });
</script>

<Plot bind:this={plot} {data} width={400} height={120} toneMapping={0} axes2d={false} zoomAxis="x">
  <Line x="x" y="y" sampling="uniform-x" width={2} color="#ff0000" />
</Plot>
