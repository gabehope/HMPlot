<script>
  import { onMount } from "svelte";
  import { Plot, Rect, Theme, themes } from "$lib";
  import { BandX, BandY } from "$lib/charts";
  let bands = [];
  let plots = [];
  onMount(() => { window.ruleFixture = plots; window.bandFixture = bands; return () => { delete window.ruleFixture; delete window.bandFixture; }; });
</script>
{#each ["light", "dark"] as mode, i}
  <section data-mode={mode}>
    <Theme value={themes[mode]}>
      <Plot bind:this={plots[i]} width={400} height={260} axes2d x={{ domain: [0, 10], grid: "major" }} y={{ domain: [0, 10] }}
        rules={[{ axis: "x", value: 5, label: "Median" }, { axis: "x", value: 7, color: "#ff0088", width: 3 }]}>
        <Rect x0={[0]} x1={[10]} y0={[0]} y1={[10]} fill="#44aa88" />
      </Plot>
    </Theme>
  </section>
{/each}

<section data-bands>
  <Theme value={{ axes: { marginLeft: 0, marginRight: 0, marginTop: 0, marginBottom: 0 } }}>
  <Plot bind:this={bands[0]} width={400} height={300} axes2d={false} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <BandX x0={4} x1={6} fill="#ff0000" opacity={1} />
  </Plot>
  <Plot bind:this={bands[1]} data={{ start: [2, 6], end: [4, 8] }} width={400} height={300} axes2d={false} x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <BandY y0="start" y1="end" fill="#0000ff" opacity={1} />
  </Plot>
  </Theme>
</section>
