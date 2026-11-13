<script>
  // Private measurement fixture, copied into a frozen snapshot by scale-matrix.mjs.
  import { onMount, tick } from "svelte";
  import { Data, Plot, Frame, Facet, Points, Filter, Legend, continuous, normalization,
    animate, add } from "$lib/index";
  import { guideObject } from "$lib/plot/utils/guides.js";
  const query = new URLSearchParams(globalThis.location?.search ?? "");
  const rows = Number(query.get("rows") ?? 128), copies = Number(query.get("marks") ?? 4);
  const operation = query.get("operation") ?? "filter", layout = query.get("layout") ?? "root";
  const automatic = query.get("bounds") !== "explicit", source = query.get("source") === "1";
  const filtered = operation === "filter", mappedSize = filtered || operation === "range";
  const table = {
    x: Float32Array.from({ length: rows }, (_, i) => ((i * 7919) % rows) / rows),
    y: Float32Array.from({ length: rows }, (_, i) => ((i * 3571) % rows) / rows),
    v: Float32Array.from({ length: rows }, (_, i) => i % 997 + 1),
    group: Array.from({ length: rows }, (_, i) => i % 2 ? "B" : "A"),
  };
  let threshold = $state(997), pointSize = $state(3), offset = $state(0), showLegend = $state(true);
  let plot = $state(), facet = $state();
  const norm = normalization({ domainSource: source ? "source" : "data" });
  const colorScale = continuous({ normalization: norm, colormap: "Viridis" });
  const sizeScale = continuous({ normalization: norm, range: [2, 5] });
  const counts = Object.fromEntries([0, 30, 40, 100, 997].map(limit =>
    [limit, filtered ? table.v.reduce((sum, v) => sum + Number(v <= limit), 0) : rows]));
  const plots = () => facet ? facet.getPlots().map(cell => cell.plot) : plot ? [plot] : [];
  const marks = () => plots().flatMap(plot => (plot.getLegendSource()?.entries?.() ?? [])
    .map(guideObject).filter(mark => mark?.constructor?.componentName === "Points"));
  const axis = automatic ? { padding: 0, grid: "off" } : { domain: [0, 1], padding: 0, grid: "off" };
  onMount(() => {
    window.scaleMatrix = {
      plots, marks,
      async set(value) {
        if (operation === "filter") threshold = value;
        else if (operation === "palette") colorScale.update({ colormap: value });
        else if (operation === "range") sizeScale.update({ range: value });
        else if (operation === "legend") showLegend = value;
        else if (operation === "animated") offset = value;
        else pointSize = value;
        await tick();
      },
      async settle() { await Promise.all(plots().map(plot => plot.whenSettled())); },
      async finish() { await Promise.all(plots().map(plot => plot.whenAnimationsFinished())); },
      frames: () => plots().reduce((sum, plot) => sum + plot.getDiagnostics().completedFrame, 0),
      // Unfiltered marks' committed storage count is the draw count. A binding's row count can
      // retain an intermediate scalar-preparation value during an appearance-only reuse.
      read: () => marks().map(mark => ({ count: filtered ? mark.view.marks.of(mark)?.rows.count ?? mark.count : mark.count,
        color: mark.options.get("valueBounds"), size: mark.options.get("scaleBounds"),
        colorScale: mark.view.marks.of(mark)?.scales?.fill?.id,
        bounds: plots()[0]?.getAxes().map(frame => ({
          x: frame.getFrameOptions().get("xbounds"), y: frame.getFrameOptions().get("ybounds"),
        })), error: [...plots().map(plot => plot.getRenderError?.()),
          ...document.querySelectorAll(".canvas [role=alert]")].map(error =>
            typeof error === "string" ? error : error?.textContent).filter(Boolean) })),
      expectedCount: value => filtered ? counts[value] : rows,
      copies,
    };
    return () => { delete window.scaleMatrix; colorScale.dispose(); sizeScale.dispose(); };
  });
</script>

{#snippet points()}
  {#each Array(copies).fill(0) as _, i}
    <Points x="x" y="y" fill={operation === "animated" ? animate(add("v", offset), { duration: 180 }) : "v"}
      fillScale={layout.startsWith("facet") ? undefined : colorScale}
      size={mappedSize ? "v" : pointSize} sizeScale={mappedSize ? sizeScale : undefined}
      opacity={0.7} outlineWidth={0} maxElements={rows} respond={false} label={`Series ${i}`} />
  {/each}
{/snippet}
{#snippet content()}
  {#if filtered}
    <Filter where={{ field: "v", op: "lte", value: threshold }}>{@render points()}</Filter>
  {:else}
    {@render points()}
  {/if}
  {#if showLegend}<Legend channel="fill" />{/if}
{/snippet}

<Data value={table}>
  {#if layout.startsWith("facet")}
    <Facet bind:this={facet} column="group" wrap={2} gap={12}
      resolve={{ color: layout === "facet-independent" ? "independent" : "shared" }}>
      <Plot width={370} height={340} responsive={false} x={axis} y={axis} settings="hidden">
        {@render content()}
      </Plot>
    </Facet>
  {:else}
    <Plot bind:this={plot} width={760} height={440} responsive={false} x={axis} y={axis} settings="hidden">
      {#if layout === "nested"}
        <Frame x={{ range: [0.1, 0.9], padding: 0 }} y={{ range: [0.15, 0.85], padding: 0 }}>
          {@render content()}
        </Frame>
      {:else}
        {@render content()}
      {/if}
    </Plot>
  {/if}
</Data>
