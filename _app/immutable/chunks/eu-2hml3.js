import{eB as me,eC as V,eD as v,eE as F,eF as Q,eG as he,eH as X,eI as ue,eJ as ge,eK as Z,eL as R,eM as te,eN as N,eO as q,eP as _e,eQ as O,eR as J,eS as xe,eT as be,eU as $e}from"./tOd4CyYd.js";const we=`
fn threefry2x32(key: vec2<u32>, ctr: vec2<u32>) -> vec2<u32> {
  let ks0: u32 = key.x;
  let ks1: u32 = key.y;
  let ks2: u32 = ks0 ^ ks1 ^ 0x1BD11BDAu;

  var x0: u32 = ctr.x + ks0;
  var x1: u32 = ctr.y + ks1;

  x0 += x1; x1 = (x1 << 13u) | (x1 >> 19u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 15u) | (x1 >> 17u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 26u) | (x1 >> 6u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 6u) | (x1 >> 26u); x1 ^= x0;
  x0 += ks1;
  x1 += ks2 + 1u;

  x0 += x1; x1 = (x1 << 17u) | (x1 >> 15u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 29u) | (x1 >> 3u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 16u) | (x1 >> 16u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 24u) | (x1 >> 8u); x1 ^= x0;
  x0 += ks2;
  x1 += ks0 + 2u;

  x0 += x1; x1 = (x1 << 13u) | (x1 >> 19u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 15u) | (x1 >> 17u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 26u) | (x1 >> 6u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 6u) | (x1 >> 26u); x1 ^= x0;
  x0 += ks0;
  x1 += ks1 + 3u;

  x0 += x1; x1 = (x1 << 17u) | (x1 >> 15u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 29u) | (x1 >> 3u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 16u) | (x1 >> 16u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 24u) | (x1 >> 8u); x1 ^= x0;
  x0 += ks1;
  x1 += ks2 + 4u;

  x0 += x1; x1 = (x1 << 13u) | (x1 >> 19u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 15u) | (x1 >> 17u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 26u) | (x1 >> 6u); x1 ^= x0;
  x0 += x1; x1 = (x1 << 6u) | (x1 >> 26u); x1 ^= x0;
  x0 += ks2;
  x1 += ks0 + 5u;

  return vec2<u32>(x0, x1);
}`,ve=`
const _erf_p: f32 = 0.3275911;
const _erf_a1: f32 = 0.254829592;
const _erf_a2: f32 = -0.284496736;
const _erf_a3: f32 = 1.421413741;
const _erf_a4: f32 = -1.453152027;
const _erf_a5: f32 = 1.061405429;
fn erf(x: f32) -> f32 {
  let t = 1.0 / (1.0 + _erf_p * abs(x));
  let P_t = fma(fma(fma(fma(_erf_a5, t, _erf_a4), t, _erf_a3), t, _erf_a2), t, _erf_a1) * t;
  return sign(x) * (1.0 - P_t * exp(-x * x));
}
fn erfc(x: f32) -> f32 {
  let t = 1.0 / (1.0 + _erf_p * abs(x));
  let P_t = fma(fma(fma(fma(_erf_a5, t, _erf_a4), t, _erf_a3), t, _erf_a2), t, _erf_a1) * t;
  let E = P_t * exp(-x * x);
  return select(2.0 - E, E, x >= 0.0);
}`,z=String.raw`
fn nan() -> f32 { let bits = 0xffffffffu; return bitcast<f32>(bits); }
fn inf() -> f32 { let bits = 0x7f800000u; return bitcast<f32>(bits); }
`.trim();var ye=class{pushIndent=Symbol("pushIndent");popIndent=Symbol("popIndent");lines=[];#e="";emit(...t){for(const e of t)e===this.pushIndent?this.#e+="  ":e===this.popIndent?this.#e=this.#e.slice(0,-2):this.lines.push(e?this.#e+e:"")}emitPreamble(t,e){let r=!1,s=new Map;for(const a of e)a!=null&&(r||=a.some(i=>i.dtype==="float16"),s=ge(s,a.distinctOps()));if(r){if(!t.features.has("shader-f16"))throw new Error("WebGPU device does not support shader-f16 feature");this.emit("enable f16;")}this.emit(z),s.has("Threefry2x32")&&this.emit(we),(s.has("Erf")||s.has("Erfc"))&&this.emit(ve),this.emit("")}emitPhonyAssignments(t){t.length>0&&this.emit(t.map(e=>`_ = &${e};`).join(" "))}toString(){return this.lines.join(`
`)}};function S(t,e=!1){switch(t){case"bool":return e?"i32":"bool";case"int32":return"i32";case"uint32":return"u32";case"float32":return"f32";case"float16":return"f16";default:throw new Error(`Unsupported dtype for WebGPU: ${t}`)}}function le(t){switch(t){case"bool":return"1";case"int32":return"2147483647";case"uint32":return"4294967295u";case"float32":return"inf()";case"float16":return"f16(inf())";default:throw new Error(`Unsupported dtype for WebGPU: ${t}`)}}function K(t,e){if(t==="bool")return e?"true":"false";if(t==="int32")return e.toString();if(t==="uint32")return e.toString()+"u";if(t==="float32")return Number.isNaN(e)?"nan()":Number.isFinite(e)?"f32("+e.toString()+")":e>0?"inf()":"-inf()";if(t==="float16")return Number.isNaN(e)?"f16(nan())":Number.isFinite(e)?"f16("+e.toString()+")":e>0?"f16(inf())":"f16(-inf())";throw new Error(`Unsupported const dtype: ${t}`)}function ke(t,e,r,s){if(t==="Add")return`(${r} + ${s})`;if(t==="Mul")return`(${r} * ${s})`;if(t==="Min")return e==="bool"?`(${r} && ${s})`:`min(${r}, ${s})`;if(t==="Max")return e==="bool"?`(${r} || ${s})`:`max(${r}, ${s})`;throw new Error(`Unsupported reduction op: ${t}`)}var Se=class ce{static maxBytes=4096;entries=[];add(e,r){const s=`u${this.entries.length}`;return this.entries.push({name:s,type:e,value:r}),`uniforms.${s}`}get full(){return(this.entries.length+1)*4>ce.maxBytes}constant(e,r){return r===0||this.full?null:e==="float32"?this.add("f32",r):e==="float16"?`f16(${this.add("f32",r)})`:e==="int32"?this.add("i32",r):e==="uint32"?this.add("u32",r):null}emit(e){this.entries.length!==0&&e.emit("","struct Uniforms {",e.pushIndent,...this.entries.map(r=>`${r.name}: ${r.type},`),e.popIndent,"}","@group(1) @binding(0) var<uniform> uniforms: Uniforms;")}data(){const e=new Uint8Array(this.entries.length*4),r=new DataView(e.buffer);return this.entries.forEach(({type:s,value:a},i)=>{s==="f32"?r.setFloat32(i*4,a,!0):s==="i32"?r.setInt32(i*4,a,!0):r.setUint32(i*4,a,!0)}),e}},je=class{wb;args;uniforms;#e=0;#t=new Map;#r=new Set;#a=new Map;#i=new Map;constructor(t,e,r){this.wb=t,this.args=e,this.uniforms=r}#s(){return`alu${this.#e++}`}#o(t){return t.match(/^alu[0-9]+$/)}countReferences(t){if(this.#t.set(t,(this.#t.get(t)??0)+1),!this.#r.has(t)){this.#r.add(t);for(const e of t.src)this.countReferences(e)}}reset(){this.#t.clear(),this.#r.clear(),this.#a.clear()}run(t){if(this.#a.has(t))return this.#a.get(t);const{op:e,src:r,dtype:s,arg:a}=t;let i="";if(Z.Binary.has(e)||Z.Compare.has(e)){const n=this.run(r[0]),o=(e==="Idiv"||e==="Mod")&&r[1].op==="Const"&&!R(s)?K(r[1].dtype,r[1].arg):this.run(r[1]);if(e==="Add")s==="bool"?i=`(${n} || ${o})`:i=`(${n} + ${o})`;else if(e==="Sub")i=`(${n} - ${o})`;else if(e==="Mul")s==="bool"?i=`(${n} && ${o})`:i=`(${n} * ${o})`;else if(e==="Idiv")i=R(s)?`trunc(${n} / ${o})`:`(${n} / ${o})`;else if(e==="Mod")i=`(${n} % ${o})`;else if(e==="Min")s==="bool"?i=`(${n} && ${o})`:i=`min(${v(n)}, ${v(o)})`;else if(e==="Max")s==="bool"?i=`(${n} || ${o})`:i=`max(${v(n)}, ${v(o)})`;else if(e==="BitCombine")a==="and"?i=`(${n} & ${o})`:a==="or"?i=`(${n} | ${o})`:i=s==="bool"?`(${n} != ${o})`:`(${n} ^ ${o})`;else if(e==="BitShift")a==="shl"?i=`(${n} << ${o})`:i=`(${n} >> ${o})`;else if(e==="Cmplt")i=`(${n} < ${o})`;else if(e==="Cmpne")if(R(r[0].dtype)){const c=this.#o(n)?n:this.#s();c!==n&&this.wb.emit(`let ${c} = ${n};`),i=`(${c} != ${o} || min(${c}, ${S(r[0].dtype)}(inf())) != ${c})`}else i=`(${n} != ${o})`}else if(Z.Unary.has(e))if(e==="Reciprocal"&&r[0].op==="Sqrt")i=`inverseSqrt(${this.run(r[0].src[0])})`;else{const n=this.run(r[0]);if(e==="BitCount")i=`i32(countOneBits(${v(n)}))`;else if(e==="Sin")i=`sin(${v(n)})`;else if(e==="Cos")i=`cos(${v(n)})`;else if(e==="Asin")i=`asin(${v(n)})`;else if(e==="Atan")i=`atan(${v(n)})`;else if(e==="Exp")i=`exp(${v(n)})`;else if(e==="Log")i=`log(${v(n)})`;else if(e==="Erf"||e==="Erfc"){const o=e==="Erf"?"erf":"erfc";s!=="float32"?i=`${S(s)}(${o}(f32(${v(n)})))`:i=`${o}(${v(n)})`}else if(e==="Sqrt")i=`sqrt(${v(n)})`;else if(e==="Reciprocal")i=`(1.0 / ${n})`;else if(e==="Floor")i=`floor(${v(n)})`;else if(e==="Ceil")i=`ceil(${v(n)})`;else if(e==="Cast"){const o=S(r[0].dtype),c=S(s);if(R(r[0].dtype)&&!(R(s)||s==="bool")){const p=le(s),h=this.#o(n)?n:this.#s();h!==n&&this.wb.emit(`let ${h}: ${o} = ${v(n)};`),i=`select(${c}(${h}), ${p}, ${h} >= ${o}(${p}))`}else i=`${c}(${v(n)})`}else e==="Bitcast"&&(i=`bitcast<${S(s)}>(${v(n)})`)}else if(e==="Where")i=`select(${v(this.run(r[2]))}, ${v(this.run(r[1]))}, ${v(this.run(r[0]))})`;else if(e==="Threefry2x32"){const n=this.#s(),[o,c,p,h]=r.map(b=>v(this.run(b)));if(this.wb.emit(`let ${n} = threefry2x32(vec2(${o}, ${c}), vec2(${p}, ${h}));`),a==="xor")i=`(${n}.x ^ ${n}.y)`;else if(a===0)i=`${n}.x`;else if(a===1)i=`${n}.y`;else throw new te(e,s,"webgpu",a)}else if(e==="Const"){if(!this.uniforms)return K(s,a);let n=this.#i.get(t);return n===void 0&&(n=this.uniforms.constant(s,a)??K(s,a),this.#i.set(t,n)),n}else{if(e==="Special")return a[0];if(e==="Variable")return a;e==="GlobalIndex"&&(i=`${this.args[a[0]]}[${v(this.run(r[0]))}]`,s==="bool"&&(i=`(${i} != 0)`))}if(!i)throw new te(e,s,"webgpu",a);const u=S(s);if((this.#t.get(t)??0)>1){const n=this.#s();return this.#a.set(t,n),this.wb.emit(`let ${n}: ${u} = ${v(i)};`),n}else return this.#a.set(t,i),i}};const U=16384;function B(t){let e=t,r=1;return t>65535&&(e=U,r=Math.ceil(t/U)),[e,r]}const Ue=1,Be=20,Ee=5,Me=1e3,Pe=typeof navigator<"u"&&navigator.userAgent.includes("Firefox")&&!navigator.userAgent.includes("Seamonkey");let Ce;const re=[];function ie(){const t=(Ce??=(()=>{const e=new MessageChannel;return e.port1.onmessage=()=>re.shift()?.(),e.port1.start(),e})()).port2;return new Promise(e=>{re.push(e),t.postMessage(0)})}async function qe(t,e){const r=e.mapAsync(GPUMapMode.READ);if(!Pe)return r;let s=!1;const a=r.finally(()=>{s=!0});await ie();const i=performance.now();let u=-1/0;for(;!s;){const n=performance.now()-i;if(n>=Me)break;performance.now()-u>=Ue&&(u=performance.now(),t.queue.submit([t.createCommandEncoder().finish()])),n<Be?await ie():await new Promise(o=>setTimeout(o,Ee))}return a}var Ie=class M{device;static alphaModes=["opaque","premultiplied"];static width=256;static height=256;initialized=!1;deviceStorage;deviceContexts;hostStorage;hostContext;constructor(e){this.device=e}#e(){if(typeof OffscreenCanvas>"u")throw new Error("OffscreenCanvas is not available in this environment, so you cannot read data from WebGPU synchronously. Consider using the async API.");const e=()=>new OffscreenCanvas(M.width,M.height);this.deviceStorage=M.alphaModes.map(e),this.deviceContexts=this.deviceStorage.map((r,s)=>{const a=r.getContext("webgpu");return a.configure({device:this.device,format:"bgra8unorm",usage:GPUTextureUsage.COPY_DST,alphaMode:M.alphaModes[s]}),a}),this.hostStorage=e(),this.hostContext=this.hostStorage.getContext("2d",{willReadFrequently:!0}),this.initialized=!0}read(e,r,s){this.initialized||this.#e();const a=this.deviceStorage,i=this.deviceContexts,u=this.hostContext,n=Math.ceil(s/4),o=M.width*4,c=new ArrayBuffer(n*4);for(let p=0;p<i.length;p++){const h=i[p].getCurrentTexture(),b=(m,w,y)=>{const P=this.device.createCommandEncoder();P.copyBufferToTexture({buffer:e,bytesPerRow:o,offset:y+r},{texture:h},{width:m,height:w,depthOrArrayLayers:1});const G=P.finish();this.device.queue.submit([G]),u.clearRect(0,0,m,w),u.drawImage(a[p],0,0);const E=u.getImageData(0,0,m,w).data,I=new Uint8ClampedArray(c,y,4*m*w),T=M.alphaModes[p];for(let j=0;j<I.length;j+=4)T==="premultiplied"?I[j+3]=E[j+3]:(I[j]=E[j+2],I[j+1]=E[j+1],I[j+2]=E[j])},$=M.width*M.height,g=Math.floor(n/$);let d=n%$;const x=Math.floor(d/M.width);d=d%M.width;let f=0;for(let m=0;m<g;m++)b(M.width,M.height,f),f+=$*4;x>0&&(b(M.width,x,f),f+=x*M.width*4),d>0&&b(d,1,f)}return new Uint8Array(c,0,s)}};function Ae(t,e,r){const s=new Uint32Array(5);return s[0]=t.kind==="sort"?0:1,s[1]=t.mergeStep??0,s[2]=t.mergeStage??0,s[3]=e,s[4]=Math.log2(r),new Uint8Array(s.buffer)}function fe(t,e,r,s,a){const i=S(e,!0),u=1<<Math.ceil(Math.log2(r||1)),n=Math.ceil(u/2),o=O(n,t.limits.maxComputeWorkgroupSizeX),c=n/o,p=Math.log2(u),h=Math.min(p,Math.log2(o*2)),b=Math.max(h-1,0),$=e==="float16",g=R(e)?`${i}(nan())`:le(e),d=`
${$?"enable f16;":""}
${z}

struct Uniforms {
  kind: u32, // 0 = sort, 1 = merge
  merge_step: u32, // half_block = 2^step
  merge_stage: u32, // only used for merge
  n: u32, // length of each sorted array
  workgroups_per_batch_log2: u32,
}

@group(0) @binding(0) var<storage, read> input: array<${i}>;
@group(0) @binding(1) var<storage, read_write> output: array<${i}>;
${a?"@group(0) @binding(2) var<storage, read_write> output_idx: array<i32>;":""}

@group(1) @binding(0) var<uniform> uniforms: Uniforms;

var<workgroup> shared_vals: array<${i}, ${o*2}>;
${a?`var<workgroup> shared_idx: array<i32, ${o*2}>;`:""}

fn compare(a: ${i}, b: ${i}) -> bool {
${R(e)?`
  let min_value = min(a, b);
  return a == min_value && b != min_value;`:"  return a < b;"}
}

fn compare_and_swap(i: u32, j: u32) {
  let val_i = shared_vals[i];
  let val_j = shared_vals[j];
${a?`
  if (
    compare(val_j, val_i) ||
    (!compare(val_i, val_j) && shared_idx[j] < shared_idx[i])
  ) {
    shared_vals[i] = val_j;
    shared_vals[j] = val_i;
    let tmp_idx = shared_idx[i];
    shared_idx[i] = shared_idx[j];
    shared_idx[j] = tmp_idx;
  }`:`
  if (compare(val_j, val_i)) {
    shared_vals[i] = val_j;
    shared_vals[j] = val_i;
  }`}
}

@compute @workgroup_size(${o})
fn main(
  @builtin(workgroup_id) wg_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
) {
  let blockid = wg_id.x + wg_id.y * ${U}u;
  let n = uniforms.n;
  // Shifts, not a division by a uniform, in every thread of every pass.
  let batch = blockid >> uniforms.workgroups_per_batch_log2;
  let wg_in_batch = blockid & ((1u << uniforms.workgroups_per_batch_log2) - 1u);

  let tid = local_id.x;
  let base = batch * n;

  if (uniforms.kind == 0u || (uniforms.kind == 1u && uniforms.merge_step == ${b}u)) {
    let wg_base = wg_in_batch * ${o*2}u;

    // Load data into shared memory (2 elements per thread)
    let idx0 = tid * 2u;
    let idx1 = tid * 2u + 1u;
    // Load from input for initial 'sort' pass, then from output (read-write) for 'merge' passes.
    if (uniforms.kind == 0u) {
      shared_vals[idx0] = select(${g}, input[base + wg_base + idx0], wg_base + idx0 < n);
      shared_vals[idx1] = select(${g}, input[base + wg_base + idx1], wg_base + idx1 < n);
${a?`
      shared_idx[idx0] = i32(wg_base + idx0);
      shared_idx[idx1] = i32(wg_base + idx1);`:""}
    } else {
      shared_vals[idx0] = select(${g}, output[base + wg_base + idx0], wg_base + idx0 < n);
      shared_vals[idx1] = select(${g}, output[base + wg_base + idx1], wg_base + idx1 < n);
${a?`
      shared_idx[idx0] = select(i32(n), output_idx[base + wg_base + idx0], wg_base + idx0 < n);
      shared_idx[idx1] = select(i32(n), output_idx[base + wg_base + idx1], wg_base + idx1 < n);`:""}
    }
    workgroupBarrier();

    let initial_stage = select(0u, ${b}u, uniforms.kind != 0u);
    for (var stage = initial_stage; stage < ${h}u; stage++) {
      for (var step1 = stage + 1u; step1 > 0u; step1--) {
        let step = step1 - 1u;
        let half_block = 1u << step;
        let is_first_step = uniforms.kind == 0u && step == stage;

        let block_offset = (tid / half_block) * half_block;
        let local_offset = tid % half_block;
        let i = block_offset * 2u + local_offset;
        let j = select(i + half_block, i ^ (half_block * 2u - 1u), is_first_step);
        compare_and_swap(i, j);

        workgroupBarrier();
      }
    }

    if (wg_base + idx0 < n) {
      output[base + wg_base + idx0] = shared_vals[idx0];
      ${a?"output_idx[base + wg_base + idx0] = shared_idx[idx0];":""}
    }
    if (wg_base + idx1 < n) {
      output[base + wg_base + idx1] = shared_vals[idx1];
      ${a?"output_idx[base + wg_base + idx1] = shared_idx[idx1];":""}
    }
  } else {
    // Execute single merge pass for a step >= numLocalStages.
    let half_block = 1u << uniforms.merge_step;  // half_block >= workgroupSize * 2
    let thread_in_batch = wg_in_batch * ${o} + tid;
    let is_first_step = uniforms.merge_step == uniforms.merge_stage;

    let block_offset = (thread_in_batch / half_block) * half_block;
    let local_offset = thread_in_batch % half_block;
    let i = block_offset * 2u + local_offset;
    let j = select(i + half_block, i ^ (half_block * 2u - 1u), is_first_step);

    // Global version of compare_and_swap()
    if (j < n) {
      let val_i = output[base + i];
      let val_j = output[base + j];
${a?`
      let idx_i = output_idx[base + i];
      let idx_j = output_idx[base + j];
      if (compare(val_j, val_i) || (!compare(val_i, val_j) && idx_j < idx_i)) {
        output[base + i] = val_j;
        output[base + j] = val_i;
        output_idx[base + i] = idx_j;
        output_idx[base + j] = idx_i;`:`
      if (compare(val_j, val_i)) {
        output[base + i] = val_j;
        output[base + j] = val_i;`}
      }
    }
  }
}
`.trim(),x=B(s*c),f=[{kind:"sort"}];for(let m=h;m<p;m++)for(let w=m;w>=h-1;w--)f.push({kind:"merge",mergeStep:w,mergeStage:m});return[{code:d,numInputs:1,numOutputs:a?2:1,hasUniform:!0,passes:f.map(m=>({grid:x,uniform:Ae(m,r,c)}))}]}function ze(t,e){const r=e.inputDtypes[0],s=e.inputShapes[0],a=s[s.length-1];return fe(t,r,a,q(s.slice(0,-1)),!1)}function Ge(t,e){const r=e.inputDtypes[0],s=e.inputShapes[0],a=s[s.length-1];return fe(t,r,a,q(s.slice(0,-1)),!0)}function de(t,e,r){if(e.shape[r]<=1)return"0u";const s=e.strides[r];return`(${s===1?t:`(${t} / ${s}u)`} % ${e.shape[r]}u)`}function Le(t,e,r,s,a){const i=s+a-r.ndim,u=[];for(let n=0;n<r.ndim;n++){const o=r.strides[n];if(o===0)continue;const c=de(t,e,i+n);u.push(o===1?c:`(${c} * ${o}u)`)}return u.length===0?"0u":u.join(" + ")}function Oe(t){switch(t){case"float32":return{statement:"atomic_add_f32(&output[output_index], updates[global]);",helpers:`
fn atomic_add_f32(address: ptr<storage, atomic<u32>, read_write>, value: f32) {
  var old_bits = atomicLoad(address);
  loop {
    let new_bits = bitcast<u32>(bitcast<f32>(old_bits) + value);
    let result = atomicCompareExchangeWeak(address, old_bits, new_bits);
    if (result.exchanged) {
      break;
    }
    old_bits = result.old_value;
  }
}`};case"float16":return{statement:`
  atomic_add_f16(
    &output[output_index / 2u],
    output_index % 2u != 0u,
    updates[global],
  );`.trim(),helpers:`
fn atomic_add_f16(
  address: ptr<storage, atomic<u32>, read_write>,
  high: bool,
  value: f16,
) {
  var old_bits = atomicLoad(address);
  loop {
    var pair = unpack2x16float(old_bits);
    if (high) {
      pair.y += f32(value);
    } else {
      pair.x += f32(value);
    }
    let new_bits = pack2x16float(pair);
    let result = atomicCompareExchangeWeak(address, old_bits, new_bits);
    if (result.exchanged) {
      break;
    }
    old_bits = result.old_value;
  }
}`};case"uint32":case"int32":return{statement:"atomicAdd(&output[output_index], updates[global]);",helpers:""};case"bool":return{statement:"atomicOr(&output[output_index], updates[global]);",helpers:""};default:throw new Error(`Unsupported atomic Scatter dtype for WebGPU: ${t}`)}}function Te(t,e,{kind:r,radius:s,grid:a}){const[i,u]=e.inputShapes[0],n=2*s+1,o=N(u),c=O(Math.min(Math.max(i,1),64),64),p=o.map(f=>`    let c${f} = i32(query_cell[i * ${u}u + ${f}u]) + i32((o / ${n**f}u) % ${n}u) - ${s};`).join(`
`),h=o.map(f=>`c${f} < 0 || c${f} >= ${a}`).join(" || "),b=o.map(f=>`c${f} * ${a**f}`).join(" + "),$=o.map(f=>`      var x${f} = position[i * ${u}u + ${f}u] - sorted_position[k * ${u}u + ${f}u];`).join(`
`),g=o.map(f=>`x${f} * x${f}`).join(" + "),d=o.map(f=>`        x${f} = sin(pair * 0.731 + ${(f*1.239).toFixed(3)}) * s * 0.001;`).join(`
`);let x;return r==="collide"?x=`
      let ri = query_value[i];
      let rj = sorted_value[k];
      let r = ri + rj;
      if (!(d2 < r * r)) { continue; }
      let l = sqrt(max(d2, 1e-12));
      let s2 = (r - l) / l * (rj * rj / max(ri * ri + rj * rj, 1e-12));
${o.map(f=>`      acc${f} += x${f} * s2;`).join(`
`)}`:x=`
      ${r==="manyBody"?"if (!(d2 < maximum2)) { continue; }":""}
      let q = sorted_value[k] / ${r==="manyBodyLegacy"?"max(d2, 1e-3)":"select(d2, sqrt(minimum2 * d2), d2 < minimum2)"};
${o.map(f=>`      acc${f} -= x${f} * q;`).join(`
`)}`,[{code:`
${z}

@group(0) @binding(0) var<storage, read> position: array<f32>;
@group(0) @binding(1) var<storage, read> query_cell: array<f32>;
@group(0) @binding(2) var<storage, read> query_value: array<f32>;
@group(0) @binding(3) var<storage, read> sorted_position: array<f32>;
@group(0) @binding(4) var<storage, read> sorted_value: array<f32>;
@group(0) @binding(5) var<storage, read> sorted_index: array<i32>;
@group(0) @binding(6) var<storage, read> cell_start: array<i32>;
@group(0) @binding(7) var<storage, read> cell_end: array<i32>;
@group(0) @binding(8) var<storage, read> scalars: array<f32>;
@group(0) @binding(9) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(${c})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let i = global_id.x + global_id.y * ${U*c}u;
  if (i >= ${i}u) {
    return;
  }
  let minimum2 = scalars[0];
  let maximum2 = scalars[1];
${o.map(f=>`  var acc${f} = 0.0;`).join(`
`)}
  for (var o = 0u; o < ${n**u}u; o++) {
${p}
    if (${h}) { continue; }
    let cell = ${b};
    let first = u32(cell_start[cell]);
    let last = u32(cell_end[cell]);
    for (var k = first; k < last; k++) {
      let j = sorted_index[k];
      if (j == i32(i)) { continue; }
${$}
      var d2 = ${g};
      if (d2 < 1e-12) {
        let s = sign(f32(i32(i) - j));
        let pair = f32(i32(i) + j);
${d}
        d2 = ${g};
      }
${x}
    }
  }
${o.map(f=>`  output[i * ${u}u + ${f}u] = acc${f};`).join(`
`)}
}
`.trim(),numInputs:9,numOutputs:1,hasUniform:!1,passes:[{grid:B(Math.ceil(Math.max(i,1)/c))}]}]}function Re(t,e){const r=e==="min";if(t==="int32"||t==="uint32"||t==="bool")return{statement:`atomic${r?"Min":"Max"}(&output[output_index], updates[global]);`,helpers:""};if(t!=="float32"&&t!=="float16")throw new Error(`Unsupported atomic Scatter dtype for WebGPU: ${t}`);const s=`
fn extremum_bits(a: u32, b: u32) -> u32 {
  if ((a & 0x7fffffffu) > 0x7f800000u || (b & 0x7fffffffu) > 0x7f800000u) {
    return 0x7fc00000u;
  }
  if ((a & 0x7fffffffu) == 0u && (b & 0x7fffffffu) == 0u) {
    return a ${r?"|":"&"} b;
  }
  return select(a, b, bitcast<f32>(b) ${r?"<":">"} bitcast<f32>(a));
}`,a=t==="float16";return{statement:a?"atomic_extremum(&output[output_index / 2u], output_index % 2u != 0u, f32(updates[global]));":"atomic_extremum(&output[output_index], updates[global]);",helpers:s+`
fn atomic_extremum(address: ptr<storage, atomic<u32>, read_write>, ${a?"high: bool, ":""}value: f32) {
  var old_bits = atomicLoad(address);
  loop {
    ${a?`var pair = unpack2x16float(old_bits);
    if (high) { pair.y = bitcast<f32>(extremum_bits(bitcast<u32>(pair.y), bitcast<u32>(value))); }
    else { pair.x = bitcast<f32>(extremum_bits(bitcast<u32>(pair.x), bitcast<u32>(value))); }
    let new_bits = pack2x16float(pair);`:"let new_bits = extremum_bits(old_bits, bitcast<u32>(value));"}
    let result = atomicCompareExchangeWeak(address, old_bits, new_bits);
    if (result.exchanged) { break; }
    old_bits = result.old_value;
  }
}`}}function We(t,e,{op:r,shape:s,axis:a,outDim:i,uniqueIndices:u}){const n=e.inputDtypes[0],o=J.create(e.inputShapes[0]),c=e.inputShapes.slice(1).map(k=>J.create(k)),p=Math.max(...c.map(k=>k.ndim)),h=o.size,b=S(n,!0),$=n==="float16";if($&&!t.features.has("shader-f16"))throw new Error("WebGPU device does not support shader-f16 feature");const g=[...N(i),...N(i+p,o.ndim)],d=c.map((k,C)=>`  let scatter_index_${C} = i32(index_${C}[${Le("global",o,k,i,p)}]);`),x=a.map((k,C)=>`scatter_index_${C} < 0 || scatter_index_${C} >= ${s[k]}`),f=J.create(s);let m=0;const w=N(s.length).map(k=>{const C=a.indexOf(k);let Y;return C===-1?Y=de("global",o,g[m++]):Y=`u32(scatter_index_${C})`,f.strides[k]===1?Y:`(${Y} * ${f.strides[k]}u)`}).join(" + "),y=r==="min"||r==="max",P=r==="min",G=y||r==="add"&&!u,E=Math.ceil(q(s)/(n==="float16"?2:1)),I=n==="float32"?P?"0x7f800000u":"0xff800000u":n==="float16"?P?"0x7c007c00u":"0xfc00fc00u":n==="int32"?P?"2147483647i":"(-2147483647i - 1i)":n==="bool"?P?"1i":"0i":P?"0xffffffffu":"0u",T=G?`atomic<${n==="int32"||n==="bool"?"i32":"u32"}>`:b,j=y?Re(n,r):G?Oe(n):{statement:"output[output_index] = updates[global];",helpers:""},l=t.limits.maxComputeWorkgroupSizeX,_=O(Math.min(Math.max(h,1),l),l);return[{code:`
${$?"enable f16;":""}
${z}
${y?"@group(1) @binding(0) var<uniform> phase: u32;":""}
${j.helpers}

@group(0) @binding(0) var<storage, read> updates: array<${b}>;
${c.map((k,C)=>`@group(0) @binding(${C+1}) var<storage, read> index_${C}: array<${S(e.inputDtypes[C+1],!0)}>;`).join(`
`)}
@group(0) @binding(${e.inputShapes.length}) var<storage, read_write> output: array<${T}>;

@compute @workgroup_size(${_})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let global = global_id.x + global_id.y * ${U*_}u;
  ${y?`if (phase == 0u) {
    if (global < ${E}u) { atomicStore(&output[global], ${I}); }
    return;
  }`:""}
  if (global >= ${h}u) {
    return;
  }
${d.join(`
`)}
  if (${x.join(" || ")}) {
    return;
  }
  let output_index = ${w};
  ${j.statement}
}
`.trim(),numInputs:e.inputShapes.length,numOutputs:1,hasUniform:y,clearOutputs:!y,passes:y?[{grid:B(Math.ceil(E/_)),uniform:new Uint8Array(new Uint32Array([0]).buffer)},{grid:B(Math.ceil(h/_)),uniform:new Uint8Array(new Uint32Array([1]).buffer)}]:[{grid:B(Math.ceil(h/_))}]}]}function Fe(t,e,r){const s=e.inputDtypes[0],a=e.inputShapes[0],i=e.inputShapes[1],u=a[a.length-1],n=i[i.length-2],o=q(a.slice(0,-2)),c=s==="float16",p=S(s,!0),h=O(u,t.limits.maxComputeWorkgroupSizeX);return[{code:`
${c?"enable f16;":""}
${z}

@group(0) @binding(0) var<storage, read> a: array<${p}>;
@group(0) @binding(1) var<storage, read> b: array<${p}>;
@group(0) @binding(2) var<storage, read_write> x: array<${p}>;

// Shared memory for the current pivot value x[j]
var<workgroup> x_j: ${p};

@compute @workgroup_size(${h})
fn main(
  @builtin(workgroup_id) wg_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
) {
  let wg_idx = wg_id.x + wg_id.y * ${U}u;
  let mat_idx = wg_idx / ${n}u;
  let rhs_idx = wg_idx % ${n}u;

  if (mat_idx >= ${o}u) {
    return;
  }

  let a_base = mat_idx * ${u*u}u;
  let bx_base = (mat_idx * ${n}u + rhs_idx) * ${u}u;
  let tid = local_id.x;

  // Step 1: Copy b to x (threads collaborate)
  for (var idx = tid; idx < ${u}u; idx += ${h}u) {
    x[bx_base + idx] = b[bx_base + idx];
  }
  storageBarrier();

  // Step 2: Back-substitution from j = n-1 down to 0
  for (var jj = 0u; jj < ${u}u; jj++) {
    let j = ${u-1}u - jj;

    // Thread 0 computes x[j] = x[j] / a[j,j]
    if (tid == 0u) {
      ${r.unitDiagonal?"x_j = x[bx_base + j];":`x_j = x[bx_base + j] / a[a_base + j * ${u}u + j];`}
      x[bx_base + j] = x_j;
    }
    workgroupBarrier();  // Sync shared memory x_j

    // All threads subtract x[j] * a[i,j] from x[i] for i < j
    for (var i = tid; i < j; i += ${h}u) {
      x[bx_base + i] -= x_j * a[a_base + i * ${u}u + j];
    }
    workgroupBarrier();
    storageBarrier();
  }
}
`.trim(),numInputs:2,numOutputs:1,hasUniform:!1,passes:[{grid:B(o*n)}]}]}const A={Unblocked:0,InitBlocked:1,FactorBlock:2,SolvePanel:3,UpdateTrailing:4},De=16,Ne=256,L=16;function D(t,e,r,s){const a=new Uint32Array(4);return a[0]=t,a[1]=e,a[2]=r,a[3]=s,new Uint8Array(a.buffer)}function Ye(t,e){const r=e.inputDtypes[0],s=e.inputShapes[0],a=s[s.length-1],i=q(s.slice(0,-2)),u=r==="float16",n=S(r,!0),o=Math.min(256,O(0,t.limits.maxComputeWorkgroupSizeX)),c=a>=Ne,p=c?De:a,h=`
${u?"enable f16;":""}
${z}

@group(0) @binding(0) var<storage, read> input: array<${n}>;
@group(0) @binding(1) var<storage, read_write> output: array<${n}>;

struct CholeskyParams {
  phase: u32,
  k: u32,
  block_size: u32,
  rows_below: u32,
}

@group(1) @binding(0) var<uniform> params: CholeskyParams;

// Shared memory for the diagonal element
var<workgroup> L_jj: ${n};

fn mat_idx(base: u32, row: u32, col: u32) -> u32 {
  return base + row * ${a}u + col;
}

@compute @workgroup_size(${o})
fn main(
  @builtin(workgroup_id) wg_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(global_invocation_id) global_id: vec3<u32>,
) {
  let tid = local_id.x;

  if (params.phase == ${A.Unblocked}u) {
    let batch = wg_id.x + wg_id.y * ${U}u;
    if (batch >= ${i}u) {
      return;
    }

    let base = batch * ${a*a}u;

    // Zero out output and copy lower triangle from input.
    for (var idx = tid; idx < ${a*a}u; idx += ${o}u) {
      let row = idx / ${a}u;
      let col = idx % ${a}u;
      output[base + idx] = select(0, input[base + idx], col <= row);
    }
    storageBarrier();

    // Cholesky-Crout algorithm: process column by column.
    for (var j = 0u; j < ${a}u; j++) {
      for (var i = j + tid; i < ${a}u; i += ${o}u) {
        var sum = output[mat_idx(base, i, j)];
        for (var k = 0u; k < j; k++) {
          sum -= output[mat_idx(base, i, k)] * output[mat_idx(base, j, k)];
        }
        output[mat_idx(base, i, j)] = sum;
      }
      storageBarrier();

      if (tid == 0u) {
        L_jj = sqrt(output[mat_idx(base, j, j)]);
        output[mat_idx(base, j, j)] = L_jj;
      }
      workgroupBarrier();

      for (var i = j + 1u + tid; i < ${a}u; i += ${o}u) {
        output[mat_idx(base, i, j)] /= L_jj;
      }
      storageBarrier();
    }
    return;
  }

  if (params.phase == ${A.InitBlocked}u) {
    let batch = wg_id.x + wg_id.y * ${U}u;
    if (batch >= ${i}u) {
      return;
    }

    let base = batch * ${a*a}u;

    for (var idx = tid; idx < ${a*a}u; idx += ${o}u) {
      let row = idx / ${a}u;
      let col = idx % ${a}u;
      output[base + idx] = select(0, input[base + idx], col <= row);
    }
    return;
  }

  if (params.phase == ${A.FactorBlock}u) {
    let batch = wg_id.x + wg_id.y * ${U}u;
    if (batch >= ${i}u) {
      return;
    }

    let base = batch * ${a*a}u;
    let k0 = params.k;
    let b = params.block_size;

    for (var j = 0u; j < b; j++) {
      let col = k0 + j;
      for (var i = j + tid; i < b; i += ${o}u) {
        let row = k0 + i;
        var sum = output[mat_idx(base, row, col)];
        for (var r = 0u; r < j; r++) {
          sum -= output[mat_idx(base, row, k0 + r)] *
            output[mat_idx(base, col, k0 + r)];
        }
        output[mat_idx(base, row, col)] = sum;
      }
      storageBarrier();

      if (tid == 0u) {
        L_jj = sqrt(output[mat_idx(base, col, col)]);
        output[mat_idx(base, col, col)] = L_jj;
      }
      workgroupBarrier();

      for (var i = j + 1u + tid; i < b; i += ${o}u) {
        output[mat_idx(base, k0 + i, col)] /= L_jj;
      }
      storageBarrier();
    }
    return;
  }

  if (params.phase == ${A.SolvePanel}u) {
    let rows = params.rows_below;
    if (rows == 0u) {
      return;
    }

    let global = global_id.x + global_id.y * ${U*o}u;
    if (global >= rows * ${i}u) {
      return;
    }

    let batch = global / rows;
    let row = params.k + params.block_size + (global % rows);
    let base = batch * ${a*a}u;

    for (var j = 0u; j < params.block_size; j++) {
      let col = params.k + j;
      var sum = output[mat_idx(base, row, col)];
      for (var r = 0u; r < j; r++) {
        sum -= output[mat_idx(base, row, params.k + r)] *
          output[mat_idx(base, col, params.k + r)];
      }
      output[mat_idx(base, row, col)] =
        sum / output[mat_idx(base, col, col)];
    }
    return;
  }

  if (params.phase == ${A.UpdateTrailing}u) {
    let rows = params.rows_below;
    if (rows == 0u) {
      return;
    }

    let tile_count = (rows + ${L-1}u) / ${L}u;
    let tiles_per_batch = tile_count * (tile_count + 1u) / 2u;
    let wg_global = wg_id.x + wg_id.y * ${U}u;
    if (wg_global >= tiles_per_batch * ${i}u) {
      return;
    }

    let batch = wg_global / tiles_per_batch;
    let tile = wg_global % tiles_per_batch;
    var tile_row = u32((sqrt(f32(8u * tile + 1u)) - 1.0) * 0.5);
    // Correct for GPU sqrt rounding around exact triangular-number boundaries.
    var row_start = tile_row * (tile_row + 1u) / 2u;
    if (row_start > tile) {
      tile_row -= 1u;
      row_start = tile_row * (tile_row + 1u) / 2u;
    }
    let next_row_start = (tile_row + 1u) * (tile_row + 2u) / 2u;
    if (tile >= next_row_start) {
      tile_row += 1u;
      row_start = next_row_start;
    }
    let tile_col = tile - row_start;
    let local_row = tid / ${L}u;
    let local_col = tid % ${L}u;
    let row_local = tile_row * ${L}u + local_row;
    let col_local = tile_col * ${L}u + local_col;
    if (row_local >= rows || col_local >= rows) {
      return;
    }
    if (row_local < col_local) {
      return;
    }

    let row = params.k + params.block_size + row_local;
    let col = params.k + params.block_size + col_local;
    let base = batch * ${a*a}u;
    var sum = output[mat_idx(base, row, col)];
    for (var r = 0u; r < params.block_size; r++) {
      sum -= output[mat_idx(base, row, params.k + r)] *
        output[mat_idx(base, col, params.k + r)];
    }
    output[mat_idx(base, row, col)] = sum;
  }
}
`.trim(),b=[];if(!c)b.push({grid:B(i),uniform:D(A.Unblocked,0,a,0)});else{b.push({grid:B(i),uniform:D(A.InitBlocked,0,p,0)});for(let $=0;$<a;$+=p){const g=Math.min(p,a-$),d=a-$-g;b.push({grid:B(i),uniform:D(A.FactorBlock,$,g,d)}),d>0&&(b.push({grid:B(Math.ceil(d*i/o)),uniform:D(A.SolvePanel,$,g,d)}),b.push({grid:B(Math.ceil(d/L)*(Math.ceil(d/L)+1)*i/2),uniform:D(A.UpdateTrailing,$,g,d)}))}}return[{code:h,numInputs:1,numOutputs:1,hasUniform:!0,passes:b}]}function Xe(t,e){const r=e.inputDtypes[0],s=e.inputShapes[0],a=s[s.length-2],i=s[s.length-1],u=Math.min(a,i),n=q(s.slice(0,-2)),o=r==="float16",c=S(r,!0),p=O(Math.max(a,i),t.limits.maxComputeWorkgroupSizeX);return[{code:`
${o?"enable f16;":""}
${z}

@group(0) @binding(0) var<storage, read> input: array<${c}>;
@group(0) @binding(1) var<storage, read_write> lu: array<${c}>;
@group(0) @binding(2) var<storage, read_write> pivots: array<i32>;
@group(0) @binding(3) var<storage, read_write> perm: array<i32>;

var<workgroup> pivot_row: u32;
var<workgroup> pivot_val: ${c};

@compute @workgroup_size(${p})
fn main(
  @builtin(workgroup_id) wg_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
) {
  let batch = wg_id.x + wg_id.y * ${U}u;
  if (batch >= ${n}u) {
    return;
  }

  let lu_base = batch * ${a*i}u;
  let piv_base = batch * ${u}u;
  let perm_base = batch * ${a}u;
  let tid = local_id.x;

  // Copy input to lu
  for (var idx = tid; idx < ${a*i}u; idx += ${p}u) {
    lu[lu_base + idx] = input[lu_base + idx];
  }
  // Initialize permutation
  for (var idx = tid; idx < ${a}u; idx += ${p}u) {
    perm[perm_base + idx] = i32(idx);
  }
  storageBarrier();

  // LU decomposition with partial pivoting
  for (var j = 0u; j < ${u}u; j++) {
    // Step 1: Thread 0 finds pivot (max abs value in column j, rows >= j)
    if (tid == 0u) {
      var max_val = abs(lu[lu_base + j * ${i}u + j]);
      var max_row = j;
      for (var i = j + 1u; i < ${a}u; i++) {
        let val = abs(lu[lu_base + i * ${i}u + j]);
        if (val > max_val) {
          max_val = val;
          max_row = i;
        }
      }
      pivot_row = max_row;
      pivot_val = lu[lu_base + max_row * ${i}u + j];
      pivots[piv_base + j] = i32(max_row);
    }
    workgroupBarrier();

    // Step 2: Swap rows j and pivot_row (threads collaborate)
    let pr = pivot_row;
    if (pr != j) {
      for (var col = tid; col < ${i}u; col += ${p}u) {
        let tmp = lu[lu_base + j * ${i}u + col];
        lu[lu_base + j * ${i}u + col] = lu[lu_base + pr * ${i}u + col];
        lu[lu_base + pr * ${i}u + col] = tmp;
      }
      if (tid == 0u) {
        let tmp_p = perm[perm_base + j];
        perm[perm_base + j] = perm[perm_base + pr];
        perm[perm_base + pr] = tmp_p;
      }
    }
    storageBarrier();

    // Step 3: Compute L[i][j] and update submatrix
    // Each thread handles one row i > j
    for (var i = j + 1u + tid; i < ${a}u; i += ${p}u) {
      let factor = lu[lu_base + i * ${i}u + j] / pivot_val;
      lu[lu_base + i * ${i}u + j] = factor; // L[i][j]
      for (var k = j + 1u; k < ${i}u; k++) {
        lu[lu_base + i * ${i}u + k] -= factor * lu[lu_base + j * ${i}u + k];
      }
    }
    storageBarrier();
  }
}
`.trim(),numInputs:1,numOutputs:3,hasUniform:!1,passes:[{grid:B(n)}]}]}function Ke(t,e,r){const s=e.inputDtypes[0],a=e.inputShapes[0],i=a[a.length-1],u=q(a.slice(0,-2)),n=s==="float16",o=S(s,!0),c=`${o}(${r.tolerance})`,p=O(Math.max(i,1),t.limits.maxComputeWorkgroupSizeX);return[{code:`
${n?"enable f16;":""}
${z}

@group(0) @binding(0) var<storage, read> input: array<${o}>;
@group(0) @binding(1) var<storage, read_write> diagonalized: array<${o}>;
@group(0) @binding(2) var<storage, read_write> vectors: array<${o}>;

var<workgroup> done: u32;
var<workgroup> rot_active: u32;
var<workgroup> rot_c: ${o};
var<workgroup> rot_s: ${o};
var<workgroup> rot_app: ${o};
var<workgroup> rot_aqq: ${o};
var<workgroup> rot_apq: ${o};

fn mat_idx(base: u32, row: u32, col: u32) -> u32 {
  return base + row * ${i}u + col;
}

fn sym_idx(base: u32, row: u32, col: u32) -> u32 {
  return mat_idx(base, max(row, col), min(row, col));
}

@compute @workgroup_size(${p})
fn main(
  @builtin(workgroup_id) wg_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
) {
  let batch = wg_id.x + wg_id.y * ${U}u;
  if (batch >= ${u}u) {
    return;
  }

  let base = batch * ${i*i}u;
  let tid = local_id.x;

  for (var idx = tid; idx < ${i*i}u; idx += ${p}u) {
    let row = idx / ${i}u;
    let col = idx % ${i}u;
    diagonalized[base + idx] = select(
      ${o}(0),
      input[base + idx],
      row >= col,
    );
    vectors[base + idx] = select(${o}(0), ${o}(1), row == col);
  }
  storageBarrier();

  for (var sweep = 0u; sweep < ${r.maxSweeps}u; sweep++) {
    if (tid == 0u) {
      var max_abs = ${o}(1);
      var max_offdiag = ${o}(0);
      for (var idx = 0u; idx < ${i*i}u; idx++) {
        let row = idx / ${i}u;
        let col = idx % ${i}u;
        let value = abs(diagonalized[base + idx]);
        max_abs = max(max_abs, value);
        if (row > col) {
          max_offdiag = max(max_offdiag, value);
        }
      }
      done = select(0u, 1u, max_offdiag <= ${c} * max_abs);
    }
    let done_uniform = workgroupUniformLoad(&done);
    if (done_uniform != 0u) {
      break;
    }

    for (var p = 0u; p + 1u < ${i}u; p++) {
      for (var q = p + 1u; q < ${i}u; q++) {
        if (tid == 0u) {
          rot_app = diagonalized[mat_idx(base, p, p)];
          rot_aqq = diagonalized[mat_idx(base, q, q)];
          rot_apq = diagonalized[sym_idx(base, p, q)];
          if (rot_apq == ${o}(0)) {
            rot_active = 0u;
            rot_c = ${o}(1);
            rot_s = ${o}(0);
          } else {
            let tau = (rot_aqq - rot_app) / (${o}(2) * rot_apq);
            let tau_sign = select(${o}(-1), ${o}(1), tau >= ${o}(0));
            let t = tau_sign / (abs(tau) + sqrt(tau * tau + ${o}(1)));
            rot_c = inverseSqrt(t * t + ${o}(1));
            rot_s = t * rot_c;
            rot_active = 1u;
          }
        }
        workgroupBarrier();

        if (rot_active != 0u) {
          for (var k = tid; k < ${i}u; k += ${p}u) {
            if (k != p && k != q) {
              let kp = sym_idx(base, k, p);
              let kq = sym_idx(base, k, q);
              let akp = diagonalized[kp];
              let akq = diagonalized[kq];
              let next_kp = rot_c * akp - rot_s * akq;
              let next_kq = rot_s * akp + rot_c * akq;
              diagonalized[kp] = next_kp;
              diagonalized[kq] = next_kq;
            } else if (k == p) {
              diagonalized[mat_idx(base, p, p)] =
                rot_c * rot_c * rot_app - ${o}(2) * rot_s * rot_c * rot_apq + rot_s * rot_s * rot_aqq;
              diagonalized[sym_idx(base, p, q)] = ${o}(0);
            } else {
              diagonalized[mat_idx(base, q, q)] =
                rot_s * rot_s * rot_app + ${o}(2) * rot_s * rot_c * rot_apq + rot_c * rot_c * rot_aqq;
            }

            let vp = mat_idx(base, k, p);
            let vq = mat_idx(base, k, q);
            let vkp = vectors[vp];
            let vkq = vectors[vq];
            vectors[vp] = rot_c * vkp - rot_s * vkq;
            vectors[vq] = rot_s * vkp + rot_c * vkq;
          }
        }
        storageBarrier();
      }
    }
  }
}
`.trim(),numInputs:1,numOutputs:2,hasUniform:!1,passes:[{grid:B(u)}]}]}function ae(t,e,r,s){return new Uint8Array(new Uint32Array([t,e,r,s?1:0]).buffer)}function He(t,e,r){const s=e.inputDtypes[0],a=e.inputShapes[0],i=a[a.length-1],u=q(a.slice(0,-1));if(q(r.factors)!==i)throw new Error(`fft: factorization ${r.factors} does not match size ${i}`);const n=s==="float16",o=S(s,!0),c=Math.min(256,O(0,t.limits.maxComputeWorkgroupSizeX)),p=Math.max(1,...r.factors),h=r.inverse?"6.283185307179586":"-6.283185307179586",b=r.factors.map(x=>`
  digit = remaining % ${x}u;
  remaining = remaining / ${x}u;
  stride = stride * ${x}u;
  reversed = reversed + digit * (${i}u / stride);`).join(""),$=`
${n?"enable f16;":""}
${z}

@group(0) @binding(0) var<storage, read> input_real: array<${o}>;
@group(0) @binding(1) var<storage, read> input_imag: array<${o}>;
@group(0) @binding(2) var<storage, read_write> output_real: array<${o}>;
@group(0) @binding(3) var<storage, read_write> output_imag: array<${o}>;

struct FftParams {
  phase: u32,
  radix: u32,
  prev: u32,
  normalize: u32,
}

@group(1) @binding(0) var<uniform> fft_params: FftParams;

fn digit_reversed_index(index: u32) -> u32 {
  var remaining = index;
  var stride = 1u;
  var reversed = 0u;
  var digit = 0u;
${b}
  return reversed;
}

@compute @workgroup_size(${c})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let global = global_id.x + global_id.y * ${U*c}u;

  if (fft_params.phase == 0u) {
    if (global >= ${u*i}u) {
      return;
    }
    let batch = global / ${i}u;
    let out_idx = global % ${i}u;
    let source = batch * ${i}u + digit_reversed_index(out_idx);
    output_real[global] = input_real[source];
    output_imag[global] = input_imag[source];
    return;
  }

  let butterflies_per_batch = ${i}u / fft_params.radix;
  if (global >= ${u}u * butterflies_per_batch) {
    return;
  }

  let batch = global / butterflies_per_batch;
  let local = global % butterflies_per_batch;
  let j = local % fft_params.prev;
  let group = local / fft_params.prev;
  let span = fft_params.prev * fft_params.radix;
  let start = batch * ${i}u + group * span + j;
  let scale = select(1.0, 1.0 / f32(${i}u), fft_params.normalize != 0u);

  var scratch_real: array<f32, ${p}>;
  var scratch_imag: array<f32, ${p}>;

  for (var q = 0u; q < fft_params.radix; q++) {
    let idx = start + q * fft_params.prev;
    let angle = ${h} * f32(q * j) / f32(span);
    let c = cos(angle);
    let s = sin(angle);
    let xr = f32(output_real[idx]);
    let xi = f32(output_imag[idx]);
    scratch_real[q] = xr * c - xi * s;
    scratch_imag[q] = xr * s + xi * c;
  }

  for (var p = 0u; p < fft_params.radix; p++) {
    var sum_real = 0.0;
    var sum_imag = 0.0;
    for (var q = 0u; q < fft_params.radix; q++) {
      let angle = ${h} * f32(q * p) / f32(fft_params.radix);
      let c = cos(angle);
      let s = sin(angle);
      let xr = scratch_real[q];
      let xi = scratch_imag[q];
      sum_real += xr * c - xi * s;
      sum_imag += xr * s + xi * c;
    }
    let idx = start + p * fft_params.prev;
    output_real[idx] = ${o}(sum_real * scale);
    output_imag[idx] = ${o}(sum_imag * scale);
  }
}
`.trim(),g=[{grid:B(Math.ceil(u*i/c)),uniform:ae(0,1,1,!1)}];let d=1;for(let x=0;x<r.factors.length;x++){const f=r.factors[x];g.push({grid:B(Math.ceil(u*i/f/c)),uniform:ae(1,f,d,r.inverse&&x===r.factors.length-1)}),d*=f}return[{code:$,numInputs:2,numOutputs:2,hasUniform:!0,passes:g}]}function se(t,e){switch(e.name){case"Sort":return ze(t,e.type);case"Argsort":return Ge(t,e.type);case"Scatter":return We(t,e.type,e.params);case"CellPairs":return Te(t,e.type,e.params);case"TriangularSolve":return Fe(t,e.type,e.params);case"Cholesky":return Ye(t,e.type);case"LU":return Xe(t,e.type);case"JacobiEigh":return Ke(t,e.type,e.params);case"Fft":return He(t,e.type,e.params);default:throw new _e(e.name,"webgpu")}}const H=4096,W=new WeakMap;function pe(t){return{querySet:t.createQuerySet({type:"timestamp",count:H}),resolve:t.createBuffer({size:H*8,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),dst:t.createBuffer({size:H*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),nextIndex:0,entries:[]}}function Ve(t){if(!t.features.has("timestamp-query"))return;let e=W.get(t);e&&e.nextIndex>=H&&(ee(t,e),e=void 0),e||(e=pe(t),W.set(t,e),be(()=>{const a=W.get(t);a&&a.entries.length>0&&ee(t,a),W.delete(t)}));const r=e.nextIndex,s=r+1;return e.nextIndex+=2,{batch:e,beginIndex:r,endIndex:s}}function Qe(t){if(ue())return Ve(t)}function Ze(t,e,r,s,a){const i=xe(r);i.properties.push(["passes",`${s}`]),i.properties.push(["source",a]),e.batch.entries.push({...i,beginIndex:e.beginIndex,endIndex:e.endIndex}),Je(t)}function Je(t){queueMicrotask(()=>{const e=W.get(t);e&&e.entries.length>0&&(ee(t,e),W.set(t,pe(t)))})}function ee(t,e){if(e.entries.length===0)return;const r=e.nextIndex,s=t.createCommandEncoder();s.resolveQuerySet(e.querySet,0,r,e.resolve,0),s.copyBufferToBuffer(e.resolve,0,e.dst,0,r*8),t.queue.submit([s.finish()]);const{entries:a}=e;e.dst.mapAsync(GPUMapMode.READ).then(()=>{try{const i=new BigInt64Array(e.dst.getMappedRange()),u=i[a[a.length-1].endIndex],n=performance.now();for(const o of a)$e("webgpu",o,n+Number(i[o.beginIndex]-u)/1e6,n+Number(i[o.endIndex]-u)/1e6)}finally{e.dst.unmap(),e.querySet.destroy(),e.resolve.destroy(),e.dst.destroy()}})}const oe=64*1024*1024,et=64,tt=4096,rt=256;var ct=class{device;type="webgpu";maxArgs;pipelines;syncReader;buffers;nextSlot;#e=new Map;#t;#r;#a=new Map;#i=null;#s=!1;#o=[];constructor(t){this.device=t,V>=3&&t.adapterInfo&&console.info("webgpu adapter:",t.adapterInfo.vendor,t.adapterInfo.architecture),this.maxArgs=this.device.limits.maxStorageBuffersPerShaderStage-1,this.pipelines=new ut(t),this.syncReader=new Ie(t),this.buffers=new Map,this.nextSlot=1,this.#r=this.#u(4),this.#t=new nt(t),t.addEventListener("uncapturederror",e=>{console.error("Uncaptured error in WebGPU backend:",e.error.message)})}malloc(t,e){if(e&&e.byteLength!==t)throw new Error("initialData size does not match buffer size");const r=Math.ceil(t/4)*4||4,s=t===0?this.#r:this.#d(r);if(e&&t>0)if(e.byteLength%4===0)this.device.queue.writeBuffer(s,0,e);else{const i=e.byteLength-e.byteLength%4;i>0&&this.device.queue.writeBuffer(s,0,e,0,i);const u=new Uint8Array(4);u.set(e.subarray(i)),this.device.queue.writeBuffer(s,i,u)}const a=this.nextSlot++;return this.buffers.set(a,{buffer:s,size:t,allocatedSize:r,ref:1}),a}incRef(t){const e=this.buffers.get(t);if(!e)throw new Q(t);e.ref++}decRef(t){const e=this.buffers.get(t);if(!e)throw new Q(t);e.ref--,e.ref===0&&(this.buffers.delete(t),e.buffer!==this.#r&&(this.#i?this.#o.push([e.buffer,e.allocatedSize]):this.#c(e.buffer,e.allocatedSize)))}flush(){const t=this.#i;if(t){this.#i=null,t.uniformBytes&&this.#t.upload(t.uniforms,t.uniformBytes),this.device.queue.submit([t.encoder.finish()]);for(const[e,r]of this.#o.splice(0))this.#c(e,r)}}#f(){return this.#i||(this.#i={encoder:this.device.createCommandEncoder(),uniforms:[],uniformBytes:0,dispatches:0},this.#s||(this.#s=!0,queueMicrotask(()=>{this.#s=!1,this.flush()}))),this.#i}async read(t,e,r){this.flush();const{buffer:s,size:a}=this.#n(t);if(s===this.#r)return new Uint8Array;e===void 0&&(e=0),r===void 0&&(r=a-e);const i=Math.ceil(r/4)*4,u=this.#u(i,{read:!0});try{const n=this.device.createCommandEncoder();n.copyBufferToBuffer(s,e,u,0,i),this.device.queue.submit([n.finish()]),await qe(this.device,u);const o=u.getMappedRange();return new Uint8Array(o.slice(),0,r)}finally{u.destroy()}}readSync(t,e,r){this.flush();const{buffer:s,size:a}=this.#n(t);return s===this.#r?new Uint8Array:(e===void 0&&(e=0),r===void 0&&(r=a-e),this.syncReader.read(s,e,r))}#l(t){const e=he.hash(t);let r=this.#e.get(e);if(r)this.#e.delete(e);else if(r=at(this.device,t),this.#e.size>=tt){const s=this.#e.keys().next().value;this.#e.delete(s)}return this.#e.set(e,r),r}async prepareKernel(t){const e=this.#l(t),r=await this.pipelines.prepare(e);return new X(t,[{...e,pipeline:r}])}prepareKernelSync(t){const e=this.#l(t),r=this.pipelines.prepareSync(e);return new X(t,[{...e,pipeline:r}])}async prepareRoutine(t){const e=se(this.device,t);return new X(t,await Promise.all(e.map(async r=>{const s=await this.pipelines.prepare(r);return{...r,pipeline:s}})))}prepareRoutineSync(t){return new X(t,se(this.device,t).map(e=>{const r=this.pipelines.prepareSync(e);return{...e,pipeline:r}}))}dispatch(t,e,r){const s=e.map(n=>this.#n(n).buffer),a=r.map(n=>this.#n(n).buffer);if(ue()){this.flush(),ot(this.device,this.#t,t,s,a);return}const i=this.#t.bytesFor(t);this.#i&&this.#i.uniformBytes+i>this.#t.capacity&&this.flush(),this.#t.reserve(i);const u=this.#f();st(this.device,this.#t,u,t,s,a),++u.dispatches>=rt&&this.flush()}#n(t){const e=this.buffers.get(t);if(!e)throw new Q(t);return{buffer:e.buffer,size:e.size}}#d(t){if(t>oe)return this.#u(t);const e=this.#a.get(t),r=e?.pop();return e&&e.length===0&&this.#a.delete(t),r??this.#u(t)}#c(t,e){if(e>oe){t.destroy();return}const r=this.#a.get(e);if(!r){this.#a.set(e,[t]);return}if(r.length>=et){t.destroy();return}r.push(t)}#u(t,{mapped:e=!1,read:r=!1}={}){if(r&&e)throw new Error("mapped and read cannot both be true");return this.device.createBuffer({size:t,usage:r?GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST,mappedAtCreation:e})}};const it=256;function at(t,e){const r=me(e);V>=3&&console.info(`kernel.exp: ${e.exp}
tune.exp: ${r.exp}`);const{nargs:s,reduction:a}=e,i=Array.from({length:s},(m,w)=>`in${w}`),u=new ye;u.emitPreamble(t,[r.exp,r.epilogue]);const n=Array.from({length:s},()=>null);r.exp.fold(m=>{m.op==="GlobalIndex"&&(n[m.arg[0]]=m.dtype)}),r.epilogue?.fold(m=>{m.op==="GlobalIndex"&&(n[m.arg[0]]=m.dtype)});for(let m=0;m<s;m++){const w=S(n[m]??"float32",!0);u.emit(`@group(0) @binding(${m}) var<storage, read> ${i[m]} : array<${w}>;`)}const o=S(e.dtype,!0);u.emit(`@group(0) @binding(${s}) var<storage, read_write> result : array<${o}>;`);const c=a?r.size.groups??1:1,p=a&&c>1;if(p&&r.threadCount%c!==0)throw new Error("WebGPU grouped reduction has invalid thread count");if(p&&c>t.limits.maxComputeWorkgroupSizeX)throw new Error("WebGPU grouped reduction exceeds workgroup size limit");const h=p?c:it,b=p?r.threadCount/c:Math.ceil(r.threadCount/h),[$,g]=B(b),d=new Se,x=d.add("u32",p?b:r.threadCount);if(p){const m=S(a.dtype);for(let w=0;w<(r.size.upcast??1);w++)u.emit(`var<workgroup> partial${w}: array<${m}, ${c}>;`)}u.emit("",`@compute @workgroup_size(${h})`),p?(u.emit("fn main(",u.pushIndent,"@builtin(local_invocation_id) lid : vec3<u32>,","@builtin(workgroup_id) wg_id : vec3<u32>,",u.popIndent,") {",u.pushIndent),u.emit(`let gidx_u: u32 = ${U}u * wg_id.y + wg_id.x;`,`if (gidx_u >= ${x}) { return; }`,"let gidx: i32 = i32(gidx_u);","let group: i32 = i32(lid.x);")):(u.emit("fn main(@builtin(global_invocation_id) id : vec3<u32>) {",u.pushIndent),u.emit(`let gidx_u: u32 = ${U*h}u * id.y + id.x;`,`if (gidx_u >= ${x}) { return; }`,"let gidx: i32 = i32(gidx_u);")),u.emitPhonyAssignments(i);const f=new je(u,i,d);if(a){const m=r.size.unroll??1,w=r.size.upcast??1,y=[...Array(w)].map((l,_)=>`acc${_}`);for(let l=0;l<w;l++)u.emit(`var ${y[l]}: ${S(a.dtype)} = ${K(a.dtype,a.identity)};`);if(r.strided){const l=d.add("i32",r.size.reduce);u.emit(`for (var ridx: i32 = group; ridx < ${l}; ridx += ${c}) {`,u.pushIndent)}else u.emit(`for (var ridx: i32 = 0; ridx < ${r.size.reduce}; ridx++) {`,u.pushIndent);const P=[],G=new Map;for(let l=0;l<w;l++){P.push([]);for(let _=0;_<m;_++){const k=r.exp.substitute({upcast:F.i32(l),unroll:F.i32(_)});P[l].push(k.simplify(G)),f.countReferences(P[l][_])}}const E=P.map(l=>l.map(_=>f.run(_)).map(v)),I=l=>a.dtype==="bool"?`(${l})`:l;for(let l=0;l<w;l++){let _=I(E[l][0]);for(let k=1;k<m;k++)if(a.op==="Add")_=`${_} + ${E[l][k]}`;else if(a.op==="Mul")_=`${_} * ${E[l][k]}`;else if(a.op==="Min")_=a.dtype==="bool"?`(${_} && ${I(E[l][k])})`:`min(${_}, ${E[l][k]})`;else if(a.op==="Max")_=a.dtype==="bool"?`(${_} || ${I(E[l][k])})`:`max(${_}, ${E[l][k]})`;else throw new Error(`Unsupported reduction op: ${a.op}`);if(a.op==="Add")u.emit(`${y[l]} += ${_};`);else if(a.op==="Mul")u.emit(`${y[l]} *= ${_};`);else if(a.op==="Min")a.dtype==="bool"?u.emit(`${y[l]} = ${y[l]} && ${_};`):u.emit(`${y[l]} = min(${y[l]}, ${_});`);else if(a.op==="Max")a.dtype==="bool"?u.emit(`${y[l]} = ${y[l]} || ${_};`):u.emit(`${y[l]} = max(${y[l]}, ${_});`);else throw new Error(`Unsupported reduction op: ${a.op}`)}if(u.emit(u.popIndent,"}"),p){for(let l=0;l<w;l++)u.emit(`partial${l}[lid.x] = ${y[l]};`);u.emit("workgroupBarrier();");for(let l=c/2;l>=1;l/=2){u.emit(`if (lid.x < ${l}u) {`,u.pushIndent);for(let _=0;_<w;_++)u.emit(`partial${_}[lid.x] = ${ke(a.op,a.dtype,`partial${_}[lid.x]`,`partial${_}[lid.x + ${l}u]`)};`);u.emit(u.popIndent,"}","workgroupBarrier();")}}f.reset();const T=[],j=[];for(let l=0;l<w;l++){const _=r.outputIdxExp.substitute({upcast:F.i32(l)});T.push(_.simplify(G)),f.countReferences(T[l]),j.push(r.epilogue.substitute({acc:F.variable(a.dtype,y[l]),upcast:F.i32(l)}).simplify(G)),f.countReferences(j[l])}if(p){u.emit("if (lid.x == 0u) {",u.pushIndent);for(let l=0;l<w;l++)u.emit(`${y[l]} = partial${l}[0u];`)}for(let l=0;l<w;l++){const _=v(f.run(T[l]));let k=v(f.run(j[l]));o!==S(j[l].dtype)&&(k=`${o}(${k})`),u.emit(`result[${_}] = ${k};`)}p&&u.emit(u.popIndent,"}")}else{f.countReferences(r.exp);let m=v(f.run(r.exp));o!==S(r.exp.dtype)&&(m=`${o}(${m})`),u.emit(`result[gidx] = ${m};`)}return u.emit(u.popIndent,"}"),d.emit(u),{code:u.toString(),numInputs:s,numOutputs:1,hasUniform:d.entries.length>0,passes:[{grid:[$,g],uniform:d.entries.length>0?d.data():void 0}]}}function st(t,e,r,s,a,i){const u=r.encoder;for(const{pipeline:n,...o}of s.data){if(a.length!==o.numInputs||i.length!==o.numOutputs)throw new Error(`webgpu: expected ${o.numInputs} inputs and ${o.numOutputs} outputs, got ${a.length} inputs and ${i.length} outputs`);if(o.clearOutputs)for(const g of i)u.clearBuffer(g);const c=o.passes.filter(({grid:g})=>q(g)>0);if(c.length===0)continue;const p=t.createBindGroup({layout:n.getBindGroupLayout(0),entries:[...a.map((g,d)=>({binding:d,resource:{buffer:g}})),...i.map((g,d)=>({binding:a.length+d,resource:{buffer:g}}))]});let h=null,b=0,$=0;if(o.hasUniform){const g=c.map(({uniform:d})=>d);b=e.alignmentOf(g),$=e.alignUp(r.uniformBytes),g.forEach((d,x)=>r.uniforms.push([$+x*b,d])),r.uniformBytes=$+g.length*b,h=e.bindGroup(n,b)}for(let g=0;g<c.length;g++){const d=u.beginComputePass();d.setPipeline(n),d.setBindGroup(0,p),h&&d.setBindGroup(1,h,[$+g*b]),d.dispatchWorkgroups(c[g].grid[0],c[g].grid[1]),d.end()}}}function ot(t,e,r,s,a){const{data:i,source:u}=r,n=t.createCommandEncoder();for(const{pipeline:o,...c}of i){if(s.length!==c.numInputs||a.length!==c.numOutputs)throw new Error(`webgpu: expected ${c.numInputs} inputs and ${c.numOutputs} outputs, got ${s.length} inputs and ${a.length} outputs`);if(c.clearOutputs)for(const d of a)n.clearBuffer(d);const p=c.passes.filter(({grid:d})=>q(d)>0);if(p.length===0)continue;const h=Qe(t),b=t.createBindGroup({layout:o.getBindGroupLayout(0),entries:[...s.map((d,x)=>({binding:x,resource:{buffer:d}})),...a.map((d,x)=>({binding:s.length+x,resource:{buffer:d}}))]});let $=null,g=0;if(c.hasUniform){const d=p.map(({uniform:m})=>m),[x,f]=e.write(d);g=f,$=t.createBindGroup({layout:o.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:x,size:f}}]})}for(let d=0;d<p.length;d++){const{grid:x}=p[d];let f;if(h){const w=d===0,y=d===p.length-1;(w||y)&&(f={querySet:h.batch.querySet,...w?{beginningOfPassWriteIndex:h.beginIndex}:{},...y?{endOfPassWriteIndex:h.endIndex}:{}})}const m=n.beginComputePass({timestampWrites:f});m.setPipeline(o),m.setBindGroup(0,b),$&&m.setBindGroup(1,$,[d*g]),m.dispatchWorkgroups(x[0],x[1]),m.end()}h&&Ze(t,h,u,p.length,c.code)}t.queue.submit([n.finish()])}var nt=class{device;#e=null;#t=0;#r=new WeakMap;constructor(t){this.device=t}get capacity(){return this.#t}alignUp(t){const e=this.device.limits.minUniformBufferOffsetAlignment;return Math.ceil(t/e)*e}alignmentOf(t){for(const e of t)if(!e||e.byteLength===0||e.byteLength!==t[0].byteLength)throw new Error("webgpu: Uniform mismatch between shader passes");return this.alignUp(t[0].byteLength)}bytesFor(t){let e=0;for(const r of t.data){if(!r.hasUniform)continue;const s=r.passes.filter(({grid:a})=>q(a)>0);s.length&&(e+=this.alignUp(s[0].uniform.byteLength)*s.length+this.alignUp(1))}return e}reserve(t){this.#e&&this.#t>=t||(this.#e?.destroy(),this.#t=Math.max(t,this.#t*2,256*1024),this.#e=this.device.createBuffer({size:this.#t,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}))}bindGroup(t,e){const r=this.#r.get(t);if(r&&r.buffer===this.#e&&r.alignment===e)return r.group;const s=this.device.createBindGroup({layout:t.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:this.#e,size:e}}]});return this.#r.set(t,{buffer:this.#e,alignment:e,group:s}),s}upload(t,e){const r=new Uint8Array(e);for(const[s,a]of t)r.set(a,s);this.device.queue.writeBuffer(this.#e,0,r)}write(t){for(const i of t)if(!i||i.byteLength===0||i.byteLength!==t[0].byteLength)throw new Error("webgpu: Uniform mismatch between shader passes");const e=this.device.limits.minUniformBufferOffsetAlignment,r=Math.ceil(t[0].byteLength/e)*e,s=r*t.length;this.reserve(s);const a=new Uint8Array(s);for(let i=0;i<t.length;i++)a.set(t[i],i*r);return this.device.queue.writeBuffer(this.#e,0,a),[this.#e,r]}},ut=class{device;cache;inProgress;constructor(t){this.device=t,this.cache=new Map,this.inProgress=new Map}#e(t){if(t.numInputs+t.numOutputs>this.device.limits.maxStorageBuffersPerShaderStage){const r=t.numInputs+t.numOutputs,s=this.device.limits.maxStorageBuffersPerShaderStage;throw new Error(`Too many buffers (${r}) for WebGPU pipeline (max: ${s})`)}const e=[this.device.createBindGroupLayout({entries:N(t.numInputs+t.numOutputs).map(r=>({binding:r,visibility:GPUShaderStage.COMPUTE,buffer:{type:r<t.numInputs?"read-only-storage":"storage"}}))})];return t.hasUniform&&e.push(this.device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform",hasDynamicOffset:!0}}]})),this.device.createPipelineLayout({bindGroupLayouts:e})}async prepare(t){const e=this.cache.get(t.code);if(e)return e;const r=this.inProgress.get(t.code);if(r)return await r;V>=2&&console.info(`=========== WebGPU shader ===========
`+t.code);const s=this.device.createShaderModule({code:t.code}),a=(async()=>{this.device.pushErrorScope("validation");try{const u=await this.device.createComputePipelineAsync({layout:this.#e(t),compute:{module:s,entryPoint:"main"}});return await this.device.popErrorScope(),u}catch{const n=await ne(s,await this.device.popErrorScope(),t.code);throw new Error(n)}})();this.inProgress.set(t.code,a);const i=await a;return this.cache.set(t.code,i),i}prepareSync(t){const e=this.cache.get(t.code);if(e)return e;V>=2&&console.info(`=========== WebGPU shader ===========
`+t.code);const r=this.device.createShaderModule({code:t.code});this.device.pushErrorScope("validation");const s=this.device.createComputePipeline({layout:this.#e(t),compute:{module:r,entryPoint:"main"}});return this.device.popErrorScope().then(async a=>{if(a!==null){const i=await ne(r,a,t.code);console.error(i)}}),this.cache.set(t.code,s),s}};async function ne(t,e,r){let s=`Failed to compile shader: ${e?e.message:"(no error scope)"}`;const a=await t.getCompilationInfo();for(const i of a.messages)s+=`
  [${i.type} at ${i.lineNum}:${i.linePos}] ${i.message}`;return r&&(s+=`

${r}`),s}export{ct as WebGPUBackend,at as pipelineSource};
