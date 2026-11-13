<script>
  // TODO 23.0b fixture: the same points, built once with hmplot's jax-js (hmplot/jax)
  // and once with a second jax-js copy, upstream @jax-js/jax, as an app without the hmplot/vite
  // plugin would. The second copy's arrays arrive as mark channels and as data-table columns; they
  // are copied through the host and must draw the same pixels.
  import { onMount } from "svelte";
  import { Data, Plot, Points, initializePlot } from "$lib";
  import { numpy as np } from "$lib/jax.js";
  import * as upstream from "@jax-js/jax";
  import { liveForeignCopies } from "$lib/plot/utils/foreignJax.js";
  const xs = [0, 0.5, -0.5, 0.25, -0.8, 0.9], ys = [0, 0.5, 0.2, -0.4, 0.7, -0.9], sizes = [4, 8, 12, 6, 10, 5];
  let own = $state(), foreign = $state(), ownTable = $state(), foreignTable = $state();
  let ownPositions = $state(), ownSizes = $state(), foreignPositions = $state(), foreignSizes = $state(), ownColumns = $state(), table = $state();
  const warnings = [];
  onMount(async () => {
    const warn = console.warn;
    console.warn = (...args) => { warnings.push(String(args[0])); warn(...args); };
    await initializePlot();
    await upstream.init("webgpu");
    const points = xs.map((x, i) => [x, ys[i]]);
    ownPositions = np.array(points);
    ownSizes = np.array(sizes);
    foreignPositions = upstream.numpy.array(points);
    foreignSizes = upstream.numpy.array(sizes);
    ownColumns = { x: np.array(xs), y: np.array(ys), size: np.array(sizes) };
    table = { x: upstream.numpy.array(xs), y: upstream.numpy.array(ys), size: upstream.numpy.array(sizes) };
    window.foreignJax = {
      warnings,
      liveForeignCopies,
      get own() { return own; }, get foreign() { return foreign; },
      get ownTable() { return ownTable; }, get foreignTable() { return foreignTable; },
      async settle() { await Promise.all([own, foreign, ownTable, foreignTable].map((p) => p?.whenSettled())); },
      /** Replace the foreign channel with new arrays, `times` times; the old ones are dropped. */
      async replace(times) {
        for (let i = 0; i < times; i++) {
          foreignSizes = upstream.numpy.array(sizes.map((s) => s + (i % 2)));
          await foreign.whenSettled();
        }
        foreignSizes = upstream.numpy.array(sizes);
        await foreign.whenSettled();
      },
    };
  });
</script>

{#if ownPositions}
  <Plot bind:this={own} width={300} height={300} axes2d xDomain={[-1, 1]} yDomain={[-1, 1]}>
    <Points position={ownPositions} size={ownSizes} fill="#336699" />
  </Plot>
  <Plot bind:this={foreign} width={300} height={300} axes2d xDomain={[-1, 1]} yDomain={[-1, 1]}>
    <Points position={foreignPositions} size={foreignSizes} fill="#336699" />
  </Plot>
  <Data value={ownColumns}>
    <Plot bind:this={ownTable} width={300} height={300} axes2d xDomain={[-1, 1]} yDomain={[-1, 1]}>
      <Points x="x" y="y" size="size" fill="#336699" />
    </Plot>
  </Data>
  <Data value={table}>
    <Plot bind:this={foreignTable} width={300} height={300} axes2d xDomain={[-1, 1]} yDomain={[-1, 1]}>
      <Points x="x" y="y" size="size" fill="#336699" />
    </Plot>
  </Data>
{/if}
