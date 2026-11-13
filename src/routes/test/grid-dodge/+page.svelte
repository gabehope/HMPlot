<script>
  import {Plot,Dodge,Points,Text} from '$lib';
  let plot=$state(),grid=$state(),points=$state(),labels=$state();
  $effect(()=>{if(plot&&grid&&points&&labels)window.gridDodge={plot,grid,points,labels};return()=>delete window.gridDodge;});
</script>
<Plot bind:this={plot} data={{count:[2,0,3],name:['A','B','C']}} width={500} height={400} axes2d
  x={{domain:[0,4]}} y={{domain:[0,3]}}>
  <Dodge bind:this={grid} mode="grid" columns={3} count="count">
    <Points bind:this={points} x="x" y="y" size={9} fill="name" />
    <Text bind:this={labels} x="x" y="y" text="name" dy={-16} />
  </Dodge>
</Plot>
