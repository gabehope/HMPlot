from __future__ import annotations
import asyncio
import contextvars
import inspect
import json
import warnings
import threading
import math
import numbers
import logging
import re
import weakref
from collections import deque
from dataclasses import replace as _replace_field
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import datetime
from .data import registered_shapes, _validated_colormap
from .data import Table, Column as DataColumn, CategoryScale, OrdinalScale, ContinuousScale, NormalizationResource, ThemeResource, SelectionResource, IdentityResource, Literal, Rgb, Animate, typed_column, column_values, identity, is_array_like, is_dataframe, _holds_animate
from .expressions import Expression, _column_name, STATE_NAMES, has_live_marker, live_text, _NO_DEFAULT
from .netcdf import record_buffer_limit
from .presentation import presentation_value
from .plugins import scene_plugins
from .axes import axis_value, check_frame_guides
from .connections import (Connect, Endpoint, CONNECTION_KINDS, CONNECTION_CHANNELS, _endpoint, _holds_connection,
                          _check_consumer, connections_kind_error, connections_value_error,
                          connections_channel_error, connections_series_error, connections_nested_error,
                          endpoint_value_error)
from . import graph_data


class SceneError(RuntimeError):
    def __init__(
        self, message, *, code="frontend", target=None, revision=None,
        component=None, property=None, scope=None, field=None, shape=None,
        suggestion=None, details=None,
    ):
        super().__init__(message)
        self.code = code
        self.target = target
        self.revision = revision
        self.component = component
        self.property = property
        self.scope = scope
        self.field = field
        self.shape = shape
        self.suggestion = suggestion
        self.details = details or {}


REGISTRY = json.loads(Path(__file__).with_name("registry.json").read_text())
_stack = contextvars.ContextVar("heatmap_stack", default=())
# The Templates whose build() is running, innermost last; hm.slot() belongs to the last.
_building = contextvars.ContextVar("heatmap_template_build", default=())
_logger = logging.getLogger(__name__)
_transaction = contextvars.ContextVar("heatmap_transaction", default=None)
_NO_TEMPLATE_DEFAULT = object()


class TemplateParam:
    """An explicit value supplied when a portable template is instantiated."""

    def __init__(self, name, default=_NO_TEMPLATE_DEFAULT):
        if not isinstance(name, str) or not name.isidentifier() or name.startswith("_"):
            raise ValueError("template_param(name): name must be a public Python identifier.")
        self.name, self.default = name, default

    def __bool__(self):
        raise TypeError(f"Template parameter {self.name!r} cannot choose a Python branch; bind it before export.")

    def _binary(self, op, other):
        return Expression(op, self, other)

    def _reverse(self, op, other):
        return Expression(op, other, self)

    def __add__(self, other): return self._binary("add", other)
    def __radd__(self, other): return self._reverse("add", other)
    def __sub__(self, other): return self._binary("subtract", other)
    def __rsub__(self, other): return self._reverse("subtract", other)
    def __mul__(self, other): return self._binary("multiply", other)
    def __rmul__(self, other): return self._reverse("multiply", other)
    def __truediv__(self, other): return self._binary("divide", other)
    def __rtruediv__(self, other): return self._reverse("divide", other)
    def __pow__(self, other): return self._binary("power", other)
    def __rpow__(self, other): return self._reverse("power", other)
    def __neg__(self): return Expression("negative", self)
    def __eq__(self, other): return self._binary("equal", other)
    def __ne__(self, other): return self._binary("not_equal", other)
    def __lt__(self, other): return self._binary("less", other)
    def __le__(self, other): return self._binary("less_equal", other)
    def __gt__(self, other): return self._binary("greater", other)
    def __ge__(self, other): return self._binary("greater_equal", other)


def template_param(name: str, default=_NO_TEMPLATE_DEFAULT) -> TemplateParam:
    """Expose one value in a portable template; unmarked arguments stay fixed."""
    return TemplateParam(name, default)


def _has_template_param(value):
    if isinstance(value, TemplateParam):
        return True
    if isinstance(value, Expression):
        return any(_has_template_param(item) for item in value.args)
    if isinstance(value, dict):
        return any(_has_template_param(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_has_template_param(item) for item in value)
    return False


def owner():
    try:
        task = asyncio.current_task()
    except RuntimeError:
        task = None
    return (threading.get_ident(), id(task))


def active_transaction():
    tx = _transaction.get()
    if tx is not None and tx.owner != owner():
        raise RuntimeError(
            "Create a separate Scene in concurrent tasks; an active construction belongs to another task."
        )
    return tx


class Transaction:
    def __init__(self):
        self.owner = owner()
        self.saved = {}
        self.scenes = set()
        self.autosaves = []

    def remember(self, obj, keys):
        for key in keys:
            token = (id(obj), key)
            if token not in self.saved:
                v = getattr(obj, key)
                self.saved[token] = (
                    obj,
                    key,
                    v.copy() if isinstance(v, (list, dict, set)) else v,
                )

    def rollback(self):
        for obj, key, value in reversed(list(self.saved.values())):
            setattr(obj, key, value)


@contextmanager
def transaction():
    existing = active_transaction()
    if existing is not None:
        yield existing
        return
    tx = Transaction()
    token = _transaction.set(tx)
    try:
        yield tx
        for scene in tx.scenes:
            scene._validate()
    except BaseException:
        tx.rollback()
        raise
    else:
        for scene in tx.scenes:
            scene._publish()
        if tx.autosaves:
            # Context exits are synchronous by design. The exporter drives Chrome
            # from a worker thread so this is also safe inside the event loop used
            # by Jupyter kernels.
            from .exporter import save_context_exports

            save_context_exports(tx.autosaves)
    finally:
        _transaction.reset(token)


def camel(name):
    # Python spells a guide's `for` target= (R2.0), on Legend and Minimap alike.
    if name == "target":
        return "for"
    if name == "as_":
        return "as"
    parts = name.split("_")
    return parts[0] + "".join(s[:1].upper() + s[1:] for s in parts[1:])


# A list or array in one of these props is per-row data. `shape` is included so a list of
# shape names becomes a column; a bare shape name string still passes through as a literal.
CHANNELS = set(
    "position previous start end x y z x0 x1 y0 y1 z0 z1 fill color size width height depth lower upper baseline value dx dy rotation shapeField shape outlineWidth outlineColor outlineOpacity".split()
)

# Channels animate() may wrap: the per-row channels, plus opacity (a per-row field in the
# browser that a list does not turn into a column here).
ANIMATE_CHANNELS = CHANNELS | {"opacity"}
_ANIMATE_RULE = "animate() must be the outermost operator on a mark channel"


def _check_bands(bands):
    """Bands (TODO 46): the structure JavaScript's validateBands checks, with its messages."""
    import datetime
    if not isinstance(bands, (list, tuple)):
        raise ValueError("Bands must be a list.")
    for band in bands:
        if not isinstance(band, dict):
            raise ValueError("Each band is an object: { axis, from, to }.")
        if band.get("axis") not in ("x", "y"):
            raise ValueError(f'A band\'s axis is "x" or "y"; received {json.dumps(band.get("axis"))}.')
        for end in ("from", "to"):
            value = band.get(end)
            if not (isinstance(value, (str, datetime.date, datetime.datetime)) or
                    (isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value))):
                raise ValueError("A band's from and to are each a number, a date, or an ISO date such as "
                                 f'"2024-03-01" or "2024-03-01T12:00:00Z"; received {value!r}.')
        opacity = band.get("opacity")
        if opacity is not None and not (isinstance(opacity, (int, float)) and 0 <= opacity <= 1):
            raise ValueError("A band's opacity must be between 0 and 1.")


def _check_row_widths(widths):
    """A Row's widths (TODO 69.16): a positive share per child, as SceneNode.svelte reads them."""
    if not (isinstance(widths, (list, tuple)) and widths and all(
            isinstance(share, numbers.Real) and not isinstance(share, bool) and math.isfinite(share) and share > 0
            for share in widths)):
        raise ValueError(f"Row widths must be a list of positive numbers, each child's share of the row in order, "
                         f"such as widths=[3, 2]; received {widths!r}.")


_COMPONENT_NAMES = {}


def _component_names(kind):
    """The public properties and declared settings accepted by this component."""
    if kind not in _COMPONENT_NAMES:
        component = REGISTRY["components"].get(kind, {})
        _COMPONENT_NAMES[kind] = (
            frozenset(component.get("properties", ())),
            frozenset(component.get("runtimeOptions", ())),
        )
    return _COMPONENT_NAMES[kind]


def accepted_property(kind, key):
    """Return the protocol name of a declared component property or setting."""
    if key == "for_":
        return None
    name = "target" if key == "target" and kind not in ("Legend", "Minimap") else camel(key)
    # The prop positional arguments set (the registry's positional), though no keyword does:
    # LinkViews' plots (Node.__init__).
    if name == REGISTRY["components"].get(kind, {}).get("positional"):
        return name
    public, settings = _component_names(kind)
    return name if name in public or name in settings else None


def _moved(kind, key):
    """Where a keyword R2.0 removed went, for its error; None for any other keyword."""
    if kind == "Arrows" and key == "lit":
        return "Arrows is screen-sized and unlit: use hm.Arrows3D for lit solid arrows."
    if kind == "Lollipop" and _snake(key) in ("stem_color", "stem_width"):
        field = "color" if _snake(key) == "stem_color" else "width"
        return f'Pass stem={{"{field}": ...}} for the stems\' own Segments props.'
    if kind == "Area" and key == "baseline":
        return "Area uses lower and upper: pass lower instead of baseline and upper instead of y."
    if key in ("offset_x", "offsetX", "offset_y", "offsetY"):
        return f"Pass {'dx' if key in ('offset_x', 'offsetX') else 'dy'} for a pixel offset."
    if kind == "LayoutGrid" and key in ("x", "y", "values", "resolution", "method", "bounds"):
        return "Grid is a layout; interpolation is hm.Interpolate(x=..., values=...)."
    if kind in ("Force", "Tree", "DAG", "Pack", "Treemap", "Sankey") and key in ("source", "target", "nodes", "node_key"):
        return "Pass the edges (and nodes, if any) and their ID columns to hm.GraphData() above the layout."
    if kind == "Group" and key == "reduce":
        return 'Reductions are expressions: columns={"mean_x": hm.mean("x")}.'
    if kind in ("Bin", "Hexbin") and key == "reduce":
        return 'Reductions are expressions: columns={"mean_y": hm.mean("y")}.'
    if kind == "Pivot" and key == "reduce":
        return 'The value is a reduction: value=hm.mean("x").'
    if kind == "Nodes" and key in ("data", "key"):
        return "Supply nodes and node_key to hm.GraphData(), or use hm.Join() inside hm.Nodes()."
    # fillDomain (the removed JS spelling) gets the same hint as fill_domain.
    flat_scale = re.fullmatch(r"(fill|color|size|width|height)_(domain|range|transform)", _snake(key))
    if flat_scale and (flat_scale.group(1) != "height" or kind == "GeoJSON"):
        channel, part = flat_scale.groups()
        example = {"domain": "domain=[lo, hi]", "transform": 'transform="log"'}.get(part) or (
            "colormap=[...]" if channel in ("fill", "color") else "range=[lo, hi]")
        categories = "" if channel == "height" else (
            f" (hm.categorical(domain=...{', range=...' if part == 'range' else ''}) for categories)")
        return f"A channel's scale is one object: {channel}_scale=hm.continuous({example}){categories}."
    if key in ("display_scale", "displayScale") and kind != "Minimap":
        return "Set the marks' pixel sizes (size, width, outline_width, dash, cap and head sizes, offsets) directly."
    if kind == "Plot" and key == "fog":
        return 'Fog is an effect: effects=[hm.effect("fog", near=50, far=200)].'
    if kind in ("Plot", "Facet"):
        if key == "axes":
            return 'axes2d=True draws the axes (axes3d=True a 3D box); x={...}, y={...} and z={...} configure them.'
        flat = re.fullmatch(r"([xyz])_?(bounds|range|scale|transform)", key) or re.fullmatch(r"axis_label_([xyz])()", key)
        if flat:
            field = {"bounds": "domain", "": "label"}.get(flat.group(2), flat.group(2))
            return f"A plot's axes are its x, y and z: {flat.group(1)}={{\"{field}\": ...}}."
    return None


def _unknown_property(kind, key):
    import difflib
    moved = _moved(kind, key)
    name = "Grid" if kind == "LayoutGrid" else kind
    if moved:
        return TypeError(f"{name}: unknown property {key!r}. {moved}")
    names = _component_names(kind)
    # Suggest an advertised name first; fall back to the component's runtime options.
    for known in names:
        python_names = {_snake(name): name for name in known}
        close = difflib.get_close_matches(key, list(python_names), n=1, cutoff=0.6)
        if close:
            break
    hint = f" Did you mean {close[0]!r}?" if close else ""
    return TypeError(f"{name}: unknown property {key!r}.{hint}")


def _snake(name):
    if name == "for":
        return "target"
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)).lower()


# Dict-valued options such as Plot(x={...}) and Frame(placement={...}) (TODO 34.4c). Their keys
# are snake_case in Python, like keywords, and camelCase in the browser, which rejects a key it
# does not know ("Unknown x axis property tick_count") only after the scene is sent. The
# registry lists each option type's keys (from publicTypes.ts), so keys are converted and
# checked here.
_OBJECTS = REGISTRY.get("objects", {})
_OBJECT_PROPS = REGISTRY.get("objectProps", {})
# Components whose own module normalizes and validates their props (R11): Node._set calls its
# normalize_property for each property, then normalize and validate_component; Scene._validate
# calls its validate_scene.
_FEATURES = {graph_data.KIND: graph_data}


def _object_value(where, names, value):
    """``value`` with its keys in camelCase, checked against the option types ``names``."""
    if isinstance(value, (list, tuple)):
        return type(value)(_object_value(where, names, item) for item in value)
    if not isinstance(value, dict):
        return value
    keys = {}
    for name in names:
        for key, nested in _OBJECTS[name].items():
            keys.setdefault(key, []).extend(nested)
    converted = {}
    for key, item in value.items():
        # Plain snake_case to camelCase: keywords' special names (target) are not keys.
        name = re.sub(r"_([a-z0-9])", lambda m: m.group(1).upper(), key) if isinstance(key, str) else key
        if name not in keys:
            import difflib
            accepted = [_snake(k) for k in keys]
            close = difflib.get_close_matches(_snake(str(key)), accepted, n=1, cutoff=0.6)
            hint = f" Did you mean {close[0]!r}?" if close else ""
            raise ValueError(f"{where}: unknown key {key!r}.{hint} Accepted keys: {', '.join(accepted)}.")
        if name in converted:
            raise ValueError(f"{where}: {key!r} repeats the key {_snake(name)!r} in another spelling.")
        converted[name] = _object_value(f"{where}.{_snake(name)}", keys[name], item) if keys[name] else item
    return converted


def _clock_time(time):
    """A set_time value: None (resume) or a finite, nonnegative number of milliseconds."""
    if time is None:
        return None
    if (isinstance(time, bool) or not isinstance(time, numbers.Real)
            or not math.isfinite(time) or time < 0):
        raise TypeError("set_time needs a finite, nonnegative number of milliseconds, or None to resume.")
    return float(time)


def _viewport_patch(state=None, fields=None):
    supplied = {**(state or {}), **(fields or {})}
    aliases = {"zoom_x": "zoomX", "zoom_y": "zoomY"}
    patch = {aliases.get(key, key): value for key, value in supplied.items()}
    allowed = {"x", "y", "zoom", "zoomX", "zoomY", "center"}
    unknown = set(patch) - allowed
    if unknown:
        raise TypeError(f"set_viewport does not accept {', '.join(sorted(unknown))}.")
    normalized = {}
    for key, value in patch.items():
        if key == "center":
            if not isinstance(value, (list, tuple, np.ndarray)) or np.ndim(value) != 1 or len(value) != 2 or any(
                isinstance(item, (bool, np.bool_)) or not isinstance(item, numbers.Real)
                or not math.isfinite(item) for item in value
            ):
                raise TypeError("set_viewport center needs two finite angular values.")
            normalized[key] = [float(item) for item in value]
        else:
            if isinstance(value, (bool, np.bool_)) or not isinstance(value, numbers.Real) or not math.isfinite(value):
                raise TypeError(f"set_viewport {key} needs a finite number.")
            if key.startswith("zoom") and value <= 0:
                raise ValueError(f"set_viewport {key} must be positive.")
            normalized[key] = float(value)
    return normalized


FRAME_PLACEMENT_VERSION = 1


def _versioned_placement(placement):
    version = placement.get("version", FRAME_PLACEMENT_VERSION)
    if isinstance(version, bool) or version != FRAME_PLACEMENT_VERSION:
        raise ValueError(
            f"Frame: unsupported placement version {version!r}; expected {FRAME_PLACEMENT_VERSION}."
        )
    return {**placement, "version": FRAME_PLACEMENT_VERSION}


_FRAME_KINDS = frozenset(("Frame", "Plot"))


def _drag_keys(payload, table):
    """A drag event's ``key`` and ``keys`` (TODO 38.5): its rows' keys as ``table.offsets`` and
    ``set_offsets`` name them (a tuple for several key columns), or the rows without a key."""
    keys = table._row_keys() if table is not None else None
    key = (lambda row: row if keys is None or row is None or not 0 <= row < len(keys) else keys[row])
    payload["key"] = key(payload.get("row"))
    payload["keys"] = [key(row) for row in payload.get("rows", [])]


def _enclosing_frame(node):
    """Nearest Frame (or the Plot's implicit root frame) containing ``node``."""
    current = node.parent if node is not None else None
    while current is not None and current.kind not in _FRAME_KINDS:
        current = current.parent
    return current


# Legend channel and position names, generated from the JavaScript lists (registry.json).
LEGEND_CHANNELS = tuple(REGISTRY["legendChannels"])
LEGEND_POSITIONS = tuple(REGISTRY["legendPositions"])


def _legend_position(where, value):
    if value not in LEGEND_POSITIONS:
        raise ValueError(f"{where}: position must be one of {', '.join(LEGEND_POSITIONS)}; got {value!r}.")
    return value


def _guide_value(kind, name, value):
    """Validate Legend channel/position and Plot/Facet legend values; returns the protocol value.

    A snake_case channel name (``outline_color``) is accepted as its camelCase protocol name.
    """
    if kind == "Legend" and name == "channel" and value is not None:
        channel = camel(value) if isinstance(value, str) else value
        if channel not in LEGEND_CHANNELS:
            raise ValueError(f"Legend: channel must be one of {', '.join(LEGEND_CHANNELS)}; got {value!r}.")
        return channel
    if kind == "Legend" and name == "position" and value is not None:
        return _legend_position("Legend", value)
    if kind in ("Plot", "Facet") and name == "legend" and value is not None:
        cell = kind == "Facet"
        if isinstance(value, bool) or (cell and value == "cell"):
            return value
        if isinstance(value, dict):
            # Its keys were checked with the other option dicts (_object_value).
            if value.get("position") is not None:
                _legend_position(f"{kind} legend", value["position"])
            return value
        choices = 'True, False, "cell", or {"position": ...}' if cell else 'True, False, or {"position": ...}'
        raise ValueError(f"{kind}: legend must be {choices}; got {value!r}.")
    return value


def snapshot_prop(key, value, where=None, nested=False):
    # `where` names the prop in errors; `nested` marks values inside a list or dict, where an
    # animate() never belongs (see _check_animate_placement for the top level).
    if (isinstance(value, Animate) and nested) or (isinstance(value, Literal) and _holds_animate(value.value)):
        raise TypeError(f"{where or 'Property'}: {_ANIMATE_RULE}, not nested inside a list, dict, or literal.")
    # connect() is the whole value of a connector's `connections` (Node._set checks which
    # property); an endpoint only ever sits inside a connect().
    if (isinstance(value, Connect) and nested) or (isinstance(value, Literal) and _holds_connection(value.value)):
        raise TypeError(connections_nested_error(where))
    if isinstance(value, Endpoint):
        raise TypeError(endpoint_value_error(where))
    if isinstance(value, TemplateParam):
        return value
    if isinstance(value, Node):
        # A reference names a drawn node; a template stands for its main part or its single
        # top-level node.
        return value._reference(where or "Property")
    if isinstance(value, (Table, CategoryScale, ContinuousScale, NormalizationResource, ThemeResource, SelectionResource, IdentityResource, Literal, DataColumn, Expression, Rgb, Animate, Connect)):
        return value
    if is_dataframe(value):
        raise TypeError(f"{where or 'Property'}: a DataFrame is a table, not a column; pass it as data=, "
                        "or one of its columns (df[\"name\"]).")
    if is_array_like(value):
        # A pandas Series or Index, a Polars Series, or another array-like: one column, converted
        # as the same column of a Table is (TODO 40.1). A named Series titles its axis; a pandas
        # Series keeps its index for the check against the plotted DataFrame's (_check_series_index).
        name = getattr(value, "name", None)
        series = type(value).__module__.startswith("pandas") and type(value).__name__ == "Series"
        return _replace_field(column_values(value), name=name if isinstance(name, str) and name else None,
                              pandas_index=value.index if series else None)
    if (
        isinstance(value, np.ndarray)
        or key in CHANNELS
        and isinstance(value, (list, tuple))
    ):
        try:
            return typed_column(value)
        except (TypeError, ValueError):
            if _holds_connection(value):
                raise TypeError(connections_nested_error(where)) from None
            raise
    if (
        isinstance(value, dict)
        and isinstance(value.get("type"), str)
        and value["type"]
        in (
            "FeatureCollection",
            "Feature",
            "Point",
            "MultiPoint",
            "LineString",
            "MultiLineString",
            "Polygon",
            "MultiPolygon",
            "GeometryCollection",
        )
    ):
        import copy

        structured = copy.deepcopy(value)
        json.dumps(structured, allow_nan=False)
        return DataColumn(
            identity("geometry"),
            (len(value.get("features", [value])),),
            "geojson",
            structured=structured,
        )
    if isinstance(value, dict):
        return {k: snapshot_prop("", v, where, True) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [snapshot_prop("", v, where, True) for v in value]
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(
            f"{key or 'Property'} must be finite; missing data belongs in an array."
        )
    if callable(value):
        raise TypeError(
            "Use on_click/on_event to register Python callbacks; functions cannot be scene properties."
        )
    if isinstance(value, (datetime.date, np.datetime64)):
        # A time (an input's bounds or value, TODO 53.3): sent as {"$datetime": ms}.
        return value
    if isinstance(value, np.generic):
        return value.item()
    if value is not None and not isinstance(value, (str, int, float, bool)):
        raise TypeError(
            f"{where or 'Property'}: unsupported value of type {type(value).__name__}. Pass a number, "
            "string, boolean, list, NumPy array, pandas or Polars Series, or an hm expression."
        )
    return value

# Marks whose `data` is an existing geometry input (VectorTile: decoded tiles, TODO 24).
DIRECT_DATA_MARKS = {"Image", "GeoJSON", "VectorTile"}
# A VectorTile shown alone is a basemap: a 2D Mercator map with the style's exact colors.
_VECTOR_TILE_PLOT = {"height": 480, "coordinates": "spherical",
                     "projection": "mercator", "toneMapping": 0}
# Python-only data shortcut for every other mark. The mark list comes from the registry the
# signature generator writes, so a new mark (compound or not) is displayable without a hand edit.
DISPLAYABLE_MARKS = set(REGISTRY["marks"]) - DIRECT_DATA_MARKS
# What must sit inside a Plot: every mark in the registry.
PLOT_CONTENT = frozenset(REGISTRY["marks"])
# Charts of several Plots (the registry's figure flag, TODO 136.16: Marginals): one sits where a
# Plot does, takes data= as a Plot does, and draws its children in one of its Plots.
FIGURE_KINDS = frozenset(kind for kind, spec in REGISTRY["components"].items() if spec.get("figure"))


def _check_animate_placement(kind, key, name, value):
    """animate() is the whole value of a channel of a mark or Mapping (13.5). Expressions
    refuse it when they are built, and snapshot_prop when it is nested in a list or dict."""
    if isinstance(value, Animate):
        if kind not in DISPLAYABLE_MARKS and kind != "Mapping":
            raise TypeError(f"{kind}.{key}: {_ANIMATE_RULE}, and {kind} is not a mark; "
                            "use tween() inside expressions and Calculate.")
        if name not in ANIMATE_CHANNELS:
            raise TypeError(f"{kind}.{key}: {_ANIMATE_RULE}, and {key} is not a channel.")
    elif kind == "Calculate" and name == "columns" and isinstance(value, dict):
        output = next((output for output, item in value.items() if isinstance(item, Animate)), None)
        if output is not None:
            raise TypeError(f"Calculate column {output}: animate() belongs on a mark channel, "
                            "not a Calculate output; use tween() here.")


_CAMERA_VECTORS = ("cameraPosition", "cameraTarget", "cameraUp")
_CAMERA_FIELDS = ("position", "target", "up", "fov", "near", "far", "zoom", "mode")


def _check_connections_value(kind, value):
    """`connections` belongs to Line, Segments, Arrows3D, and Arrows, and takes one
    hm.connect(...) descriptor (or None to go back to positional channels)."""
    if kind not in CONNECTION_KINDS:
        raise TypeError(connections_kind_error(kind))
    if value is not None and not isinstance(value, Connect):
        nested = isinstance(value, (list, tuple, dict, Literal)) and _holds_connection(value)
        raise TypeError(connections_nested_error(f"{kind}.connections") if nested else connections_value_error(kind))


# Facet fields/pairs (TODO 21): the structural rules of src/lib/plot/utils/facetSpec.js
# normalizeFacetSpec, with its messages (registry.json "facet"). Rules that need the data
# (missing or non-numeric columns) are the browser's.
_FACET = REGISTRY.get("facet", {"errors": {}, "triangles": ["full", "upper", "lower"]})


def _facet_error(name, **values):
    import re
    return ValueError(re.sub(r"\{(\w+)\}", lambda m: str(values[m.group(1)]) if m.group(1) in values else m.group(0),
                             _FACET["errors"][name]))


def _tooltip_value(kind, value):
    """A tooltip setting (TODO 44), checked as the browser checks it: True or False, a list of
    fields (column names or {field, label, format}), or {fields, radius} and, on a Plot, mode="x".
    A content snippet is Svelte's; Python lists fields."""
    where = f"{kind}.tooltip"

    def field(item):
        if isinstance(item, str):
            return item
        if isinstance(item, dict) and isinstance(item.get("field"), str):
            unknown = set(item) - {"field", "label", "format"}
            if unknown:
                raise ValueError(f"{where} fields take field, label and format, not {sorted(unknown)[0]}.")
            return dict(item)
        raise ValueError(f"{where} fields are column names or {{'field': ..., 'label': ..., 'format': ...}}.")

    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (list, tuple)):
        return [field(item) for item in value]
    if isinstance(value, dict):
        if "content" in value:
            raise ValueError(f"{where}: content is a Svelte snippet; in Python, choose the fields (and their labels and formats).")
        accepted = {"fields", "radius", *(["mode"] if kind == "Plot" else [])}
        unknown = set(value) - accepted
        if unknown:
            raise ValueError(f"{where} takes {', '.join(sorted(accepted))}, not {sorted(unknown)[0]}.")
        radius = value.get("radius", 16)
        if isinstance(radius, bool) or not isinstance(radius, (int, float)) or not radius >= 0:
            raise ValueError(f"{where}.radius must be a number of pixels, 0 or more.")
        if value.get("mode", "row") not in ("row", "x"):
            raise ValueError(f'{where}.mode must be "row" (the default) or "x".')
        converted = dict(value)
        if "fields" in value:
            converted["fields"] = [field(item) for item in value["fields"]]
        return converted
    raise ValueError(f"{where} must be True, a list of fields, or a dict of fields and radius.")


# The channels the automatic legend explains when they read data.
_LEGEND_CHANNELS = ("fill", "color", "size", "shape", "opacity", "outlineColor")


# A Facet with no Plot above it and marks below it stands for Facet(Plot(children)) (TODO
# 129.2): a grid of small multiples, as if the cell Plot had been written. The Python tree keeps
# the user's shape; the scene sent to the browser has the Plot, with these props and an id from
# the Facet's.
_CELL_PLOT_PROPS = {"height": 450, "autoBounds": True}


def _is_plot_like(node):
    """A Plot, or a figure (TODO 136.16: Marginals), which draws the marks below it in a Plot of
    its own: the marks and inputs below either are inside a Plot."""
    return node.kind == "Plot" or node.kind in FIGURE_KINDS


def _bare_plot_content(node):
    """The marks below `node` with no Plot or figure between."""
    found, stack = [], list(node.children)
    while stack:
        child = stack.pop()
        if _is_plot_like(child):
            continue
        if child.kind in PLOT_CONTENT:
            found.append(child)
        stack.extend(child.children)
    return found


def _facet_cell_plot(node):
    """Whether `node` is a Facet that stands for Facet(Plot(children))."""
    if node.kind != "Facet":
        return False
    parent = node.parent
    while parent is not None:
        if _is_plot_like(parent):
            return False
        parent = parent.parent
    return bool(_bare_plot_content(node))


def _cell_plot_id(facet):
    return f"{facet.id}-cell-plot"


def _refresh_implicit_legend(scene):
    """The automatic legend of a standalone mark's implicit Plot (TODO 129.1): shown when the mark
    has something to explain, since a mark that maps nothing and has no label would leave an
    empty strip. Kept current: an update can map a column. VectorTile's Plot keeps its own."""
    plot = scene.children[0] if len(scene.children) == 1 else None
    if plot is None or plot.kind != "Plot" or len(plot.children) != 1:
        return
    mark = plot.children[0]
    if mark._implicit is scene and mark.kind != "VectorTile":
        plot.props["legend"] = _explains_itself(mark)


def _explains_itself(mark):
    """Whether a standalone mark's automatic legend draws anything: it has a label, or one of its
    legend channels reads data (an expression, or a string naming a column of its table)."""
    if mark.props.get("label") is not None:
        return True
    table = mark._local_data
    names = set(table.column_names()) if isinstance(table, Table) else set()
    for key in _LEGEND_CHANNELS:
        value = mark.props.get(key)
        if isinstance(value, Expression) or (isinstance(value, str) and value in names):
            return True
    return False


def _pipeline_reference(value, owner):
    """A transform node in a data= place (TODO 142.3): its live output, read where the owner is
    (serialized as {"$ref": id}; the browser reads the transform's mounted output, never a copy).
    An hm.Data is its table (TODO 144: sales = hm.Data(df) starts a chain and is drawn as data=sales,
    so a brush there is the one sales.filter("@brushed") reads). Any other node is an error."""
    if value.kind == "Data":
        source = value.props.get("value")
        if isinstance(source, (Table, Node)):
            # A detached hm.Data read as data= is a source, as a chain's root is, not a display.
            if value.parent is None and value._implicit is None:
                value._chain_root = True
            return source
        raise TypeError(f"{owner}: data= takes an hm.Data that holds a table (hm.Data(df)); this one has none.")
    if REGISTRY["components"].get(value.kind, {}).get("group") != "Transforms":
        raise TypeError(f"{owner}: data= takes a table or a transform's output (hm.Filter, hm.Group, "
                        f"hm.Calculate, ...); a {value.kind} has no output to read.")
    return value


def _column_names(value):
    """Column names as strings: hm.col.x and ":x" are "x", in lists and dicts of lists too."""
    if isinstance(value, dict):
        return {k: _column_names(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_column_name(v, "") for v in value]
    return _column_name(value, "")


def _name_list(value):
    return (isinstance(value, (list, tuple)) and len(value) > 0
            and all(isinstance(v, str) and v for v in value) and len(set(value)) == len(value))


def _check_join(props):
    """A Join's settings against its table (TODO 43): what Python can check before the browser runs
    it. The keys of the table it joins to are checked there, since that table is in another node."""
    how = props.get("how")
    if how is not None and how not in ("left", "inner"):
        raise TypeError(f'Join how must be "left" or "inner", not {how!r}.')
    if "on" in props and ("leftOn" in props or "rightOn" in props):
        raise TypeError("Join takes on= or left_on= and right_on=, not both.")
    right = props.get("rightOn", props.get("on"))
    if right is None or ("leftOn" in props) != ("rightOn" in props):
        raise TypeError("Join requires on=, or left_on= and right_on=: the key columns.")
    table = props.get("data")
    if isinstance(table, Node):
        # Another transform's live output (TODO 140): its columns are known in the browser.
        _pipeline_reference(table, "Join")
        return
    if not isinstance(table, Table):
        raise TypeError("Join requires data=, the table (or a transform's output) to join.")
    names = [right] if isinstance(right, str) else list(right)
    for name in [*names, *(props.get("fields") or [])]:
        if name not in table.column_names():
            raise ValueError(f"Join: the joined table has no column {name!r}.")


def _check_facet_spec(props):
    """Raise ValueError for a Facet's fields/pairs/triangle/diagonal/as combination."""
    row, column = props.get("row") or None, props.get("column") or None
    fields, pairs = props.get("fields"), props.get("pairs")
    triangle, diagonal, rename = props.get("triangle"), props.get("diagonal"), props.get("as")
    wrap = props.get("wrap")

    def check_wrap(dimensions):
        if wrap is not None and (not isinstance(wrap, int) or isinstance(wrap, bool) or wrap < 1 or dimensions > 1):
            raise _facet_error("wrap")

    def check_as(names):
        if rename is None:
            return
        if not isinstance(rename, dict) or any(key not in names for key in rename):
            raise _facet_error("as")
        final = dict(names)
        for key, value in rename.items():
            if value is None:
                continue
            if not isinstance(value, str) or not value or value.startswith("@"):
                raise _facet_error("asNames")
            final[key] = value
        if len(set(final.values())) != len(final):
            raise _facet_error("asNames")

    if pairs is not None:
        if row or column or fields is not None:
            raise _facet_error("pairsCombine")
        if isinstance(pairs, (list, tuple)):
            if not _name_list(pairs):
                raise _facet_error("pairs")
        elif isinstance(pairs, dict):
            if set(pairs) - {"x", "y"} or not _name_list(pairs.get("x")) or not _name_list(pairs.get("y")):
                raise _facet_error("pairs")
            if triangle is not None:
                raise _facet_error("triangleXY")
        else:
            raise _facet_error("pairs")
        if triangle is not None and triangle not in _FACET["triangles"]:
            raise _facet_error("triangle")
        if diagonal is not None and not isinstance(diagonal, bool):
            raise _facet_error("diagonal")
        check_wrap(2)
        check_as({"x": "x", "y": "y"})
        return
    if triangle is not None or diagonal is not None:
        raise _facet_error("pairsOnly")
    if fields is not None:
        if isinstance(fields, (list, tuple)):
            dimension, names = "column", fields
        elif isinstance(fields, dict) and len(fields) == 1 and next(iter(fields)) in ("row", "column"):
            dimension, names = next(iter(fields.items()))
        else:
            raise _facet_error("fields")
        if not _name_list(names):
            raise _facet_error("fields")
        other, split = ("column", row) if dimension == "row" else ("row", column)
        if split:
            raise _facet_error("fieldsDimension", dimension=dimension, other=other, field=split)
        order = props.get("rowOrder" if dimension == "row" else "columnOrder")
        if order is not None and (not isinstance(order, (list, tuple)) or len(set(order)) != len(order)):
            raise _facet_error("order")
        check_wrap(2 if row or column else 1)
        check_as({"value": "value", "field": "field"})
        return
    if rename is not None:
        raise _facet_error("as")


def _camera_vector(name, value):
    """Three floats for camera_position/camera_target/camera_up: numpy arrays and tuples become
    plain lists (a numpy array would otherwise snapshot as a data column)."""
    if value is None:
        return None
    # Expressions of inputs (hm.where(hm.input.tiles, -9, 90)) are evaluated in the browser (TODO 69.10).
    if isinstance(value, (list, tuple)) and any(isinstance(v, Expression) for v in value):
        if len(value) != 3:
            raise ValueError(f"{name} must be three numbers [x, y, z], not {len(value)} values.")
        return list(value)
    try:
        values = [float(v) for v in np.asarray(value, dtype=float).reshape(-1)]
    except (TypeError, ValueError):
        raise TypeError(f"{name} must be three numbers [x, y, z].") from None
    if len(values) != 3 or not all(np.isfinite(v) for v in values):
        raise ValueError(f"{name} must be three finite numbers [x, y, z], not {len(values)} values.")
    return values


def _provider_params(value, at="params"):
    """A Provider's params as JSON-compatible plain values (the browser keys requests by them)."""
    if at == "params":
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise TypeError("Provider params must be a dict.")
    if isinstance(value, np.generic):
        value = value.item()
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    # An input read (params={"year": hm.input.year}, TODO 41.5): the browser replaces it by the
    # input's value, so a change of the input loads again.
    if isinstance(value, Expression) and value.op == "input":
        return value
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError(f"Provider params keys must be strings; {at} has {key!r}.")
            out[key] = _provider_params(item, f"{at}[{key!r}]")
        return out
    if isinstance(value, (list, tuple)):
        return [_provider_params(item, f"{at}[{i}]") for i, item in enumerate(value)]
    raise TypeError(
        f"Provider params must be plain values (numbers, strings, booleans, None, lists and dicts) or input reads (hm.input.name); "
        f"{at} is a {type(value).__name__}."
    )



def _initialize_detached_node(node, kind, *, parent=None):
    """Initialize node-owned state without validating props or entering the active context.

    Normal construction, implicit plots and portable-template skeletons share these fields.
    Callers attach children and decode properties only after this state exists.
    """
    node.kind = kind
    node.id = identity(kind.lower())
    node.parent = parent
    node.children = []
    node.props = {}
    node._callbacks = {}
    node._built_callbacks = []
    node._implicit = None
    node._local_data = None
    node._data_scope_id = identity("data")
    node._contexts = []
    node._autosave = None
    node._by_context = False


class Node:
    """A component. Positional arguments to a container are its children: hm.Plot(points) puts
    points in the plot. Keywords that take a component (target=, hm.connect's endpoints) refer to
    it without moving it. A component created inside a `with` block is attached to that block;
    add() attaches explicitly. A component has one parent."""

    kind = "Node"

    def __init__(self, *children, **props):
        _initialize_detached_node(self, self.kind)
        # Explicit placement may move a node attached by an open `with` block.
        filename = props.pop("filename", None)
        export_options = props.pop("export_options", None)
        if (filename is not None or export_options is not None) and self.kind not in (
            "Plot",
            "Facet",
            "Scene",
        ):
            raise TypeError(
                "filename and export_options are supported by Plot, Facet, and Scene."
            )
        if export_options is not None and filename is None:
            raise TypeError("export_options requires filename.")
        if export_options is not None and not isinstance(export_options, dict):
            raise TypeError("export_options must be a dictionary.")
        self._autosave = None
        if filename is not None:
            from .exporter import context_export_request

            self._autosave = context_export_request(
                self, filename, export_options or {}
            )
        # What positional arguments set besides a container's children (the registry's positional,
        # TODO 40.3): Data's value, LinkViews' plots, Title's and Markdown's text.
        positional = REGISTRY["components"].get(self.kind, {}).get("positional")
        if positional == "value" and children and not isinstance(children[0], Node):
            # hm.Data(table): the first positional argument may be the data; the others are children.
            props["value"], *children = children
        if self.kind == "Data":
            value = props.get("value")
            if isinstance(value, Node):
                props["value"] = _pipeline_reference(value, "Data")
            elif value is not None:
                props["value"] = value if isinstance(value, (Table, TemplateParam)) else Table(value, key=props.get("key"), schema=props.get("schema"))
        if positional == "plots":
            props["plots"] = list(children)
            children = ()
        if positional == "text" and children:
            # hm.Title("...") and hm.Markdown("..."): the text, not children (TODO 46).
            if len(children) > 1 or not isinstance(children[0], str) or "text" in props:
                raise TypeError(f'{self.kind} takes its text as one string: hm.{self.kind}("...") or text="...".')
            props["text"], children = children[0], ()
        if self.kind == "Plot":
            # The renderer derives responsiveness from width, including after an update.
            props = {"height": 450, "auto_bounds": True, **props}
        self._set(props)
        stack = _stack.get()
        if stack:
            if stack[-1][1] != owner():
                raise RuntimeError("Cannot attach to a context owned by another task.")
            stack[-1][0]._attach(self, explicit=False)
        with transaction():
            for child in children:
                self.add(child)

    def _set(self, props, *, from_browser=False):
        feature = _FEATURES.get(self.kind)
        if self.kind == "Data" and not _has_template_param({**self.props, **props}):
            _check_data_rows({**self.props, **props})
        for key, value in props.items():
            if key == "connections":
                _check_connections_value(self.kind, value)
            k = accepted_property(self.kind, key)
            if k is None:
                raise _unknown_property(self.kind, key)
            # Python keywords are snake_case only (R2.0); the browser's edits arrive camelCase.
            if not from_browser and key != _snake(key):
                raise TypeError(f"{self.kind}: {key!r} is spelled {_snake(key)!r} in Python; keywords are snake_case.")
            if _has_template_param(value):
                self.props[k] = value
                continue
            _check_position_list(self.kind, k, value)
            _check_scale_value(self.kind, k, value)
            if has_live_marker(value):
                if self.kind != "Title" or k != "text":
                    raise ValueError(f"{self.kind}.{_snake(k)}: an expression in an f-string is a live value, which only "
                                     f"Title.text shows (hm.Title(f\"Selected: {{hm.count(where='@brushed'):,}}\")).")
                value = live_text(value)
            if self.kind in ("Plot", "Facet") and k == "type" and isinstance(value, str) and value not in ("2d", "3d", "3d-y-up"):
                hint = (f' For a {value} chart use coordinates="{value}".'
                        if value in ("polar", "spherical") else "")
                raise ValueError(f'{self.kind}.type is "2d", "3d" or "3d-y-up"; received {value!r}.{hint}')
            # Any mode, a value or an input (TODO 130.3): the keyword goes, so every use is told.
            if self.kind == "DensityContour" and k == "mode" and value is not None and not from_browser:
                warnings.warn("DensityContour.mode is deprecated and will be removed: DensityContour draws lines; use "
                              "hm.charts.DensityBands for filled bands (its theme entry is DensityBands).", FutureWarning, stacklevel=3)
            if self.kind == "VectorTile" and k == "zoomBias" and value is not None and not isinstance(value, Expression):
                if isinstance(value, (bool, np.bool_)) or not isinstance(value, numbers.Real) or not math.isfinite(value) or abs(value) > 4:
                    raise ValueError("VectorTile.zoom_bias must be a finite number between -4 and 4; use 0 for automatic detail.")
            if k in ("outlineWidth", "outlineOpacity") and isinstance(value, (numbers.Real, np.bool_)):
                valid = not isinstance(value, (bool, np.bool_)) and math.isfinite(value) and value >= 0
                if k == "outlineOpacity":
                    valid = valid and value <= 1
                if not valid:
                    bounds = "between 0 and 1" if k == "outlineOpacity" else "at least 0"
                    raise ValueError(f"{self.kind}.{_snake(k)} must be a finite number {bounds}; pass a numeric column or array for row values.")
            # An unknown colormap name fails here, before a browser draws (TODO 136.13).
            if k == "colormap" and value is not None and not isinstance(value, Expression):
                try:
                    _validated_colormap(value)
                except (TypeError, ValueError) as error:
                    raise type(error)(f"{self.kind}.colormap: {error}") from None
            if k == "tooltip":
                self.props[k] = _tooltip_value(self.kind, value)
                continue
            # Structured browser edits receive the same validation as Python updates.
            options = _OBJECT_PROPS.get(self.kind, {}).get(k)
            if options:
                value = _object_value(f"{self.kind}.{key}", options, value)
            if self.kind == "Tree" and k in ("enter", "exit"):
                if not isinstance(value, dict):
                    raise TypeError(f"Tree.{key}: pass a dict with numeric node_width, layer_height, or edge_length endpoints.")
                for field, endpoint in value.items():
                    if isinstance(endpoint, (bool, np.bool_)) or not isinstance(endpoint, numbers.Real) or not math.isfinite(endpoint) or endpoint < 0:
                        raise ValueError(f"Tree.{key}.{_snake(field)} must be a finite, nonnegative number.")
            if k == "placement" and isinstance(value, dict):
                value = _versioned_placement(value)
            if k in _CAMERA_VECTORS:
                value = _camera_vector(key, value)
            _check_animate_placement(self.kind, key, k, value)
            value = _guide_value(self.kind, k, value)
            value = axis_value(self.kind, k, value)
            # A Plot's effects and a mark's glow (TODO 37, 138.3): checked as the browser checks
            # them; the sky's image encoded for the browser.
            value = presentation_value(self.kind, k, value)
            if k == "data" and self.kind in DISPLAYABLE_MARKS:
                self._local_data = (_pipeline_reference(value, self.kind) if isinstance(value, Node)
                                    else value if isinstance(value, Table) or value is None else Table(value))
                continue
            if k == "data" and (self.kind in ("Plot", "Facet", "Join") or self.kind in FIGURE_KINDS) and value is not None:
                value = (_pipeline_reference(value, self.kind) if isinstance(value, Node)
                         else value if isinstance(value, (Table, TemplateParam))
                         else Table(value, key=props.get("key"), schema=props.get("schema")))
            if feature is not None:
                value = feature.normalize_property(self, k, value, props, from_browser)
            if self.kind == "Provider" and k == "initial" and value is not None and not isinstance(value, Table):
                value = Table(value, key=props.get("key", self.props.get("key")), schema=props.get("schema", self.props.get("schema")))
            if self.kind == "Provider" and k == "params":
                value = _provider_params(value)
            # A Text3D's or an input's props are plain values, never data columns: an
            # input's list value (Select with multiple=True) or options stay lists.
            plain = self.kind in ("Text3D", *INPUT_KINDS)
            self.props[k] = snapshot_prop(
                "" if plain else k,
                value.tolist() if plain and isinstance(value, np.ndarray) else value,
                f"{self.kind}.{key}",
            )
        # hm.col.species names the column as "species" does (R2.0); Facet and Join check names here.
        if self.kind in ("Facet", "Join"):
            for k in ("row", "column", "fields", "pairs", "on", "leftOn", "rightOn"):
                if k in self.props:
                    self.props[k] = _column_names(self.props[k])
        if self.kind == "Facet":
            _check_facet_spec(self.props)
        if self.kind == "Join":
            _check_join(self.props)
        if feature is not None:
            feature.normalize(self.props)
            feature.validate_component(self)
        if self.props.get("connections") is not None:
            # A connector draws what its endpoints resolve to; its own positions would conflict.
            if any(self.props.get(channel) is not None for channel in CONNECTION_CHANNELS):
                raise ValueError(connections_channel_error(self.kind))
            if self.props.get("series") is not None:
                raise ValueError(connections_series_error(self.kind))

    def endpoint(self, name=None, *, at=None):
        """This node as a connection endpoint, for ``hm.connect``.

        On a mark, ``mark.endpoint(at="left")`` chooses where connections attach (``at`` omitted:
        the mark's default, the same as passing the mark itself). Points and Anchors attach at
        ``"center"``, Text at ``"anchor"``; Rect, Prism, Bar, and Histogram at ``"center"`` or an
        edge midpoint (``"left"``, ``"right"``, ``"top"``, ``"bottom"``), Bar and Histogram also
        at ``"baseline"`` or ``"value"``; BoxPlot at those (its box's) or ``"q1"``, ``"q3"``, or
        ``"median"``; Segments, Arrows3D, and Arrows at ``"start"`` or ``"end"`` (required).

        On an embedded Facet or a Partition, ``facet.endpoint("values")`` selects the mark named
        ``"values"`` that the Facet repeats in every cell (the Partition in every group). A direct
        reference to such a mark identifies the same repeated definition, so
        ``hm.connect(values, key="id")`` is the usual form; passed alone, either joins the cells
        in facet order.
        """
        return _endpoint(self, name, at)

    def _data_resource(self):
        # A referenced pipeline's resources are its source table's (TODO 142.3).
        if isinstance(self._local_data, Node):
            return self._local_data._data_resource()
        if self.kind == "Data" and isinstance(self.props.get("value"), Node):
            return self.props["value"]._data_resource()
        if self._local_data is not None:
            return self._local_data
        value = self.props.get("identity")
        if isinstance(value, IdentityResource):
            return value
        value = self.props.get("data")
        if isinstance(value, Node):
            return value._data_resource()
        if isinstance(value, Table):
            return value
        if self.kind == "Data" and isinstance(self.props.get("value"), Table):
            return self.props["value"]
        relation = None
        inferred_nodes = False
        parent = self
        while parent is not None:
            if relation is None and parent.kind in ('Nodes', 'Edges'):
                relation = parent.kind.lower()
            if parent.kind == 'GraphData':
                value = parent.props.get(relation or 'edges')
                if isinstance(value, Table):
                    return value
                # Nodes it infers have no host Table; edges it reads come from the data above.
                if relation == 'nodes':
                    return None
            value = parent.props.get("data")
            if isinstance(value, Node) and not inferred_nodes:
                return value._data_resource()
            if isinstance(value, Table) and not inferred_nodes:
                return value
            if parent.kind == "Data" and isinstance(parent.props.get("value"), Table) and not inferred_nodes:
                return parent.props["value"]
            # Under hm.Data(value=transform): the transform's source table (TODO 142.3).
            if parent.kind == "Data" and isinstance(parent.props.get("value"), Node) and not inferred_nodes:
                return parent.props["value"]._data_resource()
            parent = parent.parent
        return None

    @property
    def selection(self):
        data = self._data_resource()
        if data is None:
            raise RuntimeError("This component has no associated Data resource. For Python access to inferred node selections, supply nodes=hm.Table(...) to GraphData.")
        return data.selection

    @property
    def brush(self):
        data = self._data_resource()
        if data is None:
            raise RuntimeError("This component has no associated Data resource.")
        return data.brush

    @property
    def hover(self):
        data = self._data_resource()
        if data is None:
            raise RuntimeError("This component has no associated Data resource.")
        return data.hover

    @property
    def nearby(self):
        data = self._data_resource()
        if data is None:
            raise RuntimeError("This component has no associated Data resource.")
        return data.nearby

    @property
    def nearest(self):
        data = self._data_resource()
        if data is None:
            raise RuntimeError("This component has no associated Data resource.")
        return data.nearest

    def _scene(self):
        n = self
        while n.parent is not None:
            n = n.parent
        if isinstance(n, Scene):
            _refresh_implicit_legend(n)
            return n
        if n._implicit is None:
            scene = Scene(_detached=True)
            if n.kind in DISPLAYABLE_MARKS or n.kind in DIRECT_DATA_MARKS:
                tiles = n.kind == "VectorTile"
                if not tiles and n._local_data is None and n.props.get("data") is None:
                    raise ValueError(f"Standalone {n.kind} display requires data=; use Plot for inherited data.")
                plot = Node.__new__(Node)
                _initialize_detached_node(plot, "Plot", parent=scene)
                plot.children = [n]
                plot.props = dict(_VECTOR_TILE_PLOT) if tiles else {"height": 450, "autoBounds": True, "tooltip": True}
                n.parent = plot
                scene.children = [plot]
            else:
                scene.children = [n]
            n._implicit = scene
        _refresh_implicit_legend(n._implicit)
        return n._implicit

    def _changed(self, tx):
        # A chain built outside any block (TODO 144) is checked and sent in the scenes whose marks
        # read it, not as a scene of its own, until it is displayed itself.
        root = self
        while root.parent is not None:
            root = root.parent
        if not (getattr(root, "_chain_root", False) and root._implicit is None):
            tx.scenes.add(self._scene())
        tx.scenes.update(getattr(root, "_adopters", ()))

    def _drawn(self, action):
        """The node that stands for this one where a drawn node is needed (exports, cameras,
        references): itself. A Template answers with its single top-level node."""
        return self

    def _protocol_props(self):
        """The props the scene protocol sends for this node: its own."""
        return self.props

    def _reference(self, action):
        """The node a reference to this one names (Legend(target=...)): its drawn node. A Template
        answers with its main part when it declares one."""
        return self._drawn(action)

    def _mark(self, action):
        """The mark that stands for this one where one mark is needed (events, selections,
        endpoints, connections): itself. A Template answers with its main part."""
        return self

    def add(self, *children):
        """Append components and return this container. A component already here moves to
        the end (child order is draw order); one held by another container raises."""
        return self._attach(*children)

    def _attach(self, *children, explicit=True):
        # What `add` does on every node. A node created inside a context attaches here
        # (explicit=False), so a Template being built receives its own nodes while its `add`
        # goes to its slot.
        if not REGISTRY["components"][self.kind].get("container"):
            raise TypeError(f"{self.kind} cannot contain children: it takes keywords only. Put it inside a "
                            "container (a Plot, Frame, Data or transform) instead.")
        with transaction() as tx:
            tx.remember(self, ("children",))
            for child in children:
                if not isinstance(child, Node):
                    raise TypeError(f"{self.kind}: positional arguments are its children, which must be HMPlot "
                                    f"components; received {type(child).__name__}. Pass data as data= and "
                                    "options as keywords.")
                if child.parent is self:
                    # Adding a child again moves it to the end, as DOM appendChild does: add
                    # appends, and child order is draw order.
                    self.children.remove(child)
                    self.children.append(child)
                    tx.remember(child, ("_by_context",))
                    child._by_context = child._by_context and not explicit
                    continue
                if child.parent is not None:
                    # Explicit placement wins over the block a node was created in, while that
                    # block is still open (TODO 40.3). A node placed explicitly stays where it
                    # was put, and one whose block has closed stays there too: that block may be
                    # displayed already, and a move would take the node out of it.
                    if explicit and child._by_context and any(child.parent is entry[0] for entry in _stack.get()):
                        tx.remember(child.parent, ("children",))
                        child.parent.children.remove(child)
                    else:
                        raise _second_parent(child)
                n = self
                while n:
                    if n is child:
                        raise ValueError("Scene cycles are not allowed.")
                    # A Facet lays out frames of its own; a Partition repeats children inside
                    # one frame, so the grid has nowhere to go. The added node may be a
                    # prebuilt subtree, so its descendants are checked too.
                    if n.kind == "Partition" and _contains_kind(child, "Facet"):
                        raise TypeError(
                            "Facet cannot be nested inside Partition; partition inside the Facet instead."
                        )
                    n = n.parent
                tx.remember(child, ("parent", "_by_context"))
                child.parent = self
                child._by_context = not explicit
                self.children.append(child)
            self._changed(tx)
        return self

    def remove(self, child):
        with transaction() as tx:
            tx.remember(self, ("children",))
            tx.remember(child, ("parent",))
            self.children.remove(child)
            child.parent = None
            self._changed(tx)
        return child

    def clear(self):
        with transaction():
            for child in self.children[:]:
                self.remove(child)
        return self

    def __enter__(self):
        if not REGISTRY["components"][self.kind].get("container"):
            raise TypeError(f"{self.kind} is not a container, so it cannot open a with block; create it "
                            f"inside one (with hm.Plot(): hm.{self.kind}(...)).")
        isolated = None
        if (
            isinstance(self, Scene)
            and _transaction.get() is not None
            and _transaction.get().owner != owner()
        ):
            isolated = (_stack.set(()), _transaction.set(None))
        context = transaction()
        tx = context.__enter__()
        if self._autosave is not None:
            tx.autosaves.append(self._autosave)
        token = _stack.set((*_stack.get(), (self, owner())))
        self._contexts.append((context, token, isolated))
        return self

    def __exit__(self, *error):
        context, token, isolated = self._contexts.pop()
        _stack.reset(token)
        try:
            return context.__exit__(*error)
        finally:
            if isolated:
                _stack.reset(isolated[0])
                _transaction.reset(isolated[1])

    def update(self, **props):
        with transaction() as tx:
            tx.remember(self, ("props", "_local_data"))
            self._set(props)
            self._changed(tx)
        return self

    def _apply_edit(self, props):
        """Apply browser edits using the same declared properties as Python updates."""
        with transaction() as tx:
            tx.remember(self, ("props", "_local_data"))
            self._set(props, from_browser=True)
            self._changed(tx)

    def batch_update(self):
        return transaction()

    def on_event(self, event, callback):
        if event not in (
            "click",
            "dblclick",
            "pointermove",
            "pointerenter",
            "pointerleave",
            "contextmenu",
            "camerachange",
            "viewportchange",
            "drag",
            "dragend",
        ) and not (self.kind == "Provider" and event in ("load", "error")) and not (
            self.kind in INPUT_KINDS and event == "change"
        ):
            events = ["click", "dblclick", "pointermove", "pointerenter", "pointerleave", "contextmenu",
                      "camerachange", "viewportchange", "drag", "dragend",
                      *(["load", "error"] if self.kind == "Provider" else []),
                      *(["change"] if self.kind in INPUT_KINDS else [])]
            raise ValueError(f"{self.kind}.on_event: unsupported event name {event!r}; use one of {', '.join(events)}.")
        if not callable(callback):
            raise TypeError(f"{self.kind}.on_event({event!r}, ...): the callback must be a function that takes the "
                            f"event; received {type(callback).__name__}.")
        with transaction() as tx:
            tx.remember(self, ("_callbacks",))
            self._callbacks = {
                **self._callbacks,
                event: [*self._callbacks.get(event, []), callback],
            }
            building = _building.get()
            if building:
                # A template's update re-runs build(), which registers it again (TODO 130.2 slice 11).
                tx.remember(self, ("_built_callbacks",))
                self._built_callbacks = [*self._built_callbacks, (event, callback, building[-1])]
            self._changed(tx)
        return callback

    def on_click(self, callback):
        return self.on_event("click", callback)

    def on_hover(self, callback):
        return self.on_event("pointermove", callback)

    def _export_target(self, action="export"):
        # `action` names the call in a Template's errors.
        self._scene()
        if self._local_data is not None or self.kind in DIRECT_DATA_MARKS:
            parent = self.parent
            while parent is not None:
                if _is_plot_like(parent):
                    return parent.id
                parent = parent.parent
        return self.id

    def _repr_mimebundle_(self, include=None, exclude=None, **kwargs):
        """The notebook display: the scene's widget, and its SVG too when HMPLOT_NOTEBOOK_SVG is
        set (docs/DOCUMENT-EXPORT.md, "Notebooks without WebGPU")."""
        from .widget import notebook_svg

        widget = self._scene()._widget_instance()
        bundle = widget._repr_mimebundle_(include=include, exclude=exclude, **kwargs)
        # With HMPLOT_NOTEBOOK_SVG set, the scene's SVG beside the widget: front-ends with the
        # widget manager show the widget, static viewers the SVG (TODO 71).
        svg = "image/svg+xml"
        if notebook_svg() and (include is None or svg in include) and svg not in (exclude or ()):
            image = widget.display_svg()
            if image is not None:
                # anywidget returns (data, metadata).
                data, metadata = bundle if isinstance(bundle, tuple) else (bundle, None)
                data = {**data, svg: image}
                bundle = data if metadata is None else (data, metadata)
        return bundle

    async def when_settled(self, *, view=None, timeout=60):
        return await self._scene()._command(
            "settled", self.id, view=view, timeout=timeout
        )

    async def when_animations_finished(self, *, view=None, timeout=60):
        return await self._scene()._command(
            "animations_finished", self.id, view=view, timeout=timeout
        )

    async def export_png(self, path=None, *, scale=2, view=None, timeout=60):
        result = await self._scene()._command(
            "export_png", self._export_target("export_png"), view=view, timeout=timeout,
            scale=scale,
        )
        if path is not None:
            Path(path).write_bytes(result)
        return result

    async def _export_document(
        self, kind, path=None, *, width=None, height=None, mode="auto",
        raster_dpi=300, text="embedded", primitive_budget=100000, view=None,
        timeout=60,
    ):
        result = await self._scene()._command(
            f"export_{kind}", self._export_target(f"export_{kind}"), view=view, width=width, height=height,
            mode=mode, rasterDpi=raster_dpi, text=text,
            primitiveBudget=primitive_budget, timeout=timeout,
        )
        if path is not None:
            Path(path).write_bytes(result)
        return result

    async def export_svg(self, path=None, **options):
        """This view as SVG: axes, text, legends and most 2D marks as vector shapes, the rest as
        images at raster_dpi (mode="vector" refuses them; docs/DOCUMENT-EXPORT.md lists what)."""
        return await self._export_document("svg", path, **options)

    async def export_pdf(self, path=None, **options):
        """This view's SVG export printed to PDF by headless Chrome (vector, text kept as text,
        the bundled font embedded), in a headless Chrome like the standalone exports (chrome.py)."""
        from .exporter import print_pdf
        svg = await self._export_document("svg", None, **options)
        data = await asyncio.to_thread(print_pdf, svg)
        if path is not None:
            Path(path).write_bytes(data)
        return data

    async def export_html(self, path=None, *, snapshot="svg", page=True, view=None, timeout=60, **options):
        """Export the accepted declarative scene and this view's camera as a page. The page shows
        a snapshot of this view first (``snapshot="svg"``, ``"png"`` for very dense plots, or
        ``False`` for none) and replaces it with the interactive view once that has drawn; without
        WebGPU the snapshot stays (TODO 54). ``page`` lays the page out: a margin and the content
        at most 960 px wide by default, ``{"max_width": ..., "margin": ...}`` in pixels, or False
        for a bare page (TODO 132.6). A page too large to send from the notebook's browser
        to the kernel (Jupyter's server refuses a message over 10 MiB) is exported headlessly
        instead, as hm.export_html() exports it, with a warning: from the scene as Python has it,
        not this view's camera."""
        if options:
            names = ", ".join(sorted(options))
            raise TypeError(f"Unsupported HTML export option(s): {names}.")
        _check_snapshot(snapshot)
        layout = _page_layout(page)
        from .exporter import _NOTEBOOK_MESSAGE_LIMIT, _NOTEBOOK_PAGE_LIMIT, _html_data_bytes, _notebook_html, _with_runtime

        scene, target = self._scene(), self._export_target("export_html")
        # The page comes from the view as one message (without the runtime, which Python adds),
        # and Jupyter's server closes the connection on one over 10 MiB. Python counts the data;
        # the view measures the page it built, snapshot included, and sends none over the limit.
        scene._ready_view(view, target)
        data = _html_data_bytes(next((node for node in scene._nodes() if node.id == target), self))
        exported, size = None, f"the page holds {data / 1048576:.1f} MiB of data"
        if data <= _NOTEBOOK_PAGE_LIMIT:
            error_before = scene.error
            try:
                exported = await scene._command(
                    "export_html", target, view=view, timeout=timeout,
                    snapshot=snapshot or False, embedRuntime=False, maxBytes=_NOTEBOOK_PAGE_LIMIT, page=layout,
                )
            except SceneError as error:
                if error.code != "bridge.message_too_large":
                    raise
                # Not a failure of the scene: the export goes on headlessly.
                if scene.error == str(error):
                    scene.error = error_before
                size = f"the page is {error.details.get('bytes', 0) / 1048576:.1f} MiB without the runtime"
        if exported is None:
            result = await asyncio.to_thread(_notebook_html, self, path, snapshot, size, page=page)
            warnings.warn(
                f"export_html: {size}, more than a notebook can send to the kernel ({_NOTEBOOK_MESSAGE_LIMIT >> 20} MiB), "
                "so it was exported headlessly, as hm.export_html() does: it opens at the scene's own view, "
                "not this view's camera or settings-pane edits.", RuntimeWarning, stacklevel=2)
            return result
        result = _with_runtime(exported)
        if path is not None:
            Path(path).write_bytes(result)
        return result

    async def fit(self, *, view=None, timeout=60):
        return await self._scene()._command(
            "fit", self.id, view=view, timeout=timeout
        )

    async def get_camera(self, *, view=None, timeout=60):
        """The 3D camera of a displayed Plot: position, target, up, fov, near, far, zoom, mode."""
        return await self._scene()._command("camera", self.id, view=view, timeout=timeout)

    async def set_camera(self, state=None, *, animate=False, view=None, timeout=60, **fields):
        """Merge a partial 3D camera state (dict or keywords: position, target, up, fov, near,
        far, zoom) into a displayed Plot and return the resulting state. animate=True
        eases over the plot's animation duration."""
        patch = {**(state or {}), **fields}
        allowed = {"position", "target", "up", "fov", "near", "far", "zoom"}
        unknown = set(patch) - allowed
        if unknown:
            raise TypeError(f"set_camera does not accept {', '.join(sorted(unknown))}.")
        patch = {k: list(v) if isinstance(v, (list, tuple, np.ndarray)) else float(v) for k, v in patch.items()}
        return await self._scene()._command("camera", self.id, view=view, timeout=timeout, state=patch, animate=bool(animate))

    async def get_viewport(self, *, view=None, timeout=60):
        """The 2D viewport of a displayed Plot, including orthographic center when present."""
        return await self._scene()._command("viewport", self.id, view=view, timeout=timeout)

    async def set_viewport(self, state=None, *, view=None, timeout=60, **fields):
        """Merge a partial 2D viewport state and return the resulting viewport."""
        normalized = _viewport_patch(state, fields)
        return await self._scene()._command("viewport", self.id, view=view, timeout=timeout, state=normalized)

    async def _clock(self, *, view=None, timeout=60, **args):
        """The `time` command on the export target: {"time": ms, "frozen": bool}. With `time`
        (and `freeze`) in args it sets the clock first."""
        return await self._scene()._command(
            "time", self._export_target("get_time/set_time"), view=view, timeout=timeout, **args
        )

    async def get_time(self, *, view=None, timeout=60):
        """The clock read by @time expressions, in milliseconds, one for the whole Scene: 0 when
        the scene mounts, it advances by the frame time while anything in it animates
        (transitions, @time channels, a playing Playback, a running Simulate), and stops while
        frozen by set_time."""
        return (await self._clock(view=view, timeout=timeout))["time"]

    async def set_time(self, time, *, freeze=True, view=None, timeout=60):
        """Set the scene's clock (milliseconds). It stays frozen there until set_time(None); pass
        freeze=False to set the time and let it keep running. A step forward moves the scene's
        playing Playbacks and running Simulates by it. Returns the clock."""
        time = _clock_time(time)
        return (await self._clock(view=view, timeout=timeout, time=time, freeze=bool(freeze)))["time"]

    async def export_mp4(self, path, *, duration, fps=30, start=0, scale=2, encoder="ffmpeg", view=None, timeout=60):
        """Render a displayed plot's @time animation to an MP4: step the clock frame by frame,
        export a PNG per frame, and pipe them to ffmpeg (imageio-ffmpeg's), or with
        ``encoder="browser"`` encode them in the view by WebCodecs. The clock returns to its
        previous time and frozen state afterwards, also when a frame fails."""
        from .exporter import _Mp4Writer, _frame_times, _mp4_encoder, _mp4_path, _video_encoder

        times = _frame_times(start, duration, fps)
        if _video_encoder(encoder) == "browser":
            path = _mp4_path(path)
            data = await self._scene()._command(
                "export_video", self._export_target("export_video"), view=view, timeout=timeout,
                duration=float(duration), fps=float(fps), start=float(start), scale=scale)
            path.write_bytes(data)
            return path
        ffmpeg, path = _mp4_encoder(path)
        previous = await self._clock(view=view, timeout=timeout)
        restore = lambda: self._clock(view=view, timeout=timeout, time=previous["time"], freeze=previous["frozen"])
        video = _Mp4Writer(ffmpeg, path, fps)
        try:
            for time in times:
                await self.set_time(time, view=view, timeout=timeout)
                video.write(await self.export_png(scale=scale, view=view, timeout=timeout))
        except BaseException:
            video.abort()
            try:
                await restore()
            except Exception:  # keep the failure that stopped the export
                _logger.warning("export_mp4 could not restore the view clock.", exc_info=True)
            raise
        await restore()
        return video.close()

    async def groups(self, *, view=None, timeout=60):
        """The mounted groups of a displayed Partition: key, values, label, and mark labels."""
        return await self._scene()._command(
            "groups", self.id, view=view, timeout=timeout
        )

    async def action(self, action, *, view=None, timeout=60):
        return await self._scene()._command(
            "action", self.id, view=view, timeout=timeout, action=action
        )


def _input_value(value):
    """An input's value from the browser: a time ({"$datetime": ms, "timezone"}) as an aware
    datetime in its zone (TODO 53.3), lists item by item."""
    if isinstance(value, dict) and "$datetime" in value:
        zone = value.get("timezone") or "UTC"
        if zone == "UTC":
            tz = datetime.timezone.utc
        else:
            import zoneinfo
            try:
                tz = zoneinfo.ZoneInfo(zone)
            except (zoneinfo.ZoneInfoNotFoundError, ValueError):
                tz = datetime.timezone.utc
        return datetime.datetime.fromtimestamp(value["$datetime"] / 1000, tz)
    if isinstance(value, list):
        return [_input_value(item) for item in value]
    return value


def _epoch_milliseconds(value):
    """A time as epoch milliseconds (TODO 53): a naive datetime or datetime64 is UTC, a date is
    its midnight UTC, and an aware datetime (or pandas Timestamp) is its instant."""
    if isinstance(value, np.datetime64):
        return int(value.astype("datetime64[ms]").astype(np.int64))
    if isinstance(value, datetime.datetime):
        aware = value if value.tzinfo is not None else value.replace(tzinfo=datetime.timezone.utc)
        return int(round(aware.timestamp() * 1000))
    return int(datetime.datetime(value.year, value.month, value.day, tzinfo=datetime.timezone.utc).timestamp() * 1000)


def _label(node):
    """How messages and visualize_tree name a node: a Template by its class."""
    return type(node).__name__ if isinstance(node, Template) else node.kind


def _single_node(nodes, action, owner, where):
    """The one node of ``nodes`` that stands for ``owner`` (a Template or its Slot), which
    draws nothing itself; ``where`` names the list to pick from in the error."""
    if len(nodes) == 1:
        return nodes[0]._drawn(action)
    if not nodes:
        raise ValueError(f"{action}: {owner} has no top-level nodes, so there is no node to use.")
    kinds = ", ".join(_label(node) for node in nodes)
    raise ValueError(
        f"{action}: {owner} has {len(nodes)} top-level nodes ({kinds}), so there is no single "
        f"node to use; call it on one of them ({where})."
    )


def _build_signature(cls):
    """The arguments a Template class takes: its build()'s, or the @hm.template function's."""
    owner = next(base for base in cls.__mro__ if "build" in base.__dict__)
    if "__wrapped__" in owner.__dict__:
        return inspect.signature(owner.__wrapped__)
    signature = inspect.signature(cls.build)
    if isinstance(owner.__dict__["build"], staticmethod):
        return signature
    return signature.replace(parameters=list(signature.parameters.values())[1:])


def _descendants(node, skip):
    """``node``'s descendants in order, leaving out ``skip``'s subtree."""
    for child in node.children:
        if child is not skip:
            yield child
            yield from _descendants(child, skip)


# What a rebuilt node keeps of the node it replaces (a template's update, TODO 130.2 slice 11):
# its identity, place and callbacks; the rest (props, a template's slot and contract, build()'s
# attributes) comes from the new build.
_KEPT_ON_REBUILD = {"id", "parent", "children", "_callbacks", "_built_callbacks", "_data_scope_id", "_contexts",
                    "_implicit", "_by_context", "_autosave"}


def _walk_nodes(node):
    yield node
    for child in node.children:
        yield from _walk_nodes(child)


def _match_rebuilt(old, new, pairs):
    """Pair rebuilt nodes with the nodes they replace, by kind and position."""
    for before, after in zip(old, new):
        if before.kind == after.kind and type(before) is type(after):
            pairs[id(after)] = before
            _match_rebuilt(before.children, after.children, pairs)


def _remap_nodes(value, pairs):
    if isinstance(value, Node):
        return pairs.get(id(value), value)
    slots = getattr(type(value), "__slots__", None)
    if slots and type(value).__module__.startswith("hmplot."):
        # An expression, endpoint or connect() value naming a rebuilt node.
        items = {name: getattr(value, name) for name in slots if hasattr(value, name)}
        mapped = {name: _remap_nodes(item, pairs) for name, item in items.items()}
        if all(mapped[name] is items[name] for name in items):
            return value
        copy = object.__new__(type(value))
        for name, item in mapped.items():
            object.__setattr__(copy, name, item)
        return copy
    if isinstance(value, dict):
        return {key: _remap_nodes(item, pairs) for key, item in value.items()}
    if isinstance(value, list):
        return [_remap_nodes(item, pairs) for item in value]
    if isinstance(value, tuple):
        return tuple(_remap_nodes(item, pairs) for item in value)
    return value


def _isolated_transaction(body):
    """Run body(tx) so that an error rolls back its changes even inside an open context's
    transaction, whose changes it then joins (a template's update)."""
    outer = active_transaction()
    if outer is None:
        with transaction() as tx:
            return body(tx)
    tx = Transaction()
    token = _transaction.set(tx)
    try:
        result = body(tx)
    except BaseException:
        tx.rollback()
        raise
    finally:
        _transaction.reset(token)
    for key, saved in tx.saved.items():
        outer.saved.setdefault(key, saved)
    outer.scenes |= tx.scenes
    outer.autosaves.extend(tx.autosaves)
    return result


class Template(Node):
    """A reusable pattern of components with a place for children.

    Subclass it and build the pattern in ``build()`` with ordinary components, calling
    ``hm.slot()`` where the caller's children go::

        class Panel(hm.Template):
            def build(self, data, *, title=None):
                with hm.Data(data):
                    with hm.Plot(title=title) as self.plot:
                        hm.Frame()
                        hm.slot()
                        hm.Legend()

        with hm.Scene():
            with Panel(table, title="A") as panel:
                hm.Points(x="a", y="b")
            panel.add(hm.Line(x="a", y="b"))

    ``Panel(...)`` runs ``build()`` with its arguments at once and attaches like any
    component. ``with panel:``, ``add``, ``remove``, and ``clear`` act on the slot: children
    keep its position (before the Legend here) and ``clear()`` removes only them. Without
    ``hm.slot()`` the template takes no children. ``children`` lists the template's own
    top-level nodes; the caller's are ``slot.children``. Events, selections, endpoints, and
    connections use the template's main part: the mark ``hm.contract(main=...)`` names, else
    its only mark, and raise when it has several. Exports, cameras and camera events use its
    single top-level node. References such as ``Legend(target=panel)`` use a declared main
    part, else the single top-level node (a Legend falls back to the only mark when there are
    several). Keywords ``build()`` does not take are props of the main part
    (``Panel(data, opacity=0.5)``); a template with several marks and no main part takes only
    ``visible=``, for all of them. With a main part, the other marks have no legend entry
    unless given ``legend=``, and follow its visibility. ``update(**params)`` re-runs ``build()``
    in place with those parameters changed; components it builds again stay the same objects.
    ``@hm.template`` makes a Template from a function.
    """

    kind = "Template"
    slot = None
    _contract = {}

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        # The class's call signature is build()'s (help(), inspect, editors).
        if "build" in cls.__dict__ and "__signature__" not in cls.__dict__:
            try:
                cls.__signature__ = _build_signature(cls)
            except (TypeError, ValueError):
                pass

    def __init__(self, *args, **kwargs):
        self.slot = None
        self._contract = {}
        props, named = self._split_keywords(kwargs)
        # What update() re-runs build() with (TODO 130.2 slice 11).
        self._build_call = (args, dict(kwargs), dict(props))
        try:
            self._construct(args, kwargs, props, named)
        except BaseException:
            # Inside an open context the transaction is the context's, so nothing rolls back:
            # a template that failed to build or forward leaves its parent.
            if self.parent is not None and self in self.parent.children:
                Node.remove(self.parent, self)
            raise

    @classmethod
    def _signature_parameters(cls):
        try:
            signature = getattr(cls, "__signature__", None)
            if not isinstance(signature, inspect.Signature):
                signature = _build_signature(cls)
            return list(signature.parameters.values())
        except (TypeError, ValueError):
            return None

    def _split_keywords(self, kwargs):
        """Take the keywords build() does not take out of kwargs: props of the main part (TODO
        130.2). Returns them and build()'s parameter names."""
        parameters = self._signature_parameters()
        props, named = {}, []
        if getattr(type(self), "_parameter_names", None) is not None:
            named = list(type(self)._parameter_names)
            props = {key: kwargs.pop(key) for key in list(kwargs) if key not in named}
        elif parameters is not None and not any(item.kind is item.VAR_KEYWORD for item in parameters):
            named = [item.name for item in parameters if item.kind is not item.VAR_POSITIONAL]
            props = {key: kwargs.pop(key) for key in list(kwargs) if key not in named}
        return props, named

    def _construct(self, args, kwargs, props, named):
        with transaction():
            super().__init__()
            self._expand(args, kwargs, props, named)

    def _expand(self, args, kwargs, props, named):
        with transaction():
            stack = _stack.set((*_stack.get(), (self, owner())))
            building = _building.set((*_building.get(), self))
            try:
                result = self.build(*args, **kwargs)
                if inspect.isgenerator(result):
                    result.close()
                    raise TypeError(
                        f"{self._name}.build() is a generator; mark where children go "
                        "with hm.slot() instead of yield."
                    )
            finally:
                _building.reset(building)
                _stack.reset(stack)
            node = self.slot
            while node is not None and node is not self:
                node = node.parent
            if self.slot is not None and node is None:
                raise ValueError(
                    f"{self._name}: hm.slot() was called in a context outside the template's "
                    "own components; call it inside the components build() creates."
                )
            self._check_contract(named)
            self._resolve_legend_entries()
            # With a main part, the other marks have no legend entry of their own (the main
            # part's is the template's), nor do the parts a declared entry lists besides its
            # swatch; in the browser they follow the visibility of the mark that has the entry.
            for _, followers in self._follow_groups():
                for mark in followers:
                    if "legend" not in mark.props and accepted_property(mark.kind, "legend"):
                        mark.update(legend=False)
            if props:
                self._forward(props, named)

    def _main_mark(self):
        """The mark the main part stands for, or None for a group: the declared main (through
        nested templates, whose main may be declared or their only mark), else the only mark."""
        main = self._contract.get("main")
        if main is None:
            marks = self._marks()
            main = marks[0] if len(marks) == 1 else None
        return main._main_mark() if isinstance(main, Template) else main

    def _followers(self):
        """The marks that follow the declared main part: the template's own others."""
        main = self._contract.get("main")
        if isinstance(main, Template):
            # A nested template stands for its main part, declared or its only mark; a group as
            # the main part has no one mark to follow (it raises on use).
            main = main._main_mark()
        if main is None or main.kind not in REGISTRY["marks"] or main.kind == "Anchor":
            return []
        return [node for node in _descendants(self, self.slot)
                if node.kind in REGISTRY["marks"] and node.kind != "Anchor" and node is not main]

    def _follow_groups(self):
        """(leader, followers) pairs: the main part and the other marks, else each declared
        legend entry's swatch and its other parts."""
        followers = self._followers()
        if followers:
            return [(self._mark("contract"), followers)]
        return [(entry["swatch"], [part for part in entry["parts"] if part is not entry["swatch"]])
                for entry in self._contract.get("legend_entries", [])]

    def _resolve_legend_entries(self):
        """hm.contract(legend_entries=...) as marks: each entry's parts (default: every mark),
        its swatch (default: the first part), and its label set on the swatch."""
        declared = self._contract.get("legend_entries")
        if not declared:
            return
        call = f"{self._name}: hm.contract(legend_entries=...)"
        if self._contract.get("main") is not None:
            raise ValueError(
                f"{call} needs a template with no main part: with one, the template's legend entry "
                "is its main part's (label= on the template goes to it), and its other marks follow it."
            )
        own = {id(node) for node in _descendants(self, self.slot)}

        def scope_marks(template):
            # The marks a template's scope sees, as the browser registers them: a nested template
            # stands for its main part, or for its marks that follow no other (its entries'
            # swatches, its unlisted marks); its slot's children are this scope's.
            marks = []

            def walk(node):
                for child in node.children:
                    if child is template.slot:
                        continue
                    if isinstance(child, Template):
                        marks.extend(leaders(child))
                        if child.slot is not None:
                            walk(child.slot)
                    elif child.kind in REGISTRY["marks"] and child.kind != "Anchor":
                        marks.append(child)
                        walk(child)
                    else:
                        walk(child)

            walk(template)
            return marks

        def leaders(node):
            if not isinstance(node, Template):
                return [node]
            if node._contract.get("main") is not None:
                return [node._mark(f"{call} (through {node._name}'s main part)")]
            followers = {id(mark) for _, marks in node._follow_groups() for mark in marks}
            return [mark for mark in scope_marks(node) if id(mark) not in followers]

        available = scope_marks(self)
        visible = {id(mark) for mark in available}

        def marks_of(node):
            if id(node) not in own:
                raise ValueError(f"{call} names a {_label(node)} that build() did not create (or that is in "
                                 "the slot); list the template's own marks.")
            if isinstance(node, Template):
                return leaders(node)
            if node.kind not in REGISTRY["marks"] or node.kind == "Anchor":
                raise ValueError(f"{call} lists a {_label(node)}, which draws no legend entry; list marks.")
            if id(node) not in visible:
                raise ValueError(f"{call} lists a {_label(node)} that follows another mark of a nested "
                                 "template; list that template, or its main part or entry's swatch.")
            return [node]

        entries, listed = [], set()
        for entry in declared:
            if entry.get("parts") is not None and not entry["parts"]:
                raise ValueError(f"{call}: an entry lists no parts; leave parts out for every mark.")
            parts = [mark for node in entry["parts"] for mark in marks_of(node)] if entry.get("parts") else available
            swatches = marks_of(entry["swatch"]) if entry.get("swatch") is not None else parts[:1]
            if not swatches:
                raise ValueError(f"{call}: an entry has no mark to show as its swatch; list the template's marks.")
            swatch = swatches[0]
            if all(part is not swatch for part in parts):
                raise ValueError(f"{call}: an entry's swatch, a {_label(swatch)}, must be one of its parts.")
            for part in parts:
                if id(part) in listed:
                    raise ValueError(f"{call} lists a {_label(part)} more than once; give each mark one entry.")
                listed.add(id(part))
            if entry.get("label") is not None:
                swatch.update(label=entry["label"])
            entries.append({"swatch": swatch, "parts": parts})
        self._contract = {**self._contract, "legend_entries": entries}

    def _apply_edit(self, props):
        # Its one protocol prop (contract) is Python's; the browser edits its parts, never it.
        raise TypeError(f"{self._name}: a template takes no edits; edit the components it built.")

    def _protocol_props(self):
        # The browser's half of the contract (TODO 130.2): the template's kind (its settings
        # group's label), the main part by node id, which the other marks follow, else the
        # legend entries, each swatch's other parts following it, and the named marks without
        # a name= of their own, which the settings pane lists by part name.
        contract = {"kind": self._name}
        if self._followers():
            contract["main"] = self._mark("contract").id
        elif self._contract.get("legend_entries"):
            contract["legendEntries"] = [{"swatch": entry["swatch"].id, "parts": [part.id for part in entry["parts"]]}
                                         for entry in self._contract["legend_entries"]]
        parts = {name: node.id for name, node in self._contract.get("parts", {}).items()
                 if node.kind in REGISTRY["marks"] and "name" not in node.props}
        if parts:
            contract["parts"] = parts
        return {"contract": contract}

    def _forward(self, props, named):
        """Pass the caller's props that build() does not take to the main part; a keyword named
        after a contract part takes a dict of that part's props."""
        parts = self._contract.get("parts", {})
        part_props = {key: props.pop(key) for key in list(props) if key in parts}
        for key, value in part_props.items():
            if not isinstance(value, dict):
                raise TypeError(
                    f"{self._name}({key}=...): {key} is a part of {self._name}, so {key}= takes a dict of "
                    f"its props ({key}={{...}}); received {type(value).__name__}."
                )
        if props:
            self._forward_main(props, named)
        # A part's own dict wins over the main part's keywords and a group's visible=.
        for key, value in part_props.items():
            node = parts[key]
            try:
                (node._mark("props") if isinstance(node, Template) else node).update(**value)
            except (TypeError, ValueError) as error:
                raise type(error)(f"{self._name}({key}=...): {error}") from error

    def _forward_main(self, props, named):
        listed = ", ".join(f"{key}=" for key in props)
        action = f"{self._name}({listed})"
        takes = f"build() takes {', '.join(named)}" if named else "build() takes no arguments"
        marks = self._marks() if self._contract.get("main") is None else None
        if marks == []:
            raise TypeError(
                f"{action}: {takes}, and {self._name} has no mark to pass other props to; "
                "add them to build()'s parameters."
            )
        if marks and len(marks) > 1:
            if set(props) != {"visible"}:
                kinds = ", ".join(_label(node) for node in marks)
                raise TypeError(
                    f"{action}: {takes}, and {self._name} has {len(marks)} marks ({kinds}) and no main "
                    "part, so it takes only visible= (for all of them); set other props on one part "
                    "(a part's dict, part_name={...}, for a part hm.contract(parts=...) names, or "
                    "template.part(...).update(...)) or name one with hm.contract(main=...)."
                )
            # A group (several marks, no main part) hides and shows every mark it built, but the
            # ones that follow another mark (a nested main part, a legend entry's swatch): an
            # authored visible on them would outrank following it.
            nodes = list(_descendants(self, self.slot))
            followers = {id(mark) for node in [self, *nodes] if isinstance(node, Template)
                         for _, marks in node._follow_groups() for mark in marks}
            for node in nodes:
                if node.kind in REGISTRY["marks"] and node.kind != "Anchor" and id(node) not in followers:
                    node.update(visible=props["visible"])
            return
        try:
            self._mark(action).update(**props)
        except (TypeError, ValueError) as error:
            raise type(error)(f"{action}: {error} ({takes}; other keywords go to its main part.)") from error

    def _check_contract(self, named=()):
        """The nodes hm.contract(...) named are the template's own (not the caller's children),
        and part names are free for per-part props: neither build()'s parameters nor the main
        part's props."""
        own = {id(node) for node in _descendants(self, self.slot)}
        declared = [("main", self._contract.get("main"))] + [
            (f"parts[{key!r}]", node) for key, node in self._contract.get("parts", {}).items()]
        for label, node in declared:
            if node is not None and id(node) not in own:
                raise ValueError(
                    f"{self._name}: hm.contract({label}=...) names a {_label(node)} that build() did "
                    "not create (or that is in the slot); name one of the template's own components."
                )
        main_mark = self._main_mark()
        for key in self._contract.get("parts", {}):
            taken = "a build() parameter" if key in named else (
                f"a {main_mark.kind} prop of the main part" if main_mark is not None and accepted_property(main_mark.kind, key) else None)
            if taken:
                raise ValueError(
                    f"{self._name}: hm.contract(parts={{{key!r}: ...}}) names a part {key!r}, which is {taken}; "
                    f"the template's {key}= keyword would be ambiguous, so give the part another name."
                )

    def build(self, *args, **kwargs):
        """Create the template's components; call ``hm.slot()`` where its children go."""
        raise NotImplementedError(
            f"{self._name} defines no build(); subclass hm.Template and define build(), "
            "or decorate a function with @hm.template."
        )

    def export_template(self, path):
        """Write this expanded template as portable, code-free JSON."""
        from .templates import export_template

        return export_template(self, path)

    def part(self, name):
        """One component of this instance: the part ``hm.contract(parts={name: node})`` names,
        else the one component whose ``name=`` prop is ``name`` (a loaded portable file)."""
        parts = self._contract.get("parts", {})
        if name in parts:
            return parts[name]
        matches = [node for node in _descendants(self, None) if node.props.get("name") == name]
        if len(matches) != 1:
            declared = f" (its parts: {', '.join(map(repr, parts))})" if parts else ""
            raise ValueError(
                f"{self._name}: {name!r} must be a part{declared} or the name of exactly one "
                f"component; found {len(matches)}. Declare parts with hm.contract(parts={{...}}) in build()."
            )
        return matches[0]

    @property
    def _name(self):
        return type(self).__name__

    def __repr__(self):
        return f"<{self._name} template {self.id}>"

    def _drawn(self, action):
        return _single_node(self.children, action, f"the {self._name} template",
                            "the template's .children")

    def _reference(self, action):
        # A reference names the main part when the template declares one, else its single
        # top-level node; with several, a Legend's (which takes a mark) names the main part.
        main = self._contract.get("main")
        if main is not None:
            return main._mark(action)
        if len(self.children) == 1:
            return self.children[0]._reference(action)
        if action.startswith("Legend.") and self._marks():
            return self._mark(action)
        return self._drawn(action)

    def _marks(self):
        """The template's own marks, not the caller's: a nested template that declares a main part
        counts as that one mark (its other nodes are its own; its slot's children are ours)."""
        marks = []

        def walk(node, skip):
            for child in node.children:
                if child is skip:
                    continue
                if isinstance(child, Template) and child._contract.get("main") is not None:
                    marks.append(child)
                    if child.slot is not None and child.slot is not skip:
                        walk(child.slot, skip)
                    continue
                if child.kind in REGISTRY["marks"] and child.kind != "Anchor":  # an Anchor draws nothing
                    marks.append(child)
                walk(child, skip)

        walk(self, self.slot)
        return marks

    def _mark(self, action):
        """The main part: hm.contract(main=...)'s, else the template's only mark, else (no marks)
        its single top-level node."""
        main = self._contract.get("main")
        if main is not None:
            return main._mark(action)
        marks = self._marks()
        if len(marks) == 1:
            return marks[0]._mark(action)
        if not marks:
            return _single_node(self.children, action, f"the {self._name} template",
                                "the template's .children")
        kinds = ", ".join(_label(node) for node in marks)
        raise ValueError(
            f"{action}: the {self._name} template has {len(marks)} marks ({kinds}) and no main "
            "part, so there is no single mark to use; call it on one of them (template.part(...)) "
            "or name one with hm.contract(main=...) in build()."
        )

    def _slot_for(self, action):
        if self.slot is None:
            raise TypeError(
                f"{self._name} has no slot, so it takes no children ({action}); "
                "call hm.slot() in build() where children should go."
            )
        return self.slot

    def __enter__(self):
        self._slot_for("with").__enter__()
        return self

    def __exit__(self, *error):
        return self.slot.__exit__(*error)

    def add(self, *children):
        self._slot_for("add").add(*children)
        return self

    def remove(self, child):
        return self._slot_for("remove").remove(child)

    def clear(self):
        if self.slot is not None:
            self.slot.clear()
        return self

    def update(self, **params):
        """Re-run build() in place with these parameters changed (TODO 130.2 slice 11).

        Keywords build() does not take are props of the main part, as in the call. Components
        built again (matched by kind and position) stay the same objects with their ids and the
        callbacks registered outside build(), so handles, references and connections to them
        keep working; their props come from the new build (a settings-pane edit to one resets).
        Nested templates rebuild with it (their own update() calls reset), and the caller's
        children stay in the slot. A failed build leaves the template as it was.

        Example:
            chart = lollipop("day", "value")
            chart.update(y="other", color="gray")
        """
        if self.slot is not None and self.slot._contexts:
            raise TypeError(f"{self._name}.update: its with block is open; call update() after the block, "
                            "so the caller's children go to the rebuilt slot.")
        call = getattr(self, "_build_call", None)
        if call is None:
            raise TypeError(f"{self._name} was loaded from a scene or file without its build() call, so update() "
                            "cannot re-run it; create the template again with the new parameters.")
        args, kwargs, props = call
        props_changes, named = self._split_keywords(params)
        if args and params:
            # Positional arguments become keywords after the last one build() takes only by
            # position (or as *args), so a keyword update replaces them.
            parameters = self._signature_parameters() or []
            if any(item.kind is item.POSITIONAL_ONLY and item.name in params for item in parameters):
                raise TypeError(f"{self._name}.update: build() takes {', '.join(sorted(params))} only by position; "
                                "create the template again with the new values.")
            names = [item.name if item.kind is item.POSITIONAL_OR_KEYWORD else None for item in parameters
                     if item.kind in (item.POSITIONAL_ONLY, item.POSITIONAL_OR_KEYWORD)]
            names += [None] * (len(args) - len(names))
            keep = max((index + 1 for index, name in enumerate(names[:len(args)]) if name is None), default=0)
            if any(name in params for name in names[:keep]):
                raise TypeError(f"{self._name}.update: build() takes the arguments before *args only by position; "
                                "create the template again with the new values.")
            kwargs = {**dict(zip(names[keep:], args[keep:])), **kwargs}
            args = args[:keep]
        kwargs = {**kwargs, **params}
        props = {**props, **props_changes}

        def rebuild(tx):
            # children before __dict__: a rollback restores __dict__ (its old children list, which
            # the rebuild empties), then the list's saved items.
            tx.remember(self, ("children",))
            tx.remember(self, ("__dict__",))
            old = list(self.children)
            old_nodes = [node for child in old for node in _walk_nodes(child)]
            rebuilt = {id(self)} | {id(node) for node in old_nodes if isinstance(node, Template)}
            caller = list(self.slot.children) if self.slot is not None else []
            for child in caller:
                Node.remove(self.slot, child)
            for child in old:
                Node.remove(self, child)
            self.slot = None
            self._contract = {}
            self._expand(args, dict(kwargs), dict(props), named)
            # The components built again stay the objects they were (handles, references and
            # connections to them keep working); new ones join, the others leave.
            pairs = {}
            _match_rebuilt(old, self.children, pairs)
            fresh = [node for child in self.children for node in _walk_nodes(child)]
            for node in old_nodes:
                tx.remember(node, ("children",))
                tx.remember(node, ("__dict__",))
                node.parent = None
            for node in fresh:
                target = pairs.get(id(node), node)
                if target is not node:
                    for key, value in vars(node).items():
                        if key not in _KEPT_ON_REBUILD:
                            setattr(target, key, _remap_nodes(value, pairs))
                    # Callbacks build() registered come from the new build; the caller's stay.
                    built = [(event, callback) for event, callback, owner in target._built_callbacks
                             if id(owner) in rebuilt]
                    callbacks = {event: [item for item in items if (event, item) not in built]
                                 for event, items in target._callbacks.items()}
                    for event, items in node._callbacks.items():
                        callbacks[event] = [*callbacks.get(event, []), *items]
                    target._callbacks = {event: items for event, items in callbacks.items() if items}
                    target._built_callbacks = [*(item for item in target._built_callbacks if id(item[2]) not in rebuilt),
                                               *node._built_callbacks]
                else:
                    for key, value in list(vars(node).items()):
                        if key not in ("parent", "children"):
                            setattr(node, key, _remap_nodes(value, pairs))
                target.children = [pairs.get(id(child), child) for child in node.children]
                for child in target.children:
                    child.parent = target
            self.children = [pairs.get(id(child), child) for child in self.children]
            for child in self.children:
                child.parent = self
            for key, value in list(vars(self).items()):
                if key not in ("parent", "children"):
                    setattr(self, key, _remap_nodes(value, pairs))
            if caller:
                self._slot_for("update").add(*caller)
            self._build_call = (args, kwargs, props)
            self._changed(tx)

        _isolated_transaction(rebuild)
        return self

    def endpoint(self, name=None, *, at=None):
        return self._mark("endpoint").endpoint(name, at=at)

    def on_event(self, event, callback):
        # A Plot's camera events go to the drawn node, as get_camera() does; the others to the main part.
        action = f"on_event({event!r})"
        target = self._drawn(action) if event in ("camerachange", "viewportchange") else self._mark(action)
        return target.on_event(event, callback)

    @property
    def selection(self):
        return self._mark("selection").selection

    @property
    def brush(self):
        return self._mark("brush").brush

    @property
    def hover(self):
        return self._mark("hover").hover

    @property
    def nearby(self):
        return self._mark("nearby").nearby

    @property
    def nearest(self):
        return self._mark("nearest").nearest

    def _export_target(self, action="export"):
        if action == "export_html":
            # The browser's HTML export keeps any node's subtree, so a template exports itself.
            self._scene()
            return self.id
        return self._drawn(action)._export_target(action)

    async def fit(self, **options):
        return await self._drawn("fit").fit(**options)

    async def get_camera(self, **options):
        return await self._drawn("get_camera").get_camera(**options)

    async def set_camera(self, state=None, **options):
        return await self._drawn("set_camera").set_camera(state, **options)

    async def groups(self, **options):
        return await self._drawn("groups").groups(**options)

    async def action(self, action, **options):
        return await self._drawn("action").action(action, **options)


class Slot(Node):
    """Where a Template's children go. ``hm.slot()`` creates it inside ``build()``."""

    kind = "Slot"

    def __init__(self, *, _template):
        self.template = _template
        super().__init__()

    def __repr__(self):
        return f"<Slot of {self.template._name} {self.id}>"

    def _drawn(self, action):
        return _single_node(self.children, action, f"the slot of {self.template._name}",
                            "the slot's .children")

    def _mark(self, action):
        return self.children[0]._mark(action) if len(self.children) == 1 else self._drawn(action)


_POSITION_CHANNELS = ("position", "start", "end", "control1", "control2")


def _check_scale_value(kind, key, value):
    """A channel's scale is a resource, never a plain dict (2026-10-22: fill_scale={"domain": ...,
    "range": ...} reached the browser as "Expected a categorical scale.")."""
    if re.fullmatch(r"(fill|color|size|width|height|outlineColor|opacity|shape)Scale", key) and isinstance(value, dict):
        channel = _snake(key)[:-len("_scale")]
        raise TypeError(f"{kind}.{_snake(key)} takes a scale object, not a dict: "
                        f"hm.categorical(domain=[...], range=[...]) for categories, or "
                        f"hm.continuous(domain=[lo, hi]{', colormap=...' if channel in ('fill', 'color') else ''}) for numbers.")


def _check_position_list(kind, key, value):
    """A list of column names where a mark takes positions: it would become a categorical column
    of the names (TODO 136.2: "Invalid type for full" in the browser)."""
    if key in _POSITION_CHANNELS and isinstance(value, (list, tuple)) and any(isinstance(v, (str, Expression)) for v in value):
        names = ", ".join(str(v) for v in value)
        raise TypeError(
            f"{kind}.{key} takes one column of positions or an N x 2 (N x 3) array, not a list "
            f"of columns ({names}); stack them first, for example "
            f"{key}=np.column_stack([df[\"{value[0]}\"], df[\"{value[1] if len(value) > 1 else value[0]}\"]])"
            + (", or use x= and y=." if key == "position" else "."))


def slot():
    """Mark where a template's children go.

    Call it once inside ``build()`` (or an ``@hm.template`` function), in the context the
    children belong to. The children are placed there, before any components ``build()``
    creates after it. A helper function called from ``build()`` may call it.
    """
    building = _building.get()
    if not building:
        raise RuntimeError(
            "hm.slot() marks where a template's children go; call it inside a Template's "
            "build() or an @hm.template function."
        )
    template = building[-1]
    if template.slot is not None:
        raise RuntimeError(f"{template._name} already has a slot; a template takes its children in one place.")
    template.slot = Slot(_template=template)


def contract(*, main=None, parts=None, legend_entries=None):
    """Declare what a template's callers can rely on; call it once inside ``build()``.

    ``main`` is the mark events, selections, endpoints, connections, and references such as
    ``Legend(target=t)`` use (a nested template stands for its own main part). A template with
    one mark needs none: that mark is main. ``parts`` names components for ``t.part(name)``,
    independent of their ``name=`` props; the template's keyword of the same name takes a dict
    of that part's props (``lollipop("a", "b", stem={"color": "gray"})``), so a part name may be
    neither a ``build()`` parameter nor a prop of the main part.

    ``legend_entries`` gives a template with no main part (a group) its own legend entries: a
    list of ``{"label": ..., "swatch": mark, "parts": [marks]}``, each optional. An entry stands
    for its parts (default: every mark); its swatch (default: the first part) shows in the
    legend with the label (default: the swatch's own), the other parts leave the legend and
    follow the swatch's visibility, so one click hides them all. Marks no entry lists keep their
    own entries. A template with a main part already has one entry, the main part's.

    Example:
        @hm.template
        def lollipop(x, y):
            stem = hm.charts.ErrorBars(x=x, y=y, lower=0, upper=y)
            head = hm.Points(x=x, y=y)
            hm.contract(main=head, parts={"stem": stem, "head": head})

        with hm.Plot(data={"a": [1, 2], "b": [3, 4]}):
            pop = lollipop("a", "b")
            pop.on_click(print)              # the head's clicks
            pop.part("stem").update(color="gray")
    """
    building = _building.get()
    if not building:
        raise RuntimeError(
            "hm.contract() declares a template's main part and parts; call it inside a "
            "Template's build() or an @hm.template function."
        )
    template = building[-1]
    if template._contract:
        raise RuntimeError(f"{template._name} already called hm.contract(); declare everything in one call.")
    if main is not None and not (isinstance(main, Template) or main.kind in REGISTRY["marks"]
                                 if isinstance(main, Node) else False):
        raise TypeError(
            f"hm.contract(main=...) takes one of {template._name}'s marks or nested templates, "
            f"not {_label(main) if isinstance(main, Node) else type(main).__name__}."
        )
    parts = dict(parts or {})
    for key, node in parts.items():
        if not isinstance(key, str) or not key or not isinstance(node, Node) or isinstance(node, Slot):
            raise TypeError(
                f"hm.contract(parts=...) maps names to {template._name}'s components "
                f"({{\"stem\": stem}}); {key!r} maps to {type(node).__name__}."
            )
    entries = []
    for entry in legend_entries or []:
        nodes = [entry.get("swatch"), *(entry.get("parts") or [])] if isinstance(entry, dict) else []
        if not isinstance(entry, dict) or set(entry) - {"label", "swatch", "parts"} or not all(
                node is None or isinstance(node, Node) and not isinstance(node, Slot) for node in nodes) or (
                entry.get("label") is not None and not isinstance(entry["label"], str)) or (
                entry.get("parts") is not None and not isinstance(entry["parts"], (list, tuple))):
            raise TypeError(
                f"hm.contract(legend_entries=...) takes a list of {{\"label\": str, \"swatch\": mark, "
                f"\"parts\": [marks]}} (each key optional) for {template._name}; received {entry!r}."
            )
        entries.append(dict(entry))
    template._contract = {"main": main, "parts": parts, **({"legend_entries": entries} if entries else {})}


def template(function):
    """Make a Template from a function that builds components.

    ::

        @hm.template
        def panel(data, *, title=None):
            with hm.Data(data):
                with hm.Plot(title=title):
                    hm.Frame()
                    hm.slot()

        with panel(table, title="A"):
            hm.Points(x="a", y="b")

    The result is a Template subclass named after the function: calling it runs the
    function as ``build()``, and ``isinstance(node, panel)`` works. Subclass ``hm.Template``
    instead when the template should keep components as attributes or add methods.
    """
    if isinstance(function, type) or not callable(function):
        raise TypeError("@hm.template decorates a function; subclass hm.Template to write a class.")
    if inspect.isgeneratorfunction(function):
        raise TypeError(
            f"@hm.template function {function.__name__!r} uses yield; mark where children go "
            "with hm.slot() instead."
        )

    def build(self, *args, **kwargs):
        return function(*args, **kwargs)

    made = type(function.__name__, (Template,), {
        "build": build,
        "__doc__": function.__doc__,
        "__module__": function.__module__,
        "__qualname__": function.__qualname__,
        "__wrapped__": function,
    })
    try:
        made.__signature__ = inspect.signature(function)
    except (TypeError, ValueError):
        pass
    return made


# Inputs (TODO 41): named values the viewer sets, read with hm.input.<name> or "$name". The
# registry lists them (options.json marks each `input: true`).
INPUT_KINDS = frozenset(REGISTRY["inputs"])
# The components whose inputs are read in them by name (inputContext: true): the Scene, an
# InputContext and a Template. The Scene is always the root.
_INPUT_CONTEXTS = frozenset(REGISTRY["inputContexts"])
_INPUT_READ = re.compile(r"\$([A-Za-z_]\w*)")


def _input_initial(kind, props):
    """An input's value before the viewer sets it (utils/inputs.js initialValue). None while it
    is read from the data (value=hm.min("x"), options=hm.categories(...)): the browser sends the
    value once it has read it."""
    value = props.get("value")
    if isinstance(value, Expression) or value is None and isinstance(
            props.get("min" if kind in ("Slider", "Playback") else "options"), Expression):
        return None
    if value is not None:
        return value
    if kind == "TextInput":
        return ""
    if kind == "ColorPicker":
        return "#000000"
    if kind in ("Slider", "Playback"):
        return props.get("min", 0)
    if kind == "Checkbox":
        return False
    if kind == "Button":
        return 0
    if kind == "Select" and props.get("multiple"):
        return []
    if kind == "Select":
        options = props.get("options") or []
        values = list(options.values()) if isinstance(options, dict) else list(options)
        return values[0] if values else None
    return None


class Input(Node):
    """An input (TODO 41): a value the viewer sets. Everything in its input context (the Scene,
    an InputContext, a Template) reads it by name: hm.input.<name> anywhere, or "$name" where a
    string names a column. ``value`` is the viewer's latest value, sent back from the browser;
    assigning it sets it in every view. ``on_change(callback)`` runs callback(event) with
    event.value after each change."""

    @property
    def value(self):
        return _input_initial(self.kind, self.props)

    @value.setter
    def value(self, value):
        self.update(value=value)

    def on_change(self, callback):
        return self.on_event("change", callback)


class Playback(Input):
    """A slider that plays (TODO 41.4): ``play()`` advances its value by ``rate`` value units per
    second (one ``step`` every step/rate seconds), ``pause()`` stops it, and ``reset()`` returns
    it to its initial value, in every view. ``playing`` is true while it plays, including after
    the viewer pressed play."""

    @property
    def playing(self):
        return bool(self.props.get("playing", self.props.get("autoplay", False)))

    def play(self):
        self.update(playing=True)

    def pause(self):
        self.update(playing=False)

    def reset(self):
        self.update(reset=(self.props.get("reset") or 0) + 1)


def _check_snapshot(snapshot):
    """An HTML export's snapshot kind (TODO 54)."""
    if snapshot not in ("svg", "png", False, None):
        raise ValueError(f'HTML export snapshot must be "svg", "png" or False; received {snapshot!r}.')


# An exported page's own layout (TODO 132.6), as scene/htmlPage.js PAGE_LAYOUT: its margin and the
# most its content grows to, in CSS pixels.
_PAGE_LAYOUT = {"max_width": 960, "margin": 24}


def _widest_plot(node):
    """The widest fixed ``width`` of a Plot in a scene tree (state nodes), or 0."""
    width = (node.get("props") or {}).get("width") if node.get("kind") == "Plot" else None
    own = width if isinstance(width, (int, float)) and not isinstance(width, bool) and math.isfinite(width) else 0
    return max([own, *(_widest_plot(child) for child in node.get("children") or [])])


def _page_layout(page, root=None):
    """An HTML export's ``page`` option as the browser takes it ({"maxWidth", "margin"}): True
    (the default layout), False (a bare page: no margin, no maximum width) or a dict with
    ``max_width`` (None for none) and ``margin``. With the exported tree's ``root``, the maximum
    width is at least its widest fixed-width Plot, which the page would otherwise clip
    (htmlPage.js pageLayout)."""
    if page is True or page is None:
        page = {}
    elif page is False:
        page = {"max_width": None, "margin": 0}
    message = f"HTML export page must be True, False or a dict of max_width and margin in pixels (max_width=None for none); received {page!r}."
    if not isinstance(page, dict) or set(page) - set(_PAGE_LAYOUT):
        raise ValueError(message)
    layout = {**_PAGE_LAYOUT, **page}
    width, margin = layout["max_width"], layout["margin"]

    def number(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    if not ((width is None or (number(width) and width > 0)) and number(margin) and margin >= 0):
        raise ValueError(message)
    if root is not None and width is not None:
        width = max(width, _widest_plot(root))
    return {"maxWidth": width, "margin": margin}


class PlotNode(Node):
    """A Plot (TODO 49): ``description`` is its description as the browser wrote it."""

    kind = "Plot"

    @property
    def description(self):
        """The plot's description as screen readers get it: ``description=``, then the summary
        generated from its marks, axes and legend (``describe=False`` leaves it out). Synced from
        the browser after the plot settles; None before a view has shown it."""
        return self.__dict__.get("_description")


def _check_data_rows(props):
    if "rows" not in props:
        if props.get("value") is None:
            raise TypeError("Data requires a table or a row count: pass hm.Data(table), hm.Data(rows=N) or hm.Data(value=transform) (a transform node passed positionally is a child).")
        return
    if props.get("value") is not None:
        raise ValueError("Data: pass a table or rows, not both.")
    rows = props["rows"]
    if not isinstance(rows, Expression) and (
        isinstance(rows, (bool, np.bool_)) or not isinstance(rows, numbers.Real)
        or rows < 0 or rows > 2147483647 or not math.isfinite(rows) or int(rows) != rows
    ):
        raise ValueError("Data.rows must be an integer from 0 to 2147483647; pass the number of rows to generate.")


class Simulate(Node):
    """Per-row state stepped at a fixed interval (TODO 42): ``initial`` gives each state column's
    first value, ``update`` its next value, reading ``hm.prev.<name>`` (the previous step),
    the parent's columns (``hm.col``), ``hm.view.dt`` and inputs. ``step_count``, ``running`` and
    ``settled`` follow the browser; ``reset=`` (a Button's count) starts again."""

    kind = "Simulate"

    @property
    def step_count(self):
        return self._simulation.get("steps", 0)

    @property
    def running(self):
        return self._simulation.get("running", self.props.get("running", True) is not False)

    @property
    def settled(self):
        return self._simulation.get("settled", False)

    @property
    def _simulation(self):
        return self.__dict__.get("_simulation_status", {})


def _check_presentation(plot):
    """A Plot's sky and fog (TODO 37, 138.3) only in a 3D Plot. The browser reports the same."""
    name = f"Plot {plot.props['name']!r}" if plot.props.get("name") else "the Plot"
    # A type read from an input (type=hm.input.view) is known only in the browser, which checks it.
    view = plot.props.get("type", "2d")
    if isinstance(view, str) and view not in ("3d", "3d-y-up"):
        for spec in plot.props.get("effects") or ():
            if spec["kind"] in ("sky", "fog"):
                raise ValueError(f'Plot.effects: the {spec["kind"]} needs a 3D view, and {name} is 2D. '
                                 f'Set type="3d" on it, or remove the {spec["kind"]}.')


def _check_interaction(node):
    """An Interaction's columns: "@" names that are not state names, each a selection
    (utils/interaction.js interactionScope)."""
    columns = node.props.get("columns")
    if not isinstance(columns, dict):
        raise TypeError('Interaction needs columns={"@focus": hm.selection()}: names for selections.')
    for name, resource in columns.items():
        if not (isinstance(name, str) and re.fullmatch(r"@[A-Za-z_]\w*", name) and name[1:] not in STATE_NAMES):
            raise ValueError(f'Interaction: a column\'s name is "@" and a name that is not a state name, such as "@focus"; received {name!r}.')
        if not isinstance(resource, SelectionResource):
            raise TypeError(f"Interaction: columns[{name!r}] must be a selection, from hm.selection().")


def _check_simulate(node):
    """A Simulate's update names state columns that have an initial value, and prev() reads
    them (utils/simulate.js checkSimulation)."""
    initial, update = node.props.get("initial"), node.props.get("update")
    if not isinstance(initial, dict) or not initial:
        raise ValueError("Simulate needs initial={...}: each state column's first value.")
    if not isinstance(update, dict) or not update:
        raise ValueError("Simulate needs update={...}: each state column's next value.")
    for name, value in update.items():
        if name not in initial:
            raise ValueError(f"Simulate: update[{name!r}] has no initial value; add initial[{name!r}].")
        for read in _prev_reads(value):
            if read not in initial:
                raise ValueError(f"Simulate: update[{name!r}] reads hm.prev.{read}, which is not a state column.")
    stop = node.props.get("stop")
    if stop is None:
        return
    if not isinstance(stop, dict) or isinstance(stop.get("tolerance"), bool) or not isinstance(stop.get("tolerance"), (int, float)):
        raise ValueError('Simulate needs stop={"tolerance": ...}: the largest change that counts as settled.')
    unknown = set(stop) - {"tolerance", "every", "columns"}
    if unknown:
        raise ValueError(f"Simulate: stop has no option {sorted(unknown)[0]!r} (tolerance, every, columns).")
    for column in stop.get("columns") or []:
        if column not in initial:
            raise ValueError(f"Simulate: stop['columns'] names {column!r}, which is not a state column.")


def _prev_reads(value):
    if isinstance(value, Expression):
        if value.op == "column" and isinstance(value.args[0], str) and value.args[0].startswith("@prev:"):
            yield value.args[0][len("@prev:"):]
            return
        for arg in value.args:
            yield from _prev_reads(arg)


def _input_reads(value, strings, depth=0):
    """The input names `value` reads: hm.input.x anywhere, "$x" where `strings` (a column's place;
    every string inside an expression is)."""
    if isinstance(value, Expression):
        if value.op == "input":
            yield value.args[0]
            return
        if value.op in ("column", "state"):
            return
        for arg in value.args:
            yield from _input_reads(arg, True, depth)
    elif strings and isinstance(value, str):
        match = _INPUT_READ.fullmatch(value)
        if match:
            yield match.group(1)
    elif depth < 2 and (isinstance(value, dict) or isinstance(value, (list, tuple)) and len(value) <= 64):
        for item in (value.values() if isinstance(value, dict) else value):
            yield from _input_reads(item, False, depth + 1)


def _input_read_has_default(value, name, depth=0):
    """Whether a read of `name` inside `value` carries a default (hm.input(name, default=...)):
    it resolves to the default while no control or writer declares the input."""
    if isinstance(value, Expression):
        if value.op == "input":
            return value.args[0] == name and getattr(value, "_default", _NO_DEFAULT) is not _NO_DEFAULT
        return value.op not in ("column", "state") and any(_input_read_has_default(arg, name, depth) for arg in value.args)
    if depth < 2 and (isinstance(value, dict) or isinstance(value, (list, tuple)) and len(value) <= 64):
        return any(_input_read_has_default(item, name, depth + 1) for item in (value.values() if isinstance(value, dict) else value))
    return False


def _check_inputs(scene, nodes):
    """Input names and reads (TODO 41): one input per name in each input context, none inside a
    Plot, and every read resolves in its reader's context or one around it. The browser resolves
    them the same way (SceneNode.svelte); checking here reports a misspelled name at once."""
    def context_of(node):
        parent = node.parent
        while parent is not None and parent.kind not in _INPUT_CONTEXTS:
            parent = parent.parent
        return parent if parent is not None else scene

    names = {}
    for node in nodes:
        if node.kind not in INPUT_KINDS:
            continue
        name = node.props.get("name")
        if node.kind == "Button" and name is None and node.props.get("set") is not None:
            continue  # it only writes other inputs (set=), checked below
        if not isinstance(name, str) or not name.isidentifier():
            raise ValueError(f"{node.kind} needs a name, an identifier such as 'bins'; received {name!r}."
                             + (" A Button that acts on a press takes set= instead: set=focus.reset() or "
                                "set=focus.set(hm.literal('all'))." if node.kind == "Button" else ""))
        parent = node.parent
        while parent is not None:
            if _is_plot_like(parent) or _facet_cell_plot(parent):
                where = "a Plot" if parent.kind in ("Plot", "Facet") else parent.kind
                raise ValueError(f"{node.kind} {name!r} is inside {where}; put it in a Row beside the "
                                 f"{'Plot' if parent.kind in ('Plot', 'Facet') else parent.kind}.")
            parent = parent.parent
        reads_data = [key for key in ("min", "max", "value", "options") if isinstance(node.props.get(key), Expression)]
        if reads_data and node._data_resource() is None:
            raise ValueError(f"{node.kind} {name!r}: {' and '.join(reads_data)} read the data, so it needs a Data scope "
                             "around it (with hm.Data(table): ...).")
        scope = names.setdefault(context_of(node).id, {})
        if name in scope:
            raise ValueError(f"Two inputs are named {name!r} in one input context; give one another name, "
                             "or put it in an InputContext of its own.")
        scope[name] = node
    # Inputs marks write on click or hover (TODO 145.2): select={"input": "root", "column": "id"}.
    # Several marks may write one, beside a widget of that name.
    # A Button's set= writes inputs on a press (TODO 145.7): set=hm.input.root.reset().
    for node in nodes:
        writes = []
        for key in ("select", "hover"):
            value = node.props.get(key)
            if isinstance(value, dict) and "input" in value:
                writes.append((key, value))
        if node.kind == "Button" and node.props.get("set") is not None:
            given = node.props["set"]
            for value in given if isinstance(given, (list, tuple)) else [given]:
                if not (isinstance(value, dict) and "input" in value):
                    raise ValueError(f"Button.set takes input writes (hm.input.root.reset(), "
                                     f"hm.input.root.set(hm.literal('all'))); received {value!r}.")
                writes.append(("set", value))
            if node.props.get("name") is None and node.props.get("label") is None:
                raise ValueError("Button: with set and no name, give it a label, the text on the button.")
        for key, value in writes:
            name = value.get("input")
            if not isinstance(name, str) or not name.isidentifier():
                raise ValueError(f"{node.kind}.{key}: input names the input it writes, an identifier such as "
                                 f"'root'; received {name!r}.")
            forms = [form for form in ("column", "value", "reset") if form in value]
            if len(forms) > 1:
                raise ValueError(f"{node.kind}.{key} writes the input {name!r} from one of a column, a value or "
                                 f"reset; it gives {' and '.join(forms)}.")
            if key == "set" and "column" in value:
                raise ValueError(f"Button.set=hm.input.{name}.set({value['column']!r}) reads a row, which a Button "
                                 f"has none of: set a constant (hm.input.{name}.set(hm.literal(...))) or "
                                 f"hm.input.{name}.reset().")
            if key == "hover" and "reset" in value:
                raise ValueError(f"{node.kind}.hover cannot reset the input {name!r}: a hover shows a value while "
                                 "the pointer is on a row; reset it on click (select) or with a Button.")
            if not forms and (not isinstance(value.get("column"), str) or not value.get("column")):
                raise ValueError(f"{node.kind}.{key} writes the input {name!r}, and needs the column whose value at "
                                 f"the {'clicked' if key == 'select' else 'hovered'} row it takes: "
                                 f"hm.input.{name}.set('id').")
            if "column" in value and (not isinstance(value["column"], str) or not value["column"]):
                raise ValueError(f"{node.kind}.{key}: the column hm.input.{name}.set(...) reads is a column name; "
                                 f"received {value['column']!r}.")
            names.setdefault(context_of(node).id, {}).setdefault(name, node)
    for node in nodes:
        strings = set(REGISTRY["components"].get(node.kind, {}).get("stringReads", ()))
        for key, value in node.props.items():
            for name in _input_reads(value, key in strings):
                context = context_of(node)
                while name not in names.get(context.id, {}) and context is not scene:
                    context = context_of(context)
                if name not in names.get(context.id, {}):
                    if _input_read_has_default(value, name):
                        continue
                    visible, context = [], context_of(node)
                    while True:
                        visible += [n for n in names.get(context.id, {}) if n not in visible]
                        if context is scene:
                            break
                        context = context_of(context)
                    listed = f" (inputs here: {', '.join(visible)})" if visible else ""
                    raise ValueError(f"{node.kind}.{_snake(key)} reads ${name}, but no input named {name!r} "
                                     f"is in its input context or around it{listed}.")


_TABLE_PROPS = ("data", "value", "rows", "url", "edges", "nodes")


def _check_transform_table(node):
    """A transform inside a Plot reads the table of a Data, a Plot's data= or another source
    around it (2026-10-23: a Calculate in a Plot without data= timed the export out in the
    browser; here it names the line)."""
    if REGISTRY["components"].get(node.kind, {}).get("group") != "Transforms" or getattr(node, "_chain_root", False):
        return
    at, in_plot = node.parent, False
    while at is not None:
        if at.kind in ("Data", "Provider", "GraphData", "Facet", "Partition", "Simulate", "Template", "Slot"):
            return
        if any(at.props.get(key) is not None for key in _TABLE_PROPS):
            return
        in_plot = in_plot or at.kind == "Plot"
        at = at.parent
    if in_plot and not any(node.props.get(key) is not None for key in _TABLE_PROPS):
        raise ValueError(f"{node.kind} has no table to transform: put it inside a Data (with hm.Data(table):), "
                         f"or give the Plot around it data=.")


def _check_series_index(node):
    """A pandas Series channel is matched to rows by position (TODO 40.1). Its index must be the
    plotted DataFrame's; otherwise a reordered Series of the same length would pair its values
    with the wrong rows without a word."""
    table = False
    for key, value in node.props.items():
        if isinstance(value, DataColumn) and value.pandas_index is not None:
            if table is False:
                table = node._data_resource()
            expected = getattr(table, "_pandas_index", None)
            if expected is not None and not value.pandas_index.equals(expected):
                raise ValueError(
                    f"{node.kind}.{_snake(key)}: the Series' index does not match the plotted "
                    "DataFrame's, and rows are matched by position. Reindex it "
                    "(s.reindex(df.index)), or pass s.to_numpy() to match rows by position.")


def _contains_kind(node, kind):
    """Whether ``node`` or any descendant is of ``kind``."""
    stack = [node]
    while stack:
        current = stack.pop()
        if current.kind == kind:
            return True
        stack.extend(current.children)
    return False


def _second_parent(child):
    """The error for adding a component that another container holds."""
    parent = child.parent
    if child._implicit is not None and parent.parent is child._implicit:
        return ValueError(
            f"This {child.kind} was displayed on its own, which put it in a Plot of its own, "
            f"and a component has one parent. Build a new {child.kind} here (for example, "
            "with a function that returns one), or first remove it from that display with "
            "component.parent.remove(component)."
        )
    def a(name):
        return f"{'an' if name[0] in 'AEIOU' else 'a'} {name}"

    if isinstance(parent, (Slot, Template)):
        name = parent.template._name if isinstance(parent, Slot) else parent._name
        where = f"the slot of {a(name)}" if isinstance(parent, Slot) else f"{a(name)} template"
        source = f"that {name}"
    else:
        where, source = a(parent.kind), f"the {parent.kind}"
    return ValueError(
        f"This {child.kind} already belongs to {where}, and a component has one parent. "
        f"Remove it from {source} first, or build one per place (for example, with a "
        f"function that returns a new {child.kind})."
    )


class Scene(Node):
    kind = "Scene"

    def __init__(self, *children, _detached=False, **props):
        try:
            self._callback_loop = asyncio.get_running_loop()
        except RuntimeError:
            self._callback_loop = None
        self.revision = 0
        self._widget = None
        self._closed = False
        self._pending = {}
        self._views = {}
        self._interaction_sequences = {}
        self._interaction_broadcast_sequences = {}
        self._input_sequences = {}
        self._offset_sequences = {}
        self._last_state = None
        self._accepted = None
        self._property_revisions = {}
        self._tables = set()
        self._themes = set()
        self._normalizations = set()
        self._continuous_scales = set()
        self._category_scales = set()
        self._selections = set()
        self._identities = set()
        self._states = {}
        self._accepted_objects = None
        self.error = None
        #: The errors the browser reports after the scene was accepted (TODO 136.6), each a dict:
        #: severity, code, component, node, property, message, hint. Reported, not rolled back.
        self.diagnostics = []
        self._errors = deque(maxlen=10)
        self.pending = False
        self.status = "idle"
        self.last_export_report = None
        if _stack.get() and _stack.get()[-1][1] == owner() and not _detached:
            raise ValueError("Scenes are roots; use Row/Column inside a Scene.")
        if _detached or (_stack.get() and _stack.get()[-1][1] != owner()):
            token = _stack.set(())
            transaction_token = (
                _transaction.set(None)
                if _transaction.get() is not None
                and _transaction.get().owner != owner()
                else None
            )
            try:
                super().__init__(*children, **props)
            finally:
                _stack.reset(token)
                if transaction_token is not None:
                    _transaction.reset(transaction_token)
        else:
            super().__init__(*children, **props)

    def _nodes(self, adopted=None):
        def walk(n):
            yield n
            for child in n.children:
                yield from walk(child)

        # With the chains its marks read (TODO 144), as the snapshot sends them.
        if adopted is None:
            adopted = getattr(self, "_adopted", ())
        return [*walk(self), *(n for root in adopted for n in walk(root))]

    def _validate(self):
        if self._closed:
            raise RuntimeError("Scene is closed.")
        nodes = self._nodes(self._check_pipeline_references())
        # A detached template definition can be created before its caller supplies a Plot and
        # the explicit parameter values. Its exported tree is checked by the template loader.
        if (len(self.children) == 1 and isinstance(self.children[0], Template)
                and self.children[0]._implicit is self
                and any(_has_template_param(node.props) for node in nodes)):
            return
        ids = {n.id for n in nodes}
        cell_plots = {n.id for n in nodes if _facet_cell_plot(n)}

        def refs(v, where):
            if isinstance(v, Node) and v.id not in ids:
                raise ValueError(f"{where} refers to a {v.kind} that is not in this scene; add that {v.kind} to "
                                 "the scene (inside its with block, or with add()), or refer to one that is.")
            if isinstance(v, dict):
                for x in v.values():
                    refs(x, where)
            elif isinstance(v, (list, tuple)):
                for x in v:
                    refs(x, where)

        _check_inputs(self, nodes)
        for n in nodes:
            for key, value in n.props.items():
                refs(value, f"{n.kind}.{_snake(key)}")
            _check_consumer(n, ids)
            _check_series_index(n)
            _check_transform_table(n)
            if n.kind == "Simulate":
                _check_simulate(n)
            if n.kind == "Interaction":
                _check_interaction(n)
            if n.kind in _FEATURES:
                _FEATURES[n.kind].validate_scene(n)
            ancestors = []
            parent = n.parent
            figure = None
            while parent is not None:
                if parent.id in cell_plots or parent.kind in FIGURE_KINDS:
                    ancestors.append("Plot")
                if parent.kind in FIGURE_KINDS and figure is None:
                    figure = parent.kind
                ancestors.append(parent.kind)
                parent = parent.parent
            if n.kind == "Panels":
                for child in n.children:
                    if child.kind != "Plot":
                        raise ValueError(f"Panels stacks Plots over one x; {child.kind} is not a Plot. Put each panel's "
                                         "marks in a Plot inside the Panels.")
            if n.kind in ("Marginals", "FocusContext"):
                for axis in ("x", "y"):
                    if n.props.get(axis) is None:
                        raise ValueError(f"{n.kind}.{axis} is required: the column the scatter plots along {axis} and "
                                         f"its {'top' if axis == 'x' else 'right'} histogram bins." if n.kind == "Marginals" else
                                         f"{n.kind}.{axis} is required: the column the lines plot along {axis}.")
                height = n.props.get("height")
                if (isinstance(height, numbers.Real) and not isinstance(height, bool)
                        and not (math.isfinite(height) and height >= 160)):
                    raise ValueError(f"{n.kind}.height is the figure's height in CSS pixels, at least 160; "
                                     f"received {height!r}.")
            # A figure's children are drawn in its main Plot (Marginals' scatter): marks, not views.
            if figure is not None and (n.kind in FIGURE_KINDS or n.kind in ("Plot", "Facet")
                                       or REGISTRY["components"].get(n.kind, {}).get("layout")):
                raise ValueError(f"{n.kind} cannot be inside {figure}: its children are drawn in its main Plot. "
                                 f"Put marks inside the {figure}, or put the {figure} and the {n.kind} side by side "
                                 "in a Row, Column or Grid.")
            if n.kind in FIGURE_KINDS and ("Plot" in ancestors or "Facet" in ancestors):
                where = "a Plot" if "Plot" in ancestors else "a Facet"
                raise ValueError(f"{n.kind} cannot be inside {where}: it draws Plots of its own. Put it in a Scene, "
                                 "Row, Column or Grid, or on its own.")
            if n.id in cell_plots:
                below, written = list(n.children), False
                while below and not written:
                    child = below.pop()
                    written = child.kind == "Plot"
                    below.extend(child.children)
                if written:
                    marks = sorted({child.kind for child in _bare_plot_content(n)})
                    raise ValueError(f"Facet holds both a Plot and {', '.join(marks)} outside it: put the marks in the "
                                     "Plot, or leave the Plot out and the Facet makes one around its marks.")
            if n.kind in PLOT_CONTENT and "Plot" not in ancestors:
                raise ValueError(f"{n.kind} must be inside a Plot: create it in a `with hm.Plot():` block, or pass "
                                 f"it to one, hm.Plot({n.kind.lower()}).")
            # A layout (Scene, Row, Column, Grid: the registry's layout flag) or a Plot.
            if (
                (REGISTRY["components"].get(n.kind, {}).get("layout") or n.kind == "Plot")
                and "Plot" in ancestors
            ):
                raise ValueError(f"{n.kind} cannot be nested inside a Plot.")
            if n.kind in ("Plot", "Frame") and n.props.get("bands") is not None:
                _check_bands(n.props["bands"])
            if n.kind in ("Plot", "Frame"):
                check_frame_guides(n)
            if n.kind == "Row" and n.props.get("widths") is not None:
                _check_row_widths(n.props["widths"])
            if n.kind == "Plot":
                _check_presentation(n)
                # Descriptions (TODO 49): the author's text and whether the summary follows it.
                if n.props.get("description") is not None and not isinstance(n.props["description"], str):
                    raise TypeError("Plot description must be a string.")
                if n.props.get("describe") is not None and not isinstance(n.props["describe"], bool):
                    raise TypeError("Plot describe must be True or False.")
            if n.kind in ("Title", "Markdown") and ("Plot" in ancestors or "Facet" in ancestors):
                raise ValueError(f"{n.kind} is text for layouts: put it in a Scene, Row, Column or Grid beside "
                                 "the plot (a plot's own title is Plot(title=...)).")
            if n.kind == "Frame" and "Plot" not in ancestors:
                raise ValueError("Frame must be inside Plot.")
            if n.kind == "LinkViews":
                if len(n.props.get("plots", [])) < 2 or any(
                    p.kind != "Plot" for p in n.props["plots"]
                ):
                    raise ValueError("LinkViews requires at least two Plots.")
                if n.props.get("axes", "xy") not in ("x", "y", "xy"):
                    raise ValueError('LinkViews axes must be "x", "y", or "xy".')
                if n.props.get("scales", "shared") not in ("shared", "free"):
                    raise ValueError('LinkViews scales must be "shared" or "free".')
                plots = n.props["plots"]
                keys = (
                    "coordinates",
                    "projection",
                    "angleUnit",
                    "xTransform",
                    "yTransform",
                )
                if any(p.props.get("type", "2d") in ("3d", "3d-y-up") for p in plots) or any(
                    any(p.props.get(k) != plots[0].props.get(k) for k in keys)
                    for p in plots[1:]
                ):
                    raise ValueError(
                        "LinkViews requires compatible 2D coordinate systems."
                    )
            if "position" in n.props and any(k in n.props for k in ("x", "y", "z")):
                raise ValueError(f"{n.kind}: use position or x/y/z, not both.")

            if n.kind == "Plot" and n.props.get("height", 400) <= 0:
                raise ValueError("Plot height must be positive.")

    def _check_pipeline_references(self):
        # A referenced transform must be in this scene, where its output is computed once and
        # read by every reference to it (TODO 142.3). A chain built outside any block
        # (sales = hm.Data(df); sales.filter(...)) is adopted (TODO 144): its root is sent with
        # this scene, before the scene's own children, without moving it, so the same chain can
        # feed charts in several scenes.
        present, references, adopted = set(), [], []
        def walk(n):
            present.add(n.id)
            source = n._local_data if isinstance(n._local_data, Node) else (
                n.props.get("value") if n.kind == "Data" and isinstance(n.props.get("value"), Node) else
                n.props.get("data") if isinstance(n.props.get("data"), Node) else None)
            if source is not None:
                references.append((n, source))
            for child in n.children:
                if isinstance(child, Node):
                    walk(child)
        for child in self.children:
            if isinstance(child, Node):
                walk(child)
        while references:
            n, source = references.pop(0)
            if source.id in present:
                continue
            root = source
            while root.parent is not None:
                root = root.parent
            # Only a chain from an hm.Data can be adopted: a transform needs the data it reads.
            if root.kind != "Data":
                raise ValueError(f"{n.kind}: data= references a {source.kind} that is not in this scene; "
                                 f"add the {source.kind} (with the data it reads) to the scene, or pass a table.")
            adopted.append(root)
            walk(root)
        return adopted

    def _snapshot(self):
        adopted = self._check_pipeline_references()
        # Subscribe only after validation succeeds. Failed transactions must not change who
        # receives pipeline updates, and a scene must stop watching roots it no longer reads.
        for root in getattr(self, "_adopted", ()):
            if root not in adopted:
                root._adopters.discard(self)
        for root in adopted:
            if not hasattr(root, "_adopters"):
                root._adopters = weakref.WeakSet()
            root._adopters.add(self)
        self._adopted = adopted
        old_tables = self._tables
        self._tables = set()
        old_themes = self._themes
        self._themes = set()
        old_normalizations = self._normalizations
        self._normalizations = set()
        old_continuous_scales = self._continuous_scales
        self._continuous_scales = set()
        old_category_scales = self._category_scales
        self._category_scales = set()
        old_selections = self._selections
        self._selections = set()
        old_identities = self._identities
        self._identities = set()
        columns = {}
        tables = {}
        scales = {}
        normalizations = {}
        themes = {}
        selections = {}
        identities = {}

        def encode(v):
            if isinstance(v, TemplateParam):
                return {"$param": v.name}
            if isinstance(v, (datetime.date, np.datetime64)):
                return {"$datetime": _epoch_milliseconds(v)}
            if isinstance(v, Expression):
                out = {"op": v.op, "args": [encode(item) for item in v.args]}
                # hm.input(name, default=): the read resolves to the default while nothing
                # declares the input (a Treemap whose writers are the marks inside it).
                if v.op == "input" and getattr(v, "_default", _NO_DEFAULT) is not _NO_DEFAULT:
                    out["default"] = encode(v._default)
                return {"$expression": out}
            if isinstance(v, Node):
                return {"$ref": v.id}
            if isinstance(v, Literal):
                return {"$literal": encode(v.value)}
            if isinstance(v, Animate):
                return v._descriptor(encode)
            if isinstance(v, Connect):
                return v._descriptor(encode)
            if isinstance(v, Rgb):
                return {"$rgb": {k: encode(c) for k, c in v.components.items()}}
            if isinstance(v, DataColumn):
                columns[v.id] = v
                return {"$column": v.id}
            if isinstance(v, Table):
                v._scenes.add(self)
                self._tables.add(v)
                tables[v.id] = {
                    "version": v.version,
                    "columns": {k: encode(c) for k, c in v.columns.items()},
                    "key": v.key,
                    "selection": encode(v.selection),
                    "brush": encode(v.brush),
                    "hover": encode(v.hover),
                    "nearby": encode(v.nearby),
                    "nearest": encode(v.nearest),
                    "offsets": v._offsets_descriptor(),
                }
                if v.grid is not None:
                    tables[v.id]["grid"] = v.grid.descriptor(encode)
                return {"$table": v.id}
            if isinstance(v, SelectionResource):
                v._scenes.add(self)
                self._selections.add(v)
                selections[v.id] = {
                    "version": v.version,
                    "active": v.active,
                    "owners": {owner: list(rows) for owner, rows in v._rows.items()},
                    "constraints": {owner: list(values) for owner, values in v._constraints.items()},
                    **({"by": v.by} if v.by is not None else {}),
                }
                return {"$selection": v.id}
            if isinstance(v, IdentityResource):
                v._scenes.add(self)
                self._identities.add(v)
                identities[v.id] = {
                    "keys": encode(v.keys),
                    "selection": encode(v.selection),
                    "brush": encode(v.brush),
                    "hover": encode(v.hover),
                    "nearby": encode(v.nearby),
                    "nearest": encode(v.nearest),
                }
                return {"$identity": v.id}
            if isinstance(v, NormalizationResource):
                v._scenes.add(self)
                self._normalizations.add(v)
                normalizations[v.id] = {"version": v.version, **v.snapshot()}
                return {"$normalization": v.id}
            if isinstance(v, ContinuousScale):
                v._scenes.add(self)
                self._continuous_scales.add(v)
                encode(v.normalization)
                scales[v.id] = v.snapshot()
                return {"$scale": v.id}
            if isinstance(v, CategoryScale):
                v._scenes.add(self)
                self._category_scales.add(v)
                scales[v.id] = {
                    "kind": "ordinal" if isinstance(v, OrdinalScale) else "categorical",
                    "version": v.version,
                    "domain": v.domain,
                    "range": v.range,
                    "unknown": v.unknown,
                }
                if isinstance(v, OrdinalScale):
                    scales[v.id]["colormap"] = v.colormap
                if v.label is not None:
                    scales[v.id]["label"] = v.label
                return {"$scale": v.id}
            if isinstance(v, ThemeResource):
                v._scenes.add(self)
                self._themes.add(v)
                themes[v.id] = {"version": v.version, "value": v.value}
                return {"$theme": v.id}
            if isinstance(v, dict):
                return {k: encode(x) for k, x in v.items()}
            if isinstance(v, (list, tuple)):
                return [encode(x) for x in v]
            return v

        def node(n):
            children = [node(c) for c in n.children]
            if _facet_cell_plot(n):
                children = [{"id": _cell_plot_id(n), "kind": "Plot", "props": dict(_CELL_PLOT_PROPS),
                             "events": [], "children": children}]
            mark = {
                "id": n.id,
                "kind": n.kind,
                "props": encode(n._protocol_props()),
                "events": list(n._callbacks),
                "children": children,
            }
            if n._local_data is None:
                return mark
            return {"id": n._data_scope_id, "kind": "Data",
                    "props": {"value": encode(n._local_data)},
                    "events": [], "children": [mark]}

        root = node(self)
        root["children"][:0] = [node(adopted) for adopted in self._adopted]
        for table in old_tables - self._tables:
            table._scenes.discard(self)
        for theme_resource in old_themes - self._themes:
            theme_resource._scenes.discard(self)
        for resource in old_normalizations - self._normalizations:
            resource._scenes.discard(self)
        for resource in old_continuous_scales - self._continuous_scales:
            resource._scenes.discard(self)
        for resource in old_category_scales - self._category_scales:
            resource._scenes.discard(self)
        for selection_resource in old_selections - self._selections:
            selection_resource._scenes.discard(self)
        for identity_resource in old_identities - self._identities:
            identity_resource._scenes.discard(self)
        return {
            "protocol": 1,
            "library": REGISTRY["library"],
            "scene": self.id,
            "revision": self.revision,
            "root": root,
            "tables": tables,
            "scales": scales,
            "normalizations": normalizations,
            "themes": themes,
            "shapes": registered_shapes(),
            "selections": selections,
            "identities": identities,
            # The plugins its effects and shades name (TODO 138.4): names, never code.
            **({"plugins": plugins} if (plugins := scene_plugins(root)) else {}),
            "columns": {
                k: {
                    key: value
                    for key, value in c.descriptor().items()
                    if key != "structured"
                }
                for k, c in columns.items()
            },
        }, columns

    def _publish(self):
        if self._closed:
            raise RuntimeError("Scene is closed.")
        self.revision += 1
        state, columns = self._snapshot()
        previous = {n["id"]: n for n in flatten((self._last_state or {}).get("root"))}
        for n in flatten(state["root"]):
            old = previous.get(n["id"], {}).get("props", {})
            for k, v in n["props"].items():
                if old.get(k) != v:
                    self._property_revisions[(n["id"], k)] = self.revision
        self._last_state = state
        # A template's own state too (its slot, contract, build() call and attributes), which its
        # update changes (TODO 130.2 slice 11).
        objects = [
            (n, dict(n.props), list(n.children), n.parent, dict(vars(n)) if isinstance(n, Template) else None)
            for n in self._nodes()
        ]
        table_state = [
            (table, dict(table.columns), table.version, table.grid) for table in self._tables
        ]
        theme_state = [
            (resource, dict(resource.value), resource.version) for resource in self._themes
        ]
        scale_state = [
            (resource, {key: (list(value) if isinstance(value, list) else value)
                        for key, value in vars(resource).items() if key not in ("_scenes",)}, resource.version)
            for resource in self._normalizations | self._continuous_scales | self._category_scales
        ]
        self._states[self.revision] = (objects, table_state, theme_state, scale_state)
        active = getattr(self._widget, "inflight", None)
        self._states = {
            revision: state
            for revision, state in self._states.items()
            if revision in (active, self.revision)
        }
        if self._widget is None:
            self._states = {self.revision: self._states[self.revision]}
        if self._widget is not None:
            self.pending = True
            self._widget.publish(state, columns)

    def _widget_instance(self):
        if self._closed:
            raise RuntimeError("Scene is closed.")
        if any(_has_template_param(node.props) for node in self._nodes()):
            raise ValueError("Scene contains template_param markers; call Template.export_template(path), then load and bind its parameters before display.")
        self._validate()
        if self._widget is None:
            from .widget import SceneWidget

            self._widget = SceneWidget(self)
            self._publish()
        return self._widget

    def _ready_view(self, view, target):
        """The ready view a command on ``target`` goes to: ``view``, or the only one."""
        self._widget_instance()
        live = [k for k, v in self._views.items() if v.get("ready")]
        if view is None:
            if len(live) != 1:
                raise SceneError(
                    "Display the scene first, and specify view= when multiple views are active.",
                    code="bridge.missing_view", target=target, revision=self.revision,
                    suggestion="Display the object, then pass one of scene.views as view= when more than one display is mounted.",
                )
            view = live[0]
        if view not in live:
            raise SceneError(
                "Unknown or unready widget view.", code="bridge.missing_view",
                target=target, revision=self.revision,
                suggestion="Wait for the widget to render and use a current key from scene.views.",
            )
        return view

    async def _command(self, name, target, view=None, timeout=60, **args):
        if not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be a finite positive number of seconds.")
        view = self._ready_view(view, target)
        self._callback_loop = asyncio.get_running_loop()
        deadline = self._callback_loop.time() + timeout
        remaining = lambda: max(0.001, deadline - self._callback_loop.time())
        revision = self.revision
        try:
            if hasattr(self._widget, "when_accepted"):
                accepted = self._widget.when_accepted(revision, view)
                await (
                    self._widget.await_response(
                        accepted, remaining(), command=name, view=view,
                        revision=revision,
                    )
                    if hasattr(self._widget, "await_response")
                    else asyncio.wait_for(accepted, remaining())
                )
        except TimeoutError as error:
            raise SceneError(
                str(error), code="bridge.timeout", target=target,
                revision=revision,
                details={"command": name, "view": view, "phase": "accepted revision"},
            ) from error
        request = identity("request")
        future = asyncio.get_running_loop().create_future()
        self._pending[request] = future
        self._widget.send(
            {
                "type": "command",
                "protocol": 1,
                "library": REGISTRY["library"],
                "scene": self.id,
                "view": view,
                "request": request,
                "revision": revision,
                "target": target,
                "command": name,
                "args": {**args, "timeoutMs": max(1, int(remaining() * 1000))},
            }
        )
        try:
            return await (
                self._widget.await_response(
                    future, remaining(), command=name, request=request,
                    view=view, revision=revision,
                )
                if hasattr(self._widget, "await_response")
                else asyncio.wait_for(future, remaining())
            )
        except TimeoutError as error:
            self._widget.send({
                "type": "cancel", "scene": self.id, "view": view,
                "request": request, "revision": revision,
            })
            raise SceneError(
                str(error), code="bridge.timeout", target=target,
                revision=revision, details={"command": name, "view": view},
            ) from error
        finally:
            self._pending.pop(request, None)

    @property
    def views(self):
        return dict(self._views)

    def _send_offsets(self, table, origin=None):
        """Send ``table``'s offsets to this scene's ready views; ``origin``, the view whose drag
        they came from, only learns their version (TODO 38.5)."""
        if self._widget is None:
            return
        descriptor = table._offsets_descriptor()
        for target, state in self._views.items():
            if not state.get("ready"):
                continue
            self._widget.send({
                "type": "offsets_ack" if target == origin else "offsets",
                "protocol": 1,
                "library": REGISTRY["library"],
                "scene": self.id,
                "view": target,
                "table": table.id,
                **(descriptor if target != origin else {"version": descriptor["version"]}),
            })

    def _receive(self, message, buffers):
        if self._closed or message.get("scene") != self.id:
            return
        kind = message.get("type")
        view = message.get("view")
        if kind in ("event", "edit", "input") and not self._views.get(view, {}).get("ready"):
            return
        if kind == "status":
            self.status = message.get("phase", "pending")
        elif kind == "capabilities":
            self._views[view] = message
            record_buffer_limit(view, message.get("limits"))
        elif kind == "dispose":
            self._views.pop(view, None)
        elif kind == "ack":
            revision = message.get("revision", 0)
            if revision in self._states:
                self._accepted_objects = self._states[revision]
            self._states = {r: s for r, s in self._states.items() if r > revision}
            if revision == self.revision:
                self.pending = False
                self.error = None
                self._accepted = self._last_state
        elif kind == "error":
            self.error = message.get("message", "Widget error")
            self.pending = False
            if (
                not message.get("request")
                and message.get("revision") == self.revision
                and self._accepted_objects
            ):
                objects, tables, themes, scales = self._accepted_objects
                for node, props, children, parent, own in objects:
                    if own is not None:
                        node.__dict__.update(own)
                    node.props = props
                    node.children = children
                    node.parent = parent
                for table, columns, version, grid in tables:
                    table.columns = columns
                    table.version = version
                    table.grid = grid
                for resource, value, version in themes:
                    resource.value = value
                    resource.version = version
                for resource, values, version in scales:
                    for key, value in values.items():
                        setattr(resource, key, value)
                    resource.version = version
                # Send the retained interpretation so newly mounted views agree.
                self._publish()
            f = self._pending.get(message.get("request"))
            if f and not f.done():
                f.get_loop().call_soon_threadsafe(
                    self._finish_future,
                    f,
                    None,
                    SceneError(
                        self.error,
                        code=message.get("code", "frontend"),
                        target=message.get("target"),
                        revision=message.get("revision"),
                        **{
                            key: message.get("diagnostic", {}).get(key)
                            for key in (
                                "component", "property", "scope", "field",
                                "shape", "suggestion", "details",
                            )
                        },
                    ),
                )
        elif kind == "result":
            value = message.get("value") or {}
            if isinstance(value, dict) and value.get("report") is not None:
                self.last_export_report = value["report"]
            f = self._pending.get(message.get("request"))
            if f and not f.done():
                f.get_loop().call_soon_threadsafe(
                    self._finish_future,
                    f,
                    bytes(buffers[0]) if buffers else message.get("value"),
                    None,
                )
        elif kind == "interaction":
            resource = next((item for item in self._selections if item.id == message.get("resource")), None)
            sequence = message.get("sequence", 0)
            sequence_key = (view, message.get("resource"))
            previous_sequence = self._interaction_sequences.get(sequence_key, -1)
            if (
                resource is not None
                and message.get("revision") == self.revision
                and message.get("generation", self.revision) == self.revision
                and sequence > previous_sequence
            ):
                self._interaction_sequences[sequence_key] = sequence
                owners = message.get("owners", {})
                if not owners:
                    active = bool(message.get("active"))
                    if resource._active != active:
                        resource._active = active
                        resource.version += 1
                constraints = message.get("constraints", {})
                for owner_id in set(owners) | set(constraints):
                    resource._receive(owner_id, owners.get(owner_id, ()), message.get("active"), constraints.get(owner_id))
                # Interaction is already visible in its originating view. Sync
                # the compact state directly to other mounted views without a
                # scene revision or a full readiness/loading cycle.
                if self._widget is not None:
                    broadcast_sequence = max(
                        self._interaction_broadcast_sequences.get(resource.id, 0) + 1,
                        resource.version,
                    )
                    self._interaction_broadcast_sequences[resource.id] = broadcast_sequence
                    for target, descriptor in self._views.items():
                        if descriptor.get("ready"):
                            self._widget.send({
                                "type": "interaction",
                                "protocol": 1,
                                "library": REGISTRY["library"],
                                "scene": self.id,
                                "view": target,
                                "revision": self.revision,
                                "generation": self.revision,
                                "sequence": broadcast_sequence,
                                "resource": resource.id,
                                "active": bool(message.get("active")),
                                "owners": owners,
                                "constraints": constraints,
                            })
        elif kind == "offsets":
            # A view's offsets after a drag (TODO 38.5): the table takes them, the view learns the
            # version they became (so a snapshot sent later does not undo a newer drag), and the
            # other views of every scene showing the table take them too. The rows index the
            # table version the view had: they are taken while it is current, whatever the
            # scene's revision (a drag callback that republishes does not make them stale).
            table = next((item for item in self._tables if item.id == message.get("table")), None)
            sequence_key = (view, message.get("table"))
            sequence = message.get("sequence", 0)
            current = (
                message.get("table_version") == table.version if "table_version" in message
                else message.get("revision") == self.revision
            ) if table is not None else False
            if current and sequence > self._offset_sequences.get(sequence_key, -1):
                self._offset_sequences[sequence_key] = sequence
                table._receive_offsets(message.get("columns", {}))
                for scene in list(table._scenes):
                    scene._send_offsets(table, view if scene is self else None)
        elif kind == "edit":
            n = next((n for n in self._nodes() if n.id == message.get("target")), None)
            if n:
                props = {
                    k: v
                    for k, v in message.get("props", {}).items()
                    if self._property_revisions.get((n.id, k), 0)
                    <= message.get("revision", 0)
                }
                if props:
                    n._apply_edit(props)
                else:
                    self._widget.send(
                        {"type": "resync", "scene": self.id, "view": view}
                    )
        elif kind == "event":
            # A drag's events are about its table's rows, not this revision's nodes: they are
            # taken while the node exists (a drag callback that republishes keeps its dragend).
            if message.get("revision") != self.revision and message.get("event") not in ("drag", "dragend"):
                return
            n = next((n for n in self._nodes() if n.id == message.get("target")), None)
            if n:
                payload = dict(message.get("payload", {}))
                if message.get("event") in ("drag", "dragend") and "table" in payload:
                    _drag_keys(payload, next((t for t in self._tables if t.id == payload.pop("table")), None))
                if message.get("event") == "camerachange":
                    # event.target stays the node; the camera state, including the camera's
                    # own target, is event.camera.
                    payload["camera"] = {k: payload[k] for k in _CAMERA_FIELDS if k in payload}
                    payload.pop("target", None)
                event = SimpleNamespace(
                    view=view,
                    target=n,
                    frame=_enclosing_frame(n),
                    revision=self.revision,
                    **payload,
                )
                self._dispatch(n._callbacks.get(message.get("event"), []), event)
        elif kind == "simulate":
            # A Simulate's steps, running and settled (TODO 42), kept for its properties; a status
            # from before the last change describes a simulation that is gone.
            if message.get("revision") != self.revision:
                return
            n = next((n for n in self._nodes() if n.id == message.get("target")), None)
            if n is not None and n.kind == "Simulate":
                n.__dict__["_simulation_status"] = {key: message[key] for key in ("steps", "running", "settled") if key in message}
        elif kind == "diagnostics":
            # The scene's errors as they change after it was accepted (TODO 136.6): reported in
            # scene.diagnostics, not rolled back (decided 2026-10-13).
            if message.get("revision") == self.revision:
                self.diagnostics = [{k: v for k, v in entry.items() if v is not None}
                                    for entry in message.get("diagnostics", [])]
        elif kind == "description":
            # A Plot's description after it settled (TODO 49), for plot.description.
            if message.get("revision") != self.revision:
                return
            n = next((n for n in self._nodes() if n.id == message.get("target")), None)
            if n is not None and n.kind == "Plot":
                n.__dict__["_description"] = message.get("text")
        elif kind == "input":
            # The viewer moved an input (TODO 41). Its value becomes the node's value without a
            # new revision (a later publish carries it), other views are told, and on_change
            # callbacks run.
            n = next((n for n in self._nodes() if n.id == message.get("target")), None)
            sequence = message.get("sequence", 0)
            if n is None or n.kind not in INPUT_KINDS or sequence <= self._input_sequences.get(n.id, -1):
                return
            self._input_sequences[n.id] = sequence
            if "playing" in message:
                # A Playback played or paused: kept, not broadcast (each view plays on its own).
                n.props["playing"] = bool(message["playing"])
            if "value" in message:
                n.props["value"] = _input_value(message.get("value"))
            # Streams (hm.stream, TODO 48.7) load the slice at the input's value.
            for table in list(self._tables):
                follow = getattr(table, "_input_changed", None)
                if follow is not None:
                    try:
                        follow(self, n)
                    except Exception as e:
                        self._callback_error(e)
            if "value" not in message:
                return
            value = message.get("value")
            if self._widget is not None:
                for target, descriptor in self._views.items():
                    if target != view and descriptor.get("ready"):
                        self._widget.send({"type": "input", "protocol": 1, "library": REGISTRY["library"],
                                           "scene": self.id, "view": target, "revision": self.revision,
                                           "target": n.id, "value": value})
            self._dispatch(n._callbacks.get("change", []),
                           SimpleNamespace(view=view, target=n, value=_input_value(value), revision=self.revision))

    def _dispatch(self, callbacks, event):
        for callback in callbacks:
            try:
                value = callback(event)
                if inspect.isawaitable(value):
                    if self._callback_loop and self._callback_loop.is_running():
                        self._callback_loop.call_soon_threadsafe(
                            self._schedule_callback, value
                        )
                    else:
                        value.close()
                        self._callback_error(
                            RuntimeError("Async callbacks require a running notebook event loop.")
                        )
            except Exception as e:
                self._callback_error(e)

    @staticmethod
    def _finish_future(future, value, error):
        if future.done():
            return
        if error is not None:
            future.set_exception(error)
        else:
            future.set_result(value)

    def _schedule_callback(self, value):
        task = asyncio.ensure_future(value)
        task.add_done_callback(self._callback_done)

    def _callback_done(self, task):
        if not task.cancelled() and task.exception():
            self._callback_error(task.exception())

    def _callback_error(self, error):
        """Log a failed event callback and keep it; `error` is the latest, `errors` the last ten."""
        message = f"Callback failed: {error}"
        _logger.error(message, exc_info=(type(error), error, error.__traceback__))
        self._errors.append(message)
        self.error = message

    @property
    def errors(self):
        return list(self._errors)

    def close(self):
        if self._closed:
            return
        self._closed = True
        if self._widget:
            self._widget.send({"type": "dispose", "scene": self.id})
            self._widget.close()
        for f in self._pending.values():
            if not f.done():
                f.get_loop().call_soon_threadsafe(
                    self._finish_future, f, None, RuntimeError("Scene closed.")
                )
        self._pending.clear()
        self._states.clear()
        self._accepted_objects = None
        for t in self._tables:
            t._scenes.discard(self)
        self._tables.clear()
        for resource in self._themes:
            resource._scenes.discard(self)
        self._themes.clear()
        for group in (self._normalizations, self._continuous_scales, self._category_scales,
                      self._selections, self._identities):
            for resource in group:
                resource._scenes.discard(self)
            group.clear()
        for root in getattr(self, "_adopted", ()):
            root._adopters.discard(self)
        self._adopted = []
        # Adopted nodes can still be used by other scenes; their callbacks belong to them.
        for n in self._nodes():
            n._callbacks.clear()


def flatten(root):
    if not root:
        return []
    return [root, *[n for c in root["children"] for n in flatten(c)]]
