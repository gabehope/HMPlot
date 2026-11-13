<script>
  // Connection fixtures (Stage 15). Each block is a section with data-fixture="<name>"; its
  // handles are on window.connectionsFixture. Probe points use saturated colors a test can
  // find in a PNG export by channel dominance.
  import { onMount } from "svelte";
  import { Plot, Data, Anchor, Points, Segments, Arrows3D, Line, Text, Rect, Fold, Facet, Partition, Sort, connect, animate, categorical } from "$lib/index";
import { Histogram, Bar } from "$lib/charts/index.js";
  let domainPlot = $state(), controlPlot = $state(), anchor = $state(), probe = $state();
  let pickablePlot = $state(), legendPlot = $state(), legendAnchor = $state();
  let animatePlot = $state(), animateAnchor = $state();
  let animateRows = $state({ x: [1, 2, 3], y: [0, 0, 0] });
  // Every row of a mark's live position buffer, and its transition's progress (0-1 or null).
  async function readPosition(handle) {
    const mark = handle.getMark();
    const field = mark.fields.get("position"), attribute = field.bufferNodeSource;
    const renderer = mark.renderer, device = renderer.backend.device;
    const gpu = renderer.backend.get(attribute).buffer;
    const count = field.count, stride = 4, bytes = count * stride * 4;
    const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const transition = attribute.transition;
    const progress = transition ? transition.clock.progress(transition) : null;
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpu, 0, staging, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const values = Array.from(new Float32Array(staging.getMappedRange()));
    staging.destroy();
    const rows = [];
    for (let i = 0; i < count; i++) rows.push(values.slice(i * stride, i * stride + 3));
    return { rows, progress, active: !!transition && transition.clock.tracks.has(transition) };
  }
  // Chunk B (connections at rest). Endpoints are red (#ff0000) and blue (#0000ff) points; the
  // connector is green (#00c800), so a probe between two endpoint centroids reads the connector.
  const plain = { width: 320, height: 240, toneMapping: 0, axes2d: false, x: { domain: [0, 100] }, y: { domain: [0, 100] } };
  let beforeAfterPlot = $state(), before = $state(), after = $state(), beforeAfterArrows = $state();
  const pairs = { id: [1, 2, 3], x0: [10, 15, 20], x1: [80, 85, 90], y: [20, 50, 80] };
  let tablesPlot = $state(), leftPoints = $state(), rightPoints = $state();
  let leftTable = $state({ name: ["a", "b", "c"], x: [10, 10, 10], y: [20, 50, 80] });
  let rightTable = $state({ name: ["a", "b", "c"], x: [90, 90, 90], y: [20, 50, 80] });
  let tablesDomain = $state([0, 100]);
  let lastEvent = null, clicks = [];
  const recordClick = (event) => { lastEvent = { instanceId: event.instanceId, rowIndex: event.rowIndex ?? null, connection: event.connection ?? null }; clicks.push(lastEvent); };
  // Line with connections and x: an error naming the conflict.
  let lineErrorPlot = $state(), errorFrom = $state(), errorTo = $state();
  // Attachments: one observation whose columns place every endpoint; red/blue reference points
  // at (5, 5) and (95, 95) calibrate data -> pixels. Gray marks are endpoints, green connectors.
  let attachPlot = $state(), label = $state(), labelFrom = $state(), rect = $state(), leftFrom = $state(),
    centerFrom = $state(), seg = $state(), startFrom = $state(), endFrom = $state();
  const attachRow = {
    id: [1], text: ["W"], labelX: [70], labelY: [85], fromLabelX: [10],
    rectX0: [40], rectX1: [60], rectY0: [55], rectY1: [70], rectMidY: [62.5], leftFromX: [10], centerFromX: [90],
    segY0: [30], segY1: [40], startFromX: [10], endFromX: [90],
  };
  // Aggregate endpoints: Histogram bars matched by their bin edge; without key it is an error.
  let aggregatePlot = $state(), histogram = $state(), tops = $state();
  let aggregateErrorPlot = $state(), histogramNoKey = $state(), topsNoKey = $state();
  const samples = { v: [10, 20, 30, 60, 70] }, binTops = { x0: [0, 50], x: [25, 75], y: [8, 8] };
  // Bar value ends: a positive and a negative bar, each connected to an Anchor beyond its value.
  let barPlot = $state(), bar = $state(), barEnds = $state();
  // Parallel coordinates (plan step 6): Fold > embedded Facet(column="key", free-y) > Anchor
  // name="values"; a sibling Line connects facet.endpoint("values") by id in facet order (the
  // default for one repeated endpoint: no order option).
  let parallelPlot = $state(), parallelFacet = $state();
  let parallelFields = $state(["a", "b", "c"]), parallelOrder = $state(undefined);
  let parallelRows = $state({ id: [1, 2, 3], species: ["r", "g", "b"], a: [1, 2, 3], b: [30, 20, 10], c: [5, 7, 6] });
  const species = categorical({ domain: ["r", "g", "b"], range: ["#ff0000", "#00c800", "#0000ff"] });
  // Implicit matching: no key; the after points show the table through a Sort (a derived view),
  // so they match by source observation (key tokens through provenance), not by row position.
  let implicitPlot = $state(), implicitBefore = $state(), implicitAfter = $state();
  // Partition: the Anchor repeated in every group, selected by partition.endpoint("tip").
  let partitionPlot = $state(), partition = $state();
  const partitionRows = { id: [1, 1, 2, 2], group: ["g1", "g2", "g1", "g2"], x: [10, 90, 10, 90], y: [20, 20, 60, 60] };
  // An external Facet (cells are separate views): endpoint() is an error.
  let externalFacet = $state();
  // Probe helpers: export a plot, then read pixels, color centroids and matches in the page.
  async function image(plot) {
    await plot.whenSettled();
    const png = await plot.exportPNG();
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    // Probe distances, cluster gaps and legend exclusions are CSS pixels. The export
    // remains native resolution; normalize only this test scratch canvas.
    canvas.width = Math.round(bitmap.width / window.devicePixelRatio);
    canvas.height = Math.round(bitmap.height / window.devicePixelRatio);
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const dominant = { red: (r, g, b) => r > g + 90 && r > b + 90, green: (r, g, b) => g > r + 60 && g > b + 60,
      blue: (r, g, b) => b > r + 90 && b > g + 90, magenta: (r, g, b) => r > 150 && b > 150 && g < 90,
      line: (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) > 90 };
    const at = (x, y) => { const i = (Math.round(y) * width + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
    return {
      width, height, at,
      /** Pixels of a dominant color ("red", "green", "blue"), optionally inside [x0, y0, x1, y1]. */
      points(color, box = [0, 0, width, height]) {
        const out = [];
        for (let y = Math.max(0, box[1]); y < Math.min(height, box[3]); y++)
          for (let x = Math.max(0, box[0]); x < Math.min(width, box[2]); x++) {
            const i = (y * width + x) * 4;
            if (dominant[color](data[i], data[i + 1], data[i + 2])) out.push([x, y]);
          }
        return out;
      },
      /** Whether a pixel of `color` lies within `radius` of (x, y). */
      near(x, y, color, radius = 3) {
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const [r, g, b] = at(x + dx, y + dy);
          if (dominant[color](r, g, b)) return true;
        }
        return false;
      },
    };
  }
  /** The client (CSS) point of PNG pixel (x, y) of `plot`'s canvas, for real pointer events. */
  function clientPoint(handle, [x, y], pngWidth) {
    const canvas = handle.getMark().renderer.domElement;
    canvas.scrollIntoView({ block: "center" });
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / pngWidth;
    return [rect.left + x * scale, rect.top + y * scale];
  }
  /** Centroids of the clusters of `color` pixels, sorted by y then x (clusters split by a gap). */
  function clusters(points, gap = 6) {
    const groups = [];
    for (const p of points) {
      const group = groups.find((g) => g.some((q) => Math.abs(q[0] - p[0]) <= gap && Math.abs(q[1] - p[1]) <= gap));
      if (group) group.push(p); else groups.push([p]);
    }
    return groups.map((g) => [g.reduce((s, p) => s + p[0], 0) / g.length, g.reduce((s, p) => s + p[1], 0) / g.length, g.length])
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  // Props AnchorProps does not declare: a label (which must not produce a legend entry) and a
  // picking prop (which is an error).
  const labelled = { label: "Hidden anchor" };
  const pickable = { hover: true };
  onMount(() => {
    window.connectionsFixture = {
      get domainPlot() { return domainPlot; }, get controlPlot() { return controlPlot; },
      get anchor() { return anchor; }, get probe() { return probe; },
      get pickablePlot() { return pickablePlot; },
      get legendPlot() { return legendPlot; }, get legendAnchor() { return legendAnchor; },
      get animatePlot() { return animatePlot; }, get animateAnchor() { return animateAnchor; },
      raiseAnchor: () => { animateRows = { x: [1, 2, 3], y: [8, 8, 8] }; },
      readPosition, image, clusters, clientPoint,
      get before() { return before; }, get leftPoints() { return leftPoints; },
      get beforeAfterPlot() { return beforeAfterPlot; }, get beforeAfterArrows() { return beforeAfterArrows; },
      get tablesPlot() { return tablesPlot; },
      setLeft: (value) => { leftTable = value; }, setRight: (value) => { rightTable = value; },
      setTablesDomain: (value) => { tablesDomain = value; },
      get lastEvent() { return lastEvent; }, get clicks() { return clicks; }, clearClicks: () => { lastEvent = null; clicks = []; },
      get lineErrorPlot() { return lineErrorPlot; },
      get attachPlot() { return attachPlot; },
      get aggregatePlot() { return aggregatePlot; }, get aggregateErrorPlot() { return aggregateErrorPlot; },
      get barPlot() { return barPlot; },
      get parallelPlot() { return parallelPlot; }, get parallelFacet() { return parallelFacet; },
      setParallelFields: (value) => { parallelFields = value; }, setParallelOrder: (value) => { parallelOrder = value; },
      setParallelRows: (value) => { parallelRows = value; },
      get partitionPlot() { return partitionPlot; }, get externalFacet() { return externalFacet; },
      get implicitPlot() { return implicitPlot; },
    };
    return () => { delete window.connectionsFixture; };
  });
</script>

<!-- anchor-domain: the Anchor spans x 0..100 and reaches y 23.7, beyond the probes (40..60);
     it widens the automatic domain, draws nothing, and is not picked. -->
<section data-fixture="anchor-domain">
  <Plot bind:this={domainPlot} name="Anchor domain" width={420} height={320} axes2d autoBounds>
    <Points bind:this={probe} x={[40, 60]} y={[40, 60]} size={5} fill="#00c800" hover respond={false} />
    <Anchor bind:this={anchor} x={[0, 100, 73.3]} y={[50, 50, 23.7]} name="ends" />
  </Plot>
  <Plot bind:this={controlPlot} name="Anchor control" width={420} height={320} axes2d autoBounds>
    <Points x={[40, 60]} y={[40, 60]} size={5} fill="#00c800" />
  </Plot>
</section>

<!-- anchor-legend: a labelled Anchor still has no legend entry. -->
<section data-fixture="anchor-legend">
  <Plot bind:this={legendPlot} width={240} height={160} legend x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Points x={[5]} y={[5]} label="Probe" />
    <Anchor bind:this={legendAnchor} x={[1, 2]} y={[1, 2]} {...labelled} />
  </Plot>
</section>

<!-- anchor-animate: animate() on an Anchor channel moves its live positions on the View clock. -->
<section data-fixture="anchor-animate">
  <Plot bind:this={animatePlot} data={animateRows} width={240} height={160} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Anchor bind:this={animateAnchor} x="x" y={animate("y", { duration: 1200, easing: "linear" })} />
  </Plot>
</section>

<!-- anchor-picking: select/hover/brush on an Anchor is an error naming the fix. -->
<section data-fixture="anchor-picking">
  <Plot bind:this={pickablePlot} width={240} height={160} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Anchor x={[1, 2]} y={[1, 2]} {...pickable} />
  </Plot>
</section>

<!-- before-after: two point marks on one table; Arrows connect each id's before to its after. -->
<section data-fixture="before-after">
  <Plot bind:this={beforeAfterPlot} data={pairs} {...plain}>
    <Points bind:this={before} x="x0" y="y" size={5} fill="#ff0000" respond />
    <Points bind:this={after} x="x1" y="y" size={5} fill="#0000ff" />
    <Arrows3D bind:this={beforeAfterArrows} connections={connect(before, after, { key: "id" })} color="#00c800" width={4} headLength={6} headWidth={5}
      select onclick={recordClick} />
  </Plot>
</section>

<!-- implicit: one table, no key; the after points are sorted (a derived view) and still pair
     with the same observation's before point. -->
<section data-fixture="implicit">
  <Plot bind:this={implicitPlot} data={pairs} {...plain}>
    <Points bind:this={implicitBefore} x="x0" y="y" size={5} fill="#ff0000" />
    <Sort by="x1" order="desc"><Points bind:this={implicitAfter} x="x1" y="y" size={5} fill="#0000ff" /></Sort>
    <Segments connections={connect(implicitBefore, implicitAfter)} color="#00c800" width={4} />
  </Plot>
</section>

<!-- tables: two independent tables matched by an explicit key column. -->
<section data-fixture="tables">
  <Plot bind:this={tablesPlot} {...plain} x={{ domain: tablesDomain }}>
    <Data value={leftTable}><Points bind:this={leftPoints} x="x" y="y" size={5} fill="#ff0000" name="left" /></Data>
    <Data value={rightTable}><Points bind:this={rightPoints} x="x" y="y" size={5} fill="#0000ff" name="right" /></Data>
    <Segments connections={connect(leftPoints, rightPoints, { key: "name" })} color="#00c800" width={4} onclick={recordClick} />
  </Plot>
</section>

<!-- line-error: connections together with x is an error. -->
<section data-fixture="line-error">
  <Plot bind:this={lineErrorPlot} width={200} height={140} x={{ domain: [0, 3] }} y={{ domain: [0, 3] }}>
    <Data value={{ x: [1], y: [1] }}>
      <Anchor bind:this={errorFrom} x="x" y="y" />
      <Anchor bind:this={errorTo} x="x" y="y" />
      <Line x={[1, 2]} y={[1, 2]} connections={connect(errorFrom, errorTo)} />
    </Data>
  </Plot>
</section>

<!-- attachments: label anchor, rect left edge and center, segment start and end. The label's
     connector comes before its endpoints (a forward reference). -->
<section data-fixture="attachments">
  <Plot bind:this={attachPlot} data={attachRow} {...plain}>
    <Segments connections={connect(labelFrom, label)} color="#00c800" width={4} />
    <Points x={[5]} y={[5]} size={4} fill="#ff0000" />
    <Points x={[95]} y={[95]} size={4} fill="#0000ff" />
    <Text bind:this={label} x="labelX" y="labelY" text="text" dx={30} color="#808080" size={14} />
    <Anchor bind:this={labelFrom} x="fromLabelX" y="labelY" />
    <Rect bind:this={rect} x0="rectX0" x1="rectX1" y0="rectY0" y1="rectY1" fill="#808080" />
    <Anchor bind:this={leftFrom} x="leftFromX" y="rectMidY" />
    <Anchor bind:this={centerFrom} x="centerFromX" y="rectMidY" />
    <Segments connections={connect(leftFrom, rect?.endpoint({ at: "left" }))} color="#00c800" width={4} />
    <Segments connections={connect(centerFrom, rect)} color="#00c800" width={4} />
    <Segments bind:this={seg} start={[[40, 30]]} end={[[60, 40]]} color="#808080" width={4} />
    <Anchor bind:this={startFrom} x="startFromX" y="segY0" />
    <Anchor bind:this={endFrom} x="endFromX" y="segY1" />
    <Segments connections={connect(startFrom, seg?.endpoint({ at: "start" }))} color="#00c800" width={4} />
    <Segments connections={connect(endFrom, seg?.endpoint({ at: "end" }))} color="#00c800" width={4} />
  </Plot>
</section>

<!-- aggregate: Histogram bars (an aggregate) connect by an explicit key (their bin edge);
     without a key the connection is an error. -->
<section data-fixture="aggregate">
  <Plot bind:this={aggregatePlot} {...plain} y={{ domain: [0, 10] }}>
    <Data value={samples}><Histogram bind:this={histogram} x="v" bins={[0, 50, 100]} fill="#808080" /></Data>
    <Data value={binTops}><Anchor bind:this={tops} x="x" y="y" /></Data>
    <Segments connections={connect(histogram?.endpoint({ at: "value" }), tops, { key: "x0" })} color="#00c800" width={4} />
    <!-- Calibration points last: the red one sits inside the first bar, and marks draw in the
         order they are written (Stage 22). -->
    <Points x={[5]} y={[0.5]} size={4} fill="#ff0000" />
    <Points x={[95]} y={[9.5]} size={4} fill="#0000ff" />
  </Plot>
  <Plot bind:this={aggregateErrorPlot} width={200} height={140} x={{ domain: [0, 100] }} y={{ domain: [0, 10] }}>
    <Data value={samples}>
      <Histogram bind:this={histogramNoKey} x="v" bins={[0, 50, 100]} name="bins" />
      <Anchor bind:this={topsNoKey} x="v" y="v" />
      <Segments connections={connect(histogramNoKey, topsNoKey)} />
    </Data>
  </Plot>
</section>

<!-- bar: value ends of a positive and a negative bar. -->
<section data-fixture="bar">
  <Plot bind:this={barPlot} {...plain} y={{ domain: [-10, 10] }}>
    <Points x={[5]} y={[-9]} size={4} fill="#ff0000" />
    <Points x={[95]} y={[9]} size={4} fill="#0000ff" />
    <Data value={{ pos: [25, 75], v: [6, -4] }}><Bar bind:this={bar} x="pos" y="v" orientation="vertical" bandFraction={20} fill="#808080" /></Data>
    <Data value={{ pos: [25, 75], y: [9, -9] }}><Anchor bind:this={barEnds} x="pos" y="y" /></Data>
    <Segments connections={connect(bar?.endpoint({ at: "value" }), barEnds, { key: "pos" })} color="#00c800" width={4} />
  </Plot>
</section>

<!-- parallel: parallel coordinates from repeated Anchors in embedded Facet cells (grid layout,
     so each cell owns its y scale). Magenta points mark each cell's anchors; lines take the
     species color. -->
<section data-fixture="parallel">
  <Plot bind:this={parallelPlot} legend={false} data={parallelRows} width={480} height={300} toneMapping={0} axes2d={false}>
    <Fold fields={parallelFields}>
      <Facet bind:this={parallelFacet} column="key" scales="free-y" layout="grid" columnOrder={parallelOrder}>
        <Anchor x={0} y="value" name="values" />
        <Points x={0} y="value" size={7} fill="#ff00ff" />
      </Facet>
      <Line connections={connect(parallelFacet?.endpoint("values"), { key: "id" })} color="species" colorScale={species} width={3} />
    </Fold>
  </Plot>
</section>

<!-- partition: partition.endpoint("tip") selects the Anchor repeated in each group; a Line joins
     each id across the groups in group order. -->
<section data-fixture="partition">
  <Plot bind:this={partitionPlot} data={partitionRows} {...plain}>
    <Points x={[5]} y={[5]} size={4} fill="#ff0000" />
    <Points x={[95]} y={[95]} size={4} fill="#0000ff" />
    <Partition bind:this={partition} by="group">
      <Anchor x="x" y="y" name="tip" />
    </Partition>
    <Line connections={connect(partition?.endpoint("tip"), { key: "id" })} color="#00c800" width={4} />
  </Plot>
</section>

<!-- external-facet: a Facet outside a Plot has no shared view to connect in. -->
<section data-fixture="external-facet">
  <Data value={{ g: ["a", "b"], x: [1, 2], y: [1, 2] }}>
    <Facet bind:this={externalFacet} column="g">
      <Plot width={120} height={90}><Anchor x="x" y="y" name="tip" /></Plot>
    </Facet>
  </Data>
</section>
