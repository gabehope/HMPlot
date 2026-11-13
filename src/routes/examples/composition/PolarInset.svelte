<script>
  import { untrack } from "svelte";
  import { Plot, Frame, Points } from "$lib";

  let { plot = $bindable(), onready = undefined } = $props();
  let center = $state(0);
  const latitudes = Array.from({ length: 31 }, (_, index) => -90 + index * 6);
  const longitudes = Array.from({ length: 61 }, (_, index) => -180 + index * 6);
  const graticule = [
    ...[-120, -60, 0, 60, 120, 180].flatMap(lon => latitudes.map(lat => [lon, lat])),
    ...[-60, -30, 0, 30, 60].flatMap(lat => longitudes.map(lon => [lon, lat])),
  ];
  const horizon = $derived(latitudes.flatMap(lat =>
    [[center - 90, lat], [center + 90, lat]]));
  $effect(() => { const ready = plot; untrack(() => onready?.(ready)); });
</script>

<div class="controls">
  <label>Globe center <input aria-label="Globe center" type="range"
    min="-60" max="60" step="any" bind:value={center} /> {Math.round(center)}°</label>
</div>
<Plot bind:this={plot} responsive height={440} type="2d" background="#f7f9fc"
  onviewportchange={(viewport) => {
    if (viewport.center) center = viewport.center[0];
  }}>
  <Frame name="Globe" coordinates="spherical" projection="orthographic"
    projectionCenter={[center, 0]}
    x={{ domain: [-180, 180], visible: false }}
    y={{ domain: [-90, 90], visible: false }}>
    <Points position={graticule} size={1.5} fill="#b7c9dc" />
    <Points position={horizon} size={2} fill="#8faac5" />
    <Frame name="Warped chart" coordinates="cartesian"
      x={{ domain: [-1, 1], range: [0, 45], visible: false }}
      y={{ domain: [-1, 1], range: [-20, 20], visible: false }}>
      <Points position={[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]}
        size={9} fill="#3679b7" />
    </Frame>
    <Frame name="Tangent inset" coordinates="cartesian"
      placement={{ anchor: [-35, 0], size: [100, 100], orientation: "tangent" }}
      x={{ domain: [-1, 1], visible: false }} y={{ domain: [-1, 1], visible: false }}>
      <Points position={[[-1, -1], [1, -1], [-1, 1], [1, 1]]}
        size={6.5} fill="#d4773e" />
      <Frame name="Polar dial" coordinates="polar" angleUnit="custom" anglePeriod={24}
        placement={{ anchor: [0, 0], size: [42, 42] }}
        x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 1], visible: false }}>
        <Points position={[[0, 1], [6, 1], [12, 1], [18, 1]]}
          size={5.5} fill="#26364b" />
      </Frame>
    </Frame>
  </Frame>
</Plot>
<p class="note">Blue points use parent-data ranges and bend with the orthographic
  sphere. Orange points form a rigid tangent inset. Its inner polar dial has a
  custom 24-unit turn: 6 units are a quarter turn. Drag the plot or move the
  slider to rotate the globe.</p>

<style>
  .controls { margin-bottom: 8px; }
  .controls label { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .controls input { width: 150px; }
  .note { color: #667085; font-size: 13px; line-height: 1.45; }
</style>
