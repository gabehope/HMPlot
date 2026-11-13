<script>
  // Alignment groups (TODO 136.10 slice 5): a Scene's Column holding a Row of two Plots (one
  // titled, with labels to a million) and two stacked Plots (wide labels above narrow ones). The
  // spec reads each Plot's area on the page: the Row's share their top and bottom lines, the
  // stacked ones their left and right. `?pinned` pins the narrow plots' left margin.
  import { onMount, tick } from "svelte";
  import SceneRenderer from "$lib/scene/SceneRenderer.svelte";
  import { SceneRuntime } from "$lib/scene/runtime.svelte.js";
  import { initializePlot } from "$lib/jaxExtensions/setup.js";
  import registry from "$lib/scene/registry.json";
  const runtime = new SceneRuntime(() => {});
  const pinned = typeof location !== "undefined" && new URLSearchParams(location.search).has("pinned");
  const fixedMargins = typeof location !== "undefined" && new URLSearchParams(location.search).has("fixedMargins");
  const n = 12;
  const columns = {
    x: Float32Array.from({ length: n }, (_, i) => i),
    big: Float32Array.from({ length: n }, (_, i) => i * 90000),
    small: Float32Array.from({ length: n }, (_, i) => (i % 3) / 2),
  };
  const descriptor = (id) => ({ id, shape: [n], dtype: "float32", byte_order: "little" });
  const plot = (id, y, props = {}) => ({
    id, kind: "Plot", events: [],
    props: { data: { $table: "table" }, width: 320, height: 240, axes2d: true, ...props },
    children: [{ id: `${id}-points`, kind: "Points", props: { x: "x", y }, events: [], children: [] }],
  });
  const narrow = { ...(pinned ? { axisMarginLeft: 30 } : {}), ...(fixedMargins ? { dynamicMargins: false } : {}) };
  const state = {
    protocol: registry.protocol, library: "test", scene: "scene", revision: 1,
    scales: {}, normalizations: {}, themes: {}, selections: {}, identities: {},
    columns: Object.fromEntries(Object.keys(columns).map((id) => [id, descriptor(id)])),
    tables: { table: { version: 1, columns: Object.fromEntries(Object.keys(columns).map((id) => [id, { $column: id }])) } },
    root: {
      id: "scene", kind: "Scene", props: {}, events: [], children: [
        { id: "row", kind: "Row", props: {}, events: [], children: [
          plot("titled", "big", { title: "Titled" }),
          plot("plain", "small", narrow),
        ] },
        plot("wide", "big"),
        plot("narrow", "small", narrow),
      ],
    },
  };
  onMount(() => {
    window.alignGroups = {
      zoom: (id, viewport) => runtime.reference(id).setViewport(viewport, "y"),
      async setPeerFormat(format) {
        const next = structuredClone(state);
        next.revision++;
        next.root.children.find(node => node.id === "wide").props.y = { format };
        await runtime.apply(next, id => ({ payload: new Uint8Array(columns[id].buffer), descriptor: state.columns[id] }));
      },
      areas: () => Object.fromEntries(["titled", "plain", "wide", "narrow"].map((id) => {
        const { handle, element } = [...runtime.handles.values()].find((h) => h.id === id) ?? {};
        const canvas = element?.querySelector(".canvas")?.getBoundingClientRect(),
          layout = handle?.getAxisLayout?.();
        return [id, canvas && layout ? {
          left: canvas.left + layout.left, right: canvas.left + layout.right,
          top: canvas.top + layout.top, bottom: canvas.top + layout.bottom,
        } : null];
      })),
      settled: () => Promise.all(["titled", "plain", "wide", "narrow"].map((id) => runtime.reference(id)?.whenSettled?.())),
    };
    (async () => {
      await initializePlot();
      await runtime.apply(state, (id) => ({ payload: new Uint8Array(columns[id].buffer), descriptor: state.columns[id] }));
      window.alignGroupsReady = true;
    })().catch((e) => console.error(e));
    return () => {
      runtime.dispose();
      void tick().then(() => runtime.resources.dispose());
    };
  });
</script>

<SceneRenderer {runtime} />
