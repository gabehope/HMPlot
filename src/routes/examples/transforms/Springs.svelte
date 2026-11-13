<script lang="ts">
  import { onMount } from "svelte";
  import {
    Button, Checkbox, Data, InputContext, Plot, Points, Simulate, Slider,
    add, col, divide, input, multiply, prev, subtract, where,
  } from "$lib";
  let { onready } = $props();
  let plot = $state<any>();
  let simulation = $state<any>();
  // A ring of points, each on a spring to its place in the ring. They start pulled in and
  // twisted; a clicked point's place moves out.
  const count = 48;
  const angle = (i) => (i / count) * Math.PI * 2;
  const data = {
    id: Array.from({ length: count }, (_, i) => i),
    rx: Array.from({ length: count }, (_, i) => Math.cos(angle(i))),
    ry: Array.from({ length: count }, (_, i) => Math.sin(angle(i))),
    x0: Array.from({ length: count }, (_, i) => 0.3 * Math.cos(angle(i) + 1.2)),
    y0: Array.from({ length: count }, (_, i) => 0.3 * Math.sin(angle(i) + 1.2)),
  };
  // Seconds per step, and each axis's velocity after this step: the spring's pull toward the
  // point's place, less damping. Position moves by the new velocity, so the update of x repeats
  // the one of vx (every update reads the previous step only).
  const seconds = divide("@dt", 1000);
  const place = (axis) => where("@selected", multiply(col(`r${axis}`), 1.6), col(`r${axis}`));
  const pull = (axis) => subtract(
    multiply(input("stiffness"), subtract(place(axis), prev(axis))),
    multiply(input("damping"), prev(`v${axis}`)));
  const velocity = (axis) => add(prev(`v${axis}`), multiply(pull(axis), seconds));
  const initial = { x: "x0", y: "y0", vx: 0, vy: 0 };
  const update = {
    vx: velocity("x"), vy: velocity("y"),
    x: add(prev("x"), multiply(velocity("x"), seconds)),
    y: add(prev("y"), multiply(velocity("y"), seconds)),
  };
  $effect(() => {
    if (plot) onready?.(plot);
  });
  onMount(() => {
    if (import.meta.env.DEV) (window as any).__springsExample = { get plot() { return plot; }, get simulation() { return simulation; } };
    return () => delete (window as any).__springsExample;
  });
</script>

<!-- Simulate steps each row's state every 16 ms of its clock, whatever the frame rate: an update
     reads the previous step (prev), the data (col), the step ("@dt"), inputs and the rows'
     selection. It stops when no position moves more than 0.0005 in 30 steps; Kick starts again,
     and Run pauses. -->
<InputContext>
  <div class="controls">
    <Slider name="stiffness" min={5} max={120} step={1} value={40} label="Stiffness" />
    <Slider name="damping" min={0} max={12} step={0.5} value={3} label="Damping" />
    <Checkbox name="run" value={true} label="Run" />
    <Button name="kick" label="Kick" />
  </div>
  <Data value={data} key="id">
    <Simulate bind:this={simulation} {initial} {update} step={16} running={input("run")} reset={input("kick")}
      stop={{ tolerance: 0.0005, every: 30, columns: ["x", "y"] }}>
      <Plot responsive bind:this={plot} height={360} axes2d x={{ domain: [-2, 2] }} y={{ domain: [-2, 2] }}>
        <Points x="x" y="y" size={where("@selected", 6, 4)} fill="#547ba2" select />
      </Plot>
    </Simulate>
  </Data>
</InputContext>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: end;
  }
</style>
