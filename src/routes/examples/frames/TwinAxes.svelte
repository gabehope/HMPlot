<script>
  import { Plot, Frame, Line, Minimap } from "$lib";
  let { plot = $bindable() } = $props();
  const data = {
    hour: Array.from({ length: 25 }, (_, i) => i),
    temperature: Array.from(
      { length: 25 },
      (_, i) => 15 + 8 * Math.sin((i / 24) * Math.PI * 2),
    ),
    rain: Array.from({ length: 25 }, (_, i) =>
      Math.max(0, 12 * Math.cos(i / 5)),
    ),
  };
  let rainfall = $state();
</script>

<Plot bind:this={plot} {data} responsive height={420} legend>
  <Frame
    name="Temperature"
    x={{ domain: [0, 24], label: "Hour" }}
    y={{ domain: [5, 25], label: "Temperature · °C" }}
  >
    <Line x="hour" y="temperature" color="#547ba2" label="Temperature" />
  </Frame>
  <Frame
    bind:this={rainfall}
    name="Rainfall"
    x={{ domain: [0, 24], visible: false }}
    y={{ domain: [0, 15], label: "Rainfall · mm", side: "right" }}
  >
    <Line x="hour" y="rain" color="#cf8955" label="Rainfall" />
  </Frame>
</Plot>
<Minimap
  for={plot}
  axis={rainfall}
  width={600}
  height={100}
  axes={{ x: true, y: false }}
/>
