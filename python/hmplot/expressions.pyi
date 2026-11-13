from typing import Any, Literal
from collections.abc import Sequence
class Expression:
    """A per-row computation the browser runs on the GPU wherever a column goes: a mark's channel, a Calculate column, a Filter's where. Build one from hm.col, the functions here and Python's operators (+ - * / ** == != < <= > >= & | ~).

    Example:
        hm.Points(x="x", y=hm.col.y * 2 + 1)
    """
    op: str
    args: tuple[Any, ...]
    def __add__(self, other: Any) -> Expression: ...
    def __radd__(self, other: Any) -> Expression: ...
    def __sub__(self, other: Any) -> Expression: ...
    def __rsub__(self, other: Any) -> Expression: ...
    def __mul__(self, other: Any) -> Expression: ...
    def __rmul__(self, other: Any) -> Expression: ...
    def __truediv__(self, other: Any) -> Expression: ...
    def __rtruediv__(self, other: Any) -> Expression: ...
    def __pow__(self, other: Any) -> Expression: ...
    def __rpow__(self, other: Any) -> Expression: ...
    def __neg__(self) -> Expression: ...
    def __eq__(self, other: Any) -> Expression: ...  # type: ignore[override]
    def __ne__(self, other: Any) -> Expression: ...  # type: ignore[override]
    def __lt__(self, other: Any) -> Expression: ...
    def __le__(self, other: Any) -> Expression: ...
    def __gt__(self, other: Any) -> Expression: ...
    def __ge__(self, other: Any) -> Expression: ...
    def __rand__(self, other: Any) -> Expression: ...
    def __ror__(self, other: Any) -> Expression: ...
    def __and__(self, other: Any) -> Expression: ...
    def __or__(self, other: Any) -> Expression: ...
    def __invert__(self) -> Expression: ...
    # Reductions as methods, as polars writes them (TODO 144): hm.col.x.sum() is hm.sum("x").
    def sum(self, by: Any = None, *, where: Any = None) -> Expression: ...
    def mean(self, by: Any = None, *, where: Any = None) -> Expression: ...
    def min(self, by: Any = None, *, where: Any = None) -> Expression: ...
    def max(self, by: Any = None, *, where: Any = None) -> Expression: ...
    def count(self, by: Any = None, *, where: Any = None) -> Expression: ...
    def median(self, by: Any = None, *, where: Any = None) -> Expression: ...
    def std(self, by: Any = None, *, where: Any = None) -> Expression: ...
    def var(self, by: Any = None, *, where: Any = None) -> Expression: ...
    def first(self, by: Any = None, *, where: Any = None, order_by: Any = None, order: str = "asc") -> Expression: ...
    def last(self, by: Any = None, *, where: Any = None, order_by: Any = None, order: str = "asc") -> Expression: ...
    def alias(self, name: str) -> Any:
        """This expression named, for with_columns and agg (as polars' .alias)."""
class ColumnAccessor:
    """hm.col.weight, hm.col("weight") or hm.col["weight"]: a read of the column weight, which fails where the column is missing (a plain string in a mark channel is then a literal).

    Example:
        hm.Filter(where=hm.col.weight > 10)
    """
    def __call__(self, name: str) -> Expression: ...
    def __getattr__(self, name: str) -> Expression: ...
    def __getitem__(self, name: str) -> Expression: ...
col: ColumnAccessor
"""Column reads: hm.col.weight is the column weight, as an expression.

Example:
    hm.Points(x="x", y=hm.col.weight / 1000)
"""
class InputAccessor:
    """hm.input.bins reads the input named bins: its value inside an expression, and the value itself as a whole property. Any keyword takes a read, so it is typed Any. The read also writes the input: root.set("id") (the clicked or hovered row's id, for select= or hover=), root.set(hm.literal("all")) (a constant), root.reset() (its default, for select= or a Button's set=); hm.input("root", default="all") gives the default every write made from it carries.

    Example:
        hm.Slider(name="bins", min=5, max=50, value=20)
        hm.stats.Bin(x="value", bins=hm.input.bins)
        root = hm.input("root", default="all")
        hm.Rect(..., select=root.set("id"))
        hm.Button(label="Top", set=root.reset())
    """
    def __call__(self, name: str, default: Any = ...) -> Any: ...
    def __getattr__(self, name: str) -> Any: ...
    def __getitem__(self, name: str) -> Any: ...
input: InputAccessor
"""Input reads: hm.input.bins is the current value of the input named bins (a Slider, Select, Checkbox, Button or Playback); "$bins" reads it where a string names a column.

Example:
    hm.Filter(where=hm.col.mass > hm.input.threshold)
"""
class PreviousAccessor:
    """hm.prev.x: the state column x after the previous step, in a Simulate's update.

    Example:
        hm.Simulate(initial={"angle": 0}, update={"angle": hm.prev.angle + hm.col.speed * hm.view.dt / 1000})
    """
    def __call__(self, name: str) -> Expression: ...
    def __getattr__(self, name: str) -> Expression: ...
    def __getitem__(self, name: str) -> Expression: ...
prev: PreviousAccessor
"""A Simulate's previous state: hm.prev.x is the state column x after the previous step.

Example:
    hm.Simulate(initial={"angle": 0}, update={"angle": hm.prev.angle + hm.col.speed * hm.view.dt / 1000})
"""
StateName = Literal["selected", "brushed", "hovered", "nearby", "nearest", "tooltip", "any_selected", "any_brushed", "any_hovered", "any_nearby", "any_nearest", "any_tooltip", "time", "pointer_x", "pointer_y", "view_x_min", "view_x_max", "view_y_min", "view_y_max", "dt", "offset_x", "offset_y", "offset_z"]
STATE_NAMES: tuple[str, ...]
"""The names hm.view reads: the interaction flags (selected, brushed, hovered, nearby, nearest, tooltip and any_ of each), the view (time, pointer_x, pointer_y, view_x_min ... view_y_max), a Simulate's step (dt) and drag offsets (offset_x, offset_y, offset_z).

Example:
    "hovered" in hm.STATE_NAMES
"""
class StateAccessor:
    """hm.view.time: view and interaction state, one of STATE_NAMES. An unknown name fails at once.

    Example:
        hm.Points(x="x", y="y", size=hm.where(hm.view.hovered, 12, 6), hover=True)
    """
    selected: Expression
    brushed: Expression
    hovered: Expression
    nearby: Expression
    nearest: Expression
    tooltip: Expression
    any_selected: Expression
    any_brushed: Expression
    any_hovered: Expression
    any_nearby: Expression
    any_nearest: Expression
    any_tooltip: Expression
    time: Expression
    pointer_x: Expression
    pointer_y: Expression
    view_x_min: Expression
    view_x_max: Expression
    view_y_min: Expression
    view_y_max: Expression
    dt: Expression
    offset_x: Expression
    offset_y: Expression
    offset_z: Expression
    def __call__(self, name: StateName) -> Expression: ...
    def __getitem__(self, name: StateName) -> Expression: ...
view: StateAccessor
"""View and interaction state as expressions: hm.view.time (the plot's clock, ms), hm.view.hovered (the row under the pointer), hm.view.pointer_x and the rest of STATE_NAMES. Strings write it "@time".

Example:
    hm.charts.RuleX(x=hm.view.pointer_x)
"""
def categories(field: str | Expression) -> Expression:
    """A categorical column's categories, in order, for an input's options, inside the Data scope.

    Example:
        hm.Select(name="species", options=hm.categories("species"))
    """
def column_names() -> Expression:
    """The Data scope's column names, for an input's options.

    Example:
        hm.Select(name="metric", options=hm.column_names())
    """
def add(*args: Any) -> Expression:
    """a + b. A datetime plus a number of milliseconds stays a datetime. Python also writes a + b.

    Example:
        hm.Points(x="x", y=hm.add("low", "high"))
    """
def subtract(*args: Any) -> Expression:
    """a - b. Two datetimes give milliseconds; a datetime minus a number stays a datetime. Python also writes a - b.

    Example:
        hm.Points(x="x", y=hm.subtract("high", "low"))
    """
def multiply(*args: Any) -> Expression:
    """a * b. Python also writes a * b.

    Example:
        hm.Points(x="x", y=hm.multiply("price", "quantity"))
    """
def divide(*args: Any) -> Expression:
    """a / b, in float32: x / 0 is +-Infinity and 0 / 0 is NaN. Python also writes a / b.

    Example:
        hm.Points(x="x", y=hm.divide("mass", "volume"))
    """
def power(*args: Any) -> Expression:
    """a to the power b. Python also writes a ** b.

    Example:
        hm.Points(x="x", y=hm.power("x", 2))
    """
def negative(*args: Any) -> Expression:
    """-a. Python also writes -a.

    Example:
        hm.Points(x="x", y=hm.negative("y"))
    """
def abs(*args: Any) -> Expression:
    """The absolute value of a.

    Example:
        hm.Points(x="x", y=hm.abs("change"))
    """
def square(*args: Any) -> Expression:
    """a squared.

    Example:
        hm.Points(x="x", y=hm.square("error"))
    """
def sqrt(*args: Any) -> Expression:
    """The square root of a; NaN below 0.

    Example:
        hm.Points(x="x", y="y", size=hm.sqrt("area"))
    """
def log(*args: Any) -> Expression:
    """The natural logarithm of a; -Infinity at 0 and NaN below it.

    Example:
        hm.Points(x="x", y=hm.log("count"))
    """
def exp(*args: Any) -> Expression:
    """e to the power a.

    Example:
        hm.Points(x="x", y=hm.exp("rate"))
    """
def sin(*args: Any) -> Expression:
    """The sine of a, in radians.

    Example:
        hm.Line(x="t", y=hm.sin("t"))
    """
def cos(*args: Any) -> Expression:
    """The cosine of a, in radians.

    Example:
        hm.Line(x="t", y=hm.cos("t"))
    """
def floor(*args: Any) -> Expression:
    """The largest integer not above a.

    Example:
        hm.Calculate(decade=hm.floor(hm.col.year / 10) * 10)
    """
def round(*args: Any) -> Expression:
    """a rounded to the nearest integer, ties to even (0.5 is 0, 1.5 is 2), as NumPy does. hm.round, not the builtin.

    Example:
        hm.Calculate(whole=hm.round("score"))
    """
def minimum(*args: Any) -> Expression:
    """The smaller of a and b in each row; of two datetimes, a datetime.

    Example:
        hm.Points(x="x", y=hm.minimum("y", 100))
    """
def maximum(*args: Any) -> Expression:
    """The larger of a and b in each row; of two datetimes, a datetime.

    Example:
        hm.Points(x="x", y=hm.maximum("y", 0))
    """
def clip(*args: Any) -> Expression:
    """a limited to [low, high].

    Example:
        hm.Points(x="x", y=hm.clip("y", 0, 1))
    """
def equal(*args: Any) -> Expression:
    """Whether a equals b. A category column compares with a category by value. Python also writes a == b.

    Example:
        hm.Filter(where=hm.equal("species", hm.literal("Adelie")))
    """
def not_equal(*args: Any) -> Expression:
    """Whether a differs from b. Python also writes a != b.

    Example:
        hm.Filter(where=hm.not_equal("status", hm.literal("done")))
    """
def less(*args: Any) -> Expression:
    """Whether a < b. Python also writes a < b.

    Example:
        hm.Filter(where=hm.less("x", 10))
    """
def less_equal(*args: Any) -> Expression:
    """Whether a <= b. Python also writes a <= b.

    Example:
        hm.Filter(where=hm.less_equal("x", 10))
    """
def greater(*args: Any) -> Expression:
    """Whether a > b. Python also writes a > b.

    Example:
        hm.Filter(where=hm.greater("x", hm.mean("x")))
    """
def greater_equal(*args: Any) -> Expression:
    """Whether a >= b. Python also writes a >= b.

    Example:
        hm.Filter(where=hm.greater_equal("x", 0))
    """
def logical_and(*args: Any) -> Expression:
    """Whether both are true (nonzero). Python also writes a & b, with parentheses around comparisons.

    Example:
        hm.Filter(where=hm.logical_and(hm.col.x > 0, hm.col.y > 0))
    """
def logical_or(*args: Any) -> Expression:
    """Whether either is true (nonzero). Python also writes a | b.

    Example:
        hm.Filter(where=hm.logical_or(hm.col.x < 0, hm.col.y < 0))
    """
def logical_not(*args: Any) -> Expression:
    """Whether a is false (zero). Python also writes ~a.

    Example:
        hm.Filter(where=hm.logical_not(hm.is_missing("y")))
    """
def where(*args: Any) -> Expression:
    """a where the condition is true (nonzero), else b, row by row: where(condition, a, b).

    Example:
        hm.Points(x="x", y="y", size=hm.where(hm.view.selected, 12, 6), select=True)
    """
def is_missing(*args: Any) -> Expression:
    """Whether a is missing: NaN or +-Infinity in a numeric column, a missing category in a categorical one.

    Example:
        hm.Filter(where=hm.is_missing("score"))
    """
def is_finite(*args: Any) -> Expression:
    """The opposite of is_missing: a finite number, or a present category.

    Example:
        hm.Filter(where=hm.is_finite("score"))
    """
def coalesce(*args: Any) -> Expression:
    """a where it is a finite number, else the fallback (a number or another column): coalesce(a, fallback).

    Example:
        hm.Points(x="x", y=hm.coalesce("y", 0))
    """
def mean(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The mean of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead.

    Example:
        hm.Calculate(centered=hm.col.y - hm.mean("y"))
    """
def sum(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The sum of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead. hm.min/hm.max/hm.sum, not the builtins.

    Example:
        hm.Calculate(share=hm.col.sales / hm.sum("sales", by="region"))
    """
def count(value: Any = ..., by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The number of rows (or of a column's present values) of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead.

    Example:
        hm.Calculate(group_size=hm.count(by="species"))
    """
def min(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The smallest value of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead. hm.min/hm.max/hm.sum, not the builtins.

    Example:
        hm.Calculate(from_low=hm.col.y - hm.min("y"))
    """
def max(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The largest value of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead. hm.min/hm.max/hm.sum, not the builtins.

    Example:
        hm.Calculate(scaled=hm.col.y / hm.max("y", by="series"))
    """
def extent(value: Any, *, where: Any = ...) -> list[Expression]:
    """[min, max] of a column or expression over the rows where= matches, as a domain read from the data: the domain follows the data and the selection, and is automatic while no row matches.

    Example:
        hm.Plot(x={"domain": hm.extent("x", where="@brushed")})
    """
def std(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The standard deviation of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead.

    Example:
        hm.Calculate(z=(hm.col.y - hm.mean("y")) / hm.std("y"))
    """
def var(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The variance of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead.

    Example:
        hm.Calculate(spread=hm.var("y", by="group"))
    """
def median(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The median of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead.

    Example:
        hm.charts.RuleY(y=hm.median("y"))
    """
def quantile(value: Any, p: float, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The p quantile (0 to 1) of a column or expression, interpolated linearly between the two nearest values as numpy's default does; missing and nonfinite values are skipped, and hm.quantile("x", 0.5) is the median. by= reduces within each group of one or more categorical columns instead.

    Example:
        hm.Group(by="region", columns={"p90": hm.quantile("delay", 0.9)})
    """
def mode(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """The most frequent value of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead.

    Example:
        hm.Calculate(usual=hm.mode("category", by="region"))
    """
def first(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ..., order_by: str | Sequence[str] | None = ..., order: Literal["asc", "desc"] = ...) -> Expression:
    """The first value, in row order of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead.

    Example:
        hm.Calculate(change=hm.col.price - hm.first("price", by="ticker"))
    """
def last(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ..., order_by: str | Sequence[str] | None = ..., order: Literal["asc", "desc"] = ...) -> Expression:
    """The last value, in row order of a column or expression, one value broadcast over the rows; missing and nonfinite values are skipped. by= reduces within each group of one or more categorical columns instead.

    Example:
        hm.Calculate(latest=hm.last("price", by="ticker"))
    """
def is_in(value: Any, values: Any) -> Expression:
    """Whether a value is one of values: a list of numbers or categories (categories compare by value), or a multiple Select's input. An empty list is false everywhere.

    Example:
        hm.Filter(where=hm.is_in("species", ["Adelie", "Gentoo"]))
    """
def tween(value: Any, duration: float | None = ..., easing: str | None = ...) -> Expression:
    """Interpolate a value per row when it changes, in the value's own units, wherever the expression is used; unlike animate, a tween can sit anywhere inside an expression or a Calculate column. duration is in ms.

    Example:
        hm.Points(x="x", y=hm.tween("y", duration=400))
    """
def interval(value: Any, ms: float) -> Expression:
    """The view state value reads (hm.view.time) as of the last step of ms milliseconds of the view clock, so the result changes at most once per ms.

    Example:
        hm.Text(x=0, y=0, text=hm.interval(hm.view.time, 1000))
    """
def keyframes(stops: dict[float, float | list[float]], *, easing: Literal["linear", "ease-in", "ease-out", "ease-in-out", "step"] = "linear", loop: bool = False, time: Any = None) -> Expression | list[Expression]:
    """A value that moves through stops ({ms: value, ...}) as the view clock (hm.view.time) runs: each value at its time, eased between them, the first before the first time and the last after the last, or repeating with loop=True. A list of numbers gives a list. time takes any expression instead of the clock, so each row can be shifted.

    Example:
        with hm.Plot(data={"x": [1, 2, 3], "y": [1, 1, 1]}):
            hm.Points(x="x", y="y", size=hm.keyframes({0: 4, 1000: 20}),
                      opacity=hm.keyframes({0: 0, 400: 1}, time=hm.view.time - hm.row() * 200))
    """
def row() -> Expression:
    """Zero-based position among the current visible rows. Calculate it before filtering
    to preserve source positions. Use Data(rows=N) to generate rows without uploading a table.

    Example:
        with hm.Data(rows=16):
            hm.Calculate(columns={"index": hm.row()})
    """

def random(*, seed: int | Expression = ..., distribution: Literal["uniform", "normal", "exponential"] = ...) -> Expression:
    """One seeded draw per input row: uniform [0, 1), normal (mean 0, variance 1), or
    exponential (mean 1). Reusing the seed and input size reproduces the values. Generate
    a Calculate column before filtering so each source row keeps its draw.

    Example:
        with hm.Data(rows=16):
            hm.Calculate(columns={"noise": hm.random(seed=7, distribution="normal")})
    """
def offset(column: str | Expression) -> Expression:
    """Each row's offset in a numeric column, set by dragging a mark with drag or by Table.set_offsets (0 where there is none).

    Example:
        hm.Text(x="x", y="y", text=hm.offset("y"))
    """
def moved(column: str | Expression) -> Expression:
    """A numeric column plus its offsets: what a view reads to follow drags. Offsets are in the column's units.

    Example:
        hm.Points(x=hm.moved("x"), y=hm.moved("y"), drag=True)
    """
def year(value: Any, tz: str | None = ...) -> Expression:
    """The year of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(year=hm.year("date"))
    """
def quarter(value: Any, tz: str | None = ...) -> Expression:
    """The quarter (1 to 4) of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(quarter=hm.quarter("date"))
    """
def month(value: Any, tz: str | None = ...) -> Expression:
    """The month (1 to 12) of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(month=hm.month("date"))
    """
def week(value: Any, tz: str | None = ...) -> Expression:
    """The week of the year of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(week=hm.week("date"))
    """
def day(value: Any, tz: str | None = ...) -> Expression:
    """The day of the month of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(day=hm.day("date"))
    """
def weekday(value: Any, tz: str | None = ...) -> Expression:
    """The weekday, a number (Monday is 0) of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(weekday=hm.weekday("date"))
    """
def day_of_year(value: Any, tz: str | None = ...) -> Expression:
    """The day of the year of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(day_of_year=hm.day_of_year("date"))
    """
def hour(value: Any, tz: str | None = ...) -> Expression:
    """The hour of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(hour=hm.hour("date"))
    """
def minute(value: Any, tz: str | None = ...) -> Expression:
    """The minute of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(minute=hm.minute("date"))
    """
def second(value: Any, tz: str | None = ...) -> Expression:
    """The second of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.Calculate(second=hm.second("date"))
    """
def month_name(value: Any, tz: str | None = ...) -> Expression:
    """The month's name, an ordered category ("Jan" ... "Dec") of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.charts.Bar(x=hm.month_name("date"), y="sales")
    """
def day_name(value: Any, tz: str | None = ...) -> Expression:
    """The weekday's name, an ordered category ("Mon" ... "Sun") of each time in a datetime column, in the column's time zone unless tz= names one (an IANA name, "UTC" or "Local").

    Example:
        hm.charts.Bar(x=hm.day_name("date"), y="sales")
    """
def time_floor(value: Any, interval: str, tz: str | None = ...) -> Expression:
    """Each time's start of its calendar interval ("1 month", "1 week", "15 minutes"), in the column's time zone unless tz= names one; a datetime. Weeks start on Monday.

    Example:
        hm.Calculate(month=hm.time_floor("date", "1 month"))
    """
def as_category(value: Any, domain: Sequence[str | float | bool] | None = ...) -> Expression:
    """The value as categories for this use: with a domain, those, in that order, and values outside it missing; without one, the distinct values, numbers ascending.

    Example:
        hm.Points(x=hm.as_category("year"), y="value")
    """
def as_ordinal(value: Any, domain: Sequence[str | float | bool] | None = ...) -> Expression:
    """The value as ordered categories, as as_category; text needs a domain.

    Example:
        hm.Points(x=hm.as_ordinal("size", domain=["S", "M", "L"]), y="price")
    """
def as_numeric(value: Any) -> Expression:
    """The value as numbers: text parsed as numbers (once per category), booleans as 0 and 1.

    Example:
        hm.Points(x=hm.as_numeric("year"), y="value")
    """
def as_datetime(value: Any, unit: Literal["ns", "us", "ms", "s", "m", "h", "d"] | None = ..., timezone: str | None = ...) -> Expression:
    """The value as times: numbers in unit (ms by default) or ISO 8601 text, shown in timezone (UTC by default).

    Example:
        hm.Line(x=hm.as_datetime("timestamp", unit="s"), y="value")
    """
def as_duration(value: Any, unit: Literal["ns", "us", "ms", "s", "m", "h", "d"] | None = ...) -> Expression:
    """The value as durations: numbers in unit (ms by default).

    Example:
        hm.Points(x=hm.as_duration("elapsed", unit="s"), y="value")
    """

# Predicates and row-aligned column operations.
def any(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """Whether any participating value is true. Skip missing values; an empty reduction is false.
    by groups the reduction and where restricts its participants. Use hm.any, not the builtin.

    Example:
        hm.Calculate(has_large=hm.any(hm.col.amount > 10, where="@selected"))
    """
def all(value: Any, by: str | Expression | Sequence[str | Expression] | None = ..., *, where: Any = ...) -> Expression:
    """Whether every participating value is true. Skip missing values; an empty reduction is true.
    by groups the reduction and where restricts its participants. Use hm.all, not the builtin.

    Example:
        hm.Calculate(positive=hm.all(hm.col.amount > 0, by="team"))
    """
def cumsum(value: Any, *, by: str | Expression | Sequence[str | Expression] | None = ..., order_by: str | Sequence[str] | None = ..., order: Literal["asc", "desc"] = ...) -> Expression:
    """Inclusive float32 running sum in visible row order, or stable order_by within each group.
    Missing values contribute zero. Results remain aligned with the original rows.

    Example:
        hm.Calculate(running=hm.cumsum("amount", by="team", order_by="date"))
    """
def lag(value: Any, *, periods: int = ..., fill: Any = ..., by: str | Expression | Sequence[str | Expression] | None = ..., order_by: str | Sequence[str] | None = ..., order: Literal["asc", "desc"] = ...) -> Expression:
    """The previous visible value within each group, without wrapping. periods is nonnegative.
    Boundary rows use fill (typed missing by default); int32 needs an explicit integer fill.
    order_by changes calculation order while results stay aligned with their original rows.

    Example:
        hm.Calculate(previous=hm.lag("amount", fill=0, by="team", order_by="date"))
    """
def lead(value: Any, *, periods: int = ..., fill: Any = ..., by: str | Expression | Sequence[str | Expression] | None = ..., order_by: str | Sequence[str] | None = ..., order: Literal["asc", "desc"] = ...) -> Expression:
    """The next visible value within each group, without wrapping. periods is nonnegative.
    Boundary rows use fill (typed missing by default); int32 needs an explicit integer fill.
    order_by changes calculation order while results stay aligned with their original rows.

    Example:
        hm.Calculate(next_amount=hm.lead("amount", fill=0, by="team", order_by="date"))
    """
def lookup(value: Any, row: int | str | Expression, *, fill: Any = ...) -> Expression:
    """Each row's value at another row: the row numbered row (0-based) of the visible rows in
    their order, as x[parent]. A row number that is missing, not whole or past the last visible
    row reads fill (missing by default; int32 and boolean columns need one). It keeps a
    category or a datetime, and a drag cannot move a value read through it.

    Example:
        hm.Calculate(parent_x=hm.lookup("x", "parent"))
    """
def bin(field: str | Expression, bins: int | Literal["auto", "sturges", "fd", "scott"] | Sequence[Any] = ..., *, interval: str | None = ..., tz: str | None = ...) -> Expression:
    """A Group key: each row's bin of field, as hm.stats.Bin bins it (a count, a rule, or explicit
    edges; a datetime column by the calendar, with interval and tz). The Group has a row per
    bin with a visible row, with the bin's edges and center (x0, x1 and x for "x").

    Example:
        hm.Group(by=hm.bin("delay", 20), columns={"mean_distance": hm.mean("distance")})
    """
def hexbin(x: str | Expression, y: str | Expression, *, radius: float | None = ..., bins: int | None = ..., orientation: Literal["pointy", "flat"] | None = ...) -> Expression:
    """A Group key: each row's hexagon of x and y, as hm.stats.Hexbin's (a radius, or bins hexagons
    across the visible x extent). The Group has a row per hexagon with a visible row, with its
    center in x and y.

    Example:
        hm.Group(by=hm.hexbin("lon", "lat", radius=0.5), columns={"median_price": hm.median("price")})
    """
def window(value: Any, *, size: int | Expression = ..., reduce: str = ..., align: Literal["trailing", "leading", "center"] = ..., by: str | Expression | Sequence[str | Expression] | None = ..., order_by: str | Sequence[str] | None = ..., order: Literal["asc", "desc"] = ...) -> Expression:
    """A rolling reduction using Window's clipped boundaries and missing-value policies.
    size is a positive integer or scalar input expression. align selects trailing, leading,
    or centered windows. Group and order calculations keep results aligned with source rows.

    Example:
        hm.Calculate(recent_positive=hm.window(hm.col.amount > 0, size=5, reduce="all"))
    """
