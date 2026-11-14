const e=`<script>
  import { Plot, Stack, Legend, categorical } from "$lib";
import { Bar } from "$lib/charts/index.js";
  import { untrack } from "svelte";
  let { onready } = $props(), plot = $state();
  // Sales by region and product line: one row per pair.
  const regions = ["North", "East", "South", "West", "Central"];
  const products = ["Hardware", "Software", "Services", "Support"];
  const region = [], product = [], sales = [];
  regions.forEach((r, i) => products.forEach((p, j) => {
    region.push(r);
    product.push(p);
    sales.push(20 + ((i * 7 + j * 13) % 11) * 9 + j * 6);
  }));
  const data = { region, product, sales };
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
<\/script>
<p>A 100% stacked bar: Stack with offset="expand" scales each region's stack to span 0 to 1, so the bars compare each product's share of the region's sales. Each Bar draws a segment from y0 to y1.</p>
<Plot bind:this={plot} {data} responsive height={400} axes2d
  axisMarginLeft={72} axisMarginBottom={52}
  x={{ scale: categorical({ domain: regions }), label: "Region", titlePosition: "middle", titlePlacement: "outside", titleOffset: 24 }}
  y={{ domain: [0, 1], format: ".0%", label: "Share of sales", titlePosition: "middle", titlePlacement: "outside", titleOffset: 40, titleAngle: -90 }}>
  <Stack x="region" y="sales" series="product" offset="expand">
    <Bar x="region" y="y1" baseline="y0" fill="product" />
  </Stack>
  <Legend channel="fill" label="Product" position="right" />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
`;export{e as default};
