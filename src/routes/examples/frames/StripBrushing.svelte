<script>
  import { untrack } from "svelte";
  let {onready = () => {}} = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  import { Plot, Frame, Points, where } from "$lib";
  const count = 120;
  const data = {
    x: Array.from({length: count}, (_, i) => (i * 37) % 100),
    y: Array.from({length: count}, (_, i) => 50 + 40 * Math.sin(i * 0.37)),
    score: Array.from({length: count}, (_, i) => (i * 71) % 100),
  };
</script>
<p>Shift-drag in the plot to brush x and y. Shift-drag on the inset's left tick strip to brush its score axis; that band stays on the strip. Drag a band's middle to move it, its edges to resize, or scroll over it; Escape clears the last band.</p>
<Plot bind:this={plot} data={data} responsive height={420} axes2d x={{domain: [0, 100]}} y={{domain: [0, 100]}}>
  <Points x="x" y="y" brush size={where("@brushed", 4.5, 2.5)} fill="#547ba2" />
  <Frame x={{domain: [0, 100], range: [62, 96]}} y={{domain: [0, 100], range: [8, 48]}}>
    <Points x="x" y="score" brush={{axis: "y"}} size={where("@brushed", 4, 2)} fill="#c0504d" />
  </Frame>
</Plot>
<style>p {font-size:14px;line-height:1.5}</style>
