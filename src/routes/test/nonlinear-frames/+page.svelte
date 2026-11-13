<script>
  import { Plot, Frame, Points, Line } from "$lib/index";
  let plot=$state(), frame=$state(), points=$state();
  let end=$state(100);
  $effect(() => {
    if (plot && frame) window.nonlinearFrames={plot,frame,points,setEnd:v=>end=v};
    return () => { delete window.nonlinearFrames; };
  });
</script>
<Plot axisMask={false} bind:this={plot} width={650} height={420} axes2d
  x={{domain:[1,1000],transform:"log"}} y={{domain:[0,100]}}>
  <Frame bind:this={frame} x={{domain:[0,100],range:[10,end]}} y={{domain:[0,100],range:[20,80]}}>
    <Line position={[[0,0],[100,100]]} width={2} color="#547ba2" />
    <Points bind:this={points} position={[[0,0],[50,50],[100,100]]} size={7} fill="#00aa00" />
  </Frame>
</Plot>
