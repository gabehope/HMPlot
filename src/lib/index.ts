export { default as Plot } from "./plot/plot.svelte";
export { default as Html } from "./plot/html.svelte";
export { default as TableView } from "./plot/tableView.svelte";
export type { HtmlProps, ScreenMapping, ScreenMappingHandle } from "./plot/publicTypes.js";
export { default as Heatmap } from "./plot/bound/heatmap.svelte";
export { default as Points3D } from "./plot/bound/scatter3d.svelte";
export { default as Points } from "./plot/bound/scatterPoints.svelte";
export { default as Segments } from "./plot/bound/segments.svelte";
export { default as Line } from "./plot/bound/line.svelte";
export { default as Surface } from "./plot/bound/surface.svelte";
export { default as Arrows3D } from "./plot/bound/arrows.svelte";
export { default as Text3D } from "./plot/bound/text.svelte";
export { initializePlot } from "./jaxExtensions/setup.js";
export type {
  PlotProps,
  AxisDefinition, Axes3DConfig, HistogramProps,
  DocumentExportOptions, DocumentExportResult, ExportReport,
  PlotSettings,
  MarkProps, MarkEvent, MarkEvents,
  AnimationOptions,
  TooltipField, TooltipOptions, TooltipSetting, NearestOptions,
} from "./plot/publicTypes.js";
export { default as Image } from "./plot/bound/image.svelte";

export { default as Theme } from "./plot/theme.svelte";
// Plugins (TODO 138.3): effects (Plot effects=[...]) defined in JavaScript, registered once.
export { registerPlugin, definePlugin } from "./plot/plugins/library.js";
// The first-party plugins (the sky, the atmosphere; TODO 138.5): outside the core, registered as
// the package loads.
import { registerFirstPartyPlugins } from "./plugins/index.js";
registerFirstPartyPlugins();
export { light } from "./plot/utils/lights.js";
export type { LightSpec, EffectSpec, ShadeSpec } from "./plot/publicTypes.js";
export { createTheme } from "./plot/utils/theme.js";
export { themes } from "./plot/utils/themePresets.js";
export type { ThemePresetName } from "./plot/publicTypes.js";
export type { ThemeDefinition, ThemeResource, ThemeProps } from "./plot/publicTypes.js";

export { datetimeCoordinates } from "./plot/utils/datetime.js";

export type {
  CalendarInterval,
  ReferenceRule,
  ReferenceBand,
  PlotTitleProps,
} from "./plot/publicTypes.js";

export { default as Minimap } from "./plot/minimap.svelte";
export type {
  PlotHandle,
  MinimapProps,
  MinimapSource,
} from "./plot/publicTypes.js";

export { zoomViewport } from "./plot/utils/viewport.js";
export type { Viewport2D } from "./plot/publicTypes.js";

export { default as Legend } from "./plot/legend.svelte";
export { default as Area } from "./plot/bound/area.svelte";
export type {
  LegendProps,
  MarkHandle,
  LegendPosition,
  LegendChannel,
  CameraState,
  AreaProps,
  ErrorBarsProps,
} from "./plot/publicTypes.js";

export { default as Data } from "./plot/data.svelte";
export { default as Provider } from "./plot/provider.svelte";
export { fetchJSON, fetchCSV, fetchArrow, fetchParquet } from "./plot/utils/providers.js";
export type {
  ProviderProps, ProviderHandle, ProviderContext, ProviderSource, ProviderSourceObject, ProviderLoad,
  ProviderValue, ProviderResult,
} from "./plot/publicTypes.js";
export { default as Interaction } from "./plot/interaction.svelte";
export { selection, identity, table } from "./plot/utils/interaction.js";
export { categorical, ordinal, literal } from "./plot/utils/categorical.js";
export { typedColumn } from "./plot/utils/columns.js";
export { gridTable } from "./plot/utils/gridTable.js";
export {
  col, view, add, subtract, multiply, divide, power, negative, abs, square, sqrt, log, exp,
  minimum, maximum, clip, equal, not_equal, less, less_equal, greater, greater_equal,
  logical_and, logical_or, logical_not, where, is_missing, is_finite, coalesce, is_in,
  mean, sum, count, min, max, extent, std, variance, median, quantile, mode, first, last, any, all, cumsum, lag, lead, window, lookup, bin, hexbin, sin, cos, tween,
  floor, round, interval, keyframes, offset, moved, random, row,
  year, quarter, month, week, day, weekday, day_of_year, hour, minute, second, month_name, day_name, time_floor,
  as_category, as_ordinal, as_numeric, as_datetime, as_duration,
} from "./plot/utils/expressions.js";
export { animate } from "./plot/utils/animation.js";
export type { ReductionOptions, OrderedExpressionOptions, OrderedReductionOptions,
  NeighborExpressionOptions, WindowExpressionOptions } from "./plot/publicTypes.js";
export { connect } from "./plot/utils/connections.js";
// A normalization shares one source domain between encodings (R2.0: the name Python uses too).
export { continuous, createNormalization as normalization } from "./plot/utils/scaleResources.js";
export { registerShape } from "./plot/utils/shapes.js";

export type {
  CategoricalScale,
  ScaleTransformName,
  CategoryValue,
  DictionaryColumn,
  DataTable,
  DataIdentity,
  SelectionResource,
  SelectionConstraint,
  OffsetLayer,
  MarkDragEvent,
  InteractionProps,
} from "./plot/publicTypes.js";

export { default as Filter } from "./plot/filter.svelte";
export { default as Sort } from "./plot/sort.svelte";
export { default as Shift } from "./plot/shift.svelte";
export { default as Group } from "./plot/group.svelte";
export { default as Stack } from "./plot/stack.svelte";
export { default as Rect } from "./plot/bound/rect.svelte";
export { default as Prism } from "./plot/bound/prism.svelte";
export { default as Facet } from "./plot/facet.svelte";
export { default as Partition } from "./plot/partition.svelte";
export { default as Dodge } from "./plot/dodge.svelte";
export type {
  NumericColumn,
  ReducerName,
  ReducerSpec,
  BinProps,
  HexbinProps,
  GroupProps,
  FacetProps,
  FacetHandle,
  PartitionProps,
  PartitionHandle,
  PartitionGroup,
  RectProps,
  PrismProps,
  ImageProps,
  PointsProps,
  Points3DProps,
  HeatmapProps,
  SurfaceProps,
  Text3DProps,
  DataProps,
  NodesProps,
  EdgesProps,
} from "./plot/publicTypes.js";

export type {
  FilterCondition,
  FilterProps,
  SortProps,
  NormalizeProps,
  StackProps,
  WindowProps,
  ShiftProps,
  DodgeProps,
} from "./plot/publicTypes.js";

export type { TransformHandle, TransformStatus, DataHandle, ReadOptions, HostColumns, HostRows, InputWrite, InputExpression, TableViewProps, TableViewColumn } from "./plot/publicTypes.js";

// Inputs (TODO 41): named values the viewer sets, read by name in expressions and options.
export { default as InputContext } from "./plot/inputs/inputContext.svelte";
export { default as TextInput } from "./plot/inputs/textInput.svelte";
export { default as ColorPicker } from "./plot/inputs/colorPicker.svelte";
export { default as DateTimeInput } from "./plot/inputs/dateTimeInput.svelte";
export { default as Slider } from "./plot/inputs/slider.svelte";
export { default as Checkbox } from "./plot/inputs/checkbox.svelte";
export { default as Button } from "./plot/inputs/button.svelte";
export { default as Select } from "./plot/inputs/select.svelte";
export { default as Playback } from "./plot/inputs/playback.svelte";
// Simulate (TODO 42): per-row state stepped at a fixed interval.
export { default as Simulate } from "./plot/simulate.svelte";
export { prev } from "./plot/utils/simulate.js";
export type { SimulateProps } from "./plot/publicTypes.js";
export { input, categories, columnNames } from "./plot/utils/inputs.js";
export type {
  InputProps,
  SliderProps,
  TextInputProps,
  ColorPickerProps,
  DateTimeInputProps,
  CheckboxProps,
  ButtonProps,
  SelectProps,
  PlaybackProps,
  InputContextProps,
} from "./plot/publicTypes.js";

export { default as Interpolate } from "./plot/interpolate.svelte";
export type { InterpolateProps } from "./plot/publicTypes.js";

export { default as Slice } from "./plot/slice.svelte";
export type { SliceProps } from "./plot/publicTypes.js";

export { default as Density } from "./plot/density.svelte";
export { default as Pivot } from "./plot/pivot.svelte";
export { default as Fold } from "./plot/fold.svelte";
export { default as Join } from "./plot/join.svelte";
export { default as Regression } from "./plot/regression.svelte";
export { default as Contour } from "./plot/contour.svelte";
export { default as Delaunay } from "./plot/delaunay.svelte";
export { default as Voronoi } from "./plot/voronoi.svelte";
export { default as Hull } from "./plot/hull.svelte";
export { default as Sample } from "./plot/sample.svelte";
export { default as Transform } from "./plot/pluginTransform.svelte";
export type { TransformProps } from "./plot/publicTypes.js";
export { default as Calculate } from "./plot/calculate.svelte";
export type { DensityProps, PivotProps, FoldProps, JoinProps, RegressionProps, RegressionFit, ContourProps, DelaunayProps, VoronoiProps, HullProps, SampleProps, SummaryProps, CalculateProps, Expression } from "./plot/publicTypes.js";

export { default as Force } from "./plot/force.svelte";
export { default as GraphData } from "./plot/graphData.svelte";
export { default as DAG } from "./plot/dag.svelte";
export { default as Pack } from "./plot/pack.svelte";
export { default as Treemap } from "./plot/treemap.svelte";
export { default as Sankey } from "./plot/sankey.svelte";
export { default as Flow } from "./plot/flow.svelte";
export { default as Routes } from "./plot/routes.svelte";
export { default as Nodes } from "./plot/nodes.svelte";
export { default as Edges } from "./plot/edges.svelte";
export type { ForceProps, GraphDataProps, DAGProps, PackProps, TreemapProps, SankeyProps, FlowProps, RoutesProps } from "./plot/publicTypes.js";

export { default as GeoJSON } from './plot/geojson.svelte';
export type { GeoJSONProps, GeoJSONHandle, GeoJSONFeatureEvent, GeoJSONInput } from './plot/publicTypes.js';
export { default as VectorTile } from './plot/vectorTile.svelte';
export type { VectorTileProps, VectorTileHandle, VectorTileCoordinate, VectorTilePart, VectorTileStyle } from './plot/publicTypes.js';

export { default as Polygon } from "./plot/bound/polygon.svelte";
export { default as Title } from "./plot/title.svelte";
export { default as Panels } from "./plot/panels.svelte";
export type { MarginalsProps, FocusContextProps, PanelsProps } from "./plot/publicTypes.js";
export type { ViolinProps, BoxPlotProps, SwarmProps, BarProps, LollipopProps, PieProps, RuleXProps, RuleYProps, CrosshairProps, CalloutProps, SmoothProps, EcdfProps, PolygonProps, DensityContourProps, DensityBandsProps, LabelBox, LabelLeader, TitleProps, MarkdownProps } from "./plot/publicTypes.js";

export { default as Mapping } from "./plot/mapping.svelte";

export { default as Text } from "./plot/bound/label.svelte";
export { default as Anchor } from "./plot/bound/anchor.svelte";
export type { AnchorProps, AnchorHandle, ConnectDescriptor, ConnectOptions, EndpointDescriptor, EndpointHandle, ConnectionProps, LineProps, SegmentsProps, Arrows3DProps, ArrowsProps } from "./plot/publicTypes.js";

export { default as Tree } from "./plot/tree.svelte";


export type {MappingProps,TextProps,TreeProps,CurveName} from "./plot/publicTypes.js";

export { default as Frame } from "./plot/frame.svelte";
export type { FrameProps, FrameHandle, FramePlacement } from "./plot/publicTypes.js";
