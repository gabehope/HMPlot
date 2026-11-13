/** Internal row-scope protocol. These records describe existing capabilities, not runtime tags. */
import type { Array as JaxArray } from "@hmplot/jax";
import type {
  CategoryValue,
  DataIdentity,
  LogicalColumnType,
} from "../publicTypes.js";

/** Categorical encodings are shared by scopes and mark preparation, with one record. */
export interface PreparationCategoryScale {
  isCategorical: boolean;
  isContinuous?: boolean;
  explicit?: boolean;
  domain: CategoryValue[];
  range: (string | number)[] | null;
  index(value: unknown): number;
  include(values: Iterable<unknown>): void;
  value(index: number, kind?: string): string | number;
  label(value: unknown): string;
  setRange(values: string[] | null): void;
  subscribe(listener: () => void): () => void;
}

export type Release = () => void;
export type HostValues = readonly unknown[] | ArrayLike<number | bigint>;
export interface ColumnMetadata {
  [key: string | symbol]: unknown;
  type?: LogicalColumnType;
  label?: string;
  domain?: readonly unknown[];
  origin?: number;
  unit?: string;
  timezone?: string;
}
export interface DictionaryColumn {
  codes: JaxArray | HostValues;
  categories: readonly unknown[];
  metadata?: ColumnMetadata;
}
export interface DeviceDictionary extends DictionaryColumn {
  codes: JaxArray;
}
export interface GeometryColumn {
  codes?: never;
  categories?: never;
  metadata?: never;
  isGeometryColumn: true;
  features: readonly unknown[];
  source: unknown;
  length: number;
  indices: JaxArray | null;
}
/** Numeric and plain host columns carry no dictionary envelope. */
type PlainColumn = { codes?: never; categories?: never; metadata?: never };
export type HostColumn = HostValues & PlainColumn;
export type CategoryHostColumn = readonly unknown[] & PlainColumn;
export type DeviceArray = JaxArray & PlainColumn;
export type Column =
  DeviceArray | HostColumn | DictionaryColumn | GeometryColumn;
export type DeviceColumn = DeviceArray | DeviceDictionary;
export type GatheredColumn = DeviceColumn | GeometryColumn;
export interface GridDimension {
  readonly name: string;
  readonly size: number;
  readonly stride: number;
  readonly coords: Float64Array | readonly CategoryValue[];
  readonly edges: Float64Array | null;
  readonly rotation: number;
  readonly metadata: ColumnMetadata;
}
export interface GridModel {
  readonly dims: readonly GridDimension[];
  readonly fields: readonly string[];
  readonly size: number;
  readonly shape: readonly number[];
  readonly coords2d: null | {
    readonly dims: readonly number[];
    readonly columns: Readonly<Record<string, JaxArray | HostValues>>;
    readonly x?: string;
    readonly y?: string;
  };
}
export interface RowProvenance {
  kind: string;
  fields?: readonly string[];
  /** Maps logical output groups to group ids; borrowed, often materialized lazily. */
  ids?: JaxArray;
  /** Maps source rows to group ids; borrowed. */
  codes?: JaxArray;
  rows?: RowScope;
  /** Returns owned source indices for an aggregate group. */
  contributors?(group: number): JaxArray | Promise<JaxArray>;
  /** Extra inspection fields for the physical aggregate group. */
  describe?(
    group: number,
  ): AggregateDescription | Promise<AggregateDescription>;
}
export interface ColumnChange {
  from: number;
  to: number;
  columns: ReadonlySet<string> | null;
}
/** The flat inspection record also includes authored columns. A column named index or kind
 * can overwrite the initial inspection fields, so consumers must narrow these values too. */
export type AggregateDescription = Record<string, unknown>;
/** The only fields row-identity comparison reads; callers need no column protocol. */
export interface RowIdentity {
  length: number;
  version?: number;
  parent?: RowIdentity | null;
  snapshotOf?: unknown;
  physical?: boolean;
  prefix?: boolean;
}
export interface RowScope extends RowIdentity {
  /** get() borrows logical rows. Physical projections use their own row order and length. */
  get(field: string): Column;
  length: number;
  version?: number;
  keys(): string[];
  has(field: string): boolean;
  resolve?(value: unknown): unknown;
  metadata?(field: string): ColumnMetadata | null | undefined;
  columnIdentity?(field: string): string | undefined;
  columnName?(field: string): string | null | undefined;
  hostColumn?(field: string): unknown;
  snapshotHostColumn?(field: string): () => unknown;
  encodedColumn?(field: string): Column;
  columnFact?(field: string, fact: string): boolean | undefined;
  hasOwnColumn?(field: string): boolean;
  interactionResource?(
    field: string,
  ): import("./viewControllerTypes.js").MembershipResource | null | undefined;
  interactionRevision?: number;
  constants?: Record<string, CategoryValue>;
  identity?: DataIdentity &
    Partial<
      Pick<
        import("./viewControllerTypes.js").DataIdentityState,
        "key" | "generation" | "tokens" | "nearby" | "nearest" | "tooltip"
      >
    >;
  identityRows?: boolean;
  grid?: GridModel | null;
  gridDropped?: string;
  provenance?: RowProvenance;
  parent?: RowScope;
  snapshotOf?: RowScope;
  lastChange?: ColumnChange | null;
  topology?: unknown;
  columnIdentities?: Record<string, unknown>;
  pipeline?: unknown[];
  liveColumns?: Set<string>;
  liveUntil?: number;
  live?: boolean;
  followsMask?: boolean;
  aggregate?: boolean;
  physical?: boolean;
  prefix?: boolean;
  sourceLength?: number;
  repeatsRows?: boolean;
  revalidatedGeneration?: number;
  encodingDisposed?: boolean;
  /** Every call transfers one owned reference, or null after aggregation. */
  sourceIndices?(): JaxArray | null;
  contributors?(
    index: number,
  ): JaxArray | Promise<JaxArray | undefined> | undefined;
  aggregateInfo?(
    index: number,
  ):
    | AggregateDescription
    | Promise<AggregateDescription | undefined>
    | undefined;
  /** Optional projections stay lazy and belong to their logical view. */
  padded?(): PhysicalScope | null;
  prefixed?(): PhysicalScope | null;
  bucketed?(): RowScope;
  bucketSource?: { rows: RowScope; indices: JaxArray };
  retain?(): Release;
  dispose?(): void;
  scale(field: string, palette?: unknown): PreparationCategoryScale;
  encode(
    input: unknown,
    scale: { domain: readonly unknown[] },
    create: () => JaxArray,
  ): JaxArray;
  ownsColumn?(input: unknown): boolean;
  applyOffsets?(): unknown;
}
export interface PhysicalScope extends RowScope {
  resolve(value: unknown): unknown;
  physical: true;
  capacity: number;
  count: number;
  /** Borrowed physical membership; hidden rows still contain real source values. */
  valid: JaxArray;
  prefix: boolean;
  view: Omit<DataView, "indices">;
  parent: RowScope;
}
export interface DataView extends RowScope {
  metadata(field: string): ColumnMetadata | null | undefined;
  columnIdentity(field: string): string | undefined;
  columnName(field: string): string | null | undefined;
  hostColumn(field: string): unknown;
  encodedColumn(field: string): Column;
  interactionResource(
    field: string,
  ): import("./viewControllerTypes.js").MembershipResource | null | undefined;
  resolve(value: unknown): unknown;
  dispose(): void;
  aggregateInfo(index: number): Promise<AggregateDescription | undefined>;
  contributors(
    index: number,
  ): JaxArray | Promise<JaxArray | undefined> | undefined;
  ownsColumn(input: unknown): boolean;
  version: number;
  parent: RowScope;
  retain(): Release;
  /** Borrowed logical selection; reading can materialize the compact adapter. */
  readonly indices: JaxArray | null;
  revalidated?: number;
  fieldIdentity?: Record<string, string>;
  transformDefinition?: string;
  step?: {
    kind?: string;
    config?: Record<string, unknown>;
    lineage?: Record<
      string,
      {
        kind: string;
        expression?: unknown;
        field?: string;
        preservesValues?: boolean;
      }
    >;
  };
  fold?: {
    output: DataView;
    source: RowScope;
    fields: string[];
    key: string;
    value: string;
  };
  columnFacts?: Record<string, (fact: string) => boolean | undefined>;
  onDispose?: Release;
  forwardedColumn(field: string): string | null;
}
export interface MaskedRowMapping {
  /** Each returned device column owns one reference; cache holds a separate one. */
  gather(
    input: Column,
    signature: string,
    make: () => DeviceColumn,
  ): DeviceColumn;
  readonly gatherCache: { entries: number; bytes: number };
  indices(): JaxArray;
  sourceIndices(parent: RowScope): JaxArray | null;
  retain(): Release;
  dispose(): void;
}
export interface DataViewOptions {
  /** Indices and explicit columns remain borrowed. mask is transferred to the view. */
  indices?: JaxArray | null;
  mask?: JaxArray | null;
  count?: number;
  columns?: Record<string, Column>;
  columnMetadata?: Record<string, ColumnMetadata | null | undefined>;
  names?: Record<string, string | null>;
  aggregate?: boolean;
  provenance?: RowProvenance;
  followsMask?: boolean;
  prefix?: boolean;
  live?: boolean;
  repeatsRows?: boolean;
  grid?: GridModel | null;
  lazyColumns?: Record<string, () => DeviceColumn> | null;
  rowMapping?: MaskedRowMapping | null;
}

/** An aggregate with explicit provenance always describes its logical rows. */
export interface AggregateDataView extends DataView {
  provenance: RowProvenance;
  aggregateInfo(index: number): Promise<AggregateDescription>;
}
