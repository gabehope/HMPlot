// The live connection gather (Stage 15 chunk C): uniform packing and its byte layout against
// the WGSL struct, the frame-stage table, and CPU references of both kernels checked against
// the Tier 1 (jax) gather they must agree with at rest.
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np } from "@hmplot/jax";
import { Matrix4 } from "three/webgpu";
import {
  GATHER_VERTEX_SOURCE, GATHER_LINK_SOURCE, GATHER_STAGES, GATHER_FLAGS, LINK_FLAGS,
  VERTEX_PARAMS_LAYOUT, VERTEX_PARAMS_BYTES, LINK_PARAMS_BYTES,
  frameStageParams, packVertexParams, packLinkParams, gatherLayout, vertexReference, linkReference,
} from "../../src/lib/plot/utils/connectionGather.js";
import {
  evaluateAttachment, compoundAttachment, worldPoints, placementTransform,
} from "../../src/lib/plot/utils/connectionPrepare.js";
import { lineArrays, transformArray } from "../../src/lib/plot/utils/data.js";
import { frameDimensionStages } from "../../src/lib/plot/utils/frameMapping.js";
import { ATTACHMENTS, anchoredFrameError, billboardFrameError } from "../../src/lib/plot/utils/connections.js";

const near = (a, b, label = "", tolerance = 1e-3) =>
  assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)) || (Number.isNaN(a) && Number.isNaN(b)), `${label}: ${a} != ${b}`);
const rows = async (array) => {
  const data = Array.from(await array.ref.data()), width = array.shape[1] ?? 1;
  return Array.from({ length: array.shape[0] }, (_, i) => data.slice(i * width, (i + 1) * width));
};
// rows() borrows; ownedRows() reads an array the test owns (evaluateAttachment's, worldPoints') and releases it.
const ownedRows = async (array) => {
  const out = await rows(array);
  array.dispose();
  return out;
};

// WGSL uniform layout of a struct made of vec4 / mat4x4 / array<vec4, n> members (all 16-byte aligned).
function wgslLayout(source, name) {
  const body = new RegExp(`struct ${name}\\s*\\{([^}]*)\\}`).exec(source)[1];
  const sizes = { vec4u: 16, vec4f: 16, mat4x4f: 64 };
  const members = [...body.matchAll(/(\w+)\s*:\s*(array<\w+,\s*\d+>|\w+)/g)].map(([, field, type]) => {
    const array = /^array<(\w+),\s*(\d+)>$/.exec(type);
    return { field, size: array ? sizes[array[1]] * Number(array[2]) : sizes[type] };
  });
  let offset = 0;
  const offsets = {};
  for (const { field, size } of members) { assert.ok(size, `${field}: unknown type`); offsets[field] = offset; offset += size; }
  return { offsets, size: offset };
}

test("the packed uniform layout matches the WGSL struct byte for byte", () => {
  const { offsets, size } = wgslLayout(GATHER_VERTEX_SOURCE, "P");
  assert.deepEqual(offsets, { ...VERTEX_PARAMS_LAYOUT });
  assert.equal(size, VERTEX_PARAMS_BYTES);
  assert.equal(VERTEX_PARAMS_BYTES % 16, 0);
  // 48 stages = 3 axes x GATHER_STAGES, kinds packed four per vec4u.
  assert.match(GATHER_VERTEX_SOURCE, new RegExp(`stages: array<vec4f, ${3 * GATHER_STAGES}>`));
  assert.match(GATHER_VERTEX_SOURCE, new RegExp(`kinds: array<vec4u, ${(3 * GATHER_STAGES) / 4}>`));
  assert.deepEqual(wgslLayout(GATHER_LINK_SOURCE, "L"), { offsets: { counts: 0, missing: 16 }, size: LINK_PARAMS_BYTES });
  // NaN (a missing endpoint) comes from the uniforms: a constant NaN would not compile.
  for (const source of [GATHER_VERTEX_SOURCE, GATHER_LINK_SOURCE]) assert.doesNotMatch(source, /bitcast/);
  // No frame numbers are baked into the programs (they would recompile on every slider move).
  for (const source of [GATHER_VERTEX_SOURCE, GATHER_LINK_SOURCE]) assert.doesNotMatch(source, /\d+\.\d+e?\d*\s*\*\s*\(/);
});

test("packVertexParams writes every member at its byte offset", () => {
  const stages = [[{ kind: 1, a: 0.5, d: 2, r0: -1, span: 3 }], [], [{ kind: 0, a: 0, d: 1, r0: 0, span: 1 }, { kind: 2, a: 1, d: 4, r0: 5, span: -6 }]];
  const raw = packVertexParams({
    rows: 7, vertexStride: 4, vertexBase: 2,
    fields: [{ stride: 4, components: 2, weights: [0.5, 1, 0] }, { stride: 4, components: 3, weights: [0.25, 0, 1] }],
    fraction: { axis: 1 }, offsets: { x: "buffer", y: 12 }, matrix: Array.from({ length: 16 }, (_, i) => i), stages,
  });
  const view = new DataView(raw), L = VERTEX_PARAMS_LAYOUT;
  const u32 = (at) => view.getUint32(at, true), f32 = (at) => view.getFloat32(at, true);
  assert.equal(raw.byteLength, VERTEX_PARAMS_BYTES);
  assert.deepEqual([0, 4, 8].map((i) => u32(L.counts + i)), [7, 4, 2]);
  assert.equal(u32(L.counts + 12), GATHER_FLAGS.field1 | GATHER_FLAGS.dxBuffer | GATHER_FLAGS.fraction | GATHER_FLAGS.matrix);
  assert.deepEqual([0, 4, 8, 12].map((i) => u32(L.fields + i)), [4, 4, 2, 3]);
  assert.deepEqual([0, 4, 8, 12].map((i) => u32(L.axes + i)), [1, 0, 2, 1]);
  assert.deepEqual([0, 4].map((i) => f32(L.offset + i)), [0, 12]);
  assert.ok(Number.isNaN(f32(L.offset + 8)), "the missing value");
  assert.deepEqual([0, 4, 8, 12].map((i) => f32(L.weight0 + i)), [0.5, 1, 0, 0]);
  assert.deepEqual([0, 4, 8, 12].map((i) => f32(L.weight1 + i)), [0.25, 0, 1, 0]);
  assert.equal(f32(L.matrix + 4 * 13), 13);
  // Stage j = axis * 16 + i: z's second stage is j = 33.
  assert.deepEqual([0, 4, 8, 12].map((i) => f32(L.stages + 33 * 16 + i)), [1, 4, 5, -6]);
  assert.deepEqual([0, 4, 8, 12].map((i) => f32(L.stages + 0 * 16 + i)), [0.5, 2, -1, 3]);
  assert.equal(u32(L.kinds + 33 * 4), 2);
  assert.equal(u32(L.kinds + 0), 1);
  // Defaults: no fields, no fraction axis (3), identity matrix, no flags.
  const empty = new DataView(packVertexParams());
  assert.equal(empty.getUint32(L.counts + 12, true), 0);
  assert.equal(empty.getUint32(L.axes + 12, true), 3);
  assert.deepEqual([0, 5, 10, 15].map((i) => empty.getFloat32(L.matrix + i * 4, true)), [1, 1, 1, 1]);
  // A fraction needs two fields; with one it is ignored.
  assert.equal(new DataView(packVertexParams({ fields: [{ stride: 4, components: 3, weights: [1, 1, 1] }], fraction: { axis: 0 } }))
    .getUint32(L.axes + 12, true), 3);
});

test("packLinkParams and gatherLayout describe both consumer layouts", () => {
  const link = packLinkParams({ rows: 6, slots: 3, layout: "path", offsets: true, connected: true });
  assert.equal(link.byteLength, LINK_PARAMS_BYTES);
  assert.deepEqual(Array.from(new Uint32Array(link, 0, 4)), [6, 3, 1, LINK_FLAGS.offsets | LINK_FLAGS.connected]);
  assert.ok(Number.isNaN(new Float32Array(link)[4]));
  assert.deepEqual(Array.from(new Uint32Array(packLinkParams({ rows: 4, slots: 3 }), 0, 4)), [4, 3, 0, 0]);
  // connect(a, b, c) over 2 connections: 2 arrows each; a Line of 2 paths with one separator.
  assert.deepEqual(gatherLayout("pairs", 2, 3), { vertexStride: 3, vertices: 6, rows: 4 });
  assert.deepEqual(gatherLayout("path", 2, 3), { vertexStride: 4, vertices: 8, rows: 6 });
  assert.deepEqual(gatherLayout("pairs", 3, 1), { vertexStride: 1, vertices: 3, rows: 0 });
  assert.deepEqual(gatherLayout("path", 0, 3).rows, 0);
});

// A child frame inside a log/sqrt parent (as in connection-prepare.test.js).
function chain({ parentX = "log", parentY = "sqrt" } = {}) {
  const parentValues = {
    xbounds: [1, 1000], xrange: [-1, 1], xTransform: parentX,
    ybounds: [1, 100], yrange: [-2, 2], yTransform: parentY,
    zbounds: [0, 1], zrange: [0, 10], zTransform: "linear",
  };
  const childValues = {
    xbounds: [0, 100], _frameXRange: [10, 100], xrange: [-0.8, 0.9], xTransform: "linear",
    ybounds: [0, 10], _frameYRange: [4, 64], yrange: [-1, 1], yTransform: "linear",
    zbounds: [0, 1], zrange: [0, 10], zTransform: "linear",
  };
  const parent = { get: (key) => parentValues[key] };
  return { get: (key) => childValues[key], frameDefinition: { parent, owns: () => true, ranges: new Set(["x", "y"]) } };
}

test("frameStageParams is transformArray's stage table, child stage first", async () => {
  const options = chain();
  const stages = frameStageParams(options);
  assert.deepEqual(stages.map((list) => list.length), [..."xyz"].map((axis) => frameDimensionStages(options, axis).length));
  assert.equal(stages[0][1].kind, 1, "the parent x stage is log");
  assert.equal(stages[1][1].kind, 2, "the parent y stage is sqrt");
  // One stage applied by hand equals transformArray on jax.
  const stage = stages[0][1];
  const input = np.array([2, 50, 999]);
  const expected = Array.from(await transformArray(input, "log", [1, 1000], [-1, 1]).data());
  [2, 50, 999].forEach((x, i) => near((Math.log(Math.max(x, 1e-6)) - stage.a) / stage.d * stage.span + stage.r0, expected[i], `x=${x}`));
  // A degenerate interval keeps a finite divisor, like transformArray.
  const flat = frameStageParams({ get: (key) => ({ xbounds: [3, 3], xrange: [0, 1], ybounds: [0, 1], yrange: [0, 1], zbounds: [0, 1], zrange: [0, 1] })[key] });
  assert.equal(flat[0][0].d, 1e-8);
  // Not ready (no bounds yet): null, the gather waits.
  assert.equal(frameStageParams({ get: () => undefined }), null);
});

/** One endpoint's live buffer as the GPU holds it: vec4 rows (xyz + pad), 2D rows padded with a z-index. */
function liveBuffer(points, zIndex = 0.25) {
  const out = new Float32Array(points.length * 4);
  points.forEach((point, i) => out.set([point[0], point[1], point.length > 2 ? point[2] : zIndex, 0], i * 4));
  return out;
}
const pointsOf = (vertices, count) => Array.from({ length: count }, (_, v) => Array.from(vertices.subarray(v * 8, v * 8 + 3)));

test("the vertex kernel's CPU reference equals the Tier 1 jax gather (attachment + chain + rows)", async () => {
  const options = chain();
  // A Rect-like endpoint: position = lower corner, extent = upper; row 2 is a hidden (NaN) box.
  const lower = [[10, 1, 0], [40, 2, 0], [NaN, NaN, NaN], [70, 5, 0]], upper = [[20, 3, 0], [60, 6, 0], [NaN, NaN, NaN], [90, 9, 0]];
  const connections = Int32Array.from([3, -1, 0, 2, 1]);
  for (const name of ["center", "left", "top"]) {
    const attachment = ATTACHMENTS.Rect.at[name];
    const fields = { position: np.array(lower), extent: np.array(upper) };
    const point = evaluateAttachment(attachment, fields, "rect");
    const world = await ownedRows(worldPoints(point, options));
    const params = packVertexParams({
      rows: connections.length, vertexStride: 1, vertexBase: 0, stages: frameStageParams(options),
      fields: attachment.fields.map(([, weights]) => ({ stride: 4, components: 3, weights })),
    });
    const vertices = vertexReference(params, { src0: liveBuffer(lower), src1: liveBuffer(upper), rows: connections }, new Float32Array(connections.length * 8));
    pointsOf(vertices, connections.length).forEach((got, c) => {
      const row = connections[c];
      const expected = row < 0 ? [NaN, NaN, NaN] : world[row];
      got.forEach((value, k) => near(value, expected[k], `${name} connection ${c} component ${k}`));
    });
    Object.values(fields).forEach((value) => value.dispose());
  }
});

test("2D rows ignore the buffer's z-index pad; offsets come from buffers or constants", async () => {
  const options = chain({ parentX: "linear", parentY: "linear" });
  const points = [[5, 2], [50, 8]];
  const position = np.array([[5, 2, 0], [50, 8, 0]]);
  const point = evaluateAttachment(ATTACHMENTS.Points.at.center, { position }, "p");
  position.dispose();
  const world = await ownedRows(worldPoints(point, options));
  const params = packVertexParams({
    rows: 2, vertexStride: 2, vertexBase: 1, stages: frameStageParams(options),
    fields: [{ stride: 4, components: 2, weights: [1, 1, 1] }], offsets: { x: "buffer", y: -3 },
  });
  const vertices = vertexReference(params, { src0: liveBuffer(points, 0.9), offx: Float32Array.from([4, 7]), rows: Int32Array.from([1, 0]) }, new Float32Array(4 * 8).fill(-99));
  // Connection c lands at vertex c * 2 + 1; vertex 0 and 2 are other slots' (untouched).
  assert.deepEqual(Array.from(vertices.subarray(0, 8)), Array(8).fill(-99));
  pointsOf(vertices, 4)[1].forEach((value, k) => near(value, world[1][k], `row 1 ${k}`));
  pointsOf(vertices, 4)[3].forEach((value, k) => near(value, world[0][k], `row 0 ${k}`));
  assert.deepEqual(Array.from(vertices.subarray(1 * 8 + 4, 1 * 8 + 6)), [7, -3]);
  assert.deepEqual(Array.from(vertices.subarray(3 * 8 + 4, 3 * 8 + 6)), [4, -3]);
});

test("compound attachments: Bar value ends and BoxPlot quartiles and median, on jax and in the kernel", async () => {
  const options = chain({ parentX: "linear", parentY: "linear" });
  // Three vertical bars: value 6 over baseline 0 (box 0..6), value -4 (box -4..0), and a bar
  // whose columns already say 0 while its box still spans 0..2.5 (animating down): its baseline
  // end stays at the baseline, the other edge from its value end.
  const lower = [[20, 0, 0], [70, -4, 0], [120, 0, 0]], upper = [[30, 6, 0], [80, 0, 0], [130, 2.5, 0]];
  const columns = { __barValue: [6, -4, 0], __barBaseline: [0, 0, 0], median: [2, -1, 1], q1: [0, -4, 0], q3: [6, 0, 2.5] };
  const entry = (compound) => ({
    compound, kind: "Prism",
    compoundSpec: { valueAxis: () => 1 },
    shown: { scope: { has: (key) => key in columns, get: (key) => columns[key] } },
  });
  const expected = { value: [6, -4, 2.5], baseline: [0, 0, 0], q1: [0, -4, 0], q3: [6, 0, 2.5], median: [2, -1, 1] };
  for (const [compound, name] of [["Bar", "value"], ["Bar", "baseline"], ["BoxPlot", "q1"], ["BoxPlot", "q3"], ["BoxPlot", "median"]]) {
    const resolved = compoundAttachment(entry(compound), ATTACHMENTS[compound].at[name], "Segments");
    const fields = { position: np.array(lower), extent: np.array(upper) };
    const point = await ownedRows(evaluateAttachment(resolved, fields, compound));
    point.forEach((p, i) => {
      near(p[1], expected[name][i], `${compound} ${name} row ${i} value axis`);
      near(p[0], (lower[i][0] + upper[i][0]) / 2, `${compound} ${name} row ${i} centered`);
    });
    const params = packVertexParams({
      rows: 3, stages: frameStageParams(options), fraction: resolved.fraction ? { axis: resolved.axis } : null,
      fields: resolved.fields.map(([, weights]) => ({ stride: 4, components: 3, weights })),
    });
    const fraction = resolved.fraction ? Float32Array.from(await resolved.fraction.ref.data()) : undefined;
    const vertices = vertexReference(params, { src0: liveBuffer(lower), src1: liveBuffer(upper), frac: fraction, rows: Int32Array.from([0, 1, 2]) }, new Float32Array(24));
    const world = await ownedRows(worldPoints(np.array(point), options));
    pointsOf(vertices, 3).forEach((got, c) => got.forEach((value, k) => near(value, world[c][k], `${compound} ${name} kernel ${c}`)));
    resolved.fraction?.dispose();
    Object.values(fields).forEach((value) => value.dispose());
  }
});

test("placements: 3D world-size frames transform on both tiers; pixel-anchored and billboard frames are errors", async () => {
  const frame = (placement, mode = "3d", parent = null) => {
    const matrix = new Matrix4().makeRotationZ(Math.PI / 2).setPosition(5, -2, 1);
    return { placement, mode: () => mode, parent, matrix, inverse: matrix.clone().invert() };
  };
  const placed = frame({ anchor: [1, 2, 3], size: [2, 2, 2] });
  const options = { get: (key) => ({ xbounds: [0, 10], xrange: [-1, 1], ybounds: [0, 10], yrange: [-1, 1], zbounds: [0, 10], zrange: [-1, 1] })[key],
    frameDefinition: placed, defaults: null };
  const transform = placementTransform({ options }, null, "Segments", "a");
  assert.equal(typeof transform, "function", "a 3D world-size placement is followed");
  assert.equal(placementTransform({ options }, placed, "Segments", "a"), null, "a shared placement is the consumer's own");
  const matrix = transform();
  const input = [[0, 0, 0], [10, 5, 10], [NaN, 1, 1]];
  const world = await ownedRows(worldPoints(np.array(input), options, matrix));
  const params = packVertexParams({ rows: 3, stages: frameStageParams(options), matrix: Array.from(matrix.elements),
    fields: [{ stride: 4, components: 3, weights: [1, 1, 1] }] });
  const vertices = vertexReference(params, { src0: liveBuffer(input), rows: Int32Array.from([0, 1, 2]) }, new Float32Array(24));
  pointsOf(vertices, 3).forEach((got, c) => got.forEach((value, k) => near(value, world[c][k], `placed ${c} ${k}`)));
  // Row 1: data (10, 5, 10) -> local (1, 0, 1) -> rotated a quarter turn about z -> (0, 1, 1) + (5, -2, 1).
  [5, -1, 2].forEach((value, k) => near(world[1][k], value, `row 1 world ${k}`));
  assert.ok(world[2].every(Number.isNaN), "a missing row stays missing through the matrix");

  const pixel = { options: { ...options, frameDefinition: frame({ anchor: [1, 2], size: [100, 80] }, "2d") } };
  assert.throws(() => placementTransform(pixel, null, "Arrows3D", "p"), { message: anchoredFrameError("Arrows3D", "p") });
  const billboard = { options: { ...options, frameDefinition: frame({ anchor: [1, 2, 3], size: [2, 2], orientation: "billboard" }) } };
  assert.throws(() => placementTransform(billboard, null, "Line", "b"), { message: billboardFrameError("Line", "b") });
  assert.equal(anchoredFrameError("Arrows3D", "p"),
    'Arrows3D.connections: endpoint "p" is inside a pixel-anchored Frame, which connections do not follow yet; place the endpoint in a range Frame instead.');
  assert.equal(billboardFrameError("Line", "b"),
    'Line.connections: endpoint "b" is inside a billboard Frame, which turns with the camera; connections do not follow it yet, so use orientation "parent" or a range Frame.');
});

test("the link kernel's CPU reference lays rows out as Tier 1 does (pairs; Line with separators)", async () => {
  // 2 connections x 3 slots of distinct points; vertex (c, s) = [10c + s, s, 0].
  const C = 2, S = 3;
  const vertexAt = (c, s) => [10 * c + s, s, 0];
  // Pairs (Segments family): start/end rows c * (S - 1) + p.
  {
    const layout = gatherLayout("pairs", C, S), vertices = new Float32Array(layout.vertices * 8);
    for (let c = 0; c < C; c++) for (let s = 0; s < S; s++) vertices.set([...vertexAt(c, s), 0, s, -s, 0, 0], (c * S + s) * 8);
    const out = linkReference(packLinkParams({ rows: layout.rows, slots: S, layout: "pairs", offsets: true }), vertices);
    for (let c = 0; c < C; c++) for (let p = 0; p < S - 1; p++) {
      const r = c * (S - 1) + p;
      assert.deepEqual(Array.from(out.start.subarray(r * 4, r * 4 + 3)), vertexAt(c, p));
      assert.deepEqual(Array.from(out.end.subarray(r * 4, r * 4 + 3)), vertexAt(c, p + 1));
      assert.deepEqual(Array.from(out.offset.subarray(r * 4, r * 4 + 4)), [p, -p, p + 1, -(p + 1)]);
    }
  }
  // Path (Line): equals lineArrays over the Tier 1 position rows (NaN separators included).
  {
    const layout = gatherLayout("path", C, S), vertices = new Float32Array(layout.vertices * 8);
    const position = [];
    for (let c = 0; c < C; c++) {
      for (let s = 0; s < S; s++) { vertices.set([...vertexAt(c, s), 0], (c * (S + 1) + s) * 8); position.push(vertexAt(c, s)); }
      if (c < C - 1) position.push([NaN, NaN, NaN]);
    }
    const out = linkReference(packLinkParams({ rows: layout.rows, slots: S, layout: "path", connected: true }), vertices);
    const positions = np.array(position), expected = lineArrays(positions, null, true, true);
    positions.dispose();
    for (const name of ["start", "end", "previous", "next"]) {
      const want = await rows(expected[name]);
      assert.equal(want.length, layout.rows, name);
      want.forEach((row, r) => row.forEach((value, k) => near(out[name][r * 4 + k], value, `${name} ${r} ${k}`)));
    }
    Object.values(expected).forEach((value) => value.dispose());
  }
});
