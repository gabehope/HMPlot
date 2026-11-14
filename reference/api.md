# HMPlot API on one page

Every component: its summary, its Python signature (`import hmplot as hm`; keywords are snake_case and all optional unless the reference says otherwise) and its Svelte props (camelCase). Generated from the Python package's registry and signatures; the reference pages (linked) have each option's description and default. Python containers take their children positionally or in a `with` block; Svelte components take them as child markup.

## Core: Plot and layout

### Plot

A chart: axes, a camera and the marks inside it, in 2D or 3D.

```python
hm.Plot(*children,
    animation_group: str | Sequence[str] = ...,
    description: str = ...,
    describe: bool = ...,
    tooltip: Any = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    loading: Literal["atomic", "progressive"] = ...,
    background: str = ...,
    data: Any = ...,
    schema: Any = ...,
    key: Any = ...,
    x: AxisDefinition = ...,
    y: AxisDefinition = ...,
    z: AxisDefinition = ...,
    scale_defaults: Any = ...,
    z_scale: float = ...,
    legend: bool | PlotLegendOptions = ...,
    coordinates: Literal["cartesian", "polar", "spherical"] = ...,
    polar_axis: Literal["X", "Y", "Z"] = ...,
    spherical_view: Literal["globe", "projected"] = ...,
    camera_mode: Literal["orbit", "flyover"] = ...,
    camera_position: Sequence[float] = ...,
    camera_target: Sequence[float] = ...,
    camera_up: Sequence[float] = ...,
    camera_fov: float = ...,
    camera_near: float = ...,
    camera_far: float = ...,
    fly_speed: float = ...,
    flyover_momentum: bool = ...,
    lights: Sequence[LightSpec] = ...,
    effects: Sequence[Any] = ...,
    globe_background: str | bool = ...,
    angle_unit: Literal["degrees", "radians", "extent", "custom"] = ...,
    angle_period: float = ...,
    base_radius: float = ...,
    radial_scale: float = ...,
    projection: Literal["equirectangular", "mercator", "equal-area", "orthographic", "equal-earth", "natural-earth", "albers", "albers-usa"] = ...,
    projection_center: Sequence[float] = ...,
    parallels: Sequence[float] = ...,
    subdivision_tolerance: float = ...,
    zoom_axis: Literal["xy", "x", "y"] = ...,
    dynamic_margins: bool = ...,
    axis_margin_zoom: bool = ...,
    overview_scale: float = ...,
    overview_max_instances: float = ...,
    axis_frame: bool = ...,
    axis_mask: bool = ...,
    axes3d: bool | Axes3DConfig = ...,
    aspect: Literal["auto", "equal"] = ...,
    overview_axes: bool | PlotOverviewAxesOptions = ...,
    rules: Sequence[ReferenceRule] = ...,
    bands: Sequence[dict[str, Any]] = ...,
    viewport: PlotViewportOptions = ...,
    interactive: bool | Literal["brush"] = ...,
    name: str = ...,
    width: float = ...,
    height: float = ...,
    responsive: bool = ...,
    type: Literal["2d", "3d", "3d-y-up"] = ...,
    settings: PlotSettings = ...,
    tone_mapping: float = ...,
    overview: bool = ...,
    axes2d: bool = ...,
    orientation3d: bool = ...,
    axis_tick_labels: bool = ...,
    axis_titles: bool = ...,
    antialias: Literal["off", "msaa", "ssaa8", "ssaa16", "smaa"] = ...,
    auto_bounds: bool = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    animate_bounds: bool = ...,
    bounds_duration: float = ...,
    bounds_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    title: str = ...,
    subtitle: str = ...,
    caption: str = ...,
    filename: str = ...,
    export_options: Any = ...,
    interpolation: Literal["cartesian", "great-circle", "angular"] = ...,
    axis_font_size: Any = ...,
    axis_font_family: Any = ...,
    axis_line_width: Any = ...,
    axis_tick_size: Any = ...,
    axis_margin_left: Any = ...,
    axis_margin_right: Any = ...,
    axis_margin_top: Any = ...,
    axis_margin_bottom: Any = ...,
)
```

Svelte: `<Plot anglePeriod angleUnit animateBounds animation animationDuration animationEasing animationGroup antialias aspect autoBounds axes2d axes3d axisFrame axisMarginZoom axisMask axisTickLabels axisTitles background bands baseRadius boundsDuration boundsEasing cameraFar cameraFov cameraMode cameraNear cameraPosition cameraTarget cameraUp caption coordinates data describe description dynamicMargins effects flySpeed flyoverMomentum globeBackground height interactive interpolation key legend lights loading name nearest orientation3d overview overviewAxes overviewMaxInstances overviewScale parallels polarAxis projection projectionCenter radialScale responsive rules scaleDefaults schema settings sphericalView subdivisionTolerance subtitle title toneMapping tooltip type viewport width x y z zScale zoomAxis>…</Plot>`

Settings (the settings pane's options, also accepted as props): `axisFontSize`, `axisFontFamily`, `axisLineWidth`, `axisTickSize`, `axisMarginLeft`, `axisMarginRight`, `axisMarginTop`, `axisMarginBottom`.

Reference: [Python](/HMPlot/reference/python/plot.md), [Svelte](/HMPlot/reference/svelte/plot.md).

### Html

Anchor ordinary HTML at a numeric 2D frame position; excluded from plot exports.

Svelte: `<Html dx dy x y>…</Html>`

Reference: [Svelte](/HMPlot/reference/svelte/html.md).

### TableView

The rows of the data around it as an HTML table, live: a Group's groups, a Sort's top rows, a Filter's kept rows; omitted from image exports.

```python
hm.TableView(*,
    columns: Sequence[str | Expression | TableViewColumn] = ...,
    limit: float = ...,
    title: str = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    name: str = ...,
)
```

Svelte: `<TableView columns hover limit name select title />`

Reference: [Python](/HMPlot/reference/python/table-view.md), [Svelte](/HMPlot/reference/svelte/table-view.md).

### Theme

Fonts, colors and mark styles for everything inside it.

```python
hm.Theme(*children,
    value: Any = ...,
)
```

Svelte: `<Theme value>…</Theme>`

Reference: [Python](/HMPlot/reference/python/theme.md), [Svelte](/HMPlot/reference/svelte/theme.md).

### Facet

Small multiples: one cell per category, per field, or per pair of fields (a scatterplot matrix).

```python
hm.Facet(*children,
    cache_size: float = ...,
    layout: Literal["bands", "grid"] = ...,
    band_padding: float = ...,
    data: Any = ...,
    key: Any = ...,
    name: str = ...,
    settings: PlotSettings = ...,
    row: str | Expression = ...,
    column: str | Expression = ...,
    wrap: float = ...,
    gap: float = ...,
    row_order: Sequence[str | float | bool] = ...,
    column_order: Sequence[str | float | bool] = ...,
    fields: Sequence[str | Expression] | FacetFieldsRow | FacetFieldsColumn = ...,
    pairs: Sequence[str] | FacetPairsOptions = ...,
    triangle: Literal["full", "upper", "lower"] = ...,
    diagonal: bool = ...,
    as_: FacetAsValue | FacetAsX = ...,
    scales: Literal["shared", "field", "free-x", "free-y", "free-z", "free"] = ...,
    resolve: Any = ...,
    link: Literal["auto", "none", "xy", "x", "y", "grid"] = ...,
    legend: bool | Literal["cell"] | FacetLegendOptions = ...,
    title: str = ...,
    subtitle: str = ...,
    caption: str = ...,
    filename: str = ...,
    export_options: Any = ...,
    schema: Any = ...,
)
```

Svelte: `<Facet as bandPadding cacheSize caption column columnOrder data diagonal fields gap key layout legend link name pairs resolve row rowOrder scales schema settings subtitle title triangle wrap>…</Facet>`

Reference: [Python](/HMPlot/reference/python/facet.md), [Svelte](/HMPlot/reference/svelte/facet.md).

### Partition

Repeats its children once per group of rows, all in the same frame: one line, fit or density per group.

```python
hm.Partition(*children,
    by: str | Sequence[str | Expression] | Expression = ...,
    limit: float = ...,
    legend_groups: bool = ...,
    name: str = ...,
)
```

Svelte: `<Partition by legendGroups limit name>…</Partition>`

Reference: [Python](/HMPlot/reference/python/partition.md), [Svelte](/HMPlot/reference/svelte/partition.md).

### Title

A heading or note beside plots, drawn as text that stays text in SVG and PDF exports.

```python
hm.Title(text, /, *,
    text: str | Sequence[str | Expression | TitleTextOptions] = ...,
    size: float | Literal["title", "subtitle", "caption"] = ...,
    weight: float | Literal["normal", "bold"] = ...,
    align: Literal["left", "right", "center"] = ...,
    color: str = ...,
    font: str = ...,
    wrap: bool = ...,
    name: str = ...,
)
```

Svelte: `<Title align color font name size text weight wrap />`

Reference: [Python](/HMPlot/reference/python/title.md), [Svelte](/HMPlot/reference/svelte/title.md).

### Panels

Stacks Plots over one shared x: one domain, panned and zoomed together, its axis drawn once under the stack.

```python
hm.Panels(*children,
    x: AxisDefinition = ...,
    gap: float = ...,
)
```

Svelte: `<Panels gap x>…</Panels>`

Reference: [Python](/HMPlot/reference/python/panels.md), [Svelte](/HMPlot/reference/svelte/panels.md).

### Mapping

Channels (x, y, fill, size, ...) that the marks inside it share.

```python
hm.Mapping(*children,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    visible: bool = ...,
    glow: float = ...,
    name: str = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    brush: bool | SelectionResource | BrushOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    series: str | Sequence[Any] | Sequence[str] | DictionaryColumn = ...,
    start: Channel = ...,
    end: Channel = ...,
    rotation: float = ...,
    shape: Any = ...,
    shape_scale: CategoryScale = ...,
    align: Any = ...,
    baseline: Any = ...,
    box: Any = ...,
    cap_size: Any = ...,
    control1: Any = ...,
    control2: Any = ...,
    curve: Any = ...,
    curve_alpha: Any = ...,
    depth: Any = ...,
    dx: Any = ...,
    dy: Any = ...,
    font: Any = ...,
    head_length: Any = ...,
    head_width: Any = ...,
    leader: Any = ...,
    lower: Any = ...,
    text: Any = ...,
    upper: Any = ...,
    x0: Any = ...,
    x1: Any = ...,
    y0: Any = ...,
    y1: Any = ...,
    z0: Any = ...,
    z1: Any = ...,
)
```

Svelte: `<Mapping animation animationDuration animationEasing brush color colorScale end enterEffect exitEffect fill fillScale glow hover name opacity outlineColor outlineOpacity outlineWidth position respond rotation select selectionOpacity series shape shapeScale size sizeScale start visible width widthScale x y z>…</Mapping>`

Settings (the settings pane's options, also accepted as props): `align`, `baseline`, `box`, `capSize`, `control1`, `control2`, `curve`, `curveAlpha`, `depth`, `dx`, `dy`, `font`, `headLength`, `headWidth`, `leader`, `lower`, `text`, `upper`, `x0`, `x1`, `y0`, `y1`, `z0`, `z1`.

Reference: [Python](/HMPlot/reference/python/mapping.md), [Svelte](/HMPlot/reference/svelte/mapping.md).

### Frame

A coordinate frame inside a Plot: its own scales for some marks (a second y axis), or a small chart placed within its parent.

```python
hm.Frame(*children,
    animation_group: str | Sequence[str] = ...,
    animate_bounds: bool = ...,
    bounds_duration: float = ...,
    bounds_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    axis_frame: bool = ...,
    axis_mask: bool = ...,
    placement: Literal["fit"] | FramePlacement = ...,
    rules: Sequence[ReferenceRule] = ...,
    bands: Sequence[dict[str, Any]] = ...,
    coordinates: Literal["cartesian", "polar", "spherical"] = ...,
    spherical_view: Literal["globe", "projected"] = ...,
    angle_unit: Literal["degrees", "radians", "extent", "custom"] = ...,
    angle_period: float = ...,
    base_radius: float = ...,
    radial_scale: float = ...,
    polar_axis: Literal["X", "Y", "Z"] = ...,
    projection: Literal["equirectangular", "mercator", "equal-area", "orthographic", "equal-earth", "natural-earth", "albers", "albers-usa"] = ...,
    projection_center: Sequence[float] = ...,
    parallels: Sequence[float] = ...,
    atmosphere: bool | FrameAtmosphereOptions = ...,
    x: AxisDefinition = ...,
    y: AxisDefinition = ...,
    z: AxisDefinition = ...,
    scale_defaults: Any = ...,
    name: str = ...,
    auto_bounds: bool = ...,
)
```

Svelte: `<Frame anglePeriod angleUnit animateBounds animationGroup atmosphere autoBounds axisFrame axisMask bands baseRadius boundsDuration boundsEasing coordinates name parallels placement polarAxis projection projectionCenter radialScale rules scaleDefaults sphericalView x y z>…</Frame>`

Reference: [Python](/HMPlot/reference/python/frame.md), [Svelte](/HMPlot/reference/svelte/frame.md).

### Markdown

Formatted text (emphasis, lists, tables, math) beside plots in a Python layout.

```python
hm.Markdown(text, /, *,
    text: str = ...,
    width: str | float = ...,
    font_size: float = ...,
    color: str = ...,
    font: str = ...,
    align: Literal["left", "right", "center"] = ...,
    name: str = ...,
)
```

Reference: [Python](/HMPlot/reference/python/markdown.md).

### Scene

The root of a Python display: it holds plots, layouts and inputs and stacks its children top to bottom.

```python
hm.Scene(*children)
```

Reference: [Python](/HMPlot/reference/python/scene.md).

### Row

Puts its children side by side.

```python
hm.Row(*children,
    gap: float = ...,
    min_width: float = ...,
    widths: Sequence[float] = ...,
    wrap: bool = ...,
)
```

Reference: [Python](/HMPlot/reference/python/row.md).

### Column

Stacks its children top to bottom.

```python
hm.Column(*children,
    gap: float = ...,
)
```

Reference: [Python](/HMPlot/reference/python/column.md).

### LayoutGrid (Python: Grid)

Lays its children out in rows of equal columns (Python hm.Grid).

```python
hm.Grid(*children,
    columns: float = ...,
    gap: float = ...,
)
```

Reference: [Python](/HMPlot/reference/python/grid.md).

### LinkViews

Makes 2D plots pan and zoom together, over one shared domain.

```python
hm.LinkViews(*plots,
    axes: Literal["x", "y", "xy"] = ...,
    scales: Literal["shared", "free"] = ...,
)
```

Reference: [Python](/HMPlot/reference/python/link-views.md).

### Template

A reusable pattern of components, built by a class or function, with a slot for the caller's children.

```python
hm.Template(*children)
```

Reference: [Python](/HMPlot/reference/python/template.md).

### Slot

Where a template's children go: hm.slot() marks the place in its build().

```python
hm.Slot(*children)
```

Reference: [Python](/HMPlot/reference/python/slot.md).

## Core: Marks

### Heatmap

A grid of values drawn as colors, one cell per value.

```python
hm.Heatmap(*children,
    data: Any = ...,
    pixelated: bool = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    fill: Channel = ...,
    opacity: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    detail: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    size_attenuation: Any = ...,
    z_scale: Any = ...,
    surface_mode: Any = ...,
    surface3d: Any = ...,
    depthtest: Any = ...,
    texture_resolution: Sequence[float] = ...,
)
```

Svelte: `<Heatmap animation animationDuration animationEasing blend colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend name opacity opacityScale options pixelated respond rows select selectionOpacity shade textureResolution tooltip visible x y z>…</Heatmap>`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `detail`, `lit`, `transparent`, `sizeAttenuation`, `zScale`, `surfaceMode`, `surface3d`, `depthtest`.

Reference: [Python](/HMPlot/reference/python/heatmap.md), [Svelte](/HMPlot/reference/svelte/heatmap.md).

### Points

A scatter plot's symbols, one per row.

```python
hm.Points(*,
    x_offset: Channel = ...,
    y_offset: Channel = ...,
    dx: Channel = ...,
    dy: Channel = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    brush: bool | SelectionResource | BrushOptions = ...,
    nearby: bool | SelectionResource | NearbyOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    drag: bool | Literal["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    rotation: float = ...,
    shape: Any = ...,
    shape_scale: CategoryScale = ...,
    size_units: Literal["px", "data"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    detail: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    depth_write: bool = ...,
    max_instances: float = ...,
)
```

Svelte: `<Points animation animationDuration animationEasing blend brush color colorScale colormap data depthWrite domains drag dx dy enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearby nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth position respond rotation rows select selectionOpacity shade shape shapeScale size sizeScale sizeUnits tooltip visible x xOffset y yOffset z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `detail`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/points.md), [Svelte](/HMPlot/reference/svelte/points.md).

### Segments

Line segments, one per row, each from its start to its end.

```python
hm.Segments(*,
    connections: Connect = ...,
    dash: float | bool | Sequence[float] = ...,
    curve: Literal["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
    control1: Channel = ...,
    control2: Channel = ...,
    cap: Literal["none", "bar", "arrow"] = ...,
    cap_size: float = ...,
    head_length: float = ...,
    head_width: float = ...,
    data: Any = ...,
    color: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    start: Channel = ...,
    end: Channel = ...,
    interpolation: Literal["cartesian", "great-circle", "angular"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte: `<Segments animation animationDuration animationEasing blend cap capSize color colorScale colormap connections control1 control2 curve dash data domains end enterEffect exitEffect glow headLength headWidth hover identity interpolation label legend maxInstances name nearest opacity opacityScale options respond rows select selectionOpacity shade start tooltip visible width widthScale />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/segments.md), [Svelte](/HMPlot/reference/svelte/segments.md).

### Line

A line through the rows in order: one path, or one per series.

```python
hm.Line(*,
    connections: Connect = ...,
    dash: float | bool | Sequence[float] = ...,
    curve: Literal["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
    curve_alpha: float = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    color: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    brush: bool | SelectionResource | BrushOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    series: str | Sequence[Any] | Sequence[str] | DictionaryColumn = ...,
    interpolation: Literal["cartesian", "great-circle", "angular"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    sampling: Literal["random", "uniform-x"] = ...,
    max_instances: float = ...,
)
```

Svelte: `<Line animation animationDuration animationEasing blend brush color colorScale colormap connections curve curveAlpha dash data domains enterEffect exitEffect glow hover identity interpolation label legend maxInstances name nearest opacity opacityScale options position respond rows sampling select selectionOpacity series shade tooltip visible width widthScale x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/line.md), [Svelte](/HMPlot/reference/svelte/line.md).

### Image

An image drawn from its pixels: grayscale, RGB or RGBA.

```python
hm.Image(*,
    data: Any = ...,
    pixelated: bool = ...,
    lit: bool = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    fill: Channel = ...,
    opacity: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
)
```

Svelte: `<Image animation animationDuration animationEasing blend colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend lit name opacity opacityScale options pixelated respond rows select selectionOpacity shade tooltip visible x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`.

Reference: [Python](/HMPlot/reference/python/image.md), [Svelte](/HMPlot/reference/svelte/image.md).

### Area

A filled area between two edges, with lower=0 by default.

```python
hm.Area(*,
    lower: Channel = ...,
    upper: Channel = ...,
    orientation: Literal["horizontal", "vertical"] = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    fill: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    brush: bool | SelectionResource | BrushOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    series: str | Sequence[Any] | Sequence[str] | DictionaryColumn = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte: `<Area animation animationDuration animationEasing blend brush colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend lower maxInstances name nearest opacity opacityScale options orientation outlineColor outlineColorScale outlineOpacity outlineWidth respond rows select selectionOpacity series shade tooltip upper visible width widthScale x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/area.md), [Svelte](/HMPlot/reference/svelte/area.md).

### Rect

Rectangles given by their edges, one per row: bars, bins, tiles.

```python
hm.Rect(*,
    x0: Channel = ...,
    x1: Channel = ...,
    y0: Channel = ...,
    y1: Channel = ...,
    z0: Channel = ...,
    z1: Channel = ...,
    data: Any = ...,
    fill: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    rotation: float = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte: `<Rect animation animationDuration animationEasing blend colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond rotation rows select selectionOpacity shade tooltip visible x0 x1 y0 y1 z0 z1 />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/rect.md), [Svelte](/HMPlot/reference/svelte/rect.md).

### Polygon

Filled polygons from their vertices in order, one per series.

```python
hm.Polygon(*,
    data: Any = ...,
    x: str = ...,
    y: str = ...,
    fill: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    series: str | Sequence[Any] | Sequence[str] | DictionaryColumn = ...,
)
```

Svelte: `<Polygon animation animationDuration animationEasing blend colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond select selectionOpacity series shade tooltip visible x y />`

Reference: [Python](/HMPlot/reference/python/polygon.md), [Svelte](/HMPlot/reference/svelte/polygon.md).

### Text

Text labels at data positions, one per row.

```python
hm.Text(*,
    x_offset: Channel = ...,
    y_offset: Channel = ...,
    text: str | float | Sequence[str | float] | DictionaryColumn = ...,
    align: Literal["auto", "left", "right", "center"] = ...,
    format: str = ...,
    dx: Channel = ...,
    dy: Channel = ...,
    font: str = ...,
    box: bool | LabelBox = ...,
    leader: bool | LabelLeader = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    brush: bool | SelectionResource | BrushOptions = ...,
    nearby: bool | SelectionResource | NearbyOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    drag: bool | Literal["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    max_instances: float = ...,
)
```

Svelte: `<Text align animation animationDuration animationEasing blend box brush color colorScale colormap data domains drag dx dy enterEffect exitEffect font format glow hover identity label leader legend maxInstances name nearby nearest opacity opacityScale options position respond rows select selectionOpacity shade size sizeScale text tooltip visible x xOffset y yOffset z />`

Reference: [Python](/HMPlot/reference/python/text.md), [Svelte](/HMPlot/reference/svelte/text.md).

### Anchor

An invisible position that connections from a Line, Segments or Arrows attach to.

```python
hm.Anchor(*,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    data: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
)
```

Svelte: `<Anchor animation animationDuration animationEasing data enterEffect exitEffect identity name position x y z />`

Settings (the settings pane's options, also accepted as props): `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`.

Reference: [Python](/HMPlot/reference/python/anchor.md), [Svelte](/HMPlot/reference/svelte/anchor.md).

## Core: 3D marks

### Points3D

Solid spheres or cubes in a 3D plot, one per row.

```python
hm.Points3D(*,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    brush: bool | SelectionResource | BrushOptions = ...,
    nearby: bool | SelectionResource | NearbyOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    drag: bool | Literal["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    shape: Any = ...,
    shape_scale: CategoryScale = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    detail: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    size_attenuation: Any = ...,
    depth_write: bool = ...,
    max_instances: float = ...,
)
```

Svelte: `<Points3D animation animationDuration animationEasing blend brush colormap data depthWrite domains drag enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearby nearest opacity opacityScale options position respond rows select selectionOpacity shade shape shapeScale size sizeScale tooltip visible x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `detail`, `lit`, `transparent`, `sizeAttenuation`.

Reference: [Python](/HMPlot/reference/python/points-3d.md), [Svelte](/HMPlot/reference/svelte/points-3d.md).

### Surface

A 3D surface over a grid of heights, or a triangle mesh.

```python
hm.Surface(*,
    height: Any = ...,
    indices: Any = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    opacity: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
)
```

Svelte: `<Surface animation animationDuration animationEasing blend color colorScale colormap data domains enterEffect exitEffect fill fillScale glow height hover identity indices label legend name opacity opacityScale options position respond rows select selectionOpacity shade tooltip visible x y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/surface.md), [Svelte](/HMPlot/reference/svelte/surface.md).

### Arrows3D

Solid arrows, a tube and a cone, from start to end points, one per row.

```python
hm.Arrows3D(*,
    connections: Connect = ...,
    curve: Literal["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
    control1: Channel = ...,
    control2: Channel = ...,
    data: Any = ...,
    color: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    start: Channel = ...,
    end: Channel = ...,
    interpolation: Literal["cartesian", "great-circle", "angular"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    lit: Any = ...,
    head_length: Any = ...,
    head_width: Any = ...,
    max_instances: float = ...,
)
```

Svelte: `<Arrows3D animation animationDuration animationEasing blend color colorScale colormap connections control1 control2 curve data domains end enterEffect exitEffect glow hover identity interpolation label legend maxInstances name nearest opacity opacityScale options respond rows select selectionOpacity shade start tooltip visible width widthScale />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`, `lit`, `headLength`, `headWidth`.

Reference: [Python](/HMPlot/reference/python/arrows-3d.md), [Svelte](/HMPlot/reference/svelte/arrows-3d.md).

### Text3D

One piece of text drawn as geometry in the plot, plain or TeX math.

```python
hm.Text3D(*,
    text: str | float | Sequence[str | float] | DictionaryColumn = ...,
    tex: bool = ...,
    data: Any = ...,
    position: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    font: Any = ...,
    align: Any = ...,
    billboard: Any = ...,
)
```

Svelte: `<Text3D animation animationDuration animationEasing blend color data domains glow label legend name opacity options position rows size sizeScale tex text visible />`

Settings (the settings pane's options, also accepted as props): `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `font`, `align`, `billboard`.

Reference: [Python](/HMPlot/reference/python/text-3d.md), [Svelte](/HMPlot/reference/svelte/text-3d.md).

### Prism

3D columns (boxes, triangular, hexagonal or round prisms), one per row, extruded along an axis.

```python
hm.Prism(*,
    x_offset: Channel = ...,
    y_offset: Channel = ...,
    x0: Channel = ...,
    x1: Channel = ...,
    y0: Channel = ...,
    y1: Channel = ...,
    z0: Channel = ...,
    z1: Channel = ...,
    depth: Channel = ...,
    axis: Literal["x", "y", "z"] = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    fill: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    rotation: Channel = ...,
    shape: Literal["circle", "triangle", "hexagon", "rectangle"] = ...,
    shape_scale: CategoryScale = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte: `<Prism animation animationDuration animationEasing axis blend colormap data depth domains enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest opacity opacityScale options respond rotation rows select selectionOpacity shade shape shapeScale tooltip visible width widthScale x x0 x1 xOffset y y0 y1 yOffset z z0 z1 />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/prism.md), [Svelte](/HMPlot/reference/svelte/prism.md).

## Core: Transforms

### Filter

Keeps the rows that meet a condition, or the selected or brushed rows.

```python
hm.Filter(*children,
    name: str = ...,
    inactive: Literal["none", "all"] = ...,
    where: str | Sequence[str | Expression | FilterCondition] | Expression | SelectionResource | FilterCondition = ...,
)
```

Svelte: `<Filter inactive name where>…</Filter>`

Reference: [Python](/HMPlot/reference/python/filter.md), [Svelte](/HMPlot/reference/svelte/filter.md).

### Sort

Orders the rows by one or more columns, so a line connects them in that order.

```python
hm.Sort(*children,
    name: str = ...,
    by: str | Sequence[str | Expression] | Expression = ...,
    order: Literal["asc", "desc"] = ...,
)
```

Svelte: `<Sort by name order>…</Sort>`

Reference: [Python](/HMPlot/reference/python/sort.md), [Svelte](/HMPlot/reference/svelte/sort.md).

### Shift

Shift a numeric or datetime coordinate by a numeric or UTC calendar interval.

```python
hm.Shift(*children,
    name: str = ...,
    field: str | Expression = ...,
    interval: str | float = ...,
    as_: ShiftAsOptions = ...,
)
```

Svelte: `<Shift as field interval name>…</Shift>`

Reference: [Python](/HMPlot/reference/python/shift.md), [Svelte](/HMPlot/reference/svelte/shift.md).

### Group

One row per value (or combination of values) of the `by` columns, with the group's count, sums, means or other reductions.

```python
hm.Group(*children,
    name: str = ...,
    by: str | Sequence[str | Expression] | Expression = ...,
    columns: dict[str, Expression] = ...,
    as_: dict[str, str] = ...,
)
```

Svelte: `<Group as by columns name>…</Group>`

Reference: [Python](/HMPlot/reference/python/group.md), [Svelte](/HMPlot/reference/svelte/group.md).

### Stack

Stacks values on one another, for stacked bars and areas, 100% stacks and streamgraphs.

```python
hm.Stack(*children,
    name: str = ...,
    x: str = ...,
    y: str | Sequence[float | bool] | np.ndarray = ...,
    series: str | Expression = ...,
    order: Literal["none", "asc", "desc", "appearance", "insideOut", "reverse"] | Sequence[str | float | bool] = ...,
    offset: Literal["zero", "expand", "center", "wiggle"] = ...,
    as_: dict[str, str] = ...,
)
```

Svelte: `<Stack as name offset order series x y>…</Stack>`

Reference: [Python](/HMPlot/reference/python/stack.md), [Svelte](/HMPlot/reference/svelte/stack.md).

### Dodge

Moves overlapping points apart, for a beeswarm, or lays out one unit per row in a grid, for a unit (waffle) chart.

```python
hm.Dodge(*children,
    mode: Literal["grid", "collision"] = ...,
    columns: float | Expression = ...,
    count: str = ...,
    name: str = ...,
    x: str = ...,
    y: str = ...,
    axis: Literal["auto", "x", "y"] = ...,
    as_: str = ...,
    padding: float = ...,
    seed: float = ...,
)
```

Svelte: `<Dodge as axis columns count mode name padding seed x y>…</Dodge>`

Reference: [Python](/HMPlot/reference/python/dodge.md), [Svelte](/HMPlot/reference/svelte/dodge.md).

### Interpolate

Fills a regular grid from scattered samples, for a heatmap, contours or a smooth line.

```python
hm.Interpolate(*children,
    name: str = ...,
    x: str = ...,
    y: str = ...,
    values: Sequence[str] = ...,
    resolution: float | Sequence[float] | Expression = ...,
    method: Literal["nearest", "auto", "linear", "bilinear", "idw"] = ...,
    bounds: InterpolateBoundsOptions = ...,
)
```

Svelte: `<Interpolate bounds method name resolution values x y>…</Interpolate>`

Reference: [Python](/HMPlot/reference/python/interpolate.md), [Svelte](/HMPlot/reference/svelte/interpolate.md).

### Slice

Each entity's values at one time (or other coordinate), interpolated between its observations, or one slice of a grid table.

```python
hm.Slice(*children,
    name: str = ...,
    field: str | Expression = ...,
    at: float = ...,
    by: str | Sequence[str | Expression] | Expression = ...,
    values: Sequence[str] = ...,
)
```

Svelte: `<Slice at by field name values>…</Slice>`

Reference: [Python](/HMPlot/reference/python/slice.md), [Svelte](/HMPlot/reference/svelte/slice.md).

### Density

A kernel density estimate of one column (a smooth histogram), or of two on a grid (a density heatmap).

```python
hm.Density(*children,
    name: str = ...,
    x: str | Sequence[float | bool] | np.ndarray = ...,
    y: str | Sequence[float | bool] | np.ndarray = ...,
    by: str | Sequence[str | Expression] | Expression = ...,
    weight: str | Sequence[float | bool] | Expression | np.ndarray = ...,
    resolution: float | Sequence[float] | Expression = ...,
    bandwidth: float | Literal["auto"] | Sequence[float] | Expression = ...,
    bounds: DensityBoundsOptions = ...,
    normalization: Literal["density", "count"] = ...,
    as_: DensityAsOptions = ...,
)
```

Svelte: `<Density as bandwidth bounds by name normalization resolution weight x y>…</Density>`

Reference: [Python](/HMPlot/reference/python/density.md), [Svelte](/HMPlot/reference/svelte/density.md).

### Pivot

A long table made wide: a row per group and a column per category of a field.

```python
hm.Pivot(*children,
    name: str = ...,
    field: str = ...,
    value: Expression = ...,
    by: str | Sequence[str] = ...,
    as_: Sequence[str] = ...,
)
```

Svelte: `<Pivot as by field name value>…</Pivot>`

Reference: [Python](/HMPlot/reference/python/pivot.md), [Svelte](/HMPlot/reference/svelte/pivot.md).

### Fold

A wide table made long: each row repeated once per chosen column, with that column's name and value.

```python
hm.Fold(*children,
    name: str = ...,
    fields: Sequence[str] = ...,
    as_: FoldAsOptions = ...,
)
```

Svelte: `<Fold as fields name>…</Fold>`

Reference: [Python](/HMPlot/reference/python/fold.md), [Svelte](/HMPlot/reference/svelte/fold.md).

### Join

Columns from a second table added to each row, matched by a key.

```python
hm.Join(*children,
    name: str = ...,
    data: Any = ...,
    on: str | Sequence[str | Expression] | Expression = ...,
    left_on: str | Sequence[str | Expression] | Expression = ...,
    right_on: str | Sequence[str | Expression] | Expression = ...,
    how: Literal["left", "inner"] = ...,
    fields: Sequence[str | Expression] = ...,
    as_: dict[str, str] = ...,
)
```

Svelte: `<Join as data fields how leftOn name on rightOn>…</Join>`

Reference: [Python](/HMPlot/reference/python/join.md), [Svelte](/HMPlot/reference/svelte/join.md).

### Regression

A least-squares fit of y on x, sampled across x, with its confidence band.

```python
hm.Regression(*children,
    name: str = ...,
    x: str | Sequence[float | bool] | np.ndarray = ...,
    y: str | Sequence[float | bool] | np.ndarray = ...,
    method: Literal["linear", "log", "poly", "exp", "pow"] = ...,
    order: float = ...,
    samples: float = ...,
    extent: Sequence[float] = ...,
    band: float | bool = ...,
    as_: RegressionAsOptions = ...,
)
```

Svelte: `<Regression as band extent method name order samples x y>…</Regression>`

Reference: [Python](/HMPlot/reference/python/regression.md), [Svelte](/HMPlot/reference/svelte/regression.md).

### Contour

Contour lines or filled bands of a grid, such as a 2-D density.

```python
hm.Contour(*children,
    name: str = ...,
    field: str = ...,
    thresholds: float | Sequence[float] = ...,
    mode: Literal["bands", "lines"] = ...,
    x: str = ...,
    y: str = ...,
)
```

Svelte: `<Contour field mode name thresholds x y>…</Contour>`

Reference: [Python](/HMPlot/reference/python/contour.md), [Svelte](/HMPlot/reference/svelte/contour.md).

### Delaunay

The Delaunay triangulation of points, as edges for Segments.

```python
hm.Delaunay(*children,
    name: str = ...,
    x: str = ...,
    y: str = ...,
)
```

Svelte: `<Delaunay name x y>…</Delaunay>`

Reference: [Python](/HMPlot/reference/python/delaunay.md), [Svelte](/HMPlot/reference/svelte/delaunay.md).

### Voronoi

Each point's Voronoi cell, as triangles for Polygon.

```python
hm.Voronoi(*children,
    name: str = ...,
    x: str = ...,
    y: str = ...,
    extent: Sequence[Sequence[float]] = ...,
)
```

Svelte: `<Voronoi extent name x y>…</Voronoi>`

Reference: [Python](/HMPlot/reference/python/voronoi.md), [Svelte](/HMPlot/reference/svelte/voronoi.md).

### Hull

The convex hull around points, one per group, as triangles for Polygon.

```python
hm.Hull(*children,
    name: str = ...,
    x: str = ...,
    y: str = ...,
    by: str | Sequence[str] = ...,
)
```

Svelte: `<Hull by name x y>…</Hull>`

Reference: [Python](/HMPlot/reference/python/hull.md), [Svelte](/HMPlot/reference/svelte/hull.md).

### Sample

Keeps a random subset of the rows, a number or a fraction of them, in their original order or shuffled.

```python
hm.Sample(*children,
    name: str = ...,
    size: float | Expression = ...,
    proportion: float | Expression = ...,
    seed: float = ...,
    order: Literal["data", "random"] = ...,
)
```

Svelte: `<Sample name order proportion seed size>…</Sample>`

Reference: [Python](/HMPlot/reference/python/sample.md), [Svelte](/HMPlot/reference/svelte/sample.md).

### Transform

Run a registered transform or graph layout with its declared parameters.

```python
hm.Transform(*children,
    kind: str = ...,
    params: dict[str, Any] = ...,
    name: str = ...,
    by: str | Sequence[str | Expression] | Expression = ...,
    as_: dict[str, str] = ...,
)
```

Svelte: `<Transform as by kind name params>…</Transform>`

Reference: [Python](/HMPlot/reference/python/transform.md), [Svelte](/HMPlot/reference/svelte/transform.md).

### Calculate

New columns computed from expressions over the table's columns.

```python
hm.Calculate(*children,
    columns: dict[str, Expression] = ...,
    name: str = ...,
)
```

Svelte: `<Calculate columns name>…</Calculate>`

Reference: [Python](/HMPlot/reference/python/calculate.md), [Svelte](/HMPlot/reference/svelte/calculate.md).

## Core: Scales and legends

### Legend

A key to a plot's marks, or to the colors, shapes or sizes one channel encodes.

```python
hm.Legend(*,
    target: Any = ...,
    channel: Literal["color", "size", "width", "shape", "fill", "opacity", "outlineColor"] = ...,
    label: str = ...,
    position: Literal["left", "right", "top", "bottom"] = ...,
)
```

Svelte: `<Legend channel for label position />`

Reference: [Python](/HMPlot/reference/python/legend.md), [Svelte](/HMPlot/reference/svelte/legend.md).

## Core: Interaction

### Minimap

A small overview of a plot's whole extent, with a rectangle to drag its view around (a 3D plot gets an orientation gadget).

```python
hm.Minimap(*,
    axis: Any = ...,
    axes: bool | MinimapAxesOptions = ...,
    display_scale: float = ...,
    target: Any = ...,
    width: float = ...,
    height: float = ...,
    max_instances: float = ...,
)
```

Svelte: `<Minimap axes axis displayScale for height maxInstances width />`

Reference: [Python](/HMPlot/reference/python/minimap.md), [Svelte](/HMPlot/reference/svelte/minimap.md).

### Interaction

Names selections as columns ("@focus") that the filters and channels inside it read.

```python
hm.Interaction(*children,
    columns: dict[str, SelectionResource] = ...,
)
```

Svelte: `<Interaction columns>…</Interaction>`

Reference: [Python](/HMPlot/reference/python/interaction.md), [Svelte](/HMPlot/reference/svelte/interaction.md).

## Core: Inputs

### InputContext

A scope for inputs: everything inside it reads the inputs inside it by name (a Python Scene is one already).

```python
hm.InputContext(*children)
```

Svelte: `<InputContext>…</InputContext>`

Reference: [Python](/HMPlot/reference/python/input-context.md), [Svelte](/HMPlot/reference/svelte/input-context.md).

### TextInput

Text edited by the viewer, updated on each keystroke.

```python
hm.TextInput(*,
    value: str = ...,
    placeholder: str = ...,
    name: str = ...,
    label: str = ...,
)
```

Svelte: `<TextInput label name placeholder value />`

Reference: [Python](/HMPlot/reference/python/text-input.md), [Svelte](/HMPlot/reference/svelte/text-input.md).

### ColorPicker

An opaque RGB color selected with the browser color picker.

```python
hm.ColorPicker(*,
    value: str = ...,
    name: str = ...,
    label: str = ...,
)
```

Svelte: `<ColorPicker label name value />`

Reference: [Python](/HMPlot/reference/python/color-picker.md), [Svelte](/HMPlot/reference/svelte/color-picker.md).

### DateTimeInput

A date and time edited in a chosen time zone, held as a Date or null.

```python
hm.DateTimeInput(*,
    value: datetime.date = ...,
    min: datetime.date = ...,
    max: datetime.date = ...,
    step: float = ...,
    timezone: str = ...,
    name: str = ...,
    label: str = ...,
)
```

Svelte: `<DateTimeInput label max min name step timezone value />`

Reference: [Python](/HMPlot/reference/python/date-time-input.md), [Svelte](/HMPlot/reference/svelte/date-time-input.md).

### Slider

A number, date or two-endpoint interval the viewer drags between min and max, read by name.

```python
hm.Slider(*,
    min: float | Expression | datetime.date = ...,
    max: float | Expression | datetime.date = ...,
    step: str | float | CalendarInterval = ...,
    value: float | Sequence[float] | Sequence[datetime.date] | Expression | datetime.date = ...,
    format: str = ...,
    timezone: str = ...,
    name: str = ...,
    label: str = ...,
)
```

Svelte: `<Slider format label max min name step timezone value />`

Reference: [Python](/HMPlot/reference/python/slider.md), [Svelte](/HMPlot/reference/svelte/slider.md).

### Checkbox

True or false, set by the viewer and read by name.

```python
hm.Checkbox(*,
    value: bool = ...,
    name: str = ...,
    label: str = ...,
)
```

Svelte: `<Checkbox label name value />`

Reference: [Python](/HMPlot/reference/python/checkbox.md), [Svelte](/HMPlot/reference/svelte/checkbox.md).

### Button

Counts the viewer's presses, so a prop that acts on each change of its value (reset=, refresh=) acts on each press; with set, a press writes other inputs (back to the top of a drill-down).

```python
hm.Button(*,
    value: float = ...,
    name: str = ...,
    label: str = ...,
    set: Sequence[InputWrite] | InputWrite = ...,
)
```

Svelte: `<Button label name set value />`

Reference: [Python](/HMPlot/reference/python/button.md), [Svelte](/HMPlot/reference/svelte/button.md).

### Select

One or several options, chosen by the viewer and read by name; a Select of column names picks what a channel plots.

```python
hm.Select(*,
    options: Sequence[str | float | bool | datetime.date] | Expression | dict[str, str | float | bool | datetime.date] = ...,
    multiple: bool = ...,
    value: str | float | bool | Sequence[str | float | bool | datetime.date] | datetime.date = ...,
    name: str = ...,
    label: str = ...,
)
```

Svelte: `<Select label multiple name options value />`

Reference: [Python](/HMPlot/reference/python/select.md), [Svelte](/HMPlot/reference/svelte/select.md).

### Playback

A slider with play, pause and reset buttons that moves its value over time, read by name.

```python
hm.Playback(*,
    rate: str | float | CalendarInterval = ...,
    loop: bool = ...,
    autoplay: bool = ...,
    playing: bool = ...,
    reset: str | float = ...,
    min: float | Expression | datetime.date = ...,
    max: float | Expression | datetime.date = ...,
    step: str | float | CalendarInterval = ...,
    value: float | Expression | datetime.date = ...,
    format: str = ...,
    timezone: str = ...,
    name: str = ...,
    label: str = ...,
)
```

Svelte: `<Playback autoplay format label loop max min name playing rate reset step timezone value />`

Reference: [Python](/HMPlot/reference/python/playback.md), [Svelte](/HMPlot/reference/svelte/playback.md).

### Simulate

Per-row state, such as positions and velocities, stepped at a fixed interval for the marks inside it to draw.

```python
hm.Simulate(*children,
    name: str = ...,
    initial: dict[str, str | float | Expression] = ...,
    update: dict[str, str | float | Expression] = ...,
    step: float = ...,
    max_steps: float = ...,
    stop: SimulateStopOptions = ...,
    running: bool = ...,
    reset: str | float = ...,
)
```

Svelte: `<Simulate initial maxSteps name reset running step stop update>…</Simulate>`

Reference: [Python](/HMPlot/reference/python/simulate.md), [Svelte](/HMPlot/reference/svelte/simulate.md).

## Core: Data sources

### Data

A table whose columns the components inside it read by name.

```python
hm.Data(*children,
    animation_group: str | Sequence[str] = ...,
    value: Any = ...,
    rows: float = ...,
    key: Any = ...,
    schema: Any = ...,
)
```

Svelte: `<Data animationGroup key rows schema value>…</Data>`

Reference: [Python](/HMPlot/reference/python/data.md), [Svelte](/HMPlot/reference/svelte/data.md).

### Provider

A table loaded asynchronously, from a URL or a load function, for the components inside it.

```python
hm.Provider(*children,
    url: str = ...,
    format: Literal["arrow", "json", "csv", "parquet"] = ...,
    path: str = ...,
    columns: Sequence[str] = ...,
    params: dict[str, Any] = ...,
    key: str | Sequence[str] = ...,
    schema: dict[str, Any] = ...,
    initial: Sequence[dict[str, Any]] | dict[str, Any] = ...,
    debounce: float = ...,
    refresh_interval: float = ...,
    accumulate: bool | ProviderAccumulateOptions = ...,
    refresh: str | float = ...,
    snapshot: bool = ...,
    name: str = ...,
)
```

Svelte: `<Provider accumulate columns debounce format initial key name params path refresh refreshInterval schema snapshot url>…</Provider>`

Reference: [Python](/HMPlot/reference/python/provider.md), [Svelte](/HMPlot/reference/svelte/provider.md).

## Core: Maps and tiles

### GeoJSON

Maps of GeoJSON regions, lines and points, colored by their properties (choropleths) and optionally extruded.

```python
hm.GeoJSON(*,
    data: Any = ...,
    geometry: str = ...,
    feature_key: str = ...,
    data_key: str = ...,
    height: Channel = ...,
    height_scale: ContinuousScale = ...,
    plane: Literal["xy", "xz"] = ...,
    fit: bool = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    missing_color: Any = ...,
)
```

Svelte: `<GeoJSON animation animationDuration animationEasing blend color colorScale colormap data dataKey featureKey fill fillScale fit geometry glow height heightScale hover label legend name opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth plane respond selectionOpacity shade size sizeScale tooltip visible width widthScale />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `lit`, `transparent`, `missingColor`.

Reference: [Python](/HMPlot/reference/python/geojson.md), [Svelte](/HMPlot/reference/svelte/geojson.md).

### VectorTile

A basemap of land, water, roads, buildings and place names from vector map tiles.

```python
hm.VectorTile(*,
    url: str = ...,
    tile: Sequence[float] = ...,
    tiles: Sequence[Sequence[float]] = ...,
    bounds: Sequence[float] = ...,
    zoom: float = ...,
    data: Any = ...,
    styles: Any = ...,
    scheme: Any = ...,
    source_layers: dict[str, bool | Literal["land", "green", "water", "waterways", "buildings", "other", "paths", "roads", "majorRoads", "railways", "boundaries", "places"]] = ...,
    clip: bool = ...,
    fit: bool = ...,
    origin: Sequence[float] = ...,
    units_per_meter: float = ...,
    plane: Literal["xy", "xz"] = ...,
    snapshot: bool = ...,
    live: bool = ...,
    min_zoom: float = ...,
    max_zoom: float = ...,
    zoom_bias: float = ...,
    attribution: str | bool = ...,
    tile_data: Sequence[VectorTileTileDataOptions] = ...,
    extrude_buildings: bool = ...,
    name: str = ...,
    visible: bool = ...,
    opacity: float = ...,
)
```

Svelte: `<VectorTile attribution bounds clip data extrudeBuildings fit live maxZoom minZoom name opacity origin plane scheme snapshot sourceLayers styles tile tileData tiles unitsPerMeter url visible zoom zoomBias />`

Reference: [Python](/HMPlot/reference/python/vector-tile.md), [Svelte](/HMPlot/reference/svelte/vector-tile.md).

## Core: Graphs

### Force

A force-directed layout of a graph's nodes and edges, simulated live.

```python
hm.Force(*children,
    name: str = ...,
    weight: str | Expression = ...,
    dimensions: float = ...,
    seed: float = ...,
    repulsion: float = ...,
    link_distance: float = ...,
    spring_strength: float = ...,
    centering: float = ...,
    velocity_decay: float = ...,
    alpha: float = ...,
    alpha_min: float = ...,
    alpha_decay: float = ...,
    alpha_target: float = ...,
    forces: dict[str, ForceSpec] = ...,
    fixed: Any = ...,
    initial: Any = ...,
    ticks: float = ...,
    warmup: float = ...,
    running: bool = ...,
    reset: str | float = ...,
    reheat: str | float = ...,
    step: str | float = ...,
    release: str | float = ...,
)
```

Svelte: `<Force alpha alphaDecay alphaMin alphaTarget centering dimensions fixed forces initial linkDistance name reheat release repulsion reset running seed springStrength step ticks velocityDecay warmup weight>…</Force>`

Reference: [Python](/HMPlot/reference/python/force.md), [Svelte](/HMPlot/reference/svelte/force.md).

### GraphData

A graph from edges, with nodes given or inferred from the edges' endpoints; ordinary transforms operate on the selected table.

```python
hm.GraphData(*children,
    nodes: Sequence[dict[str, Any]] | dict[str, Any] = ...,
    edges: Sequence[dict[str, Any]] | dict[str, Any] = ...,
    node_key: str = ...,
    source: str = ...,
    target: str = ...,
    node_from: Literal["source", "target"] = ...,
    reduce: dict[str, ReducerSpec] = ...,
)
```

Svelte: `<GraphData edges nodeFrom nodeKey nodes reduce source target>…</GraphData>`

Reference: [Python](/HMPlot/reference/python/graph-data.md), [Svelte](/HMPlot/reference/svelte/graph-data.md).

### DAG

A layered layout of a directed acyclic graph, with edges routed around the nodes.

```python
hm.DAG(*children,
    orientation: Literal["left", "right", "down", "up"] = ...,
    node_width: Any = ...,
    node_height: Any = ...,
    node_gap: float = ...,
    layer_gap: float = ...,
)
```

Svelte: `<DAG layerGap nodeGap nodeHeight nodeWidth orientation>…</DAG>`

Reference: [Python](/HMPlot/reference/python/dag.md), [Svelte](/HMPlot/reference/svelte/dag.md).

### Pack

A hierarchy drawn as nested circles, each leaf's area set by its value.

```python
hm.Pack(*children,
    root: str | float | bool | Expression = ...,
    levels: float = ...,
    value: Any = ...,
    width: float = ...,
    height: float = ...,
    padding: float = ...,
)
```

Svelte: `<Pack height levels padding root value width>…</Pack>`

Reference: [Python](/HMPlot/reference/python/pack.md), [Svelte](/HMPlot/reference/svelte/pack.md).

### Treemap

A hierarchy drawn as nested rectangles, each leaf's area set by its value.

```python
hm.Treemap(*children,
    padding_inner: float = ...,
    padding_outer: float = ...,
    tile: Literal["squarify", "resquarify", "binary", "slice", "dice", "sliceDice"] = ...,
    root: str | float | bool | Expression = ...,
    levels: float = ...,
    value: Any = ...,
    width: float = ...,
    height: float = ...,
    padding: float = ...,
)
```

Svelte: `<Treemap height levels padding paddingInner paddingOuter root tile value width>…</Treemap>`

Reference: [Python](/HMPlot/reference/python/treemap.md), [Svelte](/HMPlot/reference/svelte/treemap.md).

### Sankey

A flow diagram layout, with nodes in columns and links as thick as their values.

```python
hm.Sankey(*children,
    value: str | Expression = ...,
    orientation: Literal["left", "right", "down", "up"] = ...,
    node_width: float = ...,
    node_padding: float = ...,
    iterations: float = ...,
    align: Literal["left", "right", "center", "justify"] = ...,
)
```

Svelte: `<Sankey align iterations nodePadding nodeWidth orientation value>…</Sankey>`

Reference: [Python](/HMPlot/reference/python/sankey.md), [Svelte](/HMPlot/reference/svelte/sankey.md).

### Flow

A Sankey's links drawn as bands, one per edge.

```python
hm.Flow(*,
    start_lower: Channel = ...,
    end_lower: Channel = ...,
    start_upper: Channel = ...,
    end_upper: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    interpolation: Literal["cartesian", "great-circle", "angular"] = ...,
    rotation: float = ...,
    shape: Any = ...,
    shape_scale: CategoryScale = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte: `<Flow animation animationDuration animationEasing blend color colorScale colormap domains endLower endUpper enterEffect exitEffect fill fillScale glow hover identity interpolation label legend maxInstances name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond rotation rows select selectionOpacity shade shape shapeScale size sizeScale startLower startUpper tooltip visible width widthScale />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/flow.md), [Svelte](/HMPlot/reference/svelte/flow.md).

### Routes

A DAG's edges drawn along their routed paths, bends included.

```python
hm.Routes(*,
    dash: float | bool | Sequence[float] = ...,
    curve: Literal["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
    color: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    interpolation: Literal["cartesian", "great-circle", "angular"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte: `<Routes animation animationDuration animationEasing blend color colorScale colormap curve dash domains enterEffect exitEffect glow hover identity interpolation label legend maxInstances name nearest opacity opacityScale options respond rows select selectionOpacity shade tooltip visible width widthScale />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/routes.md), [Svelte](/HMPlot/reference/svelte/routes.md).

### Nodes

A graph's nodes, one row each, for the marks inside to draw.

```python
hm.Nodes(*children,
    drag: bool = ...,
)
```

Svelte: `<Nodes drag>…</Nodes>`

Reference: [Python](/HMPlot/reference/python/nodes.md), [Svelte](/HMPlot/reference/svelte/nodes.md).

### Edges

A graph layout's edges, one row each with start and end positions, for the marks inside to draw.

```python
hm.Edges(*children)
```

Svelte: `<Edges>…</Edges>`

Reference: [Python](/HMPlot/reference/python/edges.md), [Svelte](/HMPlot/reference/svelte/edges.md).

### Tree

A rooted tree layout of an edge table, as a tidy tree, an icicle or a dendrogram.

```python
hm.Tree(*children,
    root: str | float | bool | Expression = ...,
    directed: bool = ...,
    orientation: Literal["left", "right", "down", "up"] = ...,
    sibling_spacing: float = ...,
    depth_spacing: float = ...,
    mode: Literal["tidy", "tidy-approx", "partition", "cluster"] = ...,
    layer_height: str | float | Expression = ...,
    node_width: Any = ...,
    child_align: Literal["left", "right", "center"] = ...,
    width_mode: Literal["proportional", "fixed"] = ...,
    visual_margin: float = ...,
    height: str | Expression = ...,
    edge_length: str | float | Expression = ...,
    where: str | bool | Expression = ...,
    enter: TreeEnterOptions = ...,
    exit: TreeExitOptions = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    name: str = ...,
)
```

Svelte: `<Tree animationDuration animationEasing childAlign depthSpacing directed edgeLength enter exit height layerHeight mode name nodeWidth orientation root siblingSpacing visualMargin where widthMode>…</Tree>`

Reference: [Python](/HMPlot/reference/python/tree.md), [Svelte](/HMPlot/reference/svelte/tree.md).

## Chart patterns: Plot and layout

### Marginals (Python: charts.Marginals)

A scatter plot with a histogram of each of its columns along its top and right sides.

```python
hm.charts.Marginals(*children,
    data: Any = ...,
    schema: dict[str, Any] = ...,
    key: str | Sequence[str] = ...,
    bins: float | Literal["auto", "sturges", "fd", "scott"] | Sequence[float] | Expression = ...,
    height: float = ...,
    viewport: Viewport2D = ...,
    x: str | Expression = ...,
    y: str | Expression = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    brush: bool | SelectionResource | BrushOptions = ...,
    nearby: bool | SelectionResource | NearbyOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    drag: bool | Literal["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    shape: Any = ...,
    shape_scale: CategoryScale = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
)
```

Svelte import: `import { Marginals } from "hmplot/charts";`

Svelte: `<Marginals animation animationDuration animationEasing bins blend brush color colorScale colormap data drag enterEffect exitEffect fill fillScale glow height hover identity key label legend name nearby nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond schema select selectionOpacity shade shape shapeScale size sizeScale tooltip viewport visible x y>…</Marginals>`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`.

Reference: [Python](/HMPlot/reference/python/marginals.md), [Svelte](/HMPlot/reference/svelte/marginals.md).

### FocusContext (Python: charts.FocusContext)

A line chart over a strip of the whole series: dragging across the strip zooms the chart to that x interval.

```python
hm.charts.FocusContext(*children,
    data: Any = ...,
    schema: dict[str, Any] = ...,
    key: str | Sequence[str] = ...,
    height: float = ...,
    viewport: Viewport2D = ...,
    x: str | Expression = ...,
    y: str | Expression = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearby: bool | SelectionResource | NearbyOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    drag: bool | Literal["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    series: str = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
)
```

Svelte import: `import { FocusContext } from "hmplot/charts";`

Svelte: `<FocusContext animation animationDuration animationEasing blend color colorScale colormap data drag enterEffect exitEffect fill fillScale glow height hover identity key label legend name nearby nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond schema select selectionOpacity series shade size sizeScale tooltip viewport visible width widthScale x y>…</FocusContext>`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`.

Reference: [Python](/HMPlot/reference/python/focus-context.md), [Svelte](/HMPlot/reference/svelte/focus-context.md).

## Chart patterns: Marks

### Arrows (Python: charts.Arrows)

Arrows from start to end, one per row, with heads sized in pixels.

```python
hm.charts.Arrows(*,
    connections: Connect = ...,
    curve: Literal["linear", "step", "step-before", "step-after", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
    control1: Channel = ...,
    control2: Channel = ...,
    data: Any = ...,
    color: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    start: Channel = ...,
    end: Channel = ...,
    interpolation: Literal["cartesian", "great-circle", "angular"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    head_length: Any = ...,
    head_width: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Arrows } from "hmplot/charts";`

Svelte: `<Arrows animation animationDuration animationEasing blend color colorScale colormap connections control1 control2 curve data domains end enterEffect exitEffect glow hover identity interpolation label legend maxInstances name nearest opacity opacityScale options respond rows select selectionOpacity shade start tooltip visible width widthScale />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`, `headLength`, `headWidth`.

Reference: [Python](/HMPlot/reference/python/arrows.md), [Svelte](/HMPlot/reference/svelte/arrows.md).

### Bar (Python: charts.Bar)

Bars from a baseline to a value, one per row, on a categorical axis.

```python
hm.charts.Bar(*,
    orientation: Literal["horizontal", "vertical"] = ...,
    baseline: Channel = ...,
    band_fraction: float = ...,
    arrange: Literal["stack", "group", "overlap"] = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    rotation: float = ...,
    shape: Any = ...,
    shape_scale: CategoryScale = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Bar } from "hmplot/charts";`

Svelte: `<Bar animation animationDuration animationEasing arrange bandFraction baseline blend color colorScale colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest opacity opacityScale options orientation outlineColor outlineColorScale outlineOpacity outlineWidth position respond rotation select selectionOpacity shade shape shapeScale size sizeScale tooltip visible x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/bar.md), [Svelte](/HMPlot/reference/svelte/bar.md).

### BoxPlot (Python: charts.BoxPlot)

Box-and-whisker plots: each group's quartiles, median, whiskers and outliers.

```python
hm.charts.BoxPlot(*,
    orientation: Literal["horizontal", "vertical"] = ...,
    band_fraction: float = ...,
    whisker: float = ...,
    outliers: bool = ...,
    outlier_size: float = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    rotation: float = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    detail: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { BoxPlot } from "hmplot/charts";`

Svelte: `<BoxPlot animation animationDuration animationEasing bandFraction blend color colorScale colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest opacity opacityScale options orientation outlierSize outliers outlineColor outlineColorScale outlineOpacity outlineWidth position respond rotation select selectionOpacity shade size sizeScale tooltip visible whisker x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `detail`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/box-plot.md), [Svelte](/HMPlot/reference/svelte/box-plot.md).

### Callout (Python: charts.Callout)

A note a fixed distance from a point, with a leader line to the point.

```python
hm.charts.Callout(*,
    text: str | float | Sequence[str | float] | DictionaryColumn = ...,
    dx: Channel = ...,
    dy: Channel = ...,
    box: bool | LabelBox = ...,
    leader: bool | LabelLeader = ...,
    align: Literal["auto", "left", "right", "center"] = ...,
    font: str = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Callout } from "hmplot/charts";`

Svelte: `<Callout align animation animationDuration animationEasing blend box color colorScale colormap data dx dy enterEffect exitEffect fill fillScale font glow hover identity label leader legend maxInstances name nearest opacity opacityScale options respond select selectionOpacity shade size sizeScale text tooltip visible width widthScale x y />`

Reference: [Python](/HMPlot/reference/python/callout.md), [Svelte](/HMPlot/reference/svelte/callout.md).

### Crosshair (Python: charts.Crosshair)

Rules that follow the pointer across the frame, with a readout of its x and y.

```python
hm.charts.Crosshair(*,
    axes: Literal["xy", "x", "y"] = ...,
    readout: bool = ...,
    readout_position: Literal["edges", "pointer"] = ...,
    color: str = ...,
    width: float = ...,
    dash: float | bool | Sequence[float] = ...,
    text_color: str = ...,
    name: str = ...,
)
```

Svelte import: `import { Crosshair } from "hmplot/charts";`

Svelte: `<Crosshair axes color dash name readout readoutPosition textColor width />`

Reference: [Python](/HMPlot/reference/python/crosshair.md), [Svelte](/HMPlot/reference/svelte/crosshair.md).

### DensityBands (Python: charts.DensityBands)

Filled bands of the density of points in two dimensions, each filled by its lower level.

```python
hm.charts.DensityBands(*,
    weight: str = ...,
    bandwidth: float | Literal["auto"] | Sequence[float] = ...,
    resolution: float | Sequence[float] = ...,
    bounds: Any = ...,
    thresholds: float | Sequence[float] = ...,
    data: Any = ...,
    x: str = ...,
    y: str = ...,
    fill: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
)
```

Svelte import: `import { DensityBands } from "hmplot/charts";`

Svelte: `<DensityBands animation animationDuration animationEasing bandwidth blend bounds colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth resolution respond select selectionOpacity shade thresholds tooltip visible weight x y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/density-bands.md), [Svelte](/HMPlot/reference/svelte/density-bands.md).

### DensityContour (Python: charts.DensityContour)

Contour lines of the density of points in two dimensions.

```python
hm.charts.DensityContour(*,
    weight: str = ...,
    bandwidth: float | Literal["auto"] | Sequence[float] = ...,
    resolution: float | Sequence[float] = ...,
    bounds: Any = ...,
    thresholds: float | Sequence[float] = ...,
    mode: Literal["bands", "lines"] = ...,
    data: Any = ...,
    x: str = ...,
    y: str = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    interpolation: Literal["cartesian", "great-circle", "angular"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { DensityContour } from "hmplot/charts";`

Svelte: `<DensityContour animation animationDuration animationEasing bandwidth blend bounds color colorScale colormap data domains enterEffect exitEffect fill fillScale glow hover identity interpolation label legend maxInstances mode name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth position resolution respond select selectionOpacity shade size sizeScale thresholds tooltip visible weight width widthScale x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/density-contour.md), [Svelte](/HMPlot/reference/svelte/density-contour.md).

### Ecdf (Python: charts.Ecdf)

Empirical cumulative distributions as step lines, one per group.

```python
hm.charts.Ecdf(*,
    by: str = ...,
    complementary: bool = ...,
    normalize: Literal["count", "fraction"] = ...,
    data: Any = ...,
    x: str = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    sampling: Literal["random", "uniform-x"] = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Ecdf } from "hmplot/charts";`

Svelte: `<Ecdf animation animationDuration animationEasing blend by color colorScale colormap complementary data domains enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest normalize opacity opacityScale options position respond sampling select selectionOpacity shade size sizeScale tooltip visible width widthScale x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/ecdf-chart.md), [Svelte](/HMPlot/reference/svelte/ecdf-chart.md).

### ErrorBars (Python: charts.ErrorBars)

Error bars: an interval with caps at each row, such as a confidence interval.

```python
hm.charts.ErrorBars(*,
    lower: Channel = ...,
    upper: Channel = ...,
    orientation: Literal["horizontal", "vertical"] = ...,
    cap_size: float = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    color: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    rows: Literal["auto"] = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { ErrorBars } from "hmplot/charts";`

Svelte: `<ErrorBars animation animationDuration animationEasing blend capSize color colorScale colormap data domains enterEffect exitEffect glow hover identity label legend lower maxInstances name nearest opacity opacityScale options orientation position respond rows select selectionOpacity shade tooltip upper visible width widthScale x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/error-bars.md), [Svelte](/HMPlot/reference/svelte/error-bars.md).

### Histogram (Python: charts.Histogram)

Bars counting how many values fall in each bin of a numeric column.

```python
hm.charts.Histogram(*,
    bins: float | Literal["auto", "sturges", "fd", "scott"] | Sequence[float] | Expression = ...,
    normalization: Literal["density", "count", "proportion"] = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    brush: bool | HistogramBrushOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    rotation: float = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Histogram } from "hmplot/charts";`

Svelte: `<Histogram animation animationDuration animationEasing bins blend brush color colorScale colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest normalization opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond rotation select selectionOpacity shade size sizeScale tooltip visible width widthScale x y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/histogram.md), [Svelte](/HMPlot/reference/svelte/histogram.md).

### Lollipop (Python: charts.Lollipop)

A stem from a baseline to each value, with a point at its end.

```python
hm.charts.Lollipop(*,
    orientation: Literal["horizontal", "vertical"] = ...,
    baseline: Channel = ...,
    stem: dict[str, Any] = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    rotation: float = ...,
    shape: Any = ...,
    shape_scale: CategoryScale = ...,
    size_units: Literal["px", "data"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    detail: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Lollipop } from "hmplot/charts";`

Svelte: `<Lollipop animation animationDuration animationEasing baseline blend color colorScale colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest opacity opacityScale options orientation outlineColor outlineColorScale outlineOpacity outlineWidth position respond rotation select selectionOpacity shade shape shapeScale size sizeScale sizeUnits stem tooltip visible width widthScale x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `detail`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/lollipop.md), [Svelte](/HMPlot/reference/svelte/lollipop.md).

### Pie (Python: charts.Pie)

A pie or donut chart: a sector per row, its angle its value's share of the total.

```python
hm.charts.Pie(*,
    value: Channel = ...,
    category: str = ...,
    by: str | Sequence[str | Expression] | Expression = ...,
    sort: Literal["none", "asc", "desc"] | Sequence[str | float | bool] = ...,
    start_angle: float = ...,
    end_angle: float = ...,
    pad_angle: float = ...,
    inner_radius: float = ...,
    outer_radius: float = ...,
    sector_label: str | Expression = ...,
    sector_label_format: str = ...,
    text_color: str = ...,
    font_size: float = ...,
    placement: FramePlacement = ...,
    data: Any = ...,
    fill: Channel = ...,
    color: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Pie } from "hmplot/charts";`

Svelte: `<Pie animation animationDuration animationEasing blend by category color colorScale colormap data domains endAngle enterEffect exitEffect fill fillScale fontSize glow hover identity innerRadius label legend maxInstances name nearest opacity opacityScale options outerRadius outlineColor outlineColorScale outlineOpacity outlineWidth padAngle placement respond sectorLabel sectorLabelFormat select selectionOpacity shade sort startAngle textColor tooltip value visible />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/pie.md), [Svelte](/HMPlot/reference/svelte/pie.md).

### RuleX (Python: charts.RuleX)

A vertical reference line at x across the frame: one per row, or one at a value or the pointer.

```python
hm.charts.RuleX(*,
    y0: Channel = ...,
    y1: Channel = ...,
    dash: float | bool | Sequence[float] = ...,
    data: Any = ...,
    x: Channel = ...,
    color: str = ...,
    width: float = ...,
    opacity: float = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    name: str = ...,
    identity: Any = ...,
    select: Any = ...,
    hover: Any = ...,
    respond: Any = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { RuleX } from "hmplot/charts";`

Svelte: `<RuleX animation animationDuration animationEasing blend color dash data glow hover identity label legend maxInstances name opacity respond select shade visible width x y0 y1 />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/rule-x.md), [Svelte](/HMPlot/reference/svelte/rule-x.md).

### RuleY (Python: charts.RuleY)

A horizontal reference line at y across the frame: one per row, or one at a value or the pointer.

```python
hm.charts.RuleY(*,
    x0: Channel = ...,
    x1: Channel = ...,
    dash: float | bool | Sequence[float] = ...,
    data: Any = ...,
    y: Channel = ...,
    color: str = ...,
    width: float = ...,
    opacity: float = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    name: str = ...,
    identity: Any = ...,
    select: Any = ...,
    hover: Any = ...,
    respond: Any = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { RuleY } from "hmplot/charts";`

Svelte: `<RuleY animation animationDuration animationEasing blend color dash data glow hover identity label legend maxInstances name opacity respond select shade visible width x0 x1 y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/rule-y.md), [Svelte](/HMPlot/reference/svelte/rule-y.md).

### Smooth (Python: charts.Smooth)

A fitted curve through a scatter, with its confidence band.

```python
hm.charts.Smooth(*,
    method: Literal["linear", "log", "poly", "exp", "pow"] = ...,
    order: float = ...,
    samples: float = ...,
    extent: Sequence[float] = ...,
    band: float | bool = ...,
    data: Any = ...,
    x: str = ...,
    y: str = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    sampling: Literal["random", "uniform-x"] = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Smooth } from "hmplot/charts";`

Svelte: `<Smooth animation animationDuration animationEasing band blend color colorScale colormap data domains enterEffect exitEffect extent fill fillScale glow hover identity label legend maxInstances method name nearest opacity opacityScale options order position respond samples sampling select selectionOpacity shade size sizeScale tooltip visible width widthScale x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/smooth.md), [Svelte](/HMPlot/reference/svelte/smooth.md).

### Swarm (Python: charts.Swarm)

A beeswarm: points along a categorical axis, moved aside so none overlap.

```python
hm.charts.Swarm(*,
    orientation: Literal["horizontal", "vertical"] = ...,
    padding: float = ...,
    seed: float = ...,
    data: Any = ...,
    x: str = ...,
    y: str = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    brush: bool | SelectionResource | BrushOptions = ...,
    nearby: bool | SelectionResource | NearbyOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    drag: bool | Literal["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    rotation: float = ...,
    shape: Any = ...,
    shape_scale: CategoryScale = ...,
    size_units: Literal["px", "data"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    detail: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Swarm } from "hmplot/charts";`

Svelte: `<Swarm animation animationDuration animationEasing blend brush color colorScale colormap data domains drag enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearby nearest opacity opacityScale options orientation outlineColor outlineColorScale outlineOpacity outlineWidth padding position respond rotation seed select selectionOpacity shade shape shapeScale size sizeScale sizeUnits tooltip visible width widthScale x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `detail`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/swarm.md), [Svelte](/HMPlot/reference/svelte/swarm.md).

### Violin (Python: charts.Violin)

Violin plots: each group's distribution as a mirrored density curve.

```python
hm.charts.Violin(*,
    orientation: Literal["horizontal", "vertical"] = ...,
    scale: Literal["width", "count", "area"] = ...,
    side: Literal["left", "right", "both"] = ...,
    bandwidth: float | Literal["auto"] = ...,
    resolution: float = ...,
    band_fraction: float = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    z: Channel = ...,
    position: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    detail: Any = ...,
    lit: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { Violin } from "hmplot/charts";`

Svelte: `<Violin animation animationDuration animationEasing bandFraction bandwidth blend color colorScale colormap data domains enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest opacity opacityScale options orientation outlineColor outlineColorScale outlineOpacity outlineWidth position resolution respond scale select selectionOpacity shade side size sizeScale tooltip visible x y z />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `detail`, `lit`, `transparent`.

Reference: [Python](/HMPlot/reference/python/violin.md), [Svelte](/HMPlot/reference/svelte/violin.md).

### BandX (Python: charts.BandX)

A vertical shaded reference interval spanning the visible frame.

```python
hm.charts.BandX(*,
    x0: Channel = ...,
    x1: Channel = ...,
    data: Any = ...,
    fill: Channel = ...,
    opacity: float = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { BandX } from "hmplot/charts";`

Svelte: `<BandX animation animationDuration animationEasing blend data enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond select selectionOpacity shade tooltip visible x0 x1 />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/band-x.md), [Svelte](/HMPlot/reference/svelte/band-x.md).

### BandY (Python: charts.BandY)

A horizontal shaded reference interval spanning the visible frame.

```python
hm.charts.BandY(*,
    y0: Channel = ...,
    y1: Channel = ...,
    data: Any = ...,
    fill: Channel = ...,
    opacity: float = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
    max_instances: float = ...,
)
```

Svelte import: `import { BandY } from "hmplot/charts";`

Svelte: `<BandY animation animationDuration animationEasing blend data enterEffect exitEffect fill fillScale glow hover identity label legend maxInstances name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond select selectionOpacity shade tooltip visible y0 y1 />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/band-y.md), [Svelte](/HMPlot/reference/svelte/band-y.md).

### BulletChart (Python: charts.BulletChart)

Actual values, target ticks and supplied qualitative ranges on categorical rows.

```python
hm.charts.BulletChart(*,
    target: Channel = ...,
    fields: Sequence[str] = ...,
    baseline: float = ...,
    band_fraction: float = ...,
    ranges: BulletChartRangesOptions = ...,
    tick: BulletChartTickOptions = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    fill: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
)
```

Svelte import: `import { BulletChart } from "hmplot/charts";`

Svelte: `<BulletChart animation animationDuration animationEasing bandFraction baseline blend data domains enterEffect exitEffect fields fill fillScale glow hover identity label legend name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth ranges respond select selectionOpacity shade target tick tooltip visible x y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/bullet-chart.md), [Svelte](/HMPlot/reference/svelte/bullet-chart.md).

### Candlestick (Python: charts.Candlestick)

Prices over time as candles: a wick from each period's low to its high, and a body from its open to its close.

```python
hm.charts.Candlestick(*,
    data: Any = ...,
    open: str = ...,
    high: str = ...,
    low: str = ...,
    close: str = ...,
    band_fraction: float = ...,
    wick: dict[str, Any] = ...,
    x: str = ...,
    fill: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
)
```

Svelte import: `import { Candlestick } from "hmplot/charts";`

Svelte: `<Candlestick animation animationDuration animationEasing bandFraction blend close data domains enterEffect exitEffect fill fillScale glow high hover identity label legend low name nearest opacity opacityScale open options outlineColor outlineColorScale outlineOpacity outlineWidth respond select selectionOpacity shade tooltip visible wick x />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/candlestick.md), [Svelte](/HMPlot/reference/svelte/candlestick.md).

### Dumbbell (Python: charts.Dumbbell)

Two values per category, as points joined by a stem: before and after, or two groups.

```python
hm.charts.Dumbbell(*,
    data: Any = ...,
    x0: str = ...,
    x1: str = ...,
    stem: dict[str, Any] = ...,
    y: Channel = ...,
    fill: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    detail: Any = ...,
    transparent: Any = ...,
)
```

Svelte import: `import { Dumbbell } from "hmplot/charts";`

Svelte: `<Dumbbell animation animationDuration animationEasing blend data domains enterEffect exitEffect fill fillScale glow hover identity label legend name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond select selectionOpacity shade size sizeScale stem tooltip visible x0 x1 y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `detail`, `transparent`.

Reference: [Python](/HMPlot/reference/python/dumbbell.md), [Svelte](/HMPlot/reference/svelte/dumbbell.md).

### EndLabels (Python: charts.EndLabels)

Labels at the ends of lines: each series' name or value beside its last (or first) point.

```python
hm.charts.EndLabels(*,
    series: str = ...,
    text: Channel = ...,
    format: str = ...,
    at: Literal["first", "last"] = ...,
    dx: float = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
)
```

Svelte import: `import { EndLabels } from "hmplot/charts";`

Svelte: `<EndLabels animation animationDuration animationEasing at blend color colorScale colormap data domains dx enterEffect exitEffect format glow hover identity label legend name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond select selectionOpacity series shade size sizeScale text tooltip visible width widthScale x y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/end-labels.md), [Svelte](/HMPlot/reference/svelte/end-labels.md).

### ForestPlot (Python: charts.ForestPlot)

Point estimates with horizontal confidence intervals on categorical rows.

```python
hm.charts.ForestPlot(*,
    lower: Channel = ...,
    upper: Channel = ...,
    reference: Channel = ...,
    interval: ForestPlotIntervalOptions = ...,
    reference_line: ForestPlotReferenceLineOptions = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    fill: Channel = ...,
    color: Channel = ...,
    size: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    size_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    detail: Any = ...,
    transparent: Any = ...,
)
```

Svelte import: `import { ForestPlot } from "hmplot/charts";`

Svelte: `<ForestPlot animation animationDuration animationEasing blend color colorScale colormap data domains enterEffect exitEffect fill fillScale glow hover identity interval label legend lower name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth reference referenceLine respond select selectionOpacity shade size sizeScale tooltip upper visible x y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `detail`, `transparent`.

Reference: [Python](/HMPlot/reference/python/forest-plot.md), [Svelte](/HMPlot/reference/svelte/forest-plot.md).

### IntervalTimeline (Python: charts.IntervalTimeline)

Task intervals on categorical rows, with optional milestone points.

```python
hm.charts.IntervalTimeline(*,
    x0: Channel = ...,
    x1: Channel = ...,
    milestone: Channel = ...,
    milestones: IntervalTimelineMilestonesOptions = ...,
    band_fraction: float = ...,
    data: Any = ...,
    y: Channel = ...,
    fill: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
)
```

Svelte import: `import { IntervalTimeline } from "hmplot/charts";`

Svelte: `<IntervalTimeline animation animationDuration animationEasing bandFraction blend data domains enterEffect exitEffect fill fillScale glow hover identity label legend milestone milestones name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond select selectionOpacity shade tooltip visible x0 x1 y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/interval-timeline.md), [Svelte](/HMPlot/reference/svelte/interval-timeline.md).

### Sparkline (Python: charts.Sparkline)

A compact line with an optional reference band and final-value label.

```python
hm.charts.Sparkline(*,
    lower: Channel = ...,
    upper: Channel = ...,
    text: Channel = ...,
    band: SparklineBandOptions = ...,
    last: SparklineLastOptions = ...,
    data: Any = ...,
    x: Channel = ...,
    y: Channel = ...,
    color: Channel = ...,
    width: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    color_scale: CategoryScale | ContinuousScale = ...,
    colormap: str | Sequence[str] | ColormapOptions = ...,
    width_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
)
```

Svelte import: `import { Sparkline } from "hmplot/charts";`

Svelte: `<Sparkline animation animationDuration animationEasing band blend color colorScale colormap data domains enterEffect exitEffect glow hover identity label last legend lower name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond select selectionOpacity shade text tooltip upper visible width widthScale x y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/sparkline.md), [Svelte](/HMPlot/reference/svelte/sparkline.md).

### Waterfall (Python: charts.Waterfall)

A running total built from changes: each bar steps from the total before it to the total after it.

```python
hm.charts.Waterfall(*,
    data: Any = ...,
    band_fraction: float = ...,
    x: str = ...,
    y: str = ...,
    fill: Channel = ...,
    opacity: Channel = ...,
    outline_color: Channel = ...,
    outline_opacity: Channel = ...,
    outline_width: Channel = ...,
    fill_scale: CategoryScale | ContinuousScale = ...,
    outline_color_scale: CategoryScale = ...,
    opacity_scale: CategoryScale = ...,
    label: str = ...,
    legend: bool = ...,
    visible: bool = ...,
    domains: bool = ...,
    blend: Literal["normal", "additive", "multiply", "screen", "subtractive"] = ...,
    glow: float = ...,
    shade: Any = ...,
    options: Sequence[str] = ...,
    name: str = ...,
    identity: IdentityResource = ...,
    select: bool | SelectionResource | InputWrite = ...,
    hover: bool | SelectionResource | InputWrite = ...,
    tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
    nearest: bool | SelectionResource | NearestOptions = ...,
    respond: bool | Literal["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[Literal["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
    selection_opacity: float = ...,
    enter_effect: bool | Literal["fade"] | EnterEffectOptions = ...,
    exit_effect: bool | Literal["fade"] | ExitEffectOptions = ...,
    animation: bool = ...,
    animation_duration: float = ...,
    animation_easing: Literal["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
    legend_font_size: Any = ...,
    legend_font_family: Any = ...,
    legend_text_color: Any = ...,
    legend_tick_format: Any = ...,
    quantize: Any = ...,
    levels: Any = ...,
    max_elements: Any = ...,
    x_transform: Any = ...,
    x_invert: Any = ...,
    xbounds: Any = ...,
    xrange: Any = ...,
    y_transform: Any = ...,
    y_invert: Any = ...,
    ybounds: Any = ...,
    yrange: Any = ...,
    z_transform: Any = ...,
    z_invert: Any = ...,
    zbounds: Any = ...,
    zrange: Any = ...,
    transparent: Any = ...,
)
```

Svelte import: `import { Waterfall } from "hmplot/charts";`

Svelte: `<Waterfall animation animationDuration animationEasing bandFraction blend data domains enterEffect exitEffect fill fillScale glow hover identity label legend name nearest opacity opacityScale options outlineColor outlineColorScale outlineOpacity outlineWidth respond select selectionOpacity shade tooltip visible x y />`

Settings (the settings pane's options, also accepted as props): `legendFontSize`, `legendFontFamily`, `legendTextColor`, `legendTickFormat`, `quantize`, `levels`, `maxElements`, `xTransform`, `xInvert`, `xbounds`, `xrange`, `yTransform`, `yInvert`, `ybounds`, `yrange`, `zTransform`, `zInvert`, `zbounds`, `zrange`, `transparent`.

Reference: [Python](/HMPlot/reference/python/waterfall.md), [Svelte](/HMPlot/reference/svelte/waterfall.md).

## Statistical patterns: Transforms

### Bin (Python: stats.Bin)

Counts the rows in each interval of x (a histogram), or in each cell of an x-y or x-y-z grid.

```python
hm.stats.Bin(*children,
    name: str = ...,
    x: str | float | Sequence[float] | np.ndarray = ...,
    y: str | float | Sequence[float] | np.ndarray = ...,
    z: str | float | Sequence[float] | np.ndarray = ...,
    bins: float | Literal["auto", "sturges", "fd", "scott"] | Sequence[float] | Sequence[datetime.date] | Expression | dict[str, float | Literal["auto", "sturges", "fd", "scott"] | Sequence[float] | Sequence[datetime.date] | Expression] = ...,
    interval: Any = ...,
    tz: Any = ...,
    mode: Literal["aggregate", "assign"] = ...,
    shared_bins: bool = ...,
    empty: bool = ...,
    normalization: Literal["density", "count", "proportion"] = ...,
    columns: dict[str, Expression] = ...,
    as_: dict[str, str] = ...,
    weight: str | Sequence[float | bool] | np.ndarray = ...,
)
```

Svelte import: `import { Bin } from "hmplot/stats";`

Svelte: `<Bin as bins columns empty interval mode name normalization sharedBins tz weight x y z>…</Bin>`

Reference: [Python](/HMPlot/reference/python/bin.md), [Svelte](/HMPlot/reference/svelte/bin.md).

### Normalize (Python: stats.Normalize)

Rescales a column to z-scores, to 0 to 1, or relative to its sum, first value or maximum, over all rows or per group.

```python
hm.stats.Normalize(*children,
    name: str = ...,
    field: str | Sequence[float | bool] | Expression | np.ndarray = ...,
    method: Literal["extent", "max", "sum", "first", "deviation"] = ...,
    by: str | Sequence[str | Expression] | Expression = ...,
    as_: str = ...,
)
```

Svelte import: `import { Normalize } from "hmplot/stats";`

Svelte: `<Normalize as by field method name>…</Normalize>`

Reference: [Python](/HMPlot/reference/python/normalize.md), [Svelte](/HMPlot/reference/svelte/normalize.md).

### Window (Python: stats.Window)

A moving average (or other reduction) over each row and its neighbors.

```python
hm.stats.Window(*children,
    name: str = ...,
    field: str | Sequence[float | bool] | Expression | np.ndarray = ...,
    size: float | Expression = ...,
    reduce: Literal["all", "min", "max", "count", "sum", "mean", "first", "last", "variance", "std", "any"] = ...,
    align: Literal["center", "trailing", "leading"] = ...,
    by: str | Sequence[str | Expression] | Expression = ...,
    as_: str = ...,
)
```

Svelte import: `import { Window } from "hmplot/stats";`

Svelte: `<Window align as by field name reduce size>…</Window>`

Reference: [Python](/HMPlot/reference/python/window.md), [Svelte](/HMPlot/reference/svelte/window.md).

### Hexbin (Python: stats.Hexbin)

Counts the points in each hexagon of a hexagonal grid over x and y.

```python
hm.stats.Hexbin(*children,
    name: str = ...,
    x: str | float | Sequence[float] | np.ndarray = ...,
    y: str | float | Sequence[float] | np.ndarray = ...,
    bins: float | Expression = ...,
    radius: float | Expression = ...,
    bounds: HexbinBoundsOptions = ...,
    orientation: Literal["pointy", "flat"] = ...,
    shared_bins: bool = ...,
    columns: dict[str, Expression] = ...,
    as_: dict[str, str] = ...,
)
```

Svelte import: `import { Hexbin } from "hmplot/stats";`

Svelte: `<Hexbin as bins bounds columns name orientation radius sharedBins x y>…</Hexbin>`

Reference: [Python](/HMPlot/reference/python/hexbin.md), [Svelte](/HMPlot/reference/svelte/hexbin.md).

### Summary (Python: stats.Summary)

An estimate per group, the mean or median, with an interval around it: the numbers behind error bars.

```python
hm.stats.Summary(*children,
    name: str = ...,
    field: str | Expression = ...,
    by: str | Sequence[str | Expression] | Expression = ...,
    estimate: Literal["mean", "median"] = ...,
    interval: Literal["none", "normal", "deviation", "standard-error", "bootstrap"] = ...,
    confidence: float = ...,
    samples: float = ...,
    seed: float = ...,
    as_: Any = ...,
)
```

Svelte import: `import { Summary } from "hmplot/stats";`

Svelte: `<Summary as by confidence estimate field interval name samples seed>…</Summary>`

Reference: [Python](/HMPlot/reference/python/summary.md), [Svelte](/HMPlot/reference/svelte/summary.md).

## Functions, resources and types

- hmplot/check: Inspect mounted Svelte plots for readiness, diagnostics and export omissions. [Svelte](/HMPlot/reference/svelte/package-check.md)
- AxisDefinition: A Plot's or Frame's x, y and z: the domain, scale and transform, and the ticks, labels and title. [Python](/HMPlot/reference/python/axis-definition.md), [Svelte](/HMPlot/reference/svelte/axis-definition.md)
- rules and bands: Reference lines and shaded spans of an axis, behind the marks, on a Plot or a Frame. [Python](/HMPlot/reference/python/bands.md), [Svelte](/HMPlot/reference/svelte/bands.md)
- PlotHandle (Python: Plot (handle)): What a bound Plot offers code: fit, settle, selections, the camera, the animation clock and exports. [Python](/HMPlot/reference/python/plot-handle.md), [Svelte](/HMPlot/reference/svelte/plot-handle.md)
- createTheme (Python: create_theme): A theme: fonts, colors, axes and mark defaults, shared and changed live; themes holds the presets. [Python](/HMPlot/reference/python/themes.md), [Svelte](/HMPlot/reference/svelte/themes.md)
- connect: Connections between marks: Line, Segments, Arrows3D and Arrows draw them between the endpoints' positions. [Python](/HMPlot/reference/python/connect.md), [Svelte](/HMPlot/reference/svelte/connect.md)
- light: An ambient, directional, hemisphere or point light for Plot(lights=[...]). [Python](/HMPlot/reference/python/light.md), [Svelte](/HMPlot/reference/svelte/light.md)
- effects (Python: effect): Effects over the whole plot: a 3D plot's sky and fog, how glowing marks bloom, and plugins' effects. [Python](/HMPlot/reference/python/effects.md), [Svelte](/HMPlot/reference/svelte/effects.md)
- registerPlugin: Add effects and shades written in TSL: a plugin declares them once, and a Plot's effects and a mark's shade name them. [Svelte](/HMPlot/reference/svelte/plugins.md)
- use_plugin: Use an installed plugin package's effects and shades from Python: its parameters are checked, and its file travels to notebooks and exported pages. [Python](/HMPlot/reference/python/use-plugin.md)
- initializePlot: Start the GPU array backend before making GPU arrays yourself; Plots start it on their own. [Svelte](/HMPlot/reference/svelte/initialize-plot.md)
- visualize_tree: Draw a scene's component tree as a plot: each component a node, colored by its group. Hovering a node shows its tooltip and highlights its path to the root and its subtree. [Python](/HMPlot/reference/python/visualize-tree.md)
- Mark options: The options the marks share: position, appearance, scales, interaction and animation. [Python](/HMPlot/reference/python/mark-options.md), [Svelte](/HMPlot/reference/svelte/mark-options.md)
- literal: A constant, even where a column of that name exists. [Python](/HMPlot/reference/python/literal.md), [Svelte](/HMPlot/reference/svelte/literal.md)
- RGB colors (Python: rgb): Color each row from red, green and blue columns: 0-255 for integers, 0-1 for floats. [Python](/HMPlot/reference/python/rgb.md), [Svelte](/HMPlot/reference/svelte/rgb.md)
- registerShape (Python: register_shape): Add a point shape by name: a polygon or an SVG path in the unit square. [Python](/HMPlot/reference/python/shape.md), [Svelte](/HMPlot/reference/svelte/shape.md)
- animate: Animate one channel of a mark per row, in its scale's space; tween() moves a value in its own units, anywhere in an expression. [Python](/HMPlot/reference/python/animate-tween.md), [Svelte](/HMPlot/reference/svelte/animate-tween.md)
- col and view: How a value names a column, an input or view state: col.x, input.bins, view.time. [Python](/HMPlot/reference/python/names.md), [Svelte](/HMPlot/reference/svelte/names.md)
- Expression functions: Arithmetic, comparisons, logic, math and missing values, per row on the GPU wherever a column goes. [Python](/HMPlot/reference/python/expressions.md), [Svelte](/HMPlot/reference/svelte/expressions.md)
- Reductions: Scalar and grouped reductions with predicates, logical any/all, and row-aligned running totals, neighbors and windows. [Python](/HMPlot/reference/python/reductions.md), [Svelte](/HMPlot/reference/svelte/reductions.md)
- Calendar functions: year, month, weekday, time_floor and the other functions of a datetime column, on the GPU. [Python](/HMPlot/reference/python/calendar-functions.md), [Svelte](/HMPlot/reference/svelte/calendar-functions.md)
- Casts: as_category, as_ordinal, as_numeric, as_datetime and as_duration: a value's type for one use. [Python](/HMPlot/reference/python/casts.md), [Svelte](/HMPlot/reference/svelte/casts.md)
- TransformHandle: What a bound transform offers code: update it, wait for it, and follow its status. [Python](/HMPlot/reference/python/transform-handle.md), [Svelte](/HMPlot/reference/svelte/transform-handle.md)
- continuous: A scale from numbers to colors or sizes that marks and plots can share. [Python](/HMPlot/reference/python/continuous.md), [Svelte](/HMPlot/reference/svelte/continuous.md)
- normalization: A domain and transform that several scales share, so their colors and sizes agree. [Python](/HMPlot/reference/python/normalization.md), [Svelte](/HMPlot/reference/svelte/normalization.md)
- categorical: A scale from categories to colors, shapes or numbers, in a fixed order. [Python](/HMPlot/reference/python/categorical.md), [Svelte](/HMPlot/reference/svelte/categorical.md)
- ordinal: A scale from ordered categories to colors along a colormap. [Python](/HMPlot/reference/python/ordinal.md), [Svelte](/HMPlot/reference/svelte/ordinal.md)
- colormap: A custom colormap: a list of colors, with an interpolation space and positions. [Python](/HMPlot/reference/python/colormap.md), [Svelte](/HMPlot/reference/svelte/colormap.md)
- selection: A set of selected rows that marks set and read, shared across marks and plots. [Python](/HMPlot/reference/python/selection.md), [Svelte](/HMPlot/reference/svelte/selection.md)
- identity: Which rows are the same thing across tables, by key, so selections carry over. [Python](/HMPlot/reference/python/identity.md), [Svelte](/HMPlot/reference/svelte/identity.md)
- Tooltips: The nearest row's values in a box by the pointer, set per mark (tooltip=) or for a Plot. [Python](/HMPlot/reference/python/tooltips.md), [Svelte](/HMPlot/reference/svelte/tooltips.md)
- view: View and interaction state, read in any expression: the pointer, the visible domain, the clock, and each row's interaction flags. [Python](/HMPlot/reference/python/pointer-columns.md), [Svelte](/HMPlot/reference/svelte/pointer-columns.md)
- Offsets and dragging: Rows dragged with drag= move by offsets that views read through moved() and offset(). [Python](/HMPlot/reference/python/offsets-drag.md), [Svelte](/HMPlot/reference/svelte/offsets-drag.md)
- zoomViewport: A 2D viewport zoomed by a factor along x, y or both, never past the fitted view. [Svelte](/HMPlot/reference/svelte/zoom-viewport.md)
- table (Python: Table): A table with an identity, so updates and shared views know its rows. [Python](/HMPlot/reference/python/table.md), [Svelte](/HMPlot/reference/svelte/table.md)
- gridTable: A table of every cell of a grid: its dimensions' coordinates and its variables. [Svelte](/HMPlot/reference/svelte/grid-table.md)
- datetimeCoordinates: Turn dates into millisecond offsets from an origin, for a datetime axis. [Svelte](/HMPlot/reference/svelte/datetime-coordinates.md)
- DictionaryColumn: A category column as integer codes and the categories they stand for. [Python](/HMPlot/reference/python/dictionary-column.md), [Svelte](/HMPlot/reference/svelte/dictionary-column.md)
- typedColumn (Python: typed_column): One column with a logical type (ordinal, datetime, duration, ...), where a schema would type it. [Python](/HMPlot/reference/python/typed-column.md), [Svelte](/HMPlot/reference/svelte/typed-column.md)
- Fetch sources: fetchJSON, fetchCSV, fetchArrow and fetchParquet: a Provider's source that fetches a URL template. [Svelte](/HMPlot/reference/svelte/fetch-sources.md)
- Options from data: columnNames and categories: an input's options read from the data around it. [Python](/HMPlot/reference/python/input-options.md), [Svelte](/HMPlot/reference/svelte/input-options.md)
- DocumentExportOptions: How exportSVG and exportPDF draw: size, vector or raster, and text. [Python](/HMPlot/reference/python/document-export-options.md), [Svelte](/HMPlot/reference/svelte/document-export-options.md)
- check: Draw a plot headlessly and say what it drew: errors, each mark's rows and columns, the axes, and a PNG. [Python](/HMPlot/reference/python/check.md)
- Package entry points: What each import path of the npm package offers, and how stable it is. [Svelte](/HMPlot/reference/svelte/package-entries.md)
- hmplot/tiles: Load, place and style vector tiles yourself; the VectorTile mark does all of it for you. [Svelte](/HMPlot/reference/svelte/package-tiles.md)
- hmplot/video: A plot's animation encoded as MP4 in the browser with WebCodecs, loaded on first use. [Svelte](/HMPlot/reference/svelte/package-video.md)
- hmplot/vite: A Vite plugin that makes an app's own @jax-js/jax imports hmplot's jax-js, so arrays pass straight in. [Svelte](/HMPlot/reference/svelte/package-vite.md)
- hmplot/jax: The jax-js that hmplot runs on, for building GPU arrays that plots read without a copy. [Svelte](/HMPlot/reference/svelte/package-jax.md)
- hmplot/scene: The runtime that draws declarative scenes (what Python sends) in any Svelte app. [Svelte](/HMPlot/reference/svelte/package-scene.md)
- hmplot/templates: Render a code-free Python template inside a Svelte plot or data context. [Svelte](/HMPlot/reference/svelte/package-templates.md)
- hmplot/types: Option types for settings a component registers: a default, a settings-pane control and a conversion. [Svelte](/HMPlot/reference/svelte/package-types.md)
- hmplot/stats (Python: stats): Statistical transform patterns; hm.stats in Python. [Python](/HMPlot/reference/python/package-stats.md), [Svelte](/HMPlot/reference/svelte/package-stats.md)
- hmplot/charts (Python: charts): Chart patterns composed from core marks and transforms; hm.charts in Python. [Python](/HMPlot/reference/python/package-charts.md), [Svelte](/HMPlot/reference/svelte/package-charts.md)
- hmplot/compound: The built-in templates, and the experimental surface to write your own patterns. [Svelte](/HMPlot/reference/svelte/package-compound.md)
