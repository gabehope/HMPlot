<script>
 import {getContext,setContext,onDestroy,untrack} from 'svelte';
 import {MAPPING_CONTEXT} from './utils/mapping.js';
 import {getOptionsContext,setOptionsContext} from './utils/context.js';
 import {FieldType} from './objects/types.js';
 let {children,name,...values}=$props();
 const parent=getContext(MAPPING_CONTEXT);
 let options;try{options=getOptionsContext().splitUnique(untrack(()=>name),'group','Mapping');setOptionsContext(options);}catch{}
 let revision=$state(0);const stop=options?.on(()=>untrack(()=>revision++));
 $effect(()=>{const props={...values};untrack(()=>{if(!options)return;for(const [k,v] of Object.entries(props)){if(k.startsWith('on'))continue;options.ensure(k,new FieldType({defaultValue:v,ui:{ui:'text'}}));options.set(k,v);}options.setDisplayList(Object.keys(props).filter(k=>!k.startsWith('on')));});});
 setContext(MAPPING_CONTEXT,{read(){revision;return [...(parent?.read()??[]),{
   ...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,options?.has(k)?options.get(k):v])),
   __mappingSource:{kind:'mapping',label:name||'Mapping'}
 }];},name:()=>name});
 export const subscribeSettings=f=>{if(!options)return()=>{};const send=()=>f(Object.fromEntries(Object.keys(values).map(k=>[k,options.get(k)])));send();return options.on(send);};
 onDestroy(()=>{stop?.();options?.dispose();});
</script>
{@render children?.()}
