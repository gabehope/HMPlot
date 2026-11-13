<script>
  // Strip brushing fixtures.
  // inset: the root brushes (x, a); a child frame on the right half brushes (x, b) through its strip.
  // shared: two side-by-side child frames both plot column a, so one constraint shows on both strips.
  // columns: no root marks; frames plot height (brush "xy"), weight and age (brush "y") on their
  //   y strips, and a fourth frame plots two columns on y, so its strip is ambiguous.
  // twin: the root brushes (x, a); a twin axis on the right (no range) brushes b.
  // logzero: a log y axis whose explicit domain contains 0, so it has no valid mapping (an
  // automatic one leaves out values outside log's domain, TODO 39.1).
  // dated: two tables of JS Dates one second apart, the second starting 30 s after the first, on
  // one x axis (TODO 48.1: each counts from its own first time; the axis shifts the second).
  import { onMount } from "svelte";
  import { Plot, Frame, Data, Points } from "$lib/index";
  let inset = $state(), rootPoints = $state(), childPoints = $state(), shared = $state(), leftPoints = $state(), rightPoints = $state();
  let columns = $state(), heightPoints = $state(), weightPoints = $state(), agePoints = $state();
  let twin = $state(), twinRootPoints = $state(), twinPoints = $state(), logzero = $state(), logPoints = $state();
  let dated = $state(), morningPoints = $state();
  onMount(() => {
    window.frameBrush = {
      get inset() { return inset; }, get rootPoints() { return rootPoints; }, get childPoints() { return childPoints; },
      get shared() { return shared; }, get leftPoints() { return leftPoints; }, get rightPoints() { return rightPoints; },
      get columns() { return columns; }, get heightPoints() { return heightPoints; }, get weightPoints() { return weightPoints; },
      get agePoints() { return agePoints; }, get twin() { return twin; }, get twinRootPoints() { return twinRootPoints; },
      get twinPoints() { return twinPoints; }, get logzero() { return logzero; }, get logPoints() { return logPoints; },
      get dated() { return dated; }, get morningPoints() { return morningPoints; },
      data, start,
    };
    return () => { delete window.frameBrush; };
  });
  const n = 40;
  const data = {
    x: Array.from({ length: n }, (_, i) => (i * 37) % 100),
    a: Array.from({ length: n }, (_, i) => (i * 53) % 100),
    b: Array.from({ length: n }, (_, i) => (i * 71) % 100),
    height: Array.from({ length: n }, (_, i) => (i * 29) % 100),
    weight: Array.from({ length: n }, (_, i) => (i * 43) % 100),
    age: Array.from({ length: n }, (_, i) => (i * 61) % 100),
  };
  const columnData = { ...data }, twinData = { x: data.x, a: data.a, b: data.b.map((value) => 2 * value) };
  const logData = { x: [0, 1, 2, 3, 4], y: [0, 10, 100, 1000, 5] };
  const start = Date.UTC(2026, 0, 1, 9);
  const times = (from) => ({ t: Array.from({ length: 10 }, (_, i) => new Date(from + i * 1000)), v: Array.from({ length: 10 }, (_, i) => i) });
  const morning = times(start), later = times(start + 30000);
</script>
<input aria-label="Notes" />
<Plot bind:this={inset} data={data} width={600} height={360} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Points bind:this={rootPoints} x="x" y="a" brush size={2.5} />
  <Frame x={{domain: [0, 100], range: [60, 95]}} y={{domain: [0, 100], range: [10, 90]}}>
    <Points bind:this={childPoints} x="x" y="b" brush={{axis: "y"}} size={2.5} fill="#aa5500" />
  </Frame>
</Plot>
<Plot bind:this={shared} data={data} width={600} height={360} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Frame x={{domain: [0, 100], range: [15, 45]}} y={{domain: [0, 100], range: [10, 90]}}>
    <Points bind:this={leftPoints} x="x" y="a" brush={{axis: "y"}} size={2.5} />
  </Frame>
  <Frame x={{domain: [0, 100], range: [60, 90]}} y={{domain: [0, 100], range: [10, 90]}}>
    <Points bind:this={rightPoints} x="x" y="a" brush={{axis: "y"}} size={2.5} />
  </Frame>
</Plot>
<Plot bind:this={columns} data={columnData} width={600} height={360} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Frame x={{domain: [0, 100], range: [10, 26]}} y={{domain: [0, 100], range: [10, 90]}}>
    <Points bind:this={heightPoints} x="x" y="height" brush size={2.5} />
  </Frame>
  <Frame x={{domain: [0, 100], range: [36, 52]}} y={{domain: [0, 100], range: [10, 90]}}>
    <Points bind:this={weightPoints} x="x" y="weight" brush={{axis: "y"}} size={2.5} />
  </Frame>
  <Frame x={{domain: [0, 100], range: [62, 78]}} y={{domain: [0, 100], range: [10, 90]}}>
    <Points bind:this={agePoints} x="x" y="age" brush={{axis: "y"}} size={2.5} />
  </Frame>
  <Frame x={{domain: [0, 100], range: [86, 98]}} y={{domain: [0, 100], range: [10, 90]}}>
    <Points x="x" y="height" brush={{axis: "y"}} size={2} />
    <Points x="x" y="weight" brush={{axis: "y"}} size={2} fill="#aa5500" />
  </Frame>
</Plot>
<Plot bind:this={twin} data={twinData} width={600} height={360} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Points bind:this={twinRootPoints} x="x" y="a" brush size={2.5} />
  <Frame y={{domain: [0, 200], side: "right"}}>
    <Points bind:this={twinPoints} x="x" y="b" brush={{axis: "y"}} size={2.5} fill="#aa5500" />
  </Frame>
</Plot>
<Plot bind:this={logzero} data={logData} width={600} height={360} axes2d y={{domain: [0, 10], transform: "log"}}>
  <Points bind:this={logPoints} x="x" y="y" brush size={2.5} />
</Plot>
<Plot bind:this={dated} width={600} height={360} axes2d autoBounds>
  <Data value={morning}>
    <Points bind:this={morningPoints} x="t" y="v" brush={{axis: "x"}} size={2.5} />
  </Data>
  <Data value={later}>
    <Points x="t" y="v" size={2.5} fill="#aa5500" />
  </Data>
</Plot>
