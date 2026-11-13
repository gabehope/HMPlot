// @ts-check
// Index-only GPU path simplification. No coordinates leave the device and scratch
// storage is bounded by the draw budget, not the length of the source paths.
/** Identical validation, deterministic reservoir selection and seam boundaries. The two
 * dispatch kernels below retain their different path-discovery policies. Expanding this
 * source fragment changes neither emitted WGSL bytes nor shader call sites. */
const SAMPLING_HELPERS = `fn valid(i:u32)->bool {for(var a=0u;a<min(3u,p.sourceStride);a++){let off=i*p.subdivisions*p.sourceStride+a;if(!(abs(starts[off])<3.4e38&&abs(ends[off])<3.4e38)){return false;}}return true;}
fn random(state:ptr<function,u32>)->f32 {var x=*state;x=x^(x<<13u);x=x^(x>>17u);x=x^(x<<5u);*state=x;return (f32(x>>8u)+.5)/16777216.;}
// Skip-based reservoir selection is repeatable under append. Sorting only the bounded reservoir
// reconnects selected vertices in path order instead of drawing disconnected edges.
fn reservoir(n:u32,k:u32,offset:u32,seed:u32){var state=seed|1u;for(var i=0u;i<k;i++){scratch[offset+i]=i;}
 if(k>0u){var w=exp(log(random(&state))/f32(k));var next=k+u32(floor(log(random(&state))/log(1.-w)));
 loop{if(next>=n){break;}scratch[offset+min(k-1u,u32(random(&state)*f32(k)))]=next;w*=exp(log(random(&state))/f32(k));next+=1u+u32(floor(log(random(&state))/log(1.-w)));}}
 // Heap sort keeps sorting work bounded by O(budget log budget).
 for(var root=i32(k/2u)-1;root>=0;root--){var r=u32(root);loop{let child=r*2u+1u;if(child>=k){break;}var c=child;if(c+1u<k&&scratch[offset+c]<scratch[offset+c+1u]){c++;}if(scratch[offset+r]>=scratch[offset+c]){break;}let t=scratch[offset+r];scratch[offset+r]=scratch[offset+c];scratch[offset+c]=t;r=c;}}
 for(var end=k;end>1u;end--){let t=scratch[offset];scratch[offset]=scratch[offset+end-1u];scratch[offset+end-1u]=t;var r=0u;loop{let child=r*2u+1u;if(child>=end-1u){break;}var c=child;if(c+1u<end-1u&&scratch[offset+c]<scratch[offset+c+1u]){c++;}if(scratch[offset+r]>=scratch[offset+c]){break;}let tmp=scratch[offset+r];scratch[offset+r]=scratch[offset+c];scratch[offset+c]=tmp;r=c;}}
}
fn seam(i:u32)->bool{if(!(p.factor>0.)){return false;}let off=i*p.subdivisions*p.sourceStride;let a=(starts[off]-p.origin)*p.factor;let b=(ends[off]-p.origin)*p.factor;return floor((a+3.14159265359)/6.28318530718)!=floor((b+3.14159265359)/6.28318530718)||abs(b-a)>=3.14159265359;}
fn boundary(i:u32)->bool{return i==0u||!valid(i-1u)||seam(i)||seam(i-1u);}
`;

export const pathSamplingShader = `
@group(0) @binding(0) var<storage,read> starts:array<f32>;
@group(0) @binding(1) var<storage,read> ends:array<f32>;
@group(0) @binding(2) var<storage,read_write> indices:array<u32>;
@group(0) @binding(3) var<storage,read_write> scratch:array<u32>;
struct Params {count:u32,budget:u32,subdivisions:u32,total:u32,sourceStride:u32,fields:u32,startField:u32,endField:u32,previousField:u32,nextField:u32,pad0:u32,pad1:u32,factor:f32,origin:f32,pad2:u32,pad3:u32}
@group(0) @binding(4) var<uniform> p:Params;
@group(0) @binding(5) var<storage,read> prefix:array<vec2u>;
@group(0) @binding(6) var<storage,read> pathInfo:array<vec4u>;
${SAMPLING_HELPERS}@compute @workgroup_size(1) fn main(){
 let paths=prefix[p.total-1u].x;let usable=prefix[p.total-1u].y;
 // Unused draw slots collapse to a zero-length segment and never become bridges.
 for(var i=0u;i<p.count*(p.fields+1u);i++){indices[i]=0u;}
 let budget=min(p.budget,usable);let selected=min(paths,budget);
 if(paths>budget){reservoir(paths,selected,0u,42u);}
 var row=0u;
 for(var chosen=0u;chosen<selected;chosen++){
 let path=select(chosen,scratch[chosen],paths>budget);
 let info=pathInfo[path];let begin=info.x;let end=info.y;let length=end-begin;
 let interiorPrefix=info.z-path;
 var take=1u;
 if(paths<=budget){let extra=budget-paths;let denom=max(1u,usable-paths);take=1u+u32(floor(f32(interiorPrefix+length-1u)*f32(extra)/f32(denom)))-u32(floor(f32(interiorPrefix)*f32(extra)/f32(denom)));}
 if(take>0u){let off=p.budget+1u;reservoir(length-1u,take-1u,off,42u+begin*747796405u);
 for(var j=0u;j<take;j++){
 let a=select(begin,begin+1u+scratch[off+max(1u,j)-1u],j>0u);
 let b=select(end,begin+1u+scratch[off+j],j+1u<take);
 let prev=select(begin,begin+1u+scratch[off+max(2u,j)-2u],j>1u);
 let next=select(end,begin+1u+scratch[off+j+1u],j+2u<take);
 for(var sub=0u;sub<p.subdivisions;sub++){let r=(row+j)*p.subdivisions+sub;indices[r]=a*p.subdivisions+sub;
 for(var field=0u;field<p.fields;field++){var source=a*p.subdivisions+sub;if(field==p.endField){source=b*p.subdivisions-1u;}else if(field==p.previousField){source=select(prev,a,p.pad1==1u)*p.subdivisions;}else if(field==p.nextField){source=select(next,b,p.pad1==1u)*p.subdivisions-1u;}indices[(field+1u)*p.count+r]=source;}}
 }row+=take;}
 }
 // Remaining rows are explicitly marked inactive for the reconstruction pass.
 for(var i=row*p.subdivisions;i<p.count;i++){indices[i]=0xffffffffu;}
}
`;

// A sampled spherical path selects at most 1,024 paths (curvedPaths.js build): one thread runs it.
// Index-only GPU path simplification. No coordinates leave the device and scratch
// storage is bounded by the draw budget, not the length of the source paths.
export const sphericalPathSamplingShader = `
@group(0) @binding(0) var<storage,read> starts:array<f32>;
@group(0) @binding(1) var<storage,read> ends:array<f32>;
@group(0) @binding(2) var<storage,read_write> indices:array<u32>;
@group(0) @binding(3) var<storage,read_write> scratch:array<u32>;
struct Params {count:u32,budget:u32,subdivisions:u32,total:u32,sourceStride:u32,fields:u32,startField:u32,endField:u32,previousField:u32,nextField:u32,pad0:u32,pad1:u32,factor:f32,origin:f32,pad2:u32,pad3:u32}
@group(0) @binding(4) var<uniform> p:Params;
${SAMPLING_HELPERS}@compute @workgroup_size(1) fn main(){
 var paths=0u;var usable=0u;var wasValid=false;
 for(var i=0u;i<p.total;i++){let ok=valid(i);if(ok){usable++;if(!wasValid||boundary(i)){paths++;}}wasValid=ok;}
 // Unused draw slots collapse to a zero-length segment and never become bridges.
 for(var i=0u;i<p.count*(p.fields+1u);i++){indices[i]=0u;}
 let budget=min(p.budget,usable);let selected=min(paths,budget);
 if(paths>budget){reservoir(paths,selected,0u,42u);}
 var path=0u;var cursor=0u;var row=0u;var interiorPrefix=0u;var chosen=0u;
 loop{if(cursor>=p.total){break;}if(!valid(cursor)){cursor++;continue;}
 let begin=cursor;loop{cursor++;if(cursor>=p.total||!valid(cursor)||boundary(cursor)){break;}}let end=cursor;let length=end-begin;
 var take=0u;
 if(paths<=budget){let extra=budget-paths;let denom=max(1u,usable-paths);take=1u+u32(floor(f32(interiorPrefix+length-1u)*f32(extra)/f32(denom)))-u32(floor(f32(interiorPrefix)*f32(extra)/f32(denom)));interiorPrefix+=length-1u;}
 else if(chosen<selected&&scratch[chosen]==path){take=1u;chosen++;}
 if(take>0u){let off=p.budget+1u;reservoir(length-1u,take-1u,off,42u+begin*747796405u);
 for(var j=0u;j<take;j++){
 let a=select(begin,begin+1u+scratch[off+max(1u,j)-1u],j>0u);
 let b=select(end,begin+1u+scratch[off+j],j+1u<take);
 let prev=select(begin,begin+1u+scratch[off+max(2u,j)-2u],j>1u);
 let next=select(end,begin+1u+scratch[off+j+1u],j+2u<take);
 for(var sub=0u;sub<p.subdivisions;sub++){let r=(row+j)*p.subdivisions+sub;indices[r]=a*p.subdivisions+sub;
 for(var field=0u;field<p.fields;field++){var source=a*p.subdivisions+sub;if(field==p.endField){source=b*p.subdivisions-1u;}else if(field==p.previousField){source=select(prev,a,p.pad1==1u)*p.subdivisions;}else if(field==p.nextField){source=select(next,b,p.pad1==1u)*p.subdivisions-1u;}indices[(field+1u)*p.count+r]=source;}}
 }row+=take;}
 path++;
 }
 // Remaining rows are explicitly marked inactive for the reconstruction pass.
 for(var i=row*p.subdivisions;i<p.count;i++){indices[i]=0xffffffffu;}
}
`;
