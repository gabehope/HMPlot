<script>
  import { onMount, tick } from "svelte";
  import { Plot, Points, mean, sum, min, max, count, std } from "$lib/index";
  import Transform from "$lib/plot/transform.svelte";
  const rows = (shift = 0, length = 32768) => ({
    key: Int32Array.from({ length }, (_, i) =>
      i % 10 ? 0 : Math.floor(i / 10) % 512,
    ),
    value: Float32Array.from({ length }, (_, i) => ((i % 31) - 15) / 8 + shift),
  });
  let data = $state(rows()),
    plot = $state(),
    group = $state();
  onMount(() => {
    window.groupReductions = {
      get plot() {
        return plot;
      },
      get output() {
        return group?.output();
      },
      get data() {
        return data;
      },
      async update(shift, length) {
        data = rows(shift, length);
        await tick();
      },
    };
    return () => delete window.groupReductions;
  });
</script>

<Plot
  bind:this={plot}
  {data}
  width={640}
  height={280}
  axes2d={false}
  animation={false}
  x={{ domain: [0, 511], padding: 0 }}
  y={{ domain: [-2, 4], padding: 0 }}
>
  <Transform
    kind="Group"
    by="key"
    bind:this={group}
    columns={{
      average: mean("value"),
      total: sum("value"),
      lo: min("value"),
      hi: max("value"),
      n: count("value"),
      deviation: std("value"),
    }}
  >
    <Points x="key" y="average" size={4} fill="#2369d8" />
  </Transform>
</Plot>
