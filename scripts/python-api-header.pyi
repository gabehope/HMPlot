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
