# Moving particles

1,500 particles circle at their own speeds: Slice interpolates every particle's position at the current time on every animation frame, and a slider filters them by speed. Neither playing nor filtering compiles new GPU kernels once warm.

## Svelte

```svelte
<script>
  import { Theme, themes, Data, Plot, Points, Filter, Slice } from "hmplot";
  // table: 90,000 rows: particle, time (0-59), x, y and speed.
  let time = $state(0), minimum = $state(0.3); // time advances every animation frame
</script>
<input type="range" min="0" max="0.95" step="0.01" bind:value={minimum} />
<Theme value={themes.dark}><Data value={table}>
  <Plot axes2d x={{ domain: [-1.5, 1.5] }} y={{ domain: [-1.5, 1.5] }}>
    <Filter where={{ field: "speed", op: "gt", value: minimum }}>
      <Points x="x" y="y" size={1} fill="speed" colormap="Plasma" opacity={0.3}
        blend="additive" maxElements={90000} />
      <Slice field="time" at={time} by="particle" values={["x", "y", "speed"]}>
        <Points x="x" y="y" size={3.5} fill="speed" colormap="Plasma" blend="additive" />
      </Slice>
    </Filter>
  </Plot>
</Data></Theme>
```
