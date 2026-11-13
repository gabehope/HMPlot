# API generation and settings validation

The generator reads maintained declarations in one direction. Internal variables, imports and
function parameter names cannot add public properties.

| Maintained input | Authority |
|---|---|
| `src/lib/index.ts` | Component export names and module paths, discovered with the TypeScript AST |
| `src/lib/plot/publicTypes.ts` | Public prop types and structured option shapes |
| `src/lib/scene/options.json` | Component flags, settings, defaults, documentation and language applicability |
| `signature` in `src/lib/compound/*.js` | A built-in template's options-table entry and props, written to `options.templates.json` and `src/lib/compound/generated/types.ts` |
| `src/lib/plugins/*.manifest.js` | Bundled numerical plug-ins’ named wrappers, props and options; numerical schemas come from their registered definitions |
| `src/lib/charts/*.js` | A chart's options-table entry, props, component and reference page |
| Runtime leaf declarations | Enumerations such as shapes, colormaps and expression parameters |
| `scripts/python-api-header.pyi` | Handwritten Python helper declarations |

`node scripts/generate-python-signatures.mjs` generates `src/lib/scene/components.js`, both
registries, Python signatures and stubs, `python/hmplot/_types.py`, and
`src/routes/content/reference/types.json`; and, from the built-in templates' signatures and the
charts' definitions, `options.templates.json`, `options.charts.json` and their props types.
Bundled numerical plug-in manifests additionally generate their named Svelte wrappers,
`options.plugins.json` and `src/lib/plugins/generated/types.ts`. The manifests declare exact
component types, required props, documentation and any bindable or inspection methods; the
algorithm definitions supply validation and expression schemas. Changing an algorithm’s local
variable names cannot change its component API. The old `python3 scripts/generate-python-api.py`
command forwards to that same Node generator. Neither command reads maintained declarations
from generated output. `npm run check:python-signatures` checks every output, including the
component module. Regenerate the API report separately with `npm run api:report`.

After changing declarations, inspect the generated diff. A component's `properties` and
`runtimeOptions` are its accepted names; the global list is only their union. It is never a
fallback validator. `Template` and `Slot` have explicit empty property lists. JavaScript scene
validation and Python construction, updates and browser edits use those same declarations.
`LinkViews.plots` is an explicit wire field for positional references, separate from keyword props.

## Roles in the options table

What a component or option does in a scene is declared in `scene/options.json` (or a built-in
template's signature, or a chart's definition, which write the same entries), never inferred
from a Python annotation or a hand-kept list; the generator emits the registry fields that
Python, `SceneNode` and the scene runtime read (`scene/options.js` documents the format):

| Declaration | Registry field | Meaning |
|---|---|---|
| option `input: true` | component `stringReads` | A `"$name"` string in this option reads an input (a channel, a transform's column or choice). Elsewhere such a string is literal. `false` on a component's own entry refines a shared option set. |
| component `inputs: "all"` | `stringReads` (every value and setting but `name`) | Mapping reads inputs everywhere. |
| component `input: true` | top-level `inputs` | The component is an input (Slider, Select, ...). |
| component `inputContext: true` | top-level `inputContexts` | A scope its inputs are read in (Scene, InputContext, Template). |
| component `positional` | component `positional` | What Python's positional arguments set: `"value"` (Data's table, then children), `"plots"` (LinkViews) or `"text"` (Title, Markdown); the generator rejects any other value. |
| component `layout`, `mark`, `container`, `passthrough` | component flags, top-level `marks` | Scene behavior; Python's containment check reads `marks`, and the layout check reads `layout`. |

`stringReads` currently decides two things: where an input is read, and (in `SceneNode`) which
props stay expressions instead of folding to constants once their inputs are replaced. The
flags come from each component's declarations, including template signatures: RuleX and
RuleY channels and built-in chart x/y channels now declare input reads too. Inspect the
generated registry's `stringReads` for a particular component; a value being expression-shaped
does not by itself declare an input read. At the 2026-10-17 audit, Flow and Routes list none,
and `Shift.interval`, `Bin.interval` and `Bin.tz` are not listed. Whether these should read
inputs still needs their feature owner's contract checks. Changes belong in maintained
declarations and require regeneration, not a generator heuristic or an edit to the registry.

The pure `src/lib/scene/settings.js` adapter converts internal settings to a public patch before
validation: scale aliases, grouped axis objects and the composite `dash` prop. Numeric and
categorical color mappings remain mappings. Evaluated scalar appearance values do not replace
expressions, and settings derived from explicit scale resources do not overwrite those resources.
Edit an explicit resource through its existing API. Settings with no declared public representation
stay local to the browser. Python keywords stay snake_case; browser wire properties stay camelCase.

The settings providers have distinct axis representations: Plot emits flat aliases, while Frame
emits grouped public axis objects. A Plot's inherited Mapping coordinates are channel definitions,
including expressions, and must never be interpreted as grouped axes. Frame reports `visible`,
omits inherited/inferred domains, and converts an explicitly authored range back to its parent
coordinates through the existing frame mapping before replay.

The validation change does not alter protocol message shapes or version 1. It removes accidental
admissions at the scene/browser-edit boundary; nested configuration keys, resource members,
Svelte callbacks and result fields remain valid in their documented locations.

## Scene-validation removal record (historical names, sorted)

These 169 names record the scene-validation cleanup's removals from the global property index;
they are not a list of every later API removal. Their documented uses in nested objects,
resources, results or Svelte callbacks remain where described below. The owner table uses
current type and property names; the removal list preserves the original audit.

`_linesOnly`, `allowSharedDefaults`, `anchor`, `axisLabelZ`, `axisLineColor`, `axisMargin`, `axisTextColor`, `axisXGrid`, `axisYGrid`, `breaks`, `calendar`, `capacity`, `categories`, `categoryColor`, `categoryOutline`, `center`, `changes`, `children`, `clamp`, `codes`, `constant`, `content`, `context`, `dashSize`, `dashed`, `debounceTime`, `distanceMax`, `distanceMin`, `domain`, `domainSource`, `embedded`, `enabled`, `error`, `event`, `exportHTML`, `extends`, `extruded`, `extrusionAxis`, `facet`, `facetColorResolution`, `facetColumn`, `facetColumnOrder`, `facetGap`, `facetLink`, `facetRow`, `facetRowOrder`, `facetScales`, `facetShapeResolution`, `facetSizeResolution`, `facetWidthResolution`, `facetWrap`, `far`, `fetchBytes`, `fillColor`, `flat`, `fontFamily`, `fov`, `frame`, `frameX`, `frameY`, `from`, `gapSize`, `globeBackgroundVisible`, `guides`, `histogramBins`, `histogramNormalization`, `id`, `inputOwner`, `interactionOpacity`, `invert`, `iteration`, `keep`, `keys`, `kind`, `labelColor`, `labelOverlap`, `labeled`, `legendEnabled`, `legendPosition`, `lighting`, `lineWidth`, `load`, `major`, `majorInterval`, `marginLeft`, `markOutcomes`, `marks`, `maxBytes`, `maxEntries`, `maxRequests`, `maxSpeculative`, `maxWait`, `midpoint`, `missing`, `mounted`, `near`, `next`, `now`, `oncamerachange`, `onclick`, `ondrag`, `ondragend`, `onerror`, `onload`, `onplayingchange`, `onviewportchange`, `op`, `ownLegend`, `pad`, `palette`, `participates`, `pending`, `phase`, `plot`, `plotBrushRead`, `plotCancelBrushRead`, `plotControls`, `plotReportError`, `plotScene`, `previous`, `primitiveBudget`, `priority`, `range`, `rasterDpi`, `rasterLayers`, `referenceBands`, `referenceRules`, `requestKey`, `revision`, `routePoints`, `scalar`, `scaleColorColormap`, `scaleColorLevels`, `scaleColorQuantize`, `scaleRange`, `selected`, `selectedPosition`, `selection`, `shapes`, `showTrigger`, `signal`, `speculative`, `square`, `store`, `symbolCode`, `textCode`, `theta`, `threshold`, `tickLabelPlacement`, `titlePosition`, `to`, `toolbar`, `transform`, `turn`, `typography`, `uncertaintyAxis`, `unit`, `unknown`, `up`, `valueRange`, `vectorPrimitives`, `vectorTile`, `version`, `view`, `violin`, `warnings`, `window`, `zoomX`, `zoomY`.

## A. Internal setting/legacy aliases (10)

`axisLabelZ`, `axisXGrid`, `axisYGrid`, `dashSize`, `dashed`, `fillColor`, `gapSize`, `histogramBins`, `histogramNormalization`, `scaleRange`.

The adapter converts axisLabelZ to z.label; axisXGrid/axisYGrid to x.grid/y.grid; fillColor to an unambiguous literal fill or color only for literal encodings; dashed/dashSize/gapSize to dash. Histogram's public names are bins and normalization; its current template wrapper exposes subscribeSettings through TemplateHost. Internal histogramBins/histogramNormalization names do not become public keywords.

## B. Names retained in public nested objects/resources/results (77)

These are not standalone props accepted on arbitrary components. Owner names below identify where they remain valid; the public types define exact placement and whether a member is input or read-only output.

| Name | Existing owner(s) |
|---|---|
| `allowSharedDefaults` | `PlotSettings` |
| `anchor` | `FramePlacement` |
| `breaks` | `AxisDefinition` |
| `calendar` | `AxisDefinition` |
| `categories` | `DictionaryColumn`, `SelectionResource` |
| `center` | `PlotProps.viewport`, `VectorTileHandle`, `Viewport2D` |
| `changes` | `MarkDragEvent` |
| `codes` | `DictionaryColumn` |
| `constant` | `AxisDefinition`, `ContinuousScaleConfig`, `NormalizationResource` |
| `content` | `TooltipOptions` |
| `context` | `AxisDefinition` |
| `distanceMax` | `ForceSpec` |
| `distanceMin` | `ForceSpec` |
| `domain` | `AxisDefinition`, `CategoricalScale`, `ColumnSchema`, `ContinuousScale`, `ContinuousScaleConfig`, `NormalizationResource`, `OrdinalScale` |
| `domainSource` | `ContinuousScaleConfig`, `NormalizationResource` |
| `error` | `TransformStatus`, `VectorTileHandle` |
| `extends` | `ThemeDefinition` |
| `extruded` | `VectorTileHandle` |
| `far` | `CameraState`, fog effect parameters (`EffectSpec`) |
| `fontFamily` | `ThemeDefinition` |
| `fov` | `CameraState` |
| `frame` | `FacetHandle` |
| `from` | `AxisBreak`, `ReferenceBand` |
| `guides` | `ThemeDefinition` |
| `id` | `ContinuousScale`, `DataIdentity`, `LegendMarkSource`, `NormalizationResource`, `ProviderSourceObject`, `ThemeResource` |
| `invert` | `AxisDefinition` |
| `iteration` | `TransformStatus` |
| `keys` | `MarkDragEvent` |
| `kind` | `EndpointDescriptor`, `ExportReport`, `LegendMarkSource`, `LegendPlotSource`, `TransformStatus` |
| `labelOverlap` | `AxisDefinition` |
| `labeled` | `LegendMarkSource` |
| `lineWidth` | `AxisDefinition`, `ThemeDefinition` |
| `load` | `ProviderSourceObject` |
| `major` | `AxisDefinition` |
| `majorInterval` | `AxisDefinition` |
| `marginLeft` | `ThemeDefinition` |
| `markOutcomes` | `ExportReport` |
| `marks` | `ExportReport`, `PartitionGroup`, `ThemeDefinition` |
| `midpoint` | `ContinuousScaleConfig`, `NormalizationResource` |
| `missing` | `ContinuousScale`, `ContinuousScaleConfig`, `ThemeDefinition` |
| `mounted` | `TransformStatus` |
| `near` | `CameraState`, fog effect parameters (`EffectSpec`) |
| `op` | `Expression`, `FilterCondition`, `ReducerSpec` |
| `palette` | `ThemeDefinition` |
| `participates` | `LegendMarkSource` |
| `pending` | `TransformStatus`, `VectorTileHandle` |
| `phase` | `SelectionResource` |
| `plot` | `FacetHandle` |
| `previous` | `VectorTileHandle` |
| `primitiveBudget` | `DocumentExportOptions` |
| `range` | `AxisDefinition`, `CategoricalScale`, `ContinuousScale`, `ContinuousScaleConfig`, `OrdinalScale` |
| `rasterDpi` | `DocumentExportOptions` |
| `rasterLayers` | `ExportReport` |
| `requestKey` | `ProviderSourceObject` |
| `revision` | `OffsetLayer`, `ProviderContext`, `ProviderResult`, `SelectionResource`, `TransformStatus` |
| `scalar` | `LegendMarkSource` |
| `selected` | `VectorTileHandle` |
| `selection` | `MarkProps.brush`, `DataIdentity`, `MarkProps.nearby`, `NearestOptions`, `TransformStatus` |
| `shapes` | `ThemeDefinition` |
| `showTrigger` | `PlotSettings` |
| `signal` | `ProviderContext` |
| `theta` | `ForceSpec` |
| `tickLabelPlacement` | `AxisDefinition` |
| `titlePosition` | `AxisDefinition` |
| `to` | `AxisBreak`, `ReferenceBand` |
| `transform` | `AxisDefinition`, `ContinuousScaleConfig`, `NormalizationResource` |
| `typography` | `ThemeDefinition` |
| `unit` | `CalendarInterval`, `ColumnSchema` |
| `unknown` | `CategoricalScale`, `OrdinalScale` |
| `up` | `CameraState` |
| `vectorPrimitives` | `ExportReport` |
| `vectorTile` | `ThemeDefinition` |
| `version` | `ConnectDescriptor`, `FramePlacement`, `NormalizationResource`, `OffsetLayer`, `ProviderContext`, `ProviderResult`, `ProviderValue`, `ThemeResource` |
| `view` | `ProviderContext`, `ThemeDefinition` |
| `warnings` | `ExportReport` |
| `zoomX` | `PlotProps.viewport`, `Viewport2D` |
| `zoomY` | `PlotProps.viewport`, `Viewport2D` |

## C. Other accidental global admissions (82)

`_linesOnly`, `axisLineColor`, `axisMargin`, `axisTextColor`, `capacity`, `categoryColor`, `categoryOutline`, `children`, `clamp`, `debounceTime`, `embedded`, `enabled`, `event`, `exportHTML`, `extrusionAxis`, `facet`, `facetColorResolution`, `facetColumn`, `facetColumnOrder`, `facetGap`, `facetLink`, `facetRow`, `facetRowOrder`, `facetScales`, `facetShapeResolution`, `facetSizeResolution`, `facetWidthResolution`, `facetWrap`, `fetchBytes`, `flat`, `frameX`, `frameY`, `globeBackgroundVisible`, `inputOwner`, `interactionOpacity`, `keep`, `labelColor`, `legendEnabled`, `legendPosition`, `lighting`, `maxBytes`, `maxEntries`, `maxRequests`, `maxSpeculative`, `maxWait`, `next`, `now`, `oncamerachange`, `onclick`, `ondrag`, `ondragend`, `onerror`, `onload`, `onplayingchange`, `onviewportchange`, `ownLegend`, `pad`, `plotBrushRead`, `plotCancelBrushRead`, `plotControls`, `plotReportError`, `plotScene`, `priority`, `referenceBands`, `referenceRules`, `routePoints`, `scaleColorColormap`, `scaleColorLevels`, `scaleColorQuantize`, `selectedPosition`, `speculative`, `square`, `store`, `symbolCode`, `textCode`, `threshold`, `toolbar`, `turn`, `uncertaintyAxis`, `valueRange`, `violin`, `window`.

This group includes implementation state and settings aliases that had no declared scene prop, plus public Svelte-only callbacks/children. In particular, children remain Svelte snippets or the scene node's children array; onclick/onload/etc remain Svelte callbacks or Python on_event callbacks/events metadata, not arbitrary serialized node props. There is no compatibility allowlist.
