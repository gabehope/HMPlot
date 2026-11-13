import { nonlinearFrame } from "./frameMapping.js";
import { buildCoordinateOperations } from "./coordinateOperations.js";
import {scalar} from "./dataView.js";
import {numpy as np} from '@hmplot/jax';
import {SelectType,ScalarType} from '../objects/types.js';
import {asArray,shapeOf} from './data.js';
export const lineCurves=['linear','step','step-before','step-after','monotone-x','monotone-y','catmull-rom','basis'];
export const linkCurves=['linear','step','step-before','step-after','link-horizontal','link-vertical','quadratic','cubic'];
export function ensureCurves(o,kind='Line'){o.ensure('curve',new SelectType({defaultValue:'linear',options:kind==='Line'?lineCurves:linkCurves}));o.ensure('curveAlpha',new ScalarType({defaultValue:.5,min:0,max:1}));}
// An ancestor's polar or spherical operation bends a locally straight path too.
const curvedChain=o=>{try{return buildCoordinateOperations(o).some(op=>op.kind==='polar'||op.kind.startsWith('spherical'));}catch{return false;}};
export const curved=o=>(['spherical','polar'].includes(o.get('coordinates'))||nonlinearFrame(o)||(o.get('curve')??'linear')!=='linear'||curvedChain(o));
/** Whether a mark draws refined pieces (utils/curvedPaths.js) in its current
 * chain. A mark may narrow the rule: a Rect refines only where its chain bends
 * its edges, never for axis-aligned bars under separable log/sqrt parents. */
/** A mark's path interpolation. Rects, bands and error bars in their own
 * spherical frame are lon/lat patches: their edges follow meridians and
 * parallels (angular). Other marks read their frame's interpolation. */
export const interpolationOf=m=>m?.lonLatPieces&&m.options?.get('coordinates')==='spherical'?'angular':(m?.options?.get('interpolation')??'great-circle');
export const refinesPieces=m=>!!m?.curvedPaths&&(m.refinesChain?m.refinesChain():curved(m.options));
export function curveControls(values,kind,curve='linear',alpha=.5){
 if(!(kind==='Line'?lineCurves:linkCurves).includes(curve))throw Error(`${curve} is not supported by ${kind}.`);
 if(!Number.isFinite(alpha)||alpha<0||alpha>1)throw Error('curveAlpha must be between zero and one.');
 if(curve==='linear'||curve.startsWith('step'))return {};
 if(kind==='Line'&&!shapeOf(values.start)[0])return {};
 const held=[],own=a=>(held.push(a),a),a=own(asArray(values.start)),b=own(asArray(values.end));
 try{
  const delta=own(b.ref.sub(a.ref));let c1,c2;
  if(curve==='quadratic'||curve==='cubic'){
   if(values.control1===undefined||curve==='cubic'&&values.control2===undefined)throw Error(`${curve} requires ${curve==='cubic'?'two control points':'control1'}.`);
   const pad=v=>{const q=asArray(v);if(q.shape[1]===2&&a.shape[1]===3)return np.concatenate([q,np.zeros([q.shape[0],1])],1);return q;};
   const p=own(pad(values.control1));
   if(p.shape.join()!=a.shape.join())throw Error('Control points must match endpoint shapes.');
   if(curve==='quadratic'){c1=a.ref.add(p.ref.sub(a.ref).mul(2/3));c2=b.ref.add(p.ref.sub(b.ref).mul(2/3));}
   else {c1=p.ref;c2=pad(values.control2);}
  }else if(curve.startsWith('link-')){
   const axis=curve==='link-horizontal'?0:1;
   c1=np.stack(Array.from({length:a.shape[1]},(_,i)=>i===axis?a.ref.slice([],i).add(b.ref.slice([],i)).mul(.5):a.ref.slice([],i)),1);
   c2=np.stack(Array.from({length:a.shape[1]},(_,i)=>i===axis?a.ref.slice([],i).add(b.ref.slice([],i)).mul(.5):b.ref.slice([],i)),1);
  }else{
   const rawP=own(asArray(values.previous)),rawN=own(asArray(values.next)),p=own(np.where(np.isfinite(rawP.ref),rawP.ref,a.ref)),n=own(np.where(np.isfinite(rawN.ref),rawN.ref,b.ref));
   if(curve==='catmull-rom'){
    const distance=(x,y)=>np.power(np.maximum(np.sum(np.square(x.sub(y)),1,{keepdims:true}),1e-20),alpha/2);
    const d0=own(distance(a.ref,p.ref)),d1=own(distance(b.ref,a.ref)),d2=own(distance(n.ref,b.ref));
    const t1=a.ref.sub(p.ref).div(d0.ref).sub(b.ref.sub(p.ref).div(d0.ref.add(d1.ref))).add(delta.ref.div(d1.ref)).mul(d1.ref);
    const t2=delta.ref.div(d1.ref).sub(n.ref.sub(a.ref).div(d1.ref.add(d2.ref))).add(n.ref.sub(b.ref).div(d2.ref)).mul(d1.ref);
    c1=a.ref.add(t1.div(3));c2=b.ref.sub(t2.div(3));
   }else if(curve==='basis'){
    c1=a.ref.mul(2/3).add(b.ref.mul(1/3));c2=a.ref.mul(1/3).add(b.ref.mul(2/3));
   }else{
    const x=curve==='monotone-x'?0:1,y=1-x;
    const slope=(p,a,b)=>{
     const h0=own(a.ref.slice([],x).sub(p.ref.slice([],x))),h1=own(b.ref.slice([],x).sub(a.ref.slice([],x)));
     const div=(dy,h)=>np.where(h.ref.notEqual(0),dy.div(np.where(h.ref.notEqual(0),h.ref,1)),0);
     const s0=own(div(a.ref.slice([],y).sub(p.ref.slice([],y)),h0)),s1=own(div(b.ref.slice([],y).sub(a.ref.slice([],y)),h1));
     const mid=s0.ref.mul(h1.ref).add(s1.ref.mul(h0.ref)).div(np.where(np.abs(h0.ref.add(h1.ref)).greater(1e-20),h0.ref.add(h1.ref),1));
     return np.sign(s0.ref).add(np.sign(s1.ref)).mul(np.minimum(np.minimum(np.abs(s0.ref),np.abs(s1.ref)),np.abs(mid).mul(.5)));
    };
    const ta=own(slope(p,a,b)),tb=own(slope(a,b,n)),h=own(delta.ref.slice([],x)),sec=own(delta.ref.slice([],y).div(np.where(h.ref.notEqual(0),h.ref,1)));
    const first=own(np.all(p.ref.equal(a.ref),1)),last=own(np.all(n.ref.equal(b.ref),1));
    const ma=own(np.where(first.ref,sec.ref.mul(3).sub(tb.ref).mul(.5),ta.ref)),mb=own(np.where(last.ref,sec.ref.mul(3).sub(ta.ref).mul(.5),tb.ref));
    c1=np.stack(Array.from({length:a.shape[1]},(_,i)=>i===x?a.ref.slice([],i).add(h.ref.div(3)):i===y?a.ref.slice([],i).add(h.ref.mul(ma.ref).div(3)):a.ref.slice([],i)),1);
    c2=np.stack(Array.from({length:a.shape[1]},(_,i)=>i===x?b.ref.slice([],i).sub(h.ref.div(3)):i===y?b.ref.slice([],i).sub(h.ref.mul(mb.ref).div(3)):b.ref.slice([],i)),1);
   }
  }
  return {control1:c1,control2:c2};
 }finally{held.forEach(a=>a.dispose());}
}

/** Clamped cubic basis, including D3's endpoint line segments. */
export function basisPath(values){
 const held=[],own=a=>(held.push(a),a),a=own(asArray(values.start)),b=own(asArray(values.end)),rawP=own(asArray(values.previous)),rawN=own(asArray(values.next));
 try{
  const finite=v=>np.all(np.isfinite(v.ref),1,{keepdims:true});
  const p=own(np.where(finite(rawP),rawP.ref,a.ref)),n=own(np.where(finite(rawN),rawN.ref,b.ref));
  const first=own(np.all(p.ref.equal(a.ref),1,{keepdims:true})),last=own(np.all(n.ref.equal(b.ref),1,{keepdims:true}));
  const start=own(p.ref.add(a.ref.mul(4)).add(b.ref).div(6)),end=own(a.ref.add(b.ref.mul(4)).add(n.ref).div(6));
  const lead=own(np.where(first.ref,a.ref,NaN)),tail=own(np.where(last.ref,b.ref,NaN));
  const leadingEnd=own(np.where(first.ref,start.ref,NaN)),trailingStart=own(np.where(last.ref,end.ref,NaN));
  const interleave=(v)=>np.stack(v,1).reshape([-1,a.shape[1]]);
  const starts=interleave([lead.ref,start.ref,trailingStart.ref]),ends=interleave([leadingEnd.ref,end.ref,tail.ref]);
  const control1=interleave([lead.ref.mul(2/3).add(leadingEnd.ref.div(3)),a.ref.mul(2).add(b.ref).div(3),trailingStart.ref.mul(2/3).add(tail.ref.div(3))]);
  const control2=interleave([lead.ref.div(3).add(leadingEnd.ref.mul(2/3)),a.ref.add(b.ref.mul(2)).div(3),trailingStart.ref.div(3).add(tail.ref.mul(2/3))]);
  return {start:starts,end:ends,control1,control2,previous:starts.ref,next:ends.ref,distance:np.zeros([starts.shape[0],1])};
 }finally{held.forEach(a=>a.dispose());}
}
export function basisAttribute(value){return value?.shape?.length?np.repeat(value.ref,3,0):value;}

export async function validateCurveFields(values,curve){
 const relevant=curve?.startsWith('monotone')||curve?.startsWith('step');
 if(relevant&&shapeOf(values.start)[0]){
  const a=asArray(values.start),b=asArray(values.end);
  try{
   if(a.shape[1]>2&&await scalar(np.sum(np.logicalAnd(np.isfinite(a.ref.slice([],2)),a.ref.slice([],2).notEqual(b.ref.slice([],2))).astype(np.int32))))throw Error(`${curve} requires constant Z.`);
   if(curve.startsWith('monotone')){
    const axis=curve==='monotone-x'?0:1,h=b.ref.slice([],axis).sub(a.ref.slice([],axis)),finite=np.logicalAnd(np.all(np.isfinite(a.ref),1),np.all(np.isfinite(b.ref),1));
    const zero=await scalar(np.sum(np.logicalAnd(finite.ref,h.ref.equal(0)).astype(np.int32)));
    const changes=h.shape[0]>1?await scalar(np.sum(np.logicalAnd(np.logicalAnd(finite.ref.slice([0,-1]),finite.ref.slice([1])),h.ref.slice([0,-1]).mul(h.ref.slice([1])).less(0)).astype(np.int32))):0;
    h.dispose();finite.dispose();if(zero||changes)throw Error(`${curve} requires strictly monotonic coordinates within each valid run.`);
   }
  }finally{a.dispose();b.dispose();}
 }
 return true;
}

export async function validateCurveInput(kind,props){
 const curve=props.curve??'linear';if(curve==='linear')return;
 if(!(kind==='Line'?lineCurves:linkCurves).includes(curve))throw Error(`${kind} does not support curve="${curve}"; use ${(kind === "Line" ? lineCurves : linkCurves).join(", ")}.`);
 if(kind==='Line'){
  const p=asArray(props.position);if(p.shape[0]<2){p.dispose();return;}
  const start=p.ref.slice([0,-1]),end=p.slice([1]);try{await validateCurveFields({start,end},curve);}finally{start.dispose();end.dispose();}
 }else await validateCurveFields(props,curve);
}
