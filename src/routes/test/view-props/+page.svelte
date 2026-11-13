<script>
  // The view as a prop (TODO 136.14): with animation on, a new 2D viewport and a new 3D camera
  // position ease there over the plot's animation duration (600 ms here); the spec reads them
  // part way and at rest, and a wheel cancels the 2D move where it is. The 2D view is controlled:
  // each eased frame comes back through the prop.
  import { Plot, Points } from "$lib/index";
  let flat = $state(), solid = $state();
  let viewport = $state({ x: 0.5, y: 0.5, zoom: 1 }), position = $state([90, 70, 140]);
  $effect(() => {
    window.viewProps = {
      get flat() { return flat; }, get solid() { return solid; },
      setViewport(v) { viewport = v; }, setPosition(p) { position = p; },
    };
    return () => { delete window.viewProps; };
  });
</script>

<div class="flat"><Plot bind:this={flat} axes2d width={400} height={300} animation animationDuration={600}
  animationEasing="linear" {viewport} onviewportchange={(v) => (viewport = v)}>
  <Points x={[0, 1, 2]} y={[0, 1, 2]} />
</Plot></div>
<div class="solid"><Plot bind:this={solid} type="3d" width={400} height={300} animation animationDuration={600}
  animationEasing="linear" cameraPosition={position}>
  <Points x={[0, 1, 2]} y={[0, 1, 2]} z={[0, 1, 2]} />
</Plot></div>
