import { operationTableWgsl } from "./operationTable.js";

/** Byte offsets of the path pass's uniform block (WGSL struct `Params`). */
export const PATH_PARAMS_LAYOUT = Object.freeze({
  matrix: 0, // mat4x4f: camera projection × view (placements are operations)
  viewport: 64, // vec4f: width, height, tolerance, band (both edges refine; a patch too)
  config: 80, // vec4f: local angular factor, base radius, radial scale, local mode
  settings: 96, // vec4f: interpolation or curve code, projection, patch turn (radians), longitude origin
  source: 112, // vec4u: rows, point stride, subdivision budget, sampled rows
  flags: 128, // vec4u: a repeating root flat map (x), a Rect patch (y), a per-row turn (z), world distances (w)
  operationCount: 144, // vec4u: operations (x); this batch's first (y) and end (z) path
  operationKinds: 160, // array<vec4u, 16>
  operationData: 416, // array<vec4f, 64>
});
export const PATH_PARAMS_BYTES = 1440;

/** Paths interpolate in their own source space, then evaluate the complete
 * ordered operation table. A piece whose ends differ in visibility or seam
 * tile is cut at the change, so hidden or wrapped parts are never bridged.
 * A Rect patch (flags.y) is a band whose edge ends are its four corners: the
 * lower and upper corners (starts, ends) turned about their center. */
export const curvedPathShader = `
@group(0) @binding(0) var<storage,read> starts:array<f32>;
@group(0) @binding(1) var<storage,read> ends:array<f32>;
@group(0) @binding(2) var<storage,read_write> counts:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> metadata:array<vec4f>;
@group(0) @binding(6) var<storage,read> indices:array<u32>;
// result[0]: pieces, overflow, cross rows; then the scan's block totals (a binding of their own
// would be a ninth storage buffer, past the default limit of 8).
@group(0) @binding(4) var<storage,read_write> result:array<vec4u>;
@group(0) @binding(7) var<storage,read> controls1:array<f32>;
@group(0) @binding(8) var<storage,read> controls2:array<f32>;
struct Params {matrix:mat4x4f,viewport:vec4f,config:vec4f,settings:vec4f,source:vec4u,flags:vec4u,operationCount:vec4u,operationKinds:array<vec4u,16>,operationData:array<vec4f,64>}
@group(0) @binding(5) var<uniform> p:Params;
const PI=3.141592653589793;
${operationTableWgsl({ count: "p.operationCount.x", kinds: "p.operationKinds", data: "p.operationData" })}
struct Pieces {count:u32,first:vec2f,second:vec2f}
fn corner(i:u32,u:f32,v:f32)->vec3f{var row=i;if(p.source.w>0u){row=indices[i];if(row==0xffffffffu){return vec3f(1e35);}}let off=row*p.source.y;var z=0.;if(p.source.y>2u){z=ends[off+2u];}let lo=vec2f(starts[off],starts[off+1u]);let hi=vec2f(ends[off],ends[off+1u]);var angle=p.settings.z;if(p.flags.z==1u){angle=controls1[row]*PI/180.;}let a=(u-.5)*(hi.x-lo.x);let b=(v-.5)*(hi.y-lo.y);return vec3f((lo+hi)*.5+vec2f(a*cos(angle)-b*sin(angle),a*sin(angle)+b*cos(angle)),z);}
fn readPoint(i:u32,end:bool)->vec3f{if(p.flags.y==1u){return corner(i,select(0.,1.,end),0.);}var row=i;if(p.source.w>0u){row=indices[i];if(row==0xffffffffu){return vec3f(1e35);}if(end){row=indices[p.source.w*2u+i];}}let off=row*p.source.y; var z=0.;if(end){if(p.source.y>2u){z=ends[off+2u];}return vec3f(ends[off],ends[off+1u],z);}if(p.source.y>2u){z=starts[off+2u];}return vec3f(starts[off],starts[off+1u],z);}
fn direction(v:vec3f)->vec3f{let l=(v.x-p.settings.w)*p.config.x;let lat=v.y*p.config.x;return vec3f(cos(lat)*sin(l),sin(lat),cos(lat)*cos(l));}
fn radius(v:vec3f)->f32{return p.config.y+v.z*p.config.z;}
fn modPositive(x:f32,m:f32)->f32{return x-floor(x/m)*m;}
fn control(i:u32,second:bool)->vec3f{if(p.flags.y==1u){return corner(i,select(0.,1.,second),1.);}var row=i;if(p.source.w>0u){row=indices[i];}let off=row*p.source.y;var q:vec3f;for(var j=0u;j<min(3u,p.source.y);j++){if(second){q[j]=controls2[off+j];}else{q[j]=controls1[off+j];}}return q;}
fn local(a:vec3f,b:vec3f,t:f32,i:u32)->vec3f{
 var angular=mix(a,b,t);
 if(p.settings.x==3.){let u=1.-t;angular=a*u*u*u+control(i,false)*3.*u*u*t+control(i,true)*3.*u*t*t+b*t*t*t;}
 if(p.settings.x==4.){let x=mix(a.x,b.x,.5);if(t<1./3.){angular=vec3f(mix(a.x,x,t*3.),a.y,a.z);}else if(t<2./3.){angular=vec3f(x,mix(a.y,b.y,t*3.-1.),a.z);}else{angular=vec3f(mix(x,b.x,t*3.-2.),b.y,a.z);}}
 if(p.settings.x==5.){if(t<.5){angular=vec3f(a.x,mix(a.y,b.y,t*2.),a.z);}else{angular=vec3f(mix(a.x,b.x,t*2.-1.),b.y,a.z);}}
 if(p.settings.x==6.){if(t<.5){angular=vec3f(mix(a.x,b.x,t*2.),a.y,a.z);}else{angular=vec3f(b.x,mix(a.y,b.y,t*2.-1.),a.z);}}
 if(p.config.w==0.||p.config.w==5.){return angular;}
 if(p.settings.x==2.){let q=mix(direction(a)*radius(a),direction(b)*radius(b),t);return vec3f(atan2(q.x,q.z)/p.config.x+p.settings.w,asin(clamp(q.y/max(length(q),1e-20),-1.,1.))/p.config.x,(length(q)-p.config.y)/max(p.config.z,1e-20));}
 if(p.settings.x==0.){let u=direction(a);let v=direction(b);let d=clamp(dot(u,v),-1.,1.);let angle=acos(d);var tangent=v-u*d;var axis=vec3f(0.,1.,0.);if(abs(u.y)>.9){axis=vec3f(1.,0.,0.);}if(length(tangent)<1e-6){tangent=axis-u*dot(axis,u);}tangent=normalize(tangent);var q=u*cos(angle*t)+tangent*sin(angle*t);if(d>.999999){q=normalize(mix(u,v,t));}let origin=(a.x-p.settings.w)*p.config.x;let lon=origin+modPositive(atan2(q.x,q.z)-origin+PI,2.*PI)-PI;angular=vec3f(lon/p.config.x+p.settings.w,asin(clamp(q.y,-1.,1.))/p.config.x,mix(a.z,b.z,t));}
 return angular;
}
// Compilers inline every call, so each call site of operationPoint below is a
// full copy of the operation table. Every helper therefore evaluates in one
// place, looping over its inputs (TODO 57): repeated calls compiled for seconds
// on a GPU and never finished on SwiftShader.
fn sample(a:vec3f,b:vec3f,t:f32,i:u32)->OperationPoint{
 // A chord on a local globe is already canonical; only its ancestors remain.
 var input:vec3f;var first=0u;
 if(p.config.w==3.&&p.settings.x==2.){input=mix(direction(a)*radius(a),direction(b)*radius(b),t);first=1u;}else{input=local(a,b,t,i);}
 return operationPoint(input,first);
}
// Edge 0 is the path (a band's lower edge); edge 1 a band's upper edge.
fn edgeEnd(a:vec3f,b:vec3f,i:u32,k:u32,end:bool)->vec3f{if(k==1u){return control(i,end);}return select(a,b,end);}
fn edgeCount()->u32{return select(1u,2u,p.viewport.w>0.);}
// A band's point is visible where both of its edges are.
fn visible(a:vec3f,b:vec3f,t:f32,i:u32)->OperationPoint{
 var lower=OperationPoint(vec3f(0.),false,0.);
 for(var k=0u;k<edgeCount();k++){let q=sample(edgeEnd(a,b,i,k,false),edgeEnd(a,b,i,k,true),t,i);if(k==0u){lower=q;if(!q.valid){break;}}else if(!q.valid){lower.valid=false;}}
 return lower;
}
fn screen(v:vec3f)->vec2f{let q=p.matrix*vec4f(v,1.);return q.xy/max(abs(q.w),1e-6)*p.viewport.xy*.5;}
fn boundary(a:vec3f,b:vec3f,inside:f32,outside:f32,i:u32,seam:f32)->f32{var lo=inside;var hi=outside;for(var k=0u;k<24u;k++){let m=(lo+hi)*.5;let q=visible(a,b,m,i);if(q.valid&&q.seam==seam){lo=m;}else{hi=m;}}return lo;}
fn pieces(a:vec3f,b:vec3f,t0:f32,t1:f32,i:u32)->Pieces{
 var tips:array<OperationPoint,2>;for(var k=0u;k<2u;k++){tips[k]=visible(a,b,select(t0,t1,k==1u),i);}
 let lo=tips[0];let hi=tips[1];
 if(lo.valid&&hi.valid&&lo.seam==hi.seam){return Pieces(1u,vec2f(t0,t1),vec2f(0.));}
 if(!lo.valid&&!hi.valid){return Pieces(0u,vec2f(0.),vec2f(0.));}
 // Cut at each change of visibility or seam: from the lower end, the upper end, or both.
 var origin=array<f32,2>(t0,t1);var toward=array<f32,2>(t1,t0);var seams=array<f32,2>(lo.seam,hi.seam);var first=0u;var last=2u;
 if(!hi.valid){last=1u;}if(!lo.valid){first=1u;}
 var cut=array<f32,2>(t1,t0);for(var k=first;k<last;k++){cut[k]=boundary(a,b,origin[k],toward[k],i,seams[k]);}
 if(lo.valid&&hi.valid){return Pieces(2u,vec2f(t0,cut[0]),vec2f(cut[1],t1));}
 // A piece that only touches a horizon or limit has no visible length.
 if(lo.valid){return Pieces(select(0u,1u,cut[0]>t0),vec2f(t0,cut[0]),vec2f(0.));}
 return Pieces(select(0u,1u,cut[1]<t1),vec2f(cut[1],t1),vec2f(0.));
}
fn piece(s:Pieces,k:u32)->vec2f{if(k==0u){return s.first;}return s.second;}
// A screen point's distance from the chord lo-hi (the segment, not its line).
fn offChord(q:vec2f,lo:vec2f,hi:vec2f)->f32{let d=hi-lo;let l=dot(d,d);var s=0.;if(l>0.){s=clamp(dot(q-lo,d)/l,0.,1.);}return length(q-lo-d*s);}
// Chord deviation of one visible interval: x, each quarter probe's distance from the chord's
// point at the same parameter; w, its distance from the chord itself (the drawn shape's error:
// a straight line under a log scale moves along its chord, with x but not w). A probe whose
// visibility or seam differs from its ends reports a mismatch (y) so refinement can find it; z is
// the interval's drawn length on screen, in viewport heights (what span computes): the dash
// distance along the path (TODO 73.2).
// Samples in order: the ends (u0, u1), then quarter probes.
fn chord(a:vec3f,b:vec3f,u0:f32,u1:f32,i:u32)->vec4f{
 var first:OperationPoint;var lo:vec2f;var hi:vec2f;var e=0.;var g=0.;var extent=0.;var bmin=vec2f(1e30);var bmax=vec2f(-1e30);
 for(var k=0u;k<5u;k++){
  var t=u0;if(k==1u){t=u1;}if(k>1u){t=mix(u0,u1,f32(k-1u)*.25);}
  let q=sample(a,b,t,i);
  if(k==0u){first=q;continue;}
  if(k==1u){
   let last=q;
   if(!first.valid||!last.valid){return vec4f(0.,1.,0.,0.);}
   lo=screen(first.point);hi=screen(last.point);bmin=min(lo,hi);bmax=max(lo,hi);extent=length(hi-lo)/max(p.viewport.y,1.);if(p.flags.w==1u){extent=length(last.point-first.point);}
   if(p.flags.x==1u&&p.config.w==2.&&p.settings.y!=3.&&abs(last.point.x-first.point.x)>PI/2.){var cap=PI/2.;if(p.settings.y==1.){cap=PI;}if(p.settings.y==2.){cap=1.;}let edge=screen(vec3f(first.point.x,sign(first.point.y)*cap,0.));if(abs(lo.y-edge.y)<=p.viewport.z&&abs(hi.y-edge.y)<=p.viewport.z){return vec4f(0.,0.,extent,0.);}}
   continue;
  }
  if(!q.valid||q.seam!=first.seam){return vec4f(e,1.,extent,g);}let s=screen(q.point);bmin=min(bmin,s);bmax=max(bmax,s);e=max(e,length(s-mix(lo,hi,f32(k-1u)*.25)));g=max(g,offChord(s,lo,hi));
 }
 // Off screen, error is invisible: an interval whose samples all lie past one edge, by half
 // the viewport, refines no further (2026-10-22: zoomed far in, a curve spanning 10^5 px never
 // met the tolerance anywhere, so every zoom step refined every path to the budget, then failed).
 let half=p.viewport.xy*.5;let margin=half;
 if(any(bmin>half+margin)||any(bmax< -half-margin)){return vec4f(0.,0.,extent,0.);}
 return vec4f(e,0.,extent,g);
}
// The deviation of n uniform intervals (x, y and, in z, chord's w), and the pieces they emit
// with their total length (the path's own edge), so an accepted n needs no second pass.
struct Refinement {e:vec3f,emitted:u32,distance:f32}
fn error(a:vec3f,b:vec3f,n:u32,i:u32)->Refinement{var e=vec3f(0.);var emitted=0u;var distance=0.;for(var j=0u;j<n;j++){let t0=f32(j)/f32(n);let t1=f32(j+1u)/f32(n);let s=pieces(a,b,t0,t1,i);
 if(s.count==0u){for(var k=1u;k<4u;k++){if(visible(a,b,mix(t0,t1,f32(k)*.25),i).valid){e.y=1.;}}continue;}
 for(var k=0u;k<s.count;k++){let r=piece(s,k);for(var g=0u;g<edgeCount();g++){let c=chord(edgeEnd(a,b,i,g,false),edgeEnd(a,b,i,g,true),r.x,r.y,i);e=vec3f(max(e.x,c.x),max(e.y,c.y),max(e.z,c.w));if(g==0u){emitted++;distance+=c.z;}}}}return Refinement(e,emitted,distance);}
fn span(a:vec3f,b:vec3f,r:vec2f,i:u32)->f32{var q:array<vec3f,2>;for(var k=0u;k<2u;k++){q[k]=sample(a,b,select(r.x,r.y,k==1u),i).point;}if(p.flags.w==1u){return length(q[1]-q[0]);}return length(screen(q[1])-screen(q[0]))/max(p.viewport.y,1.);}
// A band's cross-section at u runs from its lower to its upper edge in source
// space. Under a curving chain it bends too; rows split it uniformly. Each row
// samples its ends (v0, v1), then quarter probes.
fn crossError(a:vec3f,b:vec3f,c:vec3f,d:vec3f,u:f32,m:u32)->f32{let lower=mix(a,b,u);let upper=mix(c,d,u);var e=0.;for(var k=0u;k<m;k++){let v0=f32(k)/f32(m);let v1=f32(k+1u)/f32(m);
 var rowEnds:array<OperationPoint,2>;var lo:vec2f;var hi:vec2f;
 for(var s=0u;s<5u;s++){var v=v0;if(s==1u){v=v1;}if(s>1u){v=mix(v0,v1,f32(s-1u)*.25);}
  let q=operationPoint(mix(lower,upper,v),0u);
  if(s<2u){rowEnds[s]=q;if(s==1u){if(!rowEnds[0].valid||!rowEnds[1].valid){break;}lo=screen(rowEnds[0].point);hi=screen(rowEnds[1].point);}continue;}
  if(q.valid){e=max(e,length(screen(q.point)-mix(lo,hi,f32(s-1u)*.25)));}}}return e;}
// Rows sampled at every stride-th vertex and at the end (u = 1).
fn crossRows(a:vec3f,b:vec3f,c:vec3f,d:vec3f,n:u32)->u32{let stride=max(1u,(n+15u)/16u);var m=1u;loop{var e=0.;var j=0u;loop{let end=j>n;var u=f32(j)/f32(n);if(end){u=1.;}e=max(e,crossError(a,b,c,d,u,m));if(end){break;}j+=stride;}if(e<=p.viewport.z||m>=64u){break;}m*=2u;}return m;}
// Count and fill run in batches of paths (sphericalBudget.js MAX_PATHS), one submission each.
@compute @workgroup_size(64) fn countPaths(@builtin(global_invocation_id) id:vec3u){let i=p.operationCount.y+id.x;if(i>=min(p.source.x,p.operationCount.z)){return;}let a=readPoint(i,false);let b=readPoint(i,true);counts[i*2u+1u]=vec4f(0.);if(!(all(abs(a)<vec3f(1e30))&&all(abs(b)<vec3f(1e30)))){counts[i*2u]=vec4f(0.);return;}
 let band=p.viewport.w>0.;if(band&&!(all(abs(control(i,false))<vec3f(1e30))&&all(abs(control(i,true))<vec3f(1e30)))){counts[i*2u]=vec4f(0.);return;}
 var n=1u;if(p.settings.x==4.){n=3u;}if(p.settings.x>=5.){n=2u;}if(p.settings.x==1.){n=max(1u,u32(ceil(max(abs(b.x-a.x),abs(b.y-a.y))*p.config.x/(PI/4.))));}
 var r:Refinement;
 // Refined until each probe is within the tolerance of its chord's point at the same parameter,
 // or to the budget, which draws (TODO 69: a straight line under a log scale, at a device pixel
 // ratio of 2, never met the first; 2026-10-22: failing the mark at the budget blanked it).
 loop{r=error(a,b,n,i);if(r.e.x<=p.viewport.z&&r.e.y==0.){break;}if(n>=min(p.source.z,256u)){break;}n*=2u;}
 let emitted=r.emitted;let distance=r.distance;
 var rows=1u;if(band&&emitted>0u){rows=crossRows(a,b,control(i,false),control(i,true),n);}
 counts[i*2u]=vec4f(f32(emitted),0.,distance,0.);counts[i*2u+1u]=vec4f(f32(n),f32(rows),0.,0.);
}
// The prefix over paths is a parallel scan (TODO 136.11; a serial one stopped at 1,024 paths):
// scanBlocks totals each block of 256 paths, scanTops turns those totals into each block's
// prefix (and the result: pieces, overflow, cross rows), scanRows writes each path's prefix.
// An item is (pieces, reset | overflow << 1, distance bits, cross rows). A piece's distance runs
// on from the path before it, unless that path drew nothing or does not end where it starts:
// the distance is x -> reset ? add : x + add, so items compose like resets and sums.
var<workgroup> scratch:array<vec4u,256>;
fn connected(i:u32)->bool{return i==0u||all(readPoint(i,false)==readPoint(i-1u,true));}
fn item(i:u32)->vec4u{if(i>=p.source.x){return vec4u(0u);}let c=counts[i*2u];if(c.x<0.){return vec4u(0u,2u,0u,0u);}let rows=u32(counts[i*2u+1u].y);if(c.x==0.){return vec4u(0u,1u,0u,rows);}return vec4u(u32(c.x),select(1u,0u,connected(i)),bitcast<u32>(c.z),rows);}
fn combine(a:vec4u,b:vec4u)->vec4u{let pieces=a.x+b.x;var add=bitcast<f32>(b.z);if((b.y&1u)==0u){add+=bitcast<f32>(a.z);}return vec4u(select(pieces,0xffffffffu,pieces<a.x),a.y|b.y,bitcast<u32>(add),max(a.w,b.w));}
// Inclusive over the workgroup; scratch holds every thread's result on return.
fn scanGroup(l:u32,v:vec4u)->vec4u{scratch[l]=v;workgroupBarrier();for(var d=1u;d<256u;d*=2u){var q=scratch[l];if(l>=d){q=combine(scratch[l-d],q);}workgroupBarrier();scratch[l]=q;workgroupBarrier();}return scratch[l];}
@compute @workgroup_size(256) fn scanBlocks(@builtin(local_invocation_index) l:u32,@builtin(workgroup_id) w:vec3u){let q=scanGroup(l,item(w.x*256u+l));if(l==255u){result[1u+w.x]=q;}}
@compute @workgroup_size(256) fn scanTops(@builtin(local_invocation_index) l:u32){let count=(p.source.x+255u)/256u;var carry=vec4u(0u);for(var base=0u;base<count;base+=256u){let j=base+l;var v=vec4u(0u);if(j<count){v=result[1u+j];}scanGroup(l,v);var before=carry;if(l>0u){before=combine(carry,scratch[l-1u]);}let last=scratch[255u];workgroupBarrier();if(j<count){result[1u+j]=before;}carry=combine(carry,last);}
 if(l==0u){result[0]=vec4u(carry.x,(carry.y>>1u)&1u,max(1u,carry.w),0u);}}
@compute @workgroup_size(256) fn scanRows(@builtin(local_invocation_index) l:u32,@builtin(workgroup_id) w:vec3u){let i=w.x*256u+l;scanGroup(l,item(i));var before=result[1u+w.x];if(l>0u){before=combine(before,scratch[l-1u]);}if(i>=p.source.x){return;}counts[i*2u].y=f32(before.x);counts[i*2u].w=select(0.,bitcast<f32>(before.z),connected(i));}
@compute @workgroup_size(64) fn fillPaths(@builtin(global_invocation_id) id:vec3u){let i=p.operationCount.y+id.x;if(i>=min(p.source.x,p.operationCount.z)){return;}let c=counts[i*2u];if(c.x<=0.){return;}let n=min(256u,u32(max(0.,counts[i*2u+1u].x)));let a=readPoint(i,false);let b=readPoint(i,true);var slot=u32(c.y);var distance=c.w;for(var j=0u;j<n;j++){let s=pieces(a,b,f32(j)/f32(n),f32(j+1u)/f32(n),i);for(var k=0u;k<s.count;k++){let r=piece(s,k);metadata[slot]=vec4f(f32(i),r.x,r.y,distance);distance+=span(a,b,r,i);slot++;}}}
`;
