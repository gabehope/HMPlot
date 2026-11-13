<script>
  // Connection fixtures, chunk C (the live gather): connectors that follow animated, procedural,
  // frame-mapped, displaced, hidden, offscreen and 3D endpoints. Handles are on
  // window.connectionsLive; readField reads a mark's live GPU rows, mapped() maps a data point
  // through a mark's frame chain (and placement) to world coordinates.
  import { onMount } from "svelte";
  import { Plot, Data, Anchor, Points, Points3D, Segments, Arrows3D, Line, Frame, Dodge, Facet, Force, Tree, Nodes, Filter, Partition, connect, animate, categorical, add, multiply, sin, divide, greater, GraphData } from "$lib/index";
import { BoxPlot } from "$lib/charts/index.js";
  import { framePoint } from "$lib/plot/utils/framePlacement.js";
  import { page } from "$app/state";

  // `?only=frame,dodge` mounts just those blocks: a test measuring GPU work (T5) or running a
  // Force simulation must not share the device with every other block.
  const only = page.url.searchParams.get("only")?.split(",") ?? null;
  const show = (block) => !only || only.includes(block);

  const plain = { width: 320, height: 240, toneMapping: 0, axes2d: false, x: { domain: [0, 100] }, y: { domain: [0, 100] } };
  /** Every row of a mark's live field buffer (`name`), as arrays of `width` components. */
  async function readField(handle, name = "position", width = 3) {
    const mark = handle.getMark?.() ?? handle;
    const field = mark.fields.get(name), attribute = field?.bufferNodeSource;
    if (!field?.isBufferNode || !attribute) return null;
    const renderer = mark.renderer, device = renderer.backend.device;
    const gpu = renderer.backend.get(attribute).buffer;
    const count = field.count, stride = attribute.itemSize, bytes = Math.max(16, count * stride * 4);
    const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpu, 0, staging, 0, count * stride * 4);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const values = Array.from(new Float32Array(staging.getMappedRange()));
    staging.destroy();
    return Array.from({ length: count }, (_, i) => values.slice(i * stride, i * stride + width));
  }
  const mapped = (handle, point) => framePoint((handle.getMark?.() ?? handle).options, point);

  // follow: an Anchor animates y (linear, 1200 ms); a Segments and a Line connect it to fixed points.
  let followPlot = $state(), moving = $state(), fixed = $state(), followSegments = $state(), followLine = $state();
  let followRows = $state({ id: [1, 2, 3], x: [2, 5, 8], y: [1, 1, 1], top: [9, 9, 9] });
  // procedural: an Anchor whose y is an @time expression (its own View, whose clock never stops).
  let orbitPlot = $state(), orbit = $state(), orbitTarget = $state(), orbitSegments = $state();
  const orbitRows = { id: [1, 2], x: [3, 7], top: [9, 9] };
  // frame: an Anchor inside a range Frame; the connector at the Plot follows the frame's range.
  let framePlot = $state(), frameAnchor = $state(), frameTarget = $state(), frameSegments = $state(), innerFrame = $state();
  let frameRange = $state([10, 60]);
  const frameRows = { id: [1, 2], x: [2, 8], y: [3, 7], tx: [95, 95], ty: [10, 90] };
  // dodge: three points at one position, displaced by Dodge (pixel dy, 16 px apart); connectors to Anchors.
  let dodgePlot = $state(), dodgePoints = $state(), dodgeEnds = $state(), dodgeSegments = $state();
  const dodgeRows = { id: [1, 2, 3], x: [60, 60, 60], y: [50, 50, 50], ex: [10, 10, 10], ey: [20, 50, 80] };
  // hide: categorical points; hiding a category in the legend breaks its connector.
  let hidePlot = $state(), hidePoints = $state(), hideEnds = $state();
  const hideRows = { id: [1, 2, 3], kind: ["a", "b", "c"], x0: [10, 10, 10], x1: [90, 90, 90], y: [20, 50, 80] };
  const hideColors = categorical({ domain: ["a", "b", "c"], range: ["#ff0000", "#ff00ff", "#0000ff"] });
  // offscreen: the Anchor lies beyond the x domain; the visible part of the connector still draws.
  let offPlot = $state(), offStart = $state(), offEnd = $state();
  // chord: a 3D Plot; a chord between two Points3D points and one to an Anchor in a placed Frame.
  let chordPlot = $state(), chordA = $state(), chordB = $state(), placedAnchor = $state(), chordSegments = $state(), placedSegments = $state();
  // replace: two point marks on a keyed table; replacing the table re-pairs the arrows.
  let replacePlot = $state(), replaceBefore = $state(), replaceAfter = $state();
  let replaceRows = $state({ id: [1, 2, 3], x0: [10, 15, 20], x1: [80, 85, 90], y: [20, 50, 80] });
  // box: BoxPlot quartile and median attachments.
  let boxPlotPlot = $state(), box = $state(), boxTops = $state(), q1Segments = $state(), medianSegments = $state(), q3Segments = $state();
  const boxRows = { g: ["a", "a", "a", "a", "a", "b", "b", "b", "b", "b"], v: [1, 2, 3, 4, 5, 5, 6, 7, 8, 9] };
  // curves: a catmull-rom Line and a dashed Segments on connections.
  let curvePlot = $state(), curveLine = $state(), dashSegments = $state();
  let ca = $state(), cb = $state(), cc = $state();
  const curveRows = { id: [1], x0: [10], y0: [20], x1: [50], y1: [80], x2: [90], y2: [20], dy: [50] };
  // facet-pairs: a repeated Anchor in an embedded <Facet pairs=> matrix (2 x 2 cells, grid layout);
  // facet order visits the cells row-major: (a, a), (a, b), (b, a), (b, b).
  let facetPairsPlot = $state(), facetPairsFacet = $state(), facetPairsLine = $state();
  const pairRows = { id: [1, 2], a: [0, 10], b: [0, 10] };
  // force / tree: graph layouts displace their Nodes; connectors key them to Anchors by node id.
  let forceLayout = $state(), forcePlot = $state(), forcePoints = $state(), forceEnds = $state(), forceSegments = $state();
  const forceGraph = { source: ["A", "A", "B"], target: ["B", "C", "C"] };
  const forceAnchors = { id: ["A", "B", "C"], ax: [-80, 0, 80], ay: [-80, -80, -80] };
  let treePlot = $state(), treePoints = $state(), treeEnds = $state(), treeSegments = $state();
  const treeGraph = { source: ["R", "R"], target: ["L", "M"] };
  const treeAnchors = { id: ["R", "L", "M"], ax: [-2.5, -2.5, 2.5], ay: [0.5, -2.5, -2.5] };
  // filter: the start points show the table through a Filter (x0 > threshold); without a key the
  // connectors match by source observation, so filtered-out rows have no connector.
  let filterPlot = $state(), filterBefore = $state(), filterAfter = $state(), filterSegments = $state();
  let filterThreshold = $state(15);
  const filterRows = { id: [1, 2, 3], x0: [10, 20, 30], x1: [80, 85, 90], y: [20, 50, 80] };
  // hover: a shared-owner connector that responds to hover (fades the other rows); hover changes
  // must not re-prepare the connection or compile programs.
  let hoverPlot = $state(), hoverData = $state(), hoverFrom = $state(), hoverTo = $state(), hoverSegments = $state();
  const hoverRows = { id: [1, 2, 3], x0: [10, 10, 10], x1: [90, 90, 90], y: [20, 50, 80] };
  // facet-partition: an Anchor repeated per Partition group inside each embedded Facet cell;
  // facet order (the default for one repeated endpoint) visits cell by cell, and the groups in
  // order within each cell.
  let fpPlot = $state(), fpFacet = $state(), fpLine = $state();
  const fpRows = { id: [1, 1, 1, 1], c: ["L", "L", "R", "R"], g: ["p", "q", "p", "q"], x: [2, 8, 2, 8], y: [2, 8, 2, 8] };
  // each-frames: wide parallel coordinates, one Frame per field written in an {#each} (not a
  // Facet), an unnamed Points in each. The four bind:this handles are four endpoints,
  // not one repeated definition; one of them alone has nothing to connect.
  let eachPlot = $state(), eachLine = $state(), eachSingle = $state(false);
  const eachAxes = $state([]);
  const eachFields = ["a", "b", "c", "d"];
  const eachRows = { id: [1, 2, 3], zero: [0, 0, 0], a: [1, 2, 3], b: [30, 20, 10], c: [5, 7, 6], d: [0.1, 0.3, 0.2] };
  const eachDomain = (field) => [Math.min(...eachRows[field]) - 1, Math.max(...eachRows[field]) + 1];

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
      blue: (r, g, b) => b > r + 90 && b > g + 90, magenta: (r, g, b) => r > 150 && b > 150 && g < 90 };
    const at = (x, y) => { const i = (Math.round(y) * width + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
    return {
      width, height,
      points(color, box = [0, 0, width, height]) {
        const out = [];
        for (let y = Math.max(0, box[1]); y < Math.min(height, box[3]); y++)
          for (let x = Math.max(0, box[0]); x < Math.min(width, box[2]); x++) {
            const i = (y * width + x) * 4;
            if (dominant[color](data[i], data[i + 1], data[i + 2])) out.push([x, y]);
          }
        return out;
      },
      near(x, y, color, radius = 3) {
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const [r, g, b] = at(x + dx, y + dy);
          if (dominant[color](r, g, b)) return true;
        }
        return false;
      },
    };
  }
  function clusters(points, gap = 6) {
    const groups = [];
    for (const p of points) {
      const group = groups.find((g) => g.some((q) => Math.abs(q[0] - p[0]) <= gap && Math.abs(q[1] - p[1]) <= gap));
      if (group) group.push(p); else groups.push([p]);
    }
    return groups.map((g) => [g.reduce((s, p) => s + p[0], 0) / g.length, g.reduce((s, p) => s + p[1], 0) / g.length, g.length])
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  onMount(() => {
    window.connectionsLive = {
      readField, mapped, image, clusters,
      get followPlot() { return followPlot; }, get moving() { return moving; }, get fixed() { return fixed; },
      get followSegments() { return followSegments; }, get followLine() { return followLine; },
      raise: () => { followRows = { ...followRows, y: [6, 6, 6] }; },
      get orbitPlot() { return orbitPlot; }, get orbit() { return orbit; }, get orbitTarget() { return orbitTarget; },
      get orbitSegments() { return orbitSegments; },
      get framePlot() { return framePlot; }, get frameAnchor() { return frameAnchor; }, get frameTarget() { return frameTarget; },
      get frameSegments() { return frameSegments; }, get innerFrame() { return innerFrame; },
      setFrameRange: (value) => { frameRange = value; },
      get dodgePlot() { return dodgePlot; }, get dodgePoints() { return dodgePoints; }, get dodgeEnds() { return dodgeEnds; },
      get dodgeSegments() { return dodgeSegments; },
      get hidePlot() { return hidePlot; }, get hidePoints() { return hidePoints; },
      get offPlot() { return offPlot; }, get offStart() { return offStart; }, get offEnd() { return offEnd; },
      get chordPlot() { return chordPlot; }, get chordA() { return chordA; }, get chordB() { return chordB; },
      get placedAnchor() { return placedAnchor; }, get chordSegments() { return chordSegments; }, get placedSegments() { return placedSegments; },
      get replacePlot() { return replacePlot; }, get replaceBefore() { return replaceBefore; }, get replaceAfter() { return replaceAfter; },
      setReplaceRows: (value) => { replaceRows = value; },
      get boxPlotPlot() { return boxPlotPlot; }, get box() { return box; }, get boxTops() { return boxTops; },
      get q1Segments() { return q1Segments; }, get medianSegments() { return medianSegments; }, get q3Segments() { return q3Segments; },
      get curvePlot() { return curvePlot; }, get curveLine() { return curveLine; }, get dashSegments() { return dashSegments; },
      get hideEnds() { return hideEnds; },
      get facetPairsPlot() { return facetPairsPlot; }, get facetPairsFacet() { return facetPairsFacet; }, get facetPairsLine() { return facetPairsLine; },
      get forceLayout() { return forceLayout; }, get forcePlot() { return forcePlot; }, get forcePoints() { return forcePoints; },
      get forceSegments() { return forceSegments; },
      get treePlot() { return treePlot; }, get treePoints() { return treePoints; }, get treeSegments() { return treeSegments; },
      get filterPlot() { return filterPlot; }, get filterBefore() { return filterBefore; }, get filterAfter() { return filterAfter; },
      get filterSegments() { return filterSegments; }, setFilterThreshold: (value) => { filterThreshold = value; },
      get hoverPlot() { return hoverPlot; }, get hoverData() { return hoverData; }, get hoverSegments() { return hoverSegments; },
      get fpPlot() { return fpPlot; }, get fpFacet() { return fpFacet; }, get fpLine() { return fpLine; },
      get eachPlot() { return eachPlot; }, get eachLine() { return eachLine; }, eachAxes, eachFields, eachRows,
      setEachSingle: (value) => { eachSingle = value; },
    };
    return () => { delete window.connectionsLive; };
  });
</script>

{#if show("follow")}
<section data-fixture="follow">
  <Plot bind:this={followPlot} data={followRows} {...plain} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Anchor bind:this={moving} x="x" y={animate("y", { duration: 1200, easing: "linear" })} />
    <Points bind:this={fixed} x="x" y="top" size={4} fill="#ff0000" />
    <Segments bind:this={followSegments} connections={connect(moving, fixed, { key: "id" })} color="#00c800" width={3} />
    <Line bind:this={followLine} connections={connect(fixed, moving, { key: "id" })} color="#0000ff" width={2} />
  </Plot>
</section>
{/if}

{#if show("procedural")}
<section data-fixture="procedural">
  <Plot bind:this={orbitPlot} data={orbitRows} {...plain} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Anchor bind:this={orbit} x="x" y={add(5, multiply(3, sin(divide("@time", 500))))} />
    <Points bind:this={orbitTarget} x="x" y="top" size={4} fill="#ff0000" />
    <Segments bind:this={orbitSegments} connections={connect(orbit, orbitTarget, { key: "id" })} color="#00c800" width={3} />
  </Plot>
</section>
{/if}

{#if show("frame")}
<section data-fixture="frame">
  <Plot bind:this={framePlot} data={frameRows} {...plain}>
    <Points bind:this={frameTarget} x="tx" y="ty" size={4} fill="#0000ff" />
    <Frame bind:this={innerFrame} x={{ domain: [0, 10], range: frameRange }} y={{ domain: [0, 10], range: [10, 90] }}>
      <Anchor bind:this={frameAnchor} x="x" y="y" />
      <Points x="x" y="y" size={4} fill="#ff0000" />
    </Frame>
    <Segments bind:this={frameSegments} connections={connect(frameAnchor, frameTarget, { key: "id" })} color="#00c800" width={3} />
  </Plot>
</section>
{/if}

{#if show("dodge")}
<section data-fixture="dodge">
  <Plot bind:this={dodgePlot} data={dodgeRows} {...plain}>
    <Dodge x="x" axis="y" as="lift" padding={10}>
      <Points bind:this={dodgePoints} x="x" y="y" dy="lift" size={6} fill="#ff0000" />
    </Dodge>
    <Anchor bind:this={dodgeEnds} x="ex" y="ey" />
    <Segments bind:this={dodgeSegments} connections={connect(dodgePoints, dodgeEnds, { key: "id" })} color="#00c800" width={2} />
  </Plot>
</section>
{/if}

{#if show("hide")}
<section data-fixture="hide">
  <Plot bind:this={hidePlot} data={hideRows} {...plain} legend>
    <Points bind:this={hidePoints} x="x0" y="y" fill="kind" fillScale={hideColors} size={5} />
    <Anchor bind:this={hideEnds} x="x1" y="y" />
    <Segments connections={connect(hidePoints, hideEnds, { key: "id" })} color="#00c800" width={3} />
  </Plot>
</section>
{/if}

{#if show("offscreen")}
<section data-fixture="offscreen">
  <Plot bind:this={offPlot} data={{ id: [1], x0: [20], x1: [80], y: [50] }} {...plain} x={{ domain: [0, 50] }}>
    <Points x={[5]} y={[10]} size={4} fill="#0000ff" />
    <Points x={[45]} y={[90]} size={4} fill="#0000ff" />
    <Points bind:this={offStart} x="x0" y="y" size={4} fill="#ff0000" />
    <Anchor bind:this={offEnd} x="x1" y="y" />
    <Segments connections={connect(offStart, offEnd, { key: "id" })} color="#00c800" width={3} />
  </Plot>
</section>
{/if}

{#if show("chord")}
<section data-fixture="chord">
  <Plot bind:this={chordPlot} type="3d" width={320} height={240} toneMapping={0}
    x={{ domain: [0, 10] }} y={{ domain: [0, 10] }} z={{ domain: [0, 10] }}>
    <Data value={{ id: [1], a: [1], b: [9], c: [5], lo: [2] }}>
      <Points3D bind:this={chordA} x="a" y="a" z="a" size={10} fill="#ff0000" />
      <Points3D bind:this={chordB} x="b" y="b" z="b" size={10} fill="#0000ff" />
      <Segments bind:this={chordSegments} connections={connect(chordA, chordB, { key: "id" })} color="#00c800" width={4} />
      <Frame placement={{ anchor: [2, 8, 5], size: [3, 3, 3] }} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }} z={{ domain: [0, 10] }}>
        <Anchor bind:this={placedAnchor} x="c" y="c" z="lo" />
        <Points3D x="c" y="c" z="lo" size={10} fill="#ff00ff" />
      </Frame>
      <Segments bind:this={placedSegments} connections={connect(chordB, placedAnchor, { key: "id" })} color="#00c800" width={4} />
    </Data>
  </Plot>
</section>
{/if}

{#if show("replace")}
<section data-fixture="replace">
  <Plot bind:this={replacePlot} {...plain}>
    <Data value={replaceRows} key="id">
      <Points bind:this={replaceBefore} x="x0" y="y" size={5} fill="#ff0000" />
      <Points bind:this={replaceAfter} x="x1" y="y" size={5} fill="#0000ff" />
      <Arrows3D connections={connect(replaceBefore, replaceAfter)} color="#00c800" width={3} headLength={6} headWidth={5} />
    </Data>
  </Plot>
</section>
{/if}

{#if show("box")}
<section data-fixture="box">
  <Plot bind:this={boxPlotPlot} {...plain} y={{ domain: [0, 10] }}>
    <Data value={boxRows}><BoxPlot bind:this={box} x="g" y="v" outliers={false} /></Data>
    <Data value={{ g: ["a", "b"], top: [9.5, 9.5] }}><Anchor bind:this={boxTops} x="g" y="top" /></Data>
    <Segments bind:this={q1Segments} connections={connect(box?.endpoint({ at: "q1" }), boxTops, { key: "g" })} color="#00c800" width={2} />
    <Segments bind:this={medianSegments} connections={connect(box?.endpoint({ at: "median" }), boxTops, { key: "g" })} color="#00c800" width={2} />
    <Segments bind:this={q3Segments} connections={connect(box?.endpoint({ at: "q3" }), boxTops, { key: "g" })} color="#00c800" width={2} />
  </Plot>
</section>
{/if}

{#if show("curves")}
<section data-fixture="curves">
  <Plot bind:this={curvePlot} data={curveRows} {...plain}>
    <Points x={[5]} y={[5]} size={4} fill="#ff0000" />
    <Points x={[95]} y={[95]} size={4} fill="#0000ff" />
    <Anchor bind:this={ca} x="x0" y="y0" />
    <Anchor bind:this={cb} x="x1" y="y1" />
    <Anchor bind:this={cc} x="x2" y="y2" />
    <Line bind:this={curveLine} connections={connect(ca, cb, cc, { key: "id" })} curve="catmull-rom" color="#00c800" width={3} />
    <Segments bind:this={dashSegments} connections={connect(ca, cc, { key: "id" })} dash={8} color="#0000ff" width={3} />
  </Plot>
</section>
{/if}

{#if show("facet-pairs")}
<section data-fixture="facet-pairs">
  <Plot bind:this={facetPairsPlot} data={pairRows} width={320} height={320} toneMapping={0} axes2d={false}>
    <Facet bind:this={facetPairsFacet} pairs={["a", "b"]}>
      <Anchor x="x" y="y" name="cell" />
      <Points x="x" y="y" size={4} fill="#ff00ff" />
    </Facet>
    <Line bind:this={facetPairsLine} connections={connect(facetPairsFacet?.endpoint("cell"), { key: "id" })} color="#00c800" width={2} />
  </Plot>
</section>
{/if}

{#if show("force")}
<section data-fixture="force">
  <Data value={forceGraph}>
    <GraphData source="source" target="target"><Force bind:this={forceLayout}   dimensions={2}>
      <Plot bind:this={forcePlot} {...plain} x={{ domain: [-100, 100] }} y={{ domain: [-100, 100] }}>
        <Nodes><Points bind:this={forcePoints} position="position" size={5} fill="#ff0000" /></Nodes>
        <Data value={forceAnchors}><Anchor bind:this={forceEnds} x="ax" y="ay" /></Data>
        <Segments bind:this={forceSegments} connections={connect(forcePoints, forceEnds, { key: "id" })} color="#00c800" width={2} />
      </Plot>
    </Force></GraphData>
  </Data>
</section>
{/if}

{#if show("tree")}
<section data-fixture="tree">
  <Data value={treeGraph}>
    <GraphData source="source" target="target"><Tree   root="R">
      <Plot bind:this={treePlot} {...plain} x={{ domain: [-3, 3] }} y={{ domain: [-3, 1] }}>
        <Nodes><Points bind:this={treePoints} position="position" size={5} fill="#ff0000" /></Nodes>
        <Data value={treeAnchors}><Anchor bind:this={treeEnds} x="ax" y="ay" /></Data>
        <Segments bind:this={treeSegments} connections={connect(treePoints, treeEnds, { key: "id" })} color="#00c800" width={2} />
      </Plot>
    </Tree></GraphData>
  </Data>
</section>
{/if}

{#if show("filter")}
<section data-fixture="filter">
  <Plot bind:this={filterPlot} {...plain}>
    <Data value={filterRows} key="id">
      <Filter where={greater("x0", filterThreshold)}>
        <Points bind:this={filterBefore} x="x0" y="y" size={5} fill="#ff0000" />
      </Filter>
      <Points bind:this={filterAfter} x="x1" y="y" size={5} fill="#0000ff" />
      <Segments bind:this={filterSegments} connections={connect(filterBefore, filterAfter)} color="#00c800" width={3} />
    </Data>
  </Plot>
</section>
{/if}

{#if show("hover")}
<section data-fixture="hover">
  <Plot bind:this={hoverPlot} {...plain}>
    <Data bind:this={hoverData} value={hoverRows} key="id">
      <Points bind:this={hoverFrom} x="x0" y="y" size={5} fill="#ff0000" />
      <Points bind:this={hoverTo} x="x1" y="y" size={5} fill="#0000ff" />
      <Segments bind:this={hoverSegments} connections={connect(hoverFrom, hoverTo)} respond="hovered" selectionOpacity={0.1}
        color="#00c800" width={3} />
    </Data>
  </Plot>
</section>
{/if}

{#if show("facet-partition")}
<section data-fixture="facet-partition">
  <Plot bind:this={fpPlot} data={fpRows} width={320} height={240} toneMapping={0} axes2d={false}>
    <Facet bind:this={fpFacet} column="c">
      <Partition by="g">
        <Anchor x="x" y="y" name="tip" />
      </Partition>
    </Facet>
    <Line bind:this={fpLine} connections={connect(fpFacet?.endpoint("tip"), { key: "id" })} color="#00c800" width={2} />
  </Plot>
</section>
{/if}

{#if show("each-frames")}
<section data-fixture="each-frames">
  <Plot bind:this={eachPlot} data={eachRows} {...plain}>
    {#each eachFields as field, i}
      <Frame x={{ domain: [0, 1], range: [10 + i * 25, 11 + i * 25] }} y={{ domain: eachDomain(field), range: [10, 90] }}>
        <Points bind:this={eachAxes[i]} x="zero" y={field} size={4} fill="#ff00ff" />
      </Frame>
    {/each}
    <Line bind:this={eachLine} connections={eachSingle ? connect(eachAxes[0]) : connect(...eachFields.map((_, i) => eachAxes[i]))}
      color="#00c800" width={2} />
  </Plot>
</section>
{/if}
