<script>
  import { onMount } from "svelte";
  import { Data, Facet, Plot, Points, Rect } from "$lib/index";
import { Bin } from "$lib/stats/index.js";
  import { guideObject } from "$lib/plot/utils/guides.js";

  const observations = {
    group: ["A", "A", "B", "B"],
    x: [0, 1, 0, 1],
    y: [0, 1, 0, 1],
    value: [0, 10, 100, 200],
  };
  const histogram = { group: ["A", "A", "B", "B", "B", "B"],
    value: [0, 0, 10, 11, 12, 13] };
  let shared, independent, transformed;
  const read = (facet) => facet?.getPlots().map(({ plot, column }) => {
    const handle = plot?.getLegendSource?.().entries?.()[0];
    const mark = handle && guideObject(handle);
    return { column, domain: mark?.options.get("valueBounds"),
      scale: mark?.view.marks.of(mark)?.scales?.fill?.id };
  }) ?? [];
  onMount(() => {
    window.__scaleFacetFixture = {
      read: () => ({ shared: read(shared), independent: read(independent),
        transformed: read(transformed) }),
      settled: async () => {
        await shared?.whenSettled();
        await independent?.whenSettled();
        await transformed?.whenSettled();
      },
    };
    return () => delete window.__scaleFacetFixture;
  });
</script>

<Data value={observations}>
  <Facet bind:this={shared} column="group" wrap={2} gap={8}>
    <Plot height={180} axes2d settings={{ showTrigger: false }}>
      <Points x="x" y="y" fill="value" size={5} />
    </Plot>
  </Facet>
  <Facet bind:this={independent} column="group" wrap={2} gap={8} resolve={{ color: "independent" }}>
    <Plot height={180} axes2d settings={{ showTrigger: false }}>
      <Points x="x" y="y" fill="value" size={5} />
    </Plot>
  </Facet>
</Data>
<Data value={histogram}>
  <Facet bind:this={transformed} column="group" wrap={2} gap={8}>
    <Plot height={180} axes2d settings={{ showTrigger: false }}>
      <Bin x="value" bins={2}>
        <Rect x0="x0" x1="x1" y0={0} y1="count" fill="count" />
      </Bin>
    </Plot>
  </Facet>
</Data>
