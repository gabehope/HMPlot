<script>
  import {Plot,Frame,Points} from '$lib/index';
  let plot=$state(),frame=$state(),rotation=$state(0);
  $effect(()=>{if(plot&&frame)window.anchoredFrames={plot,frame,rotate:v=>rotation=v,hover:null};return()=>delete window.anchoredFrames;});
  // Hover goes through the pointer-event path (setupInteractivity), not pickAt.
  const hover=(e)=>{if(window.anchoredFrames)window.anchoredFrames.hover={frame:e.frame,x:e.axisValue?.x,y:e.axisValue?.y,instanceId:e.instanceId};};
</script>
<Plot axisMask={false} bind:this={plot} width={650} height={420} axes2d x={{domain:[0,100]}} y={{domain:[0,100]}}>
  <Frame bind:this={frame} placement={{anchor:[35,65],size:[160,100],rotation:[0,0,rotation]}}
    x={{domain:[0,10]}} y={{domain:[0,10]}}>
    <Points position={[[0,0],[5,5],[10,10]]} size={7} fill="#00aa00" onpointermove={hover} />
  </Frame>
</Plot>
