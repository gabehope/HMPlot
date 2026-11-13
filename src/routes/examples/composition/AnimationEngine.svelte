<script>
  import { untrack } from "svelte";
  import { Plot, Data, Points, animate, multiply, sin, cos, add, divide } from "$lib";
  let {onready = () => {}} = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // Twelve keyed rows; each step drops one, adds one, and rescales the rest.
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  let step = $state(0);
  const rows = $derived.by(() => {
    const ids = Array.from({ length: 12 }, (_, i) => `r${(i + step) % 15}`);
    return {
      id: ids,
      x: ids.map((_, i) => 1 + i),
      // y spans three decades on a log axis; animate() moves each point geometrically.
      y: ids.map((id, i) => 10 ** (1 + 2 * noise(i + step, 1))),
    };
  });
  // The satellites have fixed rows of their own: a @time channel follows its data at once,
  // with no transition, so fixed data leaves the clock as their only motion.
  const slot = Array.from({ length: 12 }, (_, i) => i);
  const slots = { x: slot.map((i) => 1 + i), y: slot.map(() => 3), angle: slot };
</script>
<p><code>animate()</code> moves a channel per row in its scale space: on this log axis every point passes through the geometric midpoint, new rows rise from <code>enter</code> and departing rows sink to <code>exit</code> before they go. The satellites read <code>@time</code>, so they orbit continuously without ever holding up <code>whenSettled()</code>. They sit on a <code>Data</code> of their own: a <code>@time</code> channel has no transition, so on the keyed rows they would jump to each update's new values.</p>
<div class="controls"><button onclick={() => step++}>Next keyed update</button></div>
<Plot bind:this={plot} data={rows} key="id" responsive height={400} axes2d
  x={{ domain: [0, 13] }} y={{ domain: [1, 2000], transform: "log" }}>
  <Points x="x" y={animate("y", { duration: 900, easing: "cubic-in-out", enter: 1, exit: 1500 })}
    size={7} fill="#547ba2" label="Values" />
  <Data value={slots}>
    <Points x={add("x", multiply(0.35, cos(add(divide("@time", 700), "angle"))))}
      y={multiply("y", add(1, multiply(0.25, sin(add(divide("@time", 700), "angle")))))}
      size={3} fill="#cf8955" label="Satellites" legend={false} />
  </Data>
</Plot>
<style>p {font-size:14px;line-height:1.5} .controls {margin: 8px 0} button {padding: 4px 10px}</style>
