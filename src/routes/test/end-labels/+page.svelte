<script>
  // TODO 136.16 slice 7: EndLabels name each line at its last finite point (after a missing
  // value), in its color, and leave the axes as the lines alone set them.
  import { onMount } from "svelte";
  import { Plot, Line, categorical } from "$lib/index";
  import { EndLabels } from "$lib/charts/index";
  const data = {
    year: [2019, 2020, 2021, 2022, 2019, 2020, 2021, 2022, 2019, 2020, 2021, 2022],
    index: [100, 104, 111, 118, 100, 97, 103, NaN, 100, 101, 99, 102],
    fund: ["Growth", "Growth", "Growth", "Growth", "Value", "Value", "Value", "Value", "Bonds", "Bonds", "Bonds", "Bonds"],
  };
  const colors = categorical({ domain: ["Growth", "Value", "Bonds"], range: ["#3477b4", "#df7253", "#52997a"] });
  let labelled = $state(), bare = $state(), first = $state(), close = $state(), wide = $state();
  // Three lines ending within a pixel or two of each other.
  const near = { year: [0, 1, 0, 1, 0, 1], v: [0, 10, 0, 10.05, 0, 10.1], s: ["a", "a", "b", "b", "c", "c"] };
  onMount(() => {
    window.endLabels = { get labelled() { return labelled; }, get bare() { return bare; }, get first() { return first; }, get close() { return close; }, get wide() { return wide; } };
    return () => { delete window.endLabels; };
  });
</script>

<Plot bind:this={wide} data={{...data, index: data.index.map(value => Number.isFinite(value) ? value : 109)}}
  width={1200} height={260} legend={false} animation={false}>
  <Line x="year" y="index" series="fund" color="fund" colorScale={colors} />
  <EndLabels x="year" y="index" series="fund" color="fund" colorScale={colors} />
</Plot>

<Plot bind:this={labelled} {data} width={360} height={220} legend={false} animation={false}>
  <Line x="year" y="index" series="fund" color="fund" colorScale={colors} />
  <EndLabels x="year" y="index" series="fund" color="fund" colorScale={colors} />
</Plot>
<Plot bind:this={bare} {data} width={360} height={220} legend={false} animation={false}>
  <Line x="year" y="index" series="fund" color="fund" colorScale={colors} />
</Plot>
<Plot bind:this={first} {data} width={360} height={220} legend={false} animation={false}>
  <Line x="year" y="index" series="fund" color="fund" colorScale={colors} />
  <EndLabels x="year" y="index" series="fund" text="index" at="first" format=".1f" />
</Plot>
<Plot bind:this={close} data={near} width={360} height={220} legend={false} animation={false}>
  <Line x="year" y="v" series="s" />
  <EndLabels x="year" y="v" series="s" />
</Plot>
