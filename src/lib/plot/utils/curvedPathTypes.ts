/** Adaptive path refinement borrows mark fields and owns GPU metadata, not source geometry. */
import type {
  Camera,
  BufferGeometry,
  Object3D,
  StorageBufferAttribute,
  StorageInstancedBufferAttribute,
  WebGPURenderer,
} from "three/webgpu";
import type { Node } from "three/webgpu";
import type { default as UniformNode } from "three/src/nodes/core/UniformNode.js";
import type { default as StorageBufferNode } from "three/src/nodes/accessors/StorageBufferNode.js";
import type { CoordinateOptions } from "./coordinateOperations.js";
import type { ViewServices } from "./internalTypes.js";
import type { CurvedPaths } from "./curvedPaths.js";
import type { uniform } from "three/tsl";

/** prepare replaces this record while one queued refinement waits for field uploads. */
export interface CurveRequest {
  camera: Camera;
  width: number;
  height: number;
  cap: number;
  key: string;
  topology: string;
}
export type CurvePass =
  "countPaths" | "scanBlocks" | "scanTops" | "scanRows" | "fillPaths";
/** Geometry fields use instanced storage; refinement metadata uses ordinary storage. */
export type CurveStorage =
  StorageBufferAttribute | StorageInstancedBufferAttribute;
/** Three's declaration omits these WebGPU backend members; this path requires WebGPU. */
export interface CurveBackend {
  device: GPUDevice;
  has(attribute: CurveStorage): boolean;
  get(attribute: CurveStorage): { buffer: GPUBuffer };
  createStorageAttribute(attribute: CurveStorage): void;
}
/** Field storage is borrowed; binding/rebinding remains the BufferedField's responsibility. */
export interface CurveField {
  bufferNodeSource?: CurveStorage | null;
  channels: number;
  count: number;
  name: string;
  _samplingName?: string;
  isBufferNode: boolean;
  /** Its last data write failed (BufferedField.update). */
  failed?: boolean;
  version: number;
  animationVersion?: number;
  curvedBinding?: boolean;
  rebind(): void;
}
/** field() is called from BufferedField binding after a source buffer has been installed. */
export interface CurveBufferField extends CurveField {
  bufferNodeSource: CurveStorage;
}
export interface CurveMark {
  options: CoordinateOptions;
  renderer: WebGPURenderer;
  view: ViewServices;
  manager: { chain: Promise<unknown> };
  fields: ReadonlyMap<string | undefined | null, CurveField>;
  count: number;
  geometry: BufferGeometry & {
    isInstancedBufferGeometry?: boolean;
    instanceCount?: number;
  };
  material: { needsUpdate: boolean };
  isInstancedMesh: boolean;
  isDisposed?: boolean;
  curvedPaths?: CurvedPaths | null;
  curvedFields?: readonly [string, string, string?];
  curvedPatch?: boolean;
  /** Pieces' distances in world units, not on screen (Arrows3D's head cap). */
  worldDistances?: boolean;
  band?: boolean;
  lonLatPieces?: boolean;
  curvedBuilt?: boolean;
  turnActive?: boolean;
  isConnectedPath?: boolean;
  patchRotation?(): number | null;
  refinesChain?(): boolean;
  setCrossRows?(): void;
  invalidate(): void;
  build(): void;
}
/** Optional capabilities of scene objects; ordinary objects need none of them. */
export type CurveSceneObject = Object3D & {
  curvedPaths?: CurvedPaths | null;
  isDisposed?: boolean;
  dashDistances?: {
    prepare(camera: Camera, width: number, height: number): unknown;
  };
};
/** refinesPieces first checks curvedPaths; this exposes that guard to scene traversal. */
export type RefinesCurveObject = (
  object: CurveSceneObject,
) => object is CurveSceneObject & { curvedPaths: CurvedPaths };
export type FieldStorageNode =
  | StorageBufferNode<"float">
  | StorageBufferNode<"vec2">
  | StorageBufferNode<"vec3">
  | StorageBufferNode<"vec4">;
/** Pinned Three declarations lack numeric uint uniforms and a dynamic storage overload. */
export type UintUniformFactory = typeof uniform &
  ((value: number, type: "uint") => UniformNode<"uint", number>);
export type FieldStorageFactory = (
  buffer: CurveStorage,
  type: "float" | "vec2" | "vec3" | "vec4",
  count: number,
) => FieldStorageNode;
export type FieldComponents = Pick<Node<"vec4">, "x" | "xy" | "xyz" | "xyzw">;
/** Compound assignment does not declare a JS class property for TypeScript. */
declare module "./curvedPaths.js" {
  interface CurvedPaths {
    snapshots: GPUBuffer[] | undefined;
  }
}
export type LogicalRowNode = Node<"uint">;
