import test from "node:test";
import assert from "node:assert/strict";
import { CylinderGeometry, ConeGeometry } from "three/webgpu";
import { positionLocal } from "three/tsl";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  vertexBufferIssue, geometryVertexBuffers, segmentVertexBufferFields, interleaveGeometry, DEFAULT_MAX_VERTEX_BUFFERS,
} from "../../src/lib/plot/utils/vertexBuffers.js";
import { LineNodeMaterial } from "../../src/lib/threeExtensions/materials/lines.js";
import { TileMeshNodeMaterial, TilePointsNodeMaterial } from "../../src/lib/threeExtensions/materials/tile.js";
import { BufferedField } from "../../src/lib/plot/utils/proputils.js";
import { ScalarType } from "../../src/lib/plot/objects/types.js";
import { installStorageBindings } from "../../src/lib/threeExtensions/storageBindings.js";
import WebGPUBackend from "three/src/renderers/webgpu/WebGPUBackend.js";

test("storage binding updates bypass texture-only caching without rebuilding shaders", () => {
  const backend = new WebGPUBackend();
  // Exercise Three's real cache, replacing only GPU allocation with a binding snapshot.
  backend.bindingUtils.createBindingsLayout = () => null;
  backend.bindingUtils.createBindGroup = group => ({ attribute: group.bindings.find(binding => binding.isStorageBuffer)?.attribute });
  installStorageBindings({ backend });
  const storage = { isStorageBuffer: true, attribute: {} }, texture = { isSampledTexture: true };
  const group = { bindings: [storage, texture] }, texturesOnly = { bindings: [texture] };
  backend.updateBindings(group, [group], 42, 7);
  const previous = backend.get(group).group;
  storage.attribute = {};
  backend.updateBindings(group, [group], 42, 7);
  assert.notEqual(backend.get(group).group, previous);
  assert.equal(backend.get(group).group.attribute, storage.attribute);
  backend.updateBindings(texturesOnly, [texturesOnly], 42, 7);
  const cached = backend.get(texturesOnly).group;
  backend.updateBindings(texturesOnly, [texturesOnly], 42, 7);
  assert.equal(backend.get(texturesOnly).group, cached);
});

test("tile storage bindings grow without changing their shader node or sharing mutable bindings", () => {
  const make = () => {
    const mark = { plotTileStorage: true, tileStorageFields: new Set(["value"]), builds: 0 };
    const field = new BufferedField(new ScalarType({targetNodes:["valueNode"]}), mark, {onDirty:() => mark.builds++});
    field._samplingName = "value";
    field.build({renderer:{backend:{}},maxElements:8});
    field.bindBuffer(field.buffer);
    return {field,mark};
  };
  const a = make(), b = make(), node = a.field.tileStorageNode;
  assert.equal(node.bufferCount, 0);
  assert.notEqual(node, b.field.tileStorageNode);
  const attribute = new a.field.buffer.constructor(a.field.renderer, 16, 1);
  a.field.bindBuffer(attribute);
  assert.equal(a.field.tileStorageNode, node);
  assert.equal(node.value, attribute);
  assert.equal(a.mark.builds, 1);
  assert.equal(b.field.tileStorageNode.value, b.field.buffer);
});

test("interleaving a mark's template mesh binds one vertex buffer and keeps its attributes", () => {
  const plain = new LineSegmentsGeometry();
  assert.equal(geometryVertexBuffers(plain), 2);
  const expected = Object.fromEntries(Object.entries(plain.attributes).map(([name, a]) => [name, [a.itemSize, Array.from(a.array)]]));
  const quad = interleaveGeometry(new LineSegmentsGeometry());
  assert.equal(geometryVertexBuffers(quad), 1);
  for (const [name, [itemSize, values]] of Object.entries(expected)) {
    const attribute = quad.attributes[name];
    assert.equal(attribute.isInterleavedBufferAttribute, true);
    assert.equal(attribute.itemSize, itemSize);
    const read = [];
    for (let i = 0; i < attribute.count; i++)
      for (let c = 0; c < itemSize; c++) read.push(attribute.getComponent(i, c));
    assert.deepEqual(read, values, name);
  }
  assert.deepEqual(Array.from(quad.index.array), Array.from(plain.index.array));
  // The arrow mesh (shaft and head, with normals and a part id) is one buffer as well.
  const arrow = interleaveGeometry(mergeGeometries([new CylinderGeometry(1, 1, 1, 12), new ConeGeometry(1, 1, 16)]));
  assert.equal(geometryVertexBuffers(arrow), 1);
  assert.equal(geometryVertexBuffers(undefined), 0);
  for (const geometry of [plain, quad, arrow]) geometry.dispose();
});

test("the line material binds no instance matrix", () => {
  const material = new LineNodeMaterial();
  assert.equal(material.instanceTransform, false);
  assert.equal(material.clone().instanceTransform, false);
  // Local position without the InstancedMesh transform: the vertex node never reads it.
  assert.equal(material.setupPosition(), positionLocal);
  material.dispose();
});

test("tile mesh and point materials omit instance transforms in render and picking clones", () => {
  for (const Material of [TileMeshNodeMaterial, TilePointsNodeMaterial]) {
    const material = new Material(), clone = material.clone();
    for (const candidate of [material, clone]) {
      assert.equal(candidate.instanceTransform, false);
      // An instance getter would be reached by the stock setup, even with a positionNode.
      assert.equal(candidate.setupPosition({ object: { get instanceMatrix() { throw Error("unused instance matrix"); } } }), positionLocal);
      candidate.dispose();
    }
  }
});

test("segment marks bind their endpoints and neighbors, then appearance channels", () => {
  assert.deepEqual(segmentVertexBufferFields(), {
    positions: ["start", "end"], channels: ["color", "width", "interactionOpacity"],
  });
  assert.deepEqual(segmentVertexBufferFields({ connected: true, categoryColor: true }), {
    positions: ["start", "end", "previous", "next"], channels: ["categoryColor", "width", "interactionOpacity"],
  });
  // A dashed Line's path distances are a storage read (TODO 73.2), not a vertex buffer.
  assert.deepEqual(segmentVertexBufferFields({ connected: true, endpointOffset: true }), {
    positions: ["start", "end", "previous", "next"],
    channels: ["color", "width", "endpointOffset", "interactionOpacity"],
  });
  // Curved paths read their rows from storage buffers.
  assert.deepEqual(segmentVertexBufferFields({ curved: true, connected: true, endpointOffset: true }), {
    positions: [], channels: [],
  });
});

test("a Line has room for per-row color, width and opacity; over the limit names the mark and channels", () => {
  assert.equal(DEFAULT_MAX_VERTEX_BUFFERS, 8);
  const quad = geometryVertexBuffers(interleaveGeometry(new LineSegmentsGeometry()));
  const budget = (state) => {
    const { positions, channels } = segmentVertexBufferFields(state);
    return [quad + positions.length, channels];
  };
  // Line: the quad plus start, end, previous and next leave three channels.
  assert.equal(vertexBufferIssue("Line", ...budget({ connected: true, categoryColor: true })), "");
  // Segments: the quad plus start and end leave five, enough for every channel.
  assert.equal(vertexBufferIssue("Segments", ...budget({ categoryColor: true, endpointOffset: true })), "");
  assert.equal(
    vertexBufferIssue("Line", ...budget({ connected: true, categoryColor: true, endpointOffset: true })),
    "Line: drawing 4 per-row channels (per-row colors, width, endpoint pixel offsets (from Dodge), " +
      "per-row opacity (RGBA alpha, an opacity array or column, or selection feedback)) needs 9 vertex buffers; " +
      "the limit is 8 vertex buffers on this device. This mark has room for 3: give one of them a single value " +
      "instead of one per row.",
  );
});
