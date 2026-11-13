/**
 * Borrowed view of BufferedField's current binding, not a second representation/state store.
 * FillType with isBufferNode maps its values through a scale; its uniform branch uses the
 * mark's fillColor option binding. ColorType buffers hold literal RGB rows instead.
 * data retains the uploaded input, so it is not authoritative for later option edits.
 */
export interface EffectiveFieldBinding {
  readonly data?: unknown;
  readonly type?: { readonly name: string } | null;
  readonly isBufferNode?: boolean;
  readonly isChannelScalar?: boolean;
  readonly deviceScalar?: boolean;
  readonly uniformNode?: { readonly value?: unknown } | null;
  readonly bufferNodeSource?:
    { readonly itemSize: number } | ArrayTexture | null;
  readonly count: number;
}

/** Uploads borrow inputs. Queueing retains device inputs until success, failure or cancellation. */
import type { Array as JaxArray } from "@hmplot/jax";
import type {
  Node,
  UniformNode,
  WebGPURenderer,
  Color,
  Vector2,
  Vector3,
  Vector4,
} from "three/webgpu";
import type { OptionsNode } from "../../options/options.js";
import type {
  ArrayInstancedBufferAttribute,
  ArrayTexture,
} from "../../threeExtensions/array/arraytexture.js";
import type { BufferedField, BufferManager } from "./proputils.js";
import type { CurvedPaths } from "./curvedPaths.js";
import type { FieldStorageNode } from "./curvedPathTypes.js";

export type FieldStorage = ArrayInstancedBufferAttribute | ArrayTexture;
export type FieldUniformValue =
  number | string | boolean | Color | Vector2 | Vector3 | Vector4;
export type FieldValue =
  | FieldUniformValue
  | JaxArray
  | ArrayLike<unknown>
  | { value: number }
  | null
  | undefined;
export interface FieldTarget {
  renderer: WebGPURenderer;
  options?: OptionsNode;
  count: number;
  componentName?: string;
  constructor: Function & { componentName?: string };
  isConnectedPath?: boolean;
  plotTileStorage?: boolean;
  tileStorageFields?: ReadonlySet<string>;
  storageFields?: ReadonlySet<string>;
  curvedPaths?: CurvedPaths | null;
  sampling?: { field(name: string, channels: number, node: Node): Node } | null;
}
/** Field types own conversion and shader assignment; the manager owns neither. */
export interface FieldDefinition {
  readonly isFieldType: boolean;
  readonly name: string;
  readonly channels: number;
  readonly canBeBuffer: boolean;
  readonly defaultValue: FieldUniformValue | null;
  isUniformType(value: unknown): boolean;
  getUniformData(value: unknown, stash: unknown): FieldUniformValue;
  validateShape(value: JaxArray, stash: unknown): JaxArray;
  validateTextureShape?(value: JaxArray, stash: unknown): JaxArray;
  setNode(
    target: FieldTarget,
    node: Node,
    highlight: Node,
    stash: unknown,
    buffered: boolean,
  ): void;
}
export type FieldTypeInput =
  | string
  | FieldDefinition
  | (new (params: Record<string, unknown>) => FieldDefinition)
  | null;
export interface FieldParameters {
  target?: FieldTarget | null;
  typeParams?: Record<string, unknown>;
  name?: string;
  stash?: unknown;
  getStash?: ((field: BufferedField) => unknown) | null;
  onDirty?: ((field: BufferedField) => void) | null;
  onCount?: ((count: number) => void) | null;
  stableRepresentation?: boolean;
  resolution?: number;
  image?: boolean;
  pixelated?: boolean;
  maxWidth?: number;
  maxTextureWidth?: number;
  maxHeight?: number;
  maxTextureHeight?: number;
  maxChannels?: number;
  maxTextureChannels?: number;
}
export interface FieldAnimationSpec {
  explicit?: boolean;
  kinds?: readonly number[];
  constants?: readonly number[];
  stride?: number;
  components?: readonly ({
    suppressed?: boolean;
    duration?: number;
    easing?: number;
    mode?: number;
  } | null)[];
}
export interface StagingRows {
  index: Int32Array;
  rows: number;
  oldRows: number;
}
/** Captured at enqueue time, never borrowed from a later publication's animation policy. */
export interface FieldAnimationTag {
  owner: FieldTarget | null;
  derived: boolean | undefined;
  spec: FieldAnimationSpec | null;
  kinds: readonly number[] | null;
  arrive: boolean;
  schemeReset?: boolean;
  staging: StagingRows | null;
  snapRows: JaxArray | null;
  changed(): Promise<void>;
}
export interface FieldWriteRequest {
  data: FieldValue;
  buffer: FieldStorage | null;
  settings: string;
  version: number;
  done: Promise<import("./internalTypes.js").FieldWriteResult> | null;
}
export interface CapacityRequest {
  initial?: unknown;
  allocated?: number;
  fields?: Iterable<Pick<FieldDefinition, "canBeBuffer" | "channels">>;
  limits?: { maxStorageBufferBindingSize?: number; maxBufferSize?: number };
  rows?: number;
}
/** Lazy animation tags are assigned by the upload owner, not by the storage constructor. */
declare module "../../threeExtensions/array/arraytexture.js" {
  interface ArrayInstancedBufferAttribute {
    animationTag?: FieldAnimationTag;
  }
  interface ArrayTexture {
    animationTag?: FieldAnimationTag;
  }
}
/** Pinned Three declarations omit the no-argument and dynamically converted uniform forms. */
import type { uniform } from "three/tsl";
export type FieldUniformFactory = typeof uniform & {
  (value: number, type: "uint"): UniformNode<"uint", number>;
  (value: number, type?: "float"): UniformNode<"float", number>;
  (value?: FieldUniformValue): Node & { value: FieldUniformValue };
};
