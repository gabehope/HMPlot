<script>
 import { Plot, Frame, Line, Points, Facet, InputContext, Slider, input } from '$lib';
import { Histogram } from '$lib/charts/index.js';
 const data={t:[0,1,2,3],a:[0,2,1,3],b:[0,20,10,30]};
 let view=$state(),histogram=$state(),facet=$state();
 $effect(()=>{window.framesView=view;window.histogram=histogram;window.facet=facet;});
</script>
<Plot bind:this={view} {data} height={400} responsive overview><Frame name="Left" x={{domain:[0,3]}} y={{label:'A'}}><Line x="t" y="a" color="blue"/></Frame><Frame name="Right" x={{domain:[0,3],visible:false}} y={{label:'B',side:'right'}}><Points x="t" y="b" fill="red" size={5} onclick={e=>window.framePick={axisValue:e.axisValue,instanceId:e.instanceId,dataPoint:e.dataPoint}}/></Frame></Plot>
<Plot {data} height={250} responsive axes2d><Line x="t" y="a"/></Plot>

<InputContext><Slider name="bins" min={1} max={8} step={1} value={3} label="Bins"/><Plot {data} height={220} responsive axes2d><Histogram bind:this={histogram} x="a" bins={input("bins")} normalization="density"/></Plot></InputContext>
<Facet bind:this={facet} data={{x:[0,1,2,3,4,5],group:['A','A','A','B','B','B']}} column="group" wrap={2}><Plot height={220} axes2d><Histogram x="x" bins={3}/></Plot></Facet>
