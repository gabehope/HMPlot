<script>
  import { onMount } from 'svelte';
  import { Plot, Frame, Points, Line, Theme, themes } from '$lib/index';
  let plot, coordinates = $state('cartesian'), type = $state('2d'), projection = $state('mercator');
  let axes = $state(undefined), x = $state({label:'Horizontal'}), y = $state({label:'Vertical'});
  let axisFrame = $state(undefined), theme = $state('hmplot');
  let nested = $state(false), nestedVisible = $state(undefined);
  onMount(() => {
    window.axisControls = {
      get plot() { return plot; },
      set(patch) {
        if ('coordinates' in patch) coordinates = patch.coordinates;
        if ('type' in patch) type = patch.type;
        if ('projection' in patch) projection = patch.projection;
        if ('axes' in patch) axes = patch.axes;
        if ('x' in patch) x = patch.x;
        if ('y' in patch) y = patch.y;
        if ('axisFrame' in patch) axisFrame = patch.axisFrame;
        if ('theme' in patch) theme = patch.theme;
        if ('nested' in patch) nested = patch.nested;
        if ('nestedVisible' in patch) nestedVisible = patch.nestedVisible ?? undefined;
      }
    };
    return () => delete window.axisControls;
  });
</script>
<Theme value={themes[theme]}>
  <Plot bind:this={plot} {coordinates} {type} {projection} axes2d={axes} {x} {y} {axisFrame}
    width={680} height={430} data={{a:[-30,0,30],b:[-20,0,20]}}>
    <Points x="a" y="b" />
    <Line x="a" y="b" />
    {#if nested}
      <Frame x={{domain:[-180,180], visible:nestedVisible}} y={{domain:[-80,80], visible:nestedVisible}}>
        <Points x="a" y="b" />
      </Frame>
    {/if}
  </Plot>
</Theme>
