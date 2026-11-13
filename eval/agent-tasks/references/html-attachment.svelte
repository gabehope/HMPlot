<script>
  import { Plot, Points, Html } from 'hmplot';
  import { expose } from './web-utils.js';
  let plot=$state(), x=$state(5), clicks=$state(0);
  $effect(()=>expose('primary',plot));
</script>
<main>
  <h1>HTML attachment benchmark</h1>
  <label>Anchor <input aria-label="Anchor" type="range" min="1" max="9" step=".01" bind:value={x}/></label>
  <Plot bind:this={plot} width={900} height={550} x={{domain:[0,10]}} y={{domain:[0,10]}} description="A point and a native button share a data position.">
    <Points {x} y={5} fill="#24779e" size={12}/>
    <Html {x} y={5} dx={8} dy={-8}><button onclick={()=>clicks++}>Details {clicks}</button></Html>
  </Plot>
</main>
<style>main{padding:24px;font:16px system-ui}input{width:500px}</style>
