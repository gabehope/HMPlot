<script>
  // A 3D solar system: the Sun and the eight planets as textured spherical Frames placed in a
  // Cartesian scene, orbiting on the animation clock and spinning on tilted axes.
  import { onMount, onDestroy, untrack } from "svelte";
  import { T } from "@threlte/core";
  import { numpy as np } from "@hmplot/jax";
  import { Plot, Frame, Image, Line, Text, initializePlot } from "$lib";
  // The textures live with the paired example (src/examples/solar-system, TODO 69.10).
  const files = import.meta.glob("../../../examples/solar-system/*.{jpg,png}", { query: "?url", import: "default", eager: true });
  const file = (name) => files[`../../../examples/solar-system/${name}`];

  let { plot = $bindable(), onready = undefined } = $props();
  $effect(() => { const ready = plot; untrack(() => onready?.(ready)); });

  // Mean distance (AU), radius (km), orbital period (years), rotation period (days, negative
  // for retrograde), axial tilt (degrees) and mean longitude at J2000 (degrees).
  const PLANETS = [
    { name: "Mercury", texture: "mercury", au: 0.387, km: 2440, year: 0.241, day: 58.6, tilt: 0.03, longitude: 252.25 },
    { name: "Venus", texture: "venus_atmosphere", au: 0.723, km: 6052, year: 0.615, day: -243, tilt: 177.4, longitude: 181.98 },
    { name: "Earth", texture: "earth_daymap", au: 1, km: 6371, year: 1, day: 1, tilt: 23.44, longitude: 100.46 },
    { name: "Mars", texture: "mars", au: 1.524, km: 3390, year: 1.881, day: 1.03, tilt: 25.19, longitude: 355.45 },
    { name: "Jupiter", texture: "jupiter", au: 5.203, km: 69911, year: 11.86, day: 0.414, tilt: 3.13, longitude: 34.4 },
    { name: "Saturn", texture: "saturn", au: 9.537, km: 58232, year: 29.46, day: 0.444, tilt: 26.73, longitude: 49.94 },
    { name: "Uranus", texture: "uranus", au: 19.19, km: 25362, year: 84.0, day: -0.718, tilt: 97.77, longitude: 313.23 },
    { name: "Neptune", texture: "neptune", au: 30.07, km: 24622, year: 164.8, day: 0.671, tilt: 28.32, longitude: 304.88 },
  ];
  const SUN = { name: "Sun", texture: "sun", day: 25.4, tilt: 7.25 };
  // Not to scale: distances grow with the square root of the true distance and radii with
  // (radius / Earth's)^0.45, so Mercury and Neptune fit one view and every planet is visible.
  const orbitOf = (au) => 3.5 + 8 * Math.sqrt(au);
  const diameterOf = (km) => 2.2 * (km / 6371) ** 0.45;
  const SUN_DIAMETER = 6;
  // Saturn's rings span 1.24 to 2.27 Saturn radii (the C ring to the A ring's edge).
  const RING_INNER = 1.24, RING_OUTER = 2.27;
  // Spins are slowed to be visible: a period in seconds that grows slowly with the true one.
  const spinSeconds = (day) => 6 * Math.abs(day) ** 0.35;

  const orbits = PLANETS.map((planet) => Array.from({ length: 161 }, (_, i) => {
    const angle = (i / 160) * 2 * Math.PI, r = orbitOf(planet.au);
    return [r * Math.cos(angle), 0, -r * Math.sin(angle)];
  }));

  let seconds = $state(0), playing = $state(true), speed = $state(20), showOrbits = $state(true), showLabels = $state(true);
  let showStars = $state(true), sunGlow = $state(true);
  let textures = $state.raw(null), error = $state("");
  // Days since J2000 (2000-01-01 12:00 UTC) advance at `speed` days per second.
  let days = $state(0);
  const date = $derived(new Date(Date.UTC(2000, 0, 1, 12) + days * 86400000).toISOString().slice(0, 10));
  // Only the placements change as time passes. The marks inside read the fixed planet list, so
  // a new frame moves each Frame (its matrix) and re-prepares nothing.
  const placements = $derived(PLANETS.map((planet) => {
    const angle = (planet.longitude + (360 * days) / (365.25 * planet.year)) * Math.PI / 180, r = orbitOf(planet.au);
    const diameter = diameterOf(planet.km), anchor = [r * Math.cos(angle), 0, -r * Math.sin(angle)];
    const spin = (Math.sign(planet.day) * 360 * seconds) / spinSeconds(planet.day);
    return {
      body: { anchor, size: [diameter, diameter, diameter], rotation: [planet.tilt, spin, 0] },
      label: { anchor: [anchor[0], diameter / 2 + 1.2, anchor[2]], size: [1, 1, 1] },
      // The rings lie in the planet's equator: the polar plane turned onto it, then tilted.
      rings: planet.name === "Saturn" ? { anchor, size: Array(3).fill(diameter * RING_OUTER),
        rotation: [planet.tilt - 90, 0, 0] } : null,
    };
  }));
  const sunPlacement = $derived({ anchor: [0, 0, 0], size: [SUN_DIAMETER, SUN_DIAMETER, SUN_DIAMETER],
    rotation: [SUN.tilt, (360 * seconds) / spinSeconds(SUN.day), 0] });

  const abort = new AbortController();
  async function decode(name) {
    const response = await fetch(file(`${name}.jpg`), { signal: abort.signal });
    if (!response.ok) throw Error(`Could not load the ${name} texture (${response.status}). Reload to retry.`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const { width: w, height: h } = bitmap;
      // One-time image decoding into an RGB array (top-down rows, as Image expects).
      const canvas = new OffscreenCanvas(w, h), context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, w, h).data, values = new Float32Array(w * h * 3);
      for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) values[i * 3 + c] = pixels[i * 4 + c] / 255;
      return { values, shape: [h, w, 3] };
    } finally { bitmap.close(); }
  }
  /** Saturn's rings as an image over the polar Frame's grid: angle across (constant), radius
   * down, from the outer edge (top row) to the inner. The ring texture runs inner to outer, with
   * its gaps in the alpha channel. */
  async function ringImage() {
    const response = await fetch(file("saturn_ring_alpha.png"), { signal: abort.signal });
    if (!response.ok) throw Error(`Could not load the ring texture (${response.status}). Reload to retry.`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const { width: w, height: h } = bitmap;
      const canvas = new OffscreenCanvas(w, h), context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, w, h).data, rows = 512, values = new Float32Array(rows * 2 * 4);
      for (let row = 0; row < rows; row++) {
        const x = Math.min(w - 1, Math.floor(((rows - 1 - row) / rows) * w)), sum = [0, 0, 0, 0];
        for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) sum[c] += pixels[(y * w + x) * 4 + c];
        for (let col = 0; col < 2; col++) for (let c = 0; c < 4; c++) values[(row * 2 + col) * 4 + c] = sum[c] / h / 255;
      }
      return { values, shape: [rows, 2, 4] };
    } finally { bitmap.close(); }
  }
  onMount(() => {
    (async () => {
      await initializePlot();
      const names = [SUN.texture, ...PLANETS.map((planet) => planet.texture)];
      const [decoded, ring] = await Promise.all([Promise.all(names.map(decode)), ringImage()]);
      abort.signal.throwIfAborted();
      const arrays = {};
      try {
        names.forEach((name, i) => { arrays[name] = np.array(decoded[i].values).reshape(decoded[i].shape); });
        arrays.rings = np.array(ring.values).reshape(ring.shape);
      } catch (e) { Object.values(arrays).forEach((a) => a.dispose()); throw e; }
      textures = arrays;
    })().catch((e) => { if (!abort.signal.aborted) error = e.message; });
    let frame, previous;
    const tick = (now) => {
      if (previous !== undefined && playing) {
        const step = Math.min(0.05, (now - previous) / 1000);
        seconds += step;
        days += step * speed;
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); abort.abort(); };
  });
  onDestroy(() => {
    const arrays = Object.values(textures ?? {});
    Promise.resolve(plot?.whenSettled()).catch(() => {}).finally(() => arrays.forEach((a) => a.dispose()));
  });
</script>

<div class="solar-controls">
  <button type="button" onclick={() => (playing = !playing)}>{playing ? "Pause" : "Play"}</button>
  <label>Days per second <input aria-label="Days per second" type="range" min="1" max="200" step="1" bind:value={speed} /><output>{speed}</output></label>
  <label><input type="checkbox" bind:checked={showOrbits} /> Orbits</label>
  <label><input type="checkbox" bind:checked={showLabels} /> Labels</label>
  <label><input type="checkbox" bind:checked={showStars} /> Stars</label>
  <label><input type="checkbox" bind:checked={sunGlow} /> Glow</label>
  <output aria-label="Date">{date}</output>
</div>
{#if error}<p role="alert">{error}</p>
{:else if textures}
  <Plot bind:this={plot} type="3d-y-up" responsive height={560} background="#04060d" toneMapping={0} name="Solar system"
    cameraPosition={[0, 52, 92]} x={{ domain: [-50, 50], visible: false }} y={{ domain: [-50, 50], visible: false }}
    z={{ domain: [-50, 50], visible: false }}
    effects={showStars ? [{ kind: "sky", image: file("stars_milky_way.jpg") }] : []}>
    <T.AmbientLight intensity={0.18} />
    <T.PointLight position={[0, 0, 0]} intensity={3.2} decay={0} />
    {#if showOrbits}
      {#each orbits as path, i (PLANETS[i].name)}<Line position={path} color="#3a4560" width={1} />{/each}
    {/if}
    <!-- The Sun is unlit: its Image is its own light, and it glows. -->
    <Frame name="Sun" coordinates="spherical" x={{ domain: [-180, 180] }} y={{ domain: [-90, 90] }} placement={sunPlacement}>
      <Image data={textures[SUN.texture]} glow={sunGlow ? 1 : 0} />
    </Frame>
    {#each PLANETS as planet, i (planet.name)}
      <!-- A planet: a spherical Frame at its orbital position, spun about its tilted axis, showing
           its map lit by the Sun. -->
      <Frame name={planet.name} coordinates="spherical" x={{ domain: [-180, 180] }} y={{ domain: [-90, 90] }}
        placement={placements[i].body} atmosphere={planet.name === "Earth" ? { thickness: 0.25 } : false}>
        <Image data={textures[planet.texture]} lit />
      </Frame>
      {#if placements[i].rings}
        <!-- Saturn's rings: the ring texture over a polar Frame (angle around, radius out) whose
             plane is Saturn's equator. -->
        <Frame name="Saturn's rings" coordinates="polar" angleUnit="degrees" baseRadius={0}
          x={{ domain: [0, 360], visible: false }} y={{ domain: [0, RING_OUTER], visible: false }} z={{ visible: false }}
          placement={placements[i].rings}>
          <Image data={textures.rings} xbounds={[0, 360]} ybounds={[RING_INNER, RING_OUTER]} />
        </Frame>
      {/if}
      {#if showLabels}
        <!-- The label rides in its own small placed Frame above the planet. -->
        <Frame name={`${planet.name} label`} placement={placements[i].label}
          x={{ domain: [-1, 1], visible: false }} y={{ domain: [-1, 1], visible: false }} z={{ domain: [-1, 1], visible: false }}>
          <Text position={[[0, 0, 0]]} text={[planet.name]} size={12} color="#dce7f4" />
        </Frame>
      {/if}
    {/each}
  </Plot>
{:else}<p class="solar-note">Loading planet textures…</p>{/if}
<p class="solar-note">The Sun and planets are spherical Frames placed in a 3D Cartesian scene; each shows its
  surface map, spins on its tilted axis, and orbits at its true period (days per second sets the
  pace). Not to scale: distances grow with the square root of the true distance, radii are
  exaggerated, and spins are slowed. Drag to orbit the view, scroll to zoom. Planet and star
  textures: <a href="https://www.solarsystemscope.com/textures/">Solar System Scope</a>, CC BY 4.0.</p>

<style>
  .solar-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 10px; }
  .solar-controls label { display: flex; align-items: center; gap: 8px; }
  .solar-controls input[type="range"] { width: 140px; }
  .solar-controls output { font-variant-numeric: tabular-nums; }
  .solar-note { font-size: 13px; line-height: 1.45; color: #667085; }
</style>
