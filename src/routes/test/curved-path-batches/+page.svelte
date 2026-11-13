<script>
  // TODO 136.11: curved paths past one batch of 1,024 (135.2's 1,560 routes never drew).
  // `window.curvedPathBatches` for curved-path-batches.spec.js.
  import { Plot, Line, Segments } from "$lib/index";
  let plot = $state();
  $effect(() => {
    window.curvedPathBatches = { get plot() { return plot; } };
    return () => { delete window.curvedPathBatches; };
  });
  // 1,560 short routes in 40 columns from the top down; rows past 1,024 are the lowest 13.
  const routes = (() => {
    const x0 = [], y0 = [], x1 = [], y1 = [];
    for (let i = 0; i < 1560; i++) {
      const lon = -156 + (i % 40) * 8, lat = 60 - Math.floor(i / 40) * 2.6;
      x0.push(lon); y0.push(lat); x1.push(lon + 5); y1.push(lat - 1.5);
    }
    return { x0, y0, x1, y1 };
  })();
  // A connected line of 2,000 points.
  const line = Array.from({ length: 2000 }, (_, i) => [-160 + (320 * i) / 1999, -75]);
</script>

<Plot bind:this={plot} coordinates="spherical" projection="equirectangular" width={480} height={240}
  responsive={false} axes2d={false} background="white" toneMapping={0} data={routes}>
  <Segments start={["x0", "y0"]} end={["x1", "y1"]} color="#13bd4e" width={2} />
  <Line position={line} color="#2a6fdb" width={4} />
</Plot>
