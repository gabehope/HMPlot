from typing import Literal as TypingLiteral, Self
import datetime
from pathlib import Path
import numpy as np
from collections.abc import Sequence
from typing import Any, Callable, Awaitable
from .core import Callback as _Callback
from .pipeline import Pipeline as _Pipeline
from .core import Input as Input, Node as Node, Scene as Scene, SceneError as SceneError, Template as Template, template as template, template_param as template_param, slot as slot, contract as contract
from .templates import load_template as load_template
from .data import Table as Table, typed_column as typed_column, animate as animate, Animate as Animate, EASINGS as EASINGS, CategoryScale as CategoryScale, OrdinalScale as OrdinalScale, ContinuousScale as ContinuousScale, NormalizationResource as NormalizationResource, ThemeResource as ThemeResource, SelectionResource as SelectionResource, IdentityResource as IdentityResource, ThemePresets as ThemePresets, Literal as Literal, Rgb as Rgb, COLORMAP_NAMES as COLORMAP_NAMES, themes as themes
from .netcdf import stream as stream, StreamTable as StreamTable
from .expressions import Expression as Expression, col as col, add as add, subtract as subtract, multiply as multiply, divide as divide, power as power, negative as negative, abs as abs, square as square, sqrt as sqrt, log as log, exp as exp, sin as sin, cos as cos, floor as floor, round as round, minimum as minimum, maximum as maximum, clip as clip, equal as equal, not_equal as not_equal, less as less, less_equal as less_equal, greater as greater, greater_equal as greater_equal, logical_and as logical_and, logical_or as logical_or, logical_not as logical_not, where as where, is_missing as is_missing, is_finite as is_finite, coalesce as coalesce, is_in as is_in, mean as mean, sum as sum, count as count, min as min, max as max, extent as extent, std as std, var as var, median as median, quantile as quantile, mode as mode, first as first, last as last, any as any, all as all, cumsum as cumsum, lag as lag, lead as lead, window as window, lookup as lookup, bin as bin, hexbin as hexbin, tween as tween, interval as interval, keyframes as keyframes, random as random, row as row, input as input, categories as categories, column_names as column_names, offset as offset, moved as moved, prev as prev, view as view, STATE_NAMES as STATE_NAMES, year as year, quarter as quarter, month as month, week as week, day as day, weekday as weekday, day_of_year as day_of_year, hour as hour, minute as minute, second as second, month_name as month_name, day_name as day_name, time_floor as time_floor, as_category as as_category, as_ordinal as as_ordinal, as_numeric as as_numeric, as_datetime as as_datetime, as_duration as as_duration
from .exporter import ExportSession as ExportSession, export_png as export_png, export_pdf as export_pdf, export_svg as export_svg, export_html as export_html, export_mp4 as export_mp4, export_png_async as export_png_async, export_pdf_async as export_pdf_async, export_svg_async as export_svg_async, export_html_async as export_html_async, export_mp4_async as export_mp4_async
from .connections import Connect as Connect, Endpoint as Endpoint
from .lights import light as light
from .hierarchy import linkage_table as linkage_table
from .checking import check as check, CheckResult as CheckResult
def literal(value: Any) -> Literal:
    """A constant, even where a column of that name exists.

    Example:
        hm.Points(x="x", y="y", fill=hm.literal("white"))
    """
def categorical(*, domain: Sequence[str | bool | int | float] | None = ..., range: Sequence[str] | None = ..., unknown: str = ..., label: str | None = ...) -> CategoryScale:
    """A categorical scale marks can share: the categories (domain, in order; default the data's),
    their colors, shapes or sizes (range), the color of categories outside the domain (unknown)
    and the legend's title (label).

    Example:
        colors = hm.categorical(domain=["A", "B"], range=["#547ba2", "#cf8955"])
        hm.Points(x="x", y="y", fill="group", fill_scale=colors)
    """
Colormap = str | Sequence[str] | dict[str, Any]
def ordinal(*, domain: Sequence[str | bool | int | float], range: Sequence[str] | None = ..., colormap: Colormap = ..., unknown: str = ..., label: str | None = ...) -> OrdinalScale:
    """Ordered categories along a colormap (or a range of colors): low to high in domain's order.

    Example:
        rank = hm.ordinal(domain=["Low", "Middle", "High"], colormap="Viridis")
        hm.Points(x="x", y="y", fill="rank", fill_scale=rank)
    """
def normalization(*, domain: Sequence[float] | None = ..., transform: str = ..., domain_source: str = ...) -> NormalizationResource:
    """How numbers map to 0..1: a domain (default the data's extent) and a transform (linear, log,
    sqrt, symlog), shared by the continuous scales built on it.

    Example:
        norm = hm.normalization(domain=[0, 100])
        colors = hm.continuous(normalization=norm, colormap="Viridis")
        sizes = hm.continuous(normalization=norm, range=[8, 22])
    """
def continuous(*, normalization: NormalizationResource | None = ..., domain: Sequence[float] | None = ..., transform: str | None = ..., domain_source: str | None = ..., range: Sequence[float] | None = ..., colormap: Colormap | None = ..., quantize: bool = ..., levels: int = ..., label: str | None = ..., missing: str | None = ...) -> ContinuousScale:
    """A numeric scale marks can share: a normalization (or its domain and transform), then a
    colormap for colors or a range for sizes and widths; quantize with levels draws steps.
    Missing numeric colors use `missing`, or the theme's missing color by default.

    Example:
        colors = hm.continuous(domain=[0, 100], colormap="Viridis")
        hm.Points(x="x", y="y", fill="score", fill_scale=colors)
    """
def colormap(colors: Sequence[str], *, space: TypingLiteral["lab", "hsl", "srgb"] = ..., positions: Sequence[float] | None = ...) -> dict[str, Any]:
    """A colormap through these colors, interpolated in space (lab by default) at positions (evenly
    spaced by default), for any colormap= option.

    Example:
        alert = hm.continuous(colormap=hm.colormap(["#e8eef4", "#f2a900", "#d7301f"], positions=[0, 0.8, 1]))
    """
def rgb(r: Any, g: Any, b: Any, a: Any = ...) -> Rgb:
    """Color each row from red, green and blue columns (or arrays): 0-255 for integers, 0-1 for
    floats; a is an optional alpha column.

    Example:
        hm.Points(x="x", y="y", fill=hm.rgb("red", "green", "blue"))
    """
def connect(*endpoints: Node | Endpoint, key: str | None = ..., order: TypingLiteral["facet"] | None = ...) -> Connect:
    """Connections between marks, for the connections= of Line, Segments, Arrows3D and Arrows: they
    draw between the endpoints' positions. Rows pair by row, or by key= across tables;
    order="facet" connects one mark repeated in Facet cells.

    Example:
        before = hm.Points(x="x0", y="y")
        after = hm.Points(x="x1", y="y")
        hm.charts.Arrows(connections=hm.connect(before, after, key="id"))
    """
def effect(kind: str, **parameters: Any) -> dict[str, Any]:
    """One of a Plot's effects, for Plot(effects=[...]): "sky" (a 3D plot's sky: image=, or a
    gradient's zenith=, horizon= and ground=; rotation=, visible=), "bloom" (how glowing marks
    bloom: strength=, radius=), "fog" (a 3D plot's distance fog: near=, far=, color=) or a
    plugin's kind with its parameters (hm.use_plugin).

    Example:
        hm.Plot(type="3d", effects=[hm.effect("sky", zenith="#2f5f9e"), hm.effect("fog", near=50, far=200)])
    """
def shade(kind: str, **parameters: Any) -> dict[str, Any]:
    """A plugin's shade for a mark, as shade=hm.shade("hatch", spacing=6): the kind a plugin
    declared and its parameters. It recolors each fragment the mark draws; picking, tooltips,
    domains and legends are unchanged. A used plugin's (hm.use_plugin) parameters are checked
    against its manifest; another's in the browser, against its schema.

    Example:
        hm.Points(x="x", y="y", shade=hm.shade("hatch", spacing=6))
    """
def use_plugin(name: str) -> Any:
    """Use an installed plugin package's effects, shades and transforms, by its name (never a path
    or code): hm.effect and hm.shade then check its parameters, and scenes naming its kinds bring
    its file to the browser, which checks it against its manifest's hash. Plugins bundled with
    HMPlot need no use_plugin.

    Example:
        hm.use_plugin("acme-hatch")
        hm.Points(x="x", y="y", shade=hm.shade("hatch", spacing=6))
    """
def register_shape(name: str, vertices: Sequence[Sequence[float]] | str) -> str:
    """Add a point shape by name: a polygon in the unit square (x and y from -1 to 1) or an SVG
    path. Returns the name, for shape= and shape scales.

    Example:
        hm.register_shape("kite", [[0, 1], [0.7, 0.2], [0, -1], [-0.7, 0.2]])
        hm.Points(x="x", y="y", shape="kite")
    """
BUILTIN_SHAPES: tuple[str, ...]
"""The built-in point shapes (circle, triangle, diamond, square, ...), for shape= and shape scales.

Example:
    hm.Points(x="x", y="y", shape=hm.BUILTIN_SHAPES[1])
"""
__version__: str
"""The package's version.

Example:
    print(hm.__version__)
"""
def create_theme(name: str | None = ..., **sections: Any) -> ThemeResource:
    """A theme: fonts, colors, axes and mark defaults by section, shared and changed live; extends=
    starts from a preset (hm.themes).

    Example:
        paper = hm.create_theme(extends="paper", marks={"Line": {"width": 1.5}})
        with hm.Theme(value=paper):
            hm.Plot()
    """
def install_chrome(*, force: bool = ..., quiet: bool = ...) -> Path:
    """Download Chrome for Testing into the user cache for exports, ahead of the first one (the
    `hmplot install-chrome` command). Exports use an installed Chrome, Edge or Chromium first.
    Returns the executable's path.

    Example:
        path = hm.install_chrome(quiet=True)
    """
def selection(by: str | None = None) -> SelectionResource:
    """A selection marks and filters can share: clicks (select=), brushes (brush=) or code fill it,
    and respond=, filters, expressions and "@selected" read it. In an expression it is each row's
    membership: hm.where(focus, 1, 0.15), focus & (hm.col.value > 10), ~focus.

    by: a column's name. The rows picked select their values of it, and every row with one of
    those values is a member, in any table with that column (a gene hovered in one table
    highlights its rows in another). Missing values match nothing.

    Example:
        focus = hm.selection()
        hm.Points(x="x", y="y", select=focus, opacity=hm.where(focus, 1, 0.15))
    """
def identity(*, keys: Any) -> IdentityResource:
    """An identity: who each row is, by key, so selections carry across tables that show the same
    things (a mark's identity=).

    Example:
        rows = hm.identity(keys=["a", "b", "c"])
        hm.Points(x=[1, 2, 3], y=[3, 1, 2], identity=rows, select=True)
    """

# Interaction resource methods are asynchronous because notebook state is browser-owned.

def load_theme(path: str) -> ThemeResource:
    """A theme read from a JSON file of theme sections (as create_theme takes them).

    Example:
        theme = hm.load_theme("theme.json")
        with hm.Theme(value=theme):
            hm.Plot()
    """

def visualize_tree(obj: Node, *, split_facet: bool = False) -> Plot:
    """A Plot of an object's component tree: each component a node labelled by its kind and colored
    by its group; hovering a node shows its props and highlights its path to the root and its
    subtree. split_facet=True gives each Facet cell its own branch. The object is only read.

    Example:
        with hm.Plot(data={"x": [1, 2], "y": [2, 3]}) as plot:
            hm.Points(x="x", y="y")
        hm.visualize_tree(plot)
    """
# Generated types (scripts/generate-python-signatures.mjs): hmplot/_types.py.
from ._types import (
    Channel as Channel,
    SupportsArray as SupportsArray,
    TooltipField as TooltipField,
    TooltipOptions as TooltipOptions,
    NearestOptions as NearestOptions,
    AxisDefinition as AxisDefinition,
    CalendarInterval as CalendarInterval,
    AxisDefinitionBreaksHours as AxisDefinitionBreaksHours,
    AxisDefinitionBreaksDates as AxisDefinitionBreaksDates,
    AxisDefinitionCalendar as AxisDefinitionCalendar,
    PlotLegendOptions as PlotLegendOptions,
    LightSpec as LightSpec,
    Axes3DConfig as Axes3DConfig,
    PlotOverviewAxesOptions as PlotOverviewAxesOptions,
    ReferenceRule as ReferenceRule,
    PlotViewportOptions as PlotViewportOptions,
    PlotSettings as PlotSettings,
    TableViewColumn as TableViewColumn,
    InputWrite as InputWrite,
    ColormapOptions as ColormapOptions,
    EnterEffectOptions as EnterEffectOptions,
    ExitEffectOptions as ExitEffectOptions,
    BrushOptions as BrushOptions,
    NearbyOptions as NearbyOptions,
    DictionaryColumn as DictionaryColumn,
    MinimapAxesOptions as MinimapAxesOptions,
    ProviderAccumulateOptions as ProviderAccumulateOptions,
    FilterCondition as FilterCondition,
    ShiftAsOptions as ShiftAsOptions,
    FacetFieldsRow as FacetFieldsRow,
    FacetFieldsColumn as FacetFieldsColumn,
    FacetPairsOptions as FacetPairsOptions,
    FacetAsValue as FacetAsValue,
    FacetAsX as FacetAsX,
    FacetLegendOptions as FacetLegendOptions,
    SimulateStopOptions as SimulateStopOptions,
    InterpolateBoundsOptions as InterpolateBoundsOptions,
    DensityBoundsOptions as DensityBoundsOptions,
    DensityAsOptions as DensityAsOptions,
    FoldAsOptions as FoldAsOptions,
    RegressionAsOptions as RegressionAsOptions,
    ForceSpec as ForceSpec,
    ReducerSpec as ReducerSpec,
    VectorTileTileDataOptions as VectorTileTileDataOptions,
    TitleTextOptions as TitleTextOptions,
    LabelBox as LabelBox,
    LabelLeader as LabelLeader,
    TreeEnterOptions as TreeEnterOptions,
    TreeExitOptions as TreeExitOptions,
    FramePlacement as FramePlacement,
    FrameAtmosphereOptions as FrameAtmosphereOptions,
    HistogramBrushOptions as HistogramBrushOptions,
    Viewport2D as Viewport2D,
    HexbinBoundsOptions as HexbinBoundsOptions,
    BulletChartRangesOptions as BulletChartRangesOptions,
    BulletChartTickOptions as BulletChartTickOptions,
    ForestPlotIntervalOptions as ForestPlotIntervalOptions,
    ForestPlotReferenceLineOptions as ForestPlotReferenceLineOptions,
    IntervalTimelineMilestonesOptions as IntervalTimelineMilestonesOptions,
    SparklineBandOptions as SparklineBandOptions,
    SparklineLastOptions as SparklineLastOptions,
)
# End of generated types.

from . import charts as charts, stats as stats
class Plot(Node):
    def __init__(self, *children: Node,
        animation_group: str | Sequence[str] = ...,
        description: str = ...,
        describe: bool = ...,
        tooltip: Any = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        loading: TypingLiteral["atomic", "progressive"] = ...,
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
        coordinates: TypingLiteral["cartesian", "polar", "spherical"] = ...,
        polar_axis: TypingLiteral["X", "Y", "Z"] = ...,
        spherical_view: TypingLiteral["globe", "projected"] = ...,
        camera_mode: TypingLiteral["orbit", "flyover"] = ...,
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
        angle_unit: TypingLiteral["degrees", "radians", "extent", "custom"] = ...,
        angle_period: float = ...,
        base_radius: float = ...,
        radial_scale: float = ...,
        projection: TypingLiteral["equirectangular", "mercator", "equal-area", "orthographic", "equal-earth", "natural-earth", "albers", "albers-usa"] = ...,
        projection_center: Sequence[float] = ...,
        parallels: Sequence[float] = ...,
        subdivision_tolerance: float = ...,
        zoom_axis: TypingLiteral["xy", "x", "y"] = ...,
        dynamic_margins: bool = ...,
        axis_margin_zoom: bool = ...,
        overview_scale: float = ...,
        overview_max_instances: float = ...,
        axis_frame: bool = ...,
        axis_mask: bool = ...,
        axes3d: bool | Axes3DConfig = ...,
        aspect: TypingLiteral["auto", "equal"] = ...,
        overview_axes: bool | PlotOverviewAxesOptions = ...,
        rules: Sequence[ReferenceRule] = ...,
        bands: Sequence[dict[str, Any]] = ...,
        viewport: PlotViewportOptions = ...,
        interactive: bool | TypingLiteral["brush"] = ...,
        name: str = ...,
        width: float = ...,
        height: float = ...,
        responsive: bool = ...,
        type: TypingLiteral["2d", "3d", "3d-y-up"] = ...,
        settings: PlotSettings = ...,
        tone_mapping: float = ...,
        overview: bool = ...,
        axes2d: bool = ...,
        orientation3d: bool = ...,
        axis_tick_labels: bool = ...,
        axis_titles: bool = ...,
        antialias: TypingLiteral["off", "msaa", "ssaa8", "ssaa16", "smaa"] = ...,
        auto_bounds: bool = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        animate_bounds: bool = ...,
        bounds_duration: float = ...,
        bounds_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        title: str = ...,
        subtitle: str = ...,
        caption: str = ...,
        filename: str = ...,
        export_options: Any = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
        axis_font_size: Any = ...,
        axis_font_family: Any = ...,
        axis_line_width: Any = ...,
        axis_tick_size: Any = ...,
        axis_margin_left: Any = ...,
        axis_margin_right: Any = ...,
        axis_margin_top: Any = ...,
        axis_margin_bottom: Any = ...,
    ) -> None:
        """A chart: axes, a camera and the marks inside it, in 2D or 3D.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                hm.Points(x="x", y="y")
            plot

        Args:
            animation_group: Match animation rows by these columns within each
                filtered/transformed snapshot; selections keep Data.key. null restores
                key/position matching. Default: inherited; otherwise Data.key, then position.
            description: Your description of the plot for screen readers and exports; the
                generated summary of its marks, axes and legend follows it unless describe is
                false.
            describe: Add the generated summary of the plot's marks, axes and legend to its
                description. Default: True.
            tooltip: The tooltip of every mark in the plot that sets none: true, a list of
                fields, or {fields, radius, content, mode}. mode "x" lists every series' value
                at the pointer's x in one box.
            nearest: The nearest of every mark in the plot that has rows and sets none:
                true, a selection(), or {selection, radius}.
            loading: "atomic" shows the plot once its first frame is complete; "progressive"
                draws each mark as soon as it is ready. Default: "atomic".
            background: The plot's background: a CSS color, or "transparent". Default: the
                theme's (white in the default theme).
            data: A table or live pipeline output for the marks in the plot; the same as
                wrapping them in Data.
            schema: Column types for data, such as {"day": "datetime"}, as on Data.
            key: The column, or columns, that identify each row of data across updates, as
                on Data.
            x: The x axis: its domain, transform, label, ticks, grid and the rest of an axis
                definition.
            y: The y axis, as x.
            z: The z axis of a 3D plot, as x.
            scale_defaults: Defaults for the continuous color, size and width scales the
                plot's marks make for numeric columns: each {colormap, range, transform, ...}.
            z_scale: The height scale of every surface in the plot (a Heatmap with
                surface_mode), unless the surface sets its own. Default: each surface's own (0).
            legend: true shows a legend that explains everything the plot's marks map from
                data (a guide per channel, as a Legend without a channel does), then lists the
                labeled marks; {position} puts it at the "top", "right", "bottom" (the default)
                or "left"; false shows none. A channel an explicit Legend explains is left out.
                Default: a legend at the bottom for each fill, color or outline color mapped
                from a category column.
            coordinates: The coordinate system: polar reads x as angle and y as radius;
                spherical reads x and y as longitude and latitude. Default: "cartesian".
            polar_axis: The axis a 3D polar plot turns around; a 2D polar plot uses "Z".
                Default: "Z".
            spherical_view: How a 3D spherical plot shows the sphere: as a globe, or flat in
                its map projection. Default: "globe".
            camera_mode: How the viewer moves a 3D camera: "orbit" turns around a target;
                "flyover" moves like a map (drag pans the ground, the wheel zooms toward the
                pointer, right-drag looks, WASD and QE fly). Default: "orbit".
            camera_position: Where the 3D camera is; the plot's box spans -50 to 50. A new
                value moves it there (easing with animation). Default: [90, 70, 140], scaled to
                the scene. In world units.
            camera_target: The point the 3D camera looks at. Default: [0, 0, 0] world units.
            camera_up: The 3D camera's up direction, overriding the view preset. Default:
                [0, 0, 1] for 3d; [0, 1, 0] for 3d-y-up.
            camera_fov: The 3D camera's vertical field of view. Default: 50 degrees.
            camera_near: The 3D camera's near clipping distance. Default: from the scene's
                size. In world units.
            camera_far: The 3D camera's far clipping distance. Default: from the scene's
                size. In world units.
            fly_speed: A multiplier on flyover's wheel zoom and key travel, from 0.1 to 10.
                Default: 1.
            flyover_momentum: A flyover ground drag released while moving glides on for a
                moment, slowing to a stop; false stops the view on release, as reduced motion
                does. Default: True.
            lights: Lights for lit marks: ambient, directional, hemisphere or point.
                Positions use world units; omitted, no lights are added.
            effects: Effects over the whole plot: {kind: "sky", ...} (a 3D plot's sky),
                {kind: "bloom", strength, radius} (how glowing marks bloom), {kind: "fog", near,
                far, color} (a 3D plot's distance fog) or a registered plugin's kind with its
                parameters. A kind no plugin registers is skipped with a warning. SVG and PDF
                exports draw the whole plot as an image while one shows.
            globe_background: A color fills the sphere under a 3D globe's marks; false
                leaves it empty. Default: False.
            angle_unit: The unit of polar and spherical angles: "extent" makes the x domain
                one turn, "custom" uses angle_period. Default: "degrees".
            angle_period: Angle units in one turn when angle_unit is "custom" (24 for
                hours). Default: 360.
            base_radius: The radius at zero: a polar plot's radius is base_radius +
                radial_scale × y, a globe's base_radius + radial_scale × height. Default: 0 in
                polar coordinates, 1 in spherical.
            radial_scale: The radius per unit of y in a polar plot, or of height on a globe
                (see base_radius). Default: 1.
            projection: The map projection of a 2D spherical plot (or a projected 3D one).
                An orthographic globe drags to turn; equal-earth, natural-earth, albers and
                albers-usa have curved outlines and draw a graticule instead of edge axes.
                Default: "equirectangular".
            projection_center: The map's center [longitude, latitude], in angle_unit: the
                orthographic globe's starting view, and the central meridian of equal-earth,
                natural-earth and albers (its origin latitude too). Default: [0, 0].
            parallels: The albers projection's two standard parallels, in angle_unit.
                Default: [29.5, 45.5].
            subdivision_tolerance: How far a curved line, band or outline may stray from its
                true shape before it is divided further. Default: 0.5 px.
            zoom_axis: Which axes the viewer's 2D zoom changes. Default: "xy".
            dynamic_margins: Fit axis margins during navigation. False fits initially, then
                holds this plot's own margins during pan/zoom; size, font, style and data-domain
                changes refit. Aligned peers can still reserve space; longer labels may clip.
                Default: True.
            axis_margin_zoom: With axes shown, zooming over an axis's margin zooms that axis
                only. Default: True.
            overview_scale: A multiplier on the marks' sizes in the overview. Default: 0.35.
            overview_max_instances: The most rows per mark the overview draws; past it the
                rows are sampled (null draws them all). Default: 1000.
            axis_frame: Draw a complete rectangular border in 2D Cartesian frames without
                duplicate ticks or labels. Default: the theme's.
            axis_mask: Clip marks and picking to the rectangular 2D Cartesian axes interior,
                intersecting ancestor masks. Default: the theme's.
            axes3d: Enable Cartesian 3D guides: true uses theme defaults; an object selects
                box or triad style and xy/xz/yz grid planes. Default: False.
            aspect: "equal" keeps one transformed data unit the same length on all Cartesian
                axes, including 3D; "auto" fills the plot. In 2D an explicit domain is kept: the
                plot area letterboxes instead of widening it. Polar and spherical plots are
                always equal. Default: "auto".
            overview_axes: Label the overview's axes: true for both, or {x, y} to choose.
                Default: False.
            rules: Reference lines across the plot at x or y values, each with an optional
                label, color, width and dash.
            bands: Shaded spans of the x or y axis behind the marks and grid lines, labelled
                like rules.
            viewport: The 2D view: its center as a fraction of each axis's domain (x, y) and
                its zoom. With onviewportchange it controls the view or shares it between plots;
                with animation, a new value eases there.
            interactive: Let the viewer pan and zoom a 2D plot or move a 3D camera, and
                Shift-drag to brush a mark with brush; false fixes the view, and a plain drag
                brushes. "brush": a plain drag brushes, Shift-drag pans and the wheel zooms.
                Default: True.
            name: The plot's name in its settings and export panels, and its accessible name
                when it has no title. Default: Plot 1, Plot 2, ....
            width: A fixed width; without one the plot fills its notebook cell or exported
                page (in a Facet, its cell). hm.export_png, export_svg and export_pdf, with no
                page to fill, draw it 800 px wide; a view's own export draws it as shown.
                Default: the container width. In px.
            height: The height of the whole plot: its title, caption and top or bottom
                legends take their room from it, and the drawing area the rest (at least a
                quarter of it). Default: 450 px.
            responsive: True fills the container even when width is set; false uses width or
                800 px. Default: fill the container without width.
            type: A 2D plot, a Z-up 3D plot (3d), or a Y-up 3D plot (3d-y-up); camera_up
                overrides either 3D preset; SVG and PDF exports draw a 3D plot's 2D marks as
                vectors sorted by depth, and its marks as one image when one has no vector form
                there (a 3D mark, a Heatmap). Default: "2d".
            settings: showTrigger: false hides the settings and export buttons; showExport:
                false hides the export button and the menu's Export entry; menu: false leaves
                the browser's own context menu instead of the plot's; allowSharedDefaults: false
                leaves the shared defaults out of the settings pane. The plot's export and
                openSettings() methods work whatever these say.
            tone_mapping: The three.js tone mapping the plot renders with: 0 (the default)
                keeps colors exact, so marks match their legends; 4 is ACES filmic, for a
                photographic look in lit 3D scenes. Default: 0.
            overview: Show an overview in the corner: a minimap of the whole domain in 2D,
                an orientation gadget in 3D; exports leave it out. Default: False.
            axes2d: Draw the 2D axes: lines, ticks, labels and titles; on a 2D orthographic
                globe, a graticule (every 15°) and the sphere's outline. Default: true for 2D
                Cartesian plots and 2D orthographic globes; false otherwise.
            orientation3d: Show an X/Y/Z orientation indicator in the lower left while a 3D
                plot is hovered. Default: False.
            axis_tick_labels: Draw the axes' tick labels. Default: True.
            axis_titles: Draw the axis titles, in 2D and on the 3D box. Default: True.
            antialias: On-screen antialiasing: 4x MSAA (msaa), hybrid 8x/16x sampling
                (ssaa8/ssaa16: 4x MSAA at 2x/4x the pixel count, then downsampling), SMAA, or
                off. Hybrid modes cost more GPU work. Exports always use 4x MSAA at their
                requested resolution. Default: "msaa".
            auto_bounds: Fit missing x, y and z domains to the plotted data; an explicit
                domain always wins. Default: true when the plot has data (its own, an enclosing
                Data or a Facet); Python's Plot sends true.
            animation: Animate changes to the values of every mark in the plot (marks can
                set their own), and ease a new viewport or camera prop (position, target, up,
                fov, near, far) to its value, except under reduced motion; the viewer's press or
                wheel stops the move. Default: False.
            animation_duration: How long animated changes take, including setCamera's with
                animate. Default: 300 ms.
            animation_easing: The easing of animated changes. Default: "cubic-in-out".
            animate_bounds: Animate numeric axis domains and ranges independently of mark
                animation; structural changes and direction reversals snap. Default: False.
            bounds_duration: Duration of scale transitions, independent of mark timing.
                Default: 300 ms.
            bounds_easing: Easing of scale transitions, independent of mark timing. Default:
                "cubic-in-out".
            title: A title above the plot, part of it on screen and in its exports.
            subtitle: A line under the title, smaller and lighter.
            caption: A note under the plot, such as its source, smaller and lighter.
            filename: Save an export to this file when the plot's with block closes; the
                suffix picks PNG, SVG, PDF or HTML.
            export_options: Options for that export, such as scale for PNG or mode and width
                for SVG and PDF; needs filename.
            interpolation: How the plot's paths run between two points on a map or a globe:
                along a great circle, straight in longitude and latitude, or straight in space.
                Marks can set their own. Default: "great-circle".
            axis_font_size: The size of the axis labels. Default: the theme's (14 in the
                default theme). In px.
            axis_font_family: The axis labels' font, a CSS font-family. Default: the
                theme's.
            axis_line_width: The width of the axis lines and ticks. Default: the theme's (1
                in the default theme). In px.
            axis_tick_size: The length of the ticks. Default: the theme's (3 in the default
                theme). In px.
            axis_margin_left: The space left of the plot area: "auto" fits the y axis's
                labels and title, a number pins it. Default: "auto". In px.
            axis_margin_right: The space right of the plot area: "auto" fits what reaches
                past it (the last x label), a number pins it. Default: "auto". In px.
            axis_margin_top: The space above the plot area: "auto" fits what reaches past it
                (the top y label), a number pins it. Default: "auto". In px.
            axis_margin_bottom: The space below the plot area: "auto" fits the x axis's
                labels and title, a number pins it. Default: "auto". In px.
        """
    def update(self, *,
        animation_group: str | Sequence[str] = ...,
        description: str = ...,
        describe: bool = ...,
        tooltip: Any = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        loading: TypingLiteral["atomic", "progressive"] = ...,
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
        coordinates: TypingLiteral["cartesian", "polar", "spherical"] = ...,
        polar_axis: TypingLiteral["X", "Y", "Z"] = ...,
        spherical_view: TypingLiteral["globe", "projected"] = ...,
        camera_mode: TypingLiteral["orbit", "flyover"] = ...,
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
        angle_unit: TypingLiteral["degrees", "radians", "extent", "custom"] = ...,
        angle_period: float = ...,
        base_radius: float = ...,
        radial_scale: float = ...,
        projection: TypingLiteral["equirectangular", "mercator", "equal-area", "orthographic", "equal-earth", "natural-earth", "albers", "albers-usa"] = ...,
        projection_center: Sequence[float] = ...,
        parallels: Sequence[float] = ...,
        subdivision_tolerance: float = ...,
        zoom_axis: TypingLiteral["xy", "x", "y"] = ...,
        dynamic_margins: bool = ...,
        axis_margin_zoom: bool = ...,
        overview_scale: float = ...,
        overview_max_instances: float = ...,
        axis_frame: bool = ...,
        axis_mask: bool = ...,
        axes3d: bool | Axes3DConfig = ...,
        aspect: TypingLiteral["auto", "equal"] = ...,
        overview_axes: bool | PlotOverviewAxesOptions = ...,
        rules: Sequence[ReferenceRule] = ...,
        bands: Sequence[dict[str, Any]] = ...,
        viewport: PlotViewportOptions = ...,
        interactive: bool | TypingLiteral["brush"] = ...,
        name: str = ...,
        width: float = ...,
        height: float = ...,
        responsive: bool = ...,
        type: TypingLiteral["2d", "3d", "3d-y-up"] = ...,
        settings: PlotSettings = ...,
        tone_mapping: float = ...,
        overview: bool = ...,
        axes2d: bool = ...,
        orientation3d: bool = ...,
        axis_tick_labels: bool = ...,
        axis_titles: bool = ...,
        antialias: TypingLiteral["off", "msaa", "ssaa8", "ssaa16", "smaa"] = ...,
        auto_bounds: bool = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        animate_bounds: bool = ...,
        bounds_duration: float = ...,
        bounds_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        title: str = ...,
        subtitle: str = ...,
        caption: str = ...,
        filename: str = ...,
        export_options: Any = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
        axis_font_size: Any = ...,
        axis_font_family: Any = ...,
        axis_line_width: Any = ...,
        axis_tick_size: Any = ...,
        axis_margin_left: Any = ...,
        axis_margin_right: Any = ...,
        axis_margin_top: Any = ...,
        axis_margin_bottom: Any = ...,
    ) -> Self: ...
    @property
    def description(self) -> str | None: ...

class TableView(Node):
    def __init__(self, *,
        columns: Sequence[str | Expression | TableViewColumn] = ...,
        limit: float = ...,
        title: str = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        name: str = ...,
    ) -> None:
        """The rows of the data around it as an HTML table, live: a Group's groups, a Sort's top
        rows, a Filter's kept rows; omitted from image exports.

        Example:
            import hmplot as hm

            cars = {"model": ["Civic", "Corolla", "Golf", "Model 3", "Prius", "Mustang"],
                    "mpg": [36.0, 34.0, 31.0, 132.0, 52.0, 18.0], "weight": [1250, 1300, 1350, 1610, 1380, 1700]}
            with hm.Scene() as scene:
                with hm.Data(cars):
                    with hm.Plot(height=260, axes2d=True):
                        hm.Points(x="weight", y="mpg", brush=True)
                    with hm.Filter(where="@brushed", inactive="all"):
                        with hm.Sort(by="mpg", order="desc"):
                            hm.TableView(columns=["model", {"field": "mpg", "format": ".0f"}], limit=5, title="Most efficient")
            scene

        Args:
            columns: The columns, in order: names, or {field, label, format} with a header
                and a d3-format or %-pattern, as tooltip fields take. Default: every column.
            limit: How many rows to show; the rest are counted below the table. A Sort above
                it gives a top N. Default: 100.
            title: A caption above the table.
            select: Click a row: true selects its source rows in the data's selection, or
                give a selection(); input("root").set("id") writes an input (.set(literal(v)) a
                constant, .reset() its default), and a second click on that row restores its
                default.
            hover: Hover a row: true marks its source rows @hovered, or give a selection();
                input("focus").set("id") shows the row's id in an input while the pointer is on
                it.
            name: A name for the table (its element's data-name attribute).
        """
    def update(self, *,
        columns: Sequence[str | Expression | TableViewColumn] = ...,
        limit: float = ...,
        title: str = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        name: str = ...,
    ) -> Self: ...

class Heatmap(Node):
    def __init__(self, *children: Node,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
        # Advanced renderer options:
        texture_resolution: Sequence[float] = ...,
    ) -> None:
        """A grid of values drawn as colors, one cell per value.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            fill = [
                [0, 1, 2, 1],
                [1, 3, 4, 2],
                [2, 4, 3, 1],
            ]
            with hm.Plot(height=300) as plot:
                hm.Heatmap(fill=fill)
            plot

        Args:
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            pixelated: Draw each cell as a flat square of its value instead of blending it
                into its neighbors. Default: true for a 2-D array of at most 64 cells along each
                side, without surfaceMode or contours in a 2D plot; false for a grid table.
            x: Over a grid table, the dimension drawn along x. Default: the grid's last
                dimension.
            y: Over a grid table, the dimension drawn along y. Default: the grid's
                second-to-last dimension.
            z: The z position, in a 3D plot: a column, per-row values, or one value.
            fill: The values, one per cell, mapped to colors: a 2-D array (nested lists or a
                NumPy array in Python), or a variable of a grid table. A 2-D array's cell in row
                i and column j is centered at x = j, y = i (row 0 at the bottom), so the axes
                span -0.5 to n - 0.5, unless the plot sets the axis's domain.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            detail: How finely a point's or a surface's geometry is divided (sphere
                segments, grid cells).
            lit: Shade the mark with the plot's lights. Default: False.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            size_attenuation: Shrink far points in perspective, as three.js does. Default:
                True.
            z_scale: How high a surface's values stand: the relief's height scale. Default:
                0.
            surface_mode: Draw the grid as a surface whose height is its values, instead of
                a flat raster. Default: False.
            surface3d: Draw the surface in 3D, lit and seen from the camera, rather than
                flat in 2D. Default: False.
            depthtest: Hide the parts of the surface behind other geometry. Default: True.
            texture_resolution: The size of the texture a Heatmap's child marks are drawn
                into. In px.
        """
    def update(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
        # Advanced renderer options:
        texture_resolution: Sequence[float] = ...,
    ) -> Self: ...

class Points3D(Node):
    def __init__(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        drag: bool | TypingLiteral["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
        # Advanced renderer options:
        depth_write: bool = ...,
        max_instances: float = ...,
    ) -> None:
        """Solid spheres or cubes in a 3D plot, one per row.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2], "z": [2, 4, 1, 3]}
            with hm.Plot(data=data, type="3d", height=300, axes3d=True) as plot:
                hm.Points3D(x="x", y="y", z="z")
            plot

        Args:
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            x: The x position: a column, per-row values, or one value.
            y: The y position: a column, per-row values, or one value.
            z: The z position, in a 3D plot: a column, per-row values, or one value.
            position: Positions as one column or an N x 2 (or N x 3) array, instead of x, y
                and z.
            fill: The fill color: a CSS color, or a column of numbers or categories mapped
                to colors. Default: the theme's Points fill (#3478c7 in the default theme).
            size: The diameter of each sphere (a cube's side is half of it): a number, or a
                column mapped to sizes through size_scale (its range in world units:
                continuous({ range: [2, 8] }) spans small to large spheres). A 3D plot's box is
                100 world units across, so 4 is a twenty-fifth of it; a few hundred points read
                well at 2 to 6. Default: 4 world units.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            size_scale: The size's scale, which marks can share: continuous({domain, range,
                transform}) for numbers (without a range, the automatic one), or categories with
                a numeric range.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            brush: Brush rows with Shift-drag (point marks; Line, Area brush whole series):
                true uses its data's brush, a selection() shares one, {selection, axis} picks
                the axes.
            nearby: Mark the rows near the pointer (point marks): true, a selection(), or
                {selection, radius, units, axis}.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            drag: Drag rows to move them (point marks): true along every numeric axis, or
                the axes to move along. Default: False.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            shape: The solid drawn at every point. Default: "sphere".
            shape_scale: A categorical() scale from the shape column's categories to shape
                names.
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            detail: How finely each sphere is divided, 0 to 4: 3 is 320 triangles a sphere,
                1 (80) draws a large dataset faster. Default: 3.
            lit: Shade the mark with the plot's lights. Default: False.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            size_attenuation: Shrink far points in perspective, as three.js does. Default:
                True.
            depth_write: Write visible point fragments to the depth buffer with normal
                blending; false leaves depth testing and nearest-point picking unchanged. Other
                blend modes disable depth writes. Default: True.
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        drag: bool | TypingLiteral["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
        # Advanced renderer options:
        depth_write: bool = ...,
        max_instances: float = ...,
    ) -> Self: ...

class Points(Node):
    def __init__(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        drag: bool | TypingLiteral["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        rotation: float = ...,
        shape: Any = ...,
        shape_scale: CategoryScale = ...,
        size_units: TypingLiteral["px", "data"] = ...,
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
        # Advanced renderer options:
        depth_write: bool = ...,
        max_instances: float = ...,
    ) -> None:
        """A scatter plot's symbols, one per row.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                hm.Points(x="x", y="y")
            plot

        Args:
            x_offset: Moves each row along x in data units: on a categorical axis a band is
                one unit, so 0.25 is a quarter of the category's band (grouped bars, dodged
                points). A number or a column. dx moves by CSS pixels. Default: 0 data.
            y_offset: Moves each row along y in data units: on a categorical axis a band is
                one unit (side-by-side horizontal bars). A number or a column. dy moves by CSS
                pixels. Default: 0 data.
            dx: Moves each point right, or left when negative: a number, or a column (Dodge
                writes one). Default: 0 px.
            dy: Moves each point down, or up when negative: a number, or a column (Dodge
                writes one). Default: 0 px.
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            x: The x position: a column, per-row values, or one value.
            y: The y position: a column, per-row values, or one value.
            z: The z position, in a 3D plot: a column, per-row values, or one value.
            position: Positions as one column or an N x 2 (or N x 3) array, instead of x, y
                and z.
            fill: The fill color: a CSS color, or a column of numbers or categories mapped
                to colors. "transparent" draws a hollow point, its outline alone (outline_color,
                outline_width); colors are otherwise opaque (use opacity). Default: the theme's
                (#3478c7 in the default theme).
            color: The line or text color: a CSS color, or a column mapped to colors.
            size: Each point's diameter in CSS pixels (in x units with size_units="data"): a
                number, or a column mapped through size_scale (by default onto the automatic
                size range). Default: 6 px.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            outline_color: The outline's color: a CSS color, or a column of categories
                mapped through outline_color_scale.
            outline_opacity: Border opacity from 0 to 1: a number, numeric column, array or
                expression. Fades the border over the fill; mark opacity still applies to both.
                Missing values hide the border. Default: 1.
            outline_width: The outline's width in CSS pixels, drawn inside the mark's edge
                (a point's at most its radius). Default: 0.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            color_scale: A scale for color that marks can share.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            size_scale: The size's scale, which marks can share: continuous({domain, range,
                transform}) for numbers (without a range, the automatic one), or categories with
                a numeric range.
            outline_color_scale: A categorical() scale from the outline_color column's
                categories to colors.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            brush: Brush rows with Shift-drag (point marks; Line, Area brush whole series):
                true uses its data's brush, a selection() shares one, {selection, axis} picks
                the axes.
            nearby: Mark the rows near the pointer (point marks): true, a selection(), or
                {selection, radius, units, axis}.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            drag: Drag rows to move them (point marks): true along every numeric axis, or
                the axes to move along. Default: False.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            rotation: The symbol's rotation. Default: 0 degrees.
            shape: The point symbol: a shape name, a column of categories mapped to shapes,
                or one name per row. Default: "circle".
            shape_scale: A categorical() scale from the shape column's categories to shape
                names.
            size_units: What size measures: CSS pixels whatever the zoom, or units of the x
                axis, so zooming scales the points. Default: "px".
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            detail: How finely a point's or a surface's geometry is divided (sphere
                segments, grid cells).
            lit: Shade the mark with the plot's lights. Default: False.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            depth_write: Write visible point fragments to the depth buffer with normal
                blending; false leaves depth testing and nearest-point picking unchanged. Other
                blend modes disable depth writes. Default: True.
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        drag: bool | TypingLiteral["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        rotation: float = ...,
        shape: Any = ...,
        shape_scale: CategoryScale = ...,
        size_units: TypingLiteral["px", "data"] = ...,
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
        # Advanced renderer options:
        depth_write: bool = ...,
        max_instances: float = ...,
    ) -> Self: ...

class Segments(Node):
    def __init__(self, *,
        connections: Connect = ...,
        dash: float | bool | Sequence[float] = ...,
        curve: TypingLiteral["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
        control1: Channel = ...,
        control2: Channel = ...,
        cap: TypingLiteral["none", "bar", "arrow"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        start: Channel = ...,
        end: Channel = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> None:
        """Line segments, one per row, each from its start to its end.

        Example:
            import hmplot as hm

            start = [[0, 0], [1, 2], [2, 1]]
            end = [[1, 1], [2, 3], [4, 0]]
            with hm.Plot(height=300, axes2d=True) as plot:
                hm.Segments(start=start, end=end)
            plot

        Args:
            connections: Draw between other marks instead of from start and end: connect(a,
                b, {key}) draws a segment for each matched key and pair of adjacent endpoints.
            dash: Draw the line dashed: true (4 px dashes and gaps), a dash length (gaps as
                long), or [dash, gap], measured along the drawn path. In px.
            curve: How each segment runs from start to end: straight, in steps, as a tree
                link, or as a Bézier curve through its control points. Default: "linear", or
                "cubic" when control points are given.
            control1: Each segment's first control point for a quadratic or cubic curve: a
                column of positions or an N x 2 (N x 3) array. Without curve, control points
                make the segments cubic.
            control2: Each segment's second control point for a cubic curve; left out of an
                automatic cubic, it is the segment's end.
            cap: "bar": a bar across both ends; "arrow": an arrowhead at the true end,
                following the curve. Default: "none".
            cap_size: The length of the bars cap="bar" draws. Default: 6 px.
            head_length: The length of cap="arrow" heads, limited to the segment's length.
                Default: 10 px.
            head_width: The width of cap="arrow" heads. Default: 8 px.
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            color: The line or text color: a CSS color, or a column mapped to colors.
                Default: the theme's (#3478c7 in the default theme).
            width: The line width: a number, or a column mapped to widths. Default: the
                theme's (1 in the default theme). In px.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            color_scale: A scale for color that marks can share.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            width_scale: A scale for width that marks can share, as size_scale.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            start: Where each segment starts (Segments, Arrows): a column of positions or an
                N x 2 (N x 3) array.
            end: Where each segment ends, as start.
            interpolation: How a path between two points runs on a map or a globe: along a
                great circle, straight in longitude and latitude, or straight in space. Default:
                "great-circle".
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
        connections: Connect = ...,
        dash: float | bool | Sequence[float] = ...,
        curve: TypingLiteral["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
        control1: Channel = ...,
        control2: Channel = ...,
        cap: TypingLiteral["none", "bar", "arrow"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        start: Channel = ...,
        end: Channel = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> Self: ...

class Line(Node):
    def __init__(self, *,
        connections: Connect = ...,
        dash: float | bool | Sequence[float] = ...,
        curve: TypingLiteral["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        series: str | Sequence[Any] | Sequence[str] | DictionaryColumn = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        sampling: TypingLiteral["random", "uniform-x"] = ...,
        max_instances: float = ...,
    ) -> None:
        """A line through the rows in order: one path, or one per series.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4, 5], "y": [1, 3, 2, 5, 4]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                hm.Line(x="x", y="y")
            plot

        Args:
            connections: Draw between other marks instead of from x and y: connect(a, b,
                {key}) draws one path per matched key through the endpoints in order.
            dash: Draw the line dashed: true (4 px dashes and gaps), a dash length (gaps as
                long), or [dash, gap], measured along the drawn path. In px.
            curve: How the path runs between its points: straight, in steps, or smoothed.
                Default: "linear".
            curve_alpha: How a catmull-rom curve bends: 0 uniform, 0.5 centripetal, 1
                chordal. Default: 0.5.
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            x: The x position: a column, per-row values, or one value.
            y: The y position: a column, per-row values, or one value.
            z: The z position, in a 3D plot: a column, per-row values, or one value.
            position: Positions as one column or an N x 2 (or N x 3) array, instead of x, y
                and z.
            color: The line or text color: a CSS color, or a column mapped to colors.
                Default: the theme's (#3478c7 in the default theme).
            width: The line width: a number, or a column mapped to widths. Default: the
                theme's (2 in the default theme). In px.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            color_scale: A scale for color that marks can share.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            width_scale: A scale for width that marks can share, as size_scale.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            brush: Brush rows with Shift-drag (point marks; Line, Area brush whole series):
                true uses its data's brush, a selection() shares one, {selection, axis} picks
                the axes.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            series: Split the rows into separate paths, one per value of this column (Line,
                Area). Without it, a Line colored or an Area filled by a category column splits
                by that column.
            interpolation: How a path between two points runs on a map or a globe: along a
                great circle, straight in longitude and latitude, or straight in space. Default:
                "great-circle".
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            sampling: Which rows a Line keeps when it has more than max_instances: a random
                sample, or the extremes across even steps of x. Default: "random".
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
        connections: Connect = ...,
        dash: float | bool | Sequence[float] = ...,
        curve: TypingLiteral["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        series: str | Sequence[Any] | Sequence[str] | DictionaryColumn = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        sampling: TypingLiteral["random", "uniform-x"] = ...,
        max_instances: float = ...,
    ) -> Self: ...

class Surface(Node):
    def __init__(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> None:
        """A 3D surface over a grid of heights, or a triangle mesh.

        Example:
            import numpy as np
            import hmplot as hm

            # A smooth bump on a 41 x 41 grid: a Surface draws the grid it is given, one vertex per value.
            t = np.linspace(-1, 1, 41)
            x, y = np.meshgrid(t, t)
            height = np.exp(-3 * (x**2 + y**2))
            with hm.Plot(type="3d", height=300, axes3d=True) as plot:
                hm.Surface(height=height)
            plot

        Args:
            height: The heights as a grid: row j, column i is the height at (x[i], y[j]).
                Without x and y the grid spans -1 to 1 on both axes.
            indices: With position instead of height, a triangle mesh: three vertex indices
                per triangle.
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            x: With height, the x of each grid column.
            y: With height, the y of each grid row.
            position: With indices, the mesh's vertices: an N x 2 or N x 3 array.
            fill: The color: one CSS color, or values mapped through the colormap, a grid
                like height (one per vertex for a mesh). Default: the heights, through the
                colormap.
            color: The line or text color: a CSS color, or a column mapped to colors.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            color_scale: A scale for color that marks can share.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            lit: Shade the mark with the plot's lights. Default: False.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
        """
    def update(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> Self: ...

class Arrows3D(Node):
    def __init__(self, *,
        connections: Connect = ...,
        curve: TypingLiteral["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        start: Channel = ...,
        end: Channel = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> None:
        """Solid arrows, a tube and a cone, from start to end points, one per row.

        Example:
            import hmplot as hm

            start = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
            end = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
            with hm.Plot(type="3d", height=300, axes3d=True) as plot:
                hm.Arrows3D(start=start, end=end, width=1)
            plot

        Args:
            connections: Draw between endpoint marks instead of from start and end:
                connections={connect(before, after, {key: "id"})} draws one arrow per matched
                pair, from the earlier endpoint to the later one.
            curve: How each arrow runs from start to end: straight, in steps, as a link
                curve, or as a Bézier through control1 (and control2). Default: "linear".
            control1: Each arrow's Bézier control point, an N x 2 or N x 3 array or a
                column: the one of a "quadratic" curve, the first of a "cubic" one.
            control2: Each arrow's second control point, for a "cubic" curve.
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            color: The line or text color: a CSS color, or a column mapped to colors.
                Default: the theme's Arrows color (#3478c7 in the default theme).
            width: The shaft's thickness: a number, or a column mapped to widths. A
                Cartesian plot's box is 100 world units across; a map's or globe's world is its
                projection's (a flat map is 2π across). Default: 0.05 world units.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            color_scale: A scale for color that marks can share.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            width_scale: A scale for width that marks can share, as size_scale.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            start: Where each segment starts (Segments, Arrows): a column of positions or an
                N x 2 (N x 3) array.
            end: Where each segment ends, as start.
            interpolation: How a path between two points runs on a map or a globe: along a
                great circle, straight in longitude and latitude, or straight in space. Default:
                "great-circle".
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            lit: Shade the mark with the plot's lights. Default: False.
            head_length: The arrowhead's length. Default: 3 world units.
            head_width: The arrowhead's width. Default: 2 world units.
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
        connections: Connect = ...,
        curve: TypingLiteral["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        start: Channel = ...,
        end: Channel = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> Self: ...

class Text3D(Node):
    def __init__(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> None:
        """One piece of text drawn as geometry in the plot, plain or TeX math.

        Example:
            import hmplot as hm

            with hm.Plot(type="3d", height=300, axes3d=True) as plot:
                hm.Text3D(text="Hello", position=[0, 0.4, 0], size=10)
                hm.Text3D(text=r"e^{i\\pi} + 1 = 0", tex=True, position=[0, -0.4, 0], size=10)
            plot

        Args:
            text: The text to draw. Text3D draws one label; use Text for a label per row.
            tex: Typeset the text as TeX math (with MathJax), such as \\frac{1}{x^2+1}.
                Default: False.
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            position: Where the text sits, [x, y] or [x, y, z]: its middle, or the end that
                align names. Default: [0, 0, 0].
            color: The text's color, a CSS color. Default: the theme's Text color (#252525
                in the default theme).
            size: The text's size (its font size): one number. Default: 3 world units.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            size_scale: The size's scale, which marks can share: continuous({domain, range,
                transform}) for numbers (without a range, the automatic one), or categories with
                a numeric range.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            font: The typeface of the 3D text. Default: "helvetiker".
            align: How each text sits at its position. Default: "center".
            billboard: Turn the text to face the camera. Default: False.
        """
    def update(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> Self: ...

class Image(Node):
    def __init__(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> None:
        """An image drawn from its pixels: grayscale, RGB or RGBA.

        Example:
            import hmplot as hm

            # Two rows of three RGB pixels, 0 to 1.
            pixels = [
                [[0.9, 0.3, 0.2], [0.95, 0.75, 0.2], [0.3, 0.7, 0.4]],
                [[0.2, 0.5, 0.8], [0.5, 0.3, 0.7], [0.9, 0.9, 0.9]],
            ]
            with hm.Plot(height=300) as plot:
                hm.Image(data=pixels, pixelated=True)
            plot

        Args:
            data: The pixels, row 0 at the top: [height, width] (grayscale) or [height,
                width, 3 or 4] (RGB, RGBA), integers 0-255 or floats 0-1. Or an image file,
                which the browser decodes (RGB, or RGBA when some pixel is not opaque): a URL;
                in Python also a path, bytes or a PIL image; in JavaScript also a Blob, an
                ImageBitmap, or an image or canvas element.
            pixelated: Draw each pixel as a sharp square instead of blending it into its
                neighbors. Default: False.
            lit: Shade the image with the plot's lights instead of showing its exact colors.
                Default: False.
            x: Over a grid table, the dimension drawn along x. Default: the grid's last
                dimension.
            y: Over a grid table, the dimension drawn along y. Default: the grid's
                second-to-last dimension.
            z: The z position, in a 3D plot: a column, per-row values, or one value.
            fill: Over a grid table, the pixels' colors instead of data: a column of [r, g,
                b] or [r, g, b, a] rows, or {r, g, b, a} naming a column per channel. Integers
                are 0-255, floats 0-1.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
        """
    def update(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> Self: ...

class Theme(Node):
    def __init__(self, *children: Node,
        value: Any = ...,
    ) -> None:
        """Fonts, colors and mark styles for everything inside it.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Theme(value=hm.themes.dark) as themed:
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Points(x="x", y="y")
            themed

        Args:
            value: The theme: a preset from themes (Python hm.themes), createTheme(...)
                (Python hm.create_theme), or a definition object. An inner theme changes only
                what it names.
        """
    def update(self, *,
        value: Any = ...,
    ) -> Self: ...

class Minimap(Node):
    def __init__(self, *,
        axis: Any = ...,
        axes: bool | MinimapAxesOptions = ...,
        display_scale: float = ...,
        target: Any = ...,
        width: float = ...,
        height: float = ...,
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> None:
        """A small overview of a plot's whole extent, with a rectangle to drag its view around (a
        3D plot gets an orientation gadget).

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Scene() as scene:
                with hm.Plot(data=data, height=300, axes2d=True) as plot:
                    hm.Points(x="x", y="y")
                hm.Minimap(target=plot)
            scene

        Args:
            axis: The Frame whose axis settings (bounds, transform, format) the minimap's
                axis labels follow. Default: the plot's root frame.
            axes: Whether the minimap labels its axes: true for both, or {x, y} for each.
                Default: False.
            display_scale: A multiplier on the marks' sizes in the overview, relative to
                their sizes in the plot. Default: 0.35.
            target: The Plot the minimap shows and moves (Python target=).
            width: The minimap's width. Default: 180 px.
            height: The minimap's height. Default: 120 px.
            max_instances: The most rows of each mark the overview draws; past it the rows
                are sampled (null draws them all). Default: 1000.
        """
    def update(self, *,
        axis: Any = ...,
        axes: bool | MinimapAxesOptions = ...,
        display_scale: float = ...,
        target: Any = ...,
        width: float = ...,
        height: float = ...,
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> Self: ...

class Legend(Node):
    def __init__(self, *,
        target: Any = ...,
        channel: TypingLiteral["color", "size", "width", "shape", "fill", "opacity", "outlineColor"] = ...,
        label: str = ...,
        position: TypingLiteral["left", "right", "top", "bottom"] = ...,
    ) -> None:
        """A key to a plot's marks, or to the colors, shapes or sizes one channel encodes.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2], "group": ["a", "b", "a", "b"]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                hm.Points(x="x", y="y", fill="group")
                hm.Legend(channel="fill")
            plot

        Args:
            target: What the legend explains: a plot, a facet grid, a mark or a list of
                marks (Python target=). Default: the Plot or Facet it is in.
            channel: The channel to explain: categories draw swatches, numbers a colorbar
                (fill, color) or a ramp of sample sizes (size, width, opacity). Without it the
                legend explains every channel its marks map from data, then lists the labeled
                marks.
            label: The legend's title. With several guides (one per scale), each keeps its
                own title. Default: the scale's label, else the mark's label, else the column's
                name.
            position: The side of the plot the legend sits on; left and right stack its
                entries. Default: right with a channel, else bottom.
        """
    def update(self, *,
        target: Any = ...,
        channel: TypingLiteral["color", "size", "width", "shape", "fill", "opacity", "outlineColor"] = ...,
        label: str = ...,
        position: TypingLiteral["left", "right", "top", "bottom"] = ...,
    ) -> Self: ...

class Area(Node):
    def __init__(self, *,
        lower: Channel = ...,
        upper: Channel = ...,
        orientation: TypingLiteral["horizontal", "vertical"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> None:
        """A filled area between two edges, with lower=0 by default.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4, 5], "y": [2, 4, 3, 5, 4]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                hm.Area(x="x", upper="y")
            plot

        Args:
            lower: The first edge, a number or value per row; default 0. The edges may
                cross. Default: 0.
            upper: The second edge, a number or value per row, in value-axis units.
            orientation: Whether the area spans y between lower and upper along x, or spans
                x along y. Default: "vertical".
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            x: The x position of each row; the area joins the rows in order. A horizontal
                Area takes y instead.
            y: With orientation="horizontal", the y position of each row; lower and upper
                are on x.
            z: The z position, in a 3D plot: a column, per-row values, or one value.
            fill: The fill color: a CSS color, or a column of numbers or categories mapped
                to colors. Default: the theme's (#3478c7 in the default theme).
            width: The line width: a number, or a column mapped to widths. In px.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: the theme's (1 in the default theme).
            outline_color: The outline's color: a CSS color, or a column of categories
                mapped through outline_color_scale.
            outline_opacity: Border opacity from 0 to 1: a number, numeric column, array or
                expression. Fades the border over the fill; mark opacity still applies to both.
                Missing values hide the border. Default: 1.
            outline_width: The outline's width in CSS pixels, drawn inside the mark's edge
                (a point's at most its radius). Default: 0.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            width_scale: A scale for width that marks can share, as size_scale.
            outline_color_scale: A categorical() scale from the outline_color column's
                categories to colors.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            brush: Brush rows with Shift-drag (point marks; Line, Area brush whole series):
                true uses its data's brush, a selection() shares one, {selection, axis} picks
                the axes.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            series: Split the rows into separate paths, one per value of this column (Line,
                Area). Without it, a Line colored or an Area filled by a category column splits
                by that column.
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
        lower: Channel = ...,
        upper: Channel = ...,
        orientation: TypingLiteral["horizontal", "vertical"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> Self: ...

class Data(_Pipeline):
    def __init__(self, *children: Any,
        animation_group: str | Sequence[str] = ...,
        value: Any = ...,
        rows: float = ...,
        key: Any = ...,
        schema: Any = ...,
    ) -> None:
        """A table whose columns the components inside it read by name.

        The first positional argument may be the data (a Table or DataFrame); the others are its
        children.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Data(data) as table:
                with hm.Plot(height=300, axes2d=True):
                    hm.Points(x="x", y="y")
            table

        Args:
            animation_group: Match animation rows by these columns within each
                filtered/transformed snapshot; selections keep Data.key. null restores
                key/position matching. Default: inherited; otherwise Data.key, then position.
            value: The table: columns, rows, typed arrays, an Arrow table or a GeoJSON
                FeatureCollection (Python also takes it as the first argument); or a transform
                (a Filter, Group, ...: its handle in Svelte, value=node in Python), whose live
                output the components inside read, computed once wherever it is drawn.
            rows: Number of rows instead of a table: an integer from 0 to 2147483647.
                Generate columns with row(), random() and Calculate; pass value or rows, not
                both.
            key: The column (or columns) whose values identify a row across updates, so
                selections and animations follow it. Default: the row's index.
            schema: Column types, when inference is not enough: numeric, categorical,
                ordinal, boolean, datetime, duration or geometry.
        """
    def update(self, *,
        animation_group: str | Sequence[str] = ...,
        value: Any = ...,
        rows: float = ...,
        key: Any = ...,
        schema: Any = ...,
    ) -> Self: ...

class Provider(Node):
    def __init__(self, *children: Node,
        url: str = ...,
        format: TypingLiteral["arrow", "json", "csv", "parquet"] = ...,
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
    ) -> None:
        """A table loaded asynchronously, from a URL or a load function, for the components inside
        it.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            # Palmer penguins, from vega-datasets on a CDN that allows any page to fetch it.
            with hm.Provider(url="https://cdn.jsdelivr.net/npm/vega-datasets@2/data/penguins.json", format="json") as penguins:
                with hm.Plot(height=300, axes2d=True):
                    hm.Points(x="Beak Length (mm)", y="Beak Depth (mm)")
            penguins

        Args:
            url: The address to fetch, instead of `source`, with {name} placeholders filled
                from params. In Svelte markup write it as a string expression:
                url={"/data/{year}.csv"}.
            format: How the fetched file is read: JSON rows, CSV, an Arrow IPC file, or
                Parquet read by byte ranges. Default: "json".
            path: For JSON, a dot path to the rows in the response, such as "data.items".
            columns: For Parquet, the columns to read; the others are never downloaded.
            params: The load's inputs, as plain JSON values that fill the url's
                placeholders; a change that makes a new request loads again.
            key: The column (or columns) that identify a row, as on Data, so selections
                follow rows across loads.
            schema: Column types, as on Data.
            initial: A table shown until the first load completes, so the components inside
                mount at once.
            debounce: How long a change of params waits for the next one before loading.
                Default: 150 ms.
            refresh_interval: Loads again this long after the last load ended; it pauses
                while the page is hidden. In ms.
            accumulate: Merge each completed load into the table on screen instead of
                replacing it: with key, a re-sent row updates in place and new keys append;
                without, rows append in arrival order. {maxRows} keeps the newest rows. New
                params start a fresh table, and a url's {version} placeholder asks for rows
                since the result on screen. Default: False.
            refresh: Each change of its value loads again with the same params (a Button's
                count works: refresh={input("reload")}).
            snapshot: Whether exported HTML embeds the last result and never fetches; false
                loads when the exported page opens. Default: True.
            name: The provider's name in its status.
        """
    def update(self, *,
        url: str = ...,
        format: TypingLiteral["arrow", "json", "csv", "parquet"] = ...,
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
    ) -> Self: ...
    params: dict[str, Any]
    async def refresh(self, *, view: Any = ..., timeout: float = ...) -> None: ...
    def on_event(self, event: TypingLiteral["click", "dblclick", "pointermove", "pointerenter", "pointerleave", "contextmenu",
        "camerachange", "viewportchange", "load", "error"], callback: _Callback) -> _Callback: ...

class Interaction(Node):
    def __init__(self, *children: Node,
        columns: dict[str, SelectionResource] = ...,
    ) -> None:
        """Names selections as columns ("@focus") that the filters and channels inside it read.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            # Clicked points join the selection; Interaction names it @focus, a column the Filter reads.
            focus = hm.selection()
            with hm.Data(data) as table:
                with hm.Interaction(columns={"@focus": focus}):
                    with hm.Plot(height=300, axes2d=True):
                        hm.Points(x="x", y="y", select=focus, size=4)
                        # The Interaction names the selection's column: a Filter reads it.
                        with hm.Filter(where="@focus", inactive="none"):
                            hm.Points(x="x", y="y", size=8, fill="#e0245e")
            table

        Args:
            columns: Column names, each starting with @ ("@focus"), mapped to the
                selection() they read: 1 on the selection's rows, 0 elsewhere.
        """
    def update(self, *,
        columns: dict[str, SelectionResource] = ...,
    ) -> Self: ...

class Filter(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        inactive: TypingLiteral["none", "all"] = ...,
        where: str | Sequence[str | Expression | FilterCondition] | Expression | SelectionResource | FilterCondition = ...,
    ) -> None:
        """Keeps the rows that meet a condition, or the selected or brushed rows.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4, 5, 6], "y": [3, 1, 4, 1, 5, 2]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Filter(where=hm.col.y > 2):
                    hm.Points(x="x", y="y")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            inactive: What a condition on a selection or brush keeps while nothing is
                selected or brushed: every row, or none. Default: "all".
            where: The rows to keep: an interaction column such as "@brushed", a comparison
                {field, op, value} (op eq, ne, lt, lte, gt, gte, in or finite), a selection, an
                expression with one value per row such as `greater(col.x, mean(col.x))`, or a
                list of these that must all hold.
        """
    def update(self, *,
        name: str = ...,
        inactive: TypingLiteral["none", "all"] = ...,
        where: str | Sequence[str | Expression | FilterCondition] | Expression | SelectionResource | FilterCondition = ...,
    ) -> Self: ...

class Sort(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        order: TypingLiteral["asc", "desc"] = ...,
    ) -> None:
        """Orders the rows by one or more columns, so a line connects them in that order.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [3, 1, 4, 2, 5], "y": [2, 1, 4, 3, 5]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Sort(by="x"):
                    hm.Line(x="x", y="y")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            by: The column or columns to sort by, the first first; rows that tie keep their
                order.
            order: Ascending or descending; missing values go last either way. Default:
                "asc".
        """
    def update(self, *,
        name: str = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        order: TypingLiteral["asc", "desc"] = ...,
    ) -> Self: ...

class Shift(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        field: str | Expression = ...,
        interval: str | float = ...,
        as_: ShiftAsOptions = ...,
    ) -> None:
        """Shift a numeric or datetime coordinate by a numeric or UTC calendar interval.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"day": [0, 1, 2, 3, 4], "value": [2, 4, 3, 6, 5]}
            with hm.Plot(data=data, height=300, x={"label": "Day"}, y={"label": "Value"}) as plot:
                with hm.Shift(field="day", interval=1):
                    hm.Line(x="original", y="value", color="#2468a0", name="original")
                    hm.Line(x="shifted", y="value", color="#d34b37", name="shifted")
            plot

        Args:
            name: Names this transform for handle updates.
            field: Numeric or datetime column to offset without reordering rows.
            interval: Coordinate offset, or a signed UTC calendar interval such as -1 year;
                numeric datetime offsets are milliseconds.
            as_: Names for the shifted coordinate and unchanged copy. Default:
                {"shifted":"shifted","original":"original"}.
        """
    def update(self, *,
        name: str = ...,
        field: str | Expression = ...,
        interval: str | float = ...,
        as_: ShiftAsOptions = ...,
    ) -> Self: ...

class Group(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        columns: dict[str, Expression] = ...,
        as_: dict[str, str] = ...,
    ) -> None:
        """One row per value (or combination of values) of the `by` columns, with the group's
        count, sums, means or other reductions.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {
                "fruit": ["apple", "pear", "apple", "plum", "pear", "apple"],
                "amount": [3, 5, 2, 4, 1, 6],
            }
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Group(by="fruit", columns={"total": hm.sum("amount")}):
                    hm.charts.Bar(x="fruit", y="total")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            by: The columns whose values form the groups, and bins or hexagons: bin("x", 20)
                (Python hm.bin("x", 20)) groups the rows by their bin of x and writes its edges
                and center, x0, x1 and x; hexbin("x", "y") groups them by hexagon and writes its
                center, x and y. The output keeps them, one row per group with a visible row,
                with a count column. Without by, one row of totals over the visible rows (a
                count of 0 when none is).
            columns: Columns to compute over each group's rows besides count, each a
                reduction expression as in Calculate: {mean_x: mean("x")}, Python {"mean_x":
                hm.mean("x")}. Every reduction (mean, sum, count, median, ...) reduces the
                group's visible rows; a column read outside one must be a key.
            as_: New names for the output columns, such as {count: "n"}.
        """
    def update(self, *,
        name: str = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        columns: dict[str, Expression] = ...,
        as_: dict[str, str] = ...,
    ) -> Self: ...

class Stack(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        x: str = ...,
        y: str | Sequence[float | bool] | np.ndarray = ...,
        series: str | Expression = ...,
        order: TypingLiteral["none", "asc", "desc", "appearance", "insideOut", "reverse"] | Sequence[str | float | bool] = ...,
        offset: TypingLiteral["zero", "expand", "center", "wiggle"] = ...,
        as_: dict[str, str] = ...,
    ) -> None:
        """Stacks values on one another, for stacked bars and areas, 100% stacks and streamgraphs.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {
                "region": ["North", "North", "South", "South", "East", "East"],
                "product": ["A", "B", "A", "B", "A", "B"],
                "sales": [3, 2, 4, 1, 2, 3],
            }
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Stack(x="region", y="sales", series="product"):
                    hm.charts.Bar(x="region", y="y1", baseline="y0", fill="product")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            x: The column whose values make the stacks: rows with the same x stack together;
                without it, every row is in one stack.
            y: The values to stack; each row gets y0 and y1, the bottom and top of its
                segment.
            series: The column naming each row's layer; within a stack, rows are ordered by
                series, then by row.
            order: The order of the series in each stack: "none" (their own), "appearance"
                (by where each peaks), "asc" or "desc" (by total), "insideOut" (the largest in
                the middle, for streamgraphs), "reverse", or a list of categories. Every order
                but "none" and "reverse" needs series. Default: "none".
            offset: Where each stack sits: "zero" stacks positive values up from 0 and
                negative ones down, "expand" scales each stack to span 0 to 1 (100% stacks),
                "center" centers it on 0, and "wiggle" makes a streamgraph (needs series).
                center and wiggle need non-negative values. Default: "zero".
            as_: New names for the y0 and y1 columns, such as {y0: "low", y1: "high"}.
        """
    def update(self, *,
        name: str = ...,
        x: str = ...,
        y: str | Sequence[float | bool] | np.ndarray = ...,
        series: str | Expression = ...,
        order: TypingLiteral["none", "asc", "desc", "appearance", "insideOut", "reverse"] | Sequence[str | float | bool] = ...,
        offset: TypingLiteral["zero", "expand", "center", "wiggle"] = ...,
        as_: dict[str, str] = ...,
    ) -> Self: ...

class Rect(Node):
    def __init__(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> None:
        """Rectangles given by their edges, one per row: bars, bins, tiles.

        Example:
            import hmplot as hm

            data = {"x0": [0, 2, 4], "x1": [1, 3, 5], "y0": [0, 1, 0], "y1": [2, 3, 1]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1")
            plot

        Args:
            x0: Each rectangle's left edge: a column, per-row values, or one number.
            x1: Each rectangle's right edge; a rectangle whose x1 is less than its x0 is not
                drawn.
            y0: Each rectangle's bottom edge.
            y1: Each rectangle's top edge; a rectangle whose y1 is less than its y0 is not
                drawn.
            z0: Each box's bottom in a 3D plot: with z1, the rectangles become solid boxes.
            z1: Each box's top in a 3D plot; give both z0 and z1, or neither.
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            fill: The fill color: a CSS color, or a column of numbers or categories mapped
                to colors. Default: the theme's first palette color (#3478c7 in the default
                theme).
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            outline_color: The outline's color: a CSS color, or a column of categories
                mapped through outline_color_scale.
            outline_opacity: Border opacity from 0 to 1: a number, numeric column, array or
                expression. Fades the border over the fill; mark opacity still applies to both.
                Missing values hide the border. Default: 1.
            outline_width: The outline's width in CSS pixels, drawn inside the mark's edge
                (a point's at most its radius). Default: 0.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            outline_color_scale: A categorical() scale from the outline_color column's
                categories to colors.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            rotation: Turns each rectangle about its center. Default: 0 degrees.
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            lit: Shade the mark with the plot's lights. Default: False.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> Self: ...

class Prism(Node):
    def __init__(self, *,
        x_offset: Channel = ...,
        y_offset: Channel = ...,
        x0: Channel = ...,
        x1: Channel = ...,
        y0: Channel = ...,
        y1: Channel = ...,
        z0: Channel = ...,
        z1: Channel = ...,
        depth: Channel = ...,
        axis: TypingLiteral["x", "y", "z"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        rotation: Channel = ...,
        shape: TypingLiteral["circle", "triangle", "hexagon", "rectangle"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> None:
        """3D columns (boxes, triangular, hexagonal or round prisms), one per row, extruded along
        an axis.

        Example:
            import hmplot as hm

            data = {"x": [0, 2, 0, 2], "y": [0, 0, 2, 2], "value": [1, 3, 2, 4]}
            with hm.Plot(data=data, type="3d", height=300, axes3d=True) as plot:
                hm.Prism(x="x", y="y", z0=0, z1="value")
            plot

        Args:
            x_offset: Moves each row along x in data units: on a categorical axis a band is
                one unit, so 0.25 is a quarter of the category's band (grouped bars, dodged
                points). A number or a column. dx moves by CSS pixels. Default: 0 data.
            y_offset: Moves each row along y in data units: on a categorical axis a band is
                one unit (side-by-side horizontal bars). A number or a column. dy moves by CSS
                pixels. Default: 0 data.
            x0: Where each prism starts along x, when axis is "x".
            x1: Where each prism ends along x, when axis is "x".
            y0: Where each prism starts along y, when axis is "y".
            y1: Where each prism ends along y, when axis is "y".
            z0: Where each prism starts along z: its base, with the default axis.
            z1: Where each prism ends along z: its top, with the default axis.
            depth: The footprint's size along the second of the other two axes (y for the
                default axis): a number or a column. Default: 1 data units.
            axis: The axis each prism extends along: z, from z0 to z1, or x (x0 to x1) or y
                (y0 to y1). Default: "z".
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            x: The center of each footprint on x: a column, per-row values, or one value
                (with axis="x", x0 and x1 instead).
            y: The center of each footprint on y (with axis="y", y0 and y1 instead).
            z: The center of each footprint on z, when axis is "x" or "y".
            fill: The fill color: a CSS color, or a column of numbers or categories mapped
                to colors. Default: the theme's first palette color (#3478c7 in the default
                theme).
            width: The footprint's size along the first of the other two axes (x for the
                default axis): a number or a column. Default: 1 data units.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            width_scale: A scale for width that marks can share, as size_scale.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            rotation: The footprint's turn about the extrusion axis: a number or a column.
                Default: 0 degrees.
            shape: The footprint's shape, stretched to width by depth. Default: "rectangle".
            shape_scale: A categorical() scale from the shape column's categories to shape
                names.
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            lit: Shade the mark with the plot's lights. Default: False.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
        x_offset: Channel = ...,
        y_offset: Channel = ...,
        x0: Channel = ...,
        x1: Channel = ...,
        y0: Channel = ...,
        y1: Channel = ...,
        z0: Channel = ...,
        z1: Channel = ...,
        depth: Channel = ...,
        axis: TypingLiteral["x", "y", "z"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        rotation: Channel = ...,
        shape: TypingLiteral["circle", "triangle", "hexagon", "rectangle"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> Self: ...

class Facet(Node):
    def __init__(self, *children: Node,
        cache_size: float = ...,
        layout: TypingLiteral["bands", "grid"] = ...,
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
        triangle: TypingLiteral["full", "upper", "lower"] = ...,
        diagonal: bool = ...,
        as_: FacetAsValue | FacetAsX = ...,
        scales: TypingLiteral["shared", "field", "free-x", "free-y", "free-z", "free"] = ...,
        resolve: Any = ...,
        link: TypingLiteral["auto", "none", "xy", "x", "y", "grid"] = ...,
        legend: bool | TypingLiteral["cell"] | FacetLegendOptions = ...,
        title: str = ...,
        subtitle: str = ...,
        caption: str = ...,
        filename: str = ...,
        export_options: Any = ...,
        schema: Any = ...,
    ) -> None:
        """Small multiples: one cell per category, per field, or per pair of fields (a scatterplot
        matrix).

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {
                "x": [1, 2, 3, 4, 1, 2, 3, 4],
                "y": [3, 1, 4, 2, 2, 4, 1, 3],
                "group": ["a", "a", "a", "a", "b", "b", "b", "b"],
            }
            with hm.Facet(data=data, column="group") as facet:
                with hm.Plot(height=300, axes2d=True):
                    hm.Points(x="x", y="y")
            facet

        Args:
            cache_size: How many offscreen cells stay mounted besides the visible ones; 0
                keeps none. Default: 64.
            layout: In a Facet inside a Plot, how the cells divide the plot: "bands" along
                the split dimension (the other dimension is the Plot's), or "grid", each cell
                with its own x and y. Default: "grid" with fields or pairs, else "bands".
            band_padding: The space between bands in the "bands" layout, as a fraction of a
                band. Default: 0.1.
            data: A table or live pipeline output for the cells; the same as wrapping the
                Facet in Data.
            key: The column, or columns, that identify each row of data across updates, as
                on Data.
            name: The grid's name in its settings pane. Default: "Facet".
            settings: showTrigger: false hides the grid's settings and export buttons;
                showExport: false hides its export button and its cells' Export menu entry;
                menu: false leaves the browser's own context menu on its cells.
            row: A categorical column: one row of cells per value.
            column: A categorical column: one column of cells per value.
            wrap: The most cells across before the grid wraps, when only one dimension
                splits the cells.
            gap: Space between the cells. Default: 16 px.
            row_order: The rows to show, in order: values of row (a numeric row column needs
                this), or fields with fields or pairs. Rows with other values are left out.
                Default: the column's category order.
            column_order: The columns to show, in order, as row_order. Default: the column's
                category order.
            fields: One cell per field, over the same rows: in each cell the column value is
                that field and field holds its name. A list lays the cells along columns; {row:
                [...]} stacks them.
            pairs: A scatterplot matrix: each cell's x and y are two of these fields; {x:
                [...], y: [...]} makes a rectangular one. It cannot combine with row, column or
                fields.
            triangle: With a list of pairs, the cells of the whole matrix or of its upper or
                lower triangle. Default: "full".
            diagonal: With pairs, whether to draw the cells that pair a field with itself.
                Default: True.
            as_: New names for the columns the cells alias ({value, field} with fields, {x,
                y} with pairs), when the table has columns of those names.
            scales: How the cells share axis domains: "shared", one per axis; "field", one
                per plotted column; "free-x", "free-y", "free-z" or "free", each cell its own.
                Default: "field" with fields or pairs, else "shared".
            resolve: Whether each appearance scale is "shared" across the cells or
                "independent" in each. Default: "shared" for each.
            link: Pan and zoom the cells together along x, y or both; "grid" links x down
                each column and y along each row; "none" keeps each cell's own. "auto" links the
                axes the cells share (not free in scales), which the grid labels once, on its
                outer cells. A Facet inside a Plot shares its camera and takes "none" (or
                "auto"). Default: "auto".
            legend: One legend for the whole grid, explaining what the marks map from data
                and listing the labeled marks: true or {position} shows it, false hides it even
                when the cells ask for one, "cell" gives each cell its own. Default: the cells'
                legend around the grid (by default, a legend for each color mapped from a
                category column).
            title: A title above the grid, part of it on screen and in its exports.
            subtitle: A line under the title, smaller and lighter.
            caption: A note under the grid, such as its source, smaller and lighter.
            filename: Save an export to this file when the Facet's with block closes; the
                suffix picks PNG, SVG, PDF or HTML.
            export_options: Options for that export, such as scale for PNG or mode and width
                for SVG and PDF; needs filename.
            schema: Column types for data, such as {"day": "datetime"}, as on Data.
        """
    def update(self, *,
        cache_size: float = ...,
        layout: TypingLiteral["bands", "grid"] = ...,
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
        triangle: TypingLiteral["full", "upper", "lower"] = ...,
        diagonal: bool = ...,
        as_: FacetAsValue | FacetAsX = ...,
        scales: TypingLiteral["shared", "field", "free-x", "free-y", "free-z", "free"] = ...,
        resolve: Any = ...,
        link: TypingLiteral["auto", "none", "xy", "x", "y", "grid"] = ...,
        legend: bool | TypingLiteral["cell"] | FacetLegendOptions = ...,
        title: str = ...,
        subtitle: str = ...,
        caption: str = ...,
        filename: str = ...,
        export_options: Any = ...,
        schema: Any = ...,
    ) -> Self: ...

class Partition(Node):
    def __init__(self, *children: Node,
        by: str | Sequence[str | Expression] | Expression = ...,
        limit: float = ...,
        legend_groups: bool = ...,
        name: str = ...,
    ) -> None:
        """Repeats its children once per group of rows, all in the same frame: one line, fit or
        density per group.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {
                "x": [1, 2, 3, 4, 1, 2, 3, 4],
                "y": [3, 1, 4, 2, 2, 4, 1, 3],
                "group": ["a", "a", "a", "a", "b", "b", "b", "b"],
            }
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Partition(by="group"):
                    hm.Line(x="x", y="y")
            plot

        Args:
            by: The column, or columns, whose values split the rows into groups; the
                children repeat once per group, in the column's order. Rows missing a value form
                a last "(missing)" group.
            limit: The most groups Partition mounts; more is an error. Default: 256.
            legend_groups: One legend entry per group, labelled by its value, instead of one
                per mark. Default: False.
            name: The partition's name in the settings pane, where each group's marks are
                listed under it. Default: "Partition".
        """
    def update(self, *,
        by: str | Sequence[str | Expression] | Expression = ...,
        limit: float = ...,
        legend_groups: bool = ...,
        name: str = ...,
    ) -> Self: ...

class Dodge(_Pipeline):
    def __init__(self, *children: Node,
        mode: TypingLiteral["grid", "collision"] = ...,
        columns: float | Expression = ...,
        count: str = ...,
        name: str = ...,
        x: str = ...,
        y: str = ...,
        axis: TypingLiteral["auto", "x", "y"] = ...,
        as_: str = ...,
        padding: float = ...,
        seed: float = ...,
    ) -> None:
        """Moves overlapping points apart, for a beeswarm, or lays out one unit per row in a grid,
        for a unit (waffle) chart.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"value": [1, 1.1, 1.2, 2, 2.05, 2.1, 2.15, 3, 3.1, 4]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Dodge(x="value"):
                    hm.Points(x="value", y=0)
            plot

        Args:
            mode: "collision" offsets the points of one point mark so they do not overlap;
                "grid" lays out units in rows of `columns` cells: each unit gets x and y (its
                cell's center), x0, x1, y0 and y1. Default: "collision".
            columns: In grid mode, how many cells each row of units has. Default: 10.
            count: In grid mode, how many units each row makes (whole numbers). Default: one
                unit per row.
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            x: The points' x column: with axis "y", their positions; with axis "x", groups
                whose points are laid out separately.
            y: The points' y column: with axis "x", their positions; with axis "y", groups
                whose points are laid out separately, such as one row per category.
            axis: The direction points move to clear each other: "x", "y", or "auto": across
                a categorical x (or a lone y), otherwise along y. The point mark inside takes
                the offsets itself. Default: "auto".
            as_: The name of the offset column, in pixels; a point mark may still give it as
                dy (or dx). Default: "offset".
            padding: The gap between neighboring points. Default: 1 px.
            seed: The random seed of the order in which points are placed. Default: 42.
        """
    def update(self, *,
        mode: TypingLiteral["grid", "collision"] = ...,
        columns: float | Expression = ...,
        count: str = ...,
        name: str = ...,
        x: str = ...,
        y: str = ...,
        axis: TypingLiteral["auto", "x", "y"] = ...,
        as_: str = ...,
        padding: float = ...,
        seed: float = ...,
    ) -> Self: ...

class InputContext(Node):
    def __init__(self, *children: Node) -> None:
        """A scope for inputs: everything inside it reads the inputs inside it by name (a Python
        Scene is one already).

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.InputContext() as inputs:
                hm.Slider(name="size", min=1, max=10, value=4)
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Points(x="x", y="y", size=hm.input.size)
            inputs
        """
    def update(self) -> Self: ...

class TextInput(Input):
    def __init__(self, *,
        value: str = ...,
        placeholder: str = ...,
        name: str = ...,
        label: str = ...,
    ) -> None:
        """Text edited by the viewer, updated on each keystroke.

        Example:
            import hmplot as hm

            data = {"x": [1, 3, 5, 7, 9], "y": [2, 4, 1, 5, 3]}
            with hm.Scene() as scene:
                hm.TextInput(name="caption", value="My observations", placeholder="Plot title")
                with hm.Plot(data=data, height=300, axes2d=True, title=hm.input.caption):
                    hm.Points(x="x", y="y", size=12)
            scene

        Args:
            value: The initial text. Default: "".
            placeholder: A hint shown while the input is empty.
            name: The name readers use (input("name"), hm.input.name, or "$name" where a
                string names a column): an identifier, unique in its input context.
            label: The text shown beside the control. Default: the name.
        """
    def update(self, *,
        value: str = ...,
        placeholder: str = ...,
        name: str = ...,
        label: str = ...,
    ) -> Self: ...

class ColorPicker(Input):
    def __init__(self, *,
        value: str = ...,
        name: str = ...,
        label: str = ...,
    ) -> None:
        """An opaque RGB color selected with the browser color picker.

        Example:
            import hmplot as hm

            data = {"x": [1, 3, 5, 7, 9], "y": [2, 4, 1, 5, 3]}
            with hm.Scene() as scene:
                hm.ColorPicker(name="ink", value="#4f7dff")
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Points(x="x", y="y", size=12, fill=hm.input.ink)
            scene

        Args:
            value: A six-digit hexadecimal color; the value is lowercase #rrggbb. Default:
                "#000000".
            name: The name readers use (input("name"), hm.input.name, or "$name" where a
                string names a column): an identifier, unique in its input context.
            label: The text shown beside the control. Default: the name.
        """
    def update(self, *,
        value: str = ...,
        name: str = ...,
        label: str = ...,
    ) -> Self: ...

class DateTimeInput(Input):
    def __init__(self, *,
        value: datetime.date = ...,
        min: datetime.date = ...,
        max: datetime.date = ...,
        step: float = ...,
        timezone: str = ...,
        name: str = ...,
        label: str = ...,
    ) -> None:
        """A date and time edited in a chosen time zone, held as a Date or null.

        Example:
            from datetime import datetime, timezone
            import hmplot as hm

            data = {"x": [1, 3, 5, 7, 9], "y": [2, 4, 1, 5, 3]}
            with hm.Scene() as scene:
                hm.DateTimeInput(name="cutoff", value=datetime(2024, 6, 1, 12, tzinfo=timezone.utc), timezone="UTC")
                with hm.Plot(data=data, height=300, axes2d=True, title="Cutoff: {$cutoff}"):
                    hm.Points(x="x", y="y", size=12)
            scene

        Args:
            value: The initial instant; omitted or null leaves the input empty.
            min: The earliest allowed instant.
            max: The latest allowed instant.
            step: The step in milliseconds. Default: 60000.
            timezone: The editing time zone: an IANA name, UTC, or Local. Default: "UTC".
            name: The name readers use (input("name"), hm.input.name, or "$name" where a
                string names a column): an identifier, unique in its input context.
            label: The text shown beside the control. Default: the name.
        """
    def update(self, *,
        value: datetime.date = ...,
        min: datetime.date = ...,
        max: datetime.date = ...,
        step: float = ...,
        timezone: str = ...,
        name: str = ...,
        label: str = ...,
    ) -> Self: ...

class Slider(Input):
    def __init__(self, *,
        min: float | Expression | datetime.date = ...,
        max: float | Expression | datetime.date = ...,
        step: str | float | CalendarInterval = ...,
        value: float | Sequence[float] | Sequence[datetime.date] | Expression | datetime.date = ...,
        format: str = ...,
        timezone: str = ...,
        name: str = ...,
        label: str = ...,
    ) -> None:
        """A number, date or two-endpoint interval the viewer drags between min and max, read by
        name.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 2, 3, 3, 3, 4, 4, 5, 7]}
            with hm.Scene() as scene:
                hm.Slider(name="bins", min=1, max=10, step=1, value=4)
                with hm.Plot(data=data, height=300, axes2d=True):
                    with hm.stats.Bin(x="x", bins=hm.input.bins):
                        hm.Rect(x0="x0", x1="x1", y0=0, y1="count")
            scene

        Args:
            min: The low end of the range: a number, a Date, or an expression such as
                min("x") over the data around the slider. Default: 0.
            max: The high end of the range: a number, a Date, or an expression such as
                max("x"). Default: 1.
            step: The distance between values; over Dates, a calendar interval such as "1
                month" (which lands on month starts) or milliseconds. Default: any value.
            value: The initial value, or [lower, upper] for two thumbs selecting an
                interval. Endpoints are sorted and clamped to min/max; an expression reads the
                data. Default: min.
            format: How the value is shown: a d3-format string such as ".2f", a %-pattern
                such as "%b %Y" over Dates, or (in JavaScript) a function. Default: a numeric
                step's decimals, else 4 significant digits (12,346); over Dates, by the step, as
                an axis labels them.
            timezone: Over Dates, the time zone its steps and labels are in: an IANA name,
                "UTC" or "Local". Default: the zone of the datetime column min or max reads,
                else UTC.
            name: The name readers use (input("name"), hm.input.name, or "$name" where a
                string names a column): an identifier, unique in its input context.
            label: The text shown beside the control. Default: the name.
        """
    def update(self, *,
        min: float | Expression | datetime.date = ...,
        max: float | Expression | datetime.date = ...,
        step: str | float | CalendarInterval = ...,
        value: float | Sequence[float] | Sequence[datetime.date] | Expression | datetime.date = ...,
        format: str = ...,
        timezone: str = ...,
        name: str = ...,
        label: str = ...,
    ) -> Self: ...

class Checkbox(Input):
    def __init__(self, *,
        value: bool = ...,
        name: str = ...,
        label: str = ...,
    ) -> None:
        """True or false, set by the viewer and read by name.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Scene() as scene:
                hm.Checkbox(name="line")
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Points(x="x", y="y")
                    hm.Line(x="x", y="y", visible=hm.input.line)
            scene

        Args:
            value: The value before the viewer sets it. Default: False.
            name: The name readers use (input("name"), hm.input.name, or "$name" where a
                string names a column): an identifier, unique in its input context.
            label: The text shown beside the control. Default: the name.
        """
    def update(self, *,
        value: bool = ...,
        name: str = ...,
        label: str = ...,
    ) -> Self: ...

class Button(Input):
    def __init__(self, *,
        value: float = ...,
        name: str = ...,
        label: str = ...,
        set: Sequence[InputWrite] | InputWrite = ...,
    ) -> None:
        """Counts the viewer's presses, so a prop that acts on each change of its value (reset=,
        refresh=) acts on each press; with set, a press writes other inputs (back to the top of
        a drill-down).

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4, 5, 6, 7, 8], "y": [3, 1, 4, 1, 5, 9, 2, 6]}
            # Each press adds one to the button's value, so the Sample draws with a new seed.
            with hm.Scene() as scene:
                hm.Button(name="draw")
                with hm.Plot(data=data, height=300, axes2d=True):
                    with hm.Sample(size=4, seed=hm.input.draw):
                        hm.Points(x="x", y="y")
            scene

        Args:
            value: The count before the first press. Default: 0.
            name: The name readers use (input("name"), hm.input.name, or "$name" where a
                string names a column): an identifier, unique in its input context. Optional
                with set.
            label: The text shown beside the control (needed with set and no name). Default:
                the name.
            set: Inputs a press writes: input("root").reset() restores root's default,
                input("root").set(literal("all")) sets a constant; a list writes several.
        """
    def update(self, *,
        value: float = ...,
        name: str = ...,
        label: str = ...,
        set: Sequence[InputWrite] | InputWrite = ...,
    ) -> Self: ...

class Select(Input):
    def __init__(self, *,
        options: Sequence[str | float | bool | datetime.date] | Expression | dict[str, str | float | bool | datetime.date] = ...,
        multiple: bool = ...,
        value: str | float | bool | Sequence[str | float | bool | datetime.date] | datetime.date = ...,
        name: str = ...,
        label: str = ...,
    ) -> None:
        """One or several options, chosen by the viewer and read by name; a Select of column names
        picks what a channel plots.

        Example:
            import hmplot as hm

            data = {"a": [1, 2, 3, 4], "b": [4, 2, 3, 1], "y": [3, 1, 4, 2]}
            # "$column" reads the input where a string names a column: x plots the chosen one.
            with hm.Scene() as scene:
                hm.Select(name="column", options=["a", "b"])
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Points(x="$column", y="y")
            scene

        Args:
            options: The choices: a list of values, labels and their values, or
                categories("field") or columnNames() read from the data around it.
            multiple: Allow several choices; the value is a list usable with is_in(column,
                input("name")). Default: False.
            value: The chosen value, or list of values when multiple is true. Default: the
                first option, or an empty list when multiple.
            name: The name readers use (input("name"), hm.input.name, or "$name" where a
                string names a column): an identifier, unique in its input context.
            label: The text shown beside the control. Default: the name.
        """
    def update(self, *,
        options: Sequence[str | float | bool | datetime.date] | Expression | dict[str, str | float | bool | datetime.date] = ...,
        multiple: bool = ...,
        value: str | float | bool | Sequence[str | float | bool | datetime.date] | datetime.date = ...,
        name: str = ...,
        label: str = ...,
    ) -> Self: ...

class Playback(Input):
    def __init__(self, *,
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
    ) -> None:
        """A slider with play, pause and reset buttons that moves its value over time, read by
        name.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            # Play shows the points up to x = until, one more each second.
            with hm.Scene() as scene:
                hm.Playback(name="until", min=1, max=4, step=1)
                with hm.Plot(data=data, height=300, axes2d=True, x={"domain": [0, 5]}, y={"domain": [0, 5]}):
                    with hm.Filter(where=hm.col.x <= hm.input.until):
                        hm.Points(x="x", y="y")
            scene

        Args:
            rate: How fast play moves the value, in value units per second; over Dates, a
                calendar interval per second ("1 day") or milliseconds per second. Default: 1.
            loop: Wraps back to min at max instead of stopping. Default: False.
            autoplay: Starts playing when it mounts, unless the viewer prefers reduced
                motion. Default: False.
            playing: Plays (true) or pauses (false) it from code; Python has play() and
                pause().
            reset: Each change of its value returns it to its first value (a Button's count
                works); Python has reset().
            min: The low end of the range: a number, a Date, or an expression such as
                min("t") over the data around it. Default: 0.
            max: The high end of the range: a number, a Date, or an expression such as
                max("t"). Default: 1.
            step: The distance between values: play moves one step every step/rate seconds,
                or every frame without one. Over Dates, a calendar interval such as "1 month" or
                milliseconds. Default: any value.
            value: The first value, where play starts and reset returns; an expression reads
                it from the data. Default: min.
            format: How the value is shown: a d3-format string such as ".2f", a %-pattern
                such as "%b %Y" over Dates, or (in JavaScript) a function. Default: a numeric
                step's decimals, else 4 significant digits (12,346); over Dates, by the step, as
                an axis labels them.
            timezone: Over Dates, the time zone its steps and labels are in: an IANA name,
                "UTC" or "Local". Default: the zone of the datetime column min or max reads,
                else UTC.
            name: The name readers use (input("name"), hm.input.name, or "$name" where a
                string names a column): an identifier, unique in its input context.
            label: The text shown beside the control. Default: the name.
        """
    def update(self, *,
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
    ) -> Self: ...
    playing: bool
    def play(self) -> None: ...
    def pause(self) -> None: ...
    def reset(self) -> None: ...

class Simulate(Node):
    def __init__(self, *children: Node,
        name: str = ...,
        initial: dict[str, str | float | Expression] = ...,
        update: dict[str, str | float | Expression] = ...,
        step: float = ...,
        max_steps: float = ...,
        stop: SimulateStopOptions = ...,
        running: bool = ...,
        reset: str | float = ...,
    ) -> None:
        """Per-row state, such as positions and velocities, stepped at a fixed interval for the
        marks inside it to draw.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            radius, speed = hm.row() + 1, 3 - hm.row()
            # Each step, a row's angle moves on by its speed (radians per second) times the step.
            angle = hm.prev.angle + speed * hm.view.dt / 1000
            with hm.Data(rows=3) as table:
                hm.Checkbox(name="running", label="Run simulation", value=False)
                with hm.Simulate(initial={"angle": 0}, update={"angle": angle}, running=hm.input.running):
                    with hm.Plot(height=300, axes2d=True, x={"domain": [-4, 4]}, y={"domain": [-4, 4]}):
                        hm.Points(x=radius * hm.cos(hm.col.angle), y=radius * hm.sin(hm.col.angle))
            table

        Args:
            name: The simulation's name in its status.
            initial: Each state column's first value: a column name, a number, or an
                expression over the data's columns. Rows that arrive later start from it too.
            update: Each state column's next value, reading the previous step (prev("x"),
                Python hm.prev.x), the data's columns, the step ("@dt", Python hm.view.dt) and
                inputs. Every update reads the previous step, so their order does not matter.
            step: The simulated time one step advances; the state after n steps is the same
                at any frame rate. Default: 16 ms.
            max_steps: The most steps one frame takes, so a slow device runs behind real
                time instead of stalling. Default: 8.
            stop: Settles once no column in `columns` (default: the updated ones) changes by
                more than `tolerance` in a step, checked every `every` steps (default 30). New
                data, inputs, running or reset wake it.
            running: Plays or pauses the simulation; running={input("run")} lets a Checkbox
                do it. Under prefers-reduced-motion one that plays from the start waits until
                running changes, as a Playback's autoplay does. Default: True.
            reset: Each change of its value starts again from `initial` (a Button's count
                works: reset={input("kick")}).
        """
    def update(self, *,
        name: str = ...,
        initial: dict[str, str | float | Expression] = ...,
        update: dict[str, str | float | Expression] = ...,
        step: float = ...,
        max_steps: float = ...,
        stop: SimulateStopOptions = ...,
        running: bool = ...,
        reset: str | float = ...,
    ) -> Self: ...
    step_count: int
    running: bool
    settled: bool

class Interpolate(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        x: str = ...,
        y: str = ...,
        values: Sequence[str] = ...,
        resolution: float | Sequence[float] | Expression = ...,
        method: TypingLiteral["nearest", "auto", "linear", "bilinear", "idw"] = ...,
        bounds: InterpolateBoundsOptions = ...,
    ) -> None:
        """Fills a regular grid from scattered samples, for a heatmap, contours or a smooth line.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {
                "x": [0, 1, 2, 0, 1, 2, 0.5, 1.5],
                "y": [0, 0, 0, 2, 2, 2, 1, 1],
                "temperature": [10, 12, 15, 11, 14, 18, 13, 16],
            }
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Interpolate(x="x", y="y", values=["temperature"]):
                    hm.Heatmap(fill="temperature")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            x: The samples' x positions; the output's x column holds the grid's.
            y: The samples' y positions, for a 2D grid (the output's y column); without it
                the grid is 1D.
            values: The columns to interpolate onto the grid, each output under its own
                name; categorical ones take the nearest sample's value.
            resolution: How many grid points: a number, or [nx, ny] in 2D. Default: 256 in
                1D, [128, 128] in 2D.
            method: "linear" (1D), "bilinear" (2D samples on a complete rectangular grid),
                "idw" (inverse-distance weighting of nearby samples) or "nearest"; "auto" picks
                linear in 1D, bilinear for a complete grid and idw otherwise. Default: "auto".
            bounds: The grid's extent, as {x: [min, max], y: [min, max]}. Default: the
                samples' extent. In data units.
        """
    def update(self, *,
        name: str = ...,
        x: str = ...,
        y: str = ...,
        values: Sequence[str] = ...,
        resolution: float | Sequence[float] | Expression = ...,
        method: TypingLiteral["nearest", "auto", "linear", "bilinear", "idw"] = ...,
        bounds: InterpolateBoundsOptions = ...,
    ) -> Self: ...

class Slice(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        field: str | Expression = ...,
        at: float = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        values: Sequence[str] = ...,
    ) -> None:
        """Each entity's values at one time (or other coordinate), interpolated between its
        observations, or one slice of a grid table.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {
                "id": ["a", "a", "a", "b", "b", "b"],
                "time": [0, 1, 2, 0, 1, 2],
                "x": [1, 2, 4, 3, 2, 1],
                "y": [1, 3, 2, 4, 3, 1],
            }
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Slice(field="time", at=1.5, by="id"):
                    hm.Points(x="x", y="y")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            field: The column to slice along, such as time (on a grid table, one of its
                dimensions); in the output it holds `at`.
            at: Where to slice: each entity's values are interpolated between its
                observations on either side, and entities without one on each side are left out.
                Default: 0.
            by: The columns that identify an entity; the output has one row per entity.
            values: The columns to interpolate: numbers linearly, categories from the nearer
                observation. Default: every column but field and by.
        """
    def update(self, *,
        name: str = ...,
        field: str | Expression = ...,
        at: float = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        values: Sequence[str] = ...,
    ) -> Self: ...

class Density(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        x: str | Sequence[float | bool] | np.ndarray = ...,
        y: str | Sequence[float | bool] | np.ndarray = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        weight: str | Sequence[float | bool] | Expression | np.ndarray = ...,
        resolution: float | Sequence[float] | Expression = ...,
        bandwidth: float | TypingLiteral["auto"] | Sequence[float] | Expression = ...,
        bounds: DensityBoundsOptions = ...,
        normalization: TypingLiteral["density", "count"] = ...,
        as_: DensityAsOptions = ...,
    ) -> None:
        """A kernel density estimate of one column (a smooth histogram), or of two on a grid (a
        density heatmap).

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"value": [1.2, 2.5, 2.9, 3.1, 3.4, 3.8, 4.2, 4.4, 5.1, 6.3]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Density(x="value"):
                    hm.Line(x="x", y="density")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            x: The column whose density to estimate; the output's x column holds the points
                it is evaluated at.
            y: A second column, for a 2D density: the output is a grid of x and y that a
                Heatmap draws.
            by: Estimate one density per group of these columns, on the same points; the
                output keeps these columns.
            weight: Nonnegative weights for the rows.
            resolution: How many points to evaluate: a number, or [nx, ny] in 2D. Default:
                256 in 1D, [128, 128] in 2D.
            bandwidth: The kernel's width: "auto" uses Scott's rule; a number ([bx, by] in
                2D) or an expression such as `multiply(std(col.x), 0.3)` sets it. Default:
                "auto". In data units.
            bounds: The range to evaluate over, as {x: [min, max], y: [min, max]}. Default:
                the data's extent and three bandwidths on each side. In data units.
            normalization: What the density column holds: "density" integrates to 1 over
                each group; "count" integrates to its row count (or total weight). Default:
                "density".
            as_: New names for the x, y and density columns.
        """
    def update(self, *,
        name: str = ...,
        x: str | Sequence[float | bool] | np.ndarray = ...,
        y: str | Sequence[float | bool] | np.ndarray = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        weight: str | Sequence[float | bool] | Expression | np.ndarray = ...,
        resolution: float | Sequence[float] | Expression = ...,
        bandwidth: float | TypingLiteral["auto"] | Sequence[float] | Expression = ...,
        bounds: DensityBoundsOptions = ...,
        normalization: TypingLiteral["density", "count"] = ...,
        as_: DensityAsOptions = ...,
    ) -> Self: ...

class Pivot(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        field: str = ...,
        value: Expression = ...,
        by: str | Sequence[str] = ...,
        as_: Sequence[str] = ...,
    ) -> None:
        """A long table made wide: a row per group and a column per category of a field.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {
                "shape": ["a", "a", "b", "b", "c", "c"],
                "measure": ["width", "height", "width", "height", "width", "height"],
                "value": [1, 2, 3, 1, 2, 4],
            }
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Pivot(field="measure", value=hm.sum("value"), by="shape"):
                    hm.Points(x="width", y="height")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            field: The categorical column whose categories become the output's columns, one
                each.
            value: A numeric reduction expression filling the cells, over each group's rows
                in each category: sum("value"), mean("value") or count(). A cell with no rows
                gets a missing value.
            by: The columns that group the rows: an output row per group, with its keys (one
                row without it).
            as_: Names for the output columns, one per category of `field`, in its category
                order. Default: the categories.
        """
    def update(self, *,
        name: str = ...,
        field: str = ...,
        value: Expression = ...,
        by: str | Sequence[str] = ...,
        as_: Sequence[str] = ...,
    ) -> Self: ...

class Fold(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        fields: Sequence[str] = ...,
        as_: FoldAsOptions = ...,
    ) -> None:
        """A wide table made long: each row repeated once per chosen column, with that column's
        name and value.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"name": ["a", "b", "c"], "before": [1, 3, 2], "after": [2, 4, 1]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Fold(fields=["before", "after"]):
                    hm.Points(x="key", y="value")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            fields: The numeric columns to fold: each row appears once per column, with the
                column's name in `key` and its value in `value`.
            as_: New names for the output columns `key` and `value`.
        """
    def update(self, *,
        name: str = ...,
        fields: Sequence[str] = ...,
        as_: FoldAsOptions = ...,
    ) -> Self: ...

class Join(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        data: Any = ...,
        on: str | Sequence[str | Expression] | Expression = ...,
        left_on: str | Sequence[str | Expression] | Expression = ...,
        right_on: str | Sequence[str | Expression] | Expression = ...,
        how: TypingLiteral["left", "inner"] = ...,
        fields: Sequence[str | Expression] = ...,
        as_: dict[str, str] = ...,
    ) -> None:
        """Columns from a second table added to each row, matched by a key.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"station": ["A", "B", "C", "A", "B", "C"], "temperature": [12, 15, 9, 14, 16, 10]}
            stations = {"station": ["A", "B", "C"], "altitude": [200, 50, 900]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Join(data=stations, on="station"):
                    hm.Points(x="altitude", y="temperature")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            data: The second table, whose columns are added; a new table replans the join.
                Or a transform (a Group of the brushed rows, ...), joined live as its output
                changes.
            on: The key column both tables have, or several for a composite key.
            left_on: Instead of `on`: this table's key columns.
            right_on: Instead of `on`: the joined table's key columns, paired in order with
                `left_on`.
            how: "left" keeps every row, with missing values where no key matches; "inner"
                hides the rows with no match. Default: "left".
            fields: The joined table's columns to add. Default: every column but the key.
            as_: New names for joined columns, by their names in the joined table ({region:
                "area"}).
        """
    def update(self, *,
        name: str = ...,
        data: Any = ...,
        on: str | Sequence[str | Expression] | Expression = ...,
        left_on: str | Sequence[str | Expression] | Expression = ...,
        right_on: str | Sequence[str | Expression] | Expression = ...,
        how: TypingLiteral["left", "inner"] = ...,
        fields: Sequence[str | Expression] = ...,
        as_: dict[str, str] = ...,
    ) -> Self: ...

class Regression(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        x: str | Sequence[float | bool] | np.ndarray = ...,
        y: str | Sequence[float | bool] | np.ndarray = ...,
        method: TypingLiteral["linear", "log", "poly", "exp", "pow"] = ...,
        order: float = ...,
        samples: float = ...,
        extent: Sequence[float] = ...,
        band: float | bool = ...,
        as_: RegressionAsOptions = ...,
    ) -> None:
        """A least-squares fit of y on x, sampled across x, with its confidence band.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4, 5, 6], "y": [2, 3, 5, 4, 6, 7]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Regression(x="x", y="y"):
                    hm.Line(x="x", y="y")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            x: The column y is fitted on; the output's `x` holds `samples` positions across
                its range.
            y: The column fitted; the output's `y` is the fitted curve.
            method: The model: a line, a polynomial of `order`, y on ln x, ln y on x, or ln
                y on ln x. The log models leave out rows at zero or below, with a warning.
                Default: "linear".
            order: The polynomial's degree, 1 to 6, with method "poly". Default: 2.
            samples: How many output rows, evenly spaced across `extent`. Default: 100.
            extent: The x range the fit is sampled over. Default: the fitted rows' x range.
                In data units.
            band: The confidence level of the band around the fitted mean, in the `lower`
                and `upper` columns (Student's t); false for none, which leaves both columns
                missing. Default: 0.95.
            as_: New names for the output columns `x`, `y`, `lower` and `upper`.
        """
    def update(self, *,
        name: str = ...,
        x: str | Sequence[float | bool] | np.ndarray = ...,
        y: str | Sequence[float | bool] | np.ndarray = ...,
        method: TypingLiteral["linear", "log", "poly", "exp", "pow"] = ...,
        order: float = ...,
        samples: float = ...,
        extent: Sequence[float] = ...,
        band: float | bool = ...,
        as_: RegressionAsOptions = ...,
    ) -> Self: ...

class Contour(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        field: str = ...,
        thresholds: float | Sequence[float] = ...,
        mode: TypingLiteral["bands", "lines"] = ...,
        x: str = ...,
        y: str = ...,
    ) -> None:
        """Contour lines or filled bands of a grid, such as a 2-D density.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 2, 3, 3, 4, 5], "y": [2, 1, 3, 2, 4, 3, 4]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Density(x="x", y="y"):
                    with hm.Contour(field="density"):
                        hm.Segments(start="start", end="end")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            field: The grid table's column to contour (a Density's or an Interpolate's
                output, or a gridded dataset).
            thresholds: The levels: a count of round values across the field's range (about
                that many), or the list of levels. Default: 10.
            mode: "lines" gives a row per segment (`start`, `end`, `level`) for Segments;
                "bands" gives the regions between levels as triangles (`lower`, `upper`, `band`)
                for Polygon. Default: "lines".
            x: The grid dimension on the x axis. Default: the grid's last dimension.
            y: The grid dimension on the y axis. Default: the grid's second-to-last
                dimension.
        """
    def update(self, *,
        name: str = ...,
        field: str = ...,
        thresholds: float | Sequence[float] = ...,
        mode: TypingLiteral["bands", "lines"] = ...,
        x: str = ...,
        y: str = ...,
    ) -> Self: ...

class Delaunay(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        x: str = ...,
        y: str = ...,
    ) -> None:
        """The Delaunay triangulation of points, as edges for Segments.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [0, 2, 4, 1, 3, 2], "y": [0, 0, 0, 2, 2, 4]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Delaunay(x="x", y="y"):
                    hm.Segments(start="start", end="end")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            x: The points' x column. Each output row is an edge from `start` to `end`,
                between the rows numbered `source` and `target`.
            y: The points' y column.
        """
    def update(self, *,
        name: str = ...,
        x: str = ...,
        y: str = ...,
    ) -> Self: ...

class Voronoi(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        x: str = ...,
        y: str = ...,
        extent: Sequence[Sequence[float]] = ...,
    ) -> None:
        """Each point's Voronoi cell, as triangles for Polygon.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"name": ["a", "b", "c", "d", "e"], "x": [1, 3, 2, 4, 2.5], "y": [1, 1, 3, 3, 2]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Voronoi(x="x", y="y"):
                    hm.Polygon(fill="name")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            x: The points' x column. Each cell carries its point's row: its columns, and its
                identity for hover and selection.
            y: The points' y column.
            extent: The rectangle the cells are clipped to, [[x0, y0], [x1, y1]]. Default:
                the points' bounds, widened by a tenth of their size. In data units.
        """
    def update(self, *,
        name: str = ...,
        x: str = ...,
        y: str = ...,
        extent: Sequence[Sequence[float]] = ...,
    ) -> Self: ...

class Hull(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        x: str = ...,
        y: str = ...,
        by: str | Sequence[str] = ...,
    ) -> None:
        """The convex hull around points, one per group, as triangles for Polygon.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 3, 2, 4, 2.5, 3], "y": [1, 1, 3, 3, 2, 2.5]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Hull(x="x", y="y"):
                    hm.Polygon()
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            x: The points' x column.
            y: The points' y column.
            by: Groups, a hull each, carrying the group's first row (one hull around every
                point without it).
        """
    def update(self, *,
        name: str = ...,
        x: str = ...,
        y: str = ...,
        by: str | Sequence[str] = ...,
    ) -> Self: ...

class Sample(_Pipeline):
    def __init__(self, *children: Node,
        name: str = ...,
        size: float | Expression = ...,
        proportion: float | Expression = ...,
        seed: float = ...,
        order: TypingLiteral["data", "random"] = ...,
    ) -> None:
        """Keeps a random subset of the rows, a number or a fraction of them, in their original
        order or shuffled.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {
                "x": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                "y": [4, 7, 2, 9, 5, 3, 8, 6, 1, 10],
            }
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Sample(size=5):
                    hm.Points(x="x", y="y")
            plot

        Args:
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
            size: How many rows to keep. Default: every row, up to 1000 (every row with
                order "random").
            proportion: The fraction of the rows to keep, 0 to 1, instead of size.
            seed: The random seed: the same seed picks the same rows in the same order.
                Default: 42.
            order: "data" keeps the sampled rows in their original order; "random" puts them
                in the seed's random order, so order="random" without a size shuffles every row.
                Default: "data".
        """
    def update(self, *,
        name: str = ...,
        size: float | Expression = ...,
        proportion: float | Expression = ...,
        seed: float = ...,
        order: TypingLiteral["data", "random"] = ...,
    ) -> Self: ...

class Transform(_Pipeline):
    def __init__(self, *children: Node,
        kind: str = ...,
        params: dict[str, Any] = ...,
        name: str = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        as_: dict[str, str] = ...,
        **parameters: Any,
    ) -> None:
        """Run a registered transform or graph layout with its declared parameters.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 3, 2, 4, 2.5, 3], "y": [1, 1, 3, 3, 2, 2.5]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Transform(kind="Hull", x="x", y="y"):
                    hm.Polygon()
            plot

        Args:
            kind: The registered transform or layout kind.
            params: Parameter values keyed by the plugin's schema; Python also accepts them
                as keywords.
            name: Names the transform, including its copies in a Facet.
            by: Group input rows by these columns when the transform supports grouping.
            as_: Rename output columns: an object mapping original names to published names.
        """
    def update(self, *,
        kind: str = ...,
        params: dict[str, Any] = ...,
        name: str = ...,
        by: str | Sequence[str | Expression] | Expression = ...,
        as_: dict[str, str] = ...,
        **parameters: Any,
    ) -> Self: ...

class Calculate(_Pipeline):
    def __init__(self, *children: Node,
        columns: dict[str, Expression] = ...,
        name: str = ...,
        **outputs: Any,
    ) -> None:
        """New columns computed from expressions over the table's columns.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Calculate(total=hm.col.x + hm.col.y):
                    hm.Points(x="x", y="total")
            plot

        Args:
            columns: The new columns, a name mapped to an expression each, all computed from
                the incoming columns. Python passes each as a keyword:
                hm.Calculate(total=hm.col.a + hm.col.b).
            name: Names the transform, so a Facet's getTransform(name) reaches its copy in
                every cell.
        """
    def update(self, *,
        columns: dict[str, Expression] = ...,
        name: str = ...,
        **outputs: Any,
    ) -> Self: ...

class Force(Node):
    def __init__(self, *children: Node,
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
    ) -> None:
        """A force-directed layout of a graph's nodes and edges, simulated live.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"source": ["A", "A", "B", "C", "D"], "target": ["B", "C", "C", "D", "E"]}
            with hm.Plot(data=data, height=300) as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.Force(warmup=300):
                        with hm.Edges():
                            hm.Segments(start="start", end="end")
                        with hm.Nodes():
                            hm.Points(position="position")
            plot

        Args:
            name: Names the layout, so a Facet's settings and getTransform(name) reach it in
                every cell.
            weight: An edge column of nonnegative weights, each multiplying its link's
                spring strength.
            dimensions: Lays the graph out in two or three dimensions. Default: 2.
            seed: Seeds the random starting positions, so the same graph lays out the same
                way. Default: 42.
            repulsion: How strongly nodes push one another apart. Default: 30.
            link_distance: The length each link's spring pulls toward. Default: 30 data
                units.
            spring_strength: How strongly each link pulls its ends toward link_distance.
                Default: 0.1.
            centering: How strongly each node is pulled toward the origin. Default: 0.01.
            velocity_decay: The fraction of each node's velocity lost per tick, like
                friction. Default: 0.4.
            alpha: The simulation's heat, which scales every force and cools each tick; it
                starts at 1, so bind it to read it rather than set it. Default: 1.
            alpha_min: The layout stops once alpha cools below this. Default: 0.001.
            alpha_decay: The fraction of the way alpha moves toward alpha_target each tick.
                Default: 1 - 0.001^(1/300), about 0.0228 (d3's: 300 ticks to cool).
            alpha_target: The alpha the layout cools toward; above alpha_min it keeps
                running. Default: 0.
            forces: Named forces, as d3's (center, manyBody, link, collide, x, y, z,
                radial). An entry named like a default force updates it, one with a type
                replaces it, and null removes it. Default: charge, link, and x and y (z in 3D),
                from the options above.
            fixed: Holds nodes at coordinates from nodes-table columns, expressions or
                numbers (d3's fx, fy, fz); a non-finite value leaves that node free.
            initial: Starting coordinates from nodes-table columns, expressions or numbers;
                a non-finite value keeps that node's seeded start.
            ticks: Simulation ticks per drawn step. Default: 1.
            warmup: Ticks run before the layout is first drawn, so it appears already
                settled. Default: 0.
            running: Plays (true) or pauses (false) the layout, which otherwise starts
                paused; a Checkbox's input can drive it.
            reset: Each change of its value restarts the layout from its starting positions;
                a Button's input can drive it.
            reheat: Each change of its value reheats the layout (alpha back to 1), so it
                moves again.
            step: Each change of its value pauses the layout and advances it one step.
            release: Each change of its value frees every pinned node.
        """
    def update(self, *,
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
    ) -> Self: ...

class GraphData(Node):
    def __init__(self, *children: Node,
        nodes: Sequence[dict[str, Any]] | dict[str, Any] = ...,
        edges: Sequence[dict[str, Any]] | dict[str, Any] = ...,
        node_key: str = ...,
        source: str = ...,
        target: str = ...,
        node_from: TypingLiteral["source", "target"] = ...,
        reduce: dict[str, ReducerSpec] = ...,
    ) -> None:
        """A graph from edges, with nodes given or inferred from the edges' endpoints; ordinary
        transforms operate on the selected table.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            edges = {"source": ["A", "A", "B", "C"], "target": ["B", "C", "D", "D"]}
            nodes = {"id": ["A", "B", "C", "D"], "column": [0, 1, 1, 2], "lane": [1, 0, 2, 1]}
            with hm.GraphData(nodes=nodes, edges=edges) as plot:
                with hm.Nodes():
                    with hm.Calculate(x=hm.multiply("column", 2), y="lane"):
                        with hm.Plot(height=300):
                            with hm.Edges():
                                hm.Segments(start="start", end="end")
                            with hm.Nodes():
                                hm.Points(position="position")
            plot

        Args:
            nodes: One row per node with unique IDs, including isolated nodes. Requires
                edges. Default: inferred from the edges' endpoints.
            edges: Edge rows whose source and target values identify nodes. Default: the
                surrounding data.
            node_key: The node ID column of nodes, exposed as the canonical id alias.
                Default: "id".
            source: The edge source ID column. Default: "source".
            target: The edge target ID column. Default: "target".
            node_from: Which endpoint receives each edge row's reduce results. Default:
                "source".
            reduce: Node columns aggregated from the edge rows, mapped to {field, op}; nodes
                no edge reaches receive each reducer's empty result. Default: {}.
        """
    def update(self, *,
        nodes: Sequence[dict[str, Any]] | dict[str, Any] = ...,
        edges: Sequence[dict[str, Any]] | dict[str, Any] = ...,
        node_key: str = ...,
        source: str = ...,
        target: str = ...,
        node_from: TypingLiteral["source", "target"] = ...,
        reduce: dict[str, ReducerSpec] = ...,
    ) -> Self: ...

class DAG(Node):
    def __init__(self, *children: Node,
        orientation: TypingLiteral["left", "right", "down", "up"] = ...,
        node_width: Any = ...,
        node_height: Any = ...,
        node_gap: float = ...,
        layer_gap: float = ...,
    ) -> None:
        """A layered layout of a directed acyclic graph, with edges routed around the nodes.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"source": ["a", "a", "b", "c", "a"], "target": ["b", "c", "d", "d", "d"]}
            with hm.Plot(data=data, height=300) as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.DAG():
                        with hm.Edges():
                            hm.Routes()
                        with hm.Nodes():
                            hm.Points(position="position")
            plot

        Args:
            orientation: The direction the layers run, from sources to sinks. Default:
                "down".
            node_width: Each node's width, which the layout keeps clear: a number, or a
                nodes-table column or expression. Default: 1 data units.
            node_height: Each node's height, which the layout keeps clear: a number, or a
                nodes-table column or expression. Default: 1 data units.
            node_gap: The space between neighboring nodes in a layer. Default: 1 data units.
            layer_gap: The space between layers. Default: 1 data units.
        """
    def update(self, *,
        orientation: TypingLiteral["left", "right", "down", "up"] = ...,
        node_width: Any = ...,
        node_height: Any = ...,
        node_gap: float = ...,
        layer_gap: float = ...,
    ) -> Self: ...

class Pack(Node):
    def __init__(self, *children: Node,
        root: str | float | bool | Expression = ...,
        levels: float = ...,
        value: Any = ...,
        width: float = ...,
        height: float = ...,
        padding: float = ...,
    ) -> None:
        """A hierarchy drawn as nested circles, each leaf's area set by its value.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"source": ["root", "root", "a", "a", "a", "b", "b"],
                    "target": ["a", "b", "a1", "a2", "a3", "b1", "b2"]}
            with hm.Plot(data=data, height=300, aspect="equal") as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.Pack(root="root"):
                        with hm.Nodes():
                            hm.Points(position="position", size=hm.col.r * 2, size_units="data", fill="depth")
            plot

        Args:
            root: The ID of the node whose subtree the layout divides: the hierarchy's root,
                or any node below it (a drill-down), or an input a Select or a click sets. Nodes
                outside its subtree stay rows of the nodes table, hidden; depth counts from it
                (0).
            levels: How many levels below root to show (1: its children only); root itself
                is then left out, as its area is the whole layout. Default: every level.
            value: Each leaf's nonnegative weight, which sets its circle's area: a
                nodes-table column or an expression over it. A parent holds the sum of its
                leaves. Default: 1.
            width: The width of the area the circles fill. Default: 1 data units.
            height: The height of the area the circles fill. Default: 1 data units.
            padding: The gap between circles. Default: 0 data units.
        """
    def update(self, *,
        root: str | float | bool | Expression = ...,
        levels: float = ...,
        value: Any = ...,
        width: float = ...,
        height: float = ...,
        padding: float = ...,
    ) -> Self: ...

class Treemap(Node):
    def __init__(self, *children: Node,
        padding_inner: float = ...,
        padding_outer: float = ...,
        tile: TypingLiteral["squarify", "resquarify", "binary", "slice", "dice", "sliceDice"] = ...,
        root: str | float | bool | Expression = ...,
        levels: float = ...,
        value: Any = ...,
        width: float = ...,
        height: float = ...,
        padding: float = ...,
    ) -> None:
        """A hierarchy drawn as nested rectangles, each leaf's area set by its value.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"source": ["root", "root", "a", "a", "a", "b", "b"],
                    "target": ["a", "b", "a1", "a2", "a3", "b1", "b2"]}
            with hm.Plot(data=data, height=300) as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.Treemap(root="root", padding=0.02):
                        with hm.Nodes():
                            hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1", fill="depth")
            plot

        Args:
            padding_inner: The gap between sibling rectangles. Default: padding. In data
                units.
            padding_outer: The gap between a parent's edges and its children. Default:
                padding. In data units.
            tile: How each rectangle is split among its children, by d3's tiling methods.
                Default: "squarify".
            root: The ID of the node whose subtree the layout divides: the hierarchy's root,
                or any node below it (a drill-down), or an input a Select or a click sets. Nodes
                outside its subtree stay rows of the nodes table, hidden; depth counts from it
                (0).
            levels: How many levels below root to show (1: its children only); root itself
                is then left out, as its area is the whole layout. Default: every level.
            value: Each leaf's nonnegative weight, which sets its rectangle's area: a
                nodes-table column or an expression over it. A parent holds the sum of its
                leaves. Default: 1.
            width: The width of the rectangle the layout divides. Default: 1 data units.
            height: The height of the rectangle the layout divides. Default: 1 data units.
            padding: The gap around and between rectangles, where padding_inner and
                padding_outer do not set their own. Default: 0 data units.
        """
    def update(self, *,
        padding_inner: float = ...,
        padding_outer: float = ...,
        tile: TypingLiteral["squarify", "resquarify", "binary", "slice", "dice", "sliceDice"] = ...,
        root: str | float | bool | Expression = ...,
        levels: float = ...,
        value: Any = ...,
        width: float = ...,
        height: float = ...,
        padding: float = ...,
    ) -> Self: ...

class Sankey(Node):
    def __init__(self, *children: Node,
        value: str | Expression = ...,
        orientation: TypingLiteral["left", "right", "down", "up"] = ...,
        node_width: float = ...,
        node_padding: float = ...,
        iterations: float = ...,
        align: TypingLiteral["left", "right", "center", "justify"] = ...,
    ) -> None:
        """A flow diagram layout, with nodes in columns and links as thick as their values.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"source": ["in", "in", "a", "b"], "target": ["a", "b", "out", "out"], "value": [3, 2, 3, 2]}
            with hm.Plot(data=data, height=300) as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.Sankey(value="value"):
                        with hm.Edges():
                            hm.Flow(start_lower="startLower", end_lower="endLower",
                                    start_upper="startUpper", end_upper="endUpper")
                        with hm.Nodes():
                            hm.Rect(x0="x0", x1="x1", y0="y0", y1="y1")
            plot

        Args:
            value: The edge table's column of nonnegative flows, which set the links'
                thickness.
            orientation: The direction the flow runs. Default: "right".
            node_width: The thickness of each node's bar along the flow; the layout spans 0
                to 1. Default: 0.025 data units.
            node_padding: The gap between neighboring nodes in a column; the layout spans 0
                to 1. Default: 0.02 data units.
            iterations: Relaxation passes that straighten the links. Default: 8.
            align: Which column each node takes: its depth from the sources (left), its
                distance to the sinks (right), beside its targets for a source (center), or left
                with every sink in the last column (justify). Default: "justify".
        """
    def update(self, *,
        value: str | Expression = ...,
        orientation: TypingLiteral["left", "right", "down", "up"] = ...,
        node_width: float = ...,
        node_padding: float = ...,
        iterations: float = ...,
        align: TypingLiteral["left", "right", "center", "justify"] = ...,
    ) -> Self: ...

class Flow(Node):
    def __init__(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> None:
        """A Sankey's links drawn as bands, one per edge.

        Example:
            import hmplot as hm

            data = {"source": ["in", "in", "a", "b"], "target": ["a", "b", "out", "out"], "value": [3, 2, 3, 2]}
            with hm.Plot(data=data, height=300) as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.Sankey(value="value"):
                        with hm.Edges():
                            hm.Flow(start_lower="startLower", end_lower="endLower",
                                    start_upper="startUpper", end_upper="endUpper")
            plot

        Args:
            start_lower: Where one side of each band starts, at its source node: a column of
                positions, Sankey's start_lower.
            end_lower: Where that side ends, at the target node: a column of positions,
                Sankey's end_lower.
            start_upper: Where the other side of each band starts: a column of positions,
                Sankey's start_upper.
            end_upper: Where the other side ends: a column of positions, Sankey's end_upper.
            fill: The fill color: a CSS color, or a column of numbers or categories mapped
                to colors.
            color: The line or text color: a CSS color, or a column mapped to colors.
            size: The size of each point or label: a number, or a column mapped to sizes. In
                px.
            width: The line width: a number, or a column mapped to widths. In px.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 0.2.
            outline_color: The outline's color: a CSS color, or a column of categories
                mapped through outline_color_scale.
            outline_opacity: Border opacity from 0 to 1: a number, numeric column, array or
                expression. Fades the border over the fill; mark opacity still applies to both.
                Missing values hide the border. Default: 1.
            outline_width: The outline's width in CSS pixels, drawn inside the mark's edge
                (a point's at most its radius). Default: 0.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            color_scale: A scale for color that marks can share.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            size_scale: The size's scale, which marks can share: continuous({domain, range,
                transform}) for numbers (without a range, the automatic one), or categories with
                a numeric range.
            width_scale: A scale for width that marks can share, as size_scale.
            outline_color_scale: A categorical() scale from the outline_color column's
                categories to colors.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            interpolation: How a path between two points runs on a map or a globe: along a
                great circle, straight in longitude and latitude, or straight in space. Default:
                "great-circle".
            rotation: The symbol's rotation. Default: 0 degrees.
            shape: The point symbol: a shape name, a column of categories mapped to shapes,
                or one name per row. Default: "circle".
            shape_scale: A categorical() scale from the shape column's categories to shape
                names.
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> Self: ...

class Routes(Node):
    def __init__(self, *,
        dash: float | bool | Sequence[float] = ...,
        curve: TypingLiteral["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> None:
        """A DAG's edges drawn along their routed paths, bends included.

        Example:
            import hmplot as hm

            data = {"source": ["a", "a", "b", "c", "a"], "target": ["b", "c", "d", "d", "d"]}
            with hm.Plot(data=data, height=300) as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.DAG():
                        with hm.Edges():
                            hm.Routes()
            plot

        Args:
            dash: Dashes the lines: true (4 px dashes and gaps), a dash length (gaps as
                long), or [dash, gap], measured along the drawn path. In px.
            curve: How each piece of a route runs between its two points. Default: "linear".
            color: The line or text color: a CSS color, or a column mapped to colors.
            width: The line width: a number, or a column mapped to widths. In px.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            color_scale: A scale for color that marks can share.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            width_scale: A scale for width that marks can share, as size_scale.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            interpolation: How a path between two points runs on a map or a globe: along a
                great circle, straight in longitude and latitude, or straight in space. Default:
                "great-circle".
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
        dash: float | bool | Sequence[float] = ...,
        curve: TypingLiteral["linear", "step", "step-before", "step-after", "monotone-x", "monotone-y", "catmull-rom", "basis", "quadratic", "cubic", "link-horizontal", "link-vertical"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        interpolation: TypingLiteral["cartesian", "great-circle", "angular"] = ...,
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
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> Self: ...

class Nodes(Node):
    def __init__(self, *children: Node,
        drag: bool = ...,
    ) -> None:
        """A graph's nodes, one row each, for the marks inside to draw.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"source": ["root", "root", "a", "a", "b"], "target": ["a", "b", "a1", "a2", "b1"]}
            with hm.Plot(data=data, height=300) as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.Tree(root="root"):
                        with hm.Nodes():
                            hm.Text(position="position", text="id")
            plot

        Args:
            drag: Lets the viewer drag nodes with the pointer, in a Force layout. Default:
                False.
        """
    def update(self, *,
        drag: bool = ...,
    ) -> Self: ...

class Edges(Node):
    def __init__(self, *children: Node) -> None:
        """A graph layout's edges, one row each with start and end positions, for the marks inside
        to draw.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"source": ["root", "root", "a", "a", "b"], "target": ["a", "b", "a1", "a2", "b1"]}
            with hm.Plot(data=data, height=300) as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.Tree(root="root"):
                        with hm.Edges():
                            hm.Segments(start="start", end="end")
            plot
        """
    def update(self) -> Self: ...

class GeoJSON(Node):
    def __init__(self, *,
        data: Any = ...,
        geometry: str = ...,
        feature_key: str = ...,
        data_key: str = ...,
        height: Channel = ...,
        height_scale: ContinuousScale = ...,
        plane: TypingLiteral["xy", "xz"] = ...,
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
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> None:
        """Maps of GeoJSON regions, lines and points, colored by their properties (choropleths) and
        optionally extruded.

        Example:
            import hmplot as hm


            def polygon(value, ring):
                return {
                    "type": "Feature",
                    "properties": {"value": value},
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                }


            regions = {
                "type": "FeatureCollection",
                "features": [
                    polygon(1, [[-120, 20], [-70, 20], [-70, 55], [-120, 55], [-120, 20]]),
                    polygon(2, [[-10, 35], [40, 35], [40, 65], [-10, 65], [-10, 35]]),
                    polygon(3, [[110, -40], [155, -40], [130, -10], [110, -40]]),
                ],
            }
            with hm.Plot(coordinates="spherical", projection="mercator", height=300) as plot:
                hm.GeoJSON(data=regions, fill="value")
            plot

        Args:
            data: The shapes: a GeoJSON Geometry, Feature or FeatureCollection, in longitude
                and latitude on a map. Feature properties are columns for the channels.
            geometry: A geometry column of the enclosing data, instead of data: a
                FeatureCollection given as a Plot's or Data's table has one named "geometry".
            feature_key: The feature property that joins each feature to a row of the
                enclosing table, matched against data_key; "$id" uses feature.id.
            data_key: The column of the enclosing table matched against feature_key; each
                key may appear once.
            height: Each feature's extrusion: a number, or a property or column mapped
                through height_scale. Only polygons extrude, in 3D views. Default: 0.
            height_scale: A continuous() scale from heights to extrusions: its domain (by
                default [0, 1]) maps onto its range (by default [0, 1], nonnegative and
                increasing); heights outside the domain clamp. The map is linear: a transform, a
                midpoint or a "symmetric" domain is an error.
            plane: In a Cartesian 3D plot, "xz" lays the features on the horizontal ground
                plane and extrudes them upward. Default: "xy".
            fit: On a 2D map, zoom to the features (a city's districts fill the plot, not a
                speck in a world map); a Plot's own viewport wins. False keeps the whole map.
                Default: True.
            fill: The fill of regions and points: a CSS color, or a property or column
                mapped to colors. null (Python None) draws only lines and polygon boundaries,
                using color and width. Default: "#718b9b".
            color: The color of LineString features and, with fill=null, polygon boundaries:
                a CSS color, or a property or column mapped to colors. Default: the fill.
            size: The size of Point features: a number, or a property or column mapped to
                sizes. Default: 8 px.
            width: The width of LineString features and, with fill=null, polygon boundaries:
                a number, or a property or column mapped to widths. Default: 1 px.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            outline_color: The color of region and point outlines. Default: "#f4f2ed".
            outline_opacity: Border opacity from 0 to 1: a number, numeric column, array or
                expression. Fades the border over the fill; mark opacity still applies to both.
                Missing values hide the border. Default: 1.
            outline_width: The width of region and point outlines; 0 draws none. Default:
                0.7 px.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            color_scale: A scale for color that marks can share.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            size_scale: The size's scale, which marks can share: continuous({domain, range,
                transform}) for numbers (without a range, the automatic one), or categories with
                a numeric range.
            width_scale: A scale for width that marks can share, as size_scale.
            outline_color_scale: A categorical() scale from the outline_color column's
                categories to colors.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            legend_font_size: The size of the mark's legend text. Default: the theme's (14
                in the default theme). In px.
            legend_font_family: The font of the mark's legend text, a CSS font-family.
                Default: the plot's font.
            legend_text_color: The color of the mark's legend text. Default: "#40505d".
            legend_tick_format: How a colorbar labels numbers: a d3-format string, or a
                %-pattern for dates. Default: ".3~g".
            quantize: Step a numeric fill or color into `levels` colors instead of a smooth
                gradient. Default: False.
            levels: How many colors quantize steps through. Default: 10.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
            lit: Shade the mark with the plot's lights. Default: False.
            transparent: Draw the mark in the transparent pass, blended in depth order with
                other transparent marks. Default: False.
            missing_color: The color of the features the data has no value for: no joined
                row, or a missing (NaN) value. Default: the fill scale's missing, else the
                theme's (#92989f in the default theme).
        """
    def update(self, *,
        data: Any = ...,
        geometry: str = ...,
        feature_key: str = ...,
        data_key: str = ...,
        height: Channel = ...,
        height_scale: ContinuousScale = ...,
        plane: TypingLiteral["xy", "xz"] = ...,
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
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> Self: ...

class VectorTile(Node):
    def __init__(self, *,
        url: str = ...,
        tile: Sequence[float] = ...,
        tiles: Sequence[Sequence[float]] = ...,
        bounds: Sequence[float] = ...,
        zoom: float = ...,
        data: Any = ...,
        styles: Any = ...,
        scheme: Any = ...,
        source_layers: dict[str, bool | TypingLiteral["land", "green", "water", "waterways", "buildings", "other", "paths", "roads", "majorRoads", "railways", "boundaries", "places"]] = ...,
        clip: bool = ...,
        fit: bool = ...,
        origin: Sequence[float] = ...,
        units_per_meter: float = ...,
        plane: TypingLiteral["xy", "xz"] = ...,
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
    ) -> None:
        """A basemap of land, water, roads, buildings and place names from vector map tiles.

        Example:
            import hmplot as hm

            with hm.Plot(coordinates="spherical", projection="mercator", tone_mapping=0, height=300) as plot:
                hm.VectorTile(tile=[14, 9014, 4818], live=False)
            plot

        Args:
            url: Where tiles load from: a URL template with {z}, {x} and {y}, or in
                JavaScript a function of {z, x, y}. In Svelte markup pass the template as a
                JavaScript string: url={"https://.../{z}/{x}/{y}.pbf"}. Default: VersaTiles'
                OpenStreetMap tiles, which need no key and are credited on the plot.
            tile: One tile to load, [z, x, y]: its zoom, its column from the west and its
                row from the north.
            tiles: Several tiles to load (at most 16), each clipped to its own square.
            bounds: A box [west, south, east, north]: load every tile it touches at zoom (at
                most 16). In degrees.
            zoom: The zoom at which bounds picks its tiles.
            data: Already decoded tiles to draw instead of loading any: a GeoJSON
                FeatureCollection whose features name their source layer in
                properties.layerName.
            styles: Per part (water, roads, buildings, places, ...): false hides it, or
                {fill, color, width, size, opacity, outline_color, outline_width} changes its
                look over the scheme.
            scheme: The basemap's colors: a theme preset's name ("dark", "sea", ...),
                "default", or part styles as for styles. Default: the enclosing Theme's basemap
                colors (derived from its colors when it has none), else "default".
            source_layers: Assign a tileset's source layers to parts, {layer: part}, or hide
                one with false, before the built-in rules.
            clip: End each tile's geometry at the tile's edge (tiles overlap by a buffer).
                Default: True.
            fit: Frame the tiles when they change, in a 2D map. Default: True.
            origin: Draw in a local plane instead of longitude and latitude: meters east and
                north of this [longitude, latitude], times units_per_meter. For Cartesian and 3D
                plots. In degrees.
            units_per_meter: The plot units per meter in the local plane that origin sets.
                Default: 1.
            plane: In a Cartesian 3D plot, "xz" lays the tiles on the horizontal ground
                plane. Default: "xy".
            snapshot: In an HTML export of a scene, embed the tiles on screen as tile_data;
                false exports only the url, so the page loads its tiles when it opens. Default:
                True.
            live: In a 2D view (a Cartesian plot, or a map in any projection, the globe
                included), and under a 3D flyover camera (with origin and plane="xz"), also load
                the tiles the camera shows as it moves. Needs opaque styles; not inside nested
                Frames. Default: True.
            min_zoom: The coarsest zoom live tiles load. Default: 0.
            max_zoom: The finest zoom live tiles load; zoomed in further, those tiles
                stretch. Default: 14.
            zoom_bias: Live tile detail offset in zoom levels, between -4 and 4: +1 doubles
                linear detail at the same view scale or camera height; -1 uses coarser tiles.
                Zoom limits and the tile budget still apply. Default: 0.
            attribution: A credit line in the plot's lower-left corner, kept in every export
                (most tile licenses require one); false hides it. Default: the default tiles'
                credit when there is no url, else none.
            tile_data: Embedded tiles instead of loading them: [{tile: [z, x, y], bytes}],
                bytes as base64 text or a Uint8Array (null for an empty tile). Exported pages
                carry their tiles this way.
            extrude_buildings: Under a 3D flyover camera, stand the tiles' buildings up from
                their height tags (5 meters when missing) with flat roofs; false draws flat
                footprints. 2D maps are always flat. Default: True.
            name: The name of its group of parts in the settings pane.
            visible: Show or hide every part.
            opacity: A multiplier on every part's opacity; live tiles need 1.
        """
    def update(self, *,
        url: str = ...,
        tile: Sequence[float] = ...,
        tiles: Sequence[Sequence[float]] = ...,
        bounds: Sequence[float] = ...,
        zoom: float = ...,
        data: Any = ...,
        styles: Any = ...,
        scheme: Any = ...,
        source_layers: dict[str, bool | TypingLiteral["land", "green", "water", "waterways", "buildings", "other", "paths", "roads", "majorRoads", "railways", "boundaries", "places"]] = ...,
        clip: bool = ...,
        fit: bool = ...,
        origin: Sequence[float] = ...,
        units_per_meter: float = ...,
        plane: TypingLiteral["xy", "xz"] = ...,
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
    ) -> Self: ...

class Polygon(Node):
    def __init__(self, *,
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
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        series: str | Sequence[Any] | Sequence[str] | DictionaryColumn = ...,
    ) -> None:
        """Filled polygons from their vertices in order, one per series.

        Example:
            import hmplot as hm

            data = {
                "x": [0, 2, 2, 0, 3, 5, 4],
                "y": [0, 0, 2, 2, 0, 0, 2],
                "shape": ["a", "a", "a", "a", "b", "b", "b"],
            }
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                hm.Polygon(x="x", y="y", series="shape")
            plot

        Args:
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            x: Each vertex's x position, one row per vertex. Leave x and y out inside
                Contour (bands), Voronoi or Hull: Polygon then draws the shapes they make.
            y: Each vertex's y position, one row per vertex.
            fill: The fill color: a CSS color, or a column mapped to colors (each polygon
                takes its first row's value). Default: "#547ba2".
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            outline_color: The outline's color: a CSS color, or a column of categories
                mapped through outline_color_scale. Default: "#ffffff".
            outline_opacity: Border opacity from 0 to 1: a number, numeric column, array or
                expression. Fades the border over the fill; mark opacity still applies to both.
                Missing values hide the border. Default: 1.
            outline_width: The outline's width in CSS pixels, drawn inside the mark's edge
                (a point's at most its radius). Default: 0.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            outline_color_scale: A categorical() scale from the outline_color column's
                categories to colors.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            series: Groups the rows into polygons, each group's rows its vertices in order;
                without it, all the rows are one polygon.
        """
    def update(self, *,
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
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
        glow: float = ...,
        shade: Any = ...,
        options: Sequence[str] = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        select: bool | SelectionResource | InputWrite = ...,
        hover: bool | SelectionResource | InputWrite = ...,
        tooltip: bool | Sequence[str | TooltipField] | TooltipOptions = ...,
        nearest: bool | SelectionResource | NearestOptions = ...,
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        series: str | Sequence[Any] | Sequence[str] | DictionaryColumn = ...,
    ) -> Self: ...

class Title(Node):
    def __init__(self, __text: str = ..., /, *,
        text: str | Sequence[str | Expression | TitleTextOptions] = ...,
        size: float | TypingLiteral["title", "subtitle", "caption"] = ...,
        weight: float | TypingLiteral["normal", "bold"] = ...,
        align: TypingLiteral["left", "right", "center"] = ...,
        color: str = ...,
        font: str = ...,
        wrap: bool = ...,
        name: str = ...,
    ) -> None:
        """A heading or note beside plots, drawn as text that stays text in SVG and PDF exports.

        The positional argument is the text (or text=): hm.Title("...").

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Scene() as scene:
                hm.Title("Four measurements")
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Points(x="x", y="y")
            scene

        Args:
            text: The text: "\\n" breaks a line and {$name} shows an input's value. Python
                takes it positionally: hm.Title("..."). A readout shows live values: a list of
                parts, strings and reductions over the Data around the Title
                (count(where="@brushed"), mean("fare")), or {value, format} with a d3-format
                string; in Python an f-string does it, hm.Title(f"Selected:
                {hm.count(where='@brushed'):,}"). A live value follows the data and its
                selections, written as tooltips write numbers, "—" when no row has one.
            size: "title", "subtitle" or "caption", sizes that follow the theme's text size,
                or pixels. Default: "title".
            weight: The font weight, as in CSS. Default: 600 for a title, 400 otherwise.
            align: Where the lines sit across the block. Default: "left".
            color: The text color. Default: the theme's text color.
            font: The font, a CSS font-family. Default: the theme's.
            wrap: Wrap words at the block's width; false keeps each line whole. Default:
                True.
            name: A name for the block (its element's data-name attribute).
        """
    def update(self, *,
        text: str | Sequence[str | Expression | TitleTextOptions] = ...,
        size: float | TypingLiteral["title", "subtitle", "caption"] = ...,
        weight: float | TypingLiteral["normal", "bold"] = ...,
        align: TypingLiteral["left", "right", "center"] = ...,
        color: str = ...,
        font: str = ...,
        wrap: bool = ...,
        name: str = ...,
    ) -> Self: ...

class Panels(Node):
    def __init__(self, *children: Node,
        x: AxisDefinition = ...,
        gap: float = ...,
    ) -> None:
        """Stacks Plots over one shared x: one domain, panned and zoomed together, its axis drawn
        once under the stack.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import math
            import hmplot as hm

            days = list(range(120))
            data = {"day": days, "price": [100 + 10 * math.sin(d / 8) + d / 6 for d in days],
                    "volume": [50 + 30 * abs(math.cos(d / 5)) for d in days]}
            # Two Plots over one x: zooming or panning either moves both; the axis is drawn once.
            with hm.Scene() as chart:
                with hm.Data(data):
                    with hm.Panels(x={"label": "Day"}):
                        with hm.Plot(height=220, y={"label": "Price"}):
                            hm.Line(x="day", y="price")
                        with hm.Plot(height=120, y={"label": "Volume"}):
                            hm.charts.Bar(x="day", y="volume", orientation="vertical")
            chart

        Args:
            x: Settings for the shared x axis (label, format, domain, ...), under each
                Plot's own x settings. Only the last Plot draws the axis; the others show their
                data over the same domain.
            gap: Space between the Plots. Default: 6 px.
        """
    def update(self, *,
        x: AxisDefinition = ...,
        gap: float = ...,
    ) -> Self: ...

class Mapping(Node):
    def __init__(self, *children: Node,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> None:
        """Channels (x, y, fill, size, ...) that the marks inside it share.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                with hm.Mapping(x="x", y="y"):
                    hm.Line()
                    hm.Points()
            plot

        Args:
            x: The x position: a column, per-row values, or one value.
            y: The y position: a column, per-row values, or one value.
            z: The z position, in a 3D plot: a column, per-row values, or one value.
            position: Positions as one column or an N x 2 (or N x 3) array, instead of x, y
                and z.
            fill: The fill color: a CSS color, or a column of numbers or categories mapped
                to colors.
            color: The line or text color: a CSS color, or a column mapped to colors.
            size: The size of each point or label: a number, or a column mapped to sizes. In
                px.
            width: The line width: a number, or a column mapped to widths. In px.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            outline_color: The outline's color: a CSS color, or a column of categories
                mapped through outline_color_scale.
            outline_opacity: Border opacity from 0 to 1: a number, numeric column, array or
                expression. Fades the border over the fill; mark opacity still applies to both.
                Missing values hide the border. Default: 1.
            outline_width: The outline's width in CSS pixels, drawn inside the mark's edge
                (a point's at most its radius). Default: 0.
            fill_scale: The fill's scale, which marks can share: continuous({domain,
                colormap, transform}) for numbers, categorical({domain, range}) or ordinal() for
                categories.
            color_scale: A scale for color that marks can share.
            size_scale: The size's scale, which marks can share: continuous({domain, range,
                transform}) for numbers (without a range, the automatic one), or categories with
                a numeric range.
            width_scale: A scale for width that marks can share, as size_scale.
            visible: Whether the mark is drawn. Default: True.
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            name: The Mapping's name in the settings pane; the marks inside do not take it.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            brush: Brush rows with Shift-drag (point marks; Line, Area brush whole series):
                true uses its data's brush, a selection() shares one, {selection, axis} picks
                the axes.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            series: Split the rows into separate paths, one per value of this column (Line,
                Area). Without it, a Line colored or an Area filled by a category column splits
                by that column.
            start: Where each segment starts (Segments, Arrows): a column of positions or an
                N x 2 (N x 3) array.
            end: Where each segment ends, as start.
            rotation: The symbol's rotation. Default: 0 degrees.
            shape: The point symbol: a shape name, a column of categories mapped to shapes,
                or one name per row. Default: "circle".
            shape_scale: A categorical() scale from the shape column's categories to shape
                names.
        """
    def update(self, *,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> Self: ...

class Text(Node):
    def __init__(self, *,
        x_offset: Channel = ...,
        y_offset: Channel = ...,
        text: str | float | Sequence[str | float] | DictionaryColumn = ...,
        align: TypingLiteral["auto", "left", "right", "center"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        drag: bool | TypingLiteral["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> None:
        """Text labels at data positions, one per row.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3], "y": [2, 3, 1], "word": ["one", "two", "three"]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                hm.Text(x="x", y="y", text="word")
            plot

        Args:
            x_offset: Moves each row along x in data units: on a categorical axis a band is
                one unit, so 0.25 is a quarter of the category's band (grouped bars, dodged
                points). A number or a column. dx moves by CSS pixels. Default: 0 data.
            y_offset: Moves each row along y in data units: on a categorical axis a band is
                one unit (side-by-side horizontal bars). A number or a column. dy moves by CSS
                pixels. Default: 0 data.
            text: The text of each label: a column, one string for every label, or one value
                per row.
            align: Which part of each label is at its point: its left end, its center, or
                its right end; "auto" picks each row's from its dx: left of a label offset right
                of its point by more than 4 pixels, right of one offset left, else centered.
                Default: "center".
            format: How numbers in the text are written: a d3-format string (",.0f", ".1%",
                "$,.2f"; default the theme's numbers.format, else as tooltips write them: four
                significant digits, whole numbers exact, thousands grouped from 10,000), or a
                %-pattern for a datetime column ("%b %d"). A number computed on the GPU (a
                Group's count, a Calculate's mean) is written the same way, with no as_category.
                "axis": the text is an axis's view-state field ("@pointer_x", "@view_y_min",
                ...), shown as the axis's readout writes it, finer than its ticks, as
                Crosshair's readouts are; "@pointer" shows both of the pointer's, "x, y". On a
                band axis the pointer reads as its category; the view's edges are band
                positions.
            dx: Moves each label right of its point, or left when negative. Default: 0 px.
            dy: Moves each label down from its point, or up when negative. Default: 0 px.
            font: The font, a CSS font-family. Default: the plot's font.
            box: A box behind each label: true for a white box with a gray outline, or its
                settings.
            leader: With an offset, a line from near each point to its label: true for a 1.5
                px line in the text's color, or its color and width.
            data: A table for this mark alone: a mark with data displays on its own, in a
                Plot of its own.
            x: The x position: a column, per-row values, or one value.
            y: The y position: a column, per-row values, or one value.
            z: The z position, in a 3D plot: a column, per-row values, or one value.
            position: Positions as one column or an N x 2 (or N x 3) array, instead of x, y
                and z.
            color: The line or text color: a CSS color, or a column mapped to colors.
                Default: the theme's text color.
            size: The font size: a number, or a column mapped to sizes. Default: the theme's
                font size (14 in the default theme). In px.
            opacity: The opacity, 0 to 1: a number, or a column (categories map through
                opacity_scale). Default: 1.
            color_scale: A scale for color that marks can share.
            colormap: The colormap of a numeric fill or color: a name, a list of colors, or
                {colors, space, positions}. Default: the theme's (Viridis).
            size_scale: The size's scale, which marks can share: continuous({domain, range,
                transform}) for numbers (without a range, the automatic one), or categories with
                a numeric range.
            opacity_scale: A categorical() scale from the opacity column's categories to
                opacities, 0 to 1.
            label: The mark's name in the legend and the settings pane.
            legend: Whether the mark has a legend entry. Default: True.
            visible: Whether the mark is drawn. Default: True.
            domains: Whether the mark's data counts toward its axes' automatic domains;
                false leaves them to the other marks (a reference line, a decorative part).
                Default: True.
            rows: "auto" draws one item when no channel reads a column (a line at a value, a
                label at a point), instead of one per row of the data; "@" view-state fields are
                not columns.
            blend: How the mark mixes with what is drawn under it; any mode but normal draws
                it transparent, and SVG and PDF exports draw additive and subtractive as an
                image. Default: "normal".
            glow: How much the mark glows: its own color times glow blooms around it in the
                plot's presentation (0 does not glow); the Plot's bloom effect sets the bloom's
                strength and radius. SVG and PDF exports draw the whole plot as an image.
                Default: 0.
            shade: A plugin's shade (registerPlugin): { kind, ...parameters }, as { kind:
                "hatch", spacing: 6 } (Python hm.shade("hatch", spacing=6)), recolors each
                fragment the mark draws; picking, tooltips, domains and legends are unchanged.
                SVG and PDF exports draw a shaded mark as an image.
            options: The settings the settings pane shows for this mark, by name.
            name: The mark's name in the settings pane, and the name facet.endpoint() and
                partition.endpoint() find it by.
            identity: Whose rows these are for selections: an identity() shared by tables
                that show the same things. Default: its data's.
            select: Click to replace the selection; an exact repeat clears it.
                Shift/Meta/Ctrl-click toggles membership (whole series for Line, Area): true
                uses its data's selection, or give a selection(). input("root").set("id") writes
                an input instead: a click sets it to the clicked row's id (a drill-down's root),
                .set(literal(v)) to a constant, .reset() to its default, and a click on nothing
                restores its default (input("root", {default}), else a Select of that name's,
                else null); several marks may write one input.
            hover: Mark the row under the pointer as @hovered (a whole series for Line,
                Area), without fading the others: true uses its data's hover, or give a
                selection(). input("focus").set("series") writes an input instead: while the
                pointer is on a row the input shows its series (or .set(literal(v)), a
                constant), then its committed value again (a hover that would change this mark's
                own rows is an error).
            tooltip: Show the nearest row's values in a box by the pointer: true, a list of
                fields, or {fields, radius, content}. Default: the Plot's.
            brush: Brush rows with Shift-drag (point marks; Line, Area brush whole series):
                true uses its data's brush, a selection() shares one, {selection, axis} picks
                the axes.
            nearby: Mark the rows near the pointer (point marks): true, a selection(), or
                {selection, radius, units, axis}.
            nearest: Mark the row a tooltip shows as @nearest, with or without the tooltip:
                under the pointer, else the nearest drawn row within radius pixels (a whole
                series for Line, Area): true, a selection(), or {selection, radius}. Default:
                the Plot's.
            respond: Which interaction states fade this mark's other rows to
                selection_opacity; "hovered" fades them while hovering, "nearest" while a row is
                nearest. Default: the states it sets, except hover and nearest.
            selection_opacity: The opacity of the rows outside the selection while one is
                active. Default: 0.25.
            drag: Drag rows to move them (point marks): true along every numeric axis, or
                the axes to move along. Default: False.
            enter_effect: How rows that arrive in a keyed update appear: "fade", or {effect,
                duration, easing}. animate()'s enter option is the value a channel starts from.
            exit_effect: How rows that leave in a keyed update disappear, as enter_effect.
                animate()'s exit option is the value a channel ends at.
            animation: Animate changes to the mark's values. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            max_instances: The most rows drawn; past it the rows are sampled (null draws
                them all), though SVG and PDF exports draw every row. Default: None.
        """
    def update(self, *,
        x_offset: Channel = ...,
        y_offset: Channel = ...,
        text: str | float | Sequence[str | float] | DictionaryColumn = ...,
        align: TypingLiteral["auto", "left", "right", "center"] = ...,
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
        rows: TypingLiteral["auto"] = ...,
        blend: TypingLiteral["normal", "additive", "multiply", "screen", "subtractive"] = ...,
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
        respond: bool | TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | Sequence[TypingLiteral["nearest", "nearby", "selected", "brushed", "hovered"] | SelectionResource] | SelectionResource = ...,
        selection_opacity: float = ...,
        drag: bool | TypingLiteral["xy", "x", "y", "xz", "yz", "z", "xyz"] = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        # Advanced renderer options:
        max_instances: float = ...,
    ) -> Self: ...

class Anchor(Node):
    def __init__(self, *,
        x: Channel = ...,
        y: Channel = ...,
        z: Channel = ...,
        position: Channel = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> None:
        """An invisible position that connections from a Line, Segments or Arrows attach to.

        Example:
            import hmplot as hm

            data = {"name": ["a", "b", "c"], "before": [1, 2, 1.5], "after": [3, 2.5, 4]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                points = hm.Points(x="before", y="name")
                anchor = hm.Anchor(x="after", y="name")
                hm.charts.Arrows(connections=hm.connect(points, anchor))
            plot

        Args:
            x: The x position of each row: a column, per-row values, or one value.
            y: The y position of each row: a column, per-row values, or one value.
            z: The z position, in a 3D plot: a column, per-row values, or one value.
            position: Positions as one column or an N x 2 (or N x 3) array, instead of x, y
                and z.
            name: The name facet.endpoint() and partition.endpoint() select this Anchor by
                when a Facet or Partition repeats it (Python can pass the Anchor itself); also
                its label in the settings pane.
            identity: Whose rows these are: connect() without a key matches the rows of
                endpoints that share an identity(). Default: its data's.
            enter_effect: In a keyed update, arriving rows start from their channels'
                animate(..., {enter}) values; an Anchor draws nothing, so "fade" only sets the
                timing.
            exit_effect: In a keyed update, leaving rows stay in place, and connectable,
                until the transition ends.
            animation: Animate changes to the positions, so what is connected to the Anchor
                moves smoothly. Default: False.
            animation_duration: How long an animated change takes. Default: 300 ms.
            animation_easing: The animation's easing. Default: "cubic-in-out".
            data: A table for this Anchor alone; unlike other marks, an Anchor with data
                still goes inside a Plot.
            max_elements: The most rows the mark prepares on the GPU. Default: 250000.
            x_transform: This mark's own x transform, instead of its frame's. Default: its
                frame's.
            x_invert: Reverse this mark's x direction. Default: False.
            xbounds: The x extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            xrange: Where this mark's x extent lands, in its frame's world units. Default:
                its frame's.
            y_transform: This mark's own y transform, instead of its frame's. Default: its
                frame's.
            y_invert: Reverse this mark's y direction. Default: False.
            ybounds: The y extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            yrange: Where this mark's y extent lands, in its frame's world units. Default:
                its frame's.
            z_transform: This mark's own z transform, instead of its frame's. Default: its
                frame's.
            z_invert: Reverse this mark's z direction. Default: False.
            zbounds: The z extent this mark maps, instead of its frame's domain (an image's
                or a grid's extent). Default: its frame's.
            zrange: Where this mark's z extent lands, in its frame's world units. Default:
                its frame's.
        """
    def update(self, *,
        x: Channel = ...,
        y: Channel = ...,
        z: Channel = ...,
        position: Channel = ...,
        name: str = ...,
        identity: IdentityResource = ...,
        enter_effect: bool | TypingLiteral["fade"] | EnterEffectOptions = ...,
        exit_effect: bool | TypingLiteral["fade"] | ExitEffectOptions = ...,
        animation: bool = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
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
    ) -> Self: ...

class Tree(Node):
    def __init__(self, *children: Node,
        root: str | float | bool | Expression = ...,
        directed: bool = ...,
        orientation: TypingLiteral["left", "right", "down", "up"] = ...,
        sibling_spacing: float = ...,
        depth_spacing: float = ...,
        mode: TypingLiteral["tidy", "tidy-approx", "partition", "cluster"] = ...,
        layer_height: str | float | Expression = ...,
        node_width: Any = ...,
        child_align: TypingLiteral["left", "right", "center"] = ...,
        width_mode: TypingLiteral["proportional", "fixed"] = ...,
        visual_margin: float = ...,
        height: str | Expression = ...,
        edge_length: str | float | Expression = ...,
        where: str | bool | Expression = ...,
        enter: TreeEnterOptions = ...,
        exit: TreeExitOptions = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        name: str = ...,
    ) -> None:
        """A rooted tree layout of an edge table, as a tidy tree, an icicle or a dendrogram.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"source": ["root", "root", "a", "a", "b"], "target": ["a", "b", "a1", "a2", "b1"]}
            with hm.Plot(data=data, height=300) as plot:
                with hm.GraphData(source="source", target="target"):
                    with hm.Tree(root="root"):
                        with hm.Edges():
                            hm.Segments(start="start", end="end")
                        with hm.Nodes():
                            hm.Points(position="position")
            plot

        Args:
            root: The starting node's ID, or a scalar reduction over node columns and
                selection. Its depth is zero; every mode keeps only reachable nodes.
            directed: Follows edges only from source to target, instead of both ways, in
                every mode. Default: False.
            orientation: The direction the tree grows from its root. Default: "down".
            sibling_spacing: The distance between neighboring leaves, across the tree (tidy
                and cluster modes). Default: 1 data units.
            depth_spacing: The distance between levels, along the tree (tidy and cluster
                modes). Default: 1 data units.
            mode: A compact CPU tidy tree, a GPU approximation reserving subtree intervals
                (tidy-approx), a GPU icicle of nested rectangles with x0, x1, y0 and y1
                (partition), or a dendrogram with every leaf on one level (cluster). Every mode
                gives the leaves an order column, their place from left to right. Default:
                "tidy".
            layer_height: Partition mode: nonnegative band thickness per node. Children
                start at their parent's end; zero collapses a layer. tween() runs before layout.
                Default: 1 data units.
            node_width: Each node's width, as a number or a nodes-table column or
                expression. Partition and tidy modes allow zero widths for collapsing branches;
                incoming tween() is evaluated before geometry. Default: 1 data units.
            child_align: Partition mode with width_mode "fixed": where the children sit in a
                parent wider than they are. Default: "center".
            width_mode: Partition mode: a parent spans its children's total width
                (proportional), or at least its own node_width (fixed). Default: "proportional".
            visual_margin: Partition mode: a gap between neighboring rectangles, inset from
                each node's bounds without moving its center. Default: 0 data units.
            height: Cluster mode: a nodes-table column of merge heights, which places each
                node that far from the leaves, drawn to scale as scipy's dendrogram does.
            edge_length: Tidy modes: nonnegative incoming edge lengths read from the edge
                table, accumulated along root paths and multiplied by depth_spacing. Default: 1.
            where: Node-table predicate; hidden nodes disconnect descendants. The root
                remains present. Layout entry/exit retains departing branches until they shrink.
            enter: Starting numeric contributions for entering branches. Omitted endpoints
                are zero; initial mounting rests at the target.
            exit: Departing branch contributions, reached before removal. Omitted endpoints
                are zero.
            animation_duration: Duration of layout-owned entry and exit; incoming tweens
                keep their own timing. Default: 300 ms.
            animation_easing: Easing of layout-owned entry and exit. Default:
                "cubic-in-out".
            name: The layout's name in the status its handle reports.
        """
    def update(self, *,
        root: str | float | bool | Expression = ...,
        directed: bool = ...,
        orientation: TypingLiteral["left", "right", "down", "up"] = ...,
        sibling_spacing: float = ...,
        depth_spacing: float = ...,
        mode: TypingLiteral["tidy", "tidy-approx", "partition", "cluster"] = ...,
        layer_height: str | float | Expression = ...,
        node_width: Any = ...,
        child_align: TypingLiteral["left", "right", "center"] = ...,
        width_mode: TypingLiteral["proportional", "fixed"] = ...,
        visual_margin: float = ...,
        height: str | Expression = ...,
        edge_length: str | float | Expression = ...,
        where: str | bool | Expression = ...,
        enter: TreeEnterOptions = ...,
        exit: TreeExitOptions = ...,
        animation_duration: float = ...,
        animation_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        name: str = ...,
    ) -> Self: ...

class Frame(Node):
    def __init__(self, *children: Node,
        animation_group: str | Sequence[str] = ...,
        animate_bounds: bool = ...,
        bounds_duration: float = ...,
        bounds_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        axis_frame: bool = ...,
        axis_mask: bool = ...,
        placement: TypingLiteral["fit"] | FramePlacement = ...,
        rules: Sequence[ReferenceRule] = ...,
        bands: Sequence[dict[str, Any]] = ...,
        coordinates: TypingLiteral["cartesian", "polar", "spherical"] = ...,
        spherical_view: TypingLiteral["globe", "projected"] = ...,
        angle_unit: TypingLiteral["degrees", "radians", "extent", "custom"] = ...,
        angle_period: float = ...,
        base_radius: float = ...,
        radial_scale: float = ...,
        polar_axis: TypingLiteral["X", "Y", "Z"] = ...,
        projection: TypingLiteral["equirectangular", "mercator", "equal-area", "orthographic", "equal-earth", "natural-earth", "albers", "albers-usa"] = ...,
        projection_center: Sequence[float] = ...,
        parallels: Sequence[float] = ...,
        atmosphere: bool | FrameAtmosphereOptions = ...,
        x: AxisDefinition = ...,
        y: AxisDefinition = ...,
        z: AxisDefinition = ...,
        scale_defaults: Any = ...,
        name: str = ...,
        auto_bounds: bool = ...,
    ) -> None:
        """A coordinate frame inside a Plot: its own scales for some marks (a second y axis), or a
        small chart placed within its parent.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2], "count": [40, 10, 25, 5]}
            with hm.Plot(data=data, height=300, axes2d=True) as plot:
                hm.Line(x="x", y="y")
                with hm.Frame(y={"domain": "auto", "side": "right"}):
                    hm.Line(x="x", y="count")
            plot

        Args:
            animation_group: Match animation rows by these columns within each
                filtered/transformed snapshot; selections keep Data.key. null restores
                key/position matching. Default: inherited; otherwise Data.key, then position.
            animate_bounds: Animate numeric domains and ranges independently of mark
                animation; structural changes and direction reversals snap. Default: the parent
                frame's (false on Plot).
            bounds_duration: Duration of scale transitions, independent of mark timing.
                Default: the parent frame's (300). In ms.
            bounds_easing: Easing of scale transitions, independent of mark timing. Default:
                the parent frame's (cubic-in-out).
            axis_frame: Draw a complete rectangular border in 2D Cartesian frames without
                duplicate ticks or labels. Default: the theme's.
            axis_mask: Clip marks and picking to the rectangular 2D Cartesian axes interior,
                intersecting ancestor masks. Default: the theme's.
            placement: Anchors a fixed-size frame at a point of its parent: anchor in parent
                data coordinates, size in CSS pixels (2D) or world units (3D), and an optional
                rotation. "fit" centers it in a Cartesian parent's domain, across 90% of the
                parent's shorter side, and refits it as the parent's view changes. It cannot
                combine with ranges.
            rules: Reference lines in this frame's coordinates (a spoke or circle in a polar
                frame), as on Plot.
            bands: Shaded spans of this frame's x or y axis behind its marks, as on Plot.
            coordinates: This frame's coordinate system. A frame that changes its parent's
                needs x and y ranges or a placement. Default: the parent's.
            spherical_view: How a 3D spherical frame shows the sphere, as on Plot. Default:
                the parent's.
            angle_unit: The unit of this frame's polar or spherical angles, as on Plot.
                Default: the parent's.
            angle_period: Angle units in one turn when angle_unit is "custom", as on Plot.
                Default: the parent's.
            base_radius: The radius at zero in a polar or spherical frame, as on Plot.
                Default: the parent's.
            radial_scale: The radius per unit in a polar or spherical frame, as on Plot.
                Default: the parent's.
            polar_axis: The axis a 3D polar frame turns around, as on Plot. Default: the
                parent's.
            projection: The map projection of a spherical frame, as on Plot. A spherical
                frame with ranges must be a flat orthographic disk (radial_scale 0). Default:
                the parent's.
            projection_center: The map's center [longitude, latitude], as on Plot. Default:
                the parent's.
            parallels: The albers projection's two standard parallels, as on Plot. Default:
                the parent's.
            atmosphere: A glow around a spherical frame's globe in a 3D plot: true, or a CSS
                color (default "#7fb2ff") and a thickness as a fraction of the radius (default
                0.1). It is not picked and has no legend. SVG and PDF exports draw the whole
                plot as an image. Default: False.
            x: Omit it to share the parent's x scale. A domain (or "auto") gives the frame
                its own; a range places the frame within its parent, in parent data coordinates,
                and fits the frame's own data unless a domain is given.
            y: The frame's y, as x: a domain with side "right" makes a second y axis.
            z: The frame's z in a 3D plot, as x.
            scale_defaults: Defaults for the continuous color, size and width scales this
                frame's marks make, as on Plot.
            name: The frame's name in the settings pane. Default: "Frame".
            auto_bounds: Fit the frame's missing domains to its marks' data; an explicit
                domain always wins. Default: True.
        """
    def update(self, *,
        animation_group: str | Sequence[str] = ...,
        animate_bounds: bool = ...,
        bounds_duration: float = ...,
        bounds_easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] = ...,
        axis_frame: bool = ...,
        axis_mask: bool = ...,
        placement: TypingLiteral["fit"] | FramePlacement = ...,
        rules: Sequence[ReferenceRule] = ...,
        bands: Sequence[dict[str, Any]] = ...,
        coordinates: TypingLiteral["cartesian", "polar", "spherical"] = ...,
        spherical_view: TypingLiteral["globe", "projected"] = ...,
        angle_unit: TypingLiteral["degrees", "radians", "extent", "custom"] = ...,
        angle_period: float = ...,
        base_radius: float = ...,
        radial_scale: float = ...,
        polar_axis: TypingLiteral["X", "Y", "Z"] = ...,
        projection: TypingLiteral["equirectangular", "mercator", "equal-area", "orthographic", "equal-earth", "natural-earth", "albers", "albers-usa"] = ...,
        projection_center: Sequence[float] = ...,
        parallels: Sequence[float] = ...,
        atmosphere: bool | FrameAtmosphereOptions = ...,
        x: AxisDefinition = ...,
        y: AxisDefinition = ...,
        z: AxisDefinition = ...,
        scale_defaults: Any = ...,
        name: str = ...,
        auto_bounds: bool = ...,
    ) -> Self: ...

class Markdown(Node):
    def __init__(self, __text: str = ..., /, *,
        text: str = ...,
        width: str | float = ...,
        font_size: float = ...,
        color: str = ...,
        font: str = ...,
        align: TypingLiteral["left", "right", "center"] = ...,
        name: str = ...,
    ) -> None:
        """Formatted text (emphasis, lists, tables, math) beside plots in a Python layout.

        The positional argument is the text (or text=): hm.Markdown("...").

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Scene() as scene:
                hm.Markdown("**Four measurements.** The largest is $y = 4$, at $x = 3$.")
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Points(x="x", y="y")
            scene

        Args:
            text: The markdown: CommonMark with tables, task lists and $math$; {$name} shows
                an input's value. Python takes it positionally: hm.Markdown("...").
            width: The block's greatest width: pixels, or a CSS length. Default: the
                container's.
            font_size: The size of the body text; headings scale with it. Default: the
                theme's text size + 1. In px.
            color: The text color. Default: the theme's text color.
            font: The font, a CSS font-family. Default: the theme's.
            align: Where the text sits across the block. Default: "left".
            name: A name for the block, in export reports and as its element's data-name.
        """
    def update(self, *,
        text: str = ...,
        width: str | float = ...,
        font_size: float = ...,
        color: str = ...,
        font: str = ...,
        align: TypingLiteral["left", "right", "center"] = ...,
        name: str = ...,
    ) -> Self: ...

class Row(Node):
    def __init__(self, *children: Node,
        gap: float = ...,
        min_width: float = ...,
        widths: Sequence[float] = ...,
        wrap: bool = ...,
    ) -> None:
        """Puts its children side by side.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Row() as row:
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Points(x="x", y="y")
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Line(x="x", y="y")
            row

        Args:
            gap: Space between the children. Default: 16 px.
            min_width: The width each child starts from (with widths, the narrowest share's;
                the others start in proportion): with wrap on, a child moves to the next line
                rather than get narrower. Default: 320 px.
            widths: Each child's share of the row's width, in order: [3, 2] gives the first
                child three fifths and the second two fifths at every width (a child past the
                list takes 1). Default: equal shares.
            wrap: Move children to a new line when they no longer fit at min_width. Default:
                False.
        """
    def update(self, *,
        gap: float = ...,
        min_width: float = ...,
        widths: Sequence[float] = ...,
        wrap: bool = ...,
    ) -> Self: ...

class Column(Node):
    def __init__(self, *children: Node,
        gap: float = ...,
    ) -> None:
        """Stacks its children top to bottom.

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Column() as column:
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Points(x="x", y="y")
                with hm.Plot(data=data, height=300, axes2d=True):
                    hm.Line(x="x", y="y")
            column

        Args:
            gap: Space between the children. Default: 16 px.
        """
    def update(self, *,
        gap: float = ...,
    ) -> Self: ...

class Grid(Node):
    def __init__(self, *children: Node,
        columns: float = ...,
        gap: float = ...,
    ) -> None:
        """Lays its children out in rows of equal columns (Python hm.Grid).

        Positional arguments are this component's children and move into it. Keywords that take
        a component (target=) refer to it without moving it.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "a": [3, 1, 4, 2], "b": [1, 3, 2, 4], "c": [2, 4, 3, 1], "d": [4, 3, 2, 1]}
            with hm.Grid(columns=2) as grid:
                for name in ["a", "b", "c", "d"]:
                    with hm.Plot(data=data, height=300, axes2d=True):
                        hm.Line(x="x", y=name)
            grid

        Args:
            columns: How many columns of equal width. Default: 2.
            gap: Space between the children. Default: 16 px.
        """
    def update(self, *,
        columns: float = ...,
        gap: float = ...,
    ) -> Self: ...

class LinkViews(Node):
    def __init__(self, *plots: Node,
        axes: TypingLiteral["x", "y", "xy"] = ...,
        scales: TypingLiteral["shared", "free"] = ...,
    ) -> None:
        """Makes 2D plots pan and zoom together, over one shared domain.

        Positional arguments are the plots to link. They are references: each stays where it is.

        Example:
            import hmplot as hm

            data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
            with hm.Scene() as scene:
                with hm.Plot(data=data, height=300, axes2d=True) as top:
                    hm.Points(x="x", y="y")
                with hm.Plot(data=data, height=300, axes2d=True) as bottom:
                    hm.Line(x="x", y="y")
                hm.LinkViews(top, bottom)
            scene

        Args:
            axes: Which axes follow when one of the plots pans or zooms. The plots are given
                positionally: hm.LinkViews(first, second). Default: "xy".
            scales: "shared" shows one domain on the linked axes, the union of the plots'
                domains (their data, or an explicit domain), so the same value lines up in each;
                "free" keeps each plot's own. A plot's explicit domain is kept either way.
                Default: "shared".
        """
    def update(self, *,
        axes: TypingLiteral["x", "y", "xy"] = ...,
        scales: TypingLiteral["shared", "free"] = ...,
    ) -> Self: ...
