<script>
  import { untrack } from "svelte";
  import { Theme, themes, Data, Plot, Frame, Points, Rect, continuous, subtract, multiply, divide, cos, exp } from "$lib";
import { Bin } from "$lib/stats/index.js";
  let { onready = () => {} } = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });

  // rho (the Rayleigh number) sets the regime: below about 24.7 every orbit spirals into one of
  // two fixed points; above it the orbit never settles and traces the butterfly.
  let rho = $state(28);
  const steps = 60000, dt = 0.003;
  // Fourth-order Runge-Kutta. 60,000 steps take a few milliseconds, so the slider integrates
  // live, and the row count never changes, so every GPU kernel is reused.
  // Additive blending skips depth writes, so every overlapping point is shaded and blended.
  // Once an orbit settles onto a fixed point, thousands of steps land on the same pixels and
  // the frame rate collapses. A step that has moved less than `minStep` since the last drawn
  // one gets a NaN position (drawn as nothing); its speed still counts in the histogram.
  const minStep = 0.05;
  function integrate(rho) {
    const f = (x, y, z) => [10 * (y - x), x * (rho - z) - y, x * y - (8 / 3) * z];
    const table = { x: new Float32Array(steps), y: new Float32Array(steps), z: new Float32Array(steps),
      speed: new Float32Array(steps), t: new Float32Array(steps) };
    let x = 1, y = 1, z = 20, px = Infinity, py = 0, pz = 0;
    for (let i = 0; i < steps; i++) {
      const a = f(x, y, z), b = f(x + dt / 2 * a[0], y + dt / 2 * a[1], z + dt / 2 * a[2]);
      const c = f(x + dt / 2 * b[0], y + dt / 2 * b[1], z + dt / 2 * b[2]);
      const d = f(x + dt * c[0], y + dt * c[1], z + dt * c[2]);
      x += dt / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0]);
      y += dt / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1]);
      z += dt / 6 * (a[2] + 2 * b[2] + 2 * c[2] + d[2]);
      const v = f(x, y, z);
      if (Math.hypot(x - px, y - py, z - pz) >= minStep) {
        table.x[i] = x; table.y[i] = y; table.z[i] = z;
        px = x; py = y; pz = z;
      } else table.x[i] = table.y[i] = table.z[i] = NaN;
      table.speed[i] = Math.hypot(v[0], v[1], v[2]);
      table.t[i] = i / (steps - 1);
    }
    return table;
  }
  const orbit = $derived(integrate(rho));

  // One ramp for every view: slow (deep violet) to fast (white-hot). Speeds past 320 clamp.
  const glow = continuous({ domain: [0, 320],
    colormap: ["#3a2a80", "#7a36b4", "#e8457a", "#ffb347", "#fff6d8"] });
  const edges = Array.from({ length: 57 }, (_, i) => i * 10);

  // Forty sparks run along the orbit in time order: exp(k (cos(phase) - 1)) is a narrow bump
  // on every cycle of the phase, and @time moves the phase. The GPU evaluates it every frame;
  // the data never changes.
  const phase = multiply(6.283185, subtract(multiply(40, "t"), divide("@time", 2500)));
  const spark = exp(multiply(400, subtract(cos(phase), 1)));
  // Additive blending adds nothing for black, so the spark layer fades from black (invisible
  // between sparks) to white-hot at a peak.
  const sparkRamp = continuous({ domain: [0, 1], colormap: ["#000000", "#ff9d3c", "#fff8e8"] });
</script>

<p>Sixty thousand steps of the Lorenz system, integrated live. Drag the 3D view to orbit it; sparks travel along the trajectory in time order. Shift-drag across the butterfly projection to brush a region: the 3D orbit keeps only those passes lit, and the histogram shows how fast the system moves there. Slide <em>ρ</em> below about 24.7 and the chaos collapses into a spiral toward a fixed point.</p>
<label class="control">ρ = {rho.toFixed(1)}
  <input type="range" min="12" max="35" step="0.1" bind:value={rho} aria-label="Rayleigh number rho" /></label>
<Theme value={themes.dark}>
  <Data value={orbit}>
    <div class="layout">
      <Plot bind:this={plot} type="3d" responsive height={500} antialias="off" cameraPosition={[-70, 45, 160]}>
        <!-- The Lorenz z axis points up, so it maps to the plot's vertical y. -->
        <Frame x={{ domain: [-30, 30], label: "x" }} y={{ domain: [0, 65], label: "z" }}
          z={{ domain: [-35, 35], label: "y" }}>
          <!-- Low opacity: seen edge-on, a wing stacks dozens of points per pixel, and additive
               blending would saturate them to white. -->
          <Points x="x" y="z" z="y" fill="speed" fillScale={glow} size={1.25} opacity={0.45}
            blend="additive" respond="brushed" label="Orbit" legend={false} />
          <Points x="x" y="z" z="y" fill={spark} fillScale={sparkRamp} size={2.5} blend="additive"
            respond={false} label="Sparks" legend={false} />
        </Frame>
      </Plot>
      <div class="side">
        <Plot responsive height={280} axes2d antialias="off" x={{ domain: [-30, 30], label: "x" }}
          y={{ domain: [0, 65], label: "z" }}>
          <Points x="x" y="z" fill="speed" fillScale={glow} size={0.75} blend="additive"
            brush respond="brushed" label="Projection" legend={false} />
        </Plot>
        <Plot responsive height={210} axes2d antialias="off" x={{ domain: [0, 560], label: "speed" }}
          y={{ label: "steps" }}>
          <!-- The dim bars count every step; the bright ones only the brushed steps (all of
               them when nothing is brushed). weight="@brushed" reuses the same kernels. -->
          <Bin x="speed" bins={edges}>
            <Rect x0="x0" x1="x1" y0={0} y1="count" fill="#3b3363" legend={false} />
          </Bin>
          <Bin x="speed" bins={edges} weight="@brushed">
            <Rect x0="x0" x1="x1" y0={0} y1="count" fill="#ffb347" legend={false} />
          </Bin>
        </Plot>
      </div>
    </div>
  </Data>
</Theme>

<style>
  p { font-size: 14px; line-height: 1.5; }
  .control { display: flex; gap: 10px; align-items: center; margin: 8px 0 12px; font-size: 14px; }
  .control input { width: 220px; }
  .layout { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 12px; }
  .side { display: grid; gap: 12px; align-content: start; }
  @media (max-width: 760px) { .layout { grid-template-columns: minmax(0, 1fr); } }
</style>
