"""Serializable element-wise expressions shared with the browser runtime."""
from __future__ import annotations
import math
import builtins
import numbers
from itertools import count as _counter
from .data import Animate, _animation_options, TIME_UNITS
from .connections import Connect, Endpoint

class Expression:
    __slots__ = ("op", "args")
    def __init__(self, op, *args):
        # animate() is not an expression: it may only wrap a whole mark channel (13.5).
        if builtins.any(isinstance(item, Animate) for item in args):
            raise TypeError(f"animate() must be the outermost operator on a mark channel; it cannot be an argument of {op}. "
                            "Use tween() inside expressions and Calculate.")
        # connect() is the whole value of a connector's connections, never an operand.
        if builtins.any(isinstance(item, (Connect, Endpoint)) for item in args):
            raise TypeError(f"hm.connect(...) and endpoint() values cannot be an argument of {op}; "
                            "pass hm.connect(...) as the connections property of a Line, Segments, Arrows3D, or Arrows.")
        self.op, self.args = op, tuple(args)
    def _b(self, op, other): return Expression(op, self, other)
    def _r(self, op, other): return Expression(op, other, self)
    def __add__(self, x): return self._b("add", x)
    def __radd__(self, x): return self._r("add", x)
    def __sub__(self, x): return self._b("subtract", x)
    def __rsub__(self, x): return self._r("subtract", x)
    def __mul__(self, x): return self._b("multiply", x)
    def __rmul__(self, x): return self._r("multiply", x)
    def __truediv__(self, x): return self._b("divide", x)
    def __rtruediv__(self, x): return self._r("divide", x)
    def __pow__(self, x): return self._b("power", x)
    def __rpow__(self, x): return self._r("power", x)
    def __neg__(self): return Expression("negative", self)
    def __eq__(self, x): return self._b("equal", x)
    def __ne__(self, x): return self._b("not_equal", x)
    def __lt__(self, x): return self._b("less", x)
    def __le__(self, x): return self._b("less_equal", x)
    def __gt__(self, x): return self._b("greater", x)
    def __ge__(self, x): return self._b("greater_equal", x)
    def __and__(self, x): return self._b("logical_and", x)
    def __rand__(self, x): return self._r("logical_and", x)
    def __or__(self, x): return self._b("logical_or", x)
    def __ror__(self, x): return self._r("logical_or", x)
    def __invert__(self): return Expression("logical_not", self)
    def __bool__(self):
        raise TypeError("HMPlot expressions cannot be converted to bool. Use parentheses with & and |; Python 'and', 'or', and chained comparisons are unsupported.")
    def __format__(self, spec):
        # A live value in an f-string (TODO 136.16 slice 4): hm.Title(f"Selected: {hm.count():,}")
        # leaves a marker that Title.text turns back into the expression and its format.
        return _live_marker(self, spec)
    # Reductions as methods, as polars writes them (TODO 144): hm.col.revenue.sum() is
    # hm.sum("revenue"), by= and where= as there.
    def sum(self, by=None, *, where=None): return globals()["sum"](self, by, where=where)
    def mean(self, by=None, *, where=None): return globals()["mean"](self, by, where=where)
    def min(self, by=None, *, where=None): return globals()["min"](self, by, where=where)
    def max(self, by=None, *, where=None): return globals()["max"](self, by, where=where)
    def count(self, by=None, *, where=None): return globals()["count"](self, by, where=where)
    def median(self, by=None, *, where=None): return globals()["median"](self, by, where=where)
    def std(self, by=None, *, where=None): return globals()["std"](self, by, where=where)
    def var(self, by=None, *, where=None): return globals()["var"](self, by, where=where)
    def first(self, by=None, *, where=None, order_by=None, order="asc"):
        return globals()["first"](self, by, where=where, order_by=order_by, order=order)
    def last(self, by=None, *, where=None, order_by=None, order="asc"):
        return globals()["last"](self, by, where=where, order_by=order_by, order=order)
    def alias(self, name):
        """This expression named, for with_columns and agg (as polars' .alias)."""
        from .pipeline import Aliased
        return Aliased(name, self)


# Live values waiting in f-strings, by marker number; Title.text takes them out (live_text).
_LIVE_VALUES = {}
_LIVE_IDS = _counter(1)
_LIVE_OPEN, _LIVE_CLOSE = "\ue000", "\ue001"


def _live_marker(expression, spec):
    # Markers no Title took (an f-string printed or logged) are dropped past the newest 256.
    while len(_LIVE_VALUES) >= 256:
        del _LIVE_VALUES[next(iter(_LIVE_VALUES))]
    number = next(_LIVE_IDS)
    _LIVE_VALUES[number] = (expression, spec)
    return f"{_LIVE_OPEN}{number}{_LIVE_CLOSE}"


def has_live_marker(value):
    return isinstance(value, str) and _LIVE_OPEN in value


def live_text(value):
    """An f-string's live values as Title.text parts: [str, {"value": expression, "format": spec}, ...]."""
    import re
    parts = []
    for i, piece in enumerate(re.split(f"{_LIVE_OPEN}(\\d+){_LIVE_CLOSE}", value)):
        if i % 2 == 0:
            if piece:
                parts.append(piece)
            continue
        entry = _LIVE_VALUES.pop(int(piece), None)
        if entry is None:
            raise ValueError("Title.text has a live value from an f-string that was already used; build the f-string again for each Title.")
        expression, spec = entry
        parts.append({"value": expression, "format": spec} if spec else expression)
    return parts

# Names in a column's place (R2.0; docs/DATA.md "Names"): a column (hm.col.weight, or the
# strings ":weight" and "weight"), an input (hm.input.bins, "$bins"), state (hm.view.time,
# "@time") or a literal (hm.literal("red")). Each accessor is its own expression node, so
# hm.col("$price") reads a column named $price.
STATE_NAMES = ("selected", "brushed", "hovered", "nearby", "nearest", "tooltip",
               "any_selected", "any_brushed", "any_hovered", "any_nearby", "any_nearest", "any_tooltip",
               "time", "pointer_x", "pointer_y", "view_x_min", "view_x_max", "view_y_min", "view_y_max",
               "dt", "offset_x", "offset_y", "offset_z")


class _Columns:
    """hm.col.weight, hm.col("weight") or hm.col["weight"]: a read of the column weight, which
    fails where the column is missing (a plain string in a mark channel is then a literal)."""

    def __call__(self, name):
        if not isinstance(name, str) or not name:
            raise TypeError(f"col(name) needs a column name; received {name!r}.")
        brush_bound = builtins.any(name.startswith(prefix) and name[len(prefix):] and not name[len(prefix):].startswith("@")
                          for prefix in ("@brush_min:", "@brush_max:"))
        if name.startswith("@") and not brush_bound:
            hint = f": use hm.view.{name[1:]}" if name[1:] in STATE_NAMES else ""
            raise TypeError(f"hm.col({name!r}): a column's name cannot start with @, which names state{hint}.")
        return Expression("column", name)

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return self(name)

    def __getitem__(self, name):
        return self(name)


col = _Columns()


class _State:
    """hm.view.time or hm.view("time"): view and interaction state. The names are
    hm.STATE_NAMES: interaction flags (selected, brushed, hovered, nearby, nearest, tooltip and any_
    of each), the view (time, pointer_x, pointer_y, view_x_min ... view_y_max), a Simulate's
    step (dt) and drag offsets (offset_x, offset_y, offset_z). An unknown name fails at once."""

    def __call__(self, name):
        if name not in STATE_NAMES:
            raise AttributeError(f"hm.view has no {name!r}. State names are {', '.join(STATE_NAMES)}.")
        return Expression("state", name)

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return self(name)

    def __getitem__(self, name):
        return self(name)

    def __dir__(self):
        return list(STATE_NAMES)


view = _State()


def _column_name(value, where):
    """A column-name argument (by=, offset(), categories()): hm.col.x, ":x" and "x" are "x"."""
    if isinstance(value, Expression) and value.op == "column" and isinstance(value.args[0], str):
        return value.args[0]
    if isinstance(value, str) and value.startswith(":") and len(value) > 1:
        return value[1:]
    return value


_NO_DEFAULT = object()


class InputExpression(Expression):
    """A read of an input that also makes its writes (TODO 145.7), for a mark's select or hover
    and a Button's set: root.set("id") takes the clicked or hovered row's id,
    root.set(hm.literal("all")) (or a number, a bool, a datetime, None) a constant, root.reset()
    the default. hm.input("root", default="all") gives the default every write made from it
    carries, so writers made from one input agree on it."""
    __slots__ = ("_default",)

    def __init__(self, name, default=_NO_DEFAULT):
        super().__init__("input", name)
        self._default = default

    def _write(self, what):
        out = {"input": self.args[0], **what}
        if self._default is not _NO_DEFAULT:
            out["default"] = self._default
        return out

    def set(self, source):
        from .data import Literal
        import datetime
        name = self.args[0]
        if isinstance(source, Literal):
            return self._write({"value": source.value})
        if isinstance(source, str) and source:
            return self._write({"column": source[1:] if source.startswith(":") else source})
        if isinstance(source, Expression) and source.op == "column" and isinstance(source.args[0], str):
            return self._write({"column": source.args[0]})
        if source is None or isinstance(source, (bool, numbers.Real, datetime.datetime, datetime.date)):
            return self._write({"value": source.item() if hasattr(source, "item") else source})
        raise TypeError(f"input({name!r}).set(...) takes a column whose value at the clicked or hovered row the input "
                        f"takes (\"id\", hm.col(\"id\")), or a constant (hm.literal(\"all\"), a number, a bool, a "
                        f"datetime, None); received {source!r}.")

    def reset(self):
        return self._write({"reset": True})


class _Inputs:
    """hm.input.bins reads the input named bins (TODO 41): a Slider, Select, Checkbox, Button or
    Playback in the same input context (the Scene, an InputContext, a Template) or one around
    it. Inside an expression it is the input's value; as a whole property it is replaced by the
    value, so a Select of column names in x chooses the plotted column. It also writes the input
    (InputExpression): root = hm.input("root", default="all"); Rect(select=root.set("id"))."""

    def __call__(self, name, default=_NO_DEFAULT):
        if not isinstance(name, str) or not name.isidentifier():
            raise TypeError(f"input(name) needs an input's name, an identifier such as \"bins\"; received {name!r}.")
        return InputExpression(name, default)

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return self(name)

    def __getitem__(self, name):
        return self(name)


input = _Inputs()


class _Previous:
    """hm.prev.x is the state column x after the previous step, inside a Simulate's update
    (TODO 42)."""

    def __call__(self, name):
        if not isinstance(name, str) or not name:
            raise TypeError(f"prev(name) needs a state column's name; received {name!r}.")
        return Expression("column", f"@prev:{name}")

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return self(name)

    def __getitem__(self, name):
        return self(name)


prev = _Previous()


def categories(field):
    """A categorical column's categories, in order, for an input's options (TODO 41.2):
    hm.Select(name="species", options=hm.categories("species")) inside the Data scope."""
    field = _column_name(field, "categories")
    if not isinstance(field, str):
        raise TypeError(f"categories() needs a column name; received {field!r}.")
    return Expression("categories", field)


def column_names():
    """The Data scope's column names, for an input's options: hm.Select(options=hm.column_names())."""
    return Expression("columns")
def _operation(name):
    def call(*args): return Expression(name, *args)
    call.__name__ = name
    return call

_NAMES = "add subtract multiply divide power negative abs square sqrt log exp sin cos floor round minimum maximum clip equal not_equal less less_equal greater greater_equal logical_and logical_or logical_not where is_missing is_finite coalesce".split()
globals().update({name: _operation(name) for name in _NAMES})
_REDUCTIONS = "mean sum count min max std var median mode first last any all".split()


def _reduction(name):
    """A reduction collapses a column to one value, which broadcasts over the rows.
    `by` names categorical columns and gives each row its own group's value instead."""
    op = "variance" if name == "var" else name

    def build(value, by, where, order_by, order):
        if value is None and op != "count":
            raise TypeError(f"{name}() needs a column or expression to reduce, such as hm.{name}(\"x\").")
        options = _column_options(name, by=by, order_by=order_by, order=order)
        args = [value]
        if options or where is not None:
            args.append({"$expression_options": options})
        if where is not None:
            args.append(where)
        return Expression(op, *args)

    if op in ("first", "last"):
        def call(value=None, by=None, *, where=None, order_by=None, order="asc"):
            return build(value, by, where, order_by, order)
    else:
        def call(value=None, by=None, *, where=None):
            return build(value, by, where, None, "asc")

    call.__name__ = name
    call.__qualname__ = name
    call.__doc__ = (f"{name} of a column or expression; missing and nonfinite values are skipped. "
                    "Pass by= to reduce within each group of one or more categorical columns.")
    return call


def _column_options(name, *, by=None, order_by=None, order="asc"):
    options = {}
    for key, value in (("by", by), ("orderBy", order_by)):
        if value is None:
            continue
        value = [_column_name(item, key) for item in value] if isinstance(value, (list, tuple)) else _column_name(value, key)
        if not (isinstance(value, str) and value or isinstance(value, list) and value and builtins.all(isinstance(item, str) and item for item in value)):
            raise TypeError(f"{name} {key} must be a column name or a list of column names.")
        options[key] = value
    if order not in ("asc", "desc") or order_by is None and order != "asc":
        raise TypeError(f"{name} order needs order_by and 'asc' or 'desc'.")
    if order_by is not None:
        options["order"] = order
    return options


def quantile(value, p, by=None, *, where=None):
    """The p quantile (0 to 1) of a column or expression, interpolated linearly between the two
    nearest values as numpy's default does; missing and nonfinite values are skipped, and
    hm.quantile("x", 0.5) is the median. Pass by= to reduce within each group.

    Example:
        hm.Group(by="region", columns={"p90": hm.quantile("delay", 0.9)})
    """
    if value is None:
        raise TypeError('quantile() needs a column or expression to reduce, such as hm.quantile("x", 0.9).')
    if isinstance(p, bool) or not isinstance(p, numbers.Real):
        raise TypeError('quantile needs p, a probability from 0 to 1, such as hm.quantile("x", 0.9).')
    if not 0 <= p <= 1:
        raise ValueError('quantile needs p, a probability from 0 to 1, such as hm.quantile("x", 0.9).')
    options = _column_options("quantile", by=by)
    options["p"] = float(p)
    args = [value, {"$expression_options": options}]
    if where is not None:
        args.append(where)
    return Expression("quantile", *args)


def cumsum(value, *, by=None, order_by=None, order="asc"):
    """Inclusive float32 running total; results retain original row alignment."""
    return Expression("cumsum", value, {"$expression_options": _column_options("cumsum", by=by, order_by=order_by, order=order)})


def _neighbor(name, value, periods, fill, by, order_by, order):
    if isinstance(periods, bool) or not isinstance(periods, int) or periods < 0:
        raise TypeError(f"{name} periods must be a nonnegative integer; use {'lead' if name == 'lag' else 'lag'} for the opposite direction.")
    options = _column_options(name, by=by, order_by=order_by, order=order)
    options.update(periods=periods, fill=fill)
    return Expression(name, value, {"$expression_options": options})


def lag(value, *, periods=1, fill=None, by=None, order_by=None, order="asc"):
    """Previous visible observation within each group; int32 requires an explicit integer fill."""
    return _neighbor("lag", value, periods, fill, by, order_by, order)


def lead(value, *, periods=1, fill=None, by=None, order_by=None, order="asc"):
    """Next visible observation within each group; never wraps across groups."""
    return _neighbor("lead", value, periods, fill, by, order_by, order)


def lookup(value, row, *, fill=None):
    """Each row's value at another row: the row numbered row (0-based) of the visible rows in
    their order, as x[parent]. A row number that is missing, not whole or past the last visible
    row reads fill (missing by default; int32 and boolean columns need one). It keeps a category
    or a datetime, and a drag cannot move a value read through it.

    Example:
        hm.Calculate(parent_x=hm.lookup("x", "parent"))
    """
    if value is None or row is None:
        raise TypeError('lookup() needs a column and a row number, such as hm.lookup("x", "parent").')
    return Expression("lookup", value, row, {"$expression_options": {"fill": fill}})


_BIN_RULES = ("auto", "sturges", "fd", "scott")


def bin(field, bins=30, *, interval=None, tz=None):  # noqa: A001
    """A Group key: each row's bin of `field`, as hm.stats.Bin bins it (a count, a rule such as
    "sturges", or explicit edges; a datetime column by the calendar, with interval and tz).
    hm.Group(by=hm.bin("x", 20)) has a row per bin with a row, with x0, x1 and x."""
    name = _column_name(field, "bin field")
    if not isinstance(name, str) or not name:
        raise TypeError('bin() field must be a column name, such as hm.bin("x", 20).')
    if hasattr(bins, "tolist") and not isinstance(bins, Expression):
        bins = bins.tolist()  # NumPy edges
    if not ((isinstance(bins, int) and not isinstance(bins, bool) and bins > 0) or (isinstance(bins, str) and bins in _BIN_RULES)
            or (isinstance(bins, (list, tuple)) and len(bins) > 1)):
        raise TypeError(f"bin() bins must be a positive integer, a rule ({', '.join(_BIN_RULES)}) or explicit edges; got {bins!r}.")
    options = {"bins": list(bins) if isinstance(bins, (list, tuple)) else bins}
    if interval is not None:
        options["interval"] = interval
    if tz is not None:
        options["tz"] = tz
    return Expression("bin", name, {"$expression_options": options})


def hexbin(x, y, *, radius=None, bins=None, orientation=None):
    """A Group key: each row's hexagon of x and y, as hm.stats.Hexbin's (a radius, or `bins` hexagons
    across the x extent). hm.Group(by=hm.hexbin("x", "y")) has a row per hexagon with a row,
    with x and y, its center."""
    names = [_column_name(x, "hexbin x"), _column_name(y, "hexbin y")]
    if not builtins.all(isinstance(name, str) and name for name in names):
        raise TypeError('hexbin() x and y must be column names, such as hm.hexbin("x", "y").')
    if radius is not None and not (isinstance(radius, (int, float)) and not isinstance(radius, bool) and radius > 0):
        raise TypeError("hexbin() radius must be a positive number.")
    if bins is not None and not (isinstance(bins, int) and not isinstance(bins, bool) and bins > 0):
        raise TypeError("hexbin() bins must be a positive integer.")
    if orientation not in (None, "pointy", "flat"):
        raise TypeError('hexbin() orientation must be "pointy" or "flat".')
    options = {key: value for key, value in (("radius", radius), ("bins", bins), ("orientation", orientation)) if value is not None}
    return Expression("hexbin", *names, {"$expression_options": options})


def window(value, *, size=5, reduce="mean", align="trailing", by=None, order_by=None, order="asc"):
    """Window's clipped rolling reduction as a row-aligned expression."""
    if not isinstance(size, Expression) and (isinstance(size, bool) or not isinstance(size, int) or size < 1):
        raise TypeError("window size must be a positive integer or an input expression.")
    if reduce not in ("count", "sum", "mean", "min", "max", "first", "last", "variance", "std", "any", "all") or align not in ("trailing", "leading", "center"):
        raise TypeError("window needs a supported reducer and trailing, leading or center alignment.")
    options = _column_options("window", by=by, order_by=order_by, order=order)
    options.update(reduce=reduce, align=align)
    return Expression("window", value, {"$expression_options": options}, size)


globals().update({name: _reduction(name) for name in _REDUCTIONS})


def extent(value, *, where=None):
    """[min, max] of a column or expression over the rows `where` matches, as a domain read
    from the data: x={"domain": hm.extent("x", where="@brushed")} zooms to the brushed rows
    and follows the brush (automatic while no row matches).

    Example:
        hm.Plot(x={"domain": hm.extent("x", where="@brushed")})
    """
    return [_reduction("min")(value, where=where), _reduction("max")(value, where=where)]


def tween(value, duration=None, easing=None, **unsupported):
    """Interpolate a value per row wherever the expression is used, in the value's own units.
    Unlike animate, a tween can sit anywhere inside an expression or a Calculate column."""
    if unsupported:
        if {"enter", "exit"} & set(unsupported):
            raise TypeError("tween() has no enter/exit; only animate() supports enter and exit values.")
        raise TypeError(f"tween() got an unexpected keyword argument {next(iter(unsupported))!r}.")
    duration, easing = _animation_options("tween", duration, easing)
    options = {}
    if duration is not None:
        options["duration"] = duration
    if easing is not None:
        options["easing"] = easing
    return Expression("tween", value, {"$expression_options": options})


def interval(value, ms):
    """The view state value reads (hm.view.time) as of the last step of ms milliseconds of the
    view clock, so the result changes at most once per ms: @time reads floor(time / ms) * ms.
    Every interval with one period steps on the same frame; data columns inside apply at once."""
    if isinstance(ms, bool) or not isinstance(ms, (int, float)) or not math.isfinite(ms) or ms < 1:
        raise TypeError(f"interval() needs a period in milliseconds, a finite number of at least 1; received {ms!r}.")
    return Expression("interval", value, {"$expression_options": {"period": ms}})


_EASINGS = ("linear", "ease-in", "ease-out", "ease-in-out", "step")


def _eased(p, easing):
    if easing == "ease-in":
        return p * p
    if easing == "ease-out":
        return 1 - (1 - p) * (1 - p)
    if easing == "ease-in-out":
        return (1 - Expression("cos", p * math.pi)) / 2
    if easing == "step":
        return Expression("floor", p)
    return p


def keyframes(stops, *, easing="linear", loop=False, time=None):
    """A value that moves through `stops` ({ms: value, ...}) as the view clock (hm.view.time)
    runs: each value at its time, eased between them (easing "linear", "ease-in", "ease-out",
    "ease-in-out" or "step"), the first before the first time and the last after the last, or
    repeating with loop=True. A value is a number, or a list of numbers (a position), giving a
    list. `time` takes any expression instead of the clock, so each row can be shifted:
    opacity=hm.keyframes({0: 0, 400: 1}, time=hm.view.time - hm.row() * 20) staggers a reveal.
    Built from existing expressions, so it drives any channel, Calculate column or Filter
    threshold; it never blocks settlement and is frozen in exports, as hm.view.time is.

    Example:
        with hm.Plot(data={"x": [1, 2, 3], "y": [1, 1, 1]}):
            hm.Points(x="x", y="y", size=hm.keyframes({0: 4, 1000: 20}),
                      opacity=hm.keyframes({0: 0, 400: 1}, time=hm.view.time - hm.row() * 200))
    """
    if not isinstance(stops, dict) or len(stops) < 2:
        raise TypeError("keyframes() takes {time_ms: value, ...} with at least two stops.")
    if easing not in _EASINGS:
        raise ValueError(f"keyframes() easing is one of {', '.join(_EASINGS)}; received {easing!r}.")
    times = sorted(stops)
    if not builtins.all(isinstance(t, numbers.Real) and not isinstance(t, bool) and math.isfinite(t) for t in times):
        raise TypeError("keyframes() stop times are finite numbers of milliseconds.")
    values = [stops[t] for t in times]
    width = [len(v) if isinstance(v, (list, tuple)) else None for v in values]
    if len(set(width)) != 1:
        raise TypeError("keyframes() values are all numbers or all lists of the same length.")
    clock = view.time if time is None else time
    start, end = times[0], times[-1]
    if loop:
        span = end - start
        clock = start + (clock - start) - Expression("floor", (clock - start) / span) * span

    def component(vals):
        out = vals[0]
        for (a, va), (b, vb) in zip(zip(times, vals), zip(times[1:], vals[1:])):
            if vb == va:
                continue
            p = Expression("clip", (clock - a) / (b - a), 0, 1)
            out = out + (vb - va) * _eased(p, easing)
        return out if isinstance(out, Expression) else Expression("add", out, 0)

    if width[0] is None:
        return component(values)
    return [component([v[i] for v in values]) for i in range(width[0])]


def row():
    """Zero-based position among the current visible rows. Calculate it before filtering
    to preserve source positions. Use Data(rows=N) to generate rows without uploading a table.

    Example:
        with hm.Data(rows=16):
            hm.Calculate(columns={"index": hm.row()})
    """
    return Expression("row")


def random(*, seed=0, distribution="uniform"):
    """One seeded draw per row on the GPU: uniform [0, 1), normal (mean 0, variance 1),
    or exponential (mean 1). The same seed, distribution and input size reproduce the draws.
    Use different seeds for independent streams. Generate in Calculate before Filter/Sample
    to preserve each source row's value. The seed may be a scalar input, never a table column.

    Example:
        with hm.Data(rows=16):
            hm.Calculate(columns={"noise": hm.random(seed=7, distribution="normal")})
    """
    if not isinstance(seed, Expression):
        if (isinstance(seed, bool) or not isinstance(seed, numbers.Real)
                or seed < 0 or seed > 4294967295 or not math.isfinite(seed) or int(seed) != seed):
            raise ValueError("random() seed must be an integer from 0 to 4294967295; pass a number or a scalar input, not a table column.")
        seed = int(seed)
    if distribution not in ("uniform", "normal", "exponential"):
        raise ValueError('random() distribution must be "uniform", "normal" or "exponential"; pass a standard distribution name.')
    return Expression("random", seed, {"$expression_options": {"distribution": distribution}})


def _offset_column(op, name):
    name = _column_name(name, op)
    if not isinstance(name, str) or not name or name.startswith("@"):
        raise TypeError(f"{op}() needs the name of a table column, such as {op}(\"weight\") or {op}(hm.col.weight).")
    return name


def offset(column):
    """Each row's offset in a numeric column, set by dragging a mark with drag or by
    Table.set_offsets (0 where there is none)."""
    return Expression("offset", _offset_column("offset", column))


def moved(column):
    """A numeric column plus its offsets: what a view reads to follow drags, as in
    x=hm.moved("weight"). Offsets are in the column's units, so hm.log(hm.moved("weight"))
    moves through a log."""
    return Expression("moved", _offset_column("moved", column))


_CALENDAR = "year quarter month week day weekday day_of_year hour minute second month_name day_name".split()
_INTERVAL = __import__("re").compile(r"^\s*(\d+)\s*(millisecond|second|minute|hour|day|week|month|year)s?\s*$")


def _zone(op, tz):
    """A time zone for tz=: an IANA name, "UTC" or "Local"; None keeps the column's own."""
    if tz is None or tz in ("UTC", "Local"):
        return tz
    if not isinstance(tz, str) or not tz:
        raise TypeError(f"{op}() tz= is a time zone name such as \"Europe/Paris\"; received {tz!r}.")
    import zoneinfo
    try:
        zoneinfo.ZoneInfo(tz)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        raise ValueError(f"{op}(): unknown time zone {tz!r}.") from None
    return tz


def _calendar(name):
    def call(value, tz=None):
        options = {"tz": _zone(name, tz)} if tz is not None else {}
        return Expression(name, value, {"$expression_options": options})

    call.__name__ = name
    kind = ("an ordered category (\"Jan\" ... \"Dec\")" if name == "month_name" else
            "an ordered category (\"Mon\" ... \"Sun\")" if name == "day_name" else
            "a number (Monday is 0)" if name == "weekday" else "a number")
    call.__doc__ = (f"The {name.replace('_', ' ')} of each time in a datetime column, {kind}, in the column's time "
                    "zone unless tz= names one (TODO 53.1).")
    return call


globals().update({name: _calendar(name) for name in _CALENDAR})


def time_floor(value, interval, tz=None):
    """Each time's start of its calendar interval ("1 month", "1 week", "15 minutes"), in the
    column's time zone unless tz= names one; a datetime. Weeks start on Monday."""
    if not isinstance(interval, str) or not _INTERVAL.match(interval):
        raise ValueError(f"time_floor() needs an interval such as \"15 minutes\" or \"1 month\"; received {interval!r}.")
    options = {"interval": interval.strip()}
    if tz is not None:
        options["tz"] = _zone("time_floor", tz)
    return Expression("time_floor", value, {"$expression_options": options})


# Casts (R2.0): one use of a value typed, where a schema types a column for its whole scope. The
# result carries its type to scales, legends, brushes and tooltips.
_CASTS = "as_category as_ordinal as_numeric as_datetime as_duration".split()
_UNITS = TIME_UNITS


def _domain(op, domain):
    if domain is None:
        return None
    if isinstance(domain, (str, bytes)) or not hasattr(domain, "__iter__"):
        raise TypeError(f"{op}() domain is a list of categories (text, numbers or booleans).")
    values = [v.item() if hasattr(v, "item") else v for v in domain]
    if not values or not builtins.all(isinstance(v, (str, int, float, bool)) for v in values):
        raise TypeError(f"{op}() domain is a list of categories (text, numbers or booleans).")
    if len({(type(v).__name__, str(v)) for v in values}) != len(values):
        raise ValueError(f"{op}() domain values must be unique.")
    return values


def _unit(op, unit):
    if unit is not None and unit not in _UNITS:
        raise ValueError(f"{op}() unit is one of {', '.join(_UNITS)}; received {unit!r}.")
    return unit


def _cast(op, value, **options):
    return Expression(op, value, {"$expression_options": {k: v for k, v in options.items() if v is not None}})


def as_category(value, domain=None):
    """Categories: with a domain, those, in that order, and values outside it missing (matched
    on the GPU, with no read back; colors stay put when a category is absent). Without one, the
    distinct values, numbers ascending."""
    return _cast("as_category", value, domain=_domain("as_category", domain))


def as_ordinal(value, domain=None):
    """Ordered categories, as as_category; text needs a domain (low, medium, high)."""
    return _cast("as_ordinal", value, domain=_domain("as_ordinal", domain))


def as_numeric(value):
    """Numbers: text parsed as numbers (once per category), booleans as 0 and 1."""
    return _cast("as_numeric", value)


def as_datetime(value, unit=None, timezone=None):
    """Times: numbers in unit (ms by default: ns, us, ms, s, m, h, d) or ISO 8601 text, shown
    in timezone (UTC by default)."""
    return _cast("as_datetime", value, unit=_unit("as_datetime", unit), timezone=_zone("as_datetime", timezone) if timezone is not None else None)


def as_duration(value, unit=None):
    """Durations: numbers in unit (ms by default)."""
    return _cast("as_duration", value, unit=_unit("as_duration", unit))


def is_in(value, values):
    # An input read (a multiple Select's list, TODO 41) is replaced by its values in the browser.
    if isinstance(values, Expression): return Expression("is_in", value, values)
    if isinstance(values, (str, bytes)): raise TypeError("is_in values must be an explicit collection.")
    return Expression("is_in", value, {"$expression_literals": list(values)})

# min, max, sum, round, any and all stay out of __all__ so `from hmplot import *` does not shadow the
# Python builtins; they remain available through hmplot's namespace (hmplot imports them
# by name).
_BUILTIN_NAMES = ("min", "max", "sum", "round", "any", "all")
__all__ = ["Expression", "col", *[name for name in _NAMES if name not in _BUILTIN_NAMES],
           *[name for name in _REDUCTIONS if name not in _BUILTIN_NAMES], "quantile", "is_in", "extent", "tween", "interval", "keyframes", "random", "row",
           "cumsum", "lag", "lead", "window", "lookup", "hexbin", "categories", "column_names", "offset", "moved", *_CALENDAR, "time_floor", *_CASTS]
