<script>
  import { Plot, Line, Points } from "$lib";
  let angularStep = $state(45),
    radialStep = $state(1),
    minor = $state(false);
  const data = Array.from({ length: 49 }, (_, i) => ({
    angle: i * 7.5,
    radius: 2 + 0.6 * Math.cos((i * Math.PI) / 6),
  }));
</script>

<label>Angular step <input aria-label="Angular step" type="number" bind:value={angularStep} /></label>
<label>Radial step <input aria-label="Radial step" type="number" bind:value={radialStep} /></label>
<label><input aria-label="Minor guides" type="checkbox" bind:checked={minor} /> Minor guides</label>
<Plot
  {data}
  coordinates="polar"
  baseRadius={0}
  radialScale={1}
  x={{ domain: [0, 360], step: angularStep, minor, subdivisions: 2 }}
  y={{ domain: [0, 3], step: radialStep, minor, subdivisions: 2, format: ".1f" }}
  axes2d
  width={600}
  height={500}
>
  <Line x="angle" y="radius" width={2} color="#547ba2" />
  <Points x="angle" y="radius" size={2.5} fill="#cf8955" />
</Plot>
