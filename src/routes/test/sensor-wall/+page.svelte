<script>
  // TODO 143: the complex eval's sensor wall, with synthetic readings: 36 small Plots whose x
  // domains read the overview's brush bounds ([coalesce(min(@brush_min:day), 0), ...]), each over
  // its own sensor's hourly table, and the daily overview with an x brush.
  import { onMount } from "svelte";
  import { Data, Plot, Line, Points, Filter, Title, min, max, coalesce } from "$lib/index";
  // Six-hourly here (the eval's were hourly): the wall's CPU work does not depend on the rows.
  const hours = 366 * 4, sensors = 36;
  const daily = { day: Array.from({ length: 366 }, (_, d) => d), temp: Array.from({ length: 366 }, (_, d) => 10 + 8 * Math.sin((d - 100) / 58)) };
  const tables = Array.from({ length: sensors }, (_, s) => {
    const day = new Float32Array(hours), temp = new Float32Array(hours), anomaly = new Uint8Array(hours);
    for (let h = 0; h < hours; h++) {
      day[h] = h / 4;
      temp[h] = 10 + 8 * Math.sin((h / 4 - 100) / 58) + 3 * Math.sin(h / 1.3 + s) + ((h * 7919 + s * 104729) % 97) / 40 - 1.2;
      anomaly[h] = (h * 31 + s) % 197 === 0 ? 1 : 0;
      if (s % 5 === 0 && h > 330 && h < 350) temp[h] = NaN;
    }
    return { day, temp, anomaly: Array.from(anomaly, Boolean) };
  });
  const lo = coalesce(min("@brush_min:day"), 0), hi = coalesce(max("@brush_max:day"), 366);
  let overview = $state(), cells = $state([]);
  onMount(() => {
    window.sensorWall = { get overview() { return overview; }, get cells() { return cells; } };
    return () => { delete window.sensorWall; };
  });
</script>

<Title text="Sensor temperatures 2024" />
<Data value={daily}>
  <div style="display: grid; grid-template-columns: repeat(6, 188px); gap: 8px">
    {#each tables as table, i}
      <Plot bind:this={cells[i]} width={188} height={165} animation={false} title={`Sensor ${i + 1}`}
        x={{ domain: [lo, hi], label: "Day", tickCount: 3 }} y={{ domain: [-6, 26], label: "°C", tickCount: 3 }}>
        <Data value={table}>
          <Line x="day" y="temp" color="#4d819e" width={1} />
          <Filter where="anomaly"><Points x="day" y="temp" size={3.5} fill="#d7473c" /></Filter>
        </Data>
      </Plot>
    {/each}
  </div>
  <Plot bind:this={overview} width={1176} height={190} animation={false} x={{ domain: [0, 366], label: "Overview" }} y={{ label: "Daily mean (°C)" }}>
    <Line x="day" y="temp" color="#315f7b" width={2} brush={{ axis: "x" }} />
  </Plot>
</Data>
