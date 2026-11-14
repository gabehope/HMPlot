const e=`<script>
  import { Plot, Data, Fold, Pivot, Points, categorical, sum } from "$lib";
  import { untrack } from "svelte";
  let {onready}=$props(),plot=$state();
  const data={subject:["A","B","C","D"],before:[3,5,4,6],after:[5,6,7,8]}, stages=categorical({domain:["before","after"]});
  const long={subject:["A","A","B","B","C","C","D","D"],stage:["before","after","before","after","before","after","before","after"],score:[3,5,5,6,4,7,6,8]};
  $effect(()=>{const p=plot;untrack(()=>onready?.(p));});
<\/script>
<Data value={data}><Fold fields={["before","after"]}><Plot x={{ scale: stages }} bind:this={plot} responsive height={420} axes2d><Points x="key" y="value" fill="key" size={4.5}/></Plot></Fold></Data>
<Data value={long}><Pivot field="stage" value={sum("score")} by="subject"><Plot responsive height={300} axes2d><Points x="before" y="after" size={4.5}/></Plot></Pivot></Data>
`;export{e as default};
