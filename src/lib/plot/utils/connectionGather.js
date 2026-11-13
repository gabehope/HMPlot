/**
 * Connections (Stage 15), the live gather (Tier 2): a WGSL compute pass that re-reads a
 * connection-backed mark's endpoints from their LIVE GPU field buffers (the rows an animation
 * blends every clock frame, a procedural @time channel writes, or a publish uploads), applies
 * each endpoint's attachment and frame chain, and writes the connector's own start / end
 * (previous / next for a Line) and endpointOffset buffers in place. The connector's material
 * bindings never change: the pass writes into the buffers its shader already reads.
 *
 * Tier 1 (connectionPrepare.js, jax) decides WHAT connects (matching, attachments, layout) and
 * draws it at rest; this pass only follows WHERE the endpoints are:
 *   - after each Tier 1 publish (inside the connector's upload chain, so an endpoint that is
 *     mid-animation never shows the connector at its target first),
 *   - when an endpoint's frame chain changes (range / bounds sliders): a two-slot queue (one
 *     dispatch on the GPU, one dirty bit) instead of a Tier 1 re-preparation,
 *   - on the View clock right after the moved endpoints' blend step (the same time stamp) and
 *     after a procedural endpoint's step (AnimationClock.run / namedMark proceduralStep call
 *     `mark.connectionFollowers`),
 *   - when a 3D world-size placement matrix moves (polled once per frame, host only).
 * Every dispatch is skipped (the previous geometry stays) while an endpoint has published rows
 * the current Tier 1 result has not matched yet, or its uploads are still in flight: no stale
 * endpoint combinations are ever drawn.
 *
 * Two pipelines per device, created once (explicit layouts); frame parameters travel in a
 * uniform buffer rewritten only when they change, so sliders never compile a program. Nothing
 * here reads GPU memory back.
 *
 * The pure parts (parameter packing, the frame-stage table, CPU references of both kernels)
 * are exported for node tests; the kernel and the references read the packed bytes the same way.
 */
import { frameDimensionStages, FRAME_DIMENSIONS } from "./frameMapping.js";
import { resolveCoordinateOperations } from "./coordinateOperations.js";
import { LIMITS, limitError } from "./limits.js";
import { operationTableWgsl, packOperationTable, operationTablePoint,
  OPERATION_LIMIT } from "./operationTable.js";
import { scaleTransformWgsl, transformCode, transformClamped, transformName, inTransformDomain,
  DEFAULT_TRANSFORM_CONSTANT } from "./scaleTransforms.js";

/** Frame stages per axis the kernel holds (frameDimensionStages allows at most 16). */
export const GATHER_STAGES = LIMITS.coordinateStages.value;
/** Byte offsets of the vertex pass's uniform block (WGSL struct `P` below; 16-byte aligned). */
export const VERTEX_PARAMS_LAYOUT = Object.freeze({
  counts: 0, // vec4u: rows (connections), vertex stride, vertex base, flags
  fields: 16, // vec4u: field 0 stride (floats), field 1 stride, field 0 components, field 1 components
  axes: 32, // vec4u: stage counts x, y, z, fraction axis (3: none)
  offset: 48, // vec4f: constant pixel offset x, y (when the endpoint has no offset buffer), NaN (the missing value)
  weight0: 64, // vec4f: per-component weights of field 0
  weight1: 80, // vec4f: per-component weights of field 1
  matrix: 96, // mat4x4f (column-major): endpoint placement into the connector's space
  stages: 160, // array<vec4f, 48>: stage [axis * 16 + i] = (a, d, r0, span)
  kinds: 928, // array<vec4u, 12>: transform code of stage j at [j / 4][j % 4] (utils/scaleTransforms.js)
  operationCount: 1120,
  operationKinds: 1136, // array<vec4u, 16>: kind and three kind-specific codes
  operationData: 1392, // array<vec4f, 64>: four parameter vectors per operation
  constants: 2416, // array<vec4f, 12>: symlog constant of stage j at [j / 4][j % 4]
});
export const VERTEX_PARAMS_BYTES = 2608;
const OPERATION_OFFSETS = Object.freeze({ count: VERTEX_PARAMS_LAYOUT.operationCount / 4,
  kinds: VERTEX_PARAMS_LAYOUT.operationKinds / 4, data: VERTEX_PARAMS_LAYOUT.operationData / 4 });
/** Link pass uniform: vec4u (rows, slots, layout 0 pairs / 1 path, flags), vec4f (NaN: the missing value). */
export const LINK_PARAMS_BYTES = 32;
/** Vertex-pass flags. */
export const GATHER_FLAGS = Object.freeze({ field1: 1, dxBuffer: 2, dyBuffer: 4, fraction: 8, matrix: 16, operations: 32 });
/** Link-pass flags. */
export const LINK_FLAGS = Object.freeze({ offsets: 1, connected: 2 });
// Field names the pass writes. (Kept out of literal `get("...")` calls: the Python API generator
// reads those as component options.)
const OFFSET_FIELD = "endpointOffset";
const WRITTEN_FIELDS = ["start", "end", "previous", "next", OFFSET_FIELD];
const NO_AXIS = 3;

const VERTEX_WGSL = /* wgsl */ `
struct P {
  counts: vec4u, fields: vec4u, axes: vec4u, offset: vec4f, weight0: vec4f, weight1: vec4f,
  matrix: mat4x4f, stages: array<vec4f, 48>, kinds: array<vec4u, 12>,
  operationCount: vec4u, operationKinds: array<vec4u, 16>, operationData: array<vec4f, 64>,
  constants: array<vec4f, 12>,
}
@group(0) @binding(0) var<storage, read> src0: array<f32>;
@group(0) @binding(1) var<storage, read> src1: array<f32>;
@group(0) @binding(2) var<storage, read> offx: array<f32>;
@group(0) @binding(3) var<storage, read> offy: array<f32>;
@group(0) @binding(4) var<storage, read> frac: array<f32>;
@group(0) @binding(5) var<storage, read> rows: array<i32>;
@group(0) @binding(6) var<storage, read_write> vertices: array<vec4f>;
@group(0) @binding(7) var<uniform> p: P;
fn finite(x: f32) -> bool { return abs(x) <= 3.402823e38; }
// NaN comes from the uniform: a constant NaN is a shader-creation error in WGSL.
fn missing() -> f32 { return p.offset.z; }
${scaleTransformWgsl("gather")}fn component(buffer: u32, row: u32, c: u32) -> f32 {
  if (buffer == 0u) { if (c >= p.fields.z) { return 0.; } return src0[row * p.fields.x + c]; }
  if (c >= p.fields.w) { return 0.; }
  return src1[row * p.fields.y + c];
}
fn chain(value: f32, axis: u32) -> f32 {
  var x = value;
  for (var i = 0u; i < p.axes[axis]; i++) {
    let j = axis * 16u + i;
    let s = p.stages[j];
    let k = p.kinds[j / 4u][j % 4u];
    // Outside the transform's domain the endpoint is missing (TODO 39.1).
    if (!gatherValid(x, k)) { return missing(); }
    x = (gatherForward(x, k, p.constants[j / 4u][j % 4u]) - s.x) / s.y * s.w + s.z;
  }
  return x;
}
${operationTableWgsl({ count: "p.operationCount.x", kinds: "p.operationKinds", data: "p.operationData" })}
fn operationChain(input: vec3f) -> vec3f {
  let mapped = operationPoint(input, 0u);
  if (!mapped.valid) { return vec3f(missing()); }
  return mapped.point;
}
@compute @workgroup_size(64) fn vertex(@builtin(global_invocation_id) id: vec3u) {
  let c = id.x;
  if (c >= p.counts.x) { return; }
  let out = (c * p.counts.y + p.counts.z) * 2u;
  let flags = p.counts.w;
  let row = rows[c];
  var point = vec3f(missing(), missing(), missing());
  var shift = vec2f(0., 0.);
  if (row >= 0) {
    let r = u32(row);
    var sum = vec3f(0., 0., 0.);
    var valid = true;
    for (var k = 0u; k < 3u; k++) {
      var v = p.weight0[k] * component(0u, r, k);
      if ((flags & 1u) != 0u) { v = v + p.weight1[k] * component(1u, r, k); }
      if ((flags & 8u) != 0u && k == p.axes.w) { v = mix(component(0u, r, k), component(1u, r, k), frac[r]); }
      valid = valid && finite(v);
      sum[k] = v;
    }
    if (valid) {
      var mapped = vec3f(chain(sum.x, 0u), chain(sum.y, 1u), chain(sum.z, 2u));
      if ((flags & 32u) != 0u) { mapped = operationChain(sum); }
      if ((flags & 16u) != 0u) { mapped = (p.matrix * vec4f(mapped, 1.)).xyz; }
      if (finite(mapped.x) && finite(mapped.y) && finite(mapped.z)) { point = mapped; }
    }
    shift = vec2f(select(p.offset.x, offx[r], (flags & 2u) != 0u), select(p.offset.y, offy[r], (flags & 4u) != 0u));
  }
  vertices[out] = vec4f(point, 0.);
  vertices[out + 1u] = vec4f(shift, 0., 0.);
}
`;
const LINK_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> vertices: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> startOut: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> endOut: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> previousOut: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> nextOut: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> offsetOut: array<vec4f>;
struct L { counts: vec4u, missing: vec4f }
@group(0) @binding(6) var<uniform> link: L;
fn missing() -> f32 { return link.missing.x; }
fn separator(v: u32) -> bool { let l = link.counts; return l.z == 1u && v % (l.y + 1u) == l.y; }
fn point(v: u32) -> vec4f {
  if (separator(v)) { return vec4f(missing(), missing(), missing(), 0.); }
  return vec4f(vertices[v * 2u].xyz, 0.);
}
fn shift(v: u32) -> vec2f {
  if (separator(v)) { return vec2f(0., 0.); }
  return vertices[v * 2u + 1u].xy;
}
@compute @workgroup_size(64) fn links(@builtin(global_invocation_id) id: vec3u) {
  let l = link.counts;
  let r = id.x;
  if (r >= l.x) { return; }
  var a = r;
  if (l.z == 0u) { a = (r / (l.y - 1u)) * l.y + r % (l.y - 1u); }
  let b = a + 1u;
  startOut[r] = point(a);
  endOut[r] = point(b);
  if ((l.w & 2u) != 0u) {
    let n = l.x + 1u;
    previousOut[r] = point(select(r - 1u, 0u, r == 0u));
    nextOut[r] = point(select(n - 1u, r + 2u, r + 2u < n));
  }
  if ((l.w & 1u) != 0u) { offsetOut[r] = vec4f(shift(a), shift(b)); }
}
`;
export const GATHER_VERTEX_SOURCE = VERTEX_WGSL;
export const GATHER_LINK_SOURCE = LINK_WGSL;

// ---------------------------------------------------------------------------------------
// Pure parts: frame stages, packing, layouts, CPU references
// ---------------------------------------------------------------------------------------
/**
 * The frame chain of `options` per axis as the kernel's stage table: `{kind, a, d, r0, span,
 * constant}` (kind a transform code, constant symlog's c)
 * with `a = f(bounds0)`, `d = f(bounds1) - f(bounds0)` (at least 1e-8 in magnitude), so a stage
 * maps `x` to `(f(x) - a) / d * span + r0`: exactly transformArray (utils/data.js), which the
 * Tier 1 gather applies. Null while a stage has no bounds or range yet.
 */
export function frameStageParams(options) {
  const out = [];
  for (const axis of FRAME_DIMENSIONS) {
    const stages = [];
    for (const { source, rangeKey } of frameDimensionStages(options, axis)) {
      const bounds = source.get(axis + "bounds"), range = source.get(rangeKey);
      if (!Array.isArray(bounds) || !Array.isArray(range)) return null;
      const name = source.get(axis + "Transform") ?? "linear", kind = transformCode(name),
        constant = source.get(axis + "TransformConstant") ?? DEFAULT_TRANSFORM_CONSTANT;
      const a = transformClamped(name, bounds[0], constant), den = transformClamped(name, bounds[1], constant) - a;
      stages.push({ kind, a, d: Math.abs(den) < 1e-8 ? 1e-8 : den, r0: range[0], span: range[1] - range[0], constant });
    }
    if (stages.length > GATHER_STAGES) throw limitError("coordinateStages", { what: `a coordinate mapping's nonlinear scales on ${axis}`, count: stages.length });
    out.push(stages);
  }
  return out;
}

/**
 * Pack one slot's vertex-pass uniform block. `fields`: 0-2 of `{stride, components, weights}`
 * (a removed endpoint has none: every row reads missing); `fraction`: `{axis}` when the slot
 * mixes field 0 and field 1 on that axis by a per-row fraction buffer (Bar value ends, BoxPlot
 * medians); `offsets.x/y`: a number (constant pixel offset) or "buffer"; `matrix`: 16 numbers
 * (column-major) or null; `stages`: frameStageParams(). Returns an ArrayBuffer of
 * VERTEX_PARAMS_BYTES.
 */
export function packVertexParams({ rows = 0, vertexStride = 1, vertexBase = 0, fields = [], fraction = null,
  offsets = {}, matrix = null, stages = [[], [], []], operations = null } = {}) {
  const L = VERTEX_PARAMS_LAYOUT;
  const raw = new ArrayBuffer(VERTEX_PARAMS_BYTES), u = new Uint32Array(raw), f = new Float32Array(raw);
  const dx = offsets.x ?? 0, dy = offsets.y ?? 0;
  const flags = (fields.length > 1 ? GATHER_FLAGS.field1 : 0) |
    (dx === "buffer" ? GATHER_FLAGS.dxBuffer : 0) | (dy === "buffer" ? GATHER_FLAGS.dyBuffer : 0) |
    (fraction && fields.length > 1 ? GATHER_FLAGS.fraction : 0) | (matrix ? GATHER_FLAGS.matrix : 0) |
    (operations ? GATHER_FLAGS.operations : 0);
  u.set([rows, vertexStride, vertexBase, flags], L.counts / 4);
  u.set([fields[0]?.stride ?? 0, fields[1]?.stride ?? 0, fields[0]?.components ?? 0, fields[1]?.components ?? 0], L.fields / 4);
  u.set([...stages.map((list) => list.length), fraction && fields.length > 1 ? fraction.axis : NO_AXIS], L.axes / 4);
  f.set([typeof dx === "number" ? dx : 0, typeof dy === "number" ? dy : 0, NaN, 0], L.offset / 4);
  f.set([...(fields[0]?.weights ?? [0, 0, 0]), 0], L.weight0 / 4);
  f.set([...(fields[1]?.weights ?? [0, 0, 0]), 0], L.weight1 / 4);
  f.set(matrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], L.matrix / 4);
  stages.forEach((list, axis) => list.forEach((stage, i) => {
    const j = axis * GATHER_STAGES + i;
    f.set([stage.a, stage.d, stage.r0, stage.span], L.stages / 4 + j * 4);
    u[L.kinds / 4 + j] = stage.kind;
    f[L.constants / 4 + j] = stage.constant ?? DEFAULT_TRANSFORM_CONSTANT;
  }));
  if (operations) packOperationTable(operations, u, f, OPERATION_OFFSETS);
  return raw;
}
/** Pack the link-pass uniform: `layout` "pairs" or "path". */
export function packLinkParams({ rows = 0, slots = 0, layout = "pairs", offsets = false, connected = false } = {}) {
  const raw = new ArrayBuffer(LINK_PARAMS_BYTES);
  new Uint32Array(raw).set([rows, slots, layout === "path" ? 1 : 0,
    (offsets ? LINK_FLAGS.offsets : 0) | (connected ? LINK_FLAGS.connected : 0)]);
  new Float32Array(raw).set([NaN, 0, 0, 0], 4);
  return raw;
}
/**
 * Where slot `s`'s connection rows land in the vertex scratch, and how many consumer rows the
 * link pass writes: pairs (Segments family) `vertex = c * S + s`, `rows = C * (S - 1)`; path
 * (Line) `vertex = c * (S + 1) + s` with a separator after each connection, `rows` = segments
 * = `C * (S + 1) - 2` (the vertex count minus one; the last separator is not drawn).
 */
export function gatherLayout(kind, connections, slots) {
  const C = Math.max(0, connections), S = Math.max(0, slots);
  if (kind === "path") return { vertexStride: S + 1, vertices: C * (S + 1), rows: C && S ? Math.max(0, C * (S + 1) - 2) : 0 };
  return { vertexStride: S, vertices: C * S, rows: S > 1 ? C * (S - 1) : 0 };
}

const NAN = Number.NaN;
function packedOperationPoint(input, u, f) {
  const mapped = operationTablePoint(input, u, f, OPERATION_OFFSETS);
  return mapped.valid ? mapped.point : [NAN, NAN, NAN];
}
/**
 * CPU reference of the vertex kernel: reads the packed params exactly as the WGSL does.
 * `buffers`: {src0, src1, offx, offy, frac: Float32Array, rows: Int32Array}; writes into
 * `vertices` (Float32Array, 8 floats per vertex: point xyz 0, shift xy 0 0) and returns it.
 */
export function vertexReference(params, { src0, src1, offx, offy, frac, rows }, vertices) {
  const L = VERTEX_PARAMS_LAYOUT, u = new Uint32Array(params), f = new Float32Array(params);
  const [count, stride, base, flags] = u.subarray(L.counts / 4, L.counts / 4 + 4);
  const [stride0, stride1, comps0, comps1] = u.subarray(L.fields / 4, L.fields / 4 + 4);
  const axes = u.subarray(L.axes / 4, L.axes / 4 + 4);
  const w0 = f.subarray(L.weight0 / 4, L.weight0 / 4 + 3), w1 = f.subarray(L.weight1 / 4, L.weight1 / 4 + 3);
  const m = f.subarray(L.matrix / 4, L.matrix / 4 + 16), constant = f.subarray(L.offset / 4, L.offset / 4 + 2);
  const component = (buffer, r, k) => buffer === 0 ? (k >= comps0 ? 0 : src0[r * stride0 + k]) : (k >= comps1 ? 0 : src1[r * stride1 + k]);
  const chain = (value, axis) => {
    let x = value;
    for (let i = 0; i < axes[axis]; i++) {
      const j = axis * GATHER_STAGES + i, s = L.stages / 4 + j * 4, name = transformName(u[L.kinds / 4 + j]);
      if (!inTransformDomain(name, x)) return NAN;
      x = (transformClamped(name, x, f[L.constants / 4 + j]) - f[s]) / f[s + 1] * f[s + 3] + f[s + 2];
    }
    return x;
  };
  for (let c = 0; c < count; c++) {
    const out = (c * stride + base) * 8, row = rows[c];
    let point = [NAN, NAN, NAN], shift = [0, 0];
    if (row >= 0) {
      const sum = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        let v = w0[k] * component(0, row, k);
        if (flags & GATHER_FLAGS.field1) v += w1[k] * component(1, row, k);
        if (flags & GATHER_FLAGS.fraction && k === axes[3]) {
          const a = component(0, row, k), b = component(1, row, k);
          v = a + (b - a) * frac[row];
        }
        sum[k] = v;
      }
      if (sum.every(Number.isFinite)) {
        let mapped = flags & GATHER_FLAGS.operations
          ? packedOperationPoint(sum, u, f) : sum.map((v, axis) => chain(v, axis));
        if (flags & GATHER_FLAGS.matrix) {
          const [x, y, z] = mapped;
          mapped = [0, 1, 2].map((i) => m[i] * x + m[4 + i] * y + m[8 + i] * z + m[12 + i]);
        }
        if (mapped.every(Number.isFinite)) point = mapped;
      }
      shift = [flags & GATHER_FLAGS.dxBuffer ? offx[row] : constant[0], flags & GATHER_FLAGS.dyBuffer ? offy[row] : constant[1]];
    }
    vertices.set([...point, 0, ...shift, 0, 0], out);
  }
  return vertices;
}
/**
 * CPU reference of the link kernel: `{start, end, previous, next, offset}` Float32Arrays of
 * vec4 rows from the vertex scratch (the Tier 1 layouts of connectionPrepare / lineArrays).
 */
export function linkReference(params, vertices) {
  const [rows, slots, path, flags] = new Uint32Array(params, 0, 4);
  const separator = (v) => path === 1 && v % (slots + 1) === slots;
  const point = (v) => (separator(v) ? [NAN, NAN, NAN, 0] : [...vertices.subarray(v * 8, v * 8 + 3), 0]);
  const shift = (v) => (separator(v) ? [0, 0] : [...vertices.subarray(v * 8 + 4, v * 8 + 6)]);
  const out = Object.fromEntries(["start", "end", "previous", "next", "offset"].map((k) => [k, new Float32Array(rows * 4)]));
  for (let r = 0; r < rows; r++) {
    const a = path === 1 ? r : Math.floor(r / (slots - 1)) * slots + r % (slots - 1), b = a + 1;
    out.start.set(point(a), r * 4);
    out.end.set(point(b), r * 4);
    if (flags & LINK_FLAGS.connected) {
      const n = rows + 1;
      out.previous.set(point(r === 0 ? 0 : r - 1), r * 4);
      out.next.set(point(r + 2 < n ? r + 2 : n - 1), r * 4);
    }
    if (flags & LINK_FLAGS.offsets) out.offset.set([...shift(a), ...shift(b)], r * 4);
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// GPU: pipelines (once per device), the per-connector live gather
// ---------------------------------------------------------------------------------------
const devices = new WeakMap();
function gatherPipelines(device) {
  let entry = devices.get(device);
  if (entry) return entry;
  const layout = (types) => device.createBindGroupLayout({
    entries: types.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
  });
  const read = "read-only-storage", write = "storage";
  const vertexLayout = layout([read, read, read, read, read, read, write, "uniform"]);
  const linkLayout = layout([read, write, write, write, write, write, "uniform"]);
  const pipeline = (bindGroupLayout, code, entryPoint) => device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: { module: device.createShaderModule({ code }), entryPoint },
  });
  entry = {
    vertexLayout, linkLayout,
    vertex: pipeline(vertexLayout, VERTEX_WGSL, "vertex"),
    links: pipeline(linkLayout, LINK_WGSL, "links"),
  };
  devices.set(device, entry);
  return entry;
}
const STORAGE = () => GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
/** The GPUBuffer behind a mark field, or null (not uploaded, or a uniform value). */
function fieldBuffer(renderer, field) {
  if (!field?.isBufferNode || !field.bufferNodeSource) return null;
  return renderer.backend.get(field.bufferNodeSource)?.buffer ?? null;
}
/** A 3D world-size placement matrix, as plain numbers (column-major), or null. */
const matrixValues = (matrix) => (matrix ? Array.from(matrix.elements ?? matrix) : null);
const sameList = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * The live gather of one connection-backed mark (`mark`: its Segments/Arrows/Line object).
 * `configure(result)` takes a Tier 1 result (its `live` description) and must run inside the
 * mark's upload chain after that result's fields were written; `dispatch()` is synchronous
 * (encode + submit) and returns whether it wrote; `schedule()` is the bounded queue for
 * frame changes; `follow` is the clock follower registered on every endpoint mark.
 */
export function createLiveGather(mark, { report = (error) => console.error("connections:", error) } = {}) {
  const renderer = mark.renderer, device = renderer.backend.device;
  const counters = { dispatches: 0, skipped: 0, configures: 0, reasons: {} };
  let config = null, disposed = false, running = false, dirty = false, retry = null;
  const followed = new Set();
  const retired = [];
  const dummies = [0, 1, 2, 3].map(() => device.createBuffer({ size: 16, usage: STORAGE() }));

  const release = (buffers) => {
    const list = buffers.filter(Boolean);
    if (list.length) device.queue.onSubmittedWorkDone().then(() => list.forEach((buffer) => buffer.destroy()));
  };
  const skip = (reason) => {
    counters.skipped++;
    counters.reasons[reason] = (counters.reasons[reason] ?? 0) + 1;
    return false;
  };
  function follow() {
    try { gather.dispatch(); } catch (error) { report(error); }
  }
  function syncFollowers(marks) {
    for (const endpoint of followed) if (!marks.has(endpoint)) { endpoint.connectionFollowers?.delete(follow); followed.delete(endpoint); }
    for (const endpoint of marks) if (!followed.has(endpoint)) {
      (endpoint.connectionFollowers ??= new Set()).add(follow);
      followed.add(endpoint);
    }
  }
  /** Whether the connector draws the layout this pass writes (basis curves and surfaces re-sample rows). */
  function supported(live) {
    if (!live || mark.isDisposed) return false;
    if (live.layout === "path") return !!mark.isConnectedPath && !mark.surface && mark.options?.get?.("curve") !== "basis";
    return true;
  }
  /** The target buffers for this result, or null while the connector's fields do not hold it yet. */
  function targets() {
    const { live } = config;
    const names = live.layout === "path" ? ["start", "end", "previous", "next"] : ["start", "end"];
    const out = [];
    for (const name of names) {
      const field = mark.fields.get(name), buffer = fieldBuffer(renderer, field);
      if (!buffer || field.count !== config.rows) return null;
      out.push(buffer);
    }
    while (out.length < 4) out.push(dummies[out.length - 1]);
    if (live.offsets) {
      const field = mark.fields.get(OFFSET_FIELD), buffer = fieldBuffer(renderer, field);
      if (!buffer || field.count !== config.rows || !mark.endpointOffsetActive) return null;
      out.push(buffer);
    } else out.push(dummies[3]);
    return out;
  }
  /** Slot sources and parameters now; null when the endpoint does not show the matched rows. */
  function slotState(slot) {
    const { entry } = slot;
    if (!entry) return { buffers: [dummies[0], dummies[0], dummies[0], dummies[0], dummies[0]], params: { fields: [] } };
    const endpoint = entry.mark;
    if (!endpoint || endpoint.isDisposed) return "disposed";
    if (entry.revision?.data !== slot.revision) return "revision";
    if (endpoint.manager?.pendingUpdates) return "uploading";
    const buffers = [], fields = [];
    for (const { name, weights, components } of slot.fields) {
      const field = endpoint.fields.get(name), buffer = fieldBuffer(renderer, field);
      if (!buffer || !(field.count > slot.maxRow)) return "fields";
      buffers.push(buffer);
      fields.push({ stride: field.bufferNodeSource.itemSize, components, weights });
    }
    if (!buffers.length) return "fields";
    if (buffers.length < 2) buffers.push(buffers[0]);
    const offsets = {};
    for (const [axis, name] of [["x", "dx"], ["y", "dy"]]) {
      if (!slot.offsets) { offsets[axis] = 0; buffers.push(dummies[0]); continue; }
      const field = endpoint.fields.get(name), buffer = fieldBuffer(renderer, field);
      if (buffer && field.count > slot.maxRow) { offsets[axis] = "buffer"; buffers.push(buffer); }
      else {
        const value = Number(field?.uniformNode?.value ?? 0);
        offsets[axis] = Number.isFinite(value) ? value : 0;
        buffers.push(dummies[0]);
      }
    }
    buffers.push(slot.fractionBuffer ?? dummies[0]);
    let operations;
    // A connector on a globe stops at the globe's own operation (connectionPrepare globeOperations).
    try { operations = slot.operations ?? resolveCoordinateOperations(entry.options, { includePlacement: false }); }
    catch (error) {
      if (/requires finite bounds and range/.test(error.message)) return "frame";
      throw error;
    }
    const matrix = slot.matrix ? matrixValues(slot.matrix()) : null;
    return { buffers, params: { fields, offsets, operations, matrix,
      fraction: slot.fractionBuffer ? { axis: slot.fractionAxis } : null } };
  }

  const gather = {
    counters,
    follow,
    get configured() { return !!config; },
    /** Whether any slot's endpoint sits in a placed (3D world-size) frame whose matrix may move. */
    get placed() { return !!config?.slots.some((slot) => slot.matrix); },
    /**
     * Take a Tier 1 result. Runs in the connector's upload chain after the result's fields were
     * written (so rows line up); uploads the matched rows (host Int32Array, once per result) and
     * copies per-row fractions GPU to GPU.
     */
    async configure(result) {
      if (disposed) return;
      const live = result?.live;
      const old = config;
      config = null;
      if (old) release([...old.slots.flatMap((slot) => [slot.rowsBuffer, slot.fractionBuffer, slot.paramsBuffer]), old.vertexBuffer, old.linkBuffer]);
      if (!supported(live)) { syncFollowers(new Set()); return; }
      counters.configures++;
      const { vertexStride, vertices, rows } = gatherLayout(live.layout, live.connections, live.slots.length);
      const next = {
        live, rows, vertexStride, result,
        vertexBuffer: device.createBuffer({ size: Math.max(32, vertices * 32), usage: STORAGE() }),
        linkBuffer: device.createBuffer({ size: LINK_PARAMS_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
        slots: [],
      };
      device.queue.writeBuffer(next.linkBuffer, 0, packLinkParams({
        rows, slots: live.slots.length, layout: live.layout, offsets: !!live.offsets, connected: live.layout === "path",
      }));
      try {
        for (const [s, spec] of live.slots.entries()) {
          const slot = { ...spec, vertexBase: s, key: null, bound: null, group: null };
          slot.rowsBuffer = device.createBuffer({ size: Math.max(16, spec.rows.byteLength), usage: STORAGE() });
          device.queue.writeBuffer(slot.rowsBuffer, 0, spec.rows);
          slot.paramsBuffer = device.createBuffer({ size: VERTEX_PARAMS_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
          if (spec.fraction) {
            const count = spec.fraction.shape[0];
            slot.fractionBuffer = device.createBuffer({ size: Math.max(16, count * 4), usage: STORAGE() });
            if (count) {
              const held = spec.fraction.ref;
              try {
                const source = await held.ref.gpuBuffer();
                const encoder = device.createCommandEncoder();
                encoder.copyBufferToBuffer(source, 0, slot.fractionBuffer, 0, count * 4);
                device.queue.submit([encoder.finish()]);
              } finally { held.dispose(); }
            }
          }
          next.slots.push(slot);
        }
      } catch (error) {
        release([...next.slots.flatMap((slot) => [slot.rowsBuffer, slot.fractionBuffer, slot.paramsBuffer]), next.vertexBuffer, next.linkBuffer]);
        throw error;
      }
      if (disposed) {
        release([...next.slots.flatMap((slot) => [slot.rowsBuffer, slot.fractionBuffer, slot.paramsBuffer]), next.vertexBuffer, next.linkBuffer]);
        return;
      }
      config = next;
      syncFollowers(new Set(live.slots.map((slot) => slot.entry?.mark).filter(Boolean)));
    },
    /** Encode and submit one gather now. Returns whether it wrote the connector's buffers. */
    dispatch() {
      if (disposed || !config) return false;
      if (mark.isDisposed) return skip("disposed");
      if (!config.rows) return skip("empty");
      const out = targets();
      if (!out) return skip("targets");
      const states = [];
      for (const slot of config.slots) {
        const state = slotState(slot);
        if (typeof state === "string") {
          // An endpoint's rows are still uploading: try again once they landed.
          if (state === "uploading" && !retry) {
            retry = slot.entry.mark.manager.chain.then(() => { retry = null; gather.schedule(); });
          }
          return skip(state);
        }
        states.push(state);
      }
      const { vertex, links, vertexLayout, linkLayout } = gatherPipelines(device);
      const connections = config.live.connections;
      const encoder = device.createCommandEncoder();
      config.slots.forEach((slot, s) => {
        const { buffers, params } = states[s];
        const packed = packVertexParams({ rows: connections, vertexStride: config.vertexStride, vertexBase: slot.vertexBase, ...params });
        const bytes = new Uint32Array(packed);
        if (!slot.key || !sameList(slot.key, bytes)) {
          device.queue.writeBuffer(slot.paramsBuffer, 0, packed);
          slot.key = bytes;
        }
        if (!slot.group || !sameList(slot.bound, buffers)) {
          slot.bound = buffers;
          slot.group = device.createBindGroup({
            layout: vertexLayout,
            entries: [...buffers, slot.rowsBuffer, config.vertexBuffer, slot.paramsBuffer]
              .map((buffer, binding) => ({ binding, resource: { buffer } })),
          });
        }
        if (!connections) return;
        const pass = encoder.beginComputePass();
        pass.setPipeline(vertex);
        pass.setBindGroup(0, slot.group);
        pass.dispatchWorkgroups(Math.ceil(connections / 64));
        pass.end();
      });
      if (!config.linkGroup || !sameList(config.linkBound, out)) {
        config.linkBound = out;
        config.linkGroup = device.createBindGroup({
          layout: linkLayout,
          entries: [config.vertexBuffer, ...out, config.linkBuffer].map((buffer, binding) => ({ binding, resource: { buffer } })),
        });
      }
      const pass = encoder.beginComputePass();
      pass.setPipeline(links);
      pass.setBindGroup(0, config.linkGroup);
      pass.dispatchWorkgroups(Math.ceil(config.rows / 64));
      pass.end();
      device.queue.submit([encoder.finish()]);
      counters.dispatches++;
      if (mark.view) mark.view.diagnostics.counters.connectionGathers++;
      // Curved paths re-tessellate from the new rows, and a dashed Line measures them again
      // (utils/dashDistances.js).
      for (const name of WRITTEN_FIELDS) {
        const field = mark.fields.get(name);
        if (field) field.animationVersion = (field.animationVersion ?? 0) + 1;
      }
      mark.invalidate();
      return true;
    },
    /**
     * The bounded queue for frame changes: at most one dispatch on the GPU and one dirty bit,
     * so a slider moved every frame never queues more than the latest state.
     */
    schedule() {
      if (disposed || !config) return false;
      dirty = true;
      if (running) return true;
      running = true;
      queueMicrotask(async () => {
        try {
          while (dirty && !disposed) {
            dirty = false;
            const wrote = gather.dispatch();
            if (wrote) await device.queue.onSubmittedWorkDone();
          }
        } catch (error) { report(error); } finally { running = false; }
      });
      return true;
    },
    /**
     * An endpoint's frame chain changed. "live": followed here completely; "rest": followed here,
     * but the connector also derives rows from positions on the host (curve controls), so Tier 1
     * should re-run once the frame is still; false: not followed (Tier 1 now).
     */
    frameChanged() {
      if (!config || !supported(config.live) || !gather.schedule()) return false;
      const curve = mark.options?.get?.("curve") ?? "linear";
      return curve === "linear" || curve.startsWith("step") ? "live" : "rest";
    },
    /** Per-frame (host only): a placed endpoint's matrix moved since the last dispatch. */
    checkPlacements() {
      if (!config || running) return;
      for (const slot of config.slots) {
        if (!slot.matrix || !slot.key) continue;
        const values = matrixValues(slot.matrix());
        const packed = new Float32Array(slot.key.buffer, VERTEX_PARAMS_LAYOUT.matrix, 16);
        if (values && values.some((value, i) => Math.fround(value) !== packed[i])) { gather.schedule(); return; }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      syncFollowers(new Set());
      const old = config;
      config = null;
      if (old) release([...old.slots.flatMap((slot) => [slot.rowsBuffer, slot.fractionBuffer, slot.paramsBuffer]), old.vertexBuffer, old.linkBuffer]);
      release([...dummies, ...retired]);
    },
  };
  return gather;
}
