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
