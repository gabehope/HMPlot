"""xarray and NetCDF data as grid tables (TODO 48.6).

A Dataset's variables that share dimensions become one grid table (TODO 51): a row per cell,
the variables flattened in C order as float32, and each dimension's 1-D coordinates sent once
(with their CF bounds as cell edges when a coordinate has them). The browser computes the
coordinate columns from them when read. Two-dimensional latitude and longitude coordinates
(a curvilinear grid) are sent as positions over their two dimensions. xarray does the CF
decoding (scale and offset, fill values, times), so any backend it reads works the same way.
"""

from __future__ import annotations
from dataclasses import dataclass, replace
import math
import re
import warnings

import numpy as np

from .data import Column, Table, typed_column, column_values

# WebGPU's guaranteed storage-buffer binding size: the limit before any view has reported its own.
DEFAULT_BUFFER_LIMIT = 128 * 1024 * 1024
_reported = {}

# Model calendars whose dates do not all exist in the proleptic Gregorian calendar: their times
# stay numbers (days since the reference date), as Stage 53's model-calendar axes read them.
_MODEL_CALENDARS = {"360_day", "all_leap", "366_day"}


def record_buffer_limit(view, limits):
    """Keep the storage-buffer limit a view reported in its capabilities message."""
    value = (limits or {}).get("maxStorageBufferBindingSize")
    if isinstance(value, (int, float)) and value > 0:
        _reported[view] = int(value)


def buffer_limit():
    """The smallest limit any view has reported, else WebGPU's guaranteed one."""
    return min(_reported.values()) if _reported else DEFAULT_BUFFER_LIMIT


def _xarray(what):
    try:
        import xarray
    except ImportError:
        raise ImportError(f"{what} needs xarray: pip install 'hmplot[netcdf]'.") from None
    return xarray


def _size_text(n):
    for unit in ("bytes", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "bytes" else f"{n:.1f} {unit}"
        n /= 1024


@dataclass(frozen=True)
class GridDim:
    name: str
    coords: Column
    edges: Column | None = None


@dataclass(frozen=True)
class Grid:
    """A grid table's structure: its dimensions (outermost first) and curvilinear positions
    ({"dims": (a, b), "columns": {name: Column}, "x": name, "y": name}, or None)."""

    dims: tuple
    positions: dict | None = None

    @property
    def shape(self):
        return tuple(dim.coords.shape[0] for dim in self.dims)

    @property
    def size(self):
        return math.prod(self.shape)

    def names(self):
        """The coordinate names: the dimensions and the positions."""
        return [dim.name for dim in self.dims] + list((self.positions or {}).get("columns", {}))

    def descriptor(self, encode):
        """The table descriptor's `grid` (python/PROTOCOL.md "Grid tables")."""
        out = {"dims": [{"name": dim.name, "coords": encode(dim.coords),
                         **({"edges": encode(dim.edges)} if dim.edges is not None else {})}
                        for dim in self.dims]}
        if self.positions:
            out["positions"] = {"dims": list(self.positions["dims"]),
                                "columns": {k: encode(v) for k, v in self.positions["columns"].items()},
                                **{k: self.positions[k] for k in ("x", "y") if self.positions.get(k)}}
        return out


def _label(name, attrs):
    """A variable's display name from its CF attributes, as xarray's plots label it:
    long_name (else standard_name) and units, "Near-surface air temperature (K)"."""
    title = attrs.get("long_name") or attrs.get("standard_name")
    units = attrs.get("units")
    if not title and not units:
        return None
    text = str(title or name)
    return f"{text} ({units})" if units not in (None, "", "1") else text


def _is_cftime(values):
    if values.dtype.kind != "O" or values.size == 0:
        return False
    first = next((v for v in values.flat if v is not None), None)
    return first is not None and hasattr(first, "calendar") and hasattr(first, "timetuple")


def _gregorian(values):
    """cftime dates as datetime64 by their labels (year, month, day, time), or None when a date
    does not exist in the proleptic Gregorian calendar (a 29 February 1900 in the Julian one)."""
    try:
        return np.array([np.datetime64(f"{v.year:04d}-{v.month:02d}-{v.day:02d}T{v.hour:02d}:{v.minute:02d}:"
                                       f"{v.second:02d}.{v.microsecond:06d}", "us") for v in values.flat],
                        dtype="datetime64[us]").reshape(values.shape)
    except ValueError:
        return None


def _reference(encoding, first):
    """A time's reference date: its encoding's "days since <date>", else its first date."""
    units = str(encoding.get("units") or "")
    if " since " in units:
        return units.split(" since ", 1)[1].strip()
    return f"{first.year:04d}-{first.month:02d}-{first.day:02d}"


def _times(values, name, encoding, calendar_units=None):
    """cftime dates (TODO 48 decision 5): datetime64 where every date exists in the proleptic
    Gregorian calendar (standard, gregorian, proleptic_gregorian, noleap), else numbers of days
    since the reference date with a warning; returns (values, calendar, units). A coordinate's
    bounds pass the coordinate's (calendar, units), so they convert as it did, without a warning."""
    first = next(v for v in values.flat if v is not None)
    calendar = str(first.calendar or "standard").lower()
    if calendar_units is None and calendar not in _MODEL_CALENDARS:
        converted = _gregorian(values)
        if converted is not None:
            return converted, None, None
    import cftime

    units = calendar_units[1] if calendar_units else f"days since {_reference(encoding, first)}"
    days = np.asarray(cftime.date2num(values, units, calendar=calendar), dtype=float)
    if calendar_units is None:
        warnings.warn(f"{name} uses the {calendar} calendar, whose dates do not all exist in the Gregorian "
                      f"calendar; it is kept as {units}, and axes, calendar functions and bins read it in its "
                      "calendar (TODO 53.6). To compare it with Python dates, convert it first: "
                      "ds.convert_calendar(\"standard\", align_on=\"year\").", stacklevel=5)
    return days, calendar, units


def _column(values, name, attrs=None, encoding=None, calendar=None, units=None):
    """A Column of values (numbers as float32, times, categories) with its display name; a
    model calendar's days carry the calendar and their units."""
    values = np.asarray(values)
    if _is_cftime(values):
        values, calendar, units = _times(values, name, encoding or {})
    if values.dtype.kind in "biuf":
        result = typed_column(values.astype(np.float64, copy=False))
    else:
        result = column_values(values)
    label = _label(name, attrs or {})
    if calendar is not None:
        # Its axis shows dates in the calendar (TODO 53.6), so the title names the calendar.
        label = f"{label or name} ({calendar} calendar)"
    return replace(result, label=label, calendar=calendar, calendar_units=units)


def _monotonic(name, values):
    if values.size < 2 or values.dtype.kind not in "iufM":
        return
    step = np.diff(values.astype("int64") if values.dtype.kind == "M" else values.astype(float))
    if not (np.all(step > 0) or np.all(step < 0)):
        raise ValueError(f"Table.from_xarray: {name}'s coordinates must be strictly increasing or decreasing; "
                         f"sort them first (ds.sortby(\"{name}\")).")


def _edges(ds, name, coord, values, calendar=None, units=None):
    """A dimension's cell edges from its CF bounds ([n, 2]), when they are contiguous: n + 1
    values in the coordinates' order (converted as the coordinates were). None otherwise, and
    the midpoints are used."""
    bounds = coord.attrs.get("bounds")
    if not bounds or bounds not in ds.variables or ds[bounds].ndim != 2 or name not in ds[bounds].dims:
        return None
    other = next(d for d in ds[bounds].dims if d != name)
    b = np.asarray(ds[bounds].transpose(name, other).values)
    if b.shape != (values.shape[0], 2):
        return None
    if _is_cftime(b):
        b = _times(b, bounds, {}, (calendar, units))[0] if calendar else _gregorian(b)
        if b is None:
            return None
    if b.dtype.kind != values.dtype.kind and not (b.dtype.kind in "iuf" and values.dtype.kind in "iuf"):
        return None
    lower, upper = b.min(axis=1), b.max(axis=1)
    if values.size < 2 or values[1] > values[0]:
        edges, joined = np.concatenate([lower[:1], upper]), (upper[:-1] == lower[1:])
    else:
        edges, joined = np.concatenate([upper[:1], lower]), (lower[:-1] == upper[1:])
    return edges if bool(np.all(joined)) else None


def _positions(ds, dims):
    """Two-dimensional latitude and longitude coordinates over two of `dims` (a curvilinear
    grid): {"dims": (a, b) in grid order, "columns": {lat, lon}, "x": lon, "y": lat}, or None."""
    found = {}
    for name, coord in ds.coords.items():
        if coord.ndim != 2 or not set(coord.dims) <= set(dims) or coord.dtype.kind not in "iuf":
            continue
        kind = _geographic(name, coord.attrs)
        if kind:
            found.setdefault(kind, []).append(name)
    if not found.get("lat") or not found.get("lon"):
        return None
    lat, lon = found["lat"][0], found["lon"][0]
    if set(ds[lat].dims) != set(ds[lon].dims):
        raise ValueError(f"Table.from_xarray: the positions {lat} and {lon} span different dimensions.")
    pair = tuple(sorted(ds[lat].dims, key=dims.index))
    columns = {}
    for name in (lat, lon):
        values = np.ascontiguousarray(ds[name].transpose(*pair).values).reshape(-1)
        columns[name] = _column(values, name, ds[name].attrs)
    return {"dims": pair, "columns": columns, "x": lon, "y": lat}


def _geographic(name, attrs):
    standard, units, lower = attrs.get("standard_name"), str(attrs.get("units", "")), name.lower()
    if standard == "latitude" or units in ("degrees_north", "degree_north", "degrees_N") or lower in ("lat", "latitude", "nav_lat"):
        return "lat"
    if standard == "longitude" or units in ("degrees_east", "degree_east", "degrees_E") or lower in ("lon", "longitude", "nav_lon"):
        return "lon"
    return None


def _dataset(obj, variables):
    xr = _xarray("Table.from_xarray")
    if isinstance(obj, xr.DataArray):
        name = obj.name if obj.name is not None else "value"
        return obj.to_dataset(name=name), [name]
    if not isinstance(obj, xr.Dataset):
        raise TypeError("Table.from_xarray takes an xarray Dataset or DataArray.")
    if variables is not None:
        names = [variables] if isinstance(variables, str) else list(variables)
        missing = [name for name in names if name not in obj.data_vars]
        if missing:
            raise ValueError(f"Table.from_xarray: the dataset has no variable {missing[0]!r}.")
        return obj, names
    # Every data variable except CF bounds, grid mappings and scalars.
    helpers = {str(v.attrs.get(key)) for v in obj.variables.values() for key in ("bounds", "grid_mapping") if v.attrs.get(key)}
    return obj, [name for name, v in obj.data_vars.items() if name not in helpers and v.ndim > 0]


def grid_columns(obj, variables=None):
    """The columns and Grid of a grid table from an xarray Dataset or DataArray."""
    ds, names = _dataset(obj, variables)
    if not names:
        raise ValueError("Table.from_xarray: the dataset has no gridded variables.")
    dims = list(ds[names[0]].dims)
    differ = [name for name in names if set(ds[name].dims) != set(dims)]
    if differ or not dims:
        described = ", ".join(f"{name} ({', '.join(map(str, ds[name].dims))})" for name in names)
        raise ValueError(f"Table.from_xarray: the variables have different dimensions: {described}. "
                         "Load them as separate tables (variables=[...]).")
    if any(not isinstance(dim, str) or re.fullmatch(r"0|[1-9][0-9]*", dim) for dim in dims):
        raise ValueError(f"Table.from_xarray: dimension names must be strings that are not integers "
                         f"({', '.join(map(str, dims))}); rename them (ds.rename).")
    size = math.prod(ds.sizes[dim] for dim in dims)
    limit = buffer_limit()
    if size * 4 > limit:
        shape = " x ".join(f"{dim} {ds.sizes[dim]}" for dim in dims)
        raise ValueError(f"Table.from_xarray: each variable has {size:,} cells ({shape}; {_size_text(size * 4)} as "
                         f"float32), more than the GPU's storage-buffer limit ({_size_text(limit)}). Select less "
                         "before loading, with .sel, .isel or .coarsen (for example ds.sel(time=\"2020-01\")).")
    grid_dims = []
    for dim in dims:
        if dim in ds.coords and ds[dim].ndim == 1:
            coord = ds[dim]
            values, calendar, units = np.asarray(coord.values), None, None
            if _is_cftime(values):
                values, calendar, units = _times(values, dim, coord.encoding)
            _monotonic(dim, values)
            edges = _edges(ds, dim, coord, values, calendar, units)
            coords = _column(values, dim, coord.attrs, calendar=calendar, units=units)
            edges = None if edges is None else typed_column(edges.astype(np.float64) if edges.dtype.kind in "iuf" else edges)
        else:
            coords, edges = typed_column(np.arange(ds.sizes[dim], dtype=np.float64)), None
        grid_dims.append(GridDim(dim, coords, edges))
    positions = _positions(ds, dims)
    fields = {}
    taken = set(dims) | set((positions or {}).get("columns", {}))
    for name in names:
        if name in taken:
            raise ValueError(f"Table.from_xarray: {name} is both a variable and a coordinate.")
        data = ds[name].transpose(*dims)
        values = np.ascontiguousarray(data.values).reshape(-1)
        fields[name] = _column(values, name, data.attrs, data.encoding)
    return fields, Grid(tuple(grid_dims), positions)


def open_netcdf(path, variables=None, **selection):
    """Table.from_netcdf's load: open the file with xarray, keep `variables`, select, load."""
    xr = _xarray("Table.from_netcdf")
    with xr.open_dataset(path) as ds:
        if variables is not None:
            names = [variables] if isinstance(variables, str) else list(variables)
            missing = [name for name in names if name not in ds.data_vars]
            if missing:
                raise ValueError(f"Table.from_netcdf: {path} has no variable {missing[0]!r}.")
            # The variables with their coordinates and the bounds those name.
            bounds = [str(c.attrs["bounds"]) for c in ds[names].coords.values()
                      if c.attrs.get("bounds") in ds.variables]
            ds = ds[names + [b for b in bounds if b not in names]]
        if selection:
            ds = ds.sel(**selection)
        return grid_columns(ds, variables)


def _input_name(at):
    """The input a stream follows: hm.input.name, an input node, or its name."""
    from .expressions import Expression

    if isinstance(at, str) and at.isidentifier():
        return at
    if isinstance(at, Expression) and at.op == "input":
        return at.args[0]
    name = getattr(at, "props", {}).get("name") if hasattr(at, "props") else None
    if isinstance(name, str):
        return name
    raise TypeError("hm.stream(at=...) takes an input: hm.input.name, an input such as hm.Playback(name=...), or its name.")


class StreamTable(Table):
    """A grid table showing one slice of a dataset along a dimension at a time (TODO 48.7):
    hm.stream. The dataset stays in Python; each time the input moves, the slice at its value is
    loaded (off the notebook's event loop) and replaces the table's variables, the latest value
    winning, and while a Playback plays the next slice is loaded ahead. The coordinates are sent
    once, so each step sends only the variables' values."""

    _CACHE = 4

    def __init__(self, data, dim, at, variables=None, by="index", start=0):
        xr = _xarray("hm.stream")
        if isinstance(data, (str, bytes)) or hasattr(data, "__fspath__"):
            data = xr.open_dataset(data)
        ds, names = _dataset(data, variables)
        if dim not in ds.dims:
            raise ValueError(f"hm.stream: the data has no dimension {dim!r} (its dimensions: {', '.join(map(str, ds.dims))}).")
        if by not in ("index", "value"):
            raise ValueError('hm.stream: by is "index" (the input is a position along the dimension) or "value" '
                             "(the nearest coordinate).")
        names = [name for name in names if dim in ds[name].dims]
        if not names:
            raise ValueError(f"hm.stream: no variable has the dimension {dim!r}.")
        if by == "value" and (dim not in ds.indexes or ds.indexes[dim].dtype.kind not in "iuf"):
            raise ValueError(f'hm.stream: by="value" needs numeric coordinates along {dim}; use by="index".')
        super().__init__({})
        self.dim, self.input_name, self.by = dim, _input_name(at), by
        self.size = ds.sizes[dim]
        self._ds, self._names = ds, names
        self._closed = False
        start = min(self.size - 1, max(0, int(start)))
        self.columns, self.grid = grid_columns(ds.isel({dim: start}), names)
        self._dims = [d.name for d in self.grid.dims]
        self.index = self._wanted = start
        self._playing, self._direction = False, 1
        self._loading = None
        self._cache = {}

    @property
    def coords(self):
        """The dimension's coordinates (a position when it has none)."""
        return np.asarray(self._ds[self.dim].values) if self.dim in self._ds.coords else np.arange(self.size)

    def close(self):
        """Stop following the input and close the dataset."""
        self._closed = True
        self._ds.close()

    def _target(self, value):
        try:
            value = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(value):
            return None
        if self.by == "value":
            return int(self._ds.indexes[self.dim].get_indexer([value], method="nearest")[0])
        return min(self.size - 1, max(0, int(round(value))))

    def _load(self, index):
        """The variables' columns at `index` (run on a worker thread)."""
        data = self._ds[self._names].isel({self.dim: index})
        return {name: _column(np.ascontiguousarray(data[name].transpose(*self._dims).values).reshape(-1),
                              name, data[name].attrs, data[name].encoding) for name in self._names}

    def _input_changed(self, scene, node):
        """The scene's input `node` changed its value or started or stopped playing."""
        if self._closed or node.props.get("name") != self.input_name:
            return
        self._playing = bool(node.props.get("playing"))
        target = self._target(node.props.get("value"))
        if target is not None and target != self._wanted:
            # The direction of travel (a loop's wrap counts forward), for the slice loaded ahead.
            self._direction = 1 if (target - self._wanted) % self.size <= self.size // 2 else -1
            self._wanted = target
        self._step(scene)

    def _step(self, scene):
        """Show the wanted slice when it is loaded, else load it; while playing, load the next."""
        if self._closed or self._loading is not None:
            return
        wanted = self._wanted
        if wanted != self.index:
            fields = self._cache.get(wanted)
            if fields is None:
                return self._start(scene, wanted)
            self.index = wanted
            self._replace(fields, grid=False)
        if self._playing:
            ahead = (self.index + self._direction) % self.size
            if ahead not in self._cache:
                self._start(scene, ahead)

    def _start(self, scene, index):
        loop = scene._callback_loop
        if loop is None or not loop.is_running():
            # No notebook event loop (a script, a test): load here.
            self._store(index, self._load(index))
            if index == self._wanted:
                self._step(scene)
            return
        self._loading = index
        future = loop.run_in_executor(None, self._load, index)
        future.add_done_callback(lambda done: self._loaded(scene, index, done))

    def _loaded(self, scene, index, future):
        self._loading = None
        if self._closed or future.cancelled():
            return
        if future.exception() is not None:
            scene._callback_error(future.exception())
            return
        self._store(index, future.result())
        self._step(scene)

    def _store(self, index, fields):
        self._cache[index] = fields
        while len(self._cache) > self._CACHE:
            oldest = next(key for key in self._cache if key not in (self._wanted, self.index))
            del self._cache[oldest]


def stream(data, dim, at, variables=None, by="index", start=0):
    """A grid table of one slice of `data` (an xarray Dataset or DataArray, or a path xarray
    opens) along `dim`, following an input (TODO 48.7): `at` is hm.input.name (or the input).
    With by="index" the input's value is a position along `dim` (a Playback from 0 to
    `table.size - 1`); with by="value" the nearest coordinate. The dataset stays in Python and
    each step sends only the variables' values, so a year of daily fields plays without loading
    it all; while a Playback plays, the next slice is loaded ahead. An HTML export carries the
    slice showing when it was made. Needs xarray (hmplot[netcdf])."""
    return StreamTable(data, dim, at, variables=variables, by=by, start=start)
