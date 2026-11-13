/** Structural planning records and owned execution inputs; no planner state is stored here. */
import type { Array as JaxArray } from "@hmplot/jax";
import type { Expression } from "../publicTypes.js";
import type { Column, ColumnMetadata, GridModel } from "./dataViewTypes.js";

export interface ViewStateRecord {
  readonly time: number;
  readonly pointer: { x: unknown; y: unknown } | null;
  readonly visible: { x?: readonly number[]; y?: readonly number[] } | null;
  at(period: number): ViewStateRecord;
}
/** Tracked values are borrowed and sampled lazily, once per state record. */
export interface ViewStateInputs {
  time?: number;
  pointer?: ViewStateRecord["pointer"] | (() => ViewStateRecord["pointer"]);
  visible?: ViewStateRecord["visible"] | (() => ViewStateRecord["visible"]);
}
/** A compiler binds just these capabilities; it neither compacts nor retains its scope. */
export interface ExpressionScope {
  length: number;
  get(field: string): Column | number | boolean;
  has?(field: string): boolean;
  metadata?(field: string): ColumnMetadata | null | undefined;
  grid?: GridModel | null;
  physical?: boolean;
  prefix?: boolean;
  valid?: JaxArray | null;
  scalarInput?(field: string): number | undefined;
  /** Optional context for missing-field diagnostics; numerical evaluation needs no identity. */
  identity?: { readonly id?: string };
  interactionColumns?(): readonly string[];
}
export interface RuntimePort {
  value: JaxArray | number | boolean;
  categories?: readonly unknown[];
  metadata?: ColumnMetadata | null;
}
export type RuntimePorts = Map<string, RuntimePort>;
/** Cached reductions and immutable random draws own one array reference each.
 * RuntimePorts borrow those values; they do not take responsibility for their release. */
export interface CachedExpressionValue extends RuntimePort {
  value: JaxArray;
  constant?: true;
}
export type ExpressionCacheKey = Expression | string;
/** A reduction cache also serves immutable constants when no separate cache is supplied. */
export type ExpressionValueCache = Map<
  ExpressionCacheKey,
  CachedExpressionValue
> & {
  released?: boolean;
};
export type ReductionCache = ExpressionValueCache;
/** Resolution borrows columns, host literals and cached values. The evaluation's own()
 * callback tracks new arrays and leases; a memo entry itself has no release obligation. */
export interface ResolvedOperand {
  value: unknown;
  metadata?: ColumnMetadata | null;
  categories?: readonly unknown[];
  /** A view-state scalar naming one category, such as a pointer over a band axis. */
  category?: string;
  source?: string;
  literal?: boolean;
  /** Compiled traces replace host literals with reads from this buffer slot. */
  scalarSlot?: number;
}
export interface ResolutionContext {
  state: ViewStateRecord | undefined;
  memo: Map<Expression, ResolvedOperand>;
}
/** Each call registers one owned reference, even when an array already appears in the list. */
export type OwnExpressionResource = <T extends { dispose(): void }>(
  value: T,
) => T;
/** The producer owns interpolation state and any retained targets. The evaluation owns
 * resources registered through own(); consumers only see the returned current value. */
export interface TweenExpressionHook {
  (
    node: Expression,
    inner: ResolvedOperand,
    own: OwnExpressionResource,
  ): ResolvedOperand;
  target?(node: Expression, resolve: () => ResolvedOperand): ResolvedOperand;
}
/** An operation's checked, serializable configuration passes through lowering. */
export interface OperationLiteral {
  __expressionLiteral: unknown;
  [key: string]: unknown;
  by?: string | string[];
  orderBy?: string | string[];
}
export interface ScalarSlot {
  scalar: number;
  kind: string;
  integer: boolean;
}
export interface FieldRead {
  field: string;
  type: string;
}
export interface LoweredOperation {
  op: string;
  args: LoweredOperand[];
}
export type LoweredOperand =
  null | ScalarSlot | FieldRead | LoweredOperation | OperationLiteral;
export interface LoweredRoots {
  roots: LoweredOperand[];
  fields: Set<string>;
  literals: (number | boolean)[];
}
export interface Binding {
  /** Each column and valid are owned references until the JIT consumes them. */
  columns: Record<string, JaxArray>;
  valid: JaxArray | null;
  fieldMetadata: Record<string, ColumnMetadata | null | undefined>;
  dictionaries: Record<string, readonly unknown[]>;
  described: Map<string, ColumnMetadata | null | undefined>;
}
export interface PlanStructure {
  broadcast: boolean;
  physical: boolean;
  prefix: boolean;
  rowCount: number;
}
export interface ProgramPlan extends PlanStructure {
  roots: LoweredOperand[];
  fields: string[];
  fieldMetadata: Binding["fieldMetadata"];
  dictionaries: Binding["dictionaries"];
  integerSlots: boolean[];
  inputs: [string, string, number[]][];
  valid: [string, number[]] | null;
  categoryLiterals: (number | boolean | string)[];
}
export interface ResultDescription {
  metadata?: ColumnMetadata | null;
  category?: string;
  cardinality?: "scalar" | "rows";
  representation?: "host-scalar" | "device-scalar" | "rows";
  categories?: readonly unknown[];
}
export interface TracedDescriptions {
  descriptions: ResultDescription[];
  sources: (string | undefined)[];
}
export interface ProgramRecord {
  roots: unknown[];
  fields: string[];
  descriptions: Map<string, TracedDescriptions>;
}
export interface ExecutionInputs {
  columns: Record<string, JaxArray>;
  floats: JaxArray;
  integers: JaxArray;
  valid?: JaxArray;
}
export type CompiledProgram = ((inputs: ExecutionInputs) => JaxArray[]) & {
  dispose(): void;
};
export interface EvaluationOptions {
  broadcast?: boolean;
  rowCount?: number;
  time?: number;
  viewState?: ViewStateRecord;
  reductionCache?: ReductionCache;
  evaluator?: ExpressionEvaluator;
}
/** Hooks belong to the eager evaluator; compiled planning consumes only EvaluationOptions. */
export interface EagerEvaluationOptions extends EvaluationOptions {
  constantCache?: ExpressionValueCache;
  constantUsed?: Set<ExpressionCacheKey>;
  tween?: TweenExpressionHook;
  scalarProvider?(
    value: number | boolean,
    dtype: "int32" | "float32" | "bool",
    slot?: number,
  ): JaxArray;
  expressionProvider?(
    node: unknown,
    state: ViewStateRecord | undefined,
  ): ExpressionResult | null;
}
export interface PreparedPlan {
  values: JaxArray[];
  descriptions?: ResultDescription[];
  plan: ProgramPlan;
  programs: number;
  dispose(): void;
}
export interface ExpressionResult extends ResultDescription {
  value: unknown;
  expression?: unknown;
  dependencies?: { fields: Set<string>; membership: boolean };
  dispose(): void;
}
export interface ExpressionStats {
  compiled: number;
  fallback: number;
  lookups: number;
  traceFailures: number;
  traces: number;
  hits: number;
  reasons: Record<string, number>;
}
export interface ExpressionEvaluator {
  prepare(
    roots: unknown[],
    scope: ExpressionScope,
    options?: EvaluationOptions,
  ): PreparedPlan;
  evaluate(
    root: unknown,
    scope: ExpressionScope,
    options?: EvaluationOptions,
  ): ExpressionResult;
  readonly stats: ExpressionStats;
  readonly size: number;
  dispose(): void;
}
