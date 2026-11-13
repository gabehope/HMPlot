<script lang="ts">
  // An app's own jax-js code: `@jax-js/jax` resolves to hmplot's jax-js through the
  // hmplotJax() plugin (vite.config.js), so these are hmplot's arrays and pass in
  // without a copy (TODO 23.0a); tsconfig.json's "paths" gives it hmplot/jax's types.
  import { onMount } from "svelte";
  import { numpy as appNp } from "@jax-js/jax";
  import { numpy as np } from "hmplot/jax";
  import { Plot, Points, initializePlot } from "hmplot";
  let positions = $state<ReturnType<typeof np.array>>();
  onMount(() => {
    (window as any).jaxInputs = { sameJax: appNp === np };
    initializePlot().then(() => {
      positions = appNp.array([[0, 0], [0.5, 0.5], [-0.5, 0.2]]);
    });
  });
</script>

<section aria-label="JAX inputs">
  {#if positions}
    <Plot width={300} height={200} axes2d>
      <Points position={positions} size={10} fill="#336699" />
    </Plot>
  {/if}
</section>
