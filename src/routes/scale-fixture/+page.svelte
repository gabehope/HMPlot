<script>
  import { onMount } from "svelte";
  import { Plot, Data, Points, Heatmap, continuous, table } from "$lib/index";

  const first = table({ x: [0, 1], y: [0, 1], temperature: [0, 10] });
  const unrelated = { x: [0, 1], y: [0, 1], temperature: [100, 200] };
  const deliberate = continuous({ colormap: "Inferno" });
  const raster = continuous({ colormap: "Viridis" });
  let scaleSettings = $state({ color: { colormap: "Viridis" } });
  let plot, a, b, c, d, e, f, g, h, symlogPlot, logPlot;
  onMount(() => {
    window.__scaleFixture = {
      settled: () => plot?.whenSettled(),
      // TODO 39.1-39.2: a symlog axis, and a log axis with a zero.
      transformed: { symlog: () => symlogPlot, log: () => logPlot },
      setAutomaticColormap: (colormap) => { scaleSettings = { color: { colormap } }; },
      read: () => [a, b, c, d, e, f, g, h].map((handle) => {
        const mark = handle?.getMark?.();
        return mark ? {
          domain: mark.options.get("valueBounds"),
          colormap: mark.options.get("cmapIndex"),
          normalization: mark.options.get("normalization"),
          scale: mark.view.marks.of(mark)?.scales?.fill?.id,
        } : null;
      }),
    };
    return () => delete window.__scaleFixture;
  });
</script>

<Plot bind:this={plot} data={first} width={420} height={300} axes2d scaleDefaults={scaleSettings} settings={{ showTrigger: false }}>
  <Points bind:this={a} x="x" y="y" fill="temperature" size={4} />
  <Points bind:this={b} x="x" y="y" fill="temperature" size={5} />
  <Points bind:this={h} x="x" y="y" fill="temperature" colormap="Inferno" size={3.5} />
  <Data value={unrelated}>
    <Points bind:this={c} x="x" y="y" fill="temperature" size={3} />
    <Points bind:this={d} x="x" y="y" fill="temperature" fillScale={deliberate} size={2.5} />
  </Data>
  <Points bind:this={e} x="x" y="y" fill="temperature" fillScale={deliberate} size={2} />
</Plot>
<Plot width={220} height={180} settings={{ showTrigger: false }}>
  <Heatmap bind:this={g} fill={[[0, 1], [2, 3]]} fillScale={raster} />
</Plot>
<Plot width={420} height={180} settings={{ showTrigger: false }}>
  <Points bind:this={f} position={[[0, 0], [1, 1]]} fill={[30, 40]}
    fillScale={deliberate} size={4} />
</Plot>
<Plot bind:this={symlogPlot} width={420} height={300} axes2d x={{ domain: [0, 4] }}
  y={{ domain: [-1000, 1000], transform: "symlog", tickCount: 9 }} settings={{ showTrigger: false }}>
  <Points x={[1, 2, 3]} y={[0, 10, -100]} fill="#d62728" size={6} />
</Plot>
<Plot bind:this={logPlot} width={420} height={200} axes2d x={{ domain: [0, 4] }}
  y={{ domain: [1, 1000], transform: "log" }} settings={{ showTrigger: false }}>
  <Points x={[1, 2, 3]} y={[0, 10, 100]} fill="#d62728" size={6} />
</Plot>
