<script>
  // Vertex buffer budget of the segment marks: WebGPU allows 8 vertex buffers per pipeline, and
  // a Line binds its quad and start, end, previous and next before any per-row channel. Lines
  // are horizontal and red, green or blue, so a test reads each one in one pixel column of a
  // PNG export (probe()). Handles are on window.lineBuffers.
  import { onMount } from "svelte";
  import { Plot, Anchor, Points, Line, Dodge, Filter, connect, categorical, where, continuous, less } from "$lib/index";
  const plots = $state({}), marks = $state({});
  const colors = categorical({ domain: ["r", "g", "b"], range: ["#ff0000", "#00c800", "#0000ff"] });
  const plain = { width: 320, height: 240, toneMapping: 0, axes2d: false, x: { domain: [0, 100] }, y: { domain: [0, 100] } };
  // connector: three point columns of one table (x 10, 50, 90); a Line joins each id across them
  // with per-row color and a per-row opacity that follows the brush on the first column.
  const table = { id: [1, 2, 3], kind: ["r", "g", "b"], a: [10, 10, 10], b: [50, 50, 50], c: [90, 90, 90], y: [20, 50, 80] };
  const fade = where("@any_brushed", where("@brushed", 0.9, 0.05), 0.7);
  // series: a plain Line with three series, each with its own color, opacity and width.
  const series = {
    kind: ["r", "r", "g", "g", "b", "b"], x: [10, 90, 10, 90, 10, 90], y: [20, 20, 50, 50, 80, 80],
    o: [1, 1, 0.5, 0.5, 0.2, 0.2], w: [2, 2, 5, 5, 10, 10],
  };
  // dashed: a dashed Line with per-row color, width and opacity fits (its path distances are a
  // storage read, TODO 73.2). Over the limit: a connector Line whose endpoints carry Dodge offsets,
  // with per-row color, width and opacity, needs nine; its opacity is read from storage instead
  // (TODO 136.11).
  const dodged = { id: [1, 2, 3], kind: ["r", "g", "b"], x: [60, 60, 60], y: [50, 50, 50], ex: [10, 10, 10], ey: [20, 50, 80], o: [1, 0.5, 0.2], w: [2, 5, 10] };
  // dashing: a solid Line of 100 short segments that a test makes dashed: its dashes run along the
  // whole path.
  const path = { x: Array.from({ length: 101 }, (_, i) => i), y: Array(101).fill(50) };
  let dashing = $state(false);
  // pixels: an L of a dashed Line, along x and then y of a plot whose units are 3.2 px wide and
  // 2.4 px tall: its dashes are 8 CSS pixels along both legs (TODO 73.2).
  const corner = { x: [10, 90, 90], y: [20, 20, 90] };
  const bends = { x: [10, 25, 35, 55, 70, 90], y: [30, 70, 40, 75, 35, 55], w: [24, 22, 20, 18, 16, 14] };
  let curveDomain = $state([0, 100]);
  let basisRows = $state([]);

  /**
   * Read column `fraction` (0-1 of the width) of a PNG export of `plot`. For each line color:
   * `alpha`, the opacity its most saturated pixel implies over the white background (0 when
   * absent), and `thickness`, how many pixels of the column it tints.
   */
  async function probe(plot, fraction) {
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const x = Math.round(fraction * canvas.width);
    const { data } = context.getImageData(x, 0, 1, canvas.height);
    const channel = { red: 0, green: 1, blue: 2 }, out = {};
    for (const [name, c] of Object.entries(channel)) {
      let others = 255, thickness = 0;
      for (let i = 0; i < data.length; i += 4) {
        const rest = Math.max(...[0, 1, 2].filter((k) => k !== c).map((k) => data[i + k]));
        if (data[i + c] - rest > 8) { thickness++; others = Math.min(others, rest); }
      }
      out[name] = { alpha: thickness ? 1 - others / 255 : 0, thickness };
    }
    return out;
  }
  /** Runs of red pixels along row `fraction` (0-1 of the height) of a PNG export of `plot`. */
  async function redRuns(plot, fraction) {
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, Math.round(fraction * canvas.height), canvas.width, 1);
    let runs = 0, inside = false;
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i] - Math.max(data[i + 1], data[i + 2]) > 64;
      if (red && !inside) runs++;
      inside = red;
    }
    return runs;
  }
  onMount(() => {
    window.lineBuffers = { plots, marks, probe, redRuns, setDashing: (value) => { dashing = value; },
      setCurveDomain: (value) => { curveDomain = value; },
      setBasisRows: (value) => { basisRows = value; } };
    return () => { delete window.lineBuffers; };
  });
</script>

<!-- connector: per-row color and a brush-driven per-row opacity (7 vertex buffers). -->
<section data-fixture="connector">
  <Plot bind:this={plots.connector} data={table} {...plain}>
    <Points bind:this={marks.columnA} x="a" y="y" size={4} fill="#808080" brush />
    <Points bind:this={marks.columnB} x="b" y="y" size={4} fill="#808080" />
    <Points bind:this={marks.columnC} x="c" y="y" size={4} fill="#808080" />
    <Line bind:this={marks.connector} connections={connect(marks.columnA, marks.columnB, marks.columnC)}
      color="kind" colorScale={colors} width={3} opacity={fade} />
  </Plot>
</section>

<!-- Thick curves expose cracks where separately refined source intervals meet. -->
{#each [false, true] as varying}
  <section data-fixture={varying ? "curve-widths" : "curve-joins"}>
    <Plot bind:this={plots[varying ? "curveWidths" : "curveJoins"]} data={bends} {...plain}>
      <Line x="x" y="y" curve="catmull-rom" curveAlpha={0} color="#ff0000" opacity={0.7}
        width={varying ? "w" : 24} widthScale={continuous({ domain: [0, 24], range: [0, 24] })} />
    </Plot>
  </section>
{/each}

<section data-fixture="curve-axis">
  <Plot bind:this={plots.curveAxis} data={bends} {...plain} axes2d x={{ domain: curveDomain }}>
    <Line bind:this={marks.curveAxis} x="x" y="y" curve="catmull-rom" color="#ff0000" width={24} />
  </Plot>
</section>

<!-- series: a plain Line with per-row color, opacity and width (8 vertex buffers). A color by
     category draws a path per category without series= (TODO 136.17). -->
<section data-fixture="series">
  <Plot bind:this={plots.series} data={series} {...plain}>
    <Line bind:this={marks.series} x="x" y="y" color="kind" colorScale={colors} opacity="o"
      width="w" widthScale={continuous({ domain: [0, 10], range: [0, 10] })} />
  </Plot>
</section>

<!-- filtered: the same series under a Filter that hides the blue rows. -->
<section data-fixture="filtered">
  <Plot bind:this={plots.filtered} data={series} {...plain}>
    <Filter where={less("y", 70)}><Line x="x" y="y" color="kind" colorScale={colors} width={2} /></Filter>
  </Plot>
</section>

<!-- dashed: per-row color, width and opacity, dashed (7 vertex buffers). -->
<section data-fixture="dashed">
  <Plot bind:this={plots.dashed} data={series} {...plain}>
    <Line bind:this={marks.dashed} x="x" y="y" series="kind" color="kind" colorScale={colors} opacity="o"
      width="w" widthScale={continuous({ domain: [0, 10], range: [0, 10] })} dash={[6, 3]} />
  </Plot>
</section>

<!-- over-limit: nine vertex buffers; the last channel is read from storage. -->
<section data-fixture="over-limit">
  <Plot bind:this={plots.dodged} data={dodged} {...plain}>
    <Dodge x="x" axis="y" as="lift" padding={10}>
      <Points bind:this={marks.dodgePoints} x="x" y="y" dy="lift" size={6} fill="#808080" />
    </Dodge>
    <Anchor bind:this={marks.dodgeEnds} x="ex" y="ey" />
    <Line bind:this={marks.dodged} connections={connect(marks.dodgePoints, marks.dodgeEnds, { key: "id" })}
      color="kind" colorScale={colors} opacity="o" width="w" />
  </Plot>
</section>

<!-- pixels: dashes in CSS pixels along both legs of an L, whatever the zoom. -->
<section data-fixture="pixels">
  <Plot bind:this={plots.pixels} data={corner} {...plain}>
    <Line bind:this={marks.pixels} x="x" y="y" color="#ff0000" width={3} dash={[8, 8]} />
  </Plot>
</section>

<!-- dashing: a solid Line that becomes dashed. -->
<section data-fixture="dashing">
  <Plot bind:this={plots.dashing} data={path} {...plain}>
    <Line bind:this={marks.dashing} x="x" y="y" color="#ff0000" width={4} dash={dashing ? 12 : false} />
  </Plot>
</section>

<section data-fixture="empty-basis">
  <Plot bind:this={plots.emptyBasis} {...plain}>
    <Line position={basisRows} curve="basis" color="#ff0000" width={5} />
    <Points position={[[50, 50]]} size={10} fill="#00ff00" />
  </Plot>
</section>
