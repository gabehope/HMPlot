# Particles without an uploaded table

Data(rows) generates row indices, ones and fixed random values on the GPU; Simulate moves the particles without a dummy table from Python.

## Python

```python
import hmplot as hm
import math

# Only these properties travel to the browser; no dummy NumPy table is uploaded.
initial = {"angle": hm.row() * (2 * math.pi / 256)}
update = {"angle": hm.prev.angle + (1 + hm.col.random) * hm.view.dt / 1000}
with hm.Scene() as scene:
    hm.Checkbox(name="running", label="Run simulation", value=False)
    with hm.Data(rows=256), hm.Calculate(columns={"random": hm.random(seed=0)}):
        with hm.Simulate(initial=initial, update=update, running=hm.input.running):
            with hm.Plot(height=360, responsive=True, x={"domain": [-2, 2]}, y={"domain": [-2, 2]}):
                hm.Points(x=(0.5 + hm.col.random) * hm.cos(hm.col.angle),
                          y=(0.5 + hm.col.random) * hm.sin(hm.col.angle),
                          fill="random", fill_scale=hm.continuous(domain=[0, 1]), size=5)
scene
```

## Svelte

```svelte
<script>
  import { Data, Calculate, row, random, InputContext, Checkbox, Simulate, Plot, Points,
    add, multiply, divide, cos, sin, prev, input, view,
    continuous,
  } from "hmplot";
  let { onready } = $props();
  let plot = $state();
  const initial = { angle: multiply(row(), 2 * Math.PI / 256) };
  const update = { angle: add(prev("angle"), multiply(add(1, "random"), divide(view.dt, 1000))) };
  $effect(() => { if (plot) onready?.(plot); });
</script>

<InputContext>
  <Checkbox name="running" label="Run simulation" value={false} />
  <Data rows={256}>
    <Calculate columns={{ random: random({ seed: 0 }) }}>
    <Simulate {initial} {update} running={input.running}>
      <Plot bind:this={plot} responsive height={360} x={{ domain: [-2, 2] }} y={{ domain: [-2, 2] }}>
        <Points x={multiply(add(0.5, "random"), cos("angle"))}
          y={multiply(add(0.5, "random"), sin("angle"))} fill="random" fillScale={continuous({ domain: [0, 1] })} size={5} />
      </Plot>
    </Simulate>
    </Calculate>
  </Data>
</InputContext>
```
