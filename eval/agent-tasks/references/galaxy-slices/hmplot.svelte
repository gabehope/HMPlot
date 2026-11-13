<script>
  import {expose} from "./web-utils.js";
  $effect(()=>expose("face",face));
  $effect(()=>expose("counter",counter));
  $effect(()=>expose("primary",cloud));

  import {Theme,themes,Plot,Data,Filter,Points,Text,Group,continuous,abs,less_equal,logical_and,logical_or,logical_not} from 'hmplot';
  import {parquet,columns} from './web-utils.js';import url from './data/stars.parquet?url';
  const loaded=parquet(url).then(rows=>({table:columns(rows),maxHeight:rows.reduce((m,r)=>Math.max(m,Math.abs(r.z_kpc)),0),span:rows.reduce((m,r)=>Math.max(m,Math.abs(r.x_kpc),Math.abs(r.y_kpc),Math.abs(r.z_kpc)),0)}));
  const age=continuous({domain:[0,14],colormap:['#2878d0','#d94036']});
  let height=$state(null),face=$state(),counter=$state(),cloud=$state();
</script>
<svelte:head><title>Galaxy slices</title></svelte:head>
<main><h1>Galaxy slices</h1><p>All 200,000 stars. Brush the face-on view to retain age colors for selected stars; others remain faint grey in 3D.</p>
{#await loaded}<p>Loading stars…</p>{:then stars}
<label>Maximum |z| (kpc) <input aria-label="Maximum height" type="range" min=".1" max={stars.maxHeight} step=".01" value={height??stars.maxHeight} oninput={e=>height=+e.currentTarget.value}/></label><output>{(height??stars.maxHeight).toFixed(2)} kpc</output><button onclick={()=>face?.clearBrush()}>Clear selection</button>
<Data value={stars.table}><Filter where={less_equal(abs('z_kpc'),height??stars.maxHeight)}><div class="views">
<Theme value={themes.dark}><Plot autoBounds legend bind:this={cloud} title="Galaxy" type="3d" width={650} height={560} responsive cameraPosition={[30,-37,25]} x={{domain:[-stars.span,stars.span]}} y={{domain:[-stars.span,stars.span]}} z={{domain:[-stars.span,stars.span]}}>
<Filter where={logical_and('@any_brushed',logical_not('@brushed'))}><Points x="x_kpc" y="y_kpc" z="z_kpc" size={1.2} fill="#b4bac5" opacity={.035} blend="additive"/></Filter>
<Filter where={logical_or(logical_not('@any_brushed'),'@brushed')}><Points x="x_kpc" y="y_kpc" z="z_kpc" size={1.3} fill="age_gyr" fillScale={age} opacity={.35} blend="additive"/></Filter>
</Plot></Theme><Plot autoBounds bind:this={face} title="Face-on view" width={530} height={560} responsive aspect="equal" x={{domain:[-stars.span,stars.span],label:'x (kpc)'}} y={{domain:[-stars.span,stars.span],label:'y (kpc)'}}>
<Points x="x_kpc" y="y_kpc" fill="#3983be" size={1.2} opacity={.16} brush respond="brushed" selectionOpacity={.08}/>
</Plot></div>
<Plot autoBounds bind:this={counter} height={65} axes2d={false} interactive={false} x={{domain:[0,1]}} y={{domain:[0,1]}}><Group><Text x={.05} y={.5} text="count" format="," align="left" size={18}/></Group><Text x={.4} y={.5} text="stars within height limit" align="left"/></Plot>
</Filter></Data>
{:catch error}<p role="alert">{error.message}</p>{/await}</main>
<style>:global(body){margin:0;background:#f6f8fb;color:#233447;font:14px system-ui}main{max-width:1280px;margin:auto;padding:24px}h1{margin:0}.views{display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin-top:18px}input{width:400px}output{margin:0 20px}button{padding:6px 12px}</style>
