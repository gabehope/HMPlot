<script>
  // A Frame inside every cell (parallel coordinates without Anchors).
  // cells: Fold > embedded Facet by key (free y, grid), and in each cell a Frame that owns x
  //   (domain [0, 1], hidden) and inherits y. The brushable points live in that Frame, so the
  //   cell's y strip brushes them; nothing plots on the cell's own x, so the cell draws no x axis;
  //   axes2d={false} keeps the root axes hidden.
  // ranged: ranged Frames each holding a Frame that owns x. `auto` has an automatic x domain that
  //   no mark contributes to (no x axis), `explicit` an explicit x domain (its x axis draws), and
  //   `direct` an automatic x domain from its own marks (its x axis draws).
  // plain: no axes2d prop and only spatial child frames (one hiding its inherited axes): no root axes.
  // twin: axes2d={false} with a twin y axis on the right: the prop holds, the twin axis draws.
  import { onMount } from "svelte";
  import { Plot, Fold, Facet, Frame, Points, Line, connect } from "$lib/index";
  let cells = $state(), facet = $state(), points = $state(), lines = $state();
  let ranged = $state(), autoPoints = $state(), explicitPoints = $state(), plain = $state(), twin = $state();
  onMount(() => {
    window.frameCells = {
      get cells() { return cells; }, get facet() { return facet; }, get points() { return points; }, get lines() { return lines; },
      get ranged() { return ranged; }, get autoPoints() { return autoPoints; }, get explicitPoints() { return explicitPoints; },
      get plain() { return plain; }, get twin() { return twin; },
      data, fields,
    };
    return () => { delete window.frameCells; };
  });
  const n = 24, fields = ["a", "b", "c"];
  // Three fields on different scales, so each cell has its own y domain.
  const data = {
    id: Array.from({ length: n }, (_, i) => i),
    a: Array.from({ length: n }, (_, i) => (i * 37) % 100),
    b: Array.from({ length: n }, (_, i) => ((i * 53) % 100) * 10),
    c: Array.from({ length: n }, (_, i) => ((i * 71) % 100) / 10),
  };
</script>
<Plot bind:this={cells} {data} width={640} height={360} axes2d={false}>
  <Fold {fields}>
    <Facet bind:this={facet} column="key" scales="free-y" layout="grid">
      <Frame x={{ domain: [0, 1], visible: false }}>
        <Points bind:this={points} name="values" x={0} y="value" size={3} fill="#aa5500" brush={{ axis: "y" }} />
      </Frame>
    </Facet>
    <Line bind:this={lines} connections={connect(facet?.endpoint("values"))} color="#2a6fdb" width={1} opacity={0.5} respond="brushed" />
  </Fold>
</Plot>
<Plot bind:this={ranged} {data} width={640} height={360} axes2d x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
  <Frame name="auto" x={{ range: [5, 30] }} y={{ domain: [0, 100], range: [15, 90] }}>
    <Frame x={{ domain: [0, 1], visible: false }}>
      <Points bind:this={autoPoints} x={0.5} y="a" size={2.5} brush={{ axis: "y" }} />
    </Frame>
  </Frame>
  <Frame name="explicit" x={{ domain: [0, 10], range: [38, 63] }} y={{ domain: [0, 1000], range: [15, 90] }}>
    <Frame x={{ domain: [0, 1], visible: false }}>
      <Points bind:this={explicitPoints} x={0.5} y="b" size={2.5} brush={{ axis: "y" }} />
    </Frame>
  </Frame>
  <Frame name="direct" x={{ range: [71, 96] }} y={{ domain: [0, 10], range: [15, 90] }}>
    <Points x="a" y="c" size={2.5} />
  </Frame>
</Plot>
<Plot bind:this={plain} {data} width={640} height={240}>
  <Frame x={{ range: [10, 90] }} y={{ range: [10, 90] }}>
    <Frame x={{ domain: [0, 1], visible: false }}>
      <Points x={0.5} y="a" size={2.5} />
    </Frame>
  </Frame>
</Plot>
<Plot bind:this={twin} {data} width={640} height={240} axes2d={false}>
  <Points x="id" y="a" size={2.5} />
  <Frame y={{ domain: [0, 1200], side: "right" }}>
    <Points x="id" y="b" size={2.5} fill="#aa5500" />
  </Frame>
</Plot>
