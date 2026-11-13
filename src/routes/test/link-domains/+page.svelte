<script>
  // LinkViews' domains (TODO 136.14, 135.7): two Plots linked on x, one with x from 0 to 10, the
  // other from 5 to 20. "?free" links them with scales="free". A third Plot, never linked, has
  // a date domain (Python sends {"$datetime": ms}) over a datetime column of the same days.
  // "third" (x 5 to 20, y 10 to 15) is linked to first on y, and "empty" (no finite x) to third
  // on x: a plot in two LinkViews, and one whose marks draw nothing.
  import { onMount, tick } from "svelte";
  import SceneRenderer from "$lib/scene/SceneRenderer.svelte";
  import { SceneRuntime } from "$lib/scene/runtime.svelte.js";
  import { initializePlot } from "$lib/jaxExtensions/setup.js";
  import registry from "$lib/scene/registry.json";
  const runtime = new SceneRuntime(() => {});
  const free = typeof location !== "undefined" && new URLSearchParams(location.search).has("free");
  const n = 6, day = 86400000, start = Date.UTC(2024, 0, 1);
  const columns = {
    a: Float32Array.from({ length: n }, (_, i) => i * 2),
    b: Float32Array.from({ length: n }, (_, i) => 5 + i * 3),
    y: Float32Array.from({ length: n }, (_, i) => i),
    y2: Float32Array.from({ length: n }, (_, i) => 10 + i),
    nan: new Float32Array(n).fill(NaN),
    t: BigInt64Array.from({ length: n }, (_, i) => BigInt(start + (i + 2) * day)),
  };
  const descriptor = (id) => id === "t"
    ? { id, shape: [n], dtype: "int64", logical_type: "datetime", unit: "ms", timezone: "UTC", byte_order: "little" }
    : { id, shape: [n], dtype: "float32", byte_order: "little" };
  const plot = (id, x, props = {}, y = "y") => ({
    id, kind: "Plot", events: [],
    props: { data: { $table: "table" }, width: 360, height: 200, axes2d: true, autoBounds: true, ...props },
    children: [{ id: `${id}-points`, kind: "Points", props: { x, y }, events: [], children: [] }],
  });
  const state = {
    protocol: registry.protocol, library: "test", scene: "scene", revision: 1,
    scales: {}, normalizations: {}, themes: {}, selections: {}, identities: {},
    columns: Object.fromEntries(Object.keys(columns).map((id) => [id, descriptor(id)])),
    tables: { table: { version: 1, columns: Object.fromEntries(Object.keys(columns).map((id) => [id, { $column: id }])) } },
    root: {
      id: "scene", kind: "Scene", props: {}, events: [], children: [
        plot("first", "a"),
        plot("second", "b"),
        { id: "link", kind: "LinkViews", events: [], children: [],
          props: { plots: [{ $ref: "first" }, { $ref: "second" }], axes: "x", ...(free ? { scales: "free" } : {}) } },
        plot("third", "b", {}, "y2"),
        plot("empty", "nan"),
        { id: "link-y", kind: "LinkViews", events: [], children: [], props: { plots: [{ $ref: "first" }, { $ref: "third" }], axes: "y" } },
        { id: "link-empty", kind: "LinkViews", events: [], children: [], props: { plots: [{ $ref: "third" }, { $ref: "empty" }], axes: "x" } },
        plot("dates", "t", { x: { domain: [{ $datetime: start }, { $datetime: start + 10 * day }] } }),
      ],
    },
  };
  onMount(() => {
    window.linkDomains = {
      ticks: (id, axis) => {
        const element = [...runtime.handles.values()].find((h) => h.id === id)?.element;
        return [...(element?.querySelectorAll(`.${axis}-tick`) ?? [])].map((e) => ({
          value: Number(e.getAttribute("data-value")), text: e.textContent.trim() }));
      },
      layout: (id) => runtime.reference(id)?.getAxisLayout?.(),
      settled: () => Promise.all(["first", "second", "third", "empty", "dates"].map((id) => runtime.reference(id)?.whenSettled?.())),
    };
    (async () => {
      await initializePlot();
      await runtime.apply(state, (id) => ({ payload: new Uint8Array(columns[id].buffer), descriptor: state.columns[id] }));
      window.linkDomainsReady = true;
    })().catch((e) => console.error(e));
    return () => {
      runtime.dispose();
      void tick().then(() => runtime.resources.dispose());
    };
  });
</script>

<div style="width: 800px"><SceneRenderer {runtime} /></div>
