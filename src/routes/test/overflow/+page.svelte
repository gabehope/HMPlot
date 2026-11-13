<script>
  // The overflow policy (TODO 136.10 slice 6), one scene per ?case=: "wide", a Plot 3000 px wide
  // in a narrower page (cut off, with a warning); "clip", category names longer
  // than 45% of a small plot (clipped, with a warning); "facet", eight columns of cells in a
  // 700 px page (shrunk, never scrolled, with a warning). The spec reads runtime.diagnostics().
  import { onMount, tick } from "svelte";
  import SceneRenderer from "$lib/scene/SceneRenderer.svelte";
  import { SceneRuntime } from "$lib/scene/runtime.svelte.js";
  import { initializePlot } from "$lib/jaxExtensions/setup.js";
  import registry from "$lib/scene/registry.json";
  const runtime = new SceneRuntime(() => {});
  const scene = typeof location === "undefined" ? "wide" : new URLSearchParams(location.search).get("case") ?? "wide";
  const n = 16;
  const NAMES = ["A rather long category name for a small plot", "Short", "Medium length", "Other"];
  const columns = {
    x: Float32Array.from({ length: n }, (_, i) => i),
    y: Float32Array.from({ length: n }, (_, i) => (i * 7) % 11),
    name: Int32Array.from({ length: n }, (_, i) => i % NAMES.length),
    g: Int32Array.from({ length: n }, (_, i) => i % 8),
  };
  const descriptors = {
    x: { dtype: "float32" }, y: { dtype: "float32" },
    name: { dtype: "int32", categories: NAMES },
    g: { dtype: "int32", categories: ["a", "b", "c", "d", "e", "f", "g", "h"] },
  };
  const points = (id, y = "y") => ({ id, kind: "Points", props: { x: "x", y }, events: [], children: [] });
  const plot = (id, props, y) => ({ id, kind: "Plot", events: [], props: { axes2d: true, ...props }, children: [points(`${id}-points`, y)] });
  const children = {
    wide: [plot("wide", { data: { $table: "table" }, width: 3000, height: 200 })],
    clip: [plot("clip", { data: { $table: "table" }, width: 240, height: 200 }, "name")],
    facet: [{ id: "facet", kind: "Facet", events: [], props: { data: { $table: "table" }, column: "g" },
      children: [plot("cell", { height: 160 })] }],
  }[scene];
  const state = {
    protocol: registry.protocol, library: "test", scene: "scene", revision: 1,
    scales: {}, normalizations: {}, themes: {}, selections: {}, identities: {},
    columns: Object.fromEntries(Object.keys(columns).map((id) => [id, { id, shape: [n], byte_order: "little", ...descriptors[id] }])),
    tables: { table: { version: 1, columns: Object.fromEntries(Object.keys(columns).map((id) => [id, { $column: id }])) } },
    root: { id: "scene", kind: "Scene", props: {}, events: [], children },
  };
  onMount(() => {
    window.overflowScene = { runtime };
    (async () => {
      await initializePlot();
      await runtime.apply(state, (id) => ({ payload: new Uint8Array(columns[id].buffer), descriptor: state.columns[id] }));
      window.overflowReady = true;
    })().catch((e) => console.error(e));
    return () => {
      runtime.dispose();
      void tick().then(() => runtime.resources.dispose());
    };
  });
</script>

<div style="width: 700px"><SceneRenderer {runtime} /></div>
