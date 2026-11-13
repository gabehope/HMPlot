<script>
  // TODO 143.2: the complex eval's rebased returns, with synthetic prices: four lines indexed to
  // 100 at a base day, labelled at their ends with their values (EndLabels' Text), so a new base
  // changes the Line's and the Text's y extents together.
  import { onMount } from "svelte";
  import { Data, Plot, Line, Calculate, multiply, divide, col, last, less_equal } from "$lib/index";
  import { EndLabels } from "$lib/charts/index";
  const tickers = ["A", "B", "C", "D"], days = 522;
  const frame = { day: [], ticker: [], close: [] };
  for (const [t, name] of tickers.entries())
    for (let d = 0; d < days; d++) {
      frame.day.push(d); frame.ticker.push(name);
      frame.close.push(50 + 20 * t + 15 * Math.sin(d / (30 + 7 * t)) + d * (0.02 + 0.03 * t));
    }
  let base = $state(0), plot = $state();
  const indexed = $derived(multiply(100, divide(col.close, last("close", { by: "ticker", where: less_equal(col.day, base), orderBy: "day" }))));
  onMount(() => {
    window.rebasedReturns = { get plot() { return plot; }, setBase(value) { base = value; } };
    return () => { delete window.rebasedReturns; };
  });
</script>

<Data value={frame}>
  <Plot bind:this={plot} width={520} height={320} animation={false} legend={false}>
    <Calculate columns={{ indexed }}>
      <Line x="day" y="indexed" series="ticker" color="ticker" />
      <EndLabels x="day" y="indexed" series="ticker" text="indexed" format=".0f" color="ticker" />
    </Calculate>
  </Plot>
</Data>
