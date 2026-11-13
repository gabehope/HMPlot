<script>
  // Stage 18.1: mark blend modes. Two half-transparent rects overlap in the middle of
  // each plot; the overlap's color tells the mode apart.
  import { onMount } from "svelte";
  import { Plot, Rect, Prism, GeoJSON, Data, animate } from "$lib/index";
  let plots = $state({});
  let geoMark = $state();
  let rowOpacity = $state(1);
  const rows = $derived({ x0: [0], x1: [360], y0: [0], y1: [1], alpha: [rowOpacity] });
  const polygon = { type: "Feature", properties: {}, geometry: { type: "Polygon",
    coordinates: [[[0, 0], [360, 0], [360, 1], [0, 1], [0, 0]]] } };
  onMount(() => { window.blendFixture = { get plots() { return plots; }, setRowOpacity: value => rowOpacity = value,
    // GeoJSON prepares its composite faces directly. Exercise their shared row-alpha field
    // without implying that this composite mark implements NamedMark's animate descriptors.
    setGeoRowOpacity: async value => {
      await geoMark.whenSettled();
      const mark = geoMark.getMark();
      mark.ensureInteractionOpacity();
      mark.setInteractionTranslucent(value > 0 && value < 1);
      await mark.fields.get("interactionOpacity").update(Array(mark.count).fill(value));
    } }; return () => { delete window.blendFixture; }; });
  const left = { x0: [0], x1: [6], y0: [0], y1: [10] }, right = { x0: [4], x1: [10], y0: [0], y1: [10] };
</script>

{#each ["normal", "additive", "screen", "multiply"] as mode}
  <h3>{mode}</h3>
  <Plot bind:this={plots[mode]} width={300} height={200} axes2d={false} toneMapping={0}
    x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Data value={left}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#ff0000" opacity={0.5} blend={mode} /></Data>
    <Data value={right}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#00ff00" opacity={0.5} blend={mode} /></Data>
  </Plot>
{/each}

<Plot bind:this={plots.prism} width={300} height={300} type="3d" axes2d={false} axes3d={false} toneMapping={0}
  x={{ domain: [0, 360] }} y={{ domain: [0, 1] }} z={{ domain: [0, 1] }}>
  <Data value={rows}>
    <Prism x={180} y={0.5} width={360} depth={1} z0={0} z1={0.25} fill="#ff0000"
      opacity={animate("alpha", { duration: 1000, easing: "linear" })} />
  </Data>
</Plot>
<Plot bind:this={plots.geo} width={300} height={300} axes2d={false} toneMapping={0}
  x={{ domain: [0, 360] }} y={{ domain: [0, 1] }}>
  <GeoJSON bind:this={geoMark} data={polygon} fill="#ff0000" outlineWidth={0} />
</Plot>

{#each ["cartesian", "polar"] as coordinates}
  <Plot bind:this={plots[coordinates]} width={300} height={300} axes2d={false} toneMapping={0}
    {coordinates} x={{ domain: [0, 360] }} y={{ domain: [0, 1] }}>
    <Data value={rows}>
      <Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#ff0000"
        opacity={animate("alpha", { duration: 1000, easing: "linear" })} />
    </Data>
  </Plot>
{/each}
