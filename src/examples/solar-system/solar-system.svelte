<script>
  import { onMount } from "svelte";
  import { InputContext, Playback, Slider, Checkbox, Plot, Frame, Image, Line, Text } from "hmplot";
  import sun from "./sun.jpg";
  import stars from "./stars_milky_way.jpg";
  import ringFile from "./saturn_ring_alpha.png";

  // The Sun and the eight planets as textured spherical Frames placed in a 3D scene, orbiting at
  // their true periods and spinning on tilted axes. The Date control plays the clock; each body's
  // placement follows it.
  const maps = import.meta.glob("./*.jpg", { query: "?url", import: "default", eager: true });

  // Mean distance (AU), radius (km), orbital period (years), rotation period (days, negative for
  // retrograde), axial tilt (degrees) and mean longitude at J2000 (degrees).
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
  const SUN = { day: 25.4, tilt: 7.25 }, SUN_DIAMETER = 6;
  // Saturn's rings span 1.24 to 2.27 Saturn radii (the C ring to the A ring's edge).
  const RING_INNER = 1.24, RING_OUTER = 2.27;
  // Not to scale: distances grow with the square root of the true distance and radii with
  // (radius / Earth's)^0.45, so Mercury and Neptune fit one view and every planet is visible.
  const orbitRadius = (au) => 3.5 + 8 * Math.sqrt(au);
  const diameter = (km) => 2.2 * (km / 6371) ** 0.45;
  // Spins are slowed to be seen: one turn in seconds (at 20 days a second) that grow slowly with
  // the true period.
  const spinSeconds = (day) => 6 * Math.abs(day) ** 0.35;

  // Days since J2000 (2000-01-01 12:00 UTC), from the Date control's value.
  const J2000 = new Date(Date.UTC(2000, 0, 1, 12));
  let context = $state(), speed = $state(20), orbits = $state(true), labels = $state(true), showStars = $state(true), glow = $state(true);
  const days = $derived(((context?.getValues().date ?? J2000) - J2000) / 86400000);
  // A planet's placement on the day: on its orbit, sized, spun about its tilted axis.
  const bodies = $derived(PLANETS.map((planet) => {
    const angle = (planet.longitude * Math.PI) / 180 + (2 * Math.PI * days) / (365.25 * planet.year);
    const r = orbitRadius(planet.au), d = diameter(planet.km);
    const spin = (Math.sign(planet.day) * 360 * days) / 20 / spinSeconds(planet.day);
    return { anchor: [r * Math.cos(angle), 0, -r * Math.sin(angle)], size: [d, d, d], rotation: [planet.tilt, spin, 0] };
  }));
  const orbit = (au) => Array.from({ length: 161 }, (_, i) => {
    const angle = (i / 160) * 2 * Math.PI;
    return [orbitRadius(au) * Math.cos(angle), 0, -orbitRadius(au) * Math.sin(angle)];
  });

  // Saturn's rings over the polar Frame's grid: angle across (two equal columns), radius down
  // from the outer edge (top row) to the inner. The ring texture runs inner to outer, its gaps in
  // alpha.
  let rings = $state.raw();
  onMount(async () => {
    const bitmap = await createImageBitmap(await (await fetch(ringFile)).blob());
    const { width: w, height: h } = bitmap, canvas = new OffscreenCanvas(w, h), context2d = canvas.getContext("2d");
    context2d.drawImage(bitmap, 0, 0);
    const pixels = context2d.getImageData(0, 0, w, h).data;
    rings = Array.from({ length: 512 }, (_, row) => {
      const x = Math.min(w - 1, Math.floor(((511 - row) / 512) * w)), mean = [0, 0, 0, 0];
      for (let y = 0; y < h; y++) for (let c = 0; c < 4; c++) mean[c] += pixels[(y * w + x) * 4 + c] / h / 255;
      return [mean, mean];
    });
  });
  const globe = { coordinates: "spherical", x: { domain: [-180, 180] }, y: { domain: [-90, 90] } };
  const hidden = { domain: [-1, 1], visible: false };
</script>

<InputContext bind:this={context}>
  <div class="controls">
    <!-- Plays from J2000 through Neptune's year, at the slider's days a second. -->
    <Playback name="date" label="Date" min={J2000} max={new Date(J2000.getTime() + 60200 * 86400000)} value={J2000}
      rate={speed * 86400000} loop autoplay format="%Y-%m-%d" />
    <Slider name="speed" label="Days per second" min={1} max={200} step={1} bind:value={speed} />
    <Checkbox name="orbits" label="Orbits" bind:value={orbits} />
    <Checkbox name="labels" label="Labels" bind:value={labels} />
    <Checkbox name="stars" label="Stars" bind:value={showStars} />
    <Checkbox name="glow" label="Glow" bind:value={glow} />
  </div>
  {#if rings}
    <!-- The stars and the Milky Way all around, behind everything; they turn with the view. -->
    <Plot type="3d-y-up" height={560} background="#04060d" toneMapping={0} name="Solar system" cameraPosition={[0, 52, 92]}
      effects={[{ kind: "sky", image: stars, visible: showStars }]}
      x={{ domain: [-50, 50], visible: false }} y={{ domain: [-50, 50], visible: false }} z={{ domain: [-50, 50], visible: false }}
      lights={[{ kind: "ambient", intensity: 0.18 }, { kind: "point", position: [0, 0, 0], intensity: 3.2, decay: 0 }]}>
      <!-- The Sun's light: from its center, not dimming with distance. -->
      {#each PLANETS as planet (planet.name)}<Line position={orbit(planet.au)} color="#3a4560" width={1} visible={orbits} />{/each}
      <!-- The Sun is unlit: its Image is its own light, and it glows. -->
      <Frame name="Sun" {...globe} placement={{ anchor: [0, 0, 0], size: [SUN_DIAMETER, SUN_DIAMETER, SUN_DIAMETER],
        rotation: [SUN.tilt, (360 * days) / 20 / spinSeconds(SUN.day), 0] }}>
        <Image data={sun} glow={glow ? 1 : 0} />
      </Frame>
      {#each PLANETS as planet, i (planet.name)}
        {@const place = bodies[i]}
        <!-- A planet: a spherical Frame at its orbital position, spun about its tilted axis,
             showing its map lit by the Sun; Earth with its atmosphere's blue rim. -->
        <Frame name={planet.name} {...globe} placement={place} atmosphere={planet.name === "Earth" ? { thickness: 0.25 } : false}>
          <Image data={maps[`./${planet.texture}.jpg`]} lit />
        </Frame>
        {#if planet.name === "Saturn"}
          <!-- The rings lie in the planet's equator: the polar plane turned onto it, then tilted. -->
          <Frame name="Saturn's rings" coordinates="polar" angleUnit="degrees" baseRadius={0}
            x={{ domain: [0, 360], visible: false }} y={{ domain: [0, RING_OUTER], visible: false }} z={{ visible: false }}
            placement={{ anchor: place.anchor, size: Array(3).fill(place.size[0] * RING_OUTER), rotation: [planet.tilt - 90, 0, 0] }}>
            <Image data={rings} xbounds={[0, 360]} ybounds={[RING_INNER, RING_OUTER]} />
          </Frame>
        {/if}
        <!-- The label rides in its own small placed Frame above the planet. -->
        <Frame name={`${planet.name} label`} x={hidden} y={hidden} z={hidden}
          placement={{ anchor: [place.anchor[0], place.size[0] / 2 + 1.2, place.anchor[2]], size: [1, 1, 1] }}>
          <Text position={[[0, 0, 0]]} text={[planet.name]} size={12} color="#dce7f4" visible={labels} />
        </Frame>
      {/each}
    </Plot>
  {/if}
  <p class="note">The Sun and planets are spherical Frames placed in a 3D Cartesian scene; each shows its surface map, spins on its tilted axis, and orbits at its true period (days per second sets the pace). Not to scale: distances grow with the square root of the true distance, radii are exaggerated, and spins are slowed. Drag to orbit the view, scroll to zoom. Planet and star textures: <a href="https://www.solarsystemscope.com/textures/">Solar System Scope</a>, CC BY 4.0.</p>
</InputContext>

<style>
  /* Python's Scene(gap=12), Row(wrap=True, min_width=0) and Markdown(font_size=13, color="#667085"). */
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-bottom: 12px; }
  .note { font-size: 13px; color: #667085; margin-top: 12px; }
</style>
