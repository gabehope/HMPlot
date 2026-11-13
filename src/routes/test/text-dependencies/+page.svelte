<script>
  import { onMount } from "svelte";
  import { Plot, Calculate, Filter, Text, tween, multiply, col, greater_equal, literal } from "$lib/index";
  let plot=$state(), labels=$state(), target=$state(1), title=$state("Original"), size=$state(14), font=$state("sans-serif"), offset=$state(0);
  const rows={id:[0,1],value:[1,2]};
  onMount(()=>{
    window.textDependencies={get plot(){return plot;},get labels(){return labels;},
      invalid:()=>{title="X".repeat(1000);},
      setFont:value=>{font=value;},
      move:()=>{target=3;}, restyle:()=>{title="Changed label";size=22;font="serif";offset=8;}};
    return ()=>{delete window.textDependencies;};
  });
</script>
<Plot bind:this={plot} data={rows} key="id" width={480} height={320} theme="minimal">
  <Calculate columns={{moving:tween(multiply("value",target),{duration:1000,easing:"linear"})}}>
    <Filter where={greater_equal(col.id,0)}>
      <Text bind:this={labels} x="moving" y="id" text={literal(title)} {size} {font} dx={offset} color="#252b36" respond={false}/>
    </Filter>
  </Calculate>
</Plot>
