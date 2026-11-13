<script>
  import { onMount, untrack } from "svelte";
  import { Theme, themes, Data, Plot, Points, Filter, Slice, continuous } from "$lib";
  let { onready = () => {} } = $props();
  // Plays on load unless the viewer asked for reduced motion.
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let plot = $state(), time = $state(0), playing = $state(!still), minimum = $state(0.3);
  const play = (on) => { playing = on; };
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // 1,500 particles, each sampled at 60 times (90,000 rows). A particle circles its own center
  // at its own speed; Slice interpolates every particle's position at `time`.
  const particles = 1500, steps = 60, rows = particles * steps;
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const particle = Float32Array.from({ length: rows }, (_, r) => Math.floor(r / steps));
  const t = Float32Array.from({ length: rows }, (_, r) => r % steps);
  const speed = Float32Array.from({ length: rows }, (_, r) => 0.05 + 0.95 * noise(particle[r], 1) ** 2);
  const angle = (r) => 2 * Math.PI * noise(particle[r], 2) + t[r] * speed[r] * 0.35 * (noise(particle[r], 5) < 0.5 ? 1 : -1);
  const radius = (r) => 0.15 + 0.5 * noise(particle[r], 3);
  const cx = (r) => 1.6 * (noise(particle[r], 4) - 0.5), cy = (r) => 1.6 * (noise(particle[r], 6) - 0.5);
  const table = {
    particle, time: t, speed,
    x: Float32Array.from({ length: rows }, (_, r) => cx(r) + radius(r) * Math.cos(angle(r))),
    y: Float32Array.from({ length: rows }, (_, r) => cy(r) + radius(r) * Math.sin(angle(r))),
  };
  onMount(() => {
    let frame, last = performance.now();
    const tick = (now) => {
      if (playing) time = (time + (now - last) / 250) % (steps - 1);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    if (import.meta.env.DEV) window.__movingParticles = {
      get plot() { return plot; },
      setTime(value) { play(false); time = value; },
      setMinimum(value) { minimum = value; },
    };
    return () => { cancelAnimationFrame(frame); delete window.__movingParticles; };
  });
</script>
<p>Slice interpolates the position of every particle at the current time, every animation frame, and the Filter keeps the particles faster than the slider. The time reaches the GPU as data, not as a constant compiled into the kernels, so playing compiles nothing after the first frames; so does moving the slider, because the Filter marks the kept particles instead of copying them.</p>
<div class="controls">
  <button onclick={() => play(!playing)}>{playing ? "Pause" : "Play"}</button>
  <label>Minimum speed <input type="range" min="0" max="0.95" step="0.01" bind:value={minimum} /> {minimum.toFixed(2)}</label>
  <span>time {time.toFixed(1)}</span>
</div>
<Theme value={themes.dark}>
  <Data value={table}>
    <Plot bind:this={plot} responsive height={480} axes2d x={{ domain: [-1.5, 1.5] }} y={{ domain: [-1.5, 1.5] }}>
      <Filter where={{ field: "speed", op: "gt", value: minimum }}>
        <!-- Every sample of the kept particles: faint orbits. Additive blending brightens overlaps. -->
        <Points x="x" y="y" size={1} fill="speed" fillScale={continuous({ domain: [0, 1], colormap: "Plasma" })} opacity={0.3}
          blend="additive" maxElements={rows} legend={false} />
        <Slice field="time" at={time} by="particle" values={["x", "y", "speed"]} extent={[0, steps - 1]}>
          <Points x="x" y="y" size={3.5} fill="speed" fillScale={continuous({ domain: [0, 1], colormap: "Plasma" })}
            blend="additive" maxElements={particles} legend={false} />
        </Slice>
      </Filter>
    </Plot>
  </Data>
</Theme>
<style>
  p { font-size: 14px; line-height: 1.5; }
  .controls { display: flex; gap: 16px; align-items: center; font-size: 14px; margin: 8px 0; }
  .controls span { font-variant-numeric: tabular-nums; color: #5b6472; }
</style>
