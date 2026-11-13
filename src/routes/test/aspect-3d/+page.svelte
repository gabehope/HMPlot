<script>
  import { onMount } from 'svelte';
  import { Plot, Points, Surface, Heatmap, continuous } from '$lib/index';
  import { Vector3 } from 'three/webgpu';
  import { T } from '@threlte/core';
  import { framePoint } from '$lib/plot/utils/framePlacement.js';
  let plot = $state(), points = $state();
  let picked = $state(null);
  let aspect = $state('equal'), yDomain = $state([0, 50]);
  let guides = $state(typeof location !== 'undefined' && new URLSearchParams(location.search).has('automatic')
    ? undefined : { style: 'box', gridPlanes: ['xy', 'xz'] });
  let axisOverrides = $state({ x: {}, y: {}, z: {} });
  const data = { x: [50, 60, 50], y: [25, 25, 35], z: [5, 5, 5] };
  const zUp = typeof location !== 'undefined' && new URLSearchParams(location.search).has('z-up');
  const presets = typeof location !== "undefined" && new URLSearchParams(location.search).has("presets");
  let viewType = $state(zUp || presets ? "3d" : "3d-y-up");
  let up = $state(zUp ? [0, 0, 1] : undefined);
  const surface = typeof location !== 'undefined' && new URLSearchParams(location.search).has('surface');
  const heatmap = typeof location !== 'undefined' && new URLSearchParams(location.search).has('heatmap');
  onMount(() => {
    window.aspect3dFixture = {
      get plot() { return plot; }, get points() { return points; },
      get picked() { return picked; },
      setType: value => viewType = value, setUp: value => up = value,
      setAspect: value => aspect = value, setY: value => yDomain = value,
      setGuides: value => guides = value,
      setAxis: (axis, value) => axisOverrides = { ...axisOverrides, [axis]: value },
      project: point => {
        const mark = points.getMark(), camera = mark.view.navigation.controls.current.object;
        const world = framePoint(mark.options, point), p = new Vector3(...world).project(camera);
        const box = mark.renderer.domElement.getBoundingClientRect();
        return { x: (p.x + 1) * box.width / 2, y: (1 - p.y) * box.height / 2, world };
      },
    };
    return () => { delete window.aspect3dFixture; };
  });
</script>
<Plot bind:this={plot} {data} type={viewType} {aspect} width={600} height={420} axes3d={surface ? false : guides}
  background={heatmap ? 'transparent' : undefined}
  orientation3d={zUp}
  cameraUp={up}
  cameraPosition={zUp || presets ? [90, 70, 140] : [0, heatmap ? 50 : 0, 180]} cameraTarget={[0, heatmap ? 50 : 0, 0]} toneMapping={0}
  x={{ domain: [0, 100], label: 'X', ...axisOverrides.x }} y={{ domain: yDomain, label: 'Y', ...axisOverrides.y }} z={{ domain: [0, 10], label: 'Z', ...axisOverrides.z }}>
  {#if heatmap}
    <T.AmbientLight intensity={3}/>
    <Heatmap bind:this={points} fill={[[0, 0], [10, 10]]} surfaceMode surface3d zScale={100} fillScale={continuous({ domain: [0, 10] })} lit/>
  {:else if surface}
    <T.AmbientLight intensity={3}/>
    <Surface bind:this={points} position={[[40, 15, 5], [60, 15, 5], [60, 35, 5], [40, 35, 5]]}
      indices={[[0, 1, 2], [0, 2, 3]]} fill="#d62828" lit/>
  {:else}
    <Points bind:this={points} x="x" y="y" z="z" size={10} fill="#d62828" onclick={event => picked = event.instanceId}/>
  {/if}
</Plot>
