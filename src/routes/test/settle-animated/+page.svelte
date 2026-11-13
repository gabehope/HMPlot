<script>
  // TODO 17.15 fixture: a Slice whose `at` changes every animation frame from mount. Before the
  // settle barrier the plot never revealed (atomic loading waited for no pending work) and
  // whenSettled() never resolved.
  import { onMount } from "svelte";
  import { Data, Plot, Points, Filter, Slice } from "$lib/index";
  const entities = 400, steps = 40, rows = entities * steps;
  const entity = Float32Array.from({ length: rows }, (_, r) => Math.floor(r / steps));
  const t = Float32Array.from({ length: rows }, (_, r) => r % steps);
  const table = {
    entity, time: t,
    x: Float32Array.from({ length: rows }, (_, r) => Math.cos(entity[r] + 0.1 * t[r])),
    y: Float32Array.from({ length: rows }, (_, r) => Math.sin(entity[r] + 0.1 * t[r])),
  };
  let plot = $state(), points = $state(), time = $state(0), playing = $state(true), minimum = $state(-1);
  let frames = 0;
  onMount(() => {
    let frame;
    const step = () => { if (playing) { time = (time + 0.25) % (steps - 1); frames++; } frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step);
    window.settleAnimated = {
      get plot() { return plot; }, get count() { const mark = points?.getMark(); return mark?.view.marks.of(mark)?.rows.count ?? mark?.count; }, get time() { return time; }, get frames() { return frames; },
      stop() { playing = false; }, start() { playing = true; },
      setMinimum(value) { minimum = value; },
    };
    return () => { cancelAnimationFrame(frame); delete window.settleAnimated; };
  });
</script>
<Data value={table}>
  <Plot bind:this={plot} width={420} height={320} axes2d x={{ domain: [-1.2, 1.2] }} y={{ domain: [-1.2, 1.2] }}>
    <Filter where={{ field: "x", op: "gt", value: minimum }}>
      <Slice field="time" at={time} by="entity" values={["x", "y"]}>
        <Points bind:this={points} x="x" y="y" size={2.5} maxElements={entities} />
      </Slice>
    </Filter>
  </Plot>
</Data>
