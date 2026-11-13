<script>
  // TODO 136.3: the missing-data matrix. Each mark family in each frame draws rows in the lower
  // left with a NaN row, a value <= 0 (no position on a log axis) and two series. A row its frame
  // cannot map was the 1e20 sentinel, toward the upper right, before the validity contract (TODO
  // 136.11): a mark that draws toward such a point crosses the plot's top or right edge, which
  // must stay empty.
  import { Plot, Points, Line, Area, Segments, Arrows3D, Rect, Polygon, Text } from "$lib/index";

  const x = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
  const y = [1, 2, NaN, 1.5, -1, 2.5, 1.2, 2];
  const series = ["a", "a", "a", "a", "b", "b", "b", "b"];
  const data = { x, y, series, x1: x.map((v) => v + 0.4), y1: y.map((v) => v + 0.4), label: x.map(String) };
  const start = x.map((v, i) => [v, y[i]]), end = x.map((v, i) => [v + 0.4, y[i] + 0.4]);
  const families = ["Points", "Line", "Area", "Segments", "Arrows3D", "Rect", "Polygon", "Text"];
  const frames = {
    linear: { x: { domain: [0, 10] }, y: { domain: [-2, 10] } },
    log: { x: { domain: [0.5, 10], transform: "log" }, y: { domain: [0.5, 10], transform: "log" } },
    polar: { coordinates: "polar", angleUnit: "degrees", baseRadius: 0, x: { domain: [0, 360] }, y: { domain: [0, 10] } },
    globe: { coordinates: "spherical", projection: "orthographic" },
  };
  const plots = $state({});
  $effect(() => {
    window.missingMatrix = { plots, families, frames: Object.keys(frames) };
    return () => delete window.missingMatrix;
  });
</script>

{#each Object.entries(frames) as [frame, props]}
  <div class="row">
    {#each families as family}
      <section data-case="{family}-{frame}">
        <Plot bind:this={plots[`${family}-${frame}`]} {data} {...props} width={160} height={160} axes2d={false}>
          {#if family === "Points"}<Points x="x" y="y" size={6} fill="#d02b27" />
          {:else if family === "Line"}<Line x="x" y="y" series="series" width={3} color="#d02b27" />
          {:else if family === "Area"}<Area x="x" upper="y" series="series" fill="#d02b27" />
          {:else if family === "Segments"}<Segments {start} {end} width={3} color="#d02b27" />
          {:else if family === "Arrows3D"}<Arrows3D {start} {end} width={0.05} color="#d02b27" />
          {:else if family === "Rect"}<Rect x0="x" x1="x1" y0="y" y1="y1" fill="#d02b27" />
          {:else if family === "Polygon"}<Polygon x="x" y="y" series="series" fill="#d02b27" />
          {:else}<Text x="x" y="y" text="label" color="#d02b27" />{/if}
        </Plot>
      </section>
    {/each}
  </div>
{/each}

<style>
  .row { display: flex; gap: 4px; margin-bottom: 4px; }
  section { width: 160px; height: 160px; }
</style>
