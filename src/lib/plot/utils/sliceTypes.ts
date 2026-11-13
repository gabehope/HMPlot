/** Slice-owned records. Cached arrays belong to topology; result arrays belong to each view. */
import type { Array as JaxArray } from "@hmplot/jax";
import type {
  AggregateDataView,
  DeviceColumn,
  RowScope,
} from "./dataViewTypes.js";
export interface SliceConfig {
  [key: string]: unknown;
  field: string;
  at?: number;
  by?: string | string[];
  values?: string[];
}
export interface SliceScope extends RowScope {
  resolve(value: unknown): unknown;
}
export interface SliceGroups {
  count: number;
  codes: JaxArray;
  keys: Record<string, DeviceColumn>;
  dispose(): void;
}
export interface ActiveSpan {
  key: JaxArray | null;
  lo: number;
  hi: number;
  kept: number;
}
export interface SliceTopology {
  groups: SliceGroups;
  perm: JaxArray;
  byIndex: JaxArray;
  sortedTime: JaxArray;
  start: JaxArray;
  end: JaxArray;
  position: JaxArray;
  all: JaxArray;
  runs: { start: JaxArray; end: JaxArray } | null;
  selection: JaxArray | null;
  selectionSpan?: ActiveSpan | null;
  span?: ActiveSpan;
  identity?: unknown[];
  token: number;
  /** Key values depend on membership/order, not changing interpolation endpoints. */
  keyToken: number;
  /** Sorted unique non-NaN times already downloaded when preparing the entity order. */
  boundaries: number[];
  publication?: {
    rows: RowScope;
    version: number | undefined;
    sourceTopology: unknown;
    mask: JaxArray | null;
    interval: number;
    padded: boolean;
  };
  keyColumns: Record<string, DeviceColumn>;
  entityOrder?: { key: JaxArray | null; firsts: JaxArray; order: JaxArray };
  duplicateCheck?: { key: JaxArray | null; repeated: number };
  dispose(): void;
}
export interface SliceSelection {
  selection: JaxArray;
  mask?: JaxArray | null;
  count?: number;
}
export interface SliceDescription {
  field: string;
  at: number;
  keys: string[];
  lower?: JaxArray;
  upper?: JaxArray;
  grid?: { lower: number; upper: number; t: number; inside: boolean };
}
export interface SliceView extends AggregateDataView {
  slice: SliceDescription;
}
