import type { Array as JaxArray } from "@hmplot/jax";
import type { EffectiveFieldBinding } from "../effectiveFieldBinding.js";

/** Host values read for one explicit document export. No live GPU resource is owned here. */
export interface CapturedField {
  readonly scalar?: unknown;
  readonly data?: ArrayLike<unknown>;
  readonly shape?: readonly number[];
}

/** Borrowed renderer field. Capture never calls dispose on its data or buffer. */
export type BorrowedField = Pick<EffectiveFieldBinding, "data" | "uniformNode">;

/** Row/style inputs shared by both vector writers; callbacks close over captured values. */
export interface CapturedMarkRows {
  readonly positions: CapturedField;
  readonly ends: CapturedField | null;
  readonly sizes: CapturedField;
  readonly symbolCodes: CapturedField | null;
  readonly outlineColors: CapturedField | null;
  readonly outlineAt: (row: number, point?: boolean) => { color: string | null; width: number; opacity: number };
  readonly offsetsX: CapturedField | null;
  readonly offsetsY: CapturedField | null;
  readonly shown: readonly number[] | null;
  readonly shownCount: number;
  readonly displayScale: number;
  readonly colorAt: (row: number) => string | null;
  readonly strokeWidthAt: (row: number) => number;
  readonly opacityAt: (row: number) => number;
}

/** Validated options read by the export capture; the renderer owns their values. */
export interface CaptureOptions {
  fillColor: unknown;
  cmapIndex: unknown;
  valueMissing: unknown;
  valueBounds: number[];
  valueRange: number[];
  valueTransform: string;
  valueTransformConstant: number;
  valueMidpoint: number | null;
  quantize: boolean;
  levels: number;
  sizeUnits: string;
  scaleBounds: number[];
  scaleRange: number[];
  scaleTransform: string;
  scaleTransformConstant: number;
  scaleMidpoint: number | null;
  opacity: number;
  outlineColor: unknown; outlineWidth: number; outlineOpacity: number;
  displayScale: number;
  widthBounds: number[];
  widthRange: number[];
  widthTransform: string;
  widthTransformConstant: number;
  widthMidpoint: number | null;
}

/** The capabilities capture borrows from a mark. Neither writer owns the mark or its fields. */
export interface CaptureMark {
  readonly fields: ReadonlyMap<string, EffectiveFieldBinding>;
  readonly options: {
    get<K extends keyof CaptureOptions>(key: K): CaptureOptions[K] | undefined;
    has?(key: string): boolean;
  };
  readonly exportKind: string;
  readonly count: number;
  readonly positionSpace?: string;
  readonly categoryColorActive?: boolean;
  readonly symbolCodeActive?: boolean;
  readonly categoryOutlineActive?: boolean;
  readonly widthLiteral?: boolean;
  readonly pixelSizeNode?: { readonly value?: unknown };
  readonly renderScaleNode?: { readonly value?: unknown };
  readonly rowValid?: JaxArray | null;
  readonly animatedOptionNodes?: ReadonlyMap<string, { readonly value?: unknown }>;
  readonly renderer?: { readonly backend?: {
    readonly device: GPUDevice;
    get?(attribute: object): { buffer?: GPUBuffer } | undefined;
  } };
}
