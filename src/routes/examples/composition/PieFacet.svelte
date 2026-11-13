<script>
  import { Plot, Facet, Legend } from "$lib";
import { Pie } from "$lib/charts/index.js";
  let {onready = () => {}} = $props();
  let facet = $state();
  $effect(() => {
    if (facet) onready({
      exportPNG: (scale) => facet.exportPNG({ scale }),
      whenSettled: () => facet.whenSettled(),
      openSettings: (anchor) => facet.getPlots()[0]?.plot.openSettings(anchor),
    });
  });
  // One row per year and region.
  const regions = ["North", "East", "South", "West"];
  const sales = {
    year: ["2023", "2024", "2025"].flatMap((year) => regions.map(() => year)),
    region: [...regions, ...regions, ...regions],
    sales: [10, 38, 12, 27, 15, 32, 27, 24, 11, 12, 21, 20],
  };
</script>
<p>Small multiples: a Facet repeats the Plot once per year, and each Pie sums its own year's sales. The Legend in the repeated Plot is one legend for the row.</p>
<Facet bind:this={facet} data={sales} column="year">
  <Plot height={240}>
    <Pie value="sales" category="region" innerRadius={0.4} sectorLabel="percent" />
    <Legend channel="fill" label="Region" position="bottom" />
  </Plot>
</Facet>
<style>p {font-size:14px;line-height:1.5}</style>
