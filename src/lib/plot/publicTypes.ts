import type { Snippet } from "svelte";
import type { RuntimeSettings } from "./generated/settings.js";
export interface PlotSettings {
  /** Show the settings and export buttons in the plot's corner (default true); false hides
   * both, whatever showExport says. */
  showTrigger?: boolean;
  /** Show the export button and the context menu's "Export…" (default true); false keeps the
   * settings button in its place. exportPNG() and the other export methods still work. */
  showExport?: boolean;
  /** Open the plot's context menu on right-click, the ContextMenu key and Shift+F10 (default
   * true); false leaves the browser's own menu, and marks' contextmenu callbacks still fire.
   * openSettings() still opens the settings pane. */
  menu?: boolean;
  /** Offer "Shared defaults…" in the settings pane (default true). */
  allowSharedDefaults?: boolean;
}
export interface Viewport2D {
  x: number;
  y: number;
  zoom: number;
  /** The horizontal zoom factor, when x and y zoom apart (1 fits the domain). */
  zoomX?: number;
  /** The vertical zoom factor, when x and y zoom apart. */
  zoomY?: number;
  /** Active root longitude and latitude in its angular units. */
  center?: [number, number];
}
export interface AnimationOptions {
  animation?: boolean;
  animationDuration?: number;
  animationEasing?:
    | "linear"
    | "quad-in"
    | "quad-out"
    | "quad-in-out"
    | "cubic-in"
    | "cubic-out"
    | "cubic-in-out"
    | "sine-in-out";
}
export interface BoundsAnimationOptions {
  /** Animate numeric axis domains and ranges independently of mark animation. Defaults to the parent frame's setting (false on Plot); structural scale changes and direction reversals snap. */
  animateBounds?: boolean;
  /** Duration of scale transitions in milliseconds, independent of mark timing (default 300). */
  boundsDuration?: number;
  /** Easing of scale transitions, independent of mark timing (default cubic-in-out). */
  boundsEasing?: AnimationOptions["animationEasing"];
}
export type ThemePresetName =
  | "hmplot"
  | "ink"
  | "minimal"
  | "paper"
  | "presentation"
  | "colorblind"
  | "dark"
  | "538"
  | "financeTerminal"
  | "pastel"
  | "graph"
  | "sea"
  | "sunset"
  | "ggplot"
  | "seabornDark"
  | "notebook"
  | "graphingCalculator"
  | "observable"
  | "wesAnderson"
  | "ghibli"
  | "yellowGlow"
  | "8bit"
  | "vaporwave"
  | "blueprint"
  | "bubblegum"
  | "spooky"
  | "treasureMap"
  | "bureau"
  | "journal"
  | "bauhaus"
  | "risograph"
  | "tufte";
/** A built-in colormap name, at least two CSS colors (Lab interpolation), or colors with an
 * interpolation space and ascending [0, 1] positions (one per color). */
export type ColormapSpec =
  | string
  | string[]
  | { colors: string[]; space?: "lab" | "hsl" | "srgb"; positions?: number[] };
/** Cartesian 3D guides; plane grids lie on the camera's far faces. */
export interface Axes3DConfig {
  /** Complete bounding box or three incident axes. */
  style?: "box" | "triad";
  /** Plane grids to draw; omitted means none. */
  gridPlanes?: ("xy" | "xz" | "yz")[];
}
export interface ThemeDefinition {
  /** The theme's name, shown in the settings pane. A name that starts with a partial theme's
   * group ("axes/", "legend/", "title/", "controls/", "numbers/", "animation/", "marks/") makes the theme a partial:
   * it should set only that section, and warns when it sets others (TODO 132.7). */
  name?: string;
  /** Inherit from themes: a preset name (matched ignoring case and punctuation), a partial
   * theme's name ("axes/minimal", "legend/inline-top", "title/centered", "numbers/currency", ...),
   * a theme definition, a theme resource, or a list of them merged left to right, as in
   * ["paper", "axes/minimal", "legend/inline-top"]. This definition's keys merge over the result:
   * objects merge key by key, lists (a palette) replace. */
  extends?:
    | ThemePresetName
    | string
    | ThemeDefinition
    | ThemeResource
    | (ThemePresetName | string | ThemeDefinition | ThemeResource)[];
  /** VectorTile's color scheme under this theme: part -> style (or false), as VectorTile's styles. */
  vectorTile?: Partial<Record<VectorTilePart, VectorTileStyle | boolean>>;
  /** The plot area: background is its color. */
  view?: { background?: string };
  /** Text everywhere unless a part overrides it: font family, size in CSS pixels and color. */
  typography?: { fontFamily?: string; fontSize?: number; color?: string };
  /** Axis lines, ticks, labels, titles, grids and margins (see AxisDefinition for each key). */
  axes?: {
    /** color: axis lines and ticks; textColor: tick labels and titles (default typography.color). */
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    textColor?: string;
    /** Baseline visibility, independent of ticks, labels and arrows. */
    line?: boolean;
    /** Tick marks remain independent of tick labels. */
    ticks?: boolean;
    /** Which side of the baseline the tick marks extend toward. */
    tickDirection?: "outside" | "inside" | "both";
    /** Numeric title font weight, from 1 to 1000. */
    titleFontWeight?: number;
    /** Omitted color adapts to the theme background. */
    gridColor?: string;
    /** Grid stroke width and dash lengths in CSS pixels. */
    gridWidth?: number;
    gridDash?: number[];
    /** Complete rectangular border for 2D Cartesian frames. */
    frame?: boolean;
    /** Clip marks and picking to the 2D Cartesian axes interior. */
    mask?: boolean;
    /** Defaults used by axes3d=true; guides stay off until explicitly enabled. */
    threeD?: Axes3DConfig;
    lineWidth?: number;
    tickSize?: number;
    grid?: "off" | "major" | "major-minor";
    /** A side's margin in CSS pixels; "auto" (the default) measures it from the axis's labels and title. */
    marginLeft?: number | "auto";
    marginRight?: number | "auto";
    marginTop?: number | "auto";
    marginBottom?: number | "auto";
    /** Small arrowheads at the start, end or both ends of each axis; none hides them. */
    arrow?: "none" | "start" | "end" | "both";
    /** Axis arrowhead length in CSS pixels. */
    arrowSize?: number;
    /** Axis title anchor along each axis; explicit axis settings override the theme. */
    titlePosition?: "start" | "middle" | "end";
    /** Title rotation in degrees; auto follows the axis orientation. */
    titleAngle?: "auto" | number;
    /** Put titles inside or outside the plot area. */
    titlePlacement?: "inside" | "outside";
    /** Title spacing in CSS pixels. */
    titleOffset?: number;
    /** Tick label rotation in degrees. */
    tickLabelAngle?: number;
    /** Tick label alignment at its anchor. */
    tickLabelAlign?: "auto" | "start" | "middle" | "end";
    /** Put tick labels inside or outside the plot area. */
    tickLabelPlacement?: "inside" | "outside";
    /** Tick label spacing in CSS pixels. */
    tickLabelOffset?: number;
  };
  /** Legends and colorbars: their fonts, colors and spacing. */
  guides?: { fontFamily?: string; fontSize?: number; textColor?: string };
  /** Numbers: format is a d3-format string (",.2f", "$,.0f", ".1%") that linear axis ticks, legends
   * and tooltips use where they set no format of their own; dates keep theirs (TODO 132.4). */
  numbers?: { format?: string };
  /** Inputs (Slider, Select, Button, Checkbox, Playback, ...): accentColor colors a slider's
   * handle and fill, a checked box and the focus ring (default palette[0]); fontSize is their text
   * size in CSS pixels (default typography.fontSize). A page's --hm-controls-* variables win (TODO 132.3). */
  controls?: { accentColor?: string; fontSize?: number };
  /** Animated changes (TODO 132.7): duration (milliseconds) and easing are a Plot's
   * animationDuration and animationEasing, enter and exit a mark's enterEffect and exitEffect,
   * where those are not set. It does not turn animation on: a Plot's or mark's `animation` does. */
  animation?: {
    duration?: number;
    easing?: AnimationOptions["animationEasing"];
    enter?: MarkProps["enterEffect"];
    exit?: MarkProps["exitEffect"];
  };
  /** Mark defaults. A null ordinary mark color/fill clears an inherited color and uses palette[0]. */
  marks?: Record<string, Record<string, string | number | boolean | null>>;
  /** The categorical colors, in order, for marks colored by a category. */
  palette?: string[];
  /** Default colormap for continuous fills and colors without an explicit colormap. */
  colormap?: ColormapSpec;
  /** The color of a missing value (NaN or null) in a colormapped fill or color, unless its scale
   * sets `missing` (default "#92989f", a neutral gray). */
  missing?: string;
  /** Custom point shapes registered when the theme applies: name -> vertices in [-1, 1] or an M/L/Z path. */
  shapes?: Record<string, Array<[number, number]> | string>;
}
export interface ThemeResource {
  readonly isTheme: true;
  readonly id: string;
  readonly version: number;
  snapshot(): ThemeDefinition;
  subscribe(callback: () => void): () => void;
  update(patch: Partial<ThemeDefinition>): ThemeResource;
  replace(value: ThemeDefinition): ThemeResource;
}
export interface ThemeProps extends RuntimeSettings<"Theme"> {
  value: ThemeDefinition | ThemeResource;
  children?: Snippet;
}
export type CategoryValue = string | number | boolean;
export interface CategoricalScale {
  readonly isCategorical: true;
  /** Guide title for every mark sharing this scale (from `categorical({label})`). */
  readonly title?: string;
  readonly domain: CategoryValue[];
  readonly range: string[] | null;
  readonly unknown: string;
  include(values: Iterable<CategoryValue>): void;
  index(value: CategoryValue): number;
  value(index: number, kind?: string): string;
  subscribe(callback: () => void): () => void;
  setRange(range: string[] | null): void;
  update(patch: {
    domain?: CategoryValue[];
    range?: string[] | null;
    unknown?: string;
  }): CategoricalScale;
  setUnknown(color: string): void;
  setLabel(value: CategoryValue, label: string): void;
  label(value: CategoryValue): string;
}
export interface OrdinalScale extends CategoricalScale {
  readonly isOrdinal: true;
  readonly colormap: ColormapSpec | null;
  update(patch: {
    domain?: CategoryValue[];
    range?: string[];
    colormap?: ColormapSpec;
    unknown?: string;
  }): OrdinalScale;
}
/**
 * A scale transform: "linear", "log", "sqrt", or "symlog" (d3's scaleSymlog: sign(x)·log1p(|x|/c),
 * linear near 0 and logarithmic beyond ±c, for data that crosses zero). A value outside the
 * transform's domain (a zero or a negative under log, a negative under sqrt) is missing: it is
 * not drawn, not picked, and left out of automatic domains.
 */
export type ScaleTransformName = "linear" | "log" | "sqrt" | "symlog";
export interface NormalizationResource {
  readonly isNormalization: true;
  readonly id: string;
  readonly version: number;
  readonly domain: [number, number] | null | undefined;
  readonly transform: ScaleTransformName;
  /** symlog's constant c (1 unless set). */
  readonly constant: number;
  /** The value mapped to the middle of the range, or undefined. */
  readonly midpoint: number | undefined;
  readonly domainSource: "data" | "source";
  snapshot(): {
    domain?: [number, number];
    transform: string;
    domainSource: string;
    constant?: number;
    midpoint?: number;
  };
  update(patch: {
    domain?: [number, number];
    transform?: ScaleTransformName;
    domainSource?: "data" | "source";
    constant?: number;
    midpoint?: number | null;
  }): NormalizationResource;
  subscribe(listener: () => void): () => void;
}
export interface ContinuousScale {
  readonly isContinuous: true;
  readonly id: string;
  /** Guide title for every mark sharing this scale (from `continuous({label})`). */
  readonly title?: string;
  readonly normalization: NormalizationResource;
  readonly domain: [number, number] | null;
  readonly range?: [number, number];
  readonly colormap?: ColormapSpec;
  readonly quantize: boolean;
  readonly levels: number;
  /** The color of a missing value, when the scale sets one (else the theme's). */
  readonly missing?: string;
  update(patch: {
    range?: [number, number];
    colormap?: ColormapSpec | null;
    quantize?: boolean;
    levels?: number;
    missing?: string | null;
  }): ContinuousScale;
  subscribe(listener: () => void): () => void;
}
export interface ContinuousScaleConfig {
  /** A shared normalization resource: scales that take the same one share its domain, transform and midpoint (configure those on it, not here). */
  normalization?: NormalizationResource;
  /** Two numbers, or "symmetric": the data's extent centered on zero (R2.0). */
  domain?: [number, number] | "symmetric";
  /** How values map to the range: "linear" (default), "log", "sqrt" or "symlog". */
  transform?: ScaleTransformName;
  /** symlog's constant c > 0 (default 1): the transform is linear within ±c. */
  constant?: number;
  /**
   * A diverging scale's center (d3's scaleDiverging): the domain's halves map to the range's
   * halves, [lo, midpoint] to [0, 0.5] and [midpoint, hi] to [0.5, 1], each linearly in
   * transformed space, so a diverging colormap's middle color falls on the midpoint and both of
   * its ends are used. An explicit domain must contain it; an automatic one grows to. Value
   * scales only (color, size, width), not position axes.
   */
  midpoint?: number;
  /** Where an automatic domain comes from: "data" (default), the rows the mark draws, or "source", the table before Filters, so colors stay put while a filter changes. */
  domainSource?: "data" | "source";
  /** The output range of a size or width scale, in CSS pixels. */
  range?: [number, number];
  /** The colors of a color scale: a colormap name ("Viridis") or a list of colors. */
  colormap?: ColormapSpec;
  /** Step the values into `levels` colors instead of a smooth gradient. */
  quantize?: boolean;
  /** How many colors quantize steps through. */
  levels?: number;
  /**
   * The color a missing value (NaN or null) of a colormapped fill or color draws in, on screen,
   * in exports and in its legend (default: the theme's `missing`, a neutral gray). A color scale
   * only: a scale with a numeric range has no colors.
   */
  missing?: string;
  /** Title of the legend guide shared by the marks using this scale. */
  label?: string;
}
export type AppearanceScaleDefaults = Partial<
  Record<
    "color" | "size" | "width",
    Omit<ContinuousScaleConfig, "normalization">
  >
>;
export interface DictionaryColumn {
  codes: any;
  categories: CategoryValue[];
}
/** literal(value): a constant, even where a column of that name exists. */
export interface LiteralValue {
  readonly value: unknown;
}
/** A color from separate columns (or arrays): 0-255 for integer data, 0-1 for floats. */
export interface RgbChannels {
  r: string | NumericColumn;
  g: string | NumericColumn;
  b: string | NumericColumn;
  a?: string | NumericColumn;
}
/** animate(value, {duration, easing, enter, exit}): the mark interpolates the channel per row. Numeric endpoint expressions read new data for enter and previous data for exit; missing components retain their channel value. */
export interface AnimatedChannel {
  readonly __hmplotAnimate: true;
  readonly value: unknown;
  readonly duration?: number;
  readonly easing?: AnimationOptions["animationEasing"];
  readonly enter?: unknown;
  readonly exit?: unknown;
}
/**
 * What a mark channel (x, y, fill, size, ...) accepts: a column name (for fill and color also a
 * CSS color), a constant, per-row values (an array, a typed array or a GPU array), a dictionary
 * column, an expression, literal(value), an {r, g, b, a?} color for fill and color, or
 * animate(...) around one of these.
 */
export type Channel =
  | string
  | number
  | boolean
  | readonly unknown[]
  | ArrayBufferView
  | import("@hmplot/jax").Array
  | DictionaryColumn
  | Expression
  | LiteralValue
  | RgbChannels
  | AnimatedChannel;
export type LogicalColumnType =
  | "numeric"
  | "categorical"
  | "ordinal"
  | "boolean"
  | "datetime"
  | "duration"
  | "geometry";
export type ColumnSchema =
  | LogicalColumnType
  | {
      type: LogicalColumnType;
      domain?: any[];
      unit?: "ns" | "us" | "ms" | "s" | "m" | "h" | "d";
      timezone?: string;
    };
export type DataSchema = Record<string, ColumnSchema>;
export type DataTable = Record<string, any> | Record<string, any>[];
/** A field a tooltip lists: a column name, or one with a label and a format (TODO 44). */
export type TooltipField =
  | string
  | {
      field: string;
      /** Shown instead of the column's name. */
      label?: string;
      /** A d3-format string for numbers (default: the theme's numbers.format, else four significant digits with whole numbers kept and thousands grouped, as ticks read), a %-pattern for datetimes. */
      format?: string;
    };
/** A tooltip's settings (TODO 44). */
export interface TooltipOptions {
  /** The fields to list (default: the columns the mark's channels read). */
  fields?: TooltipField[];
  /** How near the pointer a row is found, in CSS pixels (default 16). */
  radius?: number;
  /** Svelte only: the box's content, given { values, row, mark, lines }. */
  content?: Snippet<
    [
      {
        values: Record<string, unknown>;
        row: number;
        mark: string;
        lines: { label: string; text: string }[];
      },
    ]
  >;
}
/** true: the columns a mark's channels read; a list picks the fields; an object sets more. */
export type TooltipSetting = boolean | TooltipField[] | TooltipOptions;
/** nearest's settings (TODO 72). */
export interface NearestOptions {
  /** Where @nearest is written (default: the data's own nearest). */
  selection?: SelectionResource;
  /** How near the pointer a drawn row is found, in CSS pixels (default the tooltip's radius, else 16). */
  radius?: number;
}

/** Title (TODO 46): plain text in a layout, drawn as SVG text so its SVG and PDF exports are vector and searchable. For publications; Markdown is for dashboards. */
export interface TitleProps extends RuntimeSettings<"Title"> {
  /** The text: plain, with "\n" breaking a line and {$name} showing an input's value; or a list of parts, strings and live values (a readout): a reduction over the Data around it, such as count({ where: "@brushed" }), or { value, format } with a d3-format string. A live value follows the data and its selections, written as tooltips write numbers; "—" when no row has one. */
  text?:
    | string
    | Array<string | Expression | { value: Expression; format?: string }>;
  /** "title" (default), "subtitle", "caption", or pixels: the presets follow the theme's text size. */
  size?: "title" | "subtitle" | "caption" | number;
  /** A CSS font weight. Default 600 for a title, 400 otherwise. */
  weight?: number | "normal" | "bold";
  /** Default "left". */
  align?: "left" | "center" | "right";
  /** Default the theme's text color. */
  color?: string;
  /** A CSS font-family. Default the theme's (the plot font). */
  font?: string;
  /** Wrap words at the block's width (default true); false keeps each line whole. */
  wrap?: boolean;
  name?: string;
}
/** Markdown (TODO 46): a text block for dashboards in a layout (Python hm.Markdown): CommonMark with GitHub's tables, strikethrough, task lists and autolinks, and $math$ / $$math$$. Raw HTML is not rendered. Exports as an image of how it looks. */
export interface MarkdownProps extends RuntimeSettings<"Markdown"> {
  /** The markdown; {$name} shows an input's value, as the input shows it. */
  text?: string;
  /** The block's maximum width: pixels, or a CSS length. Default the container's. */
  width?: number | string;
  /** The body text size in pixels (headings scale with it). Default the theme's text size + 1. */
  fontSize?: number;
  /** Default the theme's text color. */
  color?: string;
  /** A CSS font-family. Default the theme's. */
  font?: string;
  /** Default "left". */
  align?: "left" | "center" | "right";
  name?: string;
}
/** A title, subtitle and caption on a Plot or Facet (TODO 46). */
export interface PlotTitleProps {
  /** A title above the plot, drawn by the plot on screen and in its PNG, SVG, PDF and HTML exports (as text), in the theme's font and text color. */
  title?: string;
  /** A line under the title, smaller and lighter. */
  subtitle?: string;
  /** A note under the plot (its source, or a caption), smaller and lighter. */
  caption?: string;
}

export interface PlotProps
  extends AnimationOptions, BoundsAnimationOptions, PlotTitleProps {
  /** Column or columns matching rows across animation snapshots, inherited by descendants. Overrides Data.key for motion only; groups must be unique after filtering/transforms. null restores Data.key, then position. */
  animationGroup?: string | string[] | null;

  /** Your description of the plot for screen readers and exports, read first; the generated summary (its marks, axes and legend) follows unless describe is false. */
  description?: string;
  /** Add the generated summary of the plot's marks, axes and legend to its description (default true). */
  describe?: boolean;
  /** The default tooltip of the marks in the Plot (off by default). { mode: "x" } lists every series' value at the pointer's x in one box (2D Cartesian frames). */
  tooltip?: TooltipSetting | (TooltipOptions & { mode?: "row" | "x" });
  /** The default nearest of the marks in the Plot that have rows (off by default): each marks the row its tolerant pick finds as @nearest. */
  nearest?: MarkProps["nearest"];
  loading?: "atomic" | "progressive";
  background?: string;
  /** A table or live pipeline output for the marks in the plot; the same as wrapping them in Data. */
  data?: DataProps["value"];
  schema?: DataSchema;
  key?: string | string[];
  x?: AxisDefinition;
  y?: AxisDefinition;
  z?: AxisDefinition;
  /** Defaults for the continuous color, size and width scales this plot's marks infer (R2.0). */
  scaleDefaults?: AppearanceScaleDefaults;
  /** The height exaggeration of surfaces and extrusions (default 1). A categorical z axis is z={{ scale }}. */
  zScale?: number;
  legend?: boolean | { position?: LegendPosition };
  /** Polar reads X as angle and Y as radius; spherical reads X/Y as longitude and latitude. */
  coordinates?: "cartesian" | "polar" | "spherical";
  /** Polar cylinder axis. 2D plots use Z. */
  polarAxis?: "X" | "Y" | "Z";
  sphericalView?: "globe" | "projected";
  /** Orbit rotates around a target; flyover works like a map: a drag keeps the ground point under the cursor, the wheel zooms toward the cursor (scroll down = away), right-drag or Alt-drag looks, WASD/QE fly (Shift = x3 on wheel and keys), and on touch two fingers pinch toward their midpoint. */
  cameraMode?: "orbit" | "flyover";
  /** 3D camera position in world units; a new value moves the camera there (easing with the
   * Plot's animation). Default scales [90, 70, 140] to the scene. */
  cameraPosition?: [number, number, number];
  /** Point the 3D camera looks at. Default [0, 0, 0]. */
  cameraTarget?: [number, number, number];
  /** 3D camera up direction, overriding the view preset. Default [0, 0, 1] for type="3d", [0, 1, 0] for type="3d-y-up". */
  cameraUp?: [number, number, number];
  /** 3D camera vertical field of view in degrees. Default 50. */
  cameraFov?: number;
  /** 3D camera near clipping distance. Default derives from the scene size. */
  cameraNear?: number;
  /** 3D camera far clipping distance. Default derives from the scene size. */
  cameraFar?: number;
  /** Flyover speed multiplier for the wheel zoom and key travel (the drag follows the cursor). Default 1, clamped to [0.1, 10]. */
  flySpeed?: number;
  /** Flyover momentum (default true): a ground drag released while moving glides on along the ground for a moment, slowing to a stop (height and direction kept). false stops the view on release, as reduced motion does. Any new input stops a glide. */
  flyoverMomentum?: boolean;
  /**
   * Effects composited over the whole plot after its marks are drawn, in their stage's order:
   * { kind: "sky", ... } (a 3D plot's sky), { kind: "bloom", strength, radius } (how glowing
   * marks bloom), { kind: "fog", near, far, color } (a 3D plot's distance fog), or a registered
   * plugin's kind with its parameters. A kind no plugin registers is skipped with a warning.
   * SVG and PDF exports draw the whole plot as an image while an effect shows.
   */
  effects?: EffectSpec[];
  /** Lights for lit marks: ambient, directional, hemisphere or point. Positions use world units; omitted, no lights are added. */
  lights?: LightSpec[];
  /** Called at most once per frame after the 3D camera moves. */
  oncamerachange?: (camera: CameraState) => void;
  /** The globe behind a spherical plot: a color shows it, false hides it (the default). */
  globeBackground?: string | false;
  /** Unit of polar and spherical angles. "extent" makes the X domain one turn; "custom" uses anglePeriod. Default degrees. */
  angleUnit?: "degrees" | "radians" | "extent" | "custom";
  /** Angle units per full turn when angleUnit is "custom", for example 24 for hours. */
  anglePeriod?: number;
  baseRadius?: number;
  radialScale?: number;
  /**
   * Map projection of 2D spherical coordinates. Equirectangular, mercator and equal-area are
   * cylindrical and repeat across the antimeridian. Orthographic draws a globe that drags to
   * rotate. "equal-earth" and "natural-earth" (world maps), "albers" (conic equal-area; see
   * `parallels`) and "albers-usa" (d3's composite: the lower 48, with Alaska and Hawaii as
   * insets) have curved outlines: one extent around the center longitude, cut at its seam, with a
   * graticule and outline instead of edge axes.
   */
  projection?:
    | "equirectangular"
    | "mercator"
    | "equal-area"
    | "orthographic"
    | "equal-earth"
    | "natural-earth"
    | "albers"
    | "albers-usa";
  /**
   * Map center [longitude, latitude], in angleUnit: the orthographic globe's initial north-up
   * center; for equal-earth, natural-earth and albers the central meridian (the seam is opposite),
   * and for albers the latitude at the origin too (d3.geoAlbers's United States is [-96, 38.7]).
   */
  projectionCenter?: [number, number];
  /** albers' two standard parallels, in angleUnit (default [29.5, 45.5], d3.geoAlbers's). */
  parallels?: [number, number];
  interpolation?: "great-circle" | "angular" | "cartesian";
  subdivisionTolerance?: number;

  zoomAxis?: "xy" | "x" | "y";
  axisMarginZoom?: boolean;
  /** Fit axis margins during navigation (default true). False fits initially, then keeps this plot's own margins while panning/zooming. Size, font, style and data-domain changes refit; aligned plots can still reserve space for peers. Longer labels may be clipped. */
  dynamicMargins?: boolean;
  overviewScale?: number;
  overviewMaxInstances?: number | null;
  /** Cartesian 3D guides: false hides them, true uses theme defaults, an object configures them. */
  axes3d?: boolean | Axes3DConfig;
  /** Full border for a rectangular 2D Cartesian plot; defaults to theme.axes.frame. */
  axisFrame?: boolean;
  /** Clip marks and picking to the rectangular 2D Cartesian axes interior; defaults to theme.axes.mask. */
  axisMask?: boolean;
  /** Equal transformed data units on all Cartesian axes, including 3D; auto fills the plot. In
   * 2D an explicit domain is kept: the plot area letterboxes instead of widening it. */
  aspect?: "auto" | "equal";
  overviewAxes?: boolean | { x?: boolean; y?: boolean };
  rules?: ReferenceRule[];
  /** Shaded spans of the x or y axis behind the marks and grid lines, labelled like rules. */
  bands?: ReferenceBand[];
  /** Normalized plot-domain center and camera zoom, shared between plot instances. With the
   * Plot's animation on, a new value eases there and the viewer's press or wheel stops it. */
  viewport?: {
    x: number;
    y: number;
    zoom: number;
    zoomX?: number;
    zoomY?: number;
    /** Orthographic longitude/latitude center, in the active root's angle units. */
    center?: [number, number];
  };
  onviewportchange?: (viewport: Viewport2D) => void;
  /** How the viewer moves the view. true (default): a drag pans, the wheel zooms, Shift-drag brushes a mark with brush. "brush": a plain drag brushes, Shift-drag pans, the wheel still zooms. false: the view stays put, and a plain drag brushes. */
  interactive?: boolean | "brush";
  name?: string;
  /** A fixed width in pixels. Without one the Plot fits its container up to 800 px; in a scene's host (a Python notebook view or exported page) it fills it. */
  width?: number;
  /** The whole plot's height in pixels (450): its title, caption and top or bottom legends take their room from it, and the drawing area keeps the rest (at least a quarter). */
  height?: number;
  /** True fills the container without the default 800 px cap, even when width is set; false uses width or 800 px. Omitted without width fits the container up to 800 px, or fills a scene's host. */
  responsive?: boolean;
  /** A 2D plot (default), a Z-up 3D plot ("3d"), or a Y-up 3D plot ("3d-y-up"). cameraUp overrides either 3D preset. SVG and PDF exports draw a 3D plot's 2D marks as vectors sorted by depth, and its marks as one image when one has no vector form there (a 3D mark, a Heatmap). */
  type?: "2d" | "3d" | "3d-y-up";
  settings?: PlotSettings;
  /** Three.js tone mapping constant: 0 (the default) keeps colors exact; 4 (ACES filmic) gives lit
   * 3D scenes a photographic look. */
  toneMapping?: number;
  children?: Snippet;
  toolbar?: Snippet;
  overview?: boolean;
  /** Draw axes by default only for 2D Cartesian plots, and a 2D orthographic globe's outline and graticule. */
  axes2d?: boolean;
  /** An X/Y/Z orientation indicator in the lower left while a 3D plot is hovered. Default false. */
  orientation3d?: boolean;
  /** Draw the axes' tick labels. Default true. */
  axisTickLabels?: boolean;
  /** Draw axis titles (2D and the 3D box). Default true. */
  axisTitles?: boolean;
  /** On-screen antialiasing: "msaa" (4x, the default), "ssaa8" or "ssaa16" (hybrid 4x MSAA
   * plus 2x/4x the rendered pixels, then downsampling; more GPU work), "smaa" (a post pass,
   * faster on fill-bound scenes but softer lines) or "off". Points, lines and text smooth their own edges, and so do
   * 2D Rects, Bars and Histograms without MSAA; other fills need it. Exports always use 4x MSAA. */
  antialias?: "msaa" | "ssaa8" | "ssaa16" | "smaa" | "off";
  /** Infer missing x, y and z domains from the plotted data. Defaults to true when Plot
   * receives or inherits data; set true explicitly when only descendant Data scopes supply
   * the tables. Python enables it by default. An explicit domain always wins. */
  autoBounds?: boolean;
}
/** A scene light for lit marks. Positions use world coordinates. */
export interface LightSpec {
  /** Ambient reaches every surface; directional aims toward the origin; hemisphere blends sky and ground; point shines from a position. */
  kind: "ambient" | "directional" | "hemisphere" | "point";
  /** A CSS color, default white. */
  color?: string;
  /** Light strength, at least zero; default 1. */
  intensity?: number;
  /** World position for directional and point lights; the up direction for hemisphere. Default [0, 1, 0], or [0, 0, 0] for point. */
  position?: [number, number, number];
  /** Hemisphere light's ground color, default white. */
  groundColor?: string;
  /** Point light's maximum reach in world units; default 0 means unlimited. */
  distance?: number;
  /** Point light's distance falloff exponent: default 2 is inverse square, 0 is constant. */
  decay?: number;
}

/**
 * One of a Plot's effects (TODO 138.3): its kind and its parameters.
 * - "sky" (a 3D plot): `image`, an equirectangular image (longitude across, north up) around the
 *   camera (a URL, ImageBitmap, HTMLImageElement or HTMLCanvasElement; the plot waits for it to
 *   load), or a gradient from `zenith` (default "#4a7cc4") to `horizon` (default "#d6e4f2") to
 *   `ground` (default the horizon's); `rotation` [x, y, z] in degrees about its own axes (its up
 *   is the camera's up); `visible: false` hides it, its image still loaded.
 * - "bloom": how glowing marks bloom: `strength` (at least 0, default 1) and `radius` (0 tight to
 *   1 wide, default 0.5). A mark's `glow` turns bloom on; without this its defaults apply.
 * - "fog" (a 3D plot): the scene blends toward `color` from `near` to `far`, distances from the
 *   camera in world units (0 <= near < far); `color` defaults to the plot's background, or the
 *   theme's when the plot is transparent. Fog is blended before the tone mapper.
 * - any other kind: a plugin's effect (registerPlugin), with the parameters its schema declares.
 */
export interface EffectSpec {
  kind: "sky" | "bloom" | "fog" | (string & {});
  [parameter: string]: unknown;
}
/**
 * A mark's shade (TODO 138.3): the kind a plugin declared with hm.shade, and the parameters its
 * schema declares. Every mark's shade reads `color`, `screenCoordinate`, `screenUV`, `time` and
 * `params`; marks with surface normals (Points3D, Prism, Surface, Arrows3D, GeoJSON's faces, a
 * Heatmap, a lit Image) also `normalView` and `positionView`.
 */
export interface ShadeSpec {
  kind: string;
  [parameter: string]: unknown;
}
/** Marks accept literal, array, JAX-array and inherited option inputs. */
/**
 * Omit for a props type with an index signature ([option: string]: any, as MarkProps has).
 * TypeScript's Omit keeps only the signature and drops every named prop, so PrismProps,
 * GeoJSONProps and RoutesProps had lost MarkProps' channels (TODO 40.2); a type built with this
 * one re-declares the signature itself.
 */
export type OmitNamed<T, K extends PropertyKey> = {
  [
    P in keyof T as string extends P
      ? never
      : number extends P
        ? never
        : P extends K
          ? never
          : P
  ]: T[P];
};

/** A picked mark item. Row provenance is absent for marks without tabular data. */
export interface MarkEvent {
  nativeEvent: PointerEvent | MouseEvent;
  /** Drawn row after transforms; only present when a row mapping is available. */
  rowIndex?: number;
  /** Original table row for a nonaggregated item. */
  sourceRow?: number;
  instanceId?: number;
  /** Aggregate key/value metadata; use getContributors for source membership. */
  aggregate?: Readonly<Record<string, unknown>>;
  getContributors?: () => Promise<unknown>;
  point: { x: number; y: number; z: number };
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}
export interface MarkEvents<E = MarkEvent> {
  /** A click on a drawn item, after selection state updates. */
  onclick?: (event: E) => void;
  /** A double click on a drawn item. */
  ondblclick?: (event: E) => void;
  /** A context-menu gesture on a drawn item. */
  oncontextmenu?: (event: E) => void;
  onpointerenter?: (event: E) => void;
  onpointerleave?: (event: E) => void;
  onpointermove?: (event: E) => void;
  onpointerdown?: (event: E) => void;
  onpointerup?: (event: E) => void;
  onpointercancel?: (event: E) => void;
  onpointerover?: (event: E) => void;
  onpointerout?: (event: E) => void;
  /** A click that missed every drawn item. */
  onpointermissed?: (event: MouseEvent) => void;
}
export interface MarkProps extends AnimationOptions, MarkEvents {
  x?: Channel;
  y?: Channel;
  z?: Channel;
  fillScale?: CategoricalScale | ContinuousScale;
  colorScale?: CategoricalScale | ContinuousScale;
  /** A continuous fill's or color's colormap: a name, a list of colors, or a custom map. */
  colormap?: ColormapSpec;
  /** Continuous (numeric columns) or categorical/ordinal with a numeric range (category columns). */
  sizeScale?: ContinuousScale | CategoricalScale;
  /** Continuous (numeric columns) or categorical/ordinal with a numeric range (category columns). */
  widthScale?: ContinuousScale | CategoricalScale;
  /** Maps categories in the `shape` column to shape names (built-in or registered). */
  shapeScale?: CategoricalScale;
  /** Categorical colors for a category column in `outlineColor` on outlined marks. */
  outlineColorScale?: CategoricalScale;
  /** Categorical opacities (0-1) for a category column in `opacity`. Numeric opacity columns are used as-is. */
  opacityScale?: CategoricalScale;
  label?: string;
  legend?: boolean;
  visible?: boolean;
  /** Whether the mark's data counts toward its axes' automatic domains; false leaves them to the other marks (a reference line, a decorative part). */
  domains?: boolean;
  /** "auto" draws one item when no channel reads a column (a line at a value, a label at a point), instead of one per row of the data; "@" view-state fields are not columns. */
  rows?: "auto";
  textureResolution?: [number, number];
  interpolation?: "great-circle" | "angular" | "cartesian";
  identity?: DataIdentity;
  /** Click to replace the selection; clicking the exact same source rows again clears it (@selected). Shift/Meta/Ctrl-click toggles membership: true uses its data's selection, or give a selection(). Line, Area select a whole series (the mark, without series). { input, column } writes an input instead (InputWrite): a click sets it to the clicked row's value. */
  select?: boolean | SelectionResource | InputWrite;
  /** Mark the row under the pointer as @hovered: true uses its data's hover, or give a selection(). Line, Area highlight a whole series (the mark, without series). Hover fades nothing by itself: respond="hovered" fades the other rows, and a channel can read @hovered. { input, column } writes an input instead (InputWrite): it shows the hovered row's value while the pointer is on it. */
  hover?: boolean | SelectionResource | InputWrite;
  /** Show the nearest row's values in a box beside it (off by default; the Plot's tooltip is the default). true lists the columns the channels read; a list picks the fields ({ field, label, format }); { fields, radius, content } sets the radius in CSS pixels (default 16) and, in Svelte, the content. The row is the one nearest marks as @nearest. */
  tooltip?: TooltipSetting;
  /** Mark the row a tooltip shows as @nearest, with or without the tooltip: the row under the pointer, else the nearest drawn row within radius CSS pixels (default the tooltip's radius, else 16), so a small point or a 1 px line is easy to reach (hover is only the row exactly under the pointer; nearby, the rows within a radius in data space). true uses its data's nearest; or give a selection(), or { selection, radius }. Line, Area mark a whole series (the mark, without series). Fades nothing by itself: respond="nearest" fades the other rows. A mark with a tooltip marks its row so without nearest (except in a unified-x Plot). */
  nearest?: boolean | SelectionResource | NearestOptions;
  /** Make the mark a brush source (Shift-drag; a plain drag in a Plot with interactive="brush", where Shift-drag pans, or interactive=false). true uses the data's own brush; a SelectionResource shares one; {selection, axis} also picks the brushed axis: "x", "y", or "xy" (default; "x" for Area). In the plot interior Shift-drag brushes a rectangle; inside a child Frame, Shift-drag on the frame's tick strip brushes its column and the band stays on the strip. Drag a band's edges or middle, scroll over it, or use Arrow keys to edit it; Escape clears the last edited band. Point marks (Points, Points3D, Text, Swarm) and series marks (Line, Area) in Cartesian 2D with named x/y columns; a series mark brushes every row of each series with a row inside. */
  brush?:
    | boolean
    | SelectionResource
    | { selection?: SelectionResource; axis?: "x" | "y" | "xy" };
  /** Mark rows near the pointer (preview only, like hover). radius defaults to 24 in `units` ("px" or data "data"; a data radius is measured after the axis transform, so on a log axis radius r reaches a factor of e^r); axis "x" or "y" tests one dimension. Point marks in Cartesian 2D with named x/y columns. */
  nearby?:
    | boolean
    | SelectionResource
    | {
        selection?: SelectionResource;
        radius?: number;
        units?: "px" | "data";
        axis?: "x" | "y" | "xy";
      };
  /** Which interaction state fades this mark's other rows to selectionOpacity. Omitted: the states it produces except hover and nearest (select, brush, nearby); hovering fades only when asked, with "hovered", and nearest with "nearest". true: every data-owned state; false: none. Otherwise a name or list of names, "selected", "brushed", "hovered", "nearby" or "nearest" (aliases "selection", "brush", "hover"; a leading @ is allowed), or SelectionResource values. nearby fades the other rows only while some row is nearby. */
  respond?:
    | boolean
    | "selected"
    | "brushed"
    | "hovered"
    | "nearby"
    | "nearest"
    | SelectionResource
    | Array<
        | "selected"
        | "brushed"
        | "hovered"
        | "nearby"
        | "nearest"
        | SelectionResource
      >;
  selectionOpacity?: number;
  /** How rows that arrive in a keyed update appear: "fade" fades them in (true is "fade"), or { effect, duration, easing } times the fade. An effect on the row as a whole; animate()'s `enter` option is the value a channel starts from. */
  enterEffect?:
    | boolean
    | "fade"
    | {
        effect?: "fade";
        duration?: number;
        easing?: AnimationOptions["animationEasing"];
      };
  /** How rows that leave in a keyed update disappear, as enterEffect: "fade" fades them out before they are removed. animate()'s `exit` option is the value a channel ends at. */
  exitEffect?:
    | boolean
    | "fade"
    | {
        effect?: "fade";
        duration?: number;
        easing?: AnimationOptions["animationEasing"];
      };

  /** How a mark's fragments composite: "normal" (default), "additive", "multiply", "screen", or
   * "subtractive". Every mode but normal draws the mark transparent; SVG export keeps screen and
   * multiply as mix-blend-mode and rasterizes the others. */
  blend?: "normal" | "additive" | "multiply" | "screen" | "subtractive";
  /** How much the mark glows: its own color times glow blooms around it (0, the default, does
   * not glow). A number of at least 0; the Plot's bloom effect sets the bloom's strength and
   * radius. Marks drawn onto a Surface do not glow. SVG and PDF exports draw the whole plot as an
   * image. */
  glow?: number;
  /** A plugin's shade (registerPlugin): `{ kind, ...parameters }`, as
   * `{ kind: "hatch", spacing: 6 }`, recolors each fragment the mark draws. It cannot move or hide
   * geometry, so picking, tooltips, domains and legends are unchanged. SVG and PDF exports draw a
   * shaded mark as an image. */
  shade?: ShadeSpec;
  /** Point marks: "px" sizes in CSS pixels whatever the zoom (default for Points);
   * "data" makes size a length in data units of the x axis, so a size-1 square
   * tiles a unit grid and zooming scales the points (default, and only choice, for Points3D). */
  sizeUnits?: "px" | "data";
  sampling?: "random" | "uniform-x";
  maxInstances?: number | null;
  /** A shape name for every point (built-in or registered with registerShape; sphere or cube for
   * Points3D), a column mapping categories to shapes, or an array with one shape name per row. */
  shape?:
    | "circle"
    | "square"
    | "diamond"
    | "triangle"
    | "hexagon"
    | "plus"
    | "cross"
    | "star"
    | "sphere"
    | "cube"
    | (string & {})
    | readonly string[]
    | DictionaryColumn;
  rotation?: number;
  name?: string;
  options?: string[];
  position?: Channel;
  fill?: Channel;
  color?: Channel;
  size?: Channel;
  width?: Channel;
  /** 0 to 1: a number, or a column of numbers (a category column maps through opacityScale). */
  opacity?: Channel;
  /** The outline's color: a CSS color, or a column mapped through outlineColorScale. */
  outlineColor?: Channel;
  /** The outline's width in CSS pixels, drawn inside the edge (a point's at most its radius). */
  outlineWidth?: Channel;
  /** Border opacity from 0 to 1 (default 1): a number, numeric column, array or expression. Fades the outline over the fill; mark opacity still applies to both. Missing values hide the border. */
  outlineOpacity?: Channel;
  /** Split Line, Area rows into independent ordered paths. */
  series?: string | string[] | readonly unknown[] | DictionaryColumn;
  /**
   * Drag rows to move them (point marks: Points, Points3D, Text). true
   * drags along every numeric axis of the view (a categorical axis is skipped); "x", "y",
   * "xy" or "xyz" name the axes. A drag writes offsets on the table's rows and never changes
   * its data: this mark and every other view follow only where their positions read
   * moved("column"). Dragging a selected row moves the whole selection; Escape cancels.
   */
  drag?: boolean | "x" | "y" | "z" | "xy" | "xz" | "yz" | "xyz";
  /** While a row of this mark is dragged, each time its offsets change. */
  ondrag?: (event: MarkDragEvent) => void;
  /** When a drag of this mark's rows ends; `cancelled` when Escape restored the offsets. */
  ondragend?: (event: MarkDragEvent & { cancelled: boolean }) => void;
  start?: Channel;
  end?: Channel;
}

export type CalendarInterval = {
  unit:
    | "millisecond"
    | "second"
    | "minute"
    | "hour"
    | "day"
    | "week"
    | "month"
    | "year";
  step: number;
};
export interface ReferenceRule {
  /** "x" draws a vertical rule at an x value, "y" a horizontal one. */
  axis: "x" | "y";
  /** Where the rule is, in the axis's units: a number, a Date or an ISO date. */
  value: number | Date | string;
  /** Text at the rule's end. */
  label?: string;
  /** The rule's color; default the axis text color. */
  color?: string;
  /** The rule's stroke width in CSS pixels. */
  width?: number;
  /** Alternating dash and gap lengths in CSS pixels; [] or omitted draws a solid rule. */
  dash?: number[];
}

/** A shaded span of an axis, drawn behind the marks and grid lines (TODO 46). */
export interface ReferenceBand {
  /** "x" shades a vertical strip (in a polar frame, a wedge of angles), "y" a horizontal one (a ring of radii). */
  axis: "x" | "y";
  /** One end, in the axis's units: a number, a Date, or an ISO date ("2024-03-01" or
   * "2024-03-01T09:30" in the axis's time zone, or with an offset such as "2024-03-01T12:00:00Z"). */
  from: number | Date | string;
  /** The other end (either order). */
  to: number | Date | string;
  /** Text at the band's start, like a rule's label. */
  label?: string;
  /** A six-digit hex color. Default the axis text color. */
  color?: string;
  /** 0 to 1. Default 0.1. */
  opacity?: number;
}

/** Opaque source; owned by its plot, with no exposed GPU or scene objects. */
declare const minimapBrand: unique symbol;
export interface MinimapSource {
  readonly [minimapBrand]: true;
}
export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
  near: number;
  far: number;
  zoom: number;
  mode: "orbit" | "flyover";
}
/** A completed 2D Cartesian draw's immutable mapping. Positions are canvas-local CSS pixels. */
export interface ScreenMapping {
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  project(point: {
    x: number;
    y: number;
  }): { x: number; y: number; inside: boolean } | null;
  unproject(point: { x: number; y: number }): { x: number; y: number } | null;
}
/** One ordinary HTML attachment in its enclosing frame's numeric coordinates; omitted from plot exports. */
export interface HtmlProps extends RuntimeSettings<"Html"> {
  /** Scalar x coordinate in the enclosing frame. */
  x: number;
  /** Scalar y coordinate in the enclosing frame. */
  y: number;
  /** Horizontal offset in CSS pixels. */
  dx?: number;
  /** Vertical offset in CSS pixels. */
  dy?: number;
  /** Native HTML content, preserving its Svelte context and state. */
  children?: Snippet;
}
export interface ScreenMappingHandle {
  /** The last completed draw's mapping; null before drawing, after disposal or for unsupported coordinates. */
  getScreenMapping(): ScreenMapping | null;
  /** Receives the current mapping immediately and changes after completed draws. Returns an unsubscribe function. */
  subscribeScreenMapping(
    listener: (mapping: ScreenMapping | null) => void,
  ): () => void;
}
export interface PlotHandle extends ScreenMappingHandle {
  getFrames(): FrameHandle[];
  /** The plot's description as screen readers get it (description=, then the generated summary), updated when the plot settles after a change. */
  getDescription(): string;
  /** The plot's title as shown ("" without one). */
  getTitle(): string;
  /** Called with the description whenever it changes, and once at once; returns a function that stops it. */
  subscribeDescription(listener: (text: string) => void): () => void;

  getSelection(): SelectionResource | undefined;
  getBrush(): SelectionResource | undefined;
  clearBrush(): void;
  getHover(): SelectionResource | undefined;
  /** The table's offsets (dragging; TODO 38). */
  getOffsets(): OffsetLayer | undefined;
  /** Clear the table's offsets in `columns` (every column when omitted). */
  resetOffsets(columns?: string | string[]): void;
  /** The table as given, with each column that has offsets replaced by its moved values. */
  applyOffsets():
    Record<string, unknown> | Record<string, unknown>[] | undefined;
  openSettings(anchorElement?: unknown): void;
  closeSettings(): void;
  beginUpdate(): () => Promise<void>;
  /** Resolves once the changes made before the call are drawn; later changes are not waited for. */
  whenSettled(): Promise<void>;
  whenAnimationsFinished(): Promise<void>;
  exportPNG(options?: { scale?: number }): Promise<Blob>;
  exportSVG(options?: DocumentExportOptions): Promise<DocumentExportResult>;
  exportPDF(options?: DocumentExportOptions): Promise<DocumentExportResult>;
  /** The animation as an MP4 (H.264, else VP9) encoded in the browser with WebCodecs: one PNG
   * export per frame at a frozen clock time from `start` for `duration` ms; the clock is
   * restored afterwards. Loads hmplot/video on first use. */
  exportVideo(options: {
    duration: number;
    fps?: number;
    start?: number;
    scale?: number;
  }): Promise<Blob>;
  getRenderError(): string;
  /** Resolves once the viewport is applied, like setCamera. */
  setViewport(
    viewport: Partial<Viewport2D>,
    axes?: "x" | "y" | "xy",
  ): Promise<void>;
  getViewport(): Viewport2D;
  /** The 3D camera state, or undefined for a 2D plot. */
  getCamera(): CameraState | undefined;
  /** Merge a partial 3D camera state; {animate: true} eases over the plot's animationDuration. */
  setCamera(
    camera: Partial<Omit<CameraState, "mode">>,
    options?: { animate?: boolean },
  ): Promise<void>;
  /** The clock in milliseconds, shared by the Plots of its scope (an InputContext, a Scene, a
   * standalone Facet or a Simulate; else the Plot's own): 0 when the scope starts, advanced by
   * the frame time while anything in it animates, still while frozen. `@time` and every
   * transition read it. */
  getAnimationTime(): number;
  /** Whether setAnimationTime froze the clock. */
  getAnimationTimeFrozen(): boolean;
  /** Set the clock of the Plot's scope. With freeze (default) it stops there until
   * setAnimationTime(null) resumes it, so exports capture that moment: transitions and @time
   * channels both hold their position at that time, and a step forward moves the scope's
   * Playbacks and Simulates by it. Resolves after this Plot has drawn at it. */
  setAnimationTime(
    time: number | null,
    options?: { freeze?: boolean },
  ): Promise<void>;
  /** Reset the view: 2D returns to the full domain; 3D recomputes the camera position. */
  fit(): void;
  holdAnimations(): () => void;
  subscribeSettings(
    listener: (values: Record<string, unknown>) => void,
  ): () => void;
}
export interface DocumentExportOptions {
  /** The page width: CSS pixels, or a CSS length ("20cm"). */
  width?: number | string;
  /** The page height: CSS pixels, or a CSS length. */
  height?: number | string;
  /** "auto" (default) draws what has no vector form as images, "vector" refuses it, "raster"
   * draws the whole plot as one image. */
  mode?: "auto" | "vector" | "raster";
  /** The images' resolution (default 300). */
  rasterDpi?: number;
  /** "embedded" keeps text selectable with its fonts embedded; "outlines" draws it as paths, so it looks the same without the fonts. */
  text?: "embedded" | "outlines";
  /** The most vector pieces one export draws (default 100,000): a mark past it is drawn as an
   * image, or refused in "vector" mode. */
  primitiveBudget?: number;
}
export interface ExportReport {
  mode: "auto" | "vector" | "raster";
  vectorPrimitives: number;
  rasterLayers: Array<{ kind: string; dpi: number; marks?: string[] }>;
  markOutcomes: Array<{
    mark: string;
    kind: string;
    rendering: "vector" | "raster";
  }>;
  warnings: string[];
}
export interface DocumentExportResult {
  blob: Blob;
  report: ExportReport;
}
export interface MinimapProps extends RuntimeSettings<"Minimap"> {
  axis?: FrameHandle;
  axes?: boolean | { x?: boolean; y?: boolean };
  displayScale?: number;
  maxInstances?: number | null;
  for?: PlotHandle;
  width?: number;
  height?: number;
}

/** Opaque metadata-only handles; renderer resources stay private. */
export interface LegendMarkSource {
  readonly kind: "mark";
  subscribe(listener: () => void): () => void;
  entry(): {
    id: string;
    label: string;
    labeled: boolean;
    participates: boolean;
    visible: boolean;
    color: string;
    scalar: boolean;
    shape: string;
    opacity: number;
    dashed: boolean;
  };
  setVisible(visible: boolean): void;
}
export interface LegendPlotSource {
  readonly kind: "plot";
  subscribe(listener: () => void): () => void;
  entries(): LegendMarkSource[];
}
export interface MarkHandle {
  getLegendSource(): LegendMarkSource | undefined;
}
export type LegendPosition = "top" | "bottom" | "left" | "right";
export type LegendChannel =
  "fill" | "color" | "shape" | "outlineColor" | "size" | "width" | "opacity";
export interface LegendProps extends RuntimeSettings<"Legend"> {
  for?: MarkHandle | PlotHandle | FacetHandle | Array<MarkHandle | undefined>;
  /** The encoding to explain. Categorical channels draw swatches; continuous fill/color draw a
   * colorbar, and continuous size/width/opacity draw a ramp of sample glyphs. With several
   * marks, marks sharing one scale resource share one guide. Omitted, the legend explains every
   * channel its marks map from data, then lists the labeled marks. */
  channel?: LegendChannel;
  label?: string;
  position?: LegendPosition;
}
export interface AreaProps
  extends
    MarkPropsExcept<
      | "color"
      | "colorScale"
      | "drag"
      | "end"
      | "nearby"
      | "ondrag"
      | "ondragend"
      | "position"
      | "rotation"
      | "sampling"
      | "shape"
      | "shapeScale"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "interpolation"
    >,
    RuntimeSettings<"Area"> {
  /** The position of each row; with orientation="horizontal", give y instead. */
  x?: Channel;
  /** With orientation="horizontal", the y position of each row; lower and upper are on x. */
  y?: Channel;
  /** The first edge, a number or value per row; default 0. The edges may cross. */
  lower?: Channel;
  /** The second edge, a number or value per row, in value-axis units. */
  upper: Channel;
  /** "vertical" spans y between lower and upper along x; "horizontal" spans x along y. */
  orientation?: "horizontal" | "vertical";
}
export interface FlowProps
  extends
    MarkPropsExcept<
      | "brush"
      | "drag"
      | "end"
      | "nearby"
      | "ondrag"
      | "ondragend"
      | "position"
      | "sampling"
      | "series"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "x"
      | "y"
      | "z"
    >,
    RuntimeSettings<"Flow"> {
  startLower: Channel;
  endLower: Channel;
  startUpper: Channel;
  endUpper: Channel;
}
export interface RoutesProps
  extends
    OmitNamed<
      SegmentsProps,
      | "start"
      | "end"
      | "connections"
      | "control1"
      | "control2"
      | "cap"
      | "capSize"
      | "headLength"
      | "headWidth"
    >,
    RuntimeSettings<"Routes"> {}

/** One number per row of a transform's data (null is missing, a boolean is 0 or 1). */
type RowNumbers =
  | readonly (number | boolean | null)[]
  | ArrayBufferView
  | import("@hmplot/jax").Array;
export type NumericColumn =
  | number
  | string
  | readonly number[]
  | ArrayBufferView
  | import("@hmplot/jax").Array;
export type NumericReducerName =
  | "count"
  | "sum"
  | "mean"
  | "min"
  | "max"
  | "first"
  | "last"
  | "variance"
  | "std";
export type ReducerName = NumericReducerName | "any" | "all";
export interface ReducerSpec {
  op: ReducerName;
  field?: string;
}
/** Bin-count rules, as numpy computes them. */
export type BinRule = "auto" | "sturges" | "fd" | "scott";
export interface BinProps extends RuntimeSettings<"Bin"> {
  name?: string;
  children?: Snippet;
  x?: NumericColumn;
  y?: NumericColumn;
  z?: NumericColumn;
  /** A count, explicit edges, a per-axis object, a rule name ("auto", "sturges", "fd",
   * "scott"), or an expression evaluated against this transform's input, such as
   * `power(count(col.x), 0.5)`. */
  bins?:
    | number
    | number[]
    | Date[]
    | BinRule
    | Expression
    | Partial<
        Record<
          "x" | "y" | "z",
          number | number[] | Date[] | BinRule | Expression
        >
      >;
  /** A datetime column's calendar interval ("1 month", "1 week", "6 hours"; weeks start on
   * Sunday), per axis with {x, y}; without it a datetime column bins by the interval axis ticks
   * would choose for `bins` bins. */
  interval?: string | Partial<Record<"x" | "y" | "z", string>>;
  /** The time zone of a datetime column's calendar bins (an IANA name, "UTC" or "Local");
   * default the column's own, else UTC. */
  tz?: string | Partial<Record<"x" | "y" | "z", string>>;
  mode?: "aggregate" | "assign";
  sharedBins?: boolean;
  empty?: boolean;
  /** A histogram's bars, binning x alone (or y alone): each bin also gets y0 (0), y1 and y
   * (x0, x1 and x for bins along y) holding its rows' count, their share of all the rows
   * ("proportion"), or that share over the bin's width ("density"), so one
   * `<Rect x0="x0" x1="x1" y0="y0" y1="y1" />` draws either orientation. */
  normalization?: "count" | "proportion" | "density";
  /** Columns to compute over each bin's rows besides count, each a reduction expression as in
   * Calculate: {mean_y: mean("y"), mid: median("y")}. An empty bin's column is missing, except a
   * count() or sum(x) column of its own, which is 0. */
  columns?: Record<string, Expression>;
  as?: Record<string, string>;
  /** A column, interaction field or one number per row that scales each row's contribution to count(), sum(x) and
   * mean(x) columns (other columns keep the rows with weight above 0; with a column weight, a
   * sum, mean or count inside a larger expression is an error). "@brushed" (or @selected, @hovered,
   * @nearby) counts only member rows, and every row while there are none; the histogram updates
   * as the brush moves without refiltering the data. */
  weight?: string | RowNumbers;
}
export interface HexbinProps extends RuntimeSettings<"Hexbin"> {
  name?: string;
  children?: Snippet;
  x: NumericColumn;
  y: NumericColumn;
  bins?: number | Expression;
  radius?: number | Expression;
  /**
   * A fixed grid: the hexagons covering these bounds (the radius from the x range and `bins`
   * unless given), one output row per cell with the occupied ones shown; points outside fall in
   * no cell. After a Filter, a new selection then changes no length and compiles nothing.
   * Columns other than a count, sum or mean of a column use the grouped path.
   */
  bounds?: { x: [number, number]; y: [number, number] };
  orientation?: "pointy" | "flat";
  sharedBins?: boolean;
  /** Columns to compute over each hexagon's rows besides count, each a reduction expression as in
   * Calculate: {mean_v: mean("v")}. */
  columns?: Record<string, Expression>;
  as?: Record<string, string>;
}
export interface GroupProps extends RuntimeSettings<"Group"> {
  name?: string;
  children?: Snippet;
  /** The keys: columns, and bins or hexagons (bin("x", 20), hexbin("x", "y")), which write
   * their edges and center (x0, x1, x) or center (x, y). */
  by: ColumnName | Expression | Array<ColumnName | Expression>;
  /** Columns to compute over each group's rows besides count, each a reduction expression as in
   * Calculate: {mean_x: mean("x"), share: divide(sum("x"), count())}. Every reduction reduces
   * the group's visible rows; a column read outside one must be a key. */
  columns?: Record<string, Expression>;
  as?: Record<string, string>;
}
export interface FacetProps extends PlotTitleProps, RuntimeSettings<"Facet"> {
  /** Maximum retained offscreen cells, in addition to visible cells. Default 64; 0 disables caching. */
  cacheSize?: number;
  /** Within a Plot, how the cells partition its frame. "bands": categorical bands along the split
   * dimensions (the other dimension is the Plot's). "grid": a grid of cells, each with its own x and
   * y. Default "grid" with fields or pairs, else "bands". */
  layout?: "bands" | "grid";
  bandPadding?: number;
  /** A table or live pipeline output for the cells; the same as wrapping the Facet in Data. */
  data?: DataProps["value"];
  schema?: DataSchema;
  key?: string | string[];
  name?: string;
  settings?: PlotSettings;
  children?: Snippet;
  row?: ColumnName;
  column?: ColumnName;
  wrap?: number;
  gap?: number;
  rowOrder?: CategoryValue[];
  columnOrder?: CategoryValue[];
  /** One cell per field over the same rows: inside each cell the column `value` is that field and
   * `field` holds its name. A list lays the cells along columns ({column: [...]} says so
   * explicitly); {row: [...]} stacks them. A row or column split may take the other dimension
   * (fields x category). The order of the fields dimension picks and orders the fields. */
  fields?: ColumnName[] | { row: ColumnName[] } | { column: ColumnName[] };
  /** A scatterplot matrix: each cell's `x` and `y` are its two fields. One list gives a square
   * matrix (see triangle and diagonal); {x: [...], y: [...]} a rectangular one (columns from x,
   * rows from y). Cannot combine with row, column or fields. */
  pairs?: string[] | { x: string[]; y: string[] };
  /** With pairs={[...]}: the cells of the full matrix, or of its upper or lower triangle. Default "full". */
  triangle?: "full" | "upper" | "lower";
  /** With pairs: whether cells pairing a field with itself are drawn. Default true. */
  diagonal?: boolean;
  /** Renames the columns the cells alias: {value, field} with fields, {x, y} with pairs. Use it
   * when the table has columns of those names (the aliases hide them inside the cells). */
  as?: { value?: string; field?: string } | { x?: string; y?: string };
  /** How cells share axis domains. "shared": one domain per axis. "field": cells share the
   * domain of the column they plot, so a field keeps one domain across the cells (and across x
   * and y in pairs), columns of the input stay shared, and values computed in a cell follow the
   * cell's field. "free-x" / "free-y" / "free-z" / "free": per cell. Default "field" with
   * fields or pairs, else "shared". */
  scales?: "shared" | "field" | "free-x" | "free-y" | "free-z" | "free";
  resolve?: Partial<
    Record<"color" | "size" | "width" | "shape", "shared" | "independent">
  >;
  /** Pan and zoom the cells together: "auto" (the default) along the axes they share, which
   * the grid labels once on its outer cells; "x", "y", "xy", or "grid" (x down each column, y
   * along each row); "none", each cell its own. */
  link?: "auto" | "none" | "x" | "y" | "xy" | "grid";
  /** One legend for the whole grid. true or {position} shows the automatic legend around the
   * grid (it explains what the marks map from data, then lists the labeled marks); omitted, the
   * grid shows the cells' legend (by default, the colors mapped from a category column); false
   * shows none; "cell" restores one legend per cell. Cells never show their own legend otherwise. */
  legend?: boolean | { position?: LegendPosition } | "cell";
}
export interface PartitionProps extends RuntimeSettings<"Partition"> {
  /** Column name, or list of names, whose distinct values repeat the children. Groups follow
   * the column's order (first appearance, dictionary order, or ascending numbers); rows with a
   * missing key form a trailing "(missing)" group. */
  by: ColumnName | ColumnName[];
  /** Maximum number of groups before Partition refuses to mount them. Default 256. */
  limit?: number;
  /** One legend entry per group (labelled by the group value) instead of one per mark. */
  legendGroups?: boolean;
  name?: string;
  children?: Snippet;
}
export interface PartitionGroup {
  /** JSON of the key values, in `by` order; `null` for a missing value ("[null]"). */
  key: string;
  /** The group's value for each `by` column, including enclosing Partitions. */
  values: Record<string, CategoryValue | null>;
  /** The key values joined for display ("Adelie · Female"); a missing value reads "(missing)". */
  label: string;
  marks: LegendMarkSource[];
}
export interface PartitionHandle {
  getGroups(): PartitionGroup[];
  whenSettled(): Promise<void>;
  /** The mark named `name` repeated in every group, as one endpoint for connect(): connect(partition.endpoint("values"), {key: "id"}) connects the groups in group order. `at` picks an attachment. Two different marks with that name inside the Partition are an error. */
  endpoint(name: string, config?: { at?: string }): EndpointDescriptor;
}
export interface FacetHandle {
  /** Legend entries for every cell, one per authored mark. Undefined when legend="cell". */
  getLegendSource(): LegendPlotSource | undefined;
  getFrames(): {
    frame: FrameHandle;
    row: CategoryValue | null;
    column: CategoryValue | null;
  }[];
  getSelection(): SelectionResource | undefined;
  getBrush(): SelectionResource | undefined;
  getHover(): SelectionResource | undefined;
  getTransform(name: string): TransformHandle;
  getPlots(): {
    plot: PlotHandle;
    row: CategoryValue | null;
    column: CategoryValue | null;
  }[];
  whenSettled(): Promise<void>;
  exportPNG(options?: { scale?: number }): Promise<Blob>;
  exportSVG(options?: DocumentExportOptions): Promise<DocumentExportResult>;
  exportPDF(options?: DocumentExportOptions): Promise<DocumentExportResult>;
  /** The mark named `name` repeated in every cell of an embedded Facet (inside a Plot), as one endpoint for connect(): connect(facet.endpoint("values"), {key: "id"}) connects the cells in facet order (rows, then columns). `at` picks an attachment. An external Facet's cells are separate views, so it throws. */
  endpoint(name: string, config?: { at?: string }): EndpointDescriptor;
}
export interface RectProps
  extends
    MarkPropsExcept<
      | "brush"
      | "color"
      | "colorScale"
      | "drag"
      | "end"
      | "nearby"
      | "ondrag"
      | "ondragend"
      | "position"
      | "sampling"
      | "series"
      | "shape"
      | "shapeScale"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "width"
      | "widthScale"
      | "x"
      | "y"
      | "z"
      | "interpolation"
    >,
    RuntimeSettings<"Rect"> {
  x0: Channel;
  x1: Channel;
  y0: Channel;
  y1: Channel;
  z0?: Channel;
  z1?: Channel;
}
/** An image: MarkProps plus nearest-neighbor sampling and lighting. */
export interface ImageProps
  extends
    MarkPropsExcept<
      | "brush"
      | "color"
      | "colorScale"
      | "drag"
      | "end"
      | "interpolation"
      | "nearby"
      | "nearest"
      | "ondrag"
      | "ondragend"
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "position"
      | "rotation"
      | "sampling"
      | "series"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "width"
      | "widthScale"
      | "maxInstances"
      | "shape"
      | "shapeScale"
    >,
    RuntimeSettings<"Image"> {
  /** The pixels: [height, width] (grayscale) or [height, width, 3 or 4] (RGB, RGBA); integers are
   * 0-255, floats 0-1. Or an image file the browser decodes (RGB, or RGBA when some pixel is not
   * opaque): a URL, a Blob, an ImageBitmap, or an image or canvas element (Python: a URL, a path,
   * bytes or a PIL image, sent as the file). The plot waits for it. */
  data?: any;
  /** Nearest-neighbor sampling: each source pixel draws as a square (default false). */
  pixelated?: boolean;
  /** Shade the image with the scene's lights (default false). */
  lit?: boolean;
}
export interface PrismProps
  extends
    MarkPropsExcept<
      | "brush"
      | "color"
      | "colorScale"
      | "drag"
      | "end"
      | "nearby"
      | "ondrag"
      | "ondragend"
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "position"
      | "rotation"
      | "sampling"
      | "series"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "interpolation"
    >,
    RuntimeSettings<"Prism"> {
  /** Moves each row along x in data units: on a categorical axis a band is one unit, so 0.25 is
   * a quarter of the category's band (grouped bars, dodged points). dx moves by pixels. */
  xOffset?: Channel;
  /** Moves each row along y in data units: on a categorical axis a band is one unit. */
  yOffset?: Channel;
  x?: Channel;
  y?: Channel;
  z?: Channel;
  x0?: Channel;
  x1?: Channel;
  y0?: Channel;
  y1?: Channel;
  z0?: Channel;
  z1?: Channel;
  width?: Channel;
  depth?: Channel;
  rotation?: Channel;
  axis?: "x" | "y" | "z";
  shape?: "rectangle" | "triangle" | "hexagon" | "circle";
}

/** Public brush/nearby description. Radius constraints carry center/radius instead of bounds. */
export interface SelectionConstraint {
  identity: string;
  name: string;
  type: string;
  bounds?: [number, number];
  categories?: CategoryValue[];
  axis?: string;
  frame?: string;
  origin?: string;
  units?: "data" | "px";
  center?: Partial<Record<"x" | "y", number>>;
  radius?: Partial<Record<"x" | "y", number>>;
  transform?: Partial<Record<"x" | "y", ScaleTransformName>>;
}
export interface SelectionResource {
  readonly isSelection: true;
  readonly active: boolean;
  /** The column the selection matches rows by (selection({by: "gene"})): every row with a value
   * the selected rows have is a member, in any table with that column; null for row identity. */
  readonly by: string | null;
  readonly revision: number;
  /** `membership` counts changes of the selected rows; committing a preview (the same rows)
   * bumps `revision` but not `membership`. */
  status(): {
    active: boolean;
    previewActive: boolean;
    count: number;
    revision: number;
    previewRevision: number;
    membership: number;
  };
  subscribe(
    listener: (status: ReturnType<SelectionResource["status"]>) => void,
  ): () => void;
  rows(owner?: DataIdentity, phase?: "committed" | "preview"): Set<number>;
  getConstraints(
    owner?: DataIdentity,
    phase?: "committed" | "preview",
  ): SelectionConstraint[];
  clearColumns(
    owner: DataIdentity | string | string[],
    columns?: string | string[] | Array<{ identity: string }>,
  ): SelectionResource;
  replace(
    owner: DataIdentity | Iterable<number>,
    rows?: Iterable<number>,
    options?: { phase?: "committed" | "preview"; activate?: boolean },
  ): SelectionResource;
  add(
    owner: DataIdentity | Iterable<number>,
    rows?: Iterable<number>,
  ): SelectionResource;
  remove(
    owner: DataIdentity | Iterable<number>,
    rows?: Iterable<number>,
  ): SelectionResource;
  toggle(
    owner: DataIdentity | Iterable<number>,
    rows?: Iterable<number>,
  ): SelectionResource;
  commitPreview(owner?: DataIdentity): SelectionResource;
  cancelPreview(owner?: DataIdentity): SelectionResource;
  clear(owner?: DataIdentity): SelectionResource;
}
/** A drag's rows and changes (TODO 38): table rows and their keys (the row index without a key). */
export interface MarkDragEvent {
  /** The grabbed row and its key. */
  row: number;
  key: unknown;
  /** Every dragged row (the selection, when the grabbed row is selected) and their keys. */
  rows: number[];
  keys: unknown[];
  /** Each dragged column's change for the grabbed row since the drag began, in its units. */
  changes: Record<string, number>;
}
export interface DataIdentity {
  readonly id: string;
  readonly length: number;
  readonly selection: SelectionResource;
  readonly brush: SelectionResource;
  readonly hover: SelectionResource;
  readonly offsets: OffsetLayer;
}
/**
 * A table's offsets (TODO 38): per-row deltas in its numeric columns' units, set by dragging or
 * from code. The table's data never changes; views follow the offsets only through offset() and
 * moved(). Rows are the table's row indices; one layer per table, shared by all its views.
 */
export interface OffsetLayer {
  readonly version: number;
  /** The table's row count. */
  readonly length: number;
  /** Whether any column has offsets. */
  readonly active: boolean;
  /** The columns that have offsets. */
  columns(): string[];
  has(column: string): boolean;
  /** One row's offset in `column` (0 when never set). */
  value(column: string, row: number): number;
  /** A copy of `column`'s offsets over every row, or undefined when it has none. */
  host(column: string): Float32Array | undefined;
  /** Set each row's offset in `column` to its delta (a number sets them all). Offsets replace, they do not add. */
  set(
    column: string,
    rows: Iterable<number>,
    deltas: number | Iterable<number>,
  ): OffsetLayer;
  /** Replace every offset of `column` with one value per row. */
  setColumn(column: string, deltas: ArrayLike<number>): OffsetLayer;
  /** Remove the offsets of `columns` (every column when omitted). */
  clear(columns?: string | string[]): OffsetLayer;
  /** Every nonzero offset. */
  entries(): { row: number; column: string; delta: number }[];
  subscribe(
    listener: (status: {
      revision: number;
      membership: number;
      active: boolean;
    }) => void,
  ): () => void;
}
export interface InteractionProps extends RuntimeSettings<"Interaction"> {
  columns: Record<string, SelectionResource>;
  children?: Snippet;
}
export interface FilterCondition {
  field: string;
  op?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "finite";
  value?: CategoryValue | CategoryValue[];
}
export interface FilterProps extends RuntimeSettings<"Filter"> {
  name?: string;
  /** With no active selection or brush, an interaction condition keeps every row ("all",
   * the default) or none. */
  inactive?: "all" | "none";
  children?: Snippet;
  /** The rows to keep: a field or virtual field ("@brushed"), which keeps the rows where it is
   * true (a boolean column's true rows, a number column's nonzero ones), a comparison
   * ({field, op, value}), a selection resource, an expression with one value per row, which
   * may use reductions (`greater("x", mean("x"))` keeps the rows above the mean), or a list
   * of conditions that must all hold. An expression that reads an interaction column re-runs
   * as that state changes; a single value (a bare reduction) is an error. */
  where:
    | string
    | FilterCondition
    | Expression
    | Array<string | FilterCondition | Expression>
    | SelectionResource;
}
export interface SortProps extends RuntimeSettings<"Sort"> {
  name?: string;
  children?: Snippet;
  by: ColumnName | ColumnName[];
  order?: "asc" | "desc";
}
export interface NormalizeProps extends RuntimeSettings<"Normalize"> {
  name?: string;
  children?: Snippet;
  /** A column, or one number per row of the data. */
  field: ColumnName | RowNumbers;
  method?: "deviation" | "extent" | "sum" | "first" | "max";
  by?: ColumnName | ColumnName[];
  as?: string;
}
export interface StackProps extends RuntimeSettings<"Stack"> {
  name?: string;
  children?: Snippet;
  /** The column whose values make the stacks: rows with the same x stack together (without it,
   * every row is in one stack). */
  x?: string;
  /** The values to stack; each row gets y0 and y1, its span in its stack. */
  y: string | RowNumbers;
  /** The column naming each row's layer (series); a stack orders its rows by series, then by row. */
  series?: ColumnName;
  /** The stack order of the series: a list of categories (the others follow in their own order,
   * then rows with no series), "none" (the series' own order, the default), "appearance" (by
   * the x of each series' peak), "asc" or "desc" (by each series' total),
   * "insideOut" (the largest series in the middle, for streamgraphs) or "reverse". The computed
   * orders need series. */
  order?:
    | CategoryValue[]
    | "none"
    | "appearance"
    | "asc"
    | "desc"
    | "insideOut"
    | "reverse";
  /** Where each stack sits: "zero" (the default: positive values stack up from 0 and negative
   * ones down), "expand" (each stack's total magnitude spans 1, for 100% stacks), "center"
   * (each stack centered on 0) or "wiggle" (a streamgraph baseline that minimizes the layers'
   * change in slope; needs series). center and wiggle need non-negative values. */
  offset?: "zero" | "expand" | "center" | "wiggle";
  as?: Record<string, string>;
}
export interface WindowProps extends RuntimeSettings<"Window"> {
  name?: string;
  children?: Snippet;
  /** A column, or one number per row of the data. */
  field: ColumnName | RowNumbers;
  size?: number | Expression;
  reduce?: ReducerName;
  align?: "trailing" | "center" | "leading";
  by?: ColumnName | ColumnName[];
  as?: string;
}
export interface ShiftProps extends RuntimeSettings<"Shift"> {
  name?: string;
  children?: Snippet;
  /** Numeric or datetime column to offset; observations stay in their original order. */
  field: ColumnName;
  /** Coordinate offset, or a signed UTC calendar interval such as "-1 year" or "7 days".
   * Numeric offsets use the column's data units (milliseconds for datetimes). */
  interval: number | string;
  /** Names for the shifted coordinate and its unchanged copy; defaults to shifted and original. */
  as?: { shifted?: string; original?: string };
}
export interface DodgeProps extends RuntimeSettings<"Dodge"> {
  mode?: "collision" | "grid";
  columns?: number | Expression;
  count?: string;
  name?: string;
  children?: Snippet;
  x?: string;
  y?: string;
  /** The direction points move to clear each other: "auto" (the default) moves them across a
   * categorical x (or a lone y), otherwise along y. The point mark takes the offsets itself. */
  axis?: "x" | "y" | "auto";
  as?: string;
  padding?: number;
  seed?: number;
}

export interface TransformStatus {
  name?: string;
  kind: string;
  pending: boolean;
  error: string;
  mounted: boolean;
  /** A Provider's: the revision of the result on screen (0 before the first). */
  revision?: number;
  iteration?: number;
  alpha?: number;
  selection?: { index: number | null; position: number[]; count: number };
}
/**
 * An input a mark writes (TODO 145.2), as its select or hover, or a Button as its set: one value
 * with a default, for visualization state (a drill-down's root, the focused series) rather than
 * a set of rows. Make it from the input: with root = input("root", { default: "all" }),
 * root.set("id") takes the clicked or hovered row's id, root.set(literal("all")) a constant and
 * root.reset() the default. A click on nothing restores the default; a hover shows its value
 * while the pointer is on a row, then the committed value again. Read it as root (or
 * input("root")) anywhere in the input context. Several marks may write one input (last wins);
 * a Select or Slider of the same name shows and edits it.
 */
export interface InputWrite {
  /** The input's name, read as input("name"). */
  input: string;
  /** The column whose value at the clicked or hovered row the input takes (root.set("id")). One of column, value and reset. */
  column?: ColumnName;
  /** A constant the input takes (root.set(literal("all"))). */
  value?: unknown;
  /** true: the input goes back to its default (root.reset()); not for a hover. */
  reset?: true;
  /** Its value before any write and after a reset or a click on nothing (default: a widget's of that name, else null). Writers of one input give one default. */
  default?: unknown;
}
/**
 * A read of an input (input("root")) that also makes its writes (TODO 145.7): set(column) takes
 * the clicked or hovered row's value, set(literal(v)) or a number, boolean, Date or null a
 * constant, reset() the default.
 */
export interface InputExpression extends Expression {
  set(
    source: ColumnName | LiteralValue | number | boolean | Date | null,
  ): InputWrite;
  reset(): InputWrite;
}

/** A TableView's column: its field, the header it shows (default the field) and a d3-format or %-pattern for its values, as a tooltip field takes. */
export interface TableViewColumn {
  field: ColumnName;
  label?: string;
  format?: string;
}
/**
 * The rows of the data around it as an HTML table (TODO 145.4), live: a Group's groups, a Sort's
 * top rows, a Filter's kept rows, a layout's nodes. Beside Plots, inside the same Data; omitted
 * from PNG, SVG and PDF exports, kept in standalone HTML.
 */
export interface TableViewProps extends RuntimeSettings<"TableView"> {
  /** The columns, in order: names, or { field, label, format } (default: every column). */
  columns?: Array<ColumnName | TableViewColumn>;
  /** How many rows to show (default 100); the rest are counted below the table. Put a Sort above it for a top N. */
  limit?: number;
  /** A caption above the table. */
  title?: string;
  /** Click a row: true selects its source rows in the data's selection (or give a selection()); { input, column } writes an input, and a second click on the row restores its default. */
  select?: boolean | SelectionResource | InputWrite;
  /** Hover a row: true marks its source rows @hovered (or give a selection()); { input, column } shows its value in an input while the pointer is on it. */
  hover?: boolean | SelectionResource | InputWrite;
  /** A name for the table (its element's data-name attribute). */
  name?: string;
}

/** What read() reads (TODO 145.1). */
export interface ReadOptions {
  /** The columns, in order (default: every column but interaction state such as @brushed). */
  columns?: string[];
  /** Rows as objects, one per row, instead of one list per column (default false). */
  rows?: boolean;
  /** The first that many rows only, sliced before the copy (a top ten after a Sort). */
  limit?: number;
}
/** A table read back to the host, one list per column: numbers as Float64Array (NaN where missing), times as Dates, categories as their values (null where missing), a 2D column as one list of numbers per row. */
export interface HostColumns {
  /** The number of rows. */
  length: number;
  /** The version of the output it was read from: a later read with the same version holds the same rows. */
  version: unknown;
  columns: Record<string, ArrayLike<unknown>>;
}
/** A table read back to the host as rows: one object per row (null where a value is missing). */
export interface HostRows {
  length: number;
  version: unknown;
  rows: Record<string, unknown>[];
}
export interface TransformHandle {
  subscribe(listener: (status: TransformStatus) => void): () => void;
  update(patch: Record<string, unknown>): Promise<void>;
  whenSettled(): Promise<void>;
  /** Runs one of the transform's named actions (such as a layout's reheat); resolves when its work settles. */
  action?(id: string): Promise<void>;
  /**
   * Its output's rows on the host (TODO 145.1), once its current inputs have run: for a value
   * code shows in the page (a total in a sentence, a breadcrumb, a list). One read per call,
   * bounded by limit.readback; subscribe() says when the output changes, so a readout is
   * subscribe then read. Marks draw the output without it.
   */
  read(options?: ReadOptions & { rows?: false }): Promise<HostColumns>;
  read(options: ReadOptions & { rows: true }): Promise<HostRows>;
}
/** A Data's handle (bind:this): its table's interaction state and its rows. */
export interface DataHandle {
  getSelection(): SelectionResource;
  getBrush(): SelectionResource;
  getHover(): SelectionResource;
  /** The table's offsets (dragging; TODO 38). */
  getOffsets(): OffsetLayer | undefined;
  resetOffsets(columns?: string | string[]): void;
  applyOffsets():
    Record<string, unknown> | Record<string, unknown>[] | undefined;
  /** Its table's rows on the host (TODO 145.1); a referenced pipeline's output once it has run. */
  read(options?: ReadOptions & { rows?: false }): Promise<HostColumns>;
  read(options: ReadOptions & { rows: true }): Promise<HostRows>;
}

/**
 * Inputs (TODO 41): a named value the viewer sets. It goes up to the nearest input context (an
 * InputContext, a Python Scene, a Template instance), and everything under that context reads it
 * by name: input("bins") (Python hm.input.bins), or "$bins" where a string names a column. A
 * read is replaced by the value before its reader sees it, so a moved input re-runs its readers
 * once and animates like any other change.
 */
export interface InputProps {
  /** The name readers use: an identifier, unique in its input context. */
  name: string;
  /** Shown beside the control (default: the name). */
  label?: string;
}
/** A number or Date between min and max, or a pair selecting an interval. */
export interface SliderProps extends InputProps, RuntimeSettings<"Slider"> {
  /** The range: numbers or Dates, or expressions over the Data scope around the slider (min("x");
   * min("t") of a datetime column is a Date). Over Dates the value is a Date (TODO 53.3). */
  min?: number | Date | Expression;
  max?: number | Date | Expression;
  /** The step between values (default: any value). Over Dates, a calendar interval ("1 month"
   * lands on month starts) or milliseconds. */
  step?: number | CalendarInterval | string;
  /** The initial value (default: min), or [lower, upper] for two thumbs selecting an interval.
   * Endpoints are sorted and clamped to min/max; an expression reads the data. */
  value?: number | Date | [number, number] | [Date, Date] | Expression;
  /** How the value is shown: a d3-format string such as ".2f" (default: a numeric step's
   * decimals, else 4 significant digits, 12,346; over Dates a %-pattern such as "%b %Y",
   * default by the step, as an axis would), or a function. */
  format?: string | ((value: any) => string);
  /** Over Dates, the time zone its steps and labels are in: an IANA name, "UTC" or "Local"
   * (default: the zone of the column min() or max() read, else UTC). */
  timezone?: string;
}
/** A string edited by the viewer; updates on each keystroke. */
export interface TextInputProps
  extends InputProps, RuntimeSettings<"TextInput"> {
  /** The initial text (default empty). */
  value?: string;
  /** A hint shown when the input is empty. */
  placeholder?: string;
}
/** An opaque RGB color chosen with the browser's color picker. */
export interface ColorPickerProps
  extends InputProps, RuntimeSettings<"ColorPicker"> {
  /** A six-digit hexadecimal color (default #000000); returns lowercase #rrggbb. */
  value?: string;
}
/** A date and time in an explicit time zone, held as a Date or null when empty. */
export interface DateTimeInputProps
  extends InputProps, RuntimeSettings<"DateTimeInput"> {
  /** The initial instant; omitted or null leaves the input empty. */
  value?: Date | null;
  /** The earliest allowed instant. */
  min?: Date;
  /** The latest allowed instant. */
  max?: Date;
  /** The step in milliseconds (default 60000, one minute). */
  step?: number;
  /** The zone used for editing: an IANA name, UTC (default), or Local. */
  timezone?: string;
}
/**
 * A slider that plays: play advances the value by `rate` value units per second, one move per
 * displayed frame, or one `step` every step/rate seconds. At max it stops, or wraps with `loop`.
 */
export interface PlaybackProps
  extends Omit<SliderProps, "value">, RuntimeSettings<"Playback"> {
  /** The initial number or Date (default: min); an expression reads the data. */
  value?: number | Date | Expression;
  /** Value units per second (default 1); over Dates, a calendar interval per second ("1 day") or
   * milliseconds per second. */
  rate?: number | CalendarInterval | string;
  /** Wrap to min at max instead of stopping. */
  loop?: boolean;
  /** Start playing on mount, except under prefers-reduced-motion. */
  autoplay?: boolean;
  /** Set from code: true plays, false pauses. */
  playing?: boolean;
  /** Set from code: each change of its value resets to the initial value (a Button's count works). */
  reset?: number | string;
}
/** true or false. */
export interface CheckboxProps extends InputProps, RuntimeSettings<"Checkbox"> {
  value?: boolean;
}
/** A count of presses, so a reader that acts on a change (a reset= prop) acts on each press. */
export interface ButtonProps
  extends Partial<InputProps>, RuntimeSettings<"Button"> {
  value?: number;
  /** Inputs a press writes (TODO 145.7): root.reset() restores root's default, root.set(literal("all")) sets a value; a list writes several. Without a name, give a label. */
  set?: InputWrite | InputWrite[];
}
/** One of `options`: a list of values, or {label: value}. A string value in a channel names a column. */
export interface SelectProps extends InputProps, RuntimeSettings<"Select"> {
  /** The choices (Dates show as dates), or categories("field") / columns() read from the Data
   * scope around it. */
  options:
    | readonly (string | number | boolean | Date)[]
    | Record<string, string | number | boolean | Date>
    | Expression;
  /** Allow several choices. The value is a list, usable with is_in(column, input("name")). */
  multiple?: boolean;
  /** The chosen value, or a list when multiple is true (default: first option, or an empty list). */
  value?:
    | string
    | number
    | boolean
    | Date
    | readonly (string | number | boolean | Date)[];
}
/**
 * Simulate (TODO 42): per-row state stepped at a fixed interval. Each step reads the parent's
 * columns now (col("x")), the state after the previous step (prev("x")), the step in
 * milliseconds ("@dt"), the Simulate's clock ("@time"), inputs, and its own rows' interaction
 * flags (it is their root), and writes the next state. Its output is the parent's columns with
 * the state columns added (a state column replaces a parent column of the same name).
 */
export interface SimulateProps extends RuntimeSettings<"Simulate"> {
  children?: Snippet;
  name?: string;
  /** Each state column's first value, an expression over the parent's columns: a column name, a
   * number, or col() arithmetic. Rows that arrive later start from it too. */
  initial: Record<string, string | number | Expression>;
  /** Each state column's next value; it may read prev("name"), the parent's columns, "@dt",
   * "@time" and inputs. Every update reads the previous state, so column order does not matter. */
  update: Record<string, string | number | Expression>;
  /** The fixed step, in milliseconds (default 16). The state after n steps is the same at any
   * frame rate. */
  step?: number;
  /** The most steps one frame takes (default 8): a slow device runs behind real time instead of
   * stalling the page. */
  maxSteps?: number;
  /** Stop once the state settles: no counted column changed by more than `tolerance` in one step,
   * checked every `every` steps (default 30). A change of the data, an input, running or reset
   * wakes it. */
  stop?: { tolerance: number; every?: number; columns?: string[] };
  /** Plays (default true) or pauses: from code, or a Checkbox (running={input("run")}). Under
   * prefers-reduced-motion one that plays from the start waits until running changes, as a
   * Playback's autoplay does. */
  running?: boolean;
  /** Each change of its value starts again from `initial` (a Button's count works). */
  reset?: number | string;
}
/** An input context of its own: its inputs' names do not reach the contexts around it. */
export interface InputContextProps extends RuntimeSettings<"InputContext"> {
  children?: Snippet;
}

/** What a Provider's load receives (TODO 20; docs/PROVIDERS.md). */
export interface ProviderContext {
  /** A frozen copy of the params this load was requested with. */
  params: Readonly<Record<string, unknown>>;
  /** Aborted when a newer request supersedes this one, or the Provider unmounts. */
  signal: AbortSignal;
  /** Increases with every request. */
  revision: number;
  /** On a refresh of the result on screen: that result's version, for a conditional request. */
  version?: string | number;
  /** Whether this load is a refresh (refresh() or a refreshInterval tick). */
  refresh?: boolean;
  /** Reserved for view-dependent sources (Stages 19 and 24); undefined. */
  view?: undefined;
}
/** Anything Data accepts as `value`, or `{ data, version }`: an unchanged version publishes nothing. */
export type ProviderValue =
  | Record<string, any>
  | Record<string, any>[]
  | {
      data: Record<string, any> | Record<string, any>[] | undefined;
      version: string | number;
    };
export type ProviderLoad = (
  context: ProviderContext,
) => Promise<ProviderValue> | ProviderValue;
export interface ProviderSourceObject {
  load: ProviderLoad;
  /** The request key: a change that keeps it loads nothing. Default: stable JSON of params. */
  requestKey?: (context: {
    params: Readonly<Record<string, unknown>>;
  }) => string;
  /** Providers whose sources have the same id share a load in flight for one key. Default: the source. */
  id?: unknown;
}
export type ProviderSource = ProviderSourceObject | ProviderLoad;
/** The result a Provider shows, as its load returned it. */
export interface ProviderResult {
  data: any;
  version?: string | number;
  key: string;
  revision: number;
}
export interface ProviderProps extends RuntimeSettings<"Provider"> {
  /** Loads the data: { load, requestKey?, id? } or a load function (fetchJSON, fetchCSV, fetchArrow and fetchParquet build one). */
  source?: ProviderSource;
  /** Instead of `source`: a URL with {name} placeholders filled from params, fetched as `format`. */
  url?: string | ((params: Record<string, unknown>) => string);
  format?: "json" | "csv" | "arrow" | "parquet";
  /** JSON only: a dot path to the rows in the response ("results", "data.items"). */
  path?: string;
  /** Parquet only: the columns to read; the others are never downloaded (HTTP range requests). */
  columns?: string[];
  /** The explicit reactive inputs of the load (JSON-compatible plain values). */
  params?: Record<string, unknown>;
  /** Row identity, as on Data: selections and brushes follow keys across reloads. */
  key?: string | string[];
  /** Column types, as on Data. */
  schema?: Record<string, any>;
  /** Shown until the first load completes; the children mount with it at once. */
  initial?: Record<string, any> | Record<string, any>[];
  /** Milliseconds a params change waits for the next one before loading (default 150). */
  debounce?: number;
  /** Milliseconds between refreshes, counted from the end of the last load. */
  refreshInterval?: number;
  /** Merge each completed load into the table on screen instead of replacing it: with `key`,
   * a row whose key is shown updates in place and new keys append; without, rows append in
   * arrival order. `{ maxRows }` keeps the newest rows (default: all). New params start a fresh
   * table; a url's {version} asks for rows since the result on screen. */
  accumulate?: boolean | { maxRows?: number };
  /** Each change of its value loads again (a Button's count works): refresh={input("reload")}. */
  refresh?: number | string;
  /** Exported HTML embeds the last result (default); false loads when the exported page opens. */
  snapshot?: boolean;
  name?: string;
  onload?: (event: { revision: number; rows: number; ms: number }) => void;
  onerror?: (event: { error: unknown; revision: number }) => void;
}
export interface ProviderHandle {
  /** Load again with the same params; resolves once the result is published (or unchanged). */
  refresh(): Promise<void>;
  /** Resolves once loads requested before the call have been published or failed, and drawn. */
  whenSettled(): Promise<void>;
  /** Status as a transform reports it (kind "Provider"): pending while it loads, and its error. */
  subscribe(listener: (status: TransformStatus) => void): () => void;
  action(id: string): Promise<void>;
  getResult(): ProviderResult | undefined;
  getSelection(): SelectionResource;
  getBrush(): SelectionResource;
  getHover(): SelectionResource;
  /** The table's offsets (dragging; TODO 38). */
  getOffsets(): OffsetLayer | undefined;
  /** Clear the table's offsets in `columns` (every column when omitted). */
  resetOffsets(columns?: string | string[]): void;
  /** The table as given, with each column that has offsets replaced by its moved values. */
  applyOffsets():
    Record<string, unknown> | Record<string, unknown>[] | undefined;
}

export interface InterpolateProps extends RuntimeSettings<"Interpolate"> {
  children?: Snippet;
  name?: string;
  x: string;
  y?: string;
  values: string[];
  resolution?: number | [number, number] | Expression;
  method?: "auto" | "linear" | "bilinear" | "idw" | "nearest";
  bounds?: { x: [number, number]; y?: [number, number] };
}
export interface PivotProps extends RuntimeSettings<"Pivot"> {
  children?: Snippet;
  name?: string;
  field: string;
  /** A numeric reduction expression filling each (group, category) cell, such as sum("value"). */
  value: Expression;
  by?: string | string[];
  as?: string[];
}
export interface FoldProps extends RuntimeSettings<"Fold"> {
  children?: Snippet;
  name?: string;
  fields: string[];
  as?: { key?: string; value?: string };
}
/** Join (TODO 43): columns from a second table, matched by key, many to one. */
export interface JoinProps extends RuntimeSettings<"Join"> {
  children?: Snippet;
  name?: string;
  /** The table to join: columns, rows, typed arrays or an Arrow table (Python: a DataFrame or hm.Table). A new table replans the join. Or a transform's handle (Python: the node), whose live output is joined as it publishes: new keys replan the join, new values only regather. */
  data: DataTable | { dataSource(): unknown };
  /** The key column both tables have, or several for a composite key. */
  on?: ColumnName | ColumnName[];
  /** Instead of `on`: the key columns of this table. */
  leftOn?: ColumnName | ColumnName[];
  /** Instead of `on`: the key columns of the joined table, paired with `leftOn`. */
  rightOn?: ColumnName | ColumnName[];
  /** "left" keeps every row (an unmatched row's joined values are missing); "inner" hides the rows with no match. */
  how?: "left" | "inner";
  /** The joined table's columns to add (default: every column but its key). */
  fields?: ColumnName[];
  /** New names for joined columns, by their name in the joined table. */
  as?: Record<string, string>;
}
/** A Regression's fit (fit()): the coefficients from the constant up, in `variable` (x or ln x), of `response` (y or ln y). */
export interface RegressionFit {
  method: string;
  order: number;
  n: number;
  df: number;
  r2: number;
  rss: number;
  coefficients: number[];
  variable: "x" | "ln x";
  response: "y" | "ln y";
}
export interface SampleProps extends RuntimeSettings<"Sample"> {
  children?: Snippet;
  name?: string;
  /** How many rows to keep (default: every row with order="random", else at most 1,000). */
  size?: number | Expression;
  /** Instead of size: the fraction of the rows to keep, between 0 and 1. */
  proportion?: number | Expression;
  /** The random draw; the same seed keeps the same rows. */
  seed?: number;
  /** "data" (the default) keeps the sampled rows in their original order; "random" puts them in
   * the seeded random order, so Sample(order="random") with no size shuffles every row. */
  order?: "data" | "random";
}
export interface SummaryProps extends RuntimeSettings<"Summary"> {
  children?: Snippet;
  name?: string;
  /** The numeric column summarized. */
  field: ColumnName;
  by?: ColumnName | ColumnName[];
  estimate?: "mean" | "median";
  interval?: "none" | "deviation" | "standard-error" | "normal" | "bootstrap";
  confidence?: number;
  samples?: number;
  seed?: number;
  as?: Partial<
    Record<
      | "estimate"
      | "lower"
      | "upper"
      | "count"
      | "standardDeviation"
      | "standardError",
      string
    >
  >;
}
export interface Expression {
  readonly __hmplotExpression: true;
  readonly op: string;
  readonly args: readonly any[];
}
/** Optional participation predicate; intersects visible rows rather than changing membership. */
export interface ReductionOptions {
  /** Columns that group the rows: each row gets its own group's value (as pandas' transform). */
  by?: ColumnName | ColumnName[];
  /** A condition (a boolean column or expression): only the rows where it is true are reduced. */
  where?: number | boolean | ColumnName;
}
/** Local calculation order; results return to the source rows. Sort reorders whole tables. */
export interface OrderedExpressionOptions {
  /** Columns that group the rows: each group is calculated on its own. */
  by?: ColumnName | ColumnName[];
  /** Columns that order the rows within each group for the calculation; results return to the rows' own places. */
  orderBy?: ColumnName | ColumnName[];
  /** Ascending (default) or descending orderBy. */
  order?: "asc" | "desc";
}
export interface OrderedReductionOptions
  extends ReductionOptions, OrderedExpressionOptions {}
export interface NeighborExpressionOptions extends OrderedExpressionOptions {
  /** Nonnegative row offset; zero is identity. */
  periods?: number;
  /** Missing by default; int32 buffers require an explicit integer fill for exact values. */
  fill?: number | boolean | string | Date | null;
}
export interface WindowExpressionOptions extends OrderedExpressionOptions {
  /** Positive integer, or scalar input expression resolving to one. */
  size?: number | Expression;
  /** The reduction over each window: mean (default), sum, min, max and the other reducers. */
  reduce?: ReducerName;
  /** Where the window sits around each row: "trailing" (the row and those before it, default), "center" or "leading". */
  align?: "trailing" | "leading" | "center";
}
/** A column's name where a parameter names columns: "species", ":species" or col.species (R2.0). */
export type ColumnName = string | Expression;
/** Run a registered transform or graph layout without adding a component for each plugin. */
export interface TransformProps extends RuntimeSettings<"Transform"> {
  children?: Snippet;
  /** The registered transform or layout kind. */
  kind: string;
  /** Parameter values keyed by the plugin's schema; Python also accepts them as keywords. */
  params?: Record<string, unknown>;
  /** Names the transform, including its copies in a Facet. */
  name?: string;
  /** Group input rows by these columns when the transform supports grouping. */
  by?: ColumnName | ColumnName[];
  /** Rename output columns: an object mapping original names to published names. */
  as?: Record<string, string>;
}

export interface CalculateProps extends RuntimeSettings<"Calculate"> {
  children?: Snippet;
  columns: Record<string, Expression>;
  name?: string;
}

export interface SliceProps extends RuntimeSettings<"Slice"> {
  children?: Snippet;
  name?: string;
  field: ColumnName;
  at?: number;
  by?: ColumnName | ColumnName[];
  values?: string[];
}

export interface ForceProps extends RuntimeSettings<"Force"> {
  children?: Snippet;
  name?: string;
  weight?: ColumnName;
  dimensions?: 2 | 3;
  seed?: number;
  repulsion?: number;
  linkDistance?: number;
  springStrength?: number;
  centering?: number;
  velocityDecay?: number;
  /** d3's simulation parameters (TODO 30.5): alpha falls toward alphaTarget by alphaDecay per tick; the layout stops below alphaMin. */
  alpha?: number;
  alphaMin?: number;
  alphaDecay?: number;
  alphaTarget?: number;
  /**
   * Named forces (d3's: center, manyBody, link, collide, x, y, z, radial). An entry named like a
   * default force (charge, link, x, y, z) updates it; one with a `type` replaces it; null removes it.
   */
  forces?: Record<string, ForceSpec | null>;
  /** Fixed coordinates from node columns or expressions (d3's fx, fy, fz); a non-finite value leaves the node free. */
  fixed?: Partial<Record<"x" | "y" | "z", ForceValue>>;
  /** Starting coordinates from node columns or expressions; a non-finite value keeps the seeded start. */
  initial?: Partial<Record<"x" | "y" | "z", ForceValue>>;
  /** Ticks per published step (default 1). */
  ticks?: number;
  /** Ticks before the first publish (default 0). */
  warmup?: number;
  /** Plays (true) or pauses (false) the layout: from code, or a Checkbox (running={input("run")}). */
  running?: boolean;
  /** Each change of its value restarts the layout from its initial positions (a Button's count works). */
  reset?: number | string;
  /** Each change of its value reheats the layout (alpha back to 1). */
  reheat?: number | string;
  /** Each change of its value pauses and advances the layout one step. */
  step?: number | string;
  /** Each change of its value releases every pinned node. */
  release?: number | string;
}

/** A force parameter: a number, or a node or edge column name or expression (per node or per edge parameters). */
export type ForceValue = number | string | Expression;
/** One of d3's forces, with d3's parameters (TODO 30.6). */
export interface ForceSpec {
  type?:
    "center" | "manyBody" | "link" | "collide" | "x" | "y" | "z" | "radial";
  strength?: ForceValue | "auto";
  distance?: ForceValue;
  radius?: ForceValue;
  x?: ForceValue;
  y?: ForceValue;
  z?: ForceValue;
  theta?: number;
  distanceMin?: number;
  distanceMax?: number;
  iterations?: number;
}

/**
 * A graph of nodes and edges for the layouts (Tree, DAG, Force, ...) and Nodes and Edges below
 * it. With neither table, the surrounding data are the edges; with edges alone or neither, the
 * nodes are inferred from the edges' endpoints.
 */
export interface GraphDataProps extends RuntimeSettings<"GraphData"> {
  children?: Snippet;
  /** One row per node, including isolated nodes; IDs must be unique. Requires edges; omit it to infer the nodes from the edges' endpoints. */
  nodes?: DataTable;
  /** Edge rows whose source and target values identify nodes. Omit it to read the edges from the surrounding data. */
  edges?: DataTable;
  /** Node ID column of nodes, exposed as the canonical id alias; inferred nodes' IDs are id. */
  nodeKey?: string;
  /** Edge source ID column; defaults to source. */
  source?: string;
  /** Edge target ID column; defaults to target. */
  target?: string;
  /** Which endpoint receives each edge row's reduce results. */
  nodeFrom?: "source" | "target";
  /** Node columns aggregated from the edge rows, by output name; nodes no edge reaches receive each reducer's empty result. */
  reduce?: Record<string, ReducerSpec>;
}
export interface DAGProps extends RuntimeSettings<"DAG"> {
  children?: Snippet;
  orientation?: "down" | "up" | "left" | "right";
  nodeWidth?: any;
  nodeHeight?: any;
  nodeGap?: number;
  layerGap?: number;
}
export interface PackProps extends RuntimeSettings<"Pack"> {
  children?: Snippet;
  /** The ID of the node whose subtree the layout divides: the hierarchy's root (the default: its one parentless node), or any node below it (a drill-down), or input("name", { default }) for one a Select or a click sets. Nodes outside its subtree stay rows of the nodes table, hidden; depth counts from it (0). */
  root?: string | number | boolean | Expression;
  /** How many levels below root to show (1: its children only); root itself is then left out, as its area is the whole layout. Default: every node of the subtree, root included. */
  levels?: number;
  value?: any;
  width?: number;
  height?: number;
  padding?: number;
}
export interface TreemapProps extends PackProps, RuntimeSettings<"Treemap"> {
  paddingInner?: number;
  paddingOuter?: number;
  tile?: "squarify" | "resquarify" | "binary" | "slice" | "dice" | "sliceDice";
}
export interface SankeyProps extends RuntimeSettings<"Sankey"> {
  children?: Snippet;
  value: ColumnName;
  orientation?: "down" | "up" | "left" | "right";
  nodeWidth?: number;
  nodePadding?: number;
  iterations?: number;
  align?: "left" | "right" | "center" | "justify";
}

/** GeoJSON is supplied as host geometry; measurement channels may remain on the GPU. */
export type GeoJSONInput = { type: string; [key: string]: any };
export interface GeoJSONFeatureEvent {
  featureIndex: number;
  featureId?: string | number;
  feature: GeoJSONInput;
  geometryPart: (string | number)[];
  tableRowIndex?: number;
  point: { x: number; y: number; z: number };
  dataPoint?: number[];
}
export interface GeoJSONProps
  extends
    MarkPropsExcept<
      | keyof MarkEvents
      | "rows"
      | "domains"
      | "brush"
      | "data"
      | "drag"
      | "end"
      | "enterEffect"
      | "exitEffect"
      | "fill"
      | "height"
      | "identity"
      | "nearby"
      | "nearest"
      | "ondrag"
      | "ondragend"
      | "position"
      | "rotation"
      | "sampling"
      | "select"
      | "series"
      | "shape"
      | "shapeScale"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "x"
      | "y"
      | "z"
      | "interpolation"
      | "maxInstances"
    >,
    RuntimeSettings<"GeoJSON"> {
  /** Region and point fill; null (Python None) draws only lines and polygon boundaries, using color and width. */
  fill?: Channel | null;
  data?: GeoJSONInput;
  geometry?: string;
  featureKey?: string;
  dataKey?: string;
  height?: Channel;
  /**
   * The height channel's scale: a continuous() scale whose domain (by default [0, 1]) maps onto
   * its range of extrusions (by default [0, 1], nonnegative and increasing); heights outside the
   * domain clamp. The map is linear: a transform, a midpoint or a "symmetric" domain is an error.
   */
  heightScale?: ContinuousScale;
  /** Cartesian 3D only: place feature XY on the horizontal XZ plane and extrude along world Y. */
  plane?: "xy" | "xz";
  /** On a 2D map, zoom to the features (default true); a Plot's own viewport wins. */
  fit?: boolean;
  onclick?: (event: GeoJSONFeatureEvent) => void;
}
export interface GeoJSONHandle {
  getLegendSource(): any;
  whenSettled(): Promise<void>;
  getDiagnostics(): {
    geometryPreparations: number;
    geometryBytes: number;
    features: number;
    cachedColumns: number;
    faceInstances: number;
    faceCapacity: number;
    lineInstances: number;
    lineCapacity: number;
  };
}

/** A vector tile's [z, x, y]: zoom, column (west to east) and row (north to south). */
export type VectorTileCoordinate = [number, number, number];
/** The parts VectorTile draws, in drawing order. */
export type VectorTilePart =
  | "background"
  | "land"
  | "green"
  | "water"
  | "waterways"
  | "buildings"
  | "other"
  | "paths"
  | "roads"
  | "majorRoads"
  | "railways"
  | "boundaries"
  | "places";
/** A part's appearance: fill for areas and points, color and width for lines, size for points
 * and place names (pixels), opacity, and outlines for areas. */
export interface VectorTileStyle {
  fill?: string;
  color?: string;
  width?: number;
  size?: number;
  opacity?: number;
  outlineColor?: string;
  outlineWidth?: number;
}
/**
 * VectorTile: Mapbox Vector Tiles the caller names by coordinates, loaded once and drawn as a
 * styled basemap (docs/VECTOR-TILES.md). Nothing follows the view: pan and zoom move over the
 * loaded tiles.
 */
export interface VectorTileProps extends RuntimeSettings<"VectorTile"> {
  /** Tile URL: a template with {z}, {x} and {y} (in Svelte markup a JavaScript string,
   * url={"https://.../{z}/{x}/{y}.pbf"}), or a function of { z, x, y }. Default: VersaTiles'
   * OpenStreetMap tiles (no key), credited automatically (DEFAULT_TILES). */
  url?: string | ((tile: { z: number; x: number; y: number }) => string);
  /** One tile, [z, x, y]. */
  tile?: VectorTileCoordinate;
  /** Several tiles; each is clipped to its own square. */
  tiles?: VectorTileCoordinate[];
  /** [west, south, east, north] in degrees, with zoom: every tile the box touches (at most 16). */
  bounds?: [number, number, number, number];
  /** The zoom for bounds. */
  zoom?: number;
  /** Already decoded tiles (a FeatureCollection with properties.layerName) instead of url. */
  data?: GeoJSONInput;
  /** Per part: false hides it; an object overrides its appearance (over the scheme). */
  styles?: Partial<Record<VectorTilePart, VectorTileStyle | boolean>>;
  /** The color scheme: a theme preset's name ("dark", "sea", ...), "default", or part styles.
   * Default: the enclosing Theme's vectorTile scheme (a theme without one gets a scheme derived
   * from its colors), else "default". */
  scheme?:
    | ThemePresetName
    | "default"
    | Partial<Record<VectorTilePart, VectorTileStyle | boolean>>;
  /** Source layer name -> part (or false to hide it), before the built-in rules. */
  sourceLayers?: Record<string, Exclude<VectorTilePart, "background"> | false>;
  /** End geometry at each tile's edge (default true): MVT tiles overlap by a buffer. */
  clip?: boolean;
  /** Frame the tiles when they change, in a 2D map (default true). */
  fit?: boolean;
  /** Draw in a local plane instead of longitude/latitude: meters east and north of this
   * [longitude, latitude], times unitsPerMeter. For Cartesian plots and 3D scenes. */
  origin?: [number, number];
  /** Scene units per meter in the local plane (with origin). Default 1. */
  unitsPerMeter?: number;
  /** Cartesian 3D only: "xz" lays the tiles on the horizontal ground plane, as GeoJSON's plane. */
  plane?: "xy" | "xz";
  /** Exports (Python scenes' HTML) embed the tiles on screen as tileData (default true); false
   * exports only the url, so the page loads the tiles when it opens. */
  snapshot?: boolean;
  /** Load the tiles the camera shows too, at a zoom that fits the view (default true): in a 2D
   * view (Cartesian, or a map in any projection) outside nested Frames, and under a 3D flyover
   * camera (cameraMode="flyover", with origin, plane="xz" and linear axes), where the tiles around
   * the camera load at a zoom from its height. The requested tiles draw underneath and stay where
   * live tiles fail. Needs opaque styles. */
  live?: boolean;
  /** The coarsest zoom live tiles load (default 0). */
  minZoom?: number;
  /** The deepest zoom live tiles load (default 14); zoomed in further, these tiles stretch. */
  maxZoom?: number;
  /** Offset the live tile detail in zoom levels (default 0): +1 requests twice the linear
   * detail at the same camera height or view scale; -1 requests coarser tiles. The zoom
   * limits and tile budget still apply. Pass a finite number between -4 and 4. */
  zoomBias?: number;
  /** A credit line drawn in the plot's lower-left corner and kept in every export ("© OpenStreetMap
   * contributors"): most tile licenses require one. Default: the default tiles' credit when
   * there is no url, else none; false hides it. */
  attribution?: string | false;
  /** Embedded tiles instead of loading them: [{ tile: [z, x, y], bytes }], bytes as base64 text
   * or a Uint8Array (null: an empty tile). Exported pages carry the tiles on screen this way. */
  tileData?: {
    tile: VectorTileCoordinate;
    bytes: string | Uint8Array | null;
  }[];
  /** Under a 3D flyover camera, stand the tiles' buildings up from their tags (default true):
   * height (meters; 5 when missing) above min_height, flat roofs, the buildings' fill shaded; false
   * draws flat footprints. 2D maps are always flat; styles.buildings=false hides both. Buildings
   * come from tiles that have them (VersaTiles' at zoom 14). Settings pane: "3D buildings". */
  extrudeBuildings?: boolean;
  /** The settings group's name. */
  name?: string;
  visible?: boolean;
  opacity?: number;
  /** A click on a feature of any area or line part (event.feature has layerName and the tile's tags). */
  onclick?: (event: GeoJSONFeatureEvent) => void;
  /** After tiles load: the tiles, the features decoded and the milliseconds taken. */
  onload?: (event: {
    tiles: VectorTileCoordinate[];
    features: number;
    ms: number;
  }) => void;
  /** A load failed; the previous tiles stay on screen. A live tile's failure has its tile. */
  onerror?: (event: { error: unknown; tile?: VectorTileCoordinate }) => void;
}
export interface VectorTileHandle {
  /** Resolves once the loads requested before the call are drawn (or failed). */
  whenSettled(): Promise<void>;
  /** The tiles on screen and their decoded features (undefined in live mode). */
  getResult():
    { data: GeoJSONInput; tiles: VectorTileCoordinate[] } | undefined;
  /** The requested tiles, and in live mode the current level's, as tileData (base64 bytes). */
  getTileData(): { tile: VectorTileCoordinate; bytes: string | null }[];
  /** The mounted parts' marks by part name (Stage 24's parts; empty in live mode). */
  getParts(): Partial<Record<VectorTilePart, GeoJSONHandle>>;
  /** Load state. `live` (null unless live): the zoom, the tiles selected, shown and failed, the
   * previous level's tiles still drawn, the slots, the requests queued or running, and the
   * [longitude, latitude] the selection is centered on. */
  getStatus(): {
    pending: boolean;
    error: string;
    tiles: number;
    features: number;
    live: {
      zoom: number;
      selected: number;
      shown: number;
      failed: number;
      ring: number;
      previous: number;
      slots: number;
      requests: number;
      center: [number, number];
    } | null;
    /** Under a 3D flyover camera: the tiles whose buildings stand extruded. */
    extruded?: number;
  };
  getMark(): any;
  getLegendSource(): undefined;
}

export interface AxisDefinition {
  /** The data range the axis spans; "auto" (the default) spans the marks' data, widened by padding and, on a 2D linear numeric axis, rounded out to tick values. Two dates make a datetime axis over them. Ends that are reductions (extent(column, {where})) are read from the data and follow it and the selection; automatic while no row matches. */
  domain?:
    | [number, number]
    | [Date, Date]
    | [number | Date | Expression, number | Date | Expression]
    | "auto";
  /** How data maps to the axis: "linear" (default), "log", "sqrt" or "symlog"; under log a value at or below zero is missing. */
  transform?: ScaleTransformName;
  /** Where the domain lands in the parent frame's coordinates (a Frame's sub-range of its parent axis). */
  range?: [number, number];
  /** symlog's constant c > 0 (default 1): the axis is linear within ±c and logarithmic beyond. */
  constant?: number;
  /** Flip the axis direction on screen (top-to-bottom for y, right-to-left for x, near-to-far for z). */
  invert?: boolean;
  /** A categorical scale: the axis becomes one band per category, in the scale's order. */
  scale?: CategoricalScale;
  /** The axis title. Empty (or null) means automatic: the axis is titled by a categorical position scale's label, else by the name of the one column its marks plot there (through a Facet's value/x/y aliases and transform outputs such as a Bin's edges); an axis whose marks plot several columns, only constants, raw arrays or expressions, or nothing has no title. A Frame that sets its own domain, range, transform or scale for this dimension reads only its own label. */
  label?: string;
  /** false hides the axis (its line, ticks and labels). */
  visible?: boolean;
  /** Which side the axis is drawn on; "right" or "top" for a second axis. */
  side?: "left" | "right" | "top" | "bottom";
  /** "datetime" labels positions as times counted from origin in timezone; a Date or datetime64 column sets it. */
  type?: "numeric" | "datetime";
  /** Datetime axes: the time (a Date, or Unix milliseconds) positions count from. */
  origin?: number | Date;
  /** Datetime axes: the IANA time zone labels and calendar intervals use (default UTC). */
  timezone?: string;
  /** A d3-format string (".1f", ",") or, on a datetime axis, a time pattern ("%b %d"). */
  format?: string;
  /** Datetime axes: the calendar step between major ticks ("1 month", "15 minutes"). */
  majorInterval?: CalendarInterval | string;
  /** Datetime axes: the calendar step between minor ticks. */
  minorInterval?: CalendarInterval | string;
  /** false hides the major ticks and their labels. */
  major?: boolean;
  /** Draw minor ticks between the major ones (subdivisions of each step). */
  minor?: boolean;
  /** The spacing between major ticks, in data units, instead of an automatic choice. */
  step?: number;
  /** About how many major ticks to draw; the axis picks round values near that count. Automatic: about one per 80 px along a 2D linear numeric x axis and per 45 px along y, else per 90 px. */
  tickCount?: number;
  /** How many minor intervals each major step splits into (at least 2; default 5). */
  subdivisions?: number;
  /** The spacing between minor ticks, in data units, instead of subdivisions. */
  minorStep?: number;
  /** An automatic domain's margin on each side, as a fraction of its span (default 0.04); on a 2D linear numeric axis the padded ends then round out to tick values, and 0 keeps the data's ends. An explicit domain is not padded. */
  padding?: number;
  /** Grid lines at the major ticks ("major") or at major and minor ticks ("major-minor"); "off" draws none. */
  grid?: "off" | "major" | "major-minor";
  /** Show the baseline independently of ticks, labels, grids and arrows. */
  line?: boolean;
  /** Show tick marks independently of tick labels. */
  ticks?: boolean;
  /** Tick length in CSS pixels; defaults to the theme's tick size. */
  tickSize?: number;
  /** Tick direction relative to the axes interior. */
  tickDirection?: "outside" | "inside" | "both";
  /** Numeric title font weight from 1 to 1000. */
  titleFontWeight?: number;
  /** Grid stroke color; omitted adapts to the background. */
  gridColor?: string;
  /** Grid stroke width in CSS pixels. */
  gridWidth?: number;
  /** Alternating dash and gap lengths in CSS pixels; [] draws solid grids. */
  gridDash?: number[];
  /** The baseline's stroke width in CSS pixels; 0 hides the baseline and arrow shafts. */
  lineWidth?: number;
  /** The tick marks' stroke width in CSS pixels. */
  tickWidth?: number;
  /** An arrowhead at the axis's start, end or both ends. */
  arrow?: "none" | "start" | "end" | "both";
  /** The arrowhead's size in CSS pixels. */
  arrowSize?: number;
  /** "hide" (default) drops tick labels that would overlap their neighbors; "show" keeps them all. */
  labelOverlap?: "hide" | "show";
  /** Rotates the tick labels, in degrees. */
  tickLabelAngle?: number;
  /** How tick labels align to their ticks; "auto" chooses by the axis side and angle. */
  tickLabelAlign?: "auto" | "start" | "middle" | "end";
  /** Tick labels outside the axes interior (default) or inside it. */
  tickLabelPlacement?: "inside" | "outside";
  /** Extra distance between tick labels and the axis, in CSS pixels. */
  tickLabelOffset?: number;
  /** Where the title sits along the axis: at its start, middle or end. */
  titlePosition?: "start" | "middle" | "end";
  /** The title's rotation in degrees; "auto" reads along a vertical axis. */
  titleAngle?: "auto" | number;
  /** The title outside the axes interior (default) or inside it. */
  titlePlacement?: "inside" | "outside";
  /** Extra distance between the title and the tick labels, in CSS pixels. */
  titleOffset?: number;
  /** Datetime x axes: a second row of labels where the coarser unit changes (the date under
   * hours, the month and year under days); default true. */
  context?: boolean;
  /** Datetime axes: intervals the axis leaves out, in its time zone ("weekends", { hours: [16,
   * 9.5] } every day, { dates: ["2026-12-25"] } whole days, { from, to } one interval). */
  breaks?: AxisBreak | AxisBreak[];
  /** A model calendar's axis (set from its column): "360_day", "all_leap" or "noleap", with the
   * column's units ("days since 1850-01-01"). */
  calendar?: string | { name: string; units: string };
}
/** An axis break (TODO 53.5): a pattern or an interval. */
export type AxisBreak =
  | "weekends"
  | { hours: [number, number] }
  | { dates: (string | Date)[] }
  | { from: string | number | Date; to: string | number | Date };
export interface AxisProps {
  x?: AxisDefinition;
  y?: AxisDefinition;
  z?: AxisDefinition;
  scaleDefaults?: AppearanceScaleDefaults;
  name?: string;
  autoBounds?: boolean;
  children?: Snippet;
}
export interface AxisHandle {
  getAxisLayout(): any;
  getMinimapSource(): MinimapSource;
  subscribeSettings(listener: (settings: any) => void): () => void;
}
/** Marginals (TODO 136.16): a scatter's Points props, with the figure's data, columns, bins and
 * height. Its children are drawn in the scatter's Plot, over the points. */
export interface MarginalsProps
  extends
    MarkPropsExcept<
      | "rows"
      | "position"
      | "z"
      | "width"
      | "widthScale"
      | "domains"
      | "end"
      | "interpolation"
      | "sampling"
      | "series"
      | "start"
      | "textureResolution"
      | "sizeUnits"
      | "maxInstances"
      | "rotation"
    >,
    RuntimeSettings<"Marginals"> {
  /** A table or live pipeline output for the scatter and its histograms; the same as wrapping the Marginals in Data. */
  data?: DataProps["value"];
  /** Column types for data, as on Data. */
  schema?: Record<string, any>;
  /** The column, or columns, that identify each row of data across updates, as on Data. */
  key?: string | string[];
  /** The column the scatter plots along x, binned by the histogram above it. */
  x: ColumnName;
  /** The column the scatter plots along y, binned by the histogram to its right. */
  y: ColumnName;
  /** Both histograms' bins, as Histogram's bins. Default 30. */
  bins?: number | number[] | BinRule | Expression;
  /** The height of the whole figure in CSS pixels, at least 160 (default 450): the histograms take a fifth of it. */
  height?: number;
  /** The scatter's 2D view, as a Plot's viewport; the histograms follow it on their axes. */
  viewport?: Viewport2D;
  /** Called when the viewer pans or zooms the scatter, with its new viewport. */
  onviewportchange?: (viewport: Viewport2D) => void;
  children?: Snippet;
}
/** Panels (TODO 136.16): Plots stacked over one shared x. */
export interface PanelsProps extends RuntimeSettings<"Panels"> {
  /** Settings for the shared x axis (label, format, domain, ...), under each Plot's own x settings; only the last Plot draws it. */
  x?: AxisDefinition;
  /** Space between the Plots in CSS pixels. Default 6. */
  gap?: number;
  children?: Snippet;
}
/** FocusContext (TODO 136.16): a Line's props for the focus, with the figure's data, columns and
 * height. A drag across the strip below zooms the focus to the dragged x interval; its children
 * are drawn in the focus. */
export interface FocusContextProps
  extends
    MarkPropsExcept<
      | "rows"
      | "position"
      | "z"
      | "domains"
      | "brush"
      | "start"
      | "end"
      | "interpolation"
      | "maxInstances"
      | "rotation"
      | "sampling"
      | "shape"
      | "shapeScale"
      | "sizeUnits"
      | "textureResolution"
    >,
    RuntimeSettings<"FocusContext"> {
  /** A table or live pipeline output for both views; the same as wrapping the FocusContext in Data. */
  data?: DataProps["value"];
  /** Column types for data, as on Data. */
  schema?: Record<string, any>;
  /** The column, or columns, that identify each row of data across updates, as on Data. */
  key?: string | string[];
  /** The column the lines plot along x: the strip's brush zooms the focus to an interval of it. */
  x: ColumnName;
  /** The column the lines plot along y. */
  y: ColumnName;
  /** The column naming each line, as Line's series. */
  series?: string;
  /** The height of the whole figure in CSS pixels, at least 160 (default 360): the strip takes a fifth of it. */
  height?: number;
  /** The focus's 2D view, as a Plot's viewport. */
  viewport?: Viewport2D;
  /** Called when the viewer pans or zooms the focus, with its new viewport. */
  onviewportchange?: (viewport: Viewport2D) => void;
  children?: Snippet;
}
/** Filled polygons (TODO 47.4): vertex rows, each group of `series` a polygon (its rows its vertices, in order), triangulated on the host; inside Contour (bands), Voronoi or Hull, their triangles. `outlineColor` and `outlineWidth` (pixels) draw the polygons' own edges. */
export interface PolygonProps
  extends
    MarkPropsExcept<
      | "rows"
      | "brush"
      | "color"
      | "colorScale"
      | "drag"
      | "end"
      | "nearby"
      | "ondrag"
      | "ondragend"
      | "position"
      | "rotation"
      | "sampling"
      | "shape"
      | "shapeScale"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "width"
      | "widthScale"
      | "z"
      | "interpolation"
      | "maxInstances"
    >,
    RuntimeSettings<"Polygon"> {
  x?: string;
  y?: string;
}
/** MarkProps' named members but `K` (Omit would keep only MarkProps' index signature). */
type MarkPropsExcept<K extends string> = {
  [
    P in keyof MarkProps as string extends P
      ? never
      : number extends P
        ? never
        : P extends K
          ? never
          : P
  ]: MarkProps[P];
};

/** Points: MarkProps plus pixel offsets (Dodge's beeswarm places them with dy="offset"). */
export interface PointsProps
  extends
    MarkPropsExcept<
      | "end"
      | "interpolation"
      | "sampling"
      | "series"
      | "start"
      | "textureResolution"
      | "width"
      | "widthScale"
    >,
    RuntimeSettings<"Points"> {
  /** Moves each row along x in data units: on a categorical axis a band is one unit, so 0.25 is
   * a quarter of the category's band (grouped bars, dodged points). dx moves by pixels. */
  xOffset?: Channel;
  /** Moves each row along y in data units: on a categorical axis a band is one unit. */
  yOffset?: Channel;
  /** Write visible point fragments to the depth buffer. Default true for normal blending;
   * other blend modes disable depth writes. False leaves depth testing and nearest-point
   * picking unchanged, but permits later points to cover earlier ones in a 3D view. */
  depthWrite?: boolean;
  /** Moves each point right, in CSS pixels: a number or a column. */
  dx?: Channel;
  /** Moves each point down, in CSS pixels: a number or a column. */
  dy?: Channel;
}
/** Points3D: MarkProps less the options it has no use for. */
export interface Points3DProps
  extends
    MarkPropsExcept<
      | "color"
      | "colorScale"
      | "end"
      | "interpolation"
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "rotation"
      | "sampling"
      | "series"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "width"
      | "widthScale"
    >,
    RuntimeSettings<"Points3D"> {
  /** Write visible point fragments to the depth buffer. Default true for normal blending;
   * other blend modes disable depth writes. False leaves depth testing and nearest-point
   * picking unchanged, but permits later points to cover earlier ones. */
  depthWrite?: boolean;
}
/** Heatmap: MarkProps less the options it has no use for. */
export interface HeatmapProps
  extends
    MarkPropsExcept<
      | "brush"
      | "color"
      | "colorScale"
      | "drag"
      | "end"
      | "interpolation"
      | "nearby"
      | "nearest"
      | "ondrag"
      | "ondragend"
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "position"
      | "rotation"
      | "sampling"
      | "series"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "start"
      | "width"
      | "widthScale"
      | "maxInstances"
      | "shape"
      | "shapeScale"
    >,
    RuntimeSettings<"Heatmap"> {
  /** Draw each cell as a flat square of its value (true) or blend neighboring cells (false).
   * Unset, a 2-D array of at most 64 cells along each side is sharp, unless surfaceMode or
   * contours are on or the plot is 3D; a finer array and a grid table's field blend. */
  pixelated?: boolean;
  children?: Snippet;
}
/** A surface: a height grid, or a mesh of positions and triangle indices. */
export interface SurfaceProps
  extends
    MarkPropsExcept<
      | "brush"
      | "drag"
      | "end"
      | "interpolation"
      | "nearby"
      | "nearest"
      | "ondrag"
      | "ondragend"
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "rotation"
      | "sampling"
      | "series"
      | "shape"
      | "shapeScale"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "width"
      | "widthScale"
      | "z"
      | "maxInstances"
    >,
    RuntimeSettings<"Surface"> {
  /** The heights: a 2-D grid over the x and y extents. */
  height?: any;
  /** With position, a mesh: three vertex indices per triangle. */
  indices?: any;
}
/** Text in 3D: MarkProps plus the text, as plain text or TeX. */
export interface Text3DProps
  extends
    MarkPropsExcept<
      | "brush"
      | "shade"
      | "colorScale"
      | "colormap"
      | "drag"
      | "end"
      | "enterEffect"
      | "exitEffect"
      | "fill"
      | "fillScale"
      | "hover"
      | "identity"
      | "interpolation"
      | "nearby"
      | "nearest"
      | "ondrag"
      | "ondragend"
      | "opacityScale"
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "respond"
      | "rotation"
      | "sampling"
      | "select"
      | "selectionOpacity"
      | "series"
      | "shape"
      | "shapeScale"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "tooltip"
      | "width"
      | "widthScale"
      | "x"
      | "y"
      | "z"
      | "maxInstances"
    >,
    RuntimeSettings<"Text3D"> {
  /** The text: a string, or a column of strings. */
  text?: string | number | Array<string | number> | DictionaryColumn;
  /** Draw the text as TeX math (default false). */
  tex?: boolean;
}
/** A table for the marks inside (Svelte Data). */
export interface DataProps extends RuntimeSettings<"Data"> {
  /** Column or columns matching rows across animation snapshots, inherited by descendants. Overrides Data.key for motion only; groups must be unique after filtering/transforms. null restores Data.key, then position. */
  animationGroup?: string | string[] | null;

  /** The table: columns, rows, typed arrays, an Arrow table or a GeoJSON FeatureCollection; or a transform's handle (bind:this on a Filter, Group, ...), whose live output the components inside read, computed once wherever it is drawn. */
  value?: DataTable | { dataSource(): unknown };
  /** Number of rows instead of a table: an integer from 0 to 2147483647. Generate columns with row(), random() and Calculate; pass value or rows, not both. */
  rows?: number;
  /** The column (or columns) whose values identify a row across updates. */
  key?: string | string[];
  /** Column types: numeric, categorical, ordinal, boolean, datetime, duration or geometry. */
  schema?: DataSchema;
  children?: Snippet;
}
/** A layout's nodes, as a table for the marks inside. */
export interface NodesProps extends RuntimeSettings<"Nodes"> {
  /** Drag nodes with the pointer (Force layouts). */
  drag?: boolean;
  children?: Snippet;
}
/** Select graph edges as an ordinary table; endpoint geometry follows current node columns. */
export interface EdgesProps extends RuntimeSettings<"Edges"> {
  children?: Snippet;
}
/** Inherited channels and appearance; child properties take precedence. */
export interface MappingProps
  extends
    MarkPropsExcept<
      | "rows"
      | "domains"
      | "label"
      | "legend"
      | "options"
      | "colormap"
      | "outlineColorScale"
      | "opacityScale"
      | "blend"
      | "shade"
      | "sizeUnits"
      | "textureResolution"
      | "interpolation"
      | "sampling"
      | "maxInstances"
      | "identity"
      | "tooltip"
      | "nearby"
      | "nearest"
      | "drag"
      | "ondrag"
      | "ondragend"
    >,
    RuntimeSettings<"Mapping"> {
  children?: import("svelte").Snippet;
}
/** A box drawn behind each label (TODO 46): colors, and sizes in CSS pixels. */
export interface LabelBox {
  /** Default white. */
  fill?: string;
  /** The outline's color. Default #8a94a6. */
  outlineColor?: string;
  /** Default 1; 0 draws no outline. */
  outlineWidth?: number;
  /** Space between the text and the box's edge. Default 4. */
  padding?: number;
  /** Corner radius. Default 3. */
  radius?: number;
  /** 0 to 1. Default 1. */
  opacity?: number;
}
/** A line from near each label's point (a 3 px gap) to its box's nearest edge (TODO 46). */
export interface LabelLeader {
  /** Default the text's color. */
  color?: string;
  /** In CSS pixels. Default 1.5. */
  width?: number;
}
export interface TextProps
  extends
    MarkPropsExcept<
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "end"
      | "fill"
      | "fillScale"
      | "interpolation"
      | "sampling"
      | "series"
      | "sizeUnits"
      | "start"
      | "textureResolution"
      | "width"
      | "widthScale"
      | "rotation"
      | "shape"
      | "shapeScale"
    >,
    RuntimeSettings<"Text"> {
  /** Moves each row along x in data units: on a categorical axis a band is one unit, so 0.25 is
   * a quarter of the category's band (grouped bars, dodged points). dx moves by pixels. */
  xOffset?: Channel;
  /** Moves each row along y in data units: on a categorical axis a band is one unit. */
  yOffset?: Channel;
  text?: string | number | Array<string | number> | DictionaryColumn;
  /** How numbers in the text are written: a d3-format string (",.0f", ".1%", "$,.2f"; default the theme's numbers.format, else as tooltips write them), a %-pattern for a datetime column ("%b %d"), or "axis": text is an axis's view-state field ("@pointer_x", "@view_y_min", ...), written as the axis's readout; "@pointer" writes both of the pointer's, "x, y". */
  format?: "axis" | string;
  /** Which part of each label is at its point; "auto": each row's dx side (left of a label offset right). */
  align?: "left" | "center" | "right" | "auto";
  dx?: Channel;
  dy?: Channel;
  /** A CSS font-family. Default the plot's font. */
  font?: string;
  /** A box behind each label: true for the default (white, a gray outline), or its settings. Default none. */
  box?: boolean | LabelBox;
  /** With an offset, a line from the point to the label's box (or its padded text): true, or its color and width. Default none. */
  leader?: boolean | LabelLeader;
}
/** Anchor: an invisible positional mark that connections attach to. It contributes to
 * automatic domains and Fit like any positional mark and animates its channels with animate(),
 * but draws nothing: no geometry, no picking target, no legend entry. */
export interface AnchorProps
  extends AnimationOptions, RuntimeSettings<"Anchor"> {
  /** X position: a column name, an expression, a number, or an array; animate() animates it. */
  x?: Channel;
  /** Y position: a column name, an expression, a number, or an array; animate() animates it. */
  y?: Channel;
  /** Z position (3D views): a column name, an expression, a number, or an array. */
  z?: Channel;
  /** Positions as a column or an N x 2 / N x 3 array, instead of x/y/z. */
  position?: Channel;
  /** The endpoint name: facet.endpoint(name) and partition.endpoint(name) select the Anchor repeated in every cell by it. Also its settings-tree label. */
  name?: string;
  /** The data identity whose keys this Anchor's rows carry; defaults to the Data scope's. */
  identity?: DataIdentity;
  /** Keyed updates: entering rows start from their channels' animate(..., {enter}) values. An Anchor draws nothing, so "fade" only sets the transition's timing. */
  enterEffect?: MarkProps["enterEffect"];
  /** Keyed updates: departing rows stay in place (and connectable) until the transition ends. */
  exitEffect?: MarkProps["exitEffect"];
}
/** A bound Anchor. endpoint() selects it for connect(); its only attachment is "center". */
export interface AnchorHandle {
  getMark(): any;
  getLegendSource(): undefined;
  endpoint(config?: { at?: "center" }): EndpointDescriptor;
  subscribeSettings(listener: (settings: any) => void): () => void;
}
/** One endpoint of connect(): a mark with an optional attachment `at` (from mark.endpoint({at})), or the uniquely named repeated mark inside a Facet or Partition (from facet.endpoint(name, {at})). */
export interface EndpointDescriptor {
  readonly __hmplotEndpoint: true;
  readonly handle?: { getMark(): any };
  readonly scope?: unknown;
  readonly name?: string;
  readonly at?: string;
  readonly ref?: string;
  readonly kind?: string;
  readonly scopeKind?: string;
}
/** connect() options. key matches rows by one column's exact values ("1" never matches 1); without it, endpoints must show observations of one table. order: "facet" (the default, and the only order) applies to one endpoint passed alone, which must be a mark repeated in Facet cells or Partition groups: it connects the cells in facet order. */
export interface ConnectOptions {
  /** A column matched by exact value in every endpoint; without it, the endpoints must show observations of one table, matched by identity. */
  key?: string;
  /** "facet" (the default and only order): one endpoint repeated in Facet cells or Partition groups connects its cells in facet order. */
  order?: "facet";
}
/** The immutable, versioned result of connect(); the marks that accept `connections` resolve it. */
export interface ConnectDescriptor {
  readonly __hmplotConnect: true;
  readonly version: 1;
  readonly endpoints: readonly EndpointDescriptor[];
  readonly key?: string;
  readonly order?: "facet";
}
/** A bound mark that can be a connection endpoint (Points, Points3D, Text, Rect, Prism, Segments, Arrows3D, Arrows, Bar, Histogram, BoxPlot). endpoint({at}) picks an attachment: "center" (points, boxes), "anchor" (Text), "left"/"right"/"top"/"bottom" edge midpoints (Rect, Prism, Bar, Histogram), "value"/"baseline" (Bar, Histogram), "start"/"end" (Segments, Arrows3D, Arrows; required). */
export interface EndpointHandle {
  getMark(): any;
  endpoint(config?: { at?: string }): EndpointDescriptor;
}
/** The props of the marks that can draw connections between endpoints. */
export interface ConnectionProps {
  /** Draw between endpoint marks instead of from x/y/z, position, start or end: connections={connect(before, after, {key: "id"})}. A Line draws one path per matched key through the endpoints in argument order (or, for one repeated endpoint passed alone, through its Facet cells in facet order); Segments, Arrows and Arrows draw one row (one arrowhead) per adjacent pair. Positions are the endpoints' on-screen positions, each through its own frame; color, width and the other channels resolve per connection: unqualified fields in the shared table when every endpoint shows one table's observations, "source.<field>"/"target.<field>" in the first/last endpoint's table. A missing key breaks the path; a duplicate key is an error. */
  connections?: ConnectDescriptor;
}
/** A line's dashes (R2.0): true, a dash length in pixels (gaps as long), or [dash, gap] in pixels. */
export interface DashProps {
  /** Dashes: true (4 px dashes and gaps), a dash length in CSS pixels (gaps as long), or [dash,
   * gap] in CSS pixels, measured along the drawn path whatever the zoom. */
  dash?: boolean | number | [number, number];
}
/** A path's curve (Line, Segments, Arrows3D, Arrows). */
export interface CurveProps {
  /** How the path runs between its points (default "linear"). */
  curve?: CurveName;
}
/** Line props: MarkProps plus `connections`. */
export interface LineProps
  extends
    MarkPropsExcept<
      | "drag"
      | "end"
      | "fill"
      | "fillScale"
      | "nearby"
      | "ondrag"
      | "ondragend"
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "rotation"
      | "shape"
      | "shapeScale"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "start"
      | "textureResolution"
    >,
    ConnectionProps,
    DashProps,
    CurveProps {
  /** catmull-rom's alpha: 0 uniform, 0.5 centripetal (the default), 1 chordal. */
  curveAlpha?: number;
}
/** The control points of a Bézier `curve` between start and end (R2.0: "quadratic" takes control1, "cubic" both). */
export interface ControlProps {
  control1?: Channel;
  control2?: Channel;
}
/** Segments props: MarkProps plus `connections`. */
export interface SegmentsProps
  extends
    MarkPropsExcept<
      | "brush"
      | "drag"
      | "fill"
      | "fillScale"
      | "nearby"
      | "ondrag"
      | "ondragend"
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "position"
      | "rotation"
      | "sampling"
      | "series"
      | "shape"
      | "shapeScale"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "textureResolution"
      | "x"
      | "y"
      | "z"
    >,
    ConnectionProps,
    DashProps,
    CurveProps,
    ControlProps {
  /** "bar": a bar across both ends; "arrow": an arrowhead at the true end, following the curve. Default "none". */
  cap?: "none" | "bar" | "arrow";
  /** The length of the bars cap="bar" draws, in CSS pixels. Default 6. */
  capSize?: number;
  /** The length of cap="arrow" heads, in CSS pixels, limited to the segment's length. Default 10. */
  headLength?: number;
  /** The width of cap="arrow" heads, in CSS pixels. Default 8. */
  headWidth?: number;
}
/** Arrows3D props: MarkProps plus `connections`. */
export interface Arrows3DProps
  extends
    MarkPropsExcept<
      | "brush"
      | "drag"
      | "fill"
      | "fillScale"
      | "nearby"
      | "ondrag"
      | "ondragend"
      | "outlineColor"
      | "outlineColorScale"
      | "outlineWidth"
      | "outlineOpacity"
      | "position"
      | "rotation"
      | "sampling"
      | "series"
      | "shape"
      | "shapeScale"
      | "size"
      | "sizeScale"
      | "sizeUnits"
      | "textureResolution"
      | "x"
      | "y"
      | "z"
    >,
    ConnectionProps,
    CurveProps,
    ControlProps {}
/** Tree: a rooted layout of reachable source/target edges, published to Nodes (id, parent, position, x, y, presence, parentPosition, parentX, parentY, depth, degree, order, and node-table columns) and Edges (start, end, depth, presence). Partition adds node and parent rectangle bounds. Parent coordinates are NaN for the root. Node selection and animation follow node IDs. */
export interface TreeProps extends RuntimeSettings<"Tree"> {
  children?: import("svelte").Snippet;
  /** The starting node's ID, or a scalar reduction expression over the node table, including its selection. Every mode lays out only nodes reachable from it; its depth is zero. */
  root: string | number | boolean | Expression;
  /** Follow source-to-target edges only. False traverses both ways and reroots the reachable component, in every mode. */
  directed?: boolean;
  orientation?: "down" | "up" | "left" | "right";
  siblingSpacing?: number;
  depthSpacing?: number;
  /** "tidy" (default): compact CPU Reingold–Tilford layout. "tidy-approx": GPU layout reserving a horizontal interval per subtree, with more whitespace. "partition": GPU icicle bounds x0/x1/y0/y1. "cluster": a dendrogram, as d3.cluster: every leaf at 0 along the tree and one siblingSpacing apart across it, in `order` (leaf k at k); each parent centered over its children (their mean) and 1 + its tallest child from the leaves, or at its `height`. In every mode the nodes' `order` column is each leaf's place among the leaves (0, 1, 2, ...), NaN for inner nodes: sort a heatmap's rows or columns by it. */
  mode?: "tidy" | "tidy-approx" | "partition" | "cluster";
  /** Partition band thickness, as a nonnegative number, node-table column or expression. Each child's band starts at its parent's end. Zero collapses a layer; tween() runs before layout on the plot clock. */
  layerHeight?: number | ColumnName | Expression;
  /** Incoming edge lengths read from the edge table, as a nonnegative number, column or expression. Tidy modes accumulate them along each root path, multiplied by depthSpacing. Partition uses layerHeight instead; cluster uses merge heights. */
  edgeLength?: number | ColumnName | Expression;
  /** Node-table predicate. Hidden nodes disconnect their descendants; layout enter/exit retains departing branches until their numeric contributions finish shrinking. The root remains present. */
  where?: boolean | ColumnName | Expression;
  /** Numeric contributions for entering nodes/edges. Omitted endpoints are zero. Existing rows use their normal input values. Initial mounting rests at the target. */
  enter?: { nodeWidth?: number; layerHeight?: number; edgeLength?: number };
  /** Numeric contributions departing nodes/edges shrink toward before removal. Omitted endpoints are zero; rows remain in the layout during the transition. */
  exit?: { nodeWidth?: number; layerHeight?: number; edgeLength?: number };
  /** Duration of layout-owned entry/exit, in milliseconds. Incoming tween() expressions retain their own timing. */
  animationDuration?: number;
  /** Easing of layout-owned entry/exit. */
  animationEasing?: AnimationOptions["animationEasing"];
  /** Node widths, as a number, node-table column or expression. GPU modes consume tween() before layout, so subtrees shrink coherently. Tidy modes also permit zero for collapsing branches. */
  nodeWidth?: any;
  childAlign?: "left" | "center" | "right";
  widthMode?: "proportional" | "fixed";
  visualMargin?: number;
  /** mode="cluster" only: a column of the nodes table (or an expression over it) giving each node's merge height, such as hm.linkage_table's "height". Nodes sit that far from the leaves (times depthSpacing), to scale as scipy's dendrogram draws them: y is the height in "down", -height in "up", x is the height in "left" and -height in "right". Leaves take 0 (a missing leaf value reads as 0); every merge needs a finite height, at least its children's. */
  height?: string | Expression;
  name?: string;
}
/** How a path runs between its points. Line takes linear, the steps, monotone-x, monotone-y,
 * catmull-rom and basis; Segments and Arrows take linear, the steps, link-horizontal,
 * link-vertical, quadratic and cubic. */
export type CurveName =
  | "linear"
  | "step"
  | "step-before"
  | "step-after"
  | "monotone-x"
  | "monotone-y"
  | "catmull-rom"
  | "basis"
  | "quadratic"
  | "cubic"
  | "link-horizontal"
  | "link-vertical";

/** A coordinate frame. Nested ranges are expressed in parent data coordinates. */
export interface FramePlacement {
  /** Descriptor version. Omitted means a legacy (version 1) descriptor; any other value is rejected. */
  version?: 1;
  anchor: [number, number] | [number, number, number];
  size: [number, number] | [number, number, number];
  /** Defaults to tangent on spherical parents, parent otherwise. */
  orientation?: "parent" | "billboard" | "tangent";
  rotation?: [number, number, number];
}
export interface FrameProps
  extends AxisProps, BoundsAnimationOptions, RuntimeSettings<"Frame"> {
  /** Column or columns matching rows across animation snapshots, inherited by descendants. Overrides Data.key for motion only; groups must be unique after filtering/transforms. null restores Data.key, then position. */
  animationGroup?: string | string[] | null;

  /** Complete border for a rectangular 2D Cartesian frame, without repeated labels or ticks. */
  axisFrame?: boolean;
  /** Clip this frame's marks and picking to its axes interior, intersected with parent masks. */
  axisMask?: boolean;
  /** Anchors a fixed-size frame at a point of its parent; "fit" centers it in a Cartesian parent's domain, across 90% of the parent's shorter side. */
  placement?: FramePlacement | "fit";
  /** Reference lines in this frame's coordinates (a spoke or circle in a polar frame), as Plot's. */
  rules?: ReferenceRule[];
  /** Shaded spans of this frame's x or y axis behind its marks, as Plot's. */
  bands?: ReferenceBand[];
  /** Coordinate system of this frame. A nested frame that changes it needs x/y ranges (it is drawn through its parent) or a placement. */
  coordinates?: "cartesian" | "spherical" | "polar";
  sphericalView?: PlotProps["sphericalView"];
  angleUnit?: PlotProps["angleUnit"];
  anglePeriod?: number;
  baseRadius?: number;
  radialScale?: number;
  polarAxis?: PlotProps["polarAxis"];
  projection?: PlotProps["projection"];
  projectionCenter?: PlotProps["projectionCenter"];
  parallels?: PlotProps["parallels"];
  /** A glow around a spherical Frame's globe in a 3D plot: true, or { color (CSS, default "#7fb2ff"),
   * thickness (a fraction of the radius, default 0.1) }. A rim brightest at the globe's edge that
   * fades outward; it moves with a placed Frame. Not a mark: it is not picked, sets no axis
   * domain and has no legend. SVG and PDF exports draw the whole plot as an image. */
  atmosphere?: boolean | { color?: string; thickness?: number };
}
export interface FrameHandle extends AxisHandle, ScreenMappingHandle {
  getFrameOptions(): any;
}
// The built-in templates' props (TODO 130.5), generated from the signatures in their definitions
// (src/lib/compound/*.js) by scripts/generate-python-signatures.mjs.
export type {
  ArrowsProps,
  BarProps,
  BoxPlotProps,
  CalloutProps,
  CrosshairProps,
  DensityBandsProps,
  DensityContourProps,
  EcdfProps,
  ErrorBarsProps,
  HistogramProps,
  LollipopProps,
  PieProps,
  RuleXProps,
  RuleYProps,
  SmoothProps,
  SwarmProps,
  ViolinProps,
} from "../compound/generated/types.js";

// Generated from the bundled numerical plug-ins' component manifests.
export type {
  DensityProps,
  RegressionProps,
  ContourProps,
  DelaunayProps,
  VoronoiProps,
  HullProps,
} from "../plugins/generated/types.js";
