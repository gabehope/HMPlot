const a=`<script>
  import { Plot, Data, Sort, Calculate, Line, Points, cumsum, count, is_finite, divide, mean, quantile } from "$lib";
  import { untrack } from "svelte";
  let {onready}=$props(),plot=$state();
  const data=Array.from({length:180},(_,i)=>({group:i%2?"A":"B",value:(i%2?1:-1)+Math.sin(i*1.31)+((i*17)%23)/23}));
  // Each group's quantile curve: its rows in value order, each at its share of the group (TODO 137.3).
  const probability=divide(cumsum(is_finite("value"),{by:"group",orderBy:"value"}),count("value",{by:"group"}));
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
<\/script>
<Data value={data}><Sort by="value"><Calculate columns={{probability}}><Plot bind:this={plot} responsive height={420} axes2d x={{label:"Quantile probability"}} y={{label:"Observed value"}}><Line x="probability" y="value" series="group" color="group" width={2}/><Points x="probability" y="value" fill="group" size={1.5}/></Plot></Calculate></Sort></Data>
<Data value={data}><Calculate columns={{groupMean:mean("value",{by:"group"}),groupP90:quantile("value",0.9,{by:"group"})}}><Plot responsive height={280} axes2d x={{label:"Observation"}} y={{label:"Group mean and 90th percentile"}}><Points x="value" y="groupMean" fill="group" size={2.5}/><Points x="value" y="groupP90" fill="group" size={1.5}/></Plot></Calculate></Data>
`;export{a as default};
