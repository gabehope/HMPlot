<script>
  // A Python-style scene (SceneRuntime + binary columns) with marks inside a Partition: every
  // group's instance of a node registers its own runtime handle (11.11 A2), and a numeric key
  // arrives as a float column the way Python sends it (A3). The Facet > Partition > Partition
  // scene pins the composed handle key format that Stage 15 builds on.
  import { onMount, tick } from "svelte";
  import SceneRenderer from "$lib/scene/SceneRenderer.svelte";
  import { SceneRuntime } from "$lib/scene/runtime.svelte.js";
  import { initializePlot } from "$lib/jaxExtensions/setup.js";
  import registry from "$lib/scene/registry.json";
  const runtime = new SceneRuntime((message) => {
    window.partitionRuntimeMessages ??= [];
    window.partitionRuntimeMessages.push(message);
  });
  const SPECIES = ["Adelie", "Gentoo", "Chinstrap"];
  let version = 0;
  // `keep` lists the species that stay in the table; the rest are dropped with their rows.
  function build(keep = SPECIES) {
    const n = 30 * keep.length;
    const x = new Float32Array(n), y = new Float32Array(n), cyl = new Float32Array(n), codes = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = (i % 30) * 3;
      y[i] = 10 + Math.floor(i / 30) * 25 + ((i * 17) % 20);
      codes[i] = SPECIES.indexOf(keep[Math.floor(i / 30)]);
      cyl[i] = [4, 6, 8][i % 3];
    }
    version++;
    const column = (id, shape, dtype, extra = {}) => ({ id, shape, dtype, byte_order: "little", ...extra });
    const columns = {
      "col-x": column("col-x", [n], "float32"),
      "col-y": column("col-y", [n], "float32"),
      "col-cyl": column("col-cyl", [n], "float32"),
      "col-species": column("col-species", [n], "int32", { categories: SPECIES }),
    };
    const buffers = { "col-x": x, "col-y": y, "col-cyl": cyl, "col-species": codes };
    const state = {
      protocol: registry.protocol, library: "test", scene: "scene", revision: version,
      scales: {}, normalizations: {}, themes: {}, selections: {}, identities: {},
      columns: Object.fromEntries(Object.entries(columns).map(([id, desc]) => [`${id}-${version}`, { ...desc, id: `${id}-${version}` }])),
      tables: {
        table: {
          version,
          columns: {
            x: { $column: `col-x-${version}` }, y: { $column: `col-y-${version}` },
            cyl: { $column: `col-cyl-${version}` }, species: { $column: `col-species-${version}` },
          },
        },
      },
      root: {
        id: "scene", kind: "Scene", props: {}, events: [], children: [
          {
            id: "plot", kind: "Plot", props: { data: { $table: "table" }, width: 420, height: 260, axes2d: true }, events: [], children: [
              {
                id: "partition", kind: "Partition", props: { by: "species" }, events: [], children: [
                  { id: "points", kind: "Points", props: { x: "x", y: "y", size: 6 }, events: ["click"], children: [] },
                ],
              },
            ],
          },
          {
            id: "plot-cyl", kind: "Plot", props: { data: { $table: "table" }, width: 420, height: 260, axes2d: true }, events: [], children: [
              {
                id: "partition-cyl", kind: "Partition", props: { by: "cyl" }, events: [], children: [
                  { id: "line", kind: "Line", props: { x: "x", y: "y" }, events: [], children: [] },
                ],
              },
            ],
          },
          // A Facet cell around nested Partitions: handle keys compose the facet cell key and
          // every group key, outer to inner.
          {
            id: "facet", kind: "Facet", props: { data: { $table: "table" }, column: "species" }, events: [], children: [
              {
                id: "plot-facet", kind: "Plot", props: { height: 160, axes2d: true }, events: [], children: [
                  {
                    id: "partition-outer", kind: "Partition", props: { by: "cyl" }, events: [], children: [
                      {
                        id: "partition-inner", kind: "Partition", props: { by: "species" }, events: [], children: [
                          { id: "dots", kind: "Points", props: { x: "x", y: "y", size: 4 }, events: [], children: [] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const load = (id) => {
      const base = id.replace(/-\d+$/, "");
      return { payload: new Uint8Array(buffers[base].buffer), descriptor: state.columns[id] };
    };
    return { state, load };
  }
  async function apply(keep) {
    const { state, load } = build(keep);
    window.partitionRuntimeState = state;
    await runtime.apply(state, load);
  }
  onMount(() => {
    window.partitionRuntime = runtime;
    window.partitionRuntimeApply = apply;
    (async () => {
      await initializePlot();
      await apply();
      window.partitionRuntimeReady = true;
    })().catch((e) => console.error(e));
    return () => {
      runtime.dispose();
      void tick().then(() => runtime.resources.dispose());
    };
  });
</script>

<SceneRenderer {runtime} />
