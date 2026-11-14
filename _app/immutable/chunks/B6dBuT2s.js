import{eF as F,eH as g,eP as y,eV as S,eC as B,eD as h,eN as v,eL as m,eK as w,eM as M}from"./tOd4CyYd.js";const L=`
uvec2 threefry2x32(uvec2 key, uvec2 ctr) {
  uint ks0 = key.x;
  uint ks1 = key.y;
  uint ks2 = ks0 ^ ks1 ^ 0x1BD11BDAu;

  uint x0 = ctr.x + ks0;
  uint x1 = ctr.y + ks1;

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

  return uvec2(x0, x1);
}`,D=`
const float _erf_p = 0.3275911;
const float _erf_a1 = 0.254829592;
const float _erf_a2 = -0.284496736;
const float _erf_a3 = 1.421413741;
const float _erf_a4 = -1.453152027;
const float _erf_a5 = 1.061405429;
float erf(float x) {
  float t = 1.0 / (1.0 + _erf_p * abs(x));
  float P_t = (((((_erf_a5 * t) + _erf_a4) * t + _erf_a3) * t + _erf_a2) * t + _erf_a1) * t;
  return sign(x) * (1.0 - P_t * exp(-x * x));
}
float erfc(float x) {
  float t = 1.0 / (1.0 + _erf_p * abs(x));
  float P_t = (((((_erf_a5 * t) + _erf_a4) * t + _erf_a3) * t + _erf_a2) * t + _erf_a1) * t;
  float E = P_t * exp(-x * x);
  return x >= 0.0 ? E : 2.0 - E;
}`,P=`
int bitCountFallback(uint value) {
  value = value - ((value >> 1u) & 0x55555555u);
  value = (value & 0x33333333u) + ((value >> 2u) & 0x33333333u);
  value = (value + (value >> 4u)) & 0x0f0f0f0fu;
  value = value + (value >> 8u);
  value = value + (value >> 16u);
  return int(value & 0x3fu);
}
int bitCountFallback(int value) {
  return bitCountFallback(uint(value));
}`;var W=class{type="webgl";maxArgs=8;gl;#t;#e;#r;#o;constructor(t){this.gl=t,this.#t=t.createFramebuffer(),this.#e=new Map,this.#r=new Map,this.#o=1}malloc(t,o){const n=this.gl,e=Math.ceil(t/4)||1,{width:r,height:d}=I(Math.ceil(e/4)||1),a=n.createTexture();if(!a)throw new Error("Failed to create texture");n.bindTexture(n.TEXTURE_2D,a),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MAG_FILTER,n.NEAREST),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);const x=r*d*4;let u=null;o&&(u=new Float32Array(x),new Uint8Array(u.buffer).set(o)),n.texImage2D(n.TEXTURE_2D,0,n.RGBA32F,r,d,0,n.RGBA,n.FLOAT,u),n.bindTexture(n.TEXTURE_2D,null);const l=this.#o++;return this.#e.set(l,{ref:1,size:t,texture:a,width:r,height:d}),l}incRef(t){const o=this.#e.get(t);if(!o)throw new F(t);o.ref++}decRef(t){const o=this.#e.get(t);if(!o)throw new F(t);o.ref--,o.ref===0&&(this.gl.deleteTexture(o.texture),this.#e.delete(t))}async read(t,o,n){const e=this.#e.get(t);if(!e)throw new F(t);const r=this.gl;o===void 0&&(o=0),n===void 0&&(n=e.size-o),r.bindFramebuffer(r.FRAMEBUFFER,this.#t),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,e.texture,0);const d=e.width*e.height*4*4,a=new Float32Array(d/4),x=r.createBuffer();if(!x)throw new Error("Failed to create PBO");r.bindBuffer(r.PIXEL_PACK_BUFFER,x),r.bufferData(r.PIXEL_PACK_BUFFER,d,r.STREAM_READ),r.readPixels(0,0,e.width,e.height,r.RGBA,r.FLOAT,0);const u=r.getError();if(u!==r.NO_ERROR)throw r.deleteBuffer(x),new Error(`WebGL error after readPixels: ${u}`);const l=r.fenceSync(r.SYNC_GPU_COMMANDS_COMPLETE,0);if(!l)throw new Error("Failed to create sync object");r.flush(),r.bindBuffer(r.PIXEL_PACK_BUFFER,null),r.bindFramebuffer(r.FRAMEBUFFER,null),await new Promise((s,f)=>{const c=()=>{const $=r.clientWaitSync(l,0,0);if($===r.TIMEOUT_EXPIRED){setTimeout(c,5);return}if($===r.WAIT_FAILED){r.deleteSync(l),r.deleteBuffer(x),f(new Error("clientWaitSync failed"));return}s()};c()}),r.deleteSync(l),r.bindBuffer(r.PIXEL_PACK_BUFFER,x),r.getBufferSubData(r.PIXEL_PACK_BUFFER,0,a),r.bindBuffer(r.PIXEL_PACK_BUFFER,null),r.deleteBuffer(x);const i=new Uint8Array(a.buffer);return new Uint8Array(i.slice(o,o+n))}readSync(t,o,n){const e=this.#e.get(t);if(!e)throw new F(t);const r=this.gl;o===void 0&&(o=0),n===void 0&&(n=e.size-o),r.bindFramebuffer(r.FRAMEBUFFER,this.#t),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,e.texture,0);const d=e.width*e.height*4,a=new Float32Array(d);r.readPixels(0,0,e.width,e.height,r.RGBA,r.FLOAT,a),r.bindFramebuffer(r.FRAMEBUFFER,null);const x=new Uint8Array(a.buffer);return new Uint8Array(x.slice(o,o+n))}async prepareKernel(t){return this.prepareKernelSync(t)}prepareKernelSync(t){const o=C(t),n=this.#r.get(o.code);if(n)return new g(t,n);const e=k(this.gl,o);return this.#r.set(o.code,e),new g(t,e)}prepareRoutine(t){throw new y(t.name,"webgl")}prepareRoutineSync(t){throw new y(t.name,"webgl")}dispatch(t,o,n){const e=this.gl;if(e.isContextLost())throw new Error("WebGL context lost - cannot dispatch");const{program:r,inputLocations:d}=t.data;if(o.length!==t.data.numInputs)throw new Error(`Expected ${t.data.numInputs} inputs, got ${o.length}`);if(n.length!==1)throw new Error(`Expected 1 output, got ${n.length}`);const a=this.#e.get(n[0]);if(!a)throw new F(n[0]);e.bindFramebuffer(e.FRAMEBUFFER,this.#t),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,a.texture,0);const x=e.checkFramebufferStatus(e.FRAMEBUFFER);if(x!==e.FRAMEBUFFER_COMPLETE)throw new Error(`Framebuffer incomplete: ${x}`);e.viewport(0,0,a.width,a.height),e.useProgram(r);for(let l=0;l<o.length;l++){const i=this.#e.get(o[l]);if(!i)throw new F(o[l]);e.activeTexture(e.TEXTURE0+l),e.bindTexture(e.TEXTURE_2D,i.texture),d[l]!==null&&e.uniform1i(d[l],l)}e.drawArrays(e.TRIANGLES,0,3);const u=e.getError();if(u!==e.NO_ERROR){let l;throw u===e.INVALID_ENUM?l="INVALID_ENUM":u===e.INVALID_VALUE?l="INVALID_VALUE":u===e.INVALID_OPERATION?l="INVALID_OPERATION":u===e.INVALID_FRAMEBUFFER_OPERATION?l="INVALID_FRAMEBUFFER_OPERATION":u===e.OUT_OF_MEMORY?l="OUT_OF_MEMORY":u===e.CONTEXT_LOST_WEBGL?l="CONTEXT_LOST_WEBGL":l=`UNKNOWN(${u})`,new Error(`WebGL error after drawArrays: ${l}`)}e.bindFramebuffer(e.FRAMEBUFFER,null),e.useProgram(null)}};function C(t){const o=S(t);B>=3&&console.info(`webgl kernel.exp: ${t.exp}
tune.exp: ${o.exp}`);const{nargs:n,reduction:e}=t,r=t.dtype,d=I(Math.ceil(t.size/4)||1),a=Array(n).fill("float32"),x={bitCount:!1,erf:!1,threefry:!1},u=E=>{E.op==="GlobalIndex"?a[E.arg[0]]=E.dtype:E.op==="Erf"||E.op==="Erfc"?x.erf=!0:E.op==="BitCount"?x.bitCount=!0:E.op==="Threefry2x32"&&(x.threefry=!0)};o.exp.fold(u),o.epilogue?.fold(u);const l=[];let i="";const s=Symbol("pushIndent"),f=Symbol("popIndent"),c=(...E)=>{for(const T of E)T===s?i+="  ":T===f?i=i.slice(0,-2):l.push(T&&i+T)};c("#version 300 es","precision highp float;","precision highp int;","");const $=Array.from({length:n},(E,T)=>`in${T}`),p=b(r);for(let E=0;E<n;E++)c(`uniform highp sampler2D ${$[E]};`);c("out vec4 out0;");const _=new Set;for(const E of a)_.add(E);for(const E of _)c(G(E));if(x.erf&&c(D),x.bitCount&&c(P),x.threefry&&c(L),c(`${p} compute(int gidx) {`,s,`${p} result = ${A(r,0)};`,`if (gidx < ${t.size}) {`,s),!e)c(`result = ${h(R(o.exp,$,a))};`);else{c(`${b(e.dtype)} acc = ${A(e.dtype,e.identity)};`,`for (int ridx = 0; ridx < ${o.size.reduce}; ridx++) {`,s);const E=R(o.exp,$,a);if(e.op==="Add")c(`acc += ${h(E)};`);else if(e.op==="Mul")c(`acc *= ${h(E)};`);else if(e.op==="Min")e.dtype!=="bool"?c(`acc = min(acc, ${h(E)});`):c(`acc = acc && ${E};`);else if(e.op==="Max")e.dtype!=="bool"?c(`acc = max(acc, ${h(E)});`):c(`acc = acc || ${E};`);else throw new Error(`Unsupported reduction op: ${e.op}`);c(f,"}"),c(`result = ${R(o.epilogue,$,a)};`)}return c(f,"}","return result;",f,`}
`),c("void main() {",s,"ivec2 fragCoord = ivec2(gl_FragCoord.xy);",`int texelIdx = fragCoord.y * ${d.width} + fragCoord.x;`,`${p} result0 = compute(texelIdx * 4);`,`${p} result1 = compute(texelIdx * 4 + 1);`,`${p} result2 = compute(texelIdx * 4 + 2);`,`${p} result3 = compute(texelIdx * 4 + 3);`,`out0 = vec4(${v(4).map(E=>X(r,`result${E}`)).join(", ")});`),c(f,"}"),{code:l.join(`
`),numInputs:n,outputSize:[d.width,d.height],outputDtype:r}}function U(t,o,n){const e=t.createShader(o);if(t.shaderSource(e,n),t.compileShader(e),!t.getShaderParameter(e,t.COMPILE_STATUS))throw new Error(t.getShaderInfoLog(e)??"Unknown shader compile error");return e}function O(t,o,n){const e=t.createProgram();if(t.attachShader(e,U(t,t.VERTEX_SHADER,o)),t.attachShader(e,U(t,t.FRAGMENT_SHADER,n)),t.linkProgram(e),!t.getProgramParameter(e,t.LINK_STATUS))throw new Error(t.getProgramInfoLog(e)??"Unknown program link error");return e}const N=`#version 300 es
precision highp float;
const vec2 pos[3] = vec2[](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main() { gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0); }
`;function k(t,o){B>=1&&console.info(`=========== WebGL shader ===========
`+o.code);const n=O(t,N,o.code),e=[];for(let r=0;r<o.numInputs;r++)e.push(t.getUniformLocation(n,`in${r}`));return{...o,program:n,inputLocations:e}}function I(t){let n=Math.min(Math.ceil(Math.sqrt(t)),16384);n=Math.min(1<<Math.ceil(Math.log2(n)),16384);const e=Math.min(Math.ceil(t/n),16384);return{width:n,height:e}}function b(t){switch(t){case"float32":return"float";case"int32":return"int";case"uint32":return"uint";case"bool":return"bool";default:throw new Error(`Unsupported dtype for WebGL: ${t}`)}}function G(t){const o=`load_${t}`,n=b(t);let e;if(m(t))e="val";else if(t==="int32")e="floatBitsToInt(val)";else if(t==="uint32")e="floatBitsToUint(val)";else if(t==="bool")e="floatBitsToInt(val) != 0";else throw new Error(`Unsupported dtype for WebGL fetch: ${t}`);return`
${n} ${o}(highp sampler2D tex, int idx) {
  ivec2 texSize = textureSize(tex, 0);
  int texel = idx / 4;
  int component = idx - texel * 4;
  ivec2 coord = ivec2(texel % texSize.x, texel / texSize.x);
  vec4 texVal = texelFetch(tex, coord, 0);
  float val;
  if (component == 0) val = texVal.x;
  else if (component == 1) val = texVal.y;
  else if (component == 2) val = texVal.z;
  else val = texVal.w;
  return ${e};
}
`}function X(t,o){switch(t){case"float32":return o;case"int32":return`intBitsToFloat(${o})`;case"uint32":return`uintBitsToFloat(${o})`;case"bool":return`intBitsToFloat(${o} ? 1 : 0)`;default:throw new Error(`Unsupported dtype for WebGL output: ${t}`)}}function A(t,o){switch(t){case"bool":return o?"true":"false";case"int32":return o.toString();case"uint32":return o.toString()+"u";case"float32":return Number.isNaN(o)?"uintBitsToFloat(0x7fc00000u)":Number.isFinite(o)?"float("+o.toString()+")":o>0?"uintBitsToFloat(0x7f800000u)":"uintBitsToFloat(0xff800000u)";default:throw new Error(`Unsupported dtype for WebGL constant: ${t}`)}}function R(t,o,n){const e=new Map,r=d=>{if(e.has(d))return e.get(d);const{op:a,src:x,dtype:u,arg:l}=d;let i="";if(w.Binary.has(a)){const s=r(x[0]),f=r(x[1]);if(a==="Add")u==="bool"?i=`(${s} || ${f})`:i=`(${s} + ${f})`;else if(a==="Sub")i=`(${s} - ${f})`;else if(a==="Mul")u==="bool"?i=`(${s} && ${f})`:i=`(${s} * ${f})`;else if(a==="Idiv")m(u)?i=`trunc(${s} / ${f})`:i=`(${s} / ${f})`;else if(a==="Mod")m(u)?i=`(${s} - ${f} * trunc(${s} / ${f}))`:i=`(${s} % ${f})`;else if(a==="Min")u==="bool"?i=`(${s} && ${f})`:i=`min(${s}, ${f})`;else if(a==="Max")u==="bool"?i=`(${s} || ${f})`:i=`max(${s}, ${f})`;else if(a==="BitCombine"){let c=l==="and"?"&":l==="or"?"|":"^";u==="bool"&&(c=c+c),i=`(${s} ${c} ${f})`}else a==="BitShift"&&(l==="shl"?i=`(${s} << ${f})`:i=`(${s} >> ${f})`)}else if(w.Compare.has(a)){const s=r(x[0]),f=r(x[1]);a==="Cmplt"?i=`(${s} < ${f})`:a==="Cmpne"&&(m(x[0].dtype)?i=`(${s} != ${f} || isnan(${s}) || isnan(${f}))`:i=`(${s} != ${f})`)}else if(w.Unary.has(a)){const s=r(x[0]);if(a==="BitCount")i=`bitCountFallback(${h(s)})`;else if(a==="Sin")i=`sin(${h(s)})`;else if(a==="Cos")i=`cos(${h(s)})`;else if(a==="Asin")i=`asin(${h(s)})`;else if(a==="Atan")i=`atan(${h(s)})`;else if(a==="Exp")i=`exp(${h(s)})`;else if(a==="Log")i=`log(${h(s)})`;else if(a==="Erf")i=`erf(${h(s)})`;else if(a==="Erfc")i=`erfc(${h(s)})`;else if(a==="Sqrt")i=`sqrt(${h(s)})`;else if(a==="Floor")i=`floor(${h(s)})`;else if(a==="Ceil")i=`ceil(${h(s)})`;else if(a==="Reciprocal")i=`(1.0 / ${s})`;else if(a==="Cast")i=`${b(u)}(${h(s)})`;else if(a==="Bitcast"){const f=x[0].dtype;u===f?i=s:u==="float32"?f==="int32"?i=`intBitsToFloat(${h(s)})`:f==="uint32"&&(i=`uintBitsToFloat(${h(s)})`):u==="int32"?f==="float32"?i=`floatBitsToInt(${h(s)})`:f==="uint32"&&(i=`int(${h(s)})`):u==="uint32"&&(f==="float32"?i=`floatBitsToUint(${h(s)})`:f==="int32"&&(i=`uint(${h(s)})`))}}else if(a==="Threefry2x32"){const[s,f,c,$]=x.map(E=>h(r(E))),p=l,_=`threefry2x32(uvec2(${s}, ${f}), uvec2(${c}, ${$}))`;p==="xor"?i=`(${_}.x ^ ${_}.y)`:p===0?i=`${_}.x`:p===1&&(i=`${_}.y`)}else if(a==="Where"){const[s,f,c]=x.map(r);i=`(${s} ? ${f} : ${c})`}else if(a==="Const")i=A(u,l);else if(a==="Special")i=l[0];else if(a==="Variable")i=l;else if(a==="GlobalIndex"){const s=l[0],f=r(x[0]);i=`load_${n[s]}(${o[s]}, ${h(f)})`}if(!i)throw new M(a,u,"webgl",l);return e.set(d,i),i};return r(t)}export{W as WebGLBackend};
