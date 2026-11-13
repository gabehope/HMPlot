<script>
  // Marginals (TODO 136.16): a scene's Marginals node, as Python sends it, over 40 rows with a
  // long-labeled y, and a Text child in its scatter. The spec reads each view's plot area on the
  // page, their domains (an x on the top histogram, a y on the right one, as their hidden axes
  // would tick them) and viewports, and the figure's exports.
  import { onMount, tick } from "svelte";
  import SceneRenderer from "$lib/scene/SceneRenderer.svelte";
  import { SceneRuntime } from "$lib/scene/runtime.svelte.js";
  import { initializePlot } from "$lib/jaxExtensions/setup.js";
  import registry from "$lib/scene/registry.json";
  // What the runtime sends Python (its viewport events). `?viewport` sets the figure's viewport,
  // as an exported page replays a zoomed view.
  const sent = [];
  const runtime = new SceneRuntime((message) => sent.push(message));
  const wide = typeof location !== "undefined" && new URLSearchParams(location.search).has("wide");
  const zoomed = typeof location !== "undefined" && new URLSearchParams(location.search).has("viewport");
  const n = 40;
  const columns = {
    a: Float32Array.from({ length: n }, (_, i) => 10 + ((i * 7) % 23)),
    b: Float32Array.from({ length: n }, (_, i) => 100000 + ((i * 11) % 17) * 25000),
  };
  const descriptor = (id) => ({ id, shape: [n], dtype: "float32", byte_order: "little" });
  const state = {
    protocol: registry.protocol, library: "test", scene: "scene", revision: 1,
    scales: {}, normalizations: {}, themes: {}, selections: {}, identities: {},
    columns: Object.fromEntries(Object.keys(columns).map((id) => [id, descriptor(id)])),
    tables: { table: { version: 1, columns: Object.fromEntries(Object.keys(columns).map((id) => [id, { $column: id }])) } },
    root: {
      id: "scene", kind: "Scene", props: {}, events: [], children: [
        { id: "marginals", kind: "Marginals", events: ["viewportchange"],
          props: { data: { $table: "table" }, x: "a", y: "b", bins: 6, height: 400, ...(zoomed ? { viewport: { x: 0.4, y: 0.5, zoomX: 2, zoomY: 1 } } : {}) },
          children: [{ id: "label", kind: "Text", events: [], props: { x: 20, y: 300000, text: "inside the scatter", rows: "auto" }, children: [] }] },
      ],
    },
  };
  const VIEWS = { top: "top", main: "main", right: "right" };
  onMount(() => {
    const marginals = () => runtime.reference("marginals");
    window.marginals = {
      areas: () => Object.fromEntries(Object.keys(VIEWS).map((view) => {
        const cell = document.querySelector(`[data-view-area="${view}"]`);
        const canvas = cell?.querySelector(".canvas")?.getBoundingClientRect(), layout = marginals()?.view(view)?.getAxisLayout?.();
        return [view, canvas && layout ? {
          left: canvas.left + layout.left, right: canvas.left + layout.right,
          top: canvas.top + layout.top, bottom: canvas.top + layout.bottom,
        } : null];
      })),
      domain: (view, axis) => {
        const frame = marginals()?.view(view)?.getAxes?.()?.[0];
        const domain = frame?.getDomain?.(axis) ?? frame?.domain?.(axis);
        return domain ? [domain[0], domain[1]] : null;
      },
      layout: (view) => marginals()?.view(view)?.getAxisLayout?.(),
      viewport: (view) => marginals()?.view(view)?.getViewport?.(),
      exportSVG: async () => (await (await marginals().exportSVG()).blob.text()),
      pngBlob: () => marginals().exportPNG({ scale: 1 }),
      exportPNG: async () => {
        const blob = await marginals().exportPNG({ scale: 1 }), bitmap = await createImageBitmap(blob);
        return { width: bitmap.width, height: bitmap.height };
      },
      figure: () => document.querySelector(".hm-marginals")?.getBoundingClientRect().toJSON(),
      settled: () => marginals()?.whenSettled(),
      sceneSVG: async () => (await (await runtime.exportSceneDocument("svg", {})).blob.text()),
      scenePNG: async () => {
        const bitmap = await createImageBitmap(await runtime.exportScene(1));
        return { width: bitmap.width, height: bitmap.height };
      },
      // Whether the scatter's child is hidden from the settings pane (a template's follower is).
      childHidden: () => runtime.reference("label")?.getMark?.()?.options?.presentation?.hidden === true,
      childRegistered: () => Boolean(runtime.reference("label")?.getMark?.()?.options),
      setViewport: (state) => marginals().setViewport(state),
      events: () => sent.filter((message) => message.type === "event").map(({ target, event, payload }) => ({ target, event, payload })),
    };
    (async () => {
      await initializePlot();
      await runtime.apply(state, (id) => ({ payload: new Uint8Array(columns[id].buffer), descriptor: state.columns[id] }));
      window.marginalsReady = true;
    })().catch((e) => console.error(e));
    return () => {
      runtime.dispose();
      void tick().then(() => runtime.resources.dispose());
    };
  });
</script>

<div style:width={wide ? "1200px" : "720px"}><SceneRenderer {runtime} fill={!wide} /></div>
