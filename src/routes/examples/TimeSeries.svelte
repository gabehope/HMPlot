<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { Plot, Line, Minimap, initializePlot } from '$lib';
  import { numpy as np, getWebGPUDevice } from '@hmplot/jax';
  let {onready} = $props();
  let plot=$state(), series=$state.raw(), count=$state(10000), length=$state(10000), detail=$state('uniform-x'), error=$state(''), ready=$state(false), busy=$state(false);
  let width=$state(900), host=$state(), generation=0;
  let viewport=$state({x:.5,y:.5,zoom:1});
  onMount(()=>{
    let active=true;
    initializePlot().then(()=>{if(active)ready=true;}).catch(e=>error=e.message);
    const observer=new ResizeObserver(([entry])=>width=Math.max(1,entry.contentRect.width)); observer.observe(host);
    return ()=>{active=false;observer.disconnect();};
  });
  $effect(()=>{if(plot)onready?.(plot);});
  $effect(()=>{if(ready)replace(count);});
  async function replace(n) {
    const revision=++generation;
    if(!Number.isInteger(n)||n<100||n>1000000){error='Choose between 100 and 1,000,000 points.';return;}
    busy=true;error='';let next;
    try {
      const limits=getWebGPUDevice().limits;
      if (n*16 > limits.maxStorageBufferBindingSize || n*128 > limits.maxBufferSize) throw Error('Signal buffers exceed this device’s allocation budget. Choose fewer points.');
      // Positions and deterministic signal are generated on the GPU.
      const x=np.arange(n).astype(np.float32), phase=x.ref.mul(.013);
      const y=np.sin(phase.ref).add(np.sin(phase.mul(7.13)).mul(.22)).add(np.sin(x.ref.mul(.00021)).mul(.5));
      next=np.stack([x,y],1); await next.blockUntilReady();
      if(revision!==generation){next.dispose();return;}
      const old=series, release=plot?.beginUpdate();
      series=next;length=n;viewport={x:.5,y:.5,zoom:1};
      await tick();
      try { await plot?.whenSettled(); } finally { await release?.(); old?.dispose(); }
    }catch(e){next?.dispose();if(revision===generation)error=e.message;}
    finally{if(revision===generation)busy=false;}
  }
  onDestroy(()=>{generation++;const old=series;plot?.whenSettled().finally(()=>old?.dispose());onready?.(undefined);});
</script>
<div bind:this={host}>
  <div class="controls">
    <label>Points <input aria-label="Time series length" type="number" min="100" max="1000000" step="100" bind:value={count} /></label>
    <select aria-label="Time series length presets" bind:value={count}><option value={1000}>1,000</option><option value={10000}>10,000</option><option value={100000}>100,000</option><option value={1000000}>1,000,000</option></select>
    <label>Detail <select aria-label="Detail" bind:value={detail}><option value="uniform-x">Adaptive detail</option><option value="random">Every point</option></select></label>
    <button onclick={()=>viewport={x:.5,y:.5,zoom:1}}>Fit</button>
    {#if busy}<span role="status">Preparing…</span>{/if}
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if series}
    <Plot x={{ domain: [0,length-1], range: [-100,100], label: "Time" }} y={{ domain: [-2,2], range: [-35,35], label: "Value" }} bind:this={plot} {width} height={340} {viewport} onviewportchange={v=>viewport=v} axes2d zoomAxis="x" toneMapping={0} settings={{showTrigger:false}}>
      <Line position={series} sampling={detail} maxElements={length} width={1.25} color="#426c83" />
    </Plot>
    <Minimap for={plot} {width} height={90} axes={{x:true,y:false}} maxInstances={1000} />
  {/if}
</div>
<style>
  .controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0;font-size:12px;color:#546270}
  label{display:flex;gap:6px;align-items:center} input{width:95px} input,select,button{font:inherit;border:1px solid #dce1e3;background:white;border-radius:5px;padding:5px 7px} p{color:#984635}
</style>
