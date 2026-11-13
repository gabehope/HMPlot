<script>
  import { onMount } from 'svelte';
  import * as Plot from '@observablehq/plot';
  import csv from './data/penguins.csv?raw';
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  const rows = lines.map(line => Object.fromEntries(line.split(',').map((v, i) => [headers[i], v]))).filter(row => row.bill_length_mm && row.bill_depth_mm)
    .map(row => ({...row, bill_length_mm: +row.bill_length_mm, bill_depth_mm: +row.bill_depth_mm}));
  let host;
  onMount(() => {
    const chart = Plot.plot({width:900,height:560,
      x:{label:'Bill length (mm)'}, y:{label:'Bill depth (mm)'},
      color:{legend:true}, marks:[Plot.dot(rows,{x:'bill_length_mm',y:'bill_depth_mm',fill:'species',r:3})]});
    host.append(chart);
    return () => chart.remove();
  });
</script>
<h1>Penguin bills</h1>
<div bind:this={host}></div>
