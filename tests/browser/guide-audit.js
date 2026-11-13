import { Array as JaxArray } from '@hmplot/jax';
let original,reads;
export function beginGuideAudit(){
 reads=[];original=JaxArray.prototype.data;
 JaxArray.prototype.data=function(...args){reads.push(this.size);return original.apply(this,args);};
}
export function finishGuideAudit(){if(original)JaxArray.prototype.data=original;original=null;return reads;}
