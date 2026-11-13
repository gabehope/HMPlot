from __future__ import annotations
from typing import Any, Callable, Literal as TypingLiteral

class SelectionStatus(dict[str, Any]): ...

class SelectionResource:
    """Rows chosen by clicks, brushes or code, shared by the marks and filters that name it:
    hm.selection() makes one, and each Table has its own (table.selection, .brush, .hover,
    .nearby, .nearest). rows lists the selected row indices; the update methods change it from
    Python once the scene is displayed.

    Example:
        focus = hm.selection()
        hm.Points(x="x", y="y", select=focus, respond=focus)
    """
    id: str
    @property
    def active(self) -> bool: ...
    @property
    def rows(self) -> tuple[int, ...] | dict[str, tuple[int, ...]]: ...
    def get_constraints(self, *, data: Table | IdentityResource | None = ...) -> tuple[dict[str, Any], ...]: ...
    def subscribe(self, callback: Callable[[dict[str, Any]], Any]) -> Callable[[], None]: ...
    async def update(
        self, rows: Any = ..., *,
        operation: TypingLiteral["replace", "add", "remove", "toggle", "clear"] = ...,
        data: Table | IdentityResource | None = ..., view: str | None = ...,
    ) -> Any: ...
    async def replace(self, rows: Any, *, data: Table | IdentityResource | None = ..., view: str | None = ...) -> Any: ...
    async def add(self, rows: Any, *, data: Table | IdentityResource | None = ..., view: str | None = ...) -> Any: ...
    async def remove(self, rows: Any, *, data: Table | IdentityResource | None = ..., view: str | None = ...) -> Any: ...
    async def toggle(self, rows: Any, *, data: Table | IdentityResource | None = ..., view: str | None = ...) -> Any: ...
    async def clear(self, *, data: Table | IdentityResource | None = ..., view: str | None = ...) -> Any: ...
    async def clear_columns(self, *columns: str | dict[str, Any], data: Table | IdentityResource | None = ..., view: str | None = ...) -> Any: ...

class IdentityResource:
    """Who the rows are, for selections shared across tables that show the same things:
    hm.identity(keys=...) makes one; a mark's identity= uses it.

    Example:
        rows = hm.identity(keys=["a", "b", "c"])
        hm.Points(x=[1, 2, 3], y=[3, 1, 2], identity=rows, select=True)
    """
    id: str
    keys: Any
    selection: SelectionResource
    brush: SelectionResource
    hover: SelectionResource

class Table:
    """Named columns of equal length (a dict of lists or NumPy arrays, a pandas or Polars
    DataFrame, an Arrow table), sent to the browser once and shared by every plot that reads it.
    key names the column(s) that identify a row across updates; schema types columns ({"day":
    "datetime"}). update_columns and replace send new values.

    Example:
        observations = hm.Table({"x": [1, 2], "y": [3, 4]})
        with hm.Plot(data=observations) as plot:
            hm.Points(x="x", y="y")
        observations.update_columns(y=[4, 5])
    """
    id: str
    version: int
    key: str | list[str] | None
    selection: SelectionResource
    brush: SelectionResource
    hover: SelectionResource
    schema: dict[str, Any]
    def __init__(self, value: Any, key: str | list[str] | None = ..., schema: dict[str, Any] | None = ...) -> None: ...
    @classmethod
    def from_arrow(cls, table: Any, key: str | list[str] | None = ..., schema: dict[str, Any] | None = ...) -> Table: ...
    @classmethod
    def from_parquet(cls, path: Any, columns: list[str] | None = ..., key: str | list[str] | None = ...,
                     schema: dict[str, Any] | None = ...) -> Table: ...
    grid: Any
    @classmethod
    def from_xarray(cls, obj: Any, variables: str | list[str] | None = ...) -> Table:
        """A grid table from an xarray Dataset or DataArray: a row per cell, the variables as
        columns, the dimensions' coordinates computed in the browser."""
    @classmethod
    def from_netcdf(cls, path: Any, variables: str | list[str] | None = ..., **selection: Any) -> Table:
        """A grid table from a NetCDF file: `variables`, then `.sel(**selection)`, then from_xarray."""
    def column_names(self) -> list[str]: ...
    def replace(self, value: Any, schema: dict[str, Any] | None = ...) -> Table: ...
    def update_columns(self, **values: Any) -> Table: ...
    offsets_version: int
    @property
    def offsets(self) -> Any:
        """The table's offsets as a pandas DataFrame (key, column, delta)."""
    def set_offsets(self, column: str, deltas: dict[Any, float] | Any) -> Table: ...
    def clear_offsets(self, *columns: str) -> Table: ...
    def apply_offsets(self) -> Table: ...

class Column:
    """A column with its type made explicit (hm.typed_column).

    Example:
        size = hm.typed_column(["M", "S", "L"], type="ordinal", domain=["S", "M", "L"])
    """
def typed_column(value: Any, *, type: str | None = ..., domain: list[Any] | None = ..., unit: str | None = ..., timezone: str | None = ...) -> Column:
    """A column with its type made explicit: type is "numeric", "categorical", "ordinal",
    "boolean", "datetime", "duration" or "geometry"; domain orders categories; unit and timezone
    read numbers as times.

    Example:
        size = hm.typed_column(["M", "S", "L", "M"], type="ordinal", domain=["S", "M", "L"])
        hm.Points(data={"price": [4, 2, 7, 5], "size": size}, x="size", y="price")
    """
class Literal:
    """A value used as it is, never as a column name (hm.literal).

    Example:
        hm.Points(x="x", y="y", fill=hm.literal("white"))
    """
    value: Any
EASINGS: tuple[str, ...]
"""The easing names animations take: linear, quad-in, quad-out, quad-in-out, cubic-in, cubic-out,
cubic-in-out, sine-in-out.

Example:
    hm.Points(x=hm.animate("x", easing="cubic-out"), y="y")
"""
class Animate:
    """A mark channel value that animates per row, in the channel's scale space (hm.animate). It
    must be the outermost operator on a channel; enter is the value new rows start from and exit
    the value departing rows move to; durations are in ms. Immutable.

    Example:
        hm.Points(x="x", y=hm.animate("y", duration=500, enter=0))
    """
    value: Any
    duration: float | None
    easing: str | None
    enter: Any
    exit: Any
def animate(value: Any, duration: float | None = ..., easing: TypingLiteral["linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out", "cubic-in-out", "sine-in-out"] | None = ..., enter: Any = ..., exit: Any = ...) -> Animate:
    """Animate one channel of a mark per row when its values change, in its scale's space: duration
    in ms, an easing from EASINGS, and enter and exit values for rows that arrive and leave.

    Example:
        hm.Points(x=hm.animate("x", duration=600), y="y")
    """
class CategoryScale:
    """A categorical scale shared by the marks that use it (hm.categorical): the categories
    (domain), their colors or shapes (range) and the color of others (unknown). update() changes
    it live.

    Example:
        colors = hm.categorical(domain=["A", "B"], range=["#547ba2", "#cf8955"])
        hm.Points(x="x", y="y", fill="group", fill_scale=colors)
    """
    id: str
    domain: list[Any] | None
    range: list[str] | None
    unknown: str
    label: str | None
    def update(self, *, domain: Any = ..., range: Any = ..., unknown: Any = ...) -> CategoryScale: ...
class OrdinalScale(CategoryScale):
    """Ordered categories mapped along a colormap (hm.ordinal).

    Example:
        rank = hm.ordinal(domain=["Low", "Middle", "High"], colormap="Viridis")
        hm.Points(x="x", y="y", fill="rank", fill_scale=rank)
    """
    def update(self, **values: Any) -> OrdinalScale: ...
class NormalizationResource:
    """How numbers map to 0..1 (domain and transform), shared by the scales built on it
    (hm.normalization), so a color and a size scale stay in step.

    Example:
        norm = hm.normalization(domain=[0, 100])
        colors = hm.continuous(normalization=norm, colormap="Viridis")
    """
    id: str
    version: int
    domain: list[float] | None
    transform: str
    domain_source: str
    def update(self, *, domain: Any = ..., transform: str | None = ..., domain_source: str | None = ...) -> NormalizationResource: ...
class ContinuousScale:
    """A numeric scale shared by the marks that use it (hm.continuous): a normalization, then a
    colormap (colors) or a range (sizes or widths).

    Example:
        colors = hm.continuous(domain=[0, 100], colormap="Viridis")
        hm.Points(x="x", y="y", fill="score", fill_scale=colors)
    """
    id: str
    version: int
    normalization: NormalizationResource
    range: list[float] | None
    colormap: str | None
    label: str | None
    missing: str | None
    def update(self, *, range: Any = ..., colormap: Any = ..., quantize: bool | None = ..., levels: int | None = ..., missing: str | None = ...) -> ContinuousScale: ...
class ThemeResource:
    """A theme shared by the Theme components that use it, changed live with update()
    (hm.create_theme, hm.load_theme).

    Example:
        paper = hm.create_theme(extends="paper", marks={"Line": {"width": 1.5}})
        hm.Theme(value=paper)
    """
class ThemePresets:
    """The built-in themes by name (hm.themes): hm.themes.paper, hm.themes.dark,
    hm.themes.five_thirty_eight; names() lists them.

    Example:
        hm.Theme(value=hm.themes.dark)
    """
    @property
    def minimal(self) -> dict[str, Any]: ...
    @property
    def paper(self) -> dict[str, Any]: ...
    @property
    def presentation(self) -> dict[str, Any]: ...
    @property
    def colorblind(self) -> dict[str, Any]: ...
    @property
    def dark(self) -> dict[str, Any]: ...
    @property
    def five_thirty_eight(self) -> dict[str, Any]: ...
    @property
    def finance_terminal(self) -> dict[str, Any]: ...
    @property
    def pastel(self) -> dict[str, Any]: ...
    @property
    def graph(self) -> dict[str, Any]: ...
    @property
    def sea(self) -> dict[str, Any]: ...
    @property
    def sunset(self) -> dict[str, Any]: ...
    @property
    def ggplot(self) -> dict[str, Any]: ...
    @property
    def seaborn_dark(self) -> dict[str, Any]: ...
    @property
    def notebook(self) -> dict[str, Any]: ...
    @property
    def graphing_calculator(self) -> dict[str, Any]: ...
    @property
    def observable(self) -> dict[str, Any]: ...
    @property
    def wes_anderson(self) -> dict[str, Any]: ...
    @property
    def ghibli(self) -> dict[str, Any]: ...
    @property
    def yellow_glow(self) -> dict[str, Any]: ...
    @property
    def eight_bit(self) -> dict[str, Any]: ...
    @property
    def vaporwave(self) -> dict[str, Any]: ...
    @property
    def blueprint(self) -> dict[str, Any]: ...
    @property
    def bubblegum(self) -> dict[str, Any]: ...
    @property
    def spooky(self) -> dict[str, Any]: ...
    @property
    def treasure_map(self) -> dict[str, Any]: ...
    @property
    def bureau(self) -> dict[str, Any]: ...
    @property
    def journal(self) -> dict[str, Any]: ...
    @property
    def bauhaus(self) -> dict[str, Any]: ...
    @property
    def risograph(self) -> dict[str, Any]: ...
    @property
    def tufte(self) -> dict[str, Any]: ...
    def names(self) -> tuple[str, ...]: ...
    def get(self, name: str) -> dict[str, Any]: ...
    def __getitem__(self, name: str) -> dict[str, Any]: ...
themes: ThemePresets
"""The built-in themes: pass one to Theme(value=...) or name it in create_theme(extends=...).

Example:
    hm.Theme(value=hm.themes.paper)
"""
def literal(value: Any) -> Literal:
    """A constant, even where a column of that name exists.

    Example:
        hm.Points(x="x", y="y", fill=hm.literal("white"))
    """
def categorical(**kwargs: Any) -> CategoryScale:
    """A categorical scale marks can share; see the full signature on hm.categorical.

    Example:
        colors = hm.categorical(domain=["A", "B"], range=["#547ba2", "#cf8955"])
    """
def ordinal(**kwargs: Any) -> OrdinalScale:
    """An ordinal scale marks can share; see hm.ordinal.

    Example:
        rank = hm.ordinal(domain=["Low", "Middle", "High"], colormap="Viridis")
    """
def normalization(**kwargs: Any) -> NormalizationResource:
    """A normalization scales can share; see hm.normalization.

    Example:
        norm = hm.normalization(domain=[0, 100])
    """
def continuous(**kwargs: Any) -> ContinuousScale:
    """A continuous scale marks can share; see hm.continuous.

    Example:
        colors = hm.continuous(domain=[0, 100], colormap="Viridis")
    """
def create_theme(name: str | None = ..., **sections: Any) -> ThemeResource:
    """A theme: fonts, colors, axes and mark defaults, by section, extending a preset with
    extends=.

    Example:
        paper = hm.create_theme(extends="paper", marks={"Line": {"width": 1.5}})
    """
def selection() -> SelectionResource:
    """A selection marks and filters can share.

    Example:
        focus = hm.selection()
    """
def observation_identity(*, keys: Any) -> IdentityResource:
    """An identity: who each row is, by key (hm.identity).

    Example:
        rows = hm.identity(keys=[10, 20, 30])
    """

def load_theme(path: str) -> ThemeResource:
    """A theme read from a JSON file of theme sections (as create_theme takes them).

    Example:
        theme = hm.load_theme("theme.json")
    """

COLORMAP_NAMES: tuple[str, ...]
"""The built-in colormap names a colormap= option takes (Viridis, Magma, Blues, ...).

Example:
    "Viridis" in hm.COLORMAP_NAMES
"""
class Rgb:
    """Red, green and blue columns as one color channel (hm.rgb): 0-255 for integers, 0-1 for
    floats, with an optional alpha.

    Example:
        hm.Points(x="x", y="y", fill=hm.rgb("red", "green", "blue"))
    """
    components: dict[str, Any]
    def __init__(self, r: Any, g: Any, b: Any, a: Any = ...) -> None: ...
def rgb(r: Any, g: Any, b: Any, a: Any = ...) -> Rgb:
    """Color each row from red, green and blue columns (or arrays): 0-255 for integers, 0-1 for
    floats; a is an optional alpha column.

    Example:
        hm.Points(x="x", y="y", fill=hm.rgb("red", "green", "blue"))
    """
def colormap(colors: list[str], *, space: str = ..., positions: list[float] | None = ...) -> dict[str, Any]:
    """A colormap through these colors, interpolated in space (lab by default) at positions (evenly
    spaced by default).

    Example:
        alert = hm.continuous(colormap=hm.colormap(["#e8eef4", "#f2a900", "#d7301f"], positions=[0, 0.8, 1]))
    """
BUILTIN_SHAPES: tuple[str, ...]
"""The built-in point shapes (circle, square, triangle, diamond, cross, ...), for shape= and shape
scales.

Example:
    hm.Points(x="x", y="y", shape=hm.BUILTIN_SHAPES[1])
"""
MAX_SHAPE_SEGMENTS: int
def register_shape(name: str, vertices: list[list[float]] | str, *, fill_rule: str | None = ..., view_box: list[float] | None = ...) -> str:
    """Add a point shape by name: a polygon in the unit square (x and y from -1 to 1) or an SVG
    path. Returns the name.

    Example:
        hm.register_shape("kite", [[0, 1], [0.7, 0.2], [0, -1], [-0.7, 0.2]])
        hm.Points(x="x", y="y", shape="kite")
    """
def registered_shapes() -> dict[str, Any]:
    """The shapes register_shape added, by name.

    Example:
        hm.register_shape("kite", [[0, 1], [0.7, 0.2], [0, -1], [-0.7, 0.2]])
        "kite" in hm.data.registered_shapes()
    """
