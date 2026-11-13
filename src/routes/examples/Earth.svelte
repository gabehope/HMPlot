<script>
  import { onMount, onDestroy } from 'svelte';
  import { T } from '@threlte/core';
  import { numpy as np } from '@hmplot/jax';
  import { Plot, Heatmap, Image, initializePlot, continuous } from '$lib';
  // The color image lives with the paired example (src/examples/earth, TODO 69.10).
  import colorURL from '../../examples/earth/color.jpg?url';
  let { onready = () => {} } = $props();
  let plot = $state(), host = $state(), width = $state(800);
  let elevation = $state.raw(), color = $state.raw(), error = $state('');
  let mode = $state('3d'), lit = $state(true), exaggeration = $state(50);
  let projection = $state('equirectangular');
  const abort = new AbortController();
  // NASA's grayscale elevation product spans 0–6400 m. Sea level stays at radius 1.
  const relief = $derived(exaggeration * 6400 / 6371000);

  async function decode(url, heightmap) {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw Error(`Could not load Earth imagery (${response.status}). Reload to retry.`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      abort.signal.throwIfAborted();
      const { width: w, height: h } = bitmap;
      // One-time image decoding, not a readback of GPU plotting data.
      const canvas = new OffscreenCanvas(w, h);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, w, h).data;
      const values = new Float32Array(w * h * (heightmap ? 1 : 3));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const source = (y * w + x) * 4;
        // Scalar heatmaps start at the south edge; Image accepts top-down rows.
        if (heightmap) values[(h - 1 - y) * w + x] = pixels[source] / 255;
        else for (let c = 0; c < 3; c++) values[(y * w + x) * 3 + c] = pixels[source + c] / 255;
      }
      return { values, shape: heightmap ? [h, w] : [h, w, 3] };
    } finally { bitmap.close(); }
  }
  onMount(() => {
    const observer = new ResizeObserver(([entry]) => width = Math.max(1, entry.contentRect.width));
    observer.observe(host);
    (async () => {
      await initializePlot();
      const [land, rgb] = await Promise.all([
        decode('/examples/earth/elevation.jpg', true), decode(colorURL, false),
      ]);
      abort.signal.throwIfAborted();
      let nextElevation, nextColor;
      try {
        nextElevation = np.array(land.values).reshape(land.shape);
        nextColor = np.array(rgb.values).reshape(rgb.shape);
        elevation = nextElevation; color = nextColor;
      } catch (e) { nextElevation?.dispose(); nextColor?.dispose(); throw e; }
    })().catch(e => { if (!abort.signal.aborted) error = e.message; });
    return () => { abort.abort(); observer.disconnect(); };
  });
  $effect(() => onready(plot));
  onDestroy(() => {
    abort.abort();
    const arrays = [elevation, color];
    Promise.resolve(plot?.whenSettled()).catch(() => {}).finally(() => arrays.forEach(a => a?.dispose()));
    onready(undefined);
  });
</script>

<div bind:this={host}>
  <div class="controls">
    <label>View <select aria-label="Earth view" bind:value={mode}><option value="3d">3D globe</option><option value="2d">2D map</option></select></label>
    <label>Height scale <input aria-label="Height scale" type="range" min="0" max="200" step="1" bind:value={exaggeration} /><output>{exaggeration}×</output></label>
    <label><input type="checkbox" bind:checked={lit} /> Lit mode</label>
    {#if mode === '2d'}<label>Projection <select aria-label="Earth projection" bind:value={projection}><option value="equirectangular">Equirectangular</option><option value="mercator">Mercator</option><option value="equal-area">Equal area</option></select></label>{/if}
  </div>
  {#if error}<p role="alert">{error}</p>
  {:else if elevation && color}
    <Plot x={{ domain: [-180,180] }} y={{ domain: [-90,90] }} bind:this={plot} {width} height={520} type={mode === "3d" ? "3d-y-up" : "2d"} coordinates="spherical"
      {projection} baseRadius={1}
      overview toneMapping={0} name="Earth" settings={{showTrigger:false}}>
      <T.AmbientLight intensity={lit ? 0.35 : 0} />
      <T.DirectionalLight position={[3,2,4]} intensity={lit ? 2 : 0} />
      <Heatmap fill={elevation} resolution={4096} name="Elevation" zScale={relief} surfaceMode lit={lit && mode === "3d"} detail={256}
 fillScale={continuous({ domain: [0,1] })} zrange={[0,0]}
        textureResolution={[4096,2048]}>
        <Image resolution={4096} data={color} name="Blue Marble" zrange={[0,0]} />
      </Heatmap>
    </Plot>
  {:else}<p role="status">Loading Earth imagery…</p>{/if}
  <p class="credit"><a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/">NASA Blue Marble</a> · <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/">GEBCO elevation</a>. Relief exaggerated; elevation product spans 0–6,400 m.</p>
</div>
<style>
  .controls { display:flex; flex-wrap:wrap; align-items:center; gap:16px; margin:16px 0; font-size:12px; color:#546270; }
  label { display:flex; align-items:center; gap:6px; }
  select { font:inherit; border:1px solid #dce1e3; border-radius:5px; padding:5px 7px; background:white; }
  input[type=range] { width:140px; } output { min-width:4ch; font-variant-numeric:tabular-nums; }
  .credit { font-size:11px; color:#687782; } a { color:inherit; }
</style>
