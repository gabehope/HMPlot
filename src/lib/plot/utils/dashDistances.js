/**
 * Dash distances in screen space for a connected Line (TODO 73.2). A dash is measured in CSS pixels
 * along the drawn path, so a row's dash phase is the screen length of the path before it: a prefix
 * sum over the rows that changes with the camera, the canvas and every frame chain. This WGSL pass
 * maps each row's ends through the mark's coordinate operations (the table the refinement pass and
 * the connection gather evaluate, operationTable.js) and the camera, and writes each drawn
 * instance's start and end distance along its path. Distances are in viewport heights, so a render
 * at another resolution (an export) reads them in its own pixels; the line material multiplies
 * them by its viewport's height in CSS pixels (materials/lines.js).
 *
 * A path starts over (distance 0) at its first row, after a row that maps nowhere, and where a row
 * does not start where the previous one ended (a series' or a NaN gap's break). A Line on a
 * surface splits each row into 64 drawn pieces: each takes its share of the row's length.
 *
 * One dispatch of one workgroup, only when its inputs change (the packed camera, sizes and chain,
 * the rows' versions): each of 256 threads measures a contiguous chunk of rows, one thread scans the
 * chunks' sums, and each thread writes its chunk. Nothing is read back.
 */
import { StorageBufferAttribute } from "three/webgpu";
import { storage, instanceIndex } from "three/tsl";
import { operationTableWgsl, packOperationTable } from "./operationTable.js";
import { resolveCoordinateOperations } from "./coordinateOperations.js";
import { placedFrame, resolvePlacement } from "./framePlacement.js";
import { releaseAttribute } from "../../threeExtensions/array/attributeRelease.js";

/** Byte offsets of the pass's uniform block (WGSL struct `Params`). */
export const DASH_PARAMS_LAYOUT = Object.freeze({
  matrix: 0, // mat4x4f: camera projection x view
  viewport: 64, // vec4f: width and height in device pixels, device pixels per CSS pixel
  source: 80, // vec4u: rows, floats per row, drawn pieces per row, flags (1: endpoint offsets)
  operationCount: 96,
  operationKinds: 112, // array<vec4u, 16>
  operationData: 368, // array<vec4f, 64>
});
export const DASH_PARAMS_BYTES = 1392;
const WORKGROUP = 256;
// A field name kept out of a literal get("...") call: the Python API generator reads those as
// component options.
const OFFSET_FIELD = "endpointOffset";

const dashShader = /* wgsl */ `
@group(0) @binding(0) var<storage, read> starts: array<f32>;
@group(0) @binding(1) var<storage, read> ends: array<f32>;
@group(0) @binding(2) var<storage, read> offsets: array<f32>;
@group(0) @binding(3) var<storage, read_write> distances: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> lengths: array<f32>;
struct Params { matrix: mat4x4f, viewport: vec4f, source: vec4u, operationCount: vec4u,
  operationKinds: array<vec4u, 16>, operationData: array<vec4f, 64> }
@group(0) @binding(5) var<uniform> p: Params;
${operationTableWgsl({ count: "p.operationCount.x", kinds: "p.operationKinds", data: "p.operationData" })}
var<workgroup> sums: array<f32, ${WORKGROUP}>;
var<workgroup> resets: array<u32, ${WORKGROUP}>;
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
@compute @workgroup_size(${WORKGROUP}) fn main(@builtin(local_invocation_index) t: u32) {
  let rows = p.source.x;
  let chunk = (rows + ${WORKGROUP - 1}u) / ${WORKGROUP}u;
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
    for (var k = 0u; k < ${WORKGROUP}u; k++) {
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
`;

const pipelines = new WeakMap();
function pipelineFor(device) {
  let entry = pipelines.get(device);
  if (!entry) {
    const layout = device.createBindGroupLayout({
      entries: [0, 1, 2, 3, 4, 5].map((binding) => ({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: binding === 5 ? "uniform" : binding < 3 ? "read-only-storage" : "storage" },
      })),
    });
    const pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module: device.createShaderModule({ code: dashShader }), entryPoint: "main" },
    });
    entry = { layout, pipeline };
    pipelines.set(device, entry);
  }
  return entry;
}

export class DashDistances {
  constructor(mark) {
    this.mark = mark;
    this.capacity = 1;
    this.buffer = new StorageBufferAttribute(new Float32Array(2), 2);
    // A named binding: an unnamed one is NodeBuffer_<node id>, a new shader per mark (17.6).
    this.storage = storage(this.buffer, "vec2", 1).setName("hmDashDistances");
    /** Each drawn instance's (start, end) distance along its path, in viewport heights. */
    this.node = this.storage.element(instanceIndex);
    this.key = null;
  }

  /** The rows this pass measures, or null when the mark has none on the GPU. */
  inputs() {
    const m = this.mark, start = m.fields?.get("start"), end = m.fields?.get("end");
    if (!start?.isBufferNode || !end?.isBufferNode || !start.bufferNodeSource || !end.bufferNodeSource) return null;
    const repeats = m.surface ? 64 : 1, rows = Math.floor((m.count ?? 0) / repeats);
    const offsets = m.endpointOffsetActive ? m.fields.get(OFFSET_FIELD) : null;
    return { start, end, offsets: offsets?.isBufferNode ? offsets : null, repeats, rows };
  }

  /** Measure the rows for `camera` at a `width` x `height` (device pixels) render, if anything changed. */
  prepare(camera, width, height) {
    const m = this.mark, r = m.renderer, d = r?.backend?.device;
    const input = this.inputs();
    if (!d || !input || !input.rows) return;
    const bytes = new ArrayBuffer(DASH_PARAMS_BYTES), f = new Float32Array(bytes), u = new Uint32Array(bytes),
      L = DASH_PARAMS_LAYOUT, ratio = r.getPixelRatio?.() ?? 1;
    // projection x view, column-major as WGSL reads it.
    const pv = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
    f.set(pv.elements, L.matrix / 4);
    f.set([width, height, ratio, 0], L.viewport / 4);
    const stride = input.start.bufferNodeSource.itemSize;
    u.set([input.rows, stride, input.repeats, input.offsets ? 1 : 0], L.source / 4);
    let operations;
    try {
      const matrixFor = (definition) => resolvePlacement(definition, camera, width / ratio, height / ratio);
      // Connection-backed rows are world positions: only their frame's placement applies (base.js mapPosition).
      operations = m.positionSpace === "world"
        ? (placedFrame(m.options) ? [{ kind: "matrix", elements: Array.from(matrixFor(placedFrame(m.options)).elements) }] : [])
        : resolveCoordinateOperations(m.options, { matrixFor });
      packOperationTable(operations, u, f, { count: L.operationCount / 4, kinds: L.operationKinds / 4, data: L.operationData / 4 });
    } catch {
      return;
    }
    const versions = [input.start, input.end, input.offsets].map((field) => field ? [field.version, field.animationVersion ?? 0] : null);
    const key = JSON.stringify([Array.from(u), versions]);
    const sources = [input.start.bufferNodeSource, input.end.bufferNodeSource, input.offsets?.bufferNodeSource];
    if (key === this.key && sources.every((source, k) => source === this.sources?.[k])) return;
    for (const source of sources) if (source && !r.backend.has(source)) return;
    const instances = input.rows * input.repeats;
    if (instances > this.capacity) {
      const old = this.buffer;
      this.capacity = 2 ** Math.ceil(Math.log2(instances));
      this.buffer = new StorageBufferAttribute(new Float32Array(this.capacity * 2), 2);
      this.storage.value = this.buffer;
      this.storage.bufferCount = this.capacity;
      m.material.needsUpdate = true;
      releaseAttribute(r, old);
    }
    if (!r.backend.has(this.buffer)) r.backend.createStorageAttribute(this.buffer);
    if (!this.lengths || this.lengths.size < input.rows * 4) {
      this.lengths?.destroy();
      this.lengths = d.createBuffer({ size: 2 ** Math.ceil(Math.log2(Math.max(16, input.rows * 4))), usage: GPUBufferUsage.STORAGE });
    }
    this.params ??= d.createBuffer({ size: DASH_PARAMS_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.empty ??= d.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
    d.queue.writeBuffer(this.params, 0, bytes);
    const { layout, pipeline } = pipelineFor(d);
    const buffers = [
      r.backend.get(sources[0]).buffer, r.backend.get(sources[1]).buffer,
      sources[2] ? r.backend.get(sources[2]).buffer : this.empty,
      r.backend.get(this.buffer).buffer, this.lengths, this.params,
    ];
    const encoder = d.createCommandEncoder(), pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, d.createBindGroup({ layout, entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) }));
    pass.dispatchWorkgroups(1);
    pass.end();
    d.queue.submit([encoder.finish()]);
    this.key = key;
    this.sources = sources;
  }

  dispose() {
    releaseAttribute(this.mark.renderer, this.buffer);
    this.lengths?.destroy();
    this.params?.destroy();
    this.empty?.destroy();
  }
}
