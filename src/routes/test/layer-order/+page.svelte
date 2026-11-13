<script>
  // Stage 22: declaration order decides which of two coplanar 2D marks is on top, whatever
  // their vertex path, queue (opaque or translucent), or creation order. Handles are on
  // window.layerOrder. Colors: red #ff0000 reference, blue #0000ff mark, green #00ff00 third.
  import { onMount } from "svelte";
  import { Plot, Frame, Facet, Rect, Prism, Text3D, Points, Segments, Line,  Area, Heatmap, Image, Text, Arrows3D, GeoJSON, Anchor, Data, DAG, Nodes, Edges, Routes, connect, continuous, GraphData } from "$lib/index";
import { ErrorBars } from "$lib/charts/index.js";
  import { registryOf, isLayeredScene, renderListsHooked } from "$lib/plot/utils/layerOrder.js";

  const blue = [[[0, 0, 1], [0, 0, 1]], [[0, 0, 1], [0, 0, 1]]];
  const solid = (color) => continuous({ domain: [0, 1], colormap: { colors: [color, color], space: "srgb" } });
  const blueScale = solid("#0000ff"), whiteScale = solid("#ffffff");
  const square = { type: "Feature", properties: {}, geometry: { type: "Polygon",
    coordinates: [[[20, 30], [80, 30], [80, 70], [20, 70], [20, 30]]] } };
  const common = { width: 240, height: 160, axes2d: false, toneMapping: 0,
    x: { domain: [0, 100] }, y: { domain: [0, 100] } };
  const angles = [0, 30, 60, 90, 120, 150, 180];

  // One case per vertex path: `mark` is the blue mark; `ref` overrides the red reference.
  const CASES = [
    { name: "rect", mark: rectMark }, { name: "points", mark: pointsMark }, { name: "scatter2d", mark: scatter2dMark },
    { name: "segments", mark: segmentsMark }, { name: "line", mark: lineMark }, { name: "links", mark: linksMark },
    { name: "curved", mark: curvedMark }, { name: "ribbon", mark: ribbonMark }, { name: "area", mark: areaMark },
    { name: "heatmap", mark: heatmapMark }, { name: "image", mark: imageMark }, { name: "text", mark: textMark },
    { name: "label", mark: labelMark }, { name: "arrows", mark: arrowsMark }, { name: "errorbars", mark: errorbarsMark },
    { name: "geojson", mark: geojsonMark }, { name: "frameRange", mark: frameRangeMark },
    { name: "frameAnchored", mark: frameAnchoredMark },
    { name: "frameLog", mark: frameLogMark, ref: frameLogRef, plot: { x: { domain: [1, 1000], transform: "log" } } },
    { name: "facet", mark: facetMark, plot: { data: { group: ["A", "B"] } } },
    { name: "connection", mark: connectionMark, plot: { data: { x0: [20], x1: [80], y: [50] } } },
    { name: "polar", mark: polarMark, ref: polarRef, plot: { coordinates: "polar",
      baseRadius: 0, radialScale: 1, x: { domain: [0, 360] }, y: { domain: [0, 3] } } },
    // TODO 32.13: marks without a render fixture before: a polar Rect (drawn by PolarRect), a
    // flat Prism and Text3D with tex. (Flow draws only under Edges; the Sankey example renders it.)
    { name: "polarRect", mark: polarRectMark, ref: polarRef, plot: { coordinates: "polar",
      baseRadius: 0, radialScale: 1, x: { domain: [0, 360] }, y: { domain: [0, 3] } } },
    { name: "prism", mark: prismMark }, { name: "tex", mark: texMark },
  ];
  let plots = $state({}), refs = $state({}), handles = $state({});
  let orders = $state(Object.fromEntries(CASES.map((c) => [c.name, ["ref", "mark"]])));
  let fromAnchor = $state(), toAnchor = $state();

  // Gated plot: A (opaque Rect), B (translucent Area band), C (opaque points), declared in that
  // order; the test releases the gates in reverse, so creation order is C, B, A.
  let gates = $state({ A: false, B: false, C: false }), gatedOrder = $state(["A", "B", "C"]);
  const clicks = [];
  // DAG: routed edges (red) and nodes (blue); `dagOrder` is the declaration order.
  const edges = { source: ["a", "a", "b", "c"], target: ["b", "c", "d", "d"] };
  const nodes = { id: ["a", "b", "c", "d"] };
  let dagOrder = $state(["edges", "nodes"]);
  // 2D/3D switching and a surface chart (a heatmap's child texture scene).
  let viewType = $state("2d"), surfaceOrder = $state(["ribbon", "rect"]);

  function sceneOf(object) { let o = object; while (o.parent) o = o.parent; return o; }
  // Marks, not grid and rule layers (which leave the minimap: omitOverview). Labels leave it too
  // (TODO 61) but are marks.
  const isDrawing = (o) => o.material && (!o.userData?.omitOverview || o.exportKind === "labels") && (o.isPlotObject || o.options);
  function objects(name) {
    const ref = refs[name]?.getMark?.();
    if (!ref) throw Error(`${name}: no reference mark`);
    const others = [];
    sceneOf(ref).traverse((o) => { if (o !== ref && isDrawing(o)) others.push(o); });
    return { ref, others, scene: sceneOf(ref) };
  }
  const frames = (n) => new Promise((resolve) => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : resolve()); step(); });
  async function settle(plot) { await plot.whenSettled(); await frames(4); }
  /** Masks: hide the reference or the mark (visibility only; order is untouched). */
  async function show(name, which) {
    const { ref, others } = objects(name);
    ref.visible = which !== "mark";
    for (const o of others) o.visible = which !== "ref";
    ref.invalidate?.();
    await settle(plots[name]);
  }
  async function setOrder(name, order) {
    if (name === "gated") gatedOrder = order;
    else if (name === "dag") dagOrder = order;
    else if (name === "surface") surfaceOrder = order;
    else orders[name] = order;
    await settle(plots[name]);
  }
  function info(name) {
    const mark = name === "gated" ? handles.A?.getMark() ?? handles.C?.getMark() : name === "dag" ? handles.dagNodes?.getMark()
      : name === "mode" ? handles.mode?.getMark() : name === "surface" ? handles.surfaceRect?.getMark() : refs[name]?.getMark();
    const scene = sceneOf(mark), renderer = mark.renderer, registry = registryOf(scene);
    return { layered: isLayeredScene(scene), hooked: renderListsHooked(renderer, scene, mark.view.picking.camera.current()),
      sorts: registry?.sorts ?? 0, slots: registry?.slots.length ?? 0,
      ordered: registry?.ordered().map((o) => ({ type: o.constructor.name, renderOrder: o.renderOrder })) ?? [] };
  }
  async function exportPixels(name) {
    const png = await plots[name].exportPNG(), bitmap = await createImageBitmap(png);
    return decode(bitmap);
  }
  async function decodeBase64(b64) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return decode(await createImageBitmap(new Blob([bytes], { type: "image/png" })));
  }
  function decode(bitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    return { data: Array.from(data), width, height };
  }
  onMount(() => {
    window.layerOrder = {
      get plots() { return plots; }, get handles() { return handles; }, cases: CASES.map((c) => c.name),
      clicks, show, setOrder, info, exportPixels, decodeBase64, settle,
      open: async (gate) => { gates[gate] = true; await settle(plots.gated); },
      close: async (gate) => { gates[gate] = false; await settle(plots.gated); },
      setType: async (type) => { viewType = type; await settle(plots.mode); },
    };
    return () => { delete window.layerOrder; };
  });
</script>

{#snippet reference(name)}<Rect bind:this={refs[name]} x0={[0]} x1={[50]} y0={[0]} y1={[100]} fill="#ff0000" />{/snippet}
{#snippet frameLogRef(name)}<Rect bind:this={refs[name]} x0={[1]} x1={[31.6]} y0={[0]} y1={[100]} fill="#ff0000" />{/snippet}
{#snippet polarRef(name)}<Line bind:this={refs[name]} x={angles} y={angles.map(() => 2)} width={24} color="#ff0000" />{/snippet}
{#snippet rectMark()}<Rect x0={[20]} x1={[80]} y0={[30]} y1={[70]} fill="#0000ff" />{/snippet}
{#snippet pointsMark()}<Points position={[[30, 50], [45, 50], [60, 50]]} size={15} fill="#0000ff" />{/snippet}
{#snippet scatter2dMark()}<Points x={[30, 45, 60]} y={[50, 50, 50]} size={15} fill="#0000ff" />{/snippet}
{#snippet segmentsMark()}<Segments start={[[20, 50]]} end={[[80, 50]]} color="#0000ff" width={16} />{/snippet}
{#snippet lineMark()}<Line position={[[20, 40], [80, 60]]} color="#0000ff" width={16} />{/snippet}
{#snippet linksMark()}<Segments start={[[20, 30]]} end={[[80, 70]]} color="#0000ff" width={16} />{/snippet}
{#snippet curvedMark()}<Segments start={[[20, 30]]} end={[[80, 70]]} control1={[[80, 30]]} control2={[[20, 70]]} curve="cubic" color="#0000ff" width={16} />{/snippet}
{#snippet ribbonMark()}<Area x={[20, 80]} lower={[30, 30]} upper={[70, 70]} fill="#0000ff" opacity={1} />{/snippet}
{#snippet areaMark()}<Area x={[20, 80]} upper={[70, 70]} lower={30} fill="#0000ff" opacity={1} />{/snippet}
{#snippet heatmapMark()}<Heatmap fill={[[0.5, 0.5], [0.5, 0.5]]} fillScale={blueScale} />{/snippet}
{#snippet imageMark()}<Image data={blue} pixelated />{/snippet}
{#snippet textMark()}<Text3D position={[50, 50]} text="MMM" size={30} color="#0000ff" />{/snippet}
{#snippet labelMark()}<Text x={[50]} y={[50]} text={["MMM"]} size={40} color="#0000ff" />{/snippet}
{#snippet arrowsMark()}<Arrows3D start={[[20, 50]]} end={[[80, 50]]} color="#0000ff" width={16} />{/snippet}
{#snippet errorbarsMark()}<ErrorBars x={[30, 50, 70]} y={[50, 50, 50]} lower={[20, 20, 20]} upper={[80, 80, 80]} color="#0000ff" width={16} />{/snippet}
{#snippet geojsonMark()}<GeoJSON data={square} fill="#0000ff" />{/snippet}
{#snippet frameRangeMark()}<Frame x={{ domain: [0, 10], range: [20, 80] }} y={{ domain: [0, 10], range: [30, 70] }}>
  <Rect x0={[0]} x1={[10]} y0={[0]} y1={[10]} fill="#0000ff" /></Frame>{/snippet}
{#snippet frameAnchoredMark()}<Frame placement={{ anchor: [50, 50], size: [120, 70] }} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
  <Rect x0={[0]} x1={[10]} y0={[0]} y1={[10]} fill="#0000ff" /></Frame>{/snippet}
{#snippet frameLogMark()}<Frame x={{ domain: [0, 100], range: [3, 300] }} y={{ domain: [0, 100], range: [30, 70] }}>
  <Rect x0={[0]} x1={[100]} y0={[0]} y1={[100]} fill="#0000ff" /></Frame>{/snippet}
{#snippet facetMark()}<Facet column="group"><Rect x0={[0]} x1={[100]} y0={[30]} y1={[70]} fill="#0000ff" /></Facet>{/snippet}
{#snippet connectionMark()}<Segments connections={connect(fromAnchor, toAnchor)} color="#0000ff" width={16} />{/snippet}
{#snippet polarRectMark()}<Rect x0={[20]} x1={[160]} y0={[1.5]} y1={[2.5]} fill="#0000ff" />{/snippet}
{#snippet prismMark()}<Prism x={[50]} y={[50]} width={60} depth={40} z0={0} z1={0} fill="#0000ff" />{/snippet}
{#snippet texMark()}<Text3D tex text="MMM" position={[50, 50]} size={30} color="#0000ff" />{/snippet}
{#snippet polarMark()}<Points x={[100, 130, 160]} y={[2, 2, 2]} size={15} fill="#0000ff" />{/snippet}

<div class="grid">
{#each CASES as c (c.name)}
  <section data-case={c.name}><h4>{c.name}</h4>
    <Plot bind:this={plots[c.name]} {...common} {...(c.plot ?? {})}>
      {#if c.name === "connection"}
        <Anchor bind:this={fromAnchor} x="x0" y="y" /><Anchor bind:this={toAnchor} x="x1" y="y" />
      {/if}
      {#each orders[c.name] as key (key)}
        {#if key === "ref"}{@render (c.ref ?? reference)(c.name)}{:else}{@render c.mark()}{/if}
      {/each}
    </Plot>
  </section>
{/each}

<section data-case="gated"><h4>gated</h4>
  <Plot bind:this={plots.gated} width={200} height={200} axes2d={false} toneMapping={0} x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    {#each gatedOrder as key (key)}
      {#if key === "A" && gates.A}<Rect bind:this={handles.A} x0={[10]} x1={[60]} y0={[20]} y1={[80]} fill="#ff0000" onclick={() => clicks.push("A")} />
      {:else if key === "B" && gates.B}<Area bind:this={handles.B} x={[40, 90]} lower={[20, 20]} upper={[80, 80]} fill="#00ff00" opacity={1} onclick={() => clicks.push("B")} />
      {:else if key === "C" && gates.C}<Points bind:this={handles.C} position={[[62, 50]]} size={30} fill="#0000ff" onclick={() => clicks.push("C")} />{/if}
    {/each}
  </Plot>
</section>

<section data-case="dag"><h4>dag</h4>
  <Data value={edges}><GraphData nodes={nodes} edges={edges} nodeKey="id" source="source" target="target"><DAG    >
    <Plot bind:this={plots.dag} width={240} height={240} axes2d={false} toneMapping={0}>
      {#each dagOrder as key (key)}
        {#if key === "edges"}<Edges><Routes color="#ff0000" width={10} /></Edges>
        {:else}<Nodes><Points bind:this={handles.dagNodes} position="position" fill="#0000ff" size={18} /></Nodes>{/if}
      {/each}
    </Plot>
  </DAG></GraphData></Data>
</section>

<section data-case="mode"><h4>mode</h4>
  <Plot bind:this={plots.mode} type={viewType} width={200} height={160} axes2d={false} toneMapping={0} x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Rect bind:this={handles.mode} x0={[0]} x1={[60]} y0={[0]} y1={[100]} fill="#ff0000" />
    <Area x={[40, 100]} lower={[20, 20]} upper={[80, 80]} fill="#0000ff" opacity={0.5} />
  </Plot>
</section>

<section data-case="surface"><h4>surface</h4>
  <Plot bind:this={plots.surface} {...common}>
    <Heatmap fill={[[0.5, 0.5], [0.5, 0.5]]} fillScale={whiteScale} textureResolution={[256, 256]}>
      {#each surfaceOrder as key (key)}
        {#if key === "rect"}<Rect bind:this={handles.surfaceRect} x0={[0]} x1={[50]} y0={[0]} y1={[100]} fill="#ff0000" />
        {:else}<Area x={[20, 80]} lower={[30, 30]} upper={[70, 70]} fill="#0000ff" opacity={1} />{/if}
      {/each}
    </Heatmap>
  </Plot>
</section>
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(5, 260px); gap: 8px; }
  h4 { margin: 0; font: 12px sans-serif; }
</style>
