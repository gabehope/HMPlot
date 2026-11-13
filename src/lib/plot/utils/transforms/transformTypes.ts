/** The runner's existing input, ownership and publication records. No new node flags. */
import type { Array as JaxArray } from "@hmplot/jax";
import type { createExpressionEvaluator } from "../expressionPlans.js";
import type { viewState } from "../viewState.js";
import type {
  Column,
  ColumnMetadata,
  DataView,
  DataViewOptions,
  MaskedRowMapping,
  RowProvenance,
  RowScope,
  Release,
} from "../dataViewTypes.js";

export type ReadForm = "rows" | "visibleFirst" | "compacted";
export type OutputForm =
  "sameRows" | "reordered" | "subset" | "aggregate" | "newRows";
export type Lineage = Record<
  string,
  { kind: string; expression?: unknown; [key: string]: unknown }
>;
export interface TransformConfig {
  [key: string]: unknown;
  as?: string | string[] | Record<string, string>;
  __viewState?: { live?: boolean; time?: number };
}
export interface TransformInput {
  scope: RowScope;
  source: RowScope;
  length: number;
  valid: JaxArray | null;
  count: number;
  prefix: boolean;
  groupSource: { rows: RowScope; indices: JaxArray } | null;
}
export interface TransformContext {
  evaluator: ReturnType<typeof createExpressionEvaluator>;
  /** Take an array's owned reference for release with the published output. */
  own<T extends JaxArray>(array: T): T;
  /** Release a registered intermediate early; an unregistered array is untouched. */
  release(array: JaxArray): void;
  cleanup(release: Release): void;
  cache?: Record<string, unknown>;
  signal?: AbortSignal;
  maxBytes: number;
  viewState: ReturnType<typeof viewState> | undefined;
  /** Nested work inherits this run's signal and limits; callers may supply an owned cache. */
  run(
    kind: string,
    scope: RowScope,
    config: TransformConfig,
    options?: Pick<RunOptions, "cache">,
  ): Promise<DataView>;
  boundary(): Promise<void>;
}
export interface TransformResult {
  columns?: Record<string, Column>;
  columnMetadata?: Record<string, ColumnMetadata | null | undefined>;
  columnFacts?: Record<string, (fact: string) => boolean | undefined>;
  liveColumns?: Set<string>;
  liveUntil?: number;
  provenance?: RowProvenance;
  fold?: { fields: string[]; key: string; value: string };
  view?: Partial<DataView>;
  grid?: DataViewOptions["grid"];
  lazyColumns?: DataViewOptions["lazyColumns"];
  rowMapping?: MaskedRowMapping | null;
  /** Owned membership/order buffers; the output declaration determines their row space. */
  valid?: JaxArray;
  order?: JaxArray;
  count?: number;
  bucketed?: (() => DataView) | null;
  followsMask?: boolean;
}
export interface TransformDefinition {
  /** Plan a shared geometry over the union of facet cells; null keeps each cell independent. */
  sharedBins?(config: TransformConfig): {
    axes: string[];
    calendar?: boolean;
    finish?(geometry: {
      bounds: Record<string, [number, number]>;
      counts: Record<string, unknown>;
    }): TransformConfig;
  } | null;
  /** Owns tween producers whose deadlines schedule further runs. */
  tweens?: boolean;
  /** Input fields supplying domains when output positions depend on the viewport. */
  domainFields?(config: TransformConfig): Record<string, unknown>;
  reads: ReadForm | ((config: TransformConfig) => ReadForm);
  output:
    | OutputForm
    | ((config: TransformConfig, result: TransformResult) => OutputForm);
  buckets?(config: TransformConfig, source: RowScope): boolean;
  /** Props that take a column name or one number per row of the transform's data (runner.js alignedFields). */
  fields?: (string | readonly string[])[];
  /** The axis whose category order its groups' positions follow, read from the frame by the
   * Transform component as `__categoryOrder` (TODO 130.1); null when it places no groups. */
  categoryAxis?(config: TransformConfig): "x" | "y" | null;
  /** The axis its rows' values run along (0 x, 1 y): a template's connection attachments along
   * the value axis read it through the Transform component (TODO 130.2). */
  valueAxis?(config: TransformConfig, source: RowScope): 0 | 1;
  validate?(config: TransformConfig): void;
  names?(
    config: TransformConfig,
    source: RowScope,
    columns: Record<string, Column>,
  ): Record<string, string | null>;
  renames?: boolean;
  repeatsRows?: boolean;
  lineage?(config: TransformConfig, source: RowScope): Lineage;
  run(
    input: TransformInput,
    config: TransformConfig,
    context: TransformContext,
  ): TransformResult | Promise<TransformResult>;
}
export interface RunOptions {
  signal?: AbortSignal;
  maxBytes: number;
  cache?: Record<string, unknown>;
}
export type RunTransform = (
  kind: string,
  scope: RowScope,
  config: TransformConfig,
  options: RunOptions,
) => Promise<DataView>;
/** finishView consumes registered arrays/cleanup callbacks after publication succeeds. */
export interface ViewPublication extends TransformResult {
  viewParent?: RowScope;
  indices?: JaxArray | null;
  padded?: JaxArray | null;
  paddedCount?: number;
  columnMetadata?: Record<string, ColumnMetadata | null | undefined>;
  foldInfo?: TransformResult["fold"] | null;
  names?: Record<string, string | null>;
  renamed?: boolean;
  repeatsRows?: boolean;
  extras?: Partial<DataView>;
  prefix?: boolean;
  aggregate?: boolean;
  topology?: unknown;
}
