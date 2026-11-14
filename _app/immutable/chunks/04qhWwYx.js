const t=`<script>
  import { Plot } from "hmplot";
  import { PortableTemplate } from "hmplot/templates";
  import { untrack } from "svelte";
  import definition from "./candlestick.hmplot.json";
  import download from "./candlestick.hmplot.json?url";
  import data from "./data.json";
  let { onready } = $props(), plot = $state();
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
<\/script>
<p>Deterministic simulated prices, not investment data. One row per day, with numeric day, open, close, low and high columns. width uses the x coordinate units. The empty slot accepts caller annotations. <a href={download} download="candlestick.hmplot.json">Download template</a></p>
<Plot bind:this={plot} {data} responsive height={380} x={{"label": "Trading day", "domain": [-1, 30]}} y={{"label": "Price ($)"}}>
  <PortableTemplate {definition} params={{}} />
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
`;export{t as default};
