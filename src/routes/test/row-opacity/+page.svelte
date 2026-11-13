<script>
  // Row opacity on the marks that draw it from their own alpha (TODO 32.2): polar Rects (a
  // Filter's hidden rows, an opacity expression). Two sectors, red and blue; the test reads a
  // PNG export for blue pixels. Handles are on window.rowOpacity.
  import { Plot, Data, Filter, Rect, categorical, where, greater } from "$lib/index";
  const plots = $state({});
  const sectors = { x0: [0, 12], x1: [10, 22], y0: [2, 2], y1: [9, 9], kind: ["r", "b"], keep: [1, 0] };
  const colors = categorical({ domain: ["r", "b"], range: ["#ff0000", "#0000ff"] });
  // Count sector pixels only: a legend swatch remains even when its sector is filtered out.
  const polar = { width: 320, height: 320, legend: false, toneMapping: 0, axes2d: false, coordinates: "polar", angleUnit: "custom", anglePeriod: 24,
    x: { domain: [0, 24], visible: false }, y: { domain: [0, 10], visible: false } };
  /** Pixels of `plot`'s PNG export that are mostly red or mostly blue. */
  async function colorCounts(plot) {
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let red = 0, blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] - Math.max(data[i + 1], data[i + 2]) > 96) red++;
      if (data[i + 2] - Math.max(data[i], data[i + 1]) > 96) blue++;
    }
    return { red, blue };
  }
  $effect(() => {
    window.rowOpacity = { plots, colorCounts };
    return () => { delete window.rowOpacity; };
  });
</script>

<!-- Both sectors, no row opacity: the reference. -->
<Plot bind:this={plots.both} data={sectors} {...polar}>
  <Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="kind" fillScale={colors} />
</Plot>
<!-- A Filter hides the blue sector: the Rect draws both rows and hides the dropped one. -->
<Plot bind:this={plots.filtered} {...polar}>
  <Data value={sectors}>
    <Filter where={{ field: "keep", op: "gt", value: 0 }}>
      <Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="kind" fillScale={colors} />
    </Filter>
  </Data>
</Plot>
<!-- An opacity expression of 0 hides the blue sector. -->
<Plot bind:this={plots.expression} data={sectors} {...polar}>
  <Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="kind" fillScale={colors} opacity={where(greater("keep", 0), 1, 0)} />
</Plot>
