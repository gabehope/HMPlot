const e=`<script>
  import { Provider, InputContext, Playback, Plot, Line, Filter, Calculate, Group, less_equal, input, min, max, subtract, month_name, mean } from "$lib";
import { Bar } from "$lib/charts/index.js";
  import { untrack } from "svelte";
  let { onready } = $props(), plot = $state();
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
<\/script>

<p>
  Mauna Loa's monthly CO₂ (NOAA). Press play to draw it a month at a time, four years a second;
  the Playback's value is a date. Below, the seasonal cycle: each calendar month's mean distance
  from the deseasonalized trend, grouped by <code>month_name(date)</code>.
</p>
<InputContext>
  <Provider url="/data/co2/mauna-loa-co2-monthly.csv" format="csv" schema={{ date: "datetime" }}>
    <Playback name="until" min={min("date")} max={max("date")} rate="4 years" step="1 month" label="Until" loop />
    <Plot bind:this={plot} responsive height={280} axes2d>
      <Line x="date" y="co2" color="#c9d3dd" width={1} />
      <Filter where={less_equal("date", input("until"))}>
        <Line x="date" y="co2" color="#2f6fa3" width={1.5} />
      </Filter>
    </Plot>
    <Calculate columns={{ month: month_name("date"), seasonal: subtract("co2", "deseasonalized") }}>
      <Group by="month" columns={{ cycle: mean("seasonal") }}>
        <Plot responsive height={200} axes2d>
          <Bar x="month" y="cycle" fill="#6b9c73" />
        </Plot>
      </Group>
    </Calculate>
  </Provider>
</InputContext>
`;export{e as default};
