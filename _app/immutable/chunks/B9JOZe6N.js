import{av as N,aw as x,ax as C,a0 as _,ay as F,az as T,aA as S}from"./tOd4CyYd.js";import{r as j,p as A}from"./iEFFB-Pd.js";const R=Object.freeze({matrix:0,viewport:64,source:80,operationCount:96,operationKinds:112,operationData:368}),B=1392,p=256,E="endpointOffset",$=`
@group(0) @binding(0) var<storage, read> starts: array<f32>;
@group(0) @binding(1) var<storage, read> ends: array<f32>;
@group(0) @binding(2) var<storage, read> offsets: array<f32>;
@group(0) @binding(3) var<storage, read_write> distances: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> lengths: array<f32>;
struct Params { matrix: mat4x4f, viewport: vec4f, source: vec4u, operationCount: vec4u,
  operationKinds: array<vec4u, 16>, operationData: array<vec4f, 64> }
@group(0) @binding(5) var<uniform> p: Params;
${N({count:"p.operationCount.x",kinds:"p.operationKinds",data:"p.operationData"})}
var<workgroup> sums: array<f32, ${p}>;
var<workgroup> resets: array<u32, ${p}>;
fn source(i: u32, end: bool) -> vec3f {
  var v = vec3f(0.);
  let base = i * p.source.y;
  for (var a = 0u; a < min(3u, p.source.y); a++) { if (end) { v[a] = ends[base + a]; } else { v[a] = starts[base + a]; } }
  return v;
}
// A row end in device pixels (y up), its pixel offset added (z: 1 when it maps, else 0).
fn screen(i: u32, end: bool) -> vec3f {
  let q = operationPoint(source(i, end), 0u);
  if (!q.valid) { return vec3f(0.); }
  let clip = p.matrix * vec4f(q.point, 1.);
  if (!(clip.w > 1e-7)) { return vec3f(0.); }
  var at = clip.xy / clip.w * p.viewport.xy * 0.5;
  if ((p.source.w & 1u) != 0u) {
    let k = i * 4u + select(0u, 2u, end);
    at += vec2f(offsets[k], offsets[k + 1u]) * p.viewport.z;
  }
  return vec3f(at, 1.);
}
// A row starts a path over: the first row, after a row that maps nowhere, or away from the
// previous row's end.
fn restarts(i: u32) -> bool {
  if (i == 0u) { return true; }
  if (lengths[i - 1u] < 0.) { return true; }
  return any(source(i, false) != source(i - 1u, true));
}
@compute @workgroup_size(${p}) fn main(@builtin(local_invocation_index) t: u32) {
  let rows = p.source.x;
  let chunk = (rows + ${p-1}u) / ${p}u;
  let lo = min(rows, t * chunk);
  let hi = min(rows, lo + chunk);
  for (var i = lo; i < hi; i++) {
    let a = screen(i, false);
    let b = screen(i, true);
    lengths[i] = select(-1., length(b.xy - a.xy), a.z > 0.5 && b.z > 0.5);
  }
  storageBarrier();
  workgroupBarrier();
  var running = 0.;
  var reset = 0u;
  for (var i = lo; i < hi; i++) {
    if (restarts(i)) { running = 0.; reset = 1u; }
    running += max(lengths[i], 0.);
  }
  sums[t] = running;
  resets[t] = reset;
  workgroupBarrier();
  if (t == 0u) {
    var carry = 0.;
    for (var k = 0u; k < ${p}u; k++) {
      let sum = sums[k];
      sums[k] = carry;
      carry = select(carry + sum, sum, resets[k] == 1u);
    }
  }
  workgroupBarrier();
  running = sums[t];
  let pieces = max(p.source.z, 1u);
  let height = max(p.viewport.y, 1.);
  for (var i = lo; i < hi; i++) {
    if (restarts(i)) { running = 0.; }
    let length = max(lengths[i], 0.);
    for (var j = 0u; j < pieces; j++) {
      distances[i * pieces + j] = vec2f(running + length * f32(j) / f32(pieces),
        running + length * f32(j + 1u) / f32(pieces)) / height;
    }
    running += length;
  }
}
`,P=new WeakMap;function L(u){let e=P.get(u);if(!e){const o=u.createBindGroupLayout({entries:[0,1,2,3,4,5].map(s=>({binding:s,visibility:GPUShaderStage.COMPUTE,buffer:{type:s===5?"uniform":s<3?"read-only-storage":"storage"}}))}),n=u.createComputePipeline({layout:u.createPipelineLayout({bindGroupLayouts:[o]}),compute:{module:u.createShaderModule({code:$}),entryPoint:"main"}});e={layout:o,pipeline:n},P.set(u,e)}return e}class W{constructor(e){this.mark=e,this.capacity=1,this.buffer=new x(new Float32Array(2),2),this.storage=C(this.buffer,"vec2",1).setName("hmDashDistances"),this.node=this.storage.element(_),this.key=null}inputs(){const e=this.mark,o=e.fields?.get("start"),n=e.fields?.get("end");if(!o?.isBufferNode||!n?.isBufferNode||!o.bufferNodeSource||!n.bufferNodeSource)return null;const s=e.surface?64:1,a=Math.floor((e.count??0)/s),i=e.endpointOffsetActive?e.fields.get(E):null;return{start:o,end:n,offsets:i?.isBufferNode?i:null,repeats:s,rows:a}}prepare(e,o,n){const s=this.mark,a=s.renderer,i=a?.backend?.device,r=this.inputs();if(!i||!r||!r.rows)return;const d=new ArrayBuffer(B),g=new Float32Array(d),m=new Uint32Array(d),c=R,y=a.getPixelRatio?.()??1,O=e.projectionMatrix.clone().multiply(e.matrixWorldInverse);g.set(O.elements,c.matrix/4),g.set([o,n,y,0],c.viewport/4);const U=r.start.bufferNodeSource.itemSize;m.set([r.rows,U,r.repeats,r.offsets?1:0],c.source/4);let v;try{const t=l=>j(l,e,o/y,n/y);v=s.positionSpace==="world"?A(s.options)?[{kind:"matrix",elements:Array.from(t(A(s.options)).elements)}]:[]:F(s.options,{matrixFor:t}),T(v,m,g,{count:c.operationCount/4,kinds:c.operationKinds/4,data:c.operationData/4})}catch{return}const z=[r.start,r.end,r.offsets].map(t=>t?[t.version,t.animationVersion??0]:null),b=JSON.stringify([Array.from(m),z]),f=[r.start.bufferNodeSource,r.end.bufferNodeSource,r.offsets?.bufferNodeSource];if(b===this.key&&f.every((t,l)=>t===this.sources?.[l]))return;for(const t of f)if(t&&!a.backend.has(t))return;const w=r.rows*r.repeats;if(w>this.capacity){const t=this.buffer;this.capacity=2**Math.ceil(Math.log2(w)),this.buffer=new x(new Float32Array(this.capacity*2),2),this.storage.value=this.buffer,this.storage.bufferCount=this.capacity,s.material.needsUpdate=!0,S(a,t)}a.backend.has(this.buffer)||a.backend.createStorageAttribute(this.buffer),(!this.lengths||this.lengths.size<r.rows*4)&&(this.lengths?.destroy(),this.lengths=i.createBuffer({size:2**Math.ceil(Math.log2(Math.max(16,r.rows*4))),usage:GPUBufferUsage.STORAGE})),this.params??=i.createBuffer({size:B,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.empty??=i.createBuffer({size:16,usage:GPUBufferUsage.STORAGE}),i.queue.writeBuffer(this.params,0,d);const{layout:D,pipeline:M}=L(i),G=[a.backend.get(f[0]).buffer,a.backend.get(f[1]).buffer,f[2]?a.backend.get(f[2]).buffer:this.empty,a.backend.get(this.buffer).buffer,this.lengths,this.params],k=i.createCommandEncoder(),h=k.beginComputePass();h.setPipeline(M),h.setBindGroup(0,i.createBindGroup({layout:D,entries:G.map((t,l)=>({binding:l,resource:{buffer:t}}))})),h.dispatchWorkgroups(1),h.end(),i.queue.submit([k.finish()]),this.key=b,this.sources=f}dispose(){S(this.mark.renderer,this.buffer),this.lengths?.destroy(),this.params?.destroy(),this.empty?.destroy()}}export{W as D};
