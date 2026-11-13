<script>
  import { Plot, Frame, Points } from "$lib/index";
  let plot = $state(), inner = $state(), inset = $state();
  let xmax = $state(100);
  let insetVisible = $state(true);
  $effect(() => {
    if (plot && inner) window.nestedFrames = { plot, inner, inset, setX: value => xmax = value, showInset: value => insetVisible = value };
    return () => { delete window.nestedFrames; };
  });
</script>
<Plot bind:this={plot} data={{x:[0,50,100], y:[0,50,100], fraction:[0,.5,1]}}
  width={650} height={420} axes2d x={{domain:[0,xmax]}} y={{domain:[0,100]}}>
  <Points x="x" y="y" size={6} fill="#547ba2" />
  <Frame bind:this={inner} name="Fraction" y={{domain:[0,1], side:"right"}}>
    <Points x="x" y="fraction" size={4} fill="#cf8955" />
  </Frame>
  {#if insetVisible}
    <Frame bind:this={inset} name="Inset" x={{domain:[0,100], range:[20,40]}} y={{domain:[0,100], range:[60,80]}}>
      <Points x="x" y="y" size={4} fill="#7b9865" />
    </Frame>
  {/if}
</Plot>
