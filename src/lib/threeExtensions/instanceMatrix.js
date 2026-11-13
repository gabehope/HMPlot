// three's InstanceNode copies an instance matrix too large for a uniform buffer (more than 1,024
// instances) into a new InstancedInterleavedBuffer every time a material builds with it, and
// each copy is a GPU vertex buffer of its own: 16 MB at a mark's default capacity of 250,000
// rows. A mark builds more than once: its picking material, and its beauty material in another
// render context (the glow attachment, TODO 37.0, allocated 16 MB more per mark when a mark
// first glowed). One buffer per instance matrix and geometry serves every build. Per geometry:
// disposing a geometry destroys the buffers its draws used, and a mark that replaces its
// geometry (Segments) still draws the new one with the same instance matrix.
import { DynamicDrawUsage, InstanceNode, InstancedInterleavedBuffer } from "three/webgpu";
import { instancedBufferAttribute, instancedDynamicBufferAttribute, mat4 } from "three/tsl";

const shared = new WeakMap();
const create = InstanceNode.prototype._createInstanceMatrixNode;
InstanceNode.prototype._createInstanceMatrixNode = function (assignBuffer, builder) {
  const matrix = this.instanceMatrix, geometry = builder.geometry;
  if (!geometry || this.isStorageMatrix || matrix.count * 16 * 4 <= builder.getUniformBufferLimit())
    return create.call(this, assignBuffer, builder);
  let matrices = shared.get(geometry);
  if (!matrices) shared.set(geometry, (matrices = new WeakMap()));
  let interleaved = matrices.get(matrix);
  if (!interleaved) matrices.set(matrix, (interleaved = new InstancedInterleavedBuffer(matrix.array, 16, 1)));
  if (assignBuffer === true) this.buffer = interleaved;
  const read = matrix.usage === DynamicDrawUsage ? instancedDynamicBufferAttribute : instancedBufferAttribute;
  return mat4(...[0, 4, 8, 12].map((offset) => read(interleaved, "vec4", 16, offset)));
};
