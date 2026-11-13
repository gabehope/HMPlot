"""Immutable host snapshots and independently versioned binary columns."""

from __future__ import annotations
from dataclasses import dataclass, field
from itertools import count
import builtins
import json
import math
import numbers
import re
import datetime as _datetime
from .axes import check_axis_style
from uuid import uuid4

_session = uuid4().hex
import numpy as np

_ids = count(1)


def identity(prefix):
    return f"{_session}-{prefix}-{next(_ids)}"


@dataclass(frozen=True)
class Column:
    id: str
    shape: tuple
    dtype: str
    payload: bytes = b""
    categories: tuple | None = None
    structured: object = None
    logical_type: str | None = None
    ordered: bool = False
    unit: str | None = None
    timezone: str | None = None
    nullable: bool = False
    source_dtype: str | None = None
    # A column passed as a channel from a named Series: the name titles its axis (TODO 40.1).
    name: str | None = None
    # A table column's display name (axis titles, legends, tooltips): a NetCDF variable's
    # long_name and units (TODO 48.6).
    label: str | None = None
    # Times in a model calendar kept as numbers (TODO 48 decision 5): the calendar and the
    # numbers' units ("days since 1850-01-01").
    calendar: str | None = None
    calendar_units: str | None = None
    # An encoded image's MIME type (logical_type "encoded-image", dtype uint8; TODO 37.5).
    mime: str | None = None
    # "uint8" when an int64 or uint64 payload is followed by one byte per row, 0 where the row is
    # missing (TODO 69.5): no integer value stands for a missing one.
    validity: str | None = None
    # The index of the pandas Series it came from, checked against the plotted DataFrame's.
    pandas_index: object = field(default=None, compare=False, repr=False)

    def descriptor(self):
        d = dict(
            id=self.id, shape=list(self.shape), dtype=self.dtype, byte_order="little"
        )
        if self.categories is not None:
            d["categories"] = list(self.categories)
        if self.structured is not None:
            d["structured"] = self.structured
        if self.logical_type is not None:
            d["logical_type"] = self.logical_type
        if self.ordered:
            d["ordered"] = True
        if self.unit is not None:
            d["unit"] = self.unit
        if self.timezone is not None:
            d["timezone"] = self.timezone
        if self.nullable:
            d["nullable"] = True
        if self.source_dtype is not None:
            d["source_dtype"] = self.source_dtype
        if self.name is not None:
            d["name"] = self.name
        if self.label is not None:
            d["label"] = self.label
        if self.calendar is not None:
            d["calendar"] = self.calendar
            d["calendar_units"] = self.calendar_units
        if self.mime is not None:
            d["mime"] = self.mime
        if self.validity is not None:
            d["validity"] = self.validity
        return d


_LOGICAL_TYPES = {"numeric", "categorical", "ordinal", "boolean", "datetime", "duration", "geometry"}
# The units of datetime and duration columns the browser reads (python/PROTOCOL.md); NumPy's "D"
# is "d" here.
TIME_UNITS = ("ns", "us", "ms", "s", "m", "h", "d")

def _schema(value):
    if value is None: return {}
    if isinstance(value, str): value = {"type": value}
    if not isinstance(value, dict) or value.get("type") not in _LOGICAL_TYPES:
        raise ValueError(f"A column's type is one of {', '.join(sorted(_LOGICAL_TYPES))}, as a name "
                         f"(schema={{\"day\": \"datetime\"}}) or a dict with domain, unit or timezone "
                         f"({{\"type\": \"datetime\", \"unit\": \"s\"}}); received {value!r}.")
    if value.get("timezone") is not None and value["type"] != "datetime":
        raise ValueError("timezone is only valid for datetime columns.")
    if value.get("unit") is not None and value["type"] not in ("datetime", "duration"):
        raise ValueError("unit is only valid for datetime and duration columns.")
    if value.get("unit") is not None:
        if value["unit"] == "D":
            value = {**value, "unit": "d"}
        if value["unit"] not in TIME_UNITS:
            raise ValueError(f"unit is one of {', '.join(TIME_UNITS)}; received {value['unit']!r}. "
                             "Convert other units first (values.astype('datetime64[D]') for dates).")
    return dict(value)

# An empty or all-missing column has no values to infer a type from (TODO 32): it needs one.
_UNTYPED = ("An empty or all-missing column needs its type: give it one in the table's schema, as "
            "schema={\"<column>\": \"numeric\"} (or \"categorical\", \"datetime\", ...), or with "
            "hm.typed_column(values, type=\"numeric\").")


def _key_error(fields, columns):
    """A Table key that names a column the table does not have."""
    missing = [field for field in fields if field not in columns]
    return (f"Table key {missing[0]!r} is not a column of the table; key= names the column (or columns) that "
            f"identify a row: one of {', '.join(map(repr, columns))}.")


def _missing(v):
    """None, NaN, or pandas' NA and NaT: a missing value in a list or object array."""
    return v is None or isinstance(v, float) and math.isnan(v) or builtins.type(v).__name__ in ("NAType", "NaTType")


# NumPy's datetime units, coarsest first.
_NUMPY_UNITS = ("Y", "M", "W", "D", "h", "m", "s", "ms", "us", "ns", "ps", "fs", "as")
_UNIT_MS = {"ns": 1e-6, "us": 1e-3, "ms": 1, "s": 1e3, "m": 6e4, "h": 36e5, "d": 864e5}
# JavaScript's Date range: 100,000,000 days either side of 1970.
_DATE_RANGE_MS = 8.64e15


def _integer_column(values, missing, **fields):
    """An int64 or uint64 Column (TODO 69.5): exact values, a uint64 array staying unsigned, and
    when a row is missing, a byte per row after them (validity "uint8": 1 present, 0 missing)."""
    unsigned = values.dtype.kind == "u" and values.dtype.itemsize == 8
    raw = np.ascontiguousarray(values, dtype="<u8" if unsigned else "<i8").copy()
    nullable = missing is not None and bool(np.any(missing))
    payload = raw.tobytes()
    if nullable:
        raw[missing] = 0
        payload = raw.tobytes() + np.ascontiguousarray(~missing, dtype=np.uint8).tobytes()
    return Column(identity("column"), raw.shape, "uint64" if unsigned else "int64", payload,
                  nullable=nullable, validity="uint8" if nullable else None, **fields)


def _temporal_values(a, target, unit, missing):
    """Times or durations as int64 counts of a unit the browser reads (TIME_UNITS; TODO 69.6),
    the unit, and the missing rows. NumPy dates (D, W, M, Y) become days, months and years by the
    calendar; units finer than ns become ns; a conversion past int64's range is an error. Numbers
    (no NumPy unit) are whole counts of `unit` (default ms)."""
    if a.dtype.kind not in "Mm":
        unit = unit or "ms"
        if a.dtype.kind == "u" and a.dtype.itemsize == 8 and np.any(a > np.iinfo(np.int64).max):
            raise ValueError(f"{target.title()} values beyond 2**63 - 1 {unit} are out of range.")
        if a.dtype.kind == "f":
            gaps = ~np.isfinite(a)
            missing = gaps if missing is None else missing | gaps
            if np.any(a[~missing] != np.floor(a[~missing])):
                finer = TIME_UNITS[max(TIME_UNITS.index(unit) - 1, 0)]
                raise ValueError(f"{target.title()} values given as numbers count whole {unit}; pass them in a "
                                 f"finer unit (unit={finer!r}) to keep their fractions.")
            a = np.where(missing, 0, a)
        return np.asarray(a, dtype="<i8"), unit, missing
    kind = "datetime64" if a.dtype.kind == "M" else "timedelta64"
    source, count = np.datetime_data(a.dtype)
    nat = np.isnat(a)
    missing = nat if missing is None else missing | nat
    if source == "generic":
        if not nat.all():
            raise ValueError(f"A {kind} column needs a unit; give it one (values.astype('{kind}[ms]')).")
        a, source = a.astype(f"{kind}[ms]"), "ms"
    wanted = "D" if unit == "d" else unit or source
    if kind == "timedelta64" and wanted in ("Y", "M"):
        raise ValueError(f"A duration in {'years' if wanted == 'Y' else 'months'} ({kind}[{wanted}]) has no fixed "
                         f"length; convert it to a fixed unit first, such as days ({kind}[D]).")
    goal = "D" if wanted in ("Y", "M", "W") else "ns" if wanted in ("ps", "fs", "as") else wanted
    present = ~missing
    out_of_range = ValueError(f"{'Times' if kind == 'datetime64' else 'Durations'} in {kind}[{source}] are out of "
                              f"range in {goal}; plot a coarser unit.")
    try:
        converted = a.astype(f"{kind}[{goal}]")
    except OverflowError:
        raise out_of_range from None
    # A finer unit holds every value exactly, unless it overflows (NumPy 1.x wraps silently).
    if (count > 1 or _NUMPY_UNITS.index(goal) > _NUMPY_UNITS.index(source)) and (
            np.any(np.isnat(converted[present])) or np.any(converted[present].astype(a.dtype) != a[present])):
        raise out_of_range
    return converted.astype("<i8"), "d" if goal == "D" else goal, missing


def typed_column(value, *, type=None, domain=None, unit=None, timezone=None):
    if isinstance(value, Column):
        if any(x is not None for x in (type, domain, unit, timezone)):
            raise TypeError("A Column already has a logical type; do not supply another descriptor.")
        return value
    spec = _schema({k: v for k, v in {"type": type, "domain": domain, "unit": unit, "timezone": timezone}.items() if v is not None}) if type is not None else {}
    module = builtins.type(value).__module__.split(".")[0]
    if module in ("torch", "jax", "jaxlib", "cupy"):
        raise TypeError(
            "Convert Python device arrays to host NumPy explicitly before plotting."
        )
    if isinstance(value, dict) and "codes" in value and "categories" in value:
        categories = tuple(value["categories"])
        codes = np.asarray(value["codes"])
        for category in categories:
            if (
                not isinstance(category, (str, bool, int, float))
                or isinstance(category, float)
                and not math.isfinite(category)
            ):
                raise ValueError(f"A dictionary column's categories are strings, numbers or booleans (finite); "
                                 f"received {category!r}.")
            if isinstance(category, int) and abs(category) > 2**53 - 1:
                raise ValueError(
                    "Category integers must fit JavaScript exact integers; use strings."
                )
        if len({(builtins.type(v), v) for v in categories}) != len(categories):
            raise ValueError("Category identities must be unique.")
        if codes.ndim != 1 or not np.all(
            np.isfinite(codes)
            & (codes == np.floor(codes))
            & (codes >= -1)
            & (codes < len(categories))
        ):
            raise ValueError(
                "Category codes must be one-dimensional valid dictionary indices or -1."
            )
        return Column(
            identity("column"),
            codes.shape,
            "int32",
            codes.astype("<i4").tobytes(),
            categories,
            logical_type=spec.get("type", "ordinal" if value.get("ordered") else "categorical"),
            ordered=spec.get("type") == "ordinal" or bool(value.get("ordered")),
            source_dtype=str(codes.dtype), nullable=bool(np.any(codes < 0)),
        )
    mask = None
    if isinstance(value, np.ma.MaskedArray):
        # A masked array's missing rows: integers and times keep the mask beside their exact
        # values (TODO 69.5); other values read masked rows as missing.
        mask, value = np.ma.getmaskarray(value), np.ma.getdata(value)
        if not mask.any():
            mask = None
    a = np.asarray(value)
    if mask is not None and (a.dtype.kind not in "iuMm" or spec.get("type") in ("categorical", "ordinal", "boolean")):
        if a.dtype.kind == "f":
            a = np.where(mask, np.nan, a)
        else:
            a = a.astype(object)
            a[mask] = None
        mask = None
    if not spec and (a.size == 0 or (a.dtype.kind == "O" and all(_missing(v) for v in a.flat))):
        raise ValueError(_UNTYPED)
    if (
        isinstance(value, (list, tuple))
        and a.ndim == 1
        and any(isinstance(v, (str, bool)) for v in value)
    ):
        a = np.asarray(value, dtype=object)
    if a.dtype.kind == "O":
        present = [v for v in a.flat if not _missing(v)]
        if present and all(isinstance(v, (_datetime.datetime, _datetime.date)) for v in present):
            normalized = [np.datetime64("NaT", "us") if v is None else np.datetime64(v.astimezone(_datetime.timezone.utc).replace(tzinfo=None) if isinstance(v, _datetime.datetime) and v.tzinfo else v) for v in a.flat]
            a = np.asarray(normalized, dtype="datetime64[us]").reshape(a.shape)
        elif present and all(isinstance(v, _datetime.timedelta) for v in present):
            a = np.asarray([np.timedelta64("NaT", "us") if v is None else np.timedelta64(round(v.total_seconds() * 1_000_000), "us") for v in a.flat], dtype="timedelta64[us]").reshape(a.shape)
    if a.dtype.kind == "O" and all(
        _missing(v)
        or isinstance(v, (int, float, np.number))
        and not isinstance(v, (bool, np.bool_))
        for v in a.flat
    ):
        a = np.asarray([np.nan if _missing(v) else v for v in a.flat], dtype=float).reshape(a.shape)
    if a.ndim == 0:
        raise ValueError("A column holds one value per row: pass a list or a 1-D array, not a single value "
                         "(a constant goes directly in a mark's channel, as fill=\"red\").")
    logical = spec.get("type")
    if logical in ("categorical", "ordinal", "boolean"):
        if a.ndim != 1: raise TypeError(f"{logical.title()} columns must be one-dimensional.")
        requested = list(spec.get("domain") or ([False, True] if logical == "boolean" else []))
        lookup = {(builtins.type(v).__name__, v): i for i, v in enumerate(requested)}
        codes = []
        for v in a.tolist():
            if _missing(v): codes.append(-1); continue
            token = (builtins.type(v).__name__, v)
            if token not in lookup:
                if spec.get("domain") is not None: codes.append(-1); continue
                lookup[token] = len(requested); requested.append(v)
            codes.append(lookup[token])
        return Column(identity("column"), a.shape, "int32", np.asarray(codes, dtype="<i4").tobytes(), tuple(requested),
                      logical_type=logical, ordered=logical == "ordinal", nullable=any(v < 0 for v in codes), source_dtype=str(a.dtype))
    if a.dtype.kind in "Mm" or logical in ("datetime", "duration"):
        target = "datetime" if a.dtype.kind == "M" else "duration" if a.dtype.kind == "m" else logical
        if target not in ("datetime", "duration"):
            raise TypeError("Temporal schema is incompatible with the source values.")
        if a.dtype.kind not in "Mmiuf":
            raise TypeError(f"{target.title()} columns hold NumPy times or numbers; received {a.dtype} values.")
        raw, time_unit, missing = _temporal_values(a, target, spec.get("unit"), mask)
        present = raw if missing is None else raw[~missing]
        if target == "datetime" and np.any(np.abs(present.astype(np.float64) * _UNIT_MS[time_unit]) > _DATE_RANGE_MS):
            raise ValueError("Times beyond 275,000 years from 1970 are out of the browser's date range.")
        return _integer_column(raw, missing, logical_type=target, unit=time_unit,
                               timezone=spec.get("timezone", "UTC") if target == "datetime" else None,
                               source_dtype=str(a.dtype))
    if a.dtype.kind in "iu" and logical in (None, "numeric"):
        # int64 stays int64 and uint64 uint64, exact on the host (keys, joins); narrower integers
        # travel as int64.
        return _integer_column(a, mask, logical_type="numeric", source_dtype=str(a.dtype))
    if a.dtype.kind in "ufc" and a.dtype.kind != "c":
        with np.errstate(over="ignore", invalid="ignore"):
            converted = a.astype("<f4", copy=True, order="C")
        if np.any(np.isfinite(a) & ~np.isfinite(converted)):
            raise ValueError("Numerical values exceed float32 range.")
        return Column(identity("column"), a.shape, "float32", converted.tobytes(), logical_type="numeric", nullable=bool(np.any(~np.isfinite(converted))), source_dtype=str(a.dtype))
    if a.dtype.kind == "c":
        raise TypeError("Complex numbers cannot be plotted: pass their real part, imaginary part or magnitude "
                        "(values.real, values.imag, np.abs(values)).")
    if a.ndim != 1:
        raise TypeError("Categorical columns must be one-dimensional.")
    categories, lookup, codes = [], {}, []
    for v in a.tolist():
        if _missing(v):
            codes.append(-1)
            continue
        if not isinstance(v, (str, bool, int, float)):
            raise TypeError(f"Categories are strings, numbers or booleans; received a {builtins.type(v).__name__} "
                            "value (convert it, for example with str()).")
        if isinstance(v, int) and abs(v) > 2**53 - 1:
            raise ValueError(
                "Category integers must be exactly representable in JavaScript; use strings for larger IDs."
            )
        k = (builtins.type(v).__name__, v)
        if k not in lookup:
            lookup[k] = len(categories)
            categories.append(v)
        codes.append(lookup[k])
    if not categories:
        raise ValueError(_UNTYPED)
    return Column(
        identity("column"),
        a.shape,
        "int32",
        np.asarray(codes, dtype="<i4").tobytes(),
        tuple(categories),
        logical_type="boolean" if categories and all(isinstance(v, bool) for v in categories) else "categorical",
        nullable=any(v < 0 for v in codes), source_dtype=str(a.dtype),
    )


def _module(value):
    return builtins.type(value).__module__.split(".")[0]


def frame_index(value):
    """The index of a pandas DataFrame, else None: what a Series channel's index must match."""
    return value.index if _module(value) == "pandas" and hasattr(value, "columns") else None


def is_dataframe(value):
    """A table of columns: a pandas or Polars DataFrame, a Polars LazyFrame, or a pyarrow Table
    or RecordBatch."""
    name = builtins.type(value).__name__
    return (_module(value) in ("pandas", "polars") and name in ("DataFrame", "LazyFrame") or
            _module(value) == "pyarrow" and name in ("Table", "RecordBatch"))


def _masked(values, mask):
    """`values` with the rows of `mask` missing (a NumPy masked array), or `values` when none is."""
    mask = np.asarray(mask, dtype=bool)
    return np.ma.masked_array(values, mask=mask) if mask.any() else values


def _pyarrow(what):
    """pyarrow, or an ImportError naming the extra that installs it."""
    try:
        import pyarrow
    except ImportError:
        raise ImportError(f"{what} needs pyarrow: pip install 'hmplot[arrow]'.") from None
    return pyarrow


def _arrow_column(values, options):
    """A Column from a pyarrow Array or ChunkedArray (TODO 48.4): numbers (missing rows NaN;
    integers exact, with their missing rows masked), strings and dictionaries as dictionary columns, booleans,
    timestamps, dates and durations with their unit and time zone, decimals as floats, and
    fixed-size lists of 2 or 3 numbers as positions."""
    import pyarrow as pa
    import pyarrow.compute as pc

    if isinstance(values, pa.ChunkedArray):
        if pa.types.is_dictionary(values.type):
            values = values.unify_dictionaries()
        values = values.combine_chunks() if values.num_chunks != 1 else values.chunk(0)
    kind = values.type
    # Exact integers (times as int64 counts of their unit) and the missing rows beside them.
    exact = lambda array, cast=None: _masked(pc.fill_null(array.cast(cast) if cast else array, 0).to_numpy(zero_copy_only=False),
                                             array.is_null().to_numpy(zero_copy_only=False))
    if pa.types.is_string(kind) or pa.types.is_large_string(kind) or getattr(pa.types, "is_string_view", lambda _: False)(kind):
        values, kind = values.dictionary_encode(), None
    if kind is None or pa.types.is_dictionary(kind):
        codes = pc.fill_null(values.indices.cast(pa.int32()), -1).to_numpy(zero_copy_only=False)
        return typed_column({"codes": codes, "categories": values.dictionary.to_pylist(),
                       "ordered": bool(getattr(values.type, "ordered", False))},
                      **({"type": options["type"]} if options.get("type") else {}))
    if pa.types.is_boolean(kind):
        return typed_column(values.to_pylist(), type=options.get("type", "boolean"), domain=options.get("domain"))
    if pa.types.is_integer(kind):
        return typed_column(exact(values), type=options.get("type"))
    if pa.types.is_floating(kind):
        return typed_column(values.to_numpy(zero_copy_only=False), type=options.get("type"))
    if pa.types.is_date(kind):
        values, kind = values.cast(pa.timestamp("ms")), pa.timestamp("ms")
    if pa.types.is_timestamp(kind):
        return typed_column(exact(values, pa.int64()), type="datetime", unit=kind.unit, timezone=kind.tz or "UTC")
    if pa.types.is_duration(kind):
        return typed_column(exact(values, pa.int64()), type="duration", unit=kind.unit)
    if pa.types.is_decimal(kind):
        import warnings

        warnings.warn("A decimal column is read as floating-point numbers.", stacklevel=4)
        return typed_column(values.cast(pa.float64()).to_numpy(zero_copy_only=False), type=options.get("type"))
    if pa.types.is_fixed_size_list(kind) and kind.list_size in (2, 3) and (
            pa.types.is_floating(kind.value_type) or pa.types.is_integer(kind.value_type)):
        blank = [math.nan] * kind.list_size
        return typed_column(np.asarray([blank if row is None else row for row in values.to_pylist()], dtype=float))
    if pa.types.is_null(kind):
        return typed_column(np.full(len(values), np.nan), type="numeric")
    raise TypeError(f"Arrow type {kind} is not supported; columns can be numbers, strings, dictionaries, booleans, "
                    "timestamps, dates, durations, decimals or lists of 2 or 3 numbers.")


def is_array_like(value):
    """One column of values that converts like a NumPy array: a pandas Series, Index or
    Categorical, a Polars Series, or any other object with NumPy's __array__ (xarray, pyarrow).
    A DataFrame is a table and a NumPy scalar a value; device arrays (torch, jax, cupy) count, so
    that typed_column() can refuse them with its own message."""
    if isinstance(value, (np.ndarray, np.generic)) or is_dataframe(value):
        return False
    return hasattr(value, "__array__")


def column_values(values, options=None):
    """A Column from one column of values, converted as the same column of a Table is: a pandas
    category dtype becomes a dictionary column; tz-aware datetimes, timedeltas and nullable
    booleans keep their logical types; Polars numeric columns go through NumPy. Anything else goes
    to typed_column(). `options` is the column's schema entry, already checked by _schema."""
    options = options or {}
    module = _module(values)
    if module == "pandas" and hasattr(values, "dtype"):
        import pandas as pd

        if not isinstance(values, pd.Series):
            values = pd.Series(values)  # an Index or a Categorical: its values, in order
        dtype = values.dtype
        if str(dtype) == "category":
            cat = values.cat
            return typed_column({"codes": cat.codes.to_numpy(), "categories": list(cat.categories), "ordered": cat.ordered},
                          **({"type": options["type"]} if options.get("type") else {}))
        if getattr(dtype, "tz", None) is not None:
            # Its instants as UTC datetime64 in the dtype's own unit (pandas 3 keeps microseconds).
            utc = values.dt.tz_convert("UTC").dt.tz_localize(None).to_numpy()
            return typed_column(utc, type=options.get("type", "datetime"), unit=options.get("unit"),
                          timezone=options.get("timezone", str(dtype.tz)))
        if str(dtype).startswith("timedelta64"):
            return typed_column(values.to_numpy(), type=options.get("type", "duration"), unit=options.get("unit"))
        if isinstance(dtype, pd.ArrowDtype):
            # pyarrow-backed: the Arrow array itself (TODO 48.4).
            _pyarrow("A pyarrow-backed pandas column")
            import pyarrow as pa

            return _arrow_column(pa.array(values.array), options)
        if str(dtype) in ("boolean", "bool"):
            host = [None if item is None or str(item) == "<NA>" else bool(item) for item in values.tolist()]
            return typed_column(host, type=options.get("type", "boolean"), domain=options.get("domain"))
        if isinstance(dtype, pd.api.extensions.ExtensionDtype) and getattr(dtype, "kind", None) in "iu" and not options.get("type"):
            # A nullable integer column (Int64, UInt64): exact values in its NumPy type, missing rows masked.
            return typed_column(_masked(values.to_numpy(dtype=dtype.numpy_dtype, na_value=0), values.isna().to_numpy()))
        values = values.to_numpy()
    elif module == "polars" and hasattr(values, "dtype"):
        import polars as pl

        dtype = values.dtype
        # Times keep their unit and time zone, as physical integers (nulls masked).
        if dtype == pl.Date:
            values, dtype = values.cast(pl.Datetime("ms")), pl.Datetime("ms")
        if isinstance(dtype, (pl.Datetime, pl.Duration)) and not options.get("type"):
            raw = _masked(values.cast(pl.Int64).fill_null(0).to_numpy(), values.is_null().to_numpy())
            if isinstance(dtype, pl.Duration):
                return typed_column(raw, type="duration", unit=dtype.time_unit)
            return typed_column(raw, type="datetime", unit=dtype.time_unit, timezone=dtype.time_zone or "UTC")
        if isinstance(dtype, pl.Enum):
            # An Enum's categories in their declared order.
            codes = values.to_physical().cast(pl.Int32).fill_null(-1).to_numpy()
            return typed_column({"codes": codes, "categories": list(dtype.categories)},
                          **({"type": options["type"]} if options.get("type") else {}))
        # Numbers through NumPy (integers exact, nulls masked; float nulls NaN); strings, booleans
        # and categories as Python values, which typed_column() types as it types lists.
        if dtype.is_integer() and values.null_count():
            values = _masked(values.fill_null(0).to_numpy(), values.is_null().to_numpy())
        else:
            values = values.to_numpy() if dtype.is_numeric() else values.to_list()
    elif module == "pyarrow" and hasattr(values, "type"):
        return _arrow_column(values, options)
    return typed_column(values, type=options.get("type"), domain=options.get("domain"), unit=options.get("unit"),
                  timezone=options.get("timezone"))


def table_columns(value, schema=None):
    schema = schema or {}
    module = _module(value)
    if module == "pandas":
        frame = value
        labels = [str(k) for k in frame.columns]
        if len(set(labels)) != len(labels):
            raise ValueError("Distinct dataframe column labels convert to the same string.")
        result_values = {name: frame[label] for name, label in zip(labels, frame.columns)}
        reserved = set(result_values)
        for level in range(frame.index.nlevels):
            base = frame.index.names[level] or ("index" if frame.index.nlevels == 1 else f"level_{level}")
            name, suffix = str(base), 1
            while name in reserved: name, suffix = f"{base}_{suffix}", suffix + 1
            reserved.add(name)
            result_values[name] = frame.index.get_level_values(level).to_numpy()
        value = result_values
    elif module == "polars":
        if builtins.type(value).__name__ == "LazyFrame":
            import warnings

            warnings.warn("hm.Table collected a Polars LazyFrame; collect it yourself to choose when that runs.",
                          stacklevel=3)
            value = value.collect()
        value = {name: value.get_column(name) for name in value.columns}
    elif module == "pyarrow" and is_dataframe(value):
        value = {name: value.column(name) for name in value.column_names}
    elif isinstance(value, np.ndarray):
        if value.ndim != 2:
            raise ValueError("A NumPy table must be two-dimensional.")
        value = {str(i): value[:, i] for i in range(value.shape[1])}
    elif isinstance(value, list):
        keys = dict.fromkeys(k for row in value for k in row)
        value = {k: [row.get(k) for row in value] for k in keys}
    if module == "xarray" and builtins.type(value).__name__ == "Dataset":
        raise TypeError("An xarray Dataset is a grid table: use hm.Table.from_xarray(ds).")
    if not isinstance(value, dict):
        raise TypeError("Table takes a dict of columns, a list of row dicts, a 2-D NumPy array, or a pandas, "
                        f"Polars or pyarrow table; received {builtins.type(value).__name__}.")
    if isinstance(value.get("type"), str) and value.get("type") == "FeatureCollection":
        import copy

        return {
            "__geojson__": Column(
                identity("column"),
                (len(value["features"]),),
                "geojson",
                structured=copy.deepcopy(value),
            )
        }
    result = {}
    for key, values in value.items():
        if not isinstance(key, str):
            raise TypeError(f"Column names must be strings; received {key!r} (rename it, for example with str()).")
        try:
            result[key] = column_values(values, _schema(schema.get(key)))
        except (ValueError, TypeError) as e:
            raise type(e)(f"Column {key!r}: {e}") from e
    if len({v.shape[0] for v in result.values()}) > 1:
        counts = ", ".join(f"{key} has {v.shape[0]}" for key, v in result.items())
        raise ValueError(f"Table: every column needs the same number of rows; {counts}.")
    return result


class SelectionResource:
    def __init__(self, by=None):
        if by is not None and (not isinstance(by, str) or not by or by.startswith("@")):
            raise ValueError(f"selection: by is one column's name, such as by=\"gene\"; received {by!r}. Every table "
                             "that reads the selection needs that column; other names or composite keys are not supported.")
        # TODO 139.6: rows written on a table select their values of `by`; a table's members are
        # its rows with one of those values. None: the rows themselves.
        self.by = by
        self.id = identity("selection")
        self._scenes = set()
        self._owners = set()
        self._rows = {}
        self._constraints = {}
        self._active = False
        self.version = 0
        self._listeners = set()

    @property
    def active(self):
        return self._active

    # A selection in an expression is its per-row membership (TODO 139.3): hm.where(focus, 1,
    # 0.15), focus & (hm.col.value > 10), ~focus. Not `active`, which is a status, never a column.
    def _expression(self, op, *args):
        from .expressions import Expression
        return Expression(op, *args)
    def __and__(self, other): return self._expression("logical_and", self, other)
    def __rand__(self, other): return self._expression("logical_and", other, self)
    def __or__(self, other): return self._expression("logical_or", self, other)
    def __ror__(self, other): return self._expression("logical_or", other, self)
    def __invert__(self): return self._expression("logical_not", self)
    def __bool__(self):
        raise TypeError("A selection is not true or false: in an expression it is each row's membership "
                        "(focus & (hm.col.value > 10), ~focus); for whether it holds rows, read .active.")

    @property
    def rows(self):
        if len(self._rows) == 1:
            return tuple(next(iter(self._rows.values())))
        return {owner: tuple(rows) for owner, rows in self._rows.items()}

    def get_constraints(self, *, data=None):
        """Return the latest committed graphical brush constraints."""
        owner = self._owner_id(data)
        return tuple(dict(value) for value in self._constraints.get(owner, ()))

    def subscribe(self, callback):
        self._listeners.add(callback)
        callback({"active": self._active, "rows": self.rows, "constraints": dict(self._constraints)})
        return lambda: self._listeners.discard(callback)

    def _owner_id(self, data=None):
        if data is not None:
            if not isinstance(data, (Table, IdentityResource)):
                raise TypeError("data must be a Table or IdentityResource.")
            return data.id
        if len(self._owners) != 1:
            raise ValueError("Specify data= when a selection has zero or multiple data owners.")
        return next(iter(self._owners)).id

    def _scene(self):
        if not self._scenes:
            raise RuntimeError(
                "This selection is not attached to an open Scene (it was closed or never displayed)."
            )
        if len(self._scenes) != 1:
            raise RuntimeError("Display the selection in exactly one Scene, or update it through that Scene explicitly.")
        return next(iter(self._scenes))

    async def update(self, rows=(), *, operation="replace", data=None, view=None):
        if operation not in ("replace", "add", "remove", "toggle", "clear"):
            raise ValueError(f"Selection update: unknown operation {operation!r}; use replace, add, remove, toggle or clear.")
        values = [] if operation == "clear" else [int(row) for row in rows]
        if any(row < 0 for row in values):
            raise ValueError("Selection rows must be nonnegative integers.")
        owner = self._owner_id(data)
        result = await self._scene()._command(
            "selection", self.id, view=view, operation=operation,
            rows=values, owner=owner,
        )
        if isinstance(result, dict):
            for owner_id, selected in result.get("owners", {}).items():
                self._receive(owner_id, selected, result.get("active"))
        return result

    async def replace(self, rows, *, data=None, view=None):
        return await self.update(rows, operation="replace", data=data, view=view)

    async def add(self, rows, *, data=None, view=None):
        return await self.update(rows, operation="add", data=data, view=view)

    async def remove(self, rows, *, data=None, view=None):
        return await self.update(rows, operation="remove", data=data, view=view)

    async def toggle(self, rows, *, data=None, view=None):
        return await self.update(rows, operation="toggle", data=data, view=view)

    async def clear(self, *, data=None, view=None):
        return await self.update((), operation="clear", data=data, view=view)

    async def clear_columns(self, *columns, data=None, view=None):
        owner = self._owner_id(data)
        values = [value.get("identity") if isinstance(value, dict) else str(value) for value in columns]
        result = await self._scene()._command(
            "selection", self.id, view=view, operation="clear_columns", columns=values, owner=owner,
        )
        if isinstance(result, dict):
            self._constraints[owner] = tuple(result.get("constraints", {}).get(owner, ()))
        return result

    def _receive(self, owner, rows, active, constraints=None):
        next_rows = tuple(rows)
        next_active = bool(active)
        next_constraints = tuple(dict(value) for value in constraints) if constraints is not None else self._constraints.get(owner, ())
        if self._rows.get(owner) == next_rows and self._active == next_active and self._constraints.get(owner, ()) == next_constraints:
            return
        self._rows[owner] = next_rows
        if constraints is not None:
            self._constraints[owner] = next_constraints
        self._active = next_active
        self.version += 1
        status = {"active": self._active, "rows": self.rows, "constraints": dict(self._constraints)}
        for callback in tuple(self._listeners):
            callback(status)


# Little-endian buffer codes for column dtypes that can hold observation keys.
_KEY_DTYPE_CODES = {"int32": "<i4", "int64": "<i8", "uint64": "<u8", "float32": "<f4"}


def _key_buffer(value):
    """A column's values as NumPy, and its missing rows (a validity mask's zeros) or None."""
    code = _KEY_DTYPE_CODES.get(value.dtype)
    if code is None:
        raise ValueError(f"Keys must be integer, float, or categorical columns; received dtype {value.dtype!r}.")
    count = math.prod(value.shape)
    raw = np.frombuffer(value.payload, dtype=code, count=count).reshape(value.shape)
    missing = None
    if value.validity is not None:
        offset = count * np.dtype(code).itemsize
        missing = np.frombuffer(value.payload, dtype=np.uint8, count=count, offset=offset).reshape(value.shape) == 0
    return raw, missing


def _key_values(value):
    """A key or numeric column's values as Python values (categories decoded, None where missing)."""
    raw, missing = _key_buffer(value)
    if raw.ndim != 1:
        raise ValueError("Table key columns must be one-dimensional.")
    if value.categories is not None:
        return [None if int(code) < 0 else value.categories[int(code)] for code in raw]
    values = raw.tolist()
    return values if missing is None else [None if gap else v for v, gap in zip(values, missing.tolist())]


def _narrowed_float(column):
    """True when a key column holds floats wider than float32, which it stores as float32."""
    source = column.source_dtype or ""
    return column.dtype == "float32" and source.startswith("float") and source not in ("float16", "float32")


def _float32_collision(keys):
    """The first two distinct float keys that are equal once narrowed to float32, or None."""
    try:
        source = np.asarray(keys)
    except Exception:
        return None
    if source.dtype.kind != "f" or source.dtype.itemsize <= 4 or source.ndim != 1:
        return None
    first = {}
    for original, narrowed in zip(source.tolist(), source.astype(np.float32).tolist()):
        if first.setdefault(narrowed, original) != original:
            return first[narrowed], original
    return None


class IdentityResource:
    def __init__(self, keys):
        self.id = identity("identity")
        self.keys = typed_column(keys)
        if len(self.keys.shape) != 1:
            raise ValueError("Identity keys must be one-dimensional.")
        values = _key_values(self.keys)
        if any(value is None or isinstance(value, float) and not math.isfinite(value) for value in values):
            raise ValueError("Identity keys cannot be missing or nonfinite.")
        tokens = [(type(value).__name__, value) for value in values]
        if len(set(tokens)) != len(tokens):
            collision = _float32_collision(keys)
            if collision:
                raise ValueError(
                    "Identity keys must be unique after narrowing to float32: "
                    f"{collision[0]!r} and {collision[1]!r} differ only beyond float32 precision. "
                    "Use integer or string keys."
                )
            raise ValueError("Identity keys must be unique.")
        self.selection = SelectionResource()
        self.brush = SelectionResource()
        self.hover = SelectionResource()
        self.nearby = SelectionResource()
        self.nearest = SelectionResource()
        for resource in (self.selection, self.brush, self.hover, self.nearby, self.nearest):
            resource._owners.add(self)
        self._scenes = set()


def selection(by=None):
    return SelectionResource(by=by)


def observation_identity(*, keys):
    return IdentityResource(keys)


class Table:
    def __init__(self, value, key=None, schema=None):
        self.id = identity("table")
        self.version = 1
        self.schema = dict(schema or {})
        self.columns = table_columns(value, self.schema)
        # A grid table's structure (TODO 48.6; netcdf.Grid): its dimensions' coordinates, sent
        # once, from which the browser makes the coordinate columns. None for a plain table.
        self.grid = None
        # A Series channel's index must match it (TODO 40.1; core._check_series_index).
        self._pandas_index = frame_index(value)
        self.key = list(key) if isinstance(key, (list, tuple)) else key
        fields = self.key if isinstance(self.key, list) else [self.key] if self.key is not None else []
        if any(field not in self.columns for field in fields):
            raise ValueError(_key_error(fields, self.columns))
        self.selection = SelectionResource()
        self.brush = SelectionResource()
        self.hover = SelectionResource()
        self.nearby = SelectionResource()
        self.nearest = SelectionResource()
        for resource in (self.selection, self.brush, self.hover, self.nearby, self.nearest):
            resource._owners.add(self)
        self._validate_key(self.columns)
        self._scenes = set()
        # Offsets (TODO 38): {column: {key: delta}}, keyed by row key (the row index when the
        # table has no key). Replaced, never changed in place, so a transaction can restore it.
        self._offsets = {}
        self.offsets_version = 0

    @classmethod
    def from_arrow(cls, table, key=None, schema=None):
        """A Table from a pyarrow Table or RecordBatch, or any object pyarrow reads as a table
        (the Arrow PyCapsule interface: a Polars or DuckDB result). Needs pyarrow
        (hmplot[arrow])."""
        pa = _pyarrow("Table.from_arrow")
        if not isinstance(table, (pa.Table, pa.RecordBatch)):
            table = pa.table(table)
        return cls(table, key=key, schema=schema)

    @classmethod
    def from_parquet(cls, path, columns=None, key=None, schema=None):
        """A Table from a Parquet file, reading only `columns` (a list of names) when given.
        Needs pyarrow (hmplot[arrow])."""
        _pyarrow("Table.from_parquet")
        import pyarrow.parquet as pq

        return cls(pq.read_table(path, columns=columns), key=key, schema=schema)

    @classmethod
    def from_xarray(cls, obj, variables=None):
        """A grid table from an xarray Dataset or DataArray (TODO 48.6): a row per cell of the
        variables' dimensions, with the variables (`variables`, default every gridded one) as
        columns and the dimensions' coordinates as columns the browser computes from their 1-D
        values. The variables must share their dimensions. Display names come from each
        variable's long_name and units; times in the 360_day and all_leap calendars stay days
        since their reference date, and axes read them in their calendar. A variable larger than the GPU's storage-buffer limit is
        refused: select less first (.sel, .isel, .coarsen)."""
        from .netcdf import grid_columns

        return cls._grid_table(*grid_columns(obj, variables))

    @classmethod
    def from_netcdf(cls, path, variables=None, **selection):
        """A grid table from a NetCDF file (or anything xarray.open_dataset reads): `variables`,
        then `.sel(**selection)` (for example time="2020-01"), then from_xarray. The file is
        closed after the load. Needs xarray and a NetCDF backend (hmplot[netcdf])."""
        from .netcdf import open_netcdf

        return cls._grid_table(*open_netcdf(path, variables, **selection))

    @classmethod
    def _grid_table(cls, fields, grid):
        table = cls({})
        table.columns, table.grid = fields, grid
        return table

    def column_names(self):
        """The table's column names: its columns and a grid table's coordinates."""
        return [*self.columns, *(self.grid.names() if self.grid is not None else [])]

    def replace(self, value, schema=None):
        """New data for the table (a plain table: a grid table's grid is dropped)."""
        next_schema = self.schema if schema is None else dict(schema)
        return self._replace(table_columns(value, next_schema), next_schema, frame_index(value), grid=None)

    def update_columns(self, **values):
        coordinates = set(self.grid.names()) if self.grid is not None else set()
        for k in values:
            if k in coordinates:
                raise ValueError(f"update_columns: {k} is a coordinate of the grid table; make a new table to change it.")
        updated = {}
        for k, v in values.items():
            existing = self.columns.get(k)
            options = _schema(self.schema.get(k))
            if existing is not None and existing.dtype == "float32" and existing.logical_type == "numeric" and not options:
                v = np.asarray(v, dtype=np.float64)
            updated[k] = column_values(v, options)
        proposed = {**self.columns, **updated}
        lengths = {v.shape[0] for v in proposed.values()} | ({self.grid.size} if self.grid is not None else set())
        if len(lengths) > 1:
            raise ValueError("update_columns: every column needs the table's row count ("
                             + ", ".join(f"{k} has {v.shape[0]}" for k, v in updated.items())
                             + f"; the table has {next(iter(self.columns.values())).shape[0] if self.columns else 0}). "
                             "Use replace() to change the number of rows.")
        return self._replace(proposed, self.schema)

    def _validate_key(self, columns):
        fields = self.key if isinstance(self.key, list) else [self.key] if self.key is not None else []
        if any(field not in columns for field in fields):
            raise ValueError(_key_error(fields, columns))
        if not fields:
            return
        decoded = [_key_values(columns[field]) for field in fields]
        tokens = []
        for row in range(len(decoded[0])):
            parts = []
            for values in decoded:
                value = values[row]
                if value is None or isinstance(value, float) and not math.isfinite(value):
                    raise ValueError("Table keys cannot be missing or nonfinite.")
                parts.append((type(value).__name__, value))
            tokens.append(tuple(parts))
        if len(set(tokens)) != len(tokens):
            narrowed = [field for field in fields if _narrowed_float(columns[field])]
            if narrowed:
                raise ValueError(
                    f"Table keys must be unique. Key column {narrowed[0]!r} holds "
                    f"{columns[narrowed[0]].source_dtype} values, which are stored as float32, so keys that "
                    "differ only beyond float32 precision count as duplicates too; use integer or string keys."
                )
            seen = set()
            duplicate = next(token for token in tokens if token in seen or seen.add(token))
            shown = ", ".join(repr(value) for _, value in duplicate)
            raise ValueError(f"Table keys must be unique: {shown} identifies more than one row of key "
                             f"{', '.join(map(repr, fields))}. Choose a key that differs for every row.")

    def _replace(self, proposed, schema=None, pandas_index=False, grid=False):
        # pandas_index: the new source DataFrame's index (None when it is not one); False keeps it.
        # grid: the new grid (None for a plain table); False keeps it.
        self._validate_key(proposed)
        from .core import transaction, active_transaction

        tx = active_transaction()
        if tx is None:
            with transaction():
                return self._replace(proposed, schema, pandas_index, grid)
        tx.remember(self, ("columns", "schema", "version", "_pandas_index", "_offsets", "offsets_version", "grid"))
        previous_length = self._length()
        self.columns = proposed
        if grid is not False: self.grid = grid
        if schema is not None: self.schema = dict(schema)
        if pandas_index is not False: self._pandas_index = pandas_index
        self.version += 1
        # Offsets follow their keys; without keys they stay by position while the row count
        # does, as they do in the browser.
        if self._offsets:
            keys = self._row_keys()
            if keys is not None:
                present = set(keys)
                kept = {name: {key: delta for key, delta in deltas.items() if key in present}
                        for name, deltas in self._offsets.items()}
            else:
                kept = self._offsets if previous_length == self._length() else {}
            self._offsets = {name: deltas for name, deltas in kept.items() if deltas and self._offsets_allowed(name)}
            self.offsets_version += 1
        tx.scenes.update(self._scenes)
        return self

    # Offsets (TODO 38): per-row deltas on numeric columns, set here or by dragging in the
    # browser. The table's columns never change; views follow the offsets only through
    # hm.moved(column) and hm.offset(column).
    def _length(self):
        if self.grid is not None:
            return self.grid.size
        return next(iter(self.columns.values())).shape[0] if self.columns else 0

    def _row_keys(self):
        """Each row's key (the key column's value, a tuple for several), or None without keys."""
        fields = self.key if isinstance(self.key, list) else [self.key] if self.key is not None else []
        if not fields:
            return None
        decoded = [_key_values(self.columns[field]) for field in fields]
        return decoded[0] if len(decoded) == 1 else list(zip(*decoded))

    def _offsets_allowed(self, name):
        """Whether ``name`` is a numeric column, which offsets can move."""
        try:
            self._numeric_column(name, "offsets")
        except (KeyError, TypeError):
            return False
        return True

    def _numeric_column(self, name, what):
        value = self.columns.get(name) if isinstance(name, str) else None
        if value is None:
            raise KeyError(f"{what}: the table has no column {name!r}.")
        if value.logical_type != "numeric" or value.dtype not in ("float32", "int64", "uint64", "int32"):
            raise TypeError(f"{what}: {name!r} is a {value.logical_type or value.dtype} column; offsets move numeric columns.")
        return value

    def set_offsets(self, column, deltas):
        """Set offsets on a numeric column, replacing its earlier ones.

        ``deltas`` maps row keys (row indices when the table has no key) to deltas in the
        column's units, or gives one delta per row (an array or list). Views follow offsets only
        where they read ``hm.moved(column)`` or ``hm.offset(column)``; the table's columns never
        change. Dragging a mark with ``drag`` sets offsets in the browser the same way."""
        self._numeric_column(column, "set_offsets")
        keys = self._row_keys()
        n = self._length()
        if isinstance(deltas, dict):
            index = set(keys) if keys is not None else None
            values = {}
            for key, delta in deltas.items():
                # A float key column holds float32 values: 0.1 names the row whose key is 0.1.
                if index is not None and key not in index and isinstance(key, float) and float(np.float32(key)) in index:
                    key = float(np.float32(key))
                if index is not None and key not in index:
                    raise KeyError(f"set_offsets: no row has the key {key!r}.")
                if index is None and not (isinstance(key, numbers.Integral) and not isinstance(key, bool) and 0 <= key < n):
                    raise KeyError(f"set_offsets: the table has no key, so rows are indices from 0 to {n - 1}; received {key!r}.")
                values[key if index is not None else int(key)] = delta
        else:
            array = np.asarray(deltas, dtype=np.float64)
            if array.shape != (n,):
                raise ValueError(f"set_offsets: {column!r} needs one delta per row ({n}); received shape {array.shape}.")
            values = dict(zip(keys if keys is not None else range(n), array.tolist()))
        cleaned = {}
        for key, delta in values.items():
            if isinstance(delta, bool) or not isinstance(delta, numbers.Real) or not math.isfinite(delta):
                raise ValueError(f"set_offsets: offsets must be finite numbers; received {delta!r} for {key!r}.")
            if delta != 0:
                cleaned[key] = float(delta)
        offsets = {name: dict(value) for name, value in self._offsets.items() if name != column}
        if cleaned:
            offsets[column] = cleaned
        self._set_offsets(offsets)
        return self

    def clear_offsets(self, *columns):
        """Remove the offsets of ``columns`` (every column when none are named)."""
        missing = [name for name in columns if name not in self.columns]
        if missing:
            raise KeyError(f"clear_offsets: the table has no column {missing[0]!r}.")
        offsets = {} if not columns else {name: value for name, value in self._offsets.items() if name not in columns}
        if offsets != self._offsets:
            self._set_offsets(offsets)
        return self

    def _set_offsets(self, offsets):
        from .core import transaction, active_transaction

        tx = active_transaction()
        if tx is None:
            with transaction():
                return self._set_offsets(offsets)
        tx.remember(self, ("_offsets", "offsets_version"))
        self._offsets = offsets
        self.offsets_version += 1
        tx.scenes.update(self._scenes)

    @property
    def offsets(self):
        """The table's offsets as a pandas DataFrame: one row per nonzero offset, with its row
        ``key`` (the row index when the table has no key), ``column`` and ``delta``."""
        try:
            import pandas as pd
        except ImportError as error:
            raise ImportError("table.offsets needs pandas: pip install 'hmplot[dataframes]'.") from error
        rows = [(key, name, delta) for name, deltas in self._offsets.items() for key, delta in deltas.items()]
        return pd.DataFrame(rows, columns=["key", "column", "delta"])

    def apply_offsets(self):
        """A new Table with each column that has offsets replaced by its moved values (the column
        plus its offsets), under the same names, key and schema. This table is not changed."""
        keys = self._row_keys()
        rows = {key: row for row, key in enumerate(keys if keys is not None else range(self._length()))}
        values = dict(self.columns)
        for name, deltas in self._offsets.items():
            source = self._numeric_column(name, "apply_offsets")
            raw, missing = _key_buffer(source)
            moved = raw.astype(np.float64)
            if missing is not None:
                moved[missing] = np.nan
            for key, delta in deltas.items():
                moved[rows[key]] += delta
            values[name] = moved
        return Table(values, key=self.key, schema=self.schema)

    def _receive_offsets(self, columns):
        """Take a view's offsets ({name: {rows, deltas}}, this version's rows) as the table's."""
        keys = self._row_keys()
        n = self._length()
        offsets = {}
        for name, entry in columns.items():
            # Only numeric columns, rows of this version and finite deltas: anything else is a
            # message this table cannot hold.
            if not self._offsets_allowed(name):
                continue
            deltas = {(keys[row] if keys is not None else int(row)): float(delta)
                      for row, delta in zip(entry.get("rows", ()), entry.get("deltas", ()))
                      if isinstance(row, int) and 0 <= row < n and isinstance(delta, (int, float))
                      and math.isfinite(delta) and delta}
            if deltas:
                offsets[name] = deltas
        self._offsets = offsets
        self.offsets_version += 1

    def _offsets_descriptor(self):
        """The offsets as the browser takes them: row indices of this version's rows."""
        keys = self._row_keys()
        rows = {key: row for row, key in enumerate(keys)} if keys is not None else None
        columns = {}
        for name, deltas in self._offsets.items():
            pairs = sorted((rows[key] if rows is not None else key, delta) for key, delta in deltas.items())
            columns[name] = {"rows": [row for row, _ in pairs], "deltas": [delta for _, delta in pairs]}
        return {"version": self.offsets_version, "length": self._length(), "columns": columns}


class Literal:
    def __init__(self, value):
        self.value = value


def literal(value):
    return Literal(value)


# Must match `easings` in src/lib/plot/utils/animation.js.
EASINGS = ("linear", "quad-in", "quad-out", "quad-in-out", "cubic-in", "cubic-out",
           "cubic-in-out", "sine-in-out")


def _animation_options(name, duration, easing):
    """Validate animate()/tween() options with the browser's messages and return them
    JSON-ready (NumPy numbers become Python numbers)."""
    if duration is not None:
        if (isinstance(duration, bool) or not isinstance(duration, numbers.Real)
                or not math.isfinite(duration) or duration < 0):
            raise TypeError(f"{name} duration must be a finite, nonnegative number of milliseconds.")
        duration = int(duration) if isinstance(duration, numbers.Integral) else float(duration)
    if easing is not None and not (isinstance(easing, str) and easing in EASINGS):
        shown = json.dumps(easing) if isinstance(easing, str) else repr(easing)
        raise TypeError(f"Unknown easing {shown}; use {', '.join(EASINGS)}.")
    return duration, easing


def _holds_animate(value):
    """Whether an animate() sits in a value, directly or nested in a list, dict, or literal."""
    if isinstance(value, Animate):
        return True
    if isinstance(value, Literal):
        return _holds_animate(value.value)
    if isinstance(value, dict):
        return any(_holds_animate(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_holds_animate(item) for item in value)
    return False


def _animated_channel(value):
    """An animate() value as a channel carries it: names, expressions, and constants pass
    through, and arrays and lists become columns (animate() only sits on channels)."""
    from .expressions import Expression

    if value is None:
        raise TypeError("animate() needs a value: a column name, expression, array, or constant.")
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("animate() value must be finite; missing data belongs in an array.")
    if isinstance(value, (str, bool, int, float, Expression, Rgb, Literal, Column)):
        return value
    if isinstance(value, dict) and not ("codes" in value and "categories" in value):
        raise TypeError("animate() value must be a column name, expression, array, or constant.")
    return typed_column(value)


def _lifecycle_constant(name, value, component=False):
    """An enter/exit constant or numeric expression. Component lists remain constants;
    expressions and names resolve against each entering or departing row's data."""
    from .expressions import Expression
    if value is None or (isinstance(value, (str, Expression)) and not component):
        return value
    if isinstance(value, np.ndarray):
        value = value.tolist()
    if isinstance(value, (list, tuple)) and not component:
        return [None if item is None else _lifecycle_constant(name, item, True) for item in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, bool) or not isinstance(value, numbers.Real) or not math.isfinite(value):
        raise TypeError(f"animate {name} must be a finite number, a color, or a list of component numbers.")
    return value


class Animate:
    """A mark channel value that animates per row, in the channel's scale space.

    Not an expression: it must be the outermost operator on a mark channel, so arithmetic on
    it is a TypeError. `enter` is the value new rows start from and `exit` the value departing
    rows move to (constants or numeric column expressions in the channel's units).
    Enter expressions read the new rows, exit expressions the departing rows' previous data;
    missing endpoints retain that channel's value. Durations are milliseconds.
    Immutable: build a new one to change an option."""

    __slots__ = ("value", "duration", "easing", "enter", "exit")
    __array_ufunc__ = None

    def __init__(self, value, duration=None, easing=None, enter=None, exit=None):
        if any(isinstance(item, Animate) for item in (value, enter, exit)):
            raise TypeError("animate() cannot wrap another animate().")
        duration, easing = _animation_options("animate", duration, easing)
        fields = {
            "value": _animated_channel(value), "duration": duration, "easing": easing,
            "enter": _lifecycle_constant("enter", enter), "exit": _lifecycle_constant("exit", exit),
        }
        for key, item in fields.items():
            object.__setattr__(self, key, item)

    def __setattr__(self, name, value):
        raise AttributeError("animate() values are immutable; call hm.animate() again to change an option.")

    def __delattr__(self, name):
        raise AttributeError("animate() values are immutable; call hm.animate() again to change an option.")

    def __reduce__(self):
        return (Animate, (self.value, self.duration, self.easing, self.enter, self.exit))

    def __bool__(self):
        raise TypeError("animate() values cannot be combined or tested; animate() must be the outermost operator on a mark channel.")

    def _arithmetic(self, *_):
        raise TypeError("animate() must be the outermost operator on a mark channel: animate the whole expression, "
                        "hm.animate(hm.col.y + 1), or use hm.tween() inside one.")

    __add__ = __radd__ = __sub__ = __rsub__ = __mul__ = __rmul__ = __truediv__ = __rtruediv__ = _arithmetic
    __pow__ = __rpow__ = __neg__ = _arithmetic

    def _descriptor(self, encode):
        fields = {"value": encode(self.value)}
        for key in ("duration", "easing", "enter", "exit"):
            item = getattr(self, key)
            if item is not None:
                fields[key] = encode(item)
        return {"$animate": fields}


def animate(value, duration=None, easing=None, enter=None, exit=None):
    """Animate a mark channel per row: `y=hm.animate("y", duration=500, enter=0, exit=10)`."""
    return Animate(value, duration=duration, easing=easing, enter=enter, exit=exit)


def _scale_label(label):
    """A scale's guide title: every legend for marks sharing the scale shows it."""
    if label is not None and not isinstance(label, str):
        raise TypeError(f"Scale label must be a string; got {type(label).__name__}.")
    return label


class CategoryScale:
    """A categorical scale shared by the marks that use it (see `hm.categorical`)."""

    def __init__(self, domain=None, range=None, unknown="#9b9fa5", label=None):
        self.id = identity("scale")
        self.version = 1
        self._scenes = set()
        self.domain = list(domain) if domain is not None else None
        self.range = list(range) if range is not None else None
        self.unknown = unknown
        # Fixed at construction, like the JavaScript scale's title.
        self.label = _scale_label(label)

    def update(self, *, domain=Ellipsis, range=Ellipsis, unknown=Ellipsis):
        from .core import transaction, active_transaction
        tx = active_transaction()
        if tx is None:
            with transaction():
                return self.update(domain=domain, range=range, unknown=unknown)
        next_domain = self.domain if domain is Ellipsis else domain
        next_range = self.range if range is Ellipsis else range
        if next_domain is not None and len({(type(v), v) for v in next_domain}) != len(next_domain):
            repeated = next(v for i, v in enumerate(next_domain) if (type(v), v) in {(type(w), w) for w in list(next_domain)[:i]})
            raise ValueError(f"categorical(): the domain lists {repeated!r} more than once; list each category once.")
        if next_range is not None and not next_range:
            raise ValueError("categorical(): range needs at least one value (colors, shapes or sizes), or leave it out "
                             "for the theme's palette.")
        tx.remember(self, ("domain", "range", "unknown", "version"))
        self.domain = list(next_domain) if next_domain is not None else None
        self.range = list(next_range) if next_range is not None else None
        self.unknown = self.unknown if unknown is Ellipsis else unknown
        self.version += 1
        tx.scenes.update(self._scenes)
        return self


def categorical(**kwargs):
    """A shared categorical scale: `domain`, `range` (colors), `unknown`, and `label`, the
    title of the legend guide shared by every mark using the scale."""
    return CategoryScale(**kwargs)


class OrdinalScale(CategoryScale):
    def __init__(self, *, domain, range=None, colormap="Viridis", unknown="#92989f", label=None):
        if not domain or len({(type(value), value) for value in domain}) != len(domain):
            raise ValueError("Ordinal scales need a nonempty domain of unique categories.")
        if range is not None and len(range) != len(domain):
            raise ValueError("Ordinal range needs one value per category.")
        if range is not None and colormap != "Viridis":
            raise ValueError("Choose an ordinal range or a colormap, not both.")
        super().__init__(domain=domain, range=range, unknown=unknown, label=label)
        self.colormap = None if range is not None else colormap

    def update(self, *, domain=Ellipsis, range=Ellipsis, colormap=Ellipsis, unknown=Ellipsis):
        next_domain = self.domain if domain is Ellipsis else domain
        next_range = self.range if range is Ellipsis else range
        if colormap is not Ellipsis and colormap is not None:
            next_range = None
        next_colormap = self.colormap if colormap is Ellipsis else colormap
        if range is not Ellipsis and range is not None:
            next_colormap = None
        if not next_domain or (next_range is not None and len(next_range) != len(next_domain)):
            raise ValueError("Ordinal range needs one value per category and a nonempty domain.")
        from .core import transaction, active_transaction
        tx = active_transaction()
        if tx is None:
            with transaction():
                return self.update(domain=domain, range=range, colormap=colormap, unknown=unknown)
        result = super().update(domain=next_domain, range=next_range, unknown=unknown)
        tx.remember(self, ("colormap",))
        self.colormap = next_colormap
        return result


def ordinal(**kwargs):
    """An ordered categorical scale sampling `colormap` (or an explicit `range`); `label`
    titles the legend guide shared by every mark using the scale."""
    return OrdinalScale(**kwargs)


def _numeric_pair(value, name):
    if not isinstance(value, (tuple, list)) or len(value) != 2 or any(
        isinstance(item, bool) or not isinstance(item, (int, float, np.number))
        or not math.isfinite(float(item)) for item in value
    ):
        raise ValueError(f"{name} requires two finite numbers.")
    if value[0] == value[1]:
        raise ValueError(f"{name} requires distinct endpoints.")
    return [float(value[0]), float(value[1])]


SCALE_TRANSFORMS = ("linear", "log", "sqrt", "symlog")


def _transform_constant(value, name):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be a finite positive number.")
    return float(value)


class NormalizationResource:
    """A scale's source side: domain, transform (linear, log, sqrt or symlog), symlog's
    ``constant`` and a diverging ``midpoint``. See :func:`continuous`."""

    def __init__(self, *, domain=None, transform="linear", domain_source="data", constant=None, midpoint=None):
        self.id = identity("normalization")
        self.version = 1
        self._scenes = set()
        (self.domain, self.transform, self.domain_source, self.constant,
         self.midpoint) = self._validated(domain, transform, domain_source, constant, midpoint)

    @staticmethod
    def _validated(domain, transform, domain_source, constant=None, midpoint=None):
        if transform not in SCALE_TRANSFORMS:
            raise ValueError(f"Unsupported normalization transform: {transform}; use {', '.join(SCALE_TRANSFORMS)}.")
        if domain_source not in ("data", "source"):
            raise ValueError('domain_source must be "data" or "source".')
        # "symmetric": the data's extent centered on zero (R2.0).
        if domain == "symmetric":
            return domain, transform, domain_source, _transform_constant(constant, "Normalization constant"), None
        # d3's diverging domain, [low, mid, high]: the ends, and the middle as the midpoint.
        if isinstance(domain, (list, tuple)) and len(domain) == 3:
            if midpoint is not None:
                raise ValueError("Normalization domain [low, mid, high] already gives the midpoint; pass domain "
                                 "[low, high] with midpoint, or the three values alone.")
            domain, midpoint = [domain[0], domain[2]], domain[1]
        domain = None if domain is None else _numeric_pair(domain, "Normalization domain")
        if domain and transform == "log" and min(domain) <= 0:
            raise ValueError("Log normalization needs positive domain endpoints.")
        if domain and transform == "sqrt" and min(domain) < 0:
            raise ValueError("Square-root normalization needs nonnegative domain endpoints.")
        constant = _transform_constant(constant, "Normalization constant")
        if midpoint is not None:
            if isinstance(midpoint, bool) or not isinstance(midpoint, (int, float)) or not math.isfinite(midpoint):
                raise ValueError("Normalization midpoint must be a finite number.")
            midpoint = float(midpoint)
            if domain and not min(domain) <= midpoint <= max(domain):
                raise ValueError(
                    f"Normalization midpoint {midpoint:g} is outside its domain [{domain[0]:g}, {domain[1]:g}].")
            if (transform == "log" and midpoint <= 0) or (transform == "sqrt" and midpoint < 0):
                raise ValueError(f"Normalization midpoint {midpoint:g} is outside the {transform} transform's domain.")
        return domain, transform, domain_source, constant, midpoint

    def snapshot(self):
        result = {"transform": self.transform, "domainSource": self.domain_source}
        if self.domain is not None:
            result["domain"] = self.domain if self.domain == "symmetric" else list(self.domain)
        if self.constant is not None:
            result["constant"] = self.constant
        if self.midpoint is not None:
            result["midpoint"] = self.midpoint
        return result

    def update(self, *, domain=Ellipsis, transform=None, domain_source=None, constant=Ellipsis, midpoint=Ellipsis):
        from .core import transaction, active_transaction
        tx = active_transaction()
        if tx is None:
            with transaction():
                return self.update(domain=domain, transform=transform, domain_source=domain_source,
                                   constant=constant, midpoint=midpoint)
        values = self._validated(
            self.domain if domain is Ellipsis else domain,
            self.transform if transform is None else transform,
            self.domain_source if domain_source is None else domain_source,
            self.constant if constant is Ellipsis else constant,
            self.midpoint if midpoint is Ellipsis else midpoint,
        )
        tx.remember(self, ("domain", "transform", "domain_source", "constant", "midpoint", "version"))
        self.domain, self.transform, self.domain_source, self.constant, self.midpoint = values
        self.version += 1
        tx.scenes.update(self._scenes)
        return self


def normalization(**kwargs):
    return NormalizationResource(**kwargs)


def _registry_colormaps():
    import json
    from pathlib import Path
    return tuple(json.loads(Path(__file__).with_name("registry.json").read_text())["colormaps"])


COLORMAP_NAMES = _registry_colormaps()


def _registry_theme_kinds():
    """The mark kinds theme.marks accepts (utils/themeKinds.js), via the generated registry."""
    from pathlib import Path
    return tuple(json.loads(Path(__file__).with_name("registry.json").read_text())["themeKinds"])


_THEME_KINDS = _registry_theme_kinds()


_COLORMAP_SPACES = ("lab", "hsl", "srgb")


def _color_alpha(text):
    """Alpha of a CSS color string when it spells one (transparent, #rgba, #rrggbbaa, rgba(),
    hsla(), or the slash form), else 1. The browser parses the color itself."""
    import re
    value = text.strip().lower()
    if value == "transparent":
        return 0.0
    match = re.fullmatch(r"#([0-9a-f]{4}|[0-9a-f]{8})", value)
    if match:
        digits = match.group(1)
        return int(digits[3] * 2 if len(digits) == 4 else digits[6:], 16) / 255
    match = re.fullmatch(r"(?:rgba?|hsla?)\((.*)\)", value)
    if match:
        parts = [part for part in re.split(r"[\s,/]+", match.group(1).strip()) if part]
        if len(parts) == 4:
            try:
                return float(parts[3][:-1]) / 100 if parts[3].endswith("%") else float(parts[3])
            except ValueError:
                return 1.0
    return 1.0


def _validated_colormap(value):
    """Return a colormap in canonical form: a built-in name, or {colors, space, positions}."""
    if isinstance(value, str):
        name = value[:1].upper() + value[1:]
        if name not in COLORMAP_NAMES:
            raise ValueError(f"Unknown colormap: {value}. Valid names: {', '.join(COLORMAP_NAMES)}.")
        return name
    if isinstance(value, (list, tuple)):
        value = {"colors": list(value)}
    if not isinstance(value, dict) or "colors" not in value:
        raise TypeError("A colormap must be a name, a list of colors, or a dict with colors, space, and positions.")
    unknown = set(value) - {"colors", "space", "positions"}
    if unknown:
        raise ValueError(f"Unknown colormap property: {', '.join(sorted(unknown))}; a colormap dict takes colors, space and positions.")
    colors = value["colors"]
    if not isinstance(colors, (list, tuple)) or len(colors) < 2 or any(not isinstance(c, str) for c in colors):
        raise ValueError("A custom colormap needs at least two CSS color strings.")
    for color in colors:
        alpha = _color_alpha(color)
        if alpha < 1:
            import json
            raise ValueError(f"Colormap colors must be opaque: {json.dumps(color)} has alpha "
                             f"{round(alpha, 3):g}. Use the mark's opacity for translucency.")
    space = value.get("space") or "lab"
    if space not in _COLORMAP_SPACES:
        raise ValueError(f'Colormap space must be "lab", "hsl", or "srgb", not {space!r}.')
    positions = value.get("positions")
    if positions is not None:
        positions = list(positions)
        if len(positions) != len(colors):
            raise ValueError("Colormap positions need one number per color.")
        if any(not isinstance(v, (int, float)) or not 0 <= v <= 1 for v in positions) or any(
                b < a for a, b in zip(positions, positions[1:])):
            raise ValueError("Colormap positions must be ascending numbers between 0 and 1.")
        # Evenly spaced positions are the default; normalize them away, as JavaScript does.
        if all(abs(v - i / (len(positions) - 1)) < 1e-9 for i, v in enumerate(positions)):
            positions = None
    return {"colors": list(colors), "space": space, "positions": positions}


def colormap(colors, *, space="lab", positions=None):
    """A custom colormap for ``continuous(colormap=...)``, a mark's ``cmap_index``, or a theme.

    ``colors`` is a list of at least two opaque CSS colors, interpolated in ``space`` ("lab",
    "hsl", or "srgb"). ``positions`` optionally places each color on [0, 1] (ascending,
    one per color; evenly spaced positions are the default and normalize to None). A plain list of colors or a built-in name such as "Magma" is accepted
    wherever a colormap is.
    """
    return _validated_colormap({"colors": list(colors), "space": space, "positions": positions})


def _registry_shapes():
    from pathlib import Path
    return json.loads(Path(__file__).with_name("registry.json").read_text())["shapes"]


# The renderer's shape vocabulary and limits (utils/shapes.js), via the generated registry.
_SHAPE_LIMITS = _registry_shapes()
BUILTIN_SHAPES = tuple(_SHAPE_LIMITS["builtin"])
MAX_SHAPE_SEGMENTS = _SHAPE_LIMITS["maxSegments"]
_MAX_SHAPES = _SHAPE_LIMITS["maxShapes"]
_SHAPES = {}
_SHAPE_NAME = r"[A-Za-z][A-Za-z0-9_-]*"
# utils/shapePaths.js, line for line: the same parse, flattening and checks, with the same
# messages. Only the last bits of a curve's points may differ (each language's sin and cos).
_PATH_COMMANDS = "MmLlHhVvCcSsQqTtAaZz"
_PATH_COUNTS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}
_PATH_NUMBER = re.compile(r"[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?")
_FLATTEN_TOLERANCE = 1e-3


def _parse_shape_path(d):
    """SVG path data as contours [start, segments] with segments ("L", x, y) or
    ("C", x1, y1, x2, y2, x, y); quadratics and arcs become cubics."""
    if not isinstance(d, str):
        raise ValueError("A shape path must be a string.")
    contours, state = [], {"i": 0}
    command, current, start, contour, cubic, quad = None, [0.0, 0.0], [0.0, 0.0], None, None, None

    def skip():
        while state["i"] < len(d) and (d[state["i"]].isspace() or d[state["i"]] == ","):
            state["i"] += 1

    def number(letter):
        skip()
        match = _PATH_NUMBER.match(d, state["i"])
        if not match:
            raise ValueError(f"Shape path command {letter} needs {_PATH_COUNTS[letter.upper()]} numbers per segment.")
        state["i"] = match.end()
        value = float(match.group(0))
        if not math.isfinite(value):
            raise ValueError("Shape path coordinates must be finite numbers.")
        return value

    def flag():
        skip()
        i = state["i"]
        if i >= len(d) or d[i] not in "01":
            raise ValueError("Shape path arc flags must be 0 or 1.")
        state["i"] += 1
        return d[i] == "1"

    def open_contour():
        nonlocal contour
        if contour is None:
            contour = [list(current), []]
            contours.append(contour)

    def line(x, y):
        nonlocal current
        open_contour()
        contour[1].append(("L", x, y))
        current = [x, y]

    def curve(x1, y1, x2, y2, x, y):
        nonlocal current
        open_contour()
        contour[1].append(("C", x1, y1, x2, y2, x, y))
        current = [x, y]

    while True:
        skip()
        if state["i"] >= len(d):
            break
        c = d[state["i"]]
        if c in _PATH_COMMANDS:
            command = c
            state["i"] += 1
        elif c not in "-+.0123456789":
            found = json.dumps(c, ensure_ascii=False)
            raise ValueError(f"Shape paths use SVG path commands (M, L, H, V, C, S, Q, T, A, Z); found {found}.")
        elif command is None:
            raise ValueError("Shape path numbers after Z need a command." if contours else "A shape path must start with M.")
        upper = command.upper()
        relative = command != upper
        if not contours and upper != "M":
            raise ValueError("A shape path must start with M.")
        ox, oy = (current[0], current[1]) if relative else (0.0, 0.0)
        last_cubic = last_quad = None
        if upper == "Z":
            if contour is not None and contour[1]:
                contour.append(True)
            current, contour, command = list(start), None, None
        elif upper == "M":
            x = number(command) + ox
            y = number(command) + oy
            current, start, contour = [x, y], [x, y], None
            open_contour()
            # Extra pairs after M are implicit line commands.
            command = "l" if relative else "L"
        elif upper == "L":
            x = number(command) + ox
            line(x, number(command) + oy)
        elif upper == "H":
            line(number(command) + ox, current[1])
        elif upper == "V":
            line(current[0], number(command) + oy)
        elif upper == "C":
            v = [number(command) + (ox if k % 2 == 0 else oy) for k in range(6)]
            curve(*v)
            last_cubic = [v[2], v[3]]
        elif upper == "S":
            # The first control reflects the previous cubic's second, or is the current point.
            x1, y1 = (2 * current[0] - cubic[0], 2 * current[1] - cubic[1]) if cubic else tuple(current)
            v = [number(command) + (ox if k % 2 == 0 else oy) for k in range(4)]
            curve(x1, y1, *v)
            last_cubic = [v[0], v[1]]
        elif upper in ("Q", "T"):
            if upper == "Q":
                qx = number(command) + ox
                qy = number(command) + oy
            else:
                qx, qy = (2 * current[0] - quad[0], 2 * current[1] - quad[1]) if quad else tuple(current)
            x = number(command) + ox
            y = number(command) + oy
            x0, y0 = current
            # A quadratic is the cubic with controls two thirds of the way to its control point.
            curve(x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y)
            last_quad = [qx, qy]
        elif upper == "A":
            rx, ry, rotation = number(command), number(command), number(command)
            large, sweep = flag(), flag()
            x = number(command) + ox
            y = number(command) + oy
            for segment in _arc_cubics(current, rx, ry, rotation, large, sweep, (x, y)):
                curve(*segment)
            if current[0] != x or current[1] != y:
                line(x, y)
        cubic, quad = last_cubic, last_quad
    return contours


def _arc_cubics(p0, rx, ry, degrees, large, sweep, p1):
    """An elliptical arc as cubic Béziers of at most 90 degrees each (SVG 1.1, F.6.5-F.6.6)."""
    (x0, y0), (x, y) = p0, p1
    if x0 == x and y0 == y:
        return []
    rx, ry = abs(rx), abs(ry)
    if not rx or not ry:
        return []
    phi = degrees * math.pi / 180
    cos, sin = math.cos(phi), math.sin(phi)
    dx, dy = (x0 - x) / 2, (y0 - y) / 2
    x1, y1 = cos * dx + sin * dy, -sin * dx + cos * dy
    scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
    if scale > 1:
        rx, ry = rx * math.sqrt(scale), ry * math.sqrt(scale)
    numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
    root = math.sqrt(max(0.0, numerator / denominator))
    if large == sweep:
        root = -root
    cx1, cy1 = root * rx * y1 / ry, -root * ry * x1 / rx
    cx, cy = cos * cx1 - sin * cy1 + (x0 + x) / 2, sin * cx1 + cos * cy1 + (y0 + y) / 2

    def angle(ux, uy, vx, vy):
        return math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)

    theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if not sweep and delta > 0:
        delta -= 2 * math.pi
    if sweep and delta < 0:
        delta += 2 * math.pi
    count = max(1, math.ceil(abs(delta) / (math.pi / 2) - 1e-9))
    step = delta / count
    k = (4 / 3) * math.tan(step / 4)

    def point(t):
        return (cx + rx * math.cos(t) * cos - ry * math.sin(t) * sin, cy + rx * math.cos(t) * sin + ry * math.sin(t) * cos)

    def tangent(t):
        return (-rx * math.sin(t) * cos - ry * math.cos(t) * sin, -rx * math.sin(t) * sin + ry * math.cos(t) * cos)

    segments = []
    for n in range(count):
        a = theta + n * step
        b = a + step
        ax, ay = point(a)
        bx, by = (x, y) if n == count - 1 else point(b)
        tax, tay = tangent(a)
        tbx, tby = tangent(b)
        segments.append((ax + k * tax, ay + k * tay, bx - k * tbx, by - k * tby, bx, by))
    return segments


def _flatten_cubic(x0, y0, x1, y1, x2, y2, x3, y3, out, depth=0):
    dx, dy = x3 - x0, y3 - y0
    length = math.hypot(dx, dy)

    def distance(px, py):
        return abs((px - x0) * dy - (py - y0) * dx) / length if length > 0 else math.hypot(px - x0, py - y0)

    if depth >= 16 or max(distance(x1, y1), distance(x2, y2)) <= _FLATTEN_TOLERANCE:
        out.append([x3, y3])
        return
    ax, ay, bx, by, cx, cy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 + x2) / 2, (y1 + y2) / 2, (x2 + x3) / 2, (y2 + y3) / 2
    abx, aby, bcx, bcy = (ax + bx) / 2, (ay + by) / 2, (bx + cx) / 2, (by + cy) / 2
    mx, my = (abx + bcx) / 2, (aby + bcy) / 2
    _flatten_cubic(x0, y0, ax, ay, abx, aby, mx, my, out, depth + 1)
    _flatten_cubic(mx, my, bcx, bcy, cx, cy, x3, y3, out, depth + 1)


def _shape_rings(contours):
    """Each contour as a ring: consecutive duplicates and the closing point dropped."""
    rings = []
    for start, segments, *_ in contours:
        points, (x, y) = [list(start)], start
        for s in segments:
            if s[0] == "L":
                points.append([s[1], s[2]])
            else:
                _flatten_cubic(x, y, *s[1:], points)
            x, y = s[-2], s[-1]
        ring = []
        for point in points:
            if not ring or ring[-1] != point:
                ring.append(point)
        if len(ring) > 1 and ring[0] == ring[-1]:
            ring.pop()
        if ring:
            rings.append(ring)
    return rings


def _ring_flat(ring):
    """Whether every point of a ring lies on one line (a bowtie's signed area cancels, so area
    would call it flat)."""
    ax, ay = ring[0]
    far, best = ring[0], 0.0
    for p in ring:
        d = math.hypot(p[0] - ax, p[1] - ay)
        if d > best:
            best, far = d, p
    if best < 1e-9:
        return True
    bx, by = far
    return all(abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / best < 1e-9 for x, y in ring)


def _shape_number(value):
    return (isinstance(value, (numbers.Real, np.integer, np.floating))
            and not isinstance(value, (bool, np.bool_)) and math.isfinite(value))


def _validate_shape(name, definition):
    """Check a custom shape exactly as the renderer's registerShape does, without registering it.

    ``definition`` is a vertex list (lists, tuples or a numpy ``(n, 2)`` array), SVG path data,
    or ``{"path" | "vertices": ..., "fillRule": ..., "viewBox": [min_x, min_y, width, height]}``.
    Returns its canonical form, as the renderer stores it: a cleaned vertex list, the path
    string, or the dict. Raises ``ValueError`` with the renderer's messages.
    """
    import re as _re
    if not isinstance(name, str) or not _re.fullmatch(_SHAPE_NAME, name):
        raise ValueError("Shape names must start with a letter and contain letters, digits, _ or -.")
    if name in ("sphere", "cube"):
        raise ValueError(f"{name} is a 3D shape name and cannot be registered.")
    if name in BUILTIN_SHAPES:
        raise ValueError(f"{name} is a built-in shape and cannot be redefined.")
    source, fill_rule, view_box = definition, "nonzero", None
    if isinstance(definition, dict):
        unknown = [key for key in definition if key not in ("path", "vertices", "fillRule", "viewBox")]
        if unknown:
            raise ValueError(f"Shape {name} has unknown properties: {', '.join(unknown)}. Use path or vertices, fillRule and viewBox.")
        if ("path" in definition) == ("vertices" in definition):
            raise ValueError(f"Shape {name} needs a path or vertices, not both.")
        source = definition.get("path", definition.get("vertices"))
        if definition.get("fillRule") is not None:
            if definition["fillRule"] not in ("nonzero", "evenodd"):
                raise ValueError(f'Shape {name} fillRule must be "nonzero" or "evenodd".')
            fill_rule = definition["fillRule"]
        if definition.get("viewBox") is not None:
            if "path" not in definition:
                raise ValueError(f"Shape {name} viewBox applies to a path, not vertices.")
            box = definition["viewBox"]
            if (not isinstance(box, (list, tuple)) or len(box) != 4 or not all(_shape_number(v) for v in box)
                    or box[2] <= 0 or box[3] <= 0):
                raise ValueError(f"Shape {name} viewBox must be [minX, minY, width, height] with a positive width and height.")
            view_box = [float(v) for v in box]
    path = isinstance(source, str)
    if path:
        contours = _parse_shape_path(source)
    else:
        if isinstance(source, np.ndarray):
            source = [list(point) if point.ndim == 1 else point for point in source] if source.ndim >= 1 else None
        if not isinstance(source, (list, tuple)):
            raise ValueError(f"Shape {name} must be a list of [x, y] vertices or SVG path data.")
        # A point may itself be a numpy array ([..., np.array([-1, -1])]).
        source = [list(point) if isinstance(point, np.ndarray) and point.ndim == 1 else point for point in source]
        for point in source:
            if not isinstance(point, (list, tuple)) or len(point) != 2 or not all(_shape_number(v) for v in point):
                raise ValueError(f"Shape {name} vertices must be [x, y] pairs of finite numbers.")
        source = [[float(point[0]), float(point[1])] for point in source]
        contours = [[list(source[0]), [("L", x, y) for x, y in source[1:]]]] if source else []
    if view_box:
        # Fit the box into the unit square, centered, keeping its aspect ratio; SVG's y is down.
        min_x, min_y, width, height = view_box
        scale = 2 / max(width, height)
        cx, cy = min_x + width / 2, min_y + height / 2

        def fit(values):
            out = []
            for k in range(0, len(values), 2):
                out += [(values[k] - cx) * scale, -(values[k + 1] - cy) * scale]
            return out

        contours = [[fit(start), [(s[0], *fit(s[1:])) for s in segments]] for start, segments, *_ in contours]
    rings = _shape_rings(contours)
    points = [point for ring in rings for point in ring]
    if not path and len(source) < 3:
        raise ValueError(f"Shape {name} needs at least 3 vertices.")
    if len(points) < 3:
        raise ValueError(f"Shape {name} needs at least 3 vertices." if path else f"Shape {name} needs at least 3 distinct vertices.")
    if any(abs(x) > 1 or abs(y) > 1 for x, y in points):
        if not path:
            raise ValueError(f"Shape {name} vertices must lie in the unit square [-1, 1].")
        raise ValueError(f"Shape {name} must lie in the unit square [-1, 1]; give a viewBox to fit a path drawn in other coordinates.")
    if len(points) > MAX_SHAPE_SEGMENTS:
        raise ValueError(f"Points: shape {name}'s outline, once its curves are flattened, needs {len(points):,} segments; "
                         f"the limit is {MAX_SHAPE_SEGMENTS:,} segments. Simplify the path." if path else
                         f"Points: shape {name}'s outline needs {len(points):,} segments; the limit is {MAX_SHAPE_SEGMENTS:,} "
                         "segments. Use fewer vertices.")
    if all(len(ring) < 3 or _ring_flat(ring) for ring in rings):
        raise ValueError(f"Shape {name} has zero area." if path else f"Shape {name} has zero area; its vertices are collinear.")
    if path:
        if fill_rule == "nonzero" and view_box is None:
            return source
        return {"path": source, **({"fillRule": fill_rule} if fill_rule != "nonzero" else {}),
                **({"viewBox": view_box} if view_box else {})}
    return rings[0] if fill_rule == "nonzero" else {"vertices": rings[0], "fillRule": fill_rule}


def register_shape(name, vertices, *, fill_rule=None, view_box=None):
    """Register a custom point shape and return its name.

    ``vertices`` is a polygon, ``[x, y]`` pairs inside the unit square ``[-1, 1]`` (y up) as a
    list or a numpy array of shape ``(n, 2)``, or SVG path data in the same coordinates: lines,
    curves and arcs (M, L, H, V, C, S, Q, T, A, Z), several subpaths, holes. ``view_box``
    (``[min_x, min_y, width, height]``) registers a path as an icon set draws it, y down in its
    own box, fitted into the unit square. ``fill_rule`` ("nonzero", the default, or "evenodd")
    decides what is inside where outlines overlap or cross. A shape has at most 4096 segments
    once its curves are flattened. Names are ASCII: a letter, then letters, digits, ``_`` or
    ``-``. Use the name anywhere a shape is accepted, for example ``shape="kite"``
    (``hm.literal("kite")`` when a column has the same name) or in a
    ``categorical(range=[...])`` shape scale. Registering a name again with the same definition
    is harmless; a different one is an error. A page holds 256 shapes, built-ins included.
    """
    definition = vertices
    if fill_rule is not None or view_box is not None:
        definition = {("path" if isinstance(vertices, str) else "vertices"): vertices,
                      **({"fillRule": fill_rule} if fill_rule is not None else {}),
                      **({"viewBox": list(view_box)} if view_box is not None else {})}
    canonical = _validate_shape(name, definition)
    if name in _SHAPES:
        if _SHAPES[name] != canonical:
            raise ValueError(f"Shape {name} is already registered with a different outline.")
        return name
    if len(_SHAPES) + len(BUILTIN_SHAPES) >= _MAX_SHAPES:
        limit = _MAX_SHAPES - len(BUILTIN_SHAPES)
        raise ValueError(f"Points: custom shapes on one page needs {limit + 1:,} shapes; the limit is {limit:,} shapes. "
                         "Reuse shapes, or draw some marks as Polygons.")
    _SHAPES[name] = canonical
    return name


def registered_shapes():
    """Custom shapes registered with :func:`shape`, as ``{name: definition}`` (canonical form)."""
    return {name: json.loads(json.dumps(definition)) for name, definition in _SHAPES.items()}


class Rgb:
    """Red, green, blue, and optional alpha components for a color channel. See :func:`rgb`."""

    def __init__(self, r, g, b, a=None):
        items = {"r": r, "g": g, "b": b}
        if a is not None:
            items["a"] = a
        if any(isinstance(item, Animate) for item in items.values()):
            raise TypeError("animate() must be the outermost operator on a mark channel; "
                            "animate the color instead: fill=hm.animate(hm.rgb(...)).")
        # Names refer to Data columns; arrays become columns of their own.
        self.components = {k: v if isinstance(v, str) else typed_column(v) for k, v in items.items()}


def rgb(r, g, b, a=None):
    """Color each row from separate red, green, blue (and optional alpha) columns.

    Pass column names or arrays, for example ``fill=hm.rgb("red", "green", "blue")``.
    Integer data is 0-255 and float data 0-1; all components must be the same kind.
    Out-of-range values raise an error when the plot renders. An RGB channel has no scale,
    colormap, or legend. Alpha becomes per-row opacity on point marks and labels.
    A NumPy N x 3 (or N x 4) array works the same way without this helper.
    """
    return Rgb(r, g, b, a)


class ContinuousScale:
    """A continuous scale resource (see `hm.continuous`). `label` titles the legend guide
    shared by every mark using the scale."""

    def __init__(self, *, normalization=None, domain=None, transform=None,
                 domain_source=None, range=None, colormap=None, quantize=False, levels=10,
                 label=None, constant=None, midpoint=None, missing=None):
        if normalization is not None and any(
                value is not None for value in (domain, transform, domain_source, constant, midpoint)):
            raise ValueError(
                "Configure domain, transform, constant, midpoint, and domain_source on the shared normalization.")
        self.id = identity("scale")
        self.version = 1
        self._scenes = set()
        self.normalization = normalization or NormalizationResource(
            domain=domain, transform=transform or "linear", domain_source=domain_source or "data",
            constant=constant, midpoint=midpoint,
        )
        if not isinstance(self.normalization, NormalizationResource):
            raise TypeError("normalization must be a NormalizationResource.")
        # d3's color range (a list of CSS colors) is a colormap here, as in the browser.
        if colormap is None and isinstance(range, (list, tuple)) and len(range) >= 2 and all(isinstance(c, str) for c in range):
            colormap, range = list(range), None
        self.range, self.colormap, self.quantize, self.levels = self._validated(
            range, colormap, quantize, levels
        )
        self.missing = self._validated_missing(missing, self.range)
        # Fixed at construction: titles the legend guide of every mark sharing the scale.
        self.label = _scale_label(label)

    @staticmethod
    def _validated_missing(missing, range):
        if missing is None:
            return None
        if not isinstance(missing, str) or not missing.strip():
            raise ValueError('A continuous scale\'s missing must be a CSS color, such as missing="#92989f".')
        if range is not None:
            raise ValueError("A continuous scale's missing is a color for a colormap: a scale with a numeric "
                             "range (sizes, widths) has none.")
        return missing

    @staticmethod
    def _validated(range, colormap, quantize, levels):
        if range is not None and colormap is not None:
            raise ValueError("Choose a numeric range or a colormap, not both.")
        if not isinstance(levels, int) or levels < 1:
            raise ValueError("Quantization levels must be a positive integer.")
        # No colormap means the inherited default (a Theme's colormap, else Viridis); the
        # browser resolves it, as for JavaScript's continuous() without a colormap.
        return (_numeric_pair(range, "Encoding range") if range is not None else None,
                None if range is not None or colormap is None else _validated_colormap(colormap),
                bool(quantize), levels)

    def snapshot(self):
        return {"kind": "continuous", "normalization": {"$normalization": self.normalization.id},
                "range": self.range, "colormap": self.colormap,
                "quantize": self.quantize, "levels": self.levels,
                "version": self.version,
                **({"missing": self.missing} if self.missing is not None else {}),
                **({"label": self.label} if self.label is not None else {})}

    def update(self, *, range=Ellipsis, colormap=Ellipsis, quantize=None, levels=None, missing=Ellipsis):
        """Change the encoding: ``range`` or ``colormap`` (``colormap=None`` returns to the theme's),
        ``quantize``, ``levels``, ``missing`` (``missing=None`` returns to the theme's)."""
        from .core import transaction, active_transaction
        tx = active_transaction()
        if tx is None:
            with transaction():
                return self.update(range=range, colormap=colormap, quantize=quantize, levels=levels, missing=missing)
        next_range = self.range if range is Ellipsis else range
        next_colormap = self.colormap if colormap is Ellipsis else colormap
        next_missing = self.missing if missing is Ellipsis else missing
        if range is not Ellipsis and range is not None:
            next_colormap = None
            next_missing = None
        if colormap is not Ellipsis and colormap is not None:
            next_range = None
        values = self._validated(next_range, next_colormap,
                                 self.quantize if quantize is None else quantize,
                                 self.levels if levels is None else levels)
        next_missing = self._validated_missing(next_missing, values[0])
        tx.remember(self, ("range", "colormap", "quantize", "levels", "missing", "version"))
        self.range, self.colormap, self.quantize, self.levels = values
        self.missing = next_missing
        self.version += 1
        tx.scenes.update(self._scenes)
        return self


def continuous(**kwargs):
    """A continuous scale resource shared by marks: ``fill_scale=hm.continuous(domain=[0, 1])``.

    Give a numeric ``range`` (sizes, widths) or a ``colormap`` (a name, a list of colors, or
    :func:`colormap`), not both. Without either, colors use the inherited default: the
    enclosing Theme's ``colormap``, else Viridis. ``scale.update(colormap=None)`` returns to
    that default.

    ``transform`` is "linear", "log", "sqrt" or "symlog" (linear within ±``constant``,
    logarithmic beyond; for data that crosses zero). A value outside the transform's domain
    (a zero under log) is not drawn. ``midpoint`` makes a diverging scale: the domain's halves
    map to the range's halves, so ``colormap="RdBu", midpoint=0`` puts the white at 0 and uses
    both ends. An explicit domain must contain the midpoint; an automatic one grows to.

    ``missing`` is the color a missing value (NaN or None) of a colormapped fill or color draws
    in, on screen, in exports and in its legend; without it, the theme's ``missing`` (a neutral
    gray, "#92989f", by default). ``scale.update(missing=None)`` returns to the theme's.
    """
    return ContinuousScale(**kwargs)


def _theme_merge(left, right):
    result = dict(left or {})
    for key, value in (right or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _theme_merge(result[key], value)
        else:
            result[key] = list(value) if isinstance(value, (list, tuple)) else value
    return result


def _theme_shapes(shapes):
    """Validate theme shapes without registering them; returns ``{name: vertices}`` lists."""
    if not isinstance(shapes, dict):
        raise ValueError("theme.shapes must be an object")
    result = {}
    for name, vertices in shapes.items():
        try:
            result[name] = _validate_shape(name, vertices)
        except ValueError as error:
            raise ValueError(f"theme.shapes.{name}: {error}") from None
    return result


def _theme_keys(value):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            camel = key.split("_")[0] + "".join(part[:1].upper() + part[1:] for part in key.split("_")[1:])
            # Shape names are identifiers marks refer to (snake_case stays), and vertices may be arrays.
            result[camel] = _theme_shapes(item) if camel == "shapes" else _theme_keys(item)
        return result
    if isinstance(value, (list, tuple)):
        return [_theme_keys(item) for item in value]
    return value


def _preset_key(name):
    return "".join(ch for ch in str(name).lower() if ch.isalnum())


def _theme_preset(name):
    """A preset by name, ignoring case and punctuation ("finance_terminal", "financeTerminal")."""
    key = _preset_key(name)
    return next((value for preset, value in _THEME_PRESET_VALUES.items() if _preset_key(preset) == key), None)


def _theme_partial(name):
    """A partial theme by name, ignoring case and punctuation in each part ("legend/inlineTop")."""
    group, _, rest = str(name).partition("/")
    key = (_preset_key(group), _preset_key(rest))
    return next((value for partial, value in _THEME_PARTIAL_VALUES.items()
                 if tuple(_preset_key(part) for part in partial.split("/", 1)) == key), None)


def _partial_group(value):
    """The group ("axes", "legend", ...) a theme's name makes it a partial of, or None."""
    name = value.get("name") if isinstance(value, dict) else None
    if not isinstance(name, str) or "/" not in name:
        return None
    group = name.split("/", 1)[0].lower()
    return group if group in _PARTIAL_SECTIONS else None


def _section_only(value, section):
    return {section: value[section]} if isinstance(value, dict) and section in value else {}


def _partial_layer(value):
    """What a resolved theme lends when merged under another: a partial only its section, never
    its name or other keys; any other theme all of itself. As theme.js partialLayer."""
    group = _partial_group(value)
    return value if group is None else _section_only(value, _PARTIAL_SECTIONS[group])


def _user_stacklevel():
    """The stacklevel of the first frame outside the hmplot package, for warnings.warn called by
    this function's caller: a warning points at the user's code."""
    import os
    import sys
    package = os.path.dirname(os.path.abspath(__file__)) + os.sep
    frame, level = sys._getframe(1), 1
    while frame is not None and os.path.abspath(frame.f_code.co_filename).startswith(package):
        frame, level = frame.f_back, level + 1
    return level


def _check_partial(value):
    """A partial theme definition setting keys outside its section warns (TODO 132.7), as
    theme.js does."""
    group = _partial_group(value)
    if group is None:
        return
    section = _PARTIAL_SECTIONS[group]
    outside = [key for key in value if key not in ("name", "extends", section)]
    if outside:
        import warnings
        keys = ", ".join(f"theme.{key}" for key in outside)
        warnings.warn(f'Theme: the partial theme "{value["name"]}" sets {keys}, outside its section (theme.{section}); '
                      f'put those in a full theme, or name it without "{group}/".', stacklevel=_user_stacklevel())


def _resolve_theme(value, seen=()):
    """A theme definition with `extends` resolved: each base (a preset or partial theme name, a
    definition or a ThemeResource, itself resolved), merged left to right, then the definition's
    own keys; a partial lends only its section and takes only that section from its own bases.
    As src/lib/plot/utils/theme.js resolveTheme (TODO 132.7: `extends` as a list)."""
    if isinstance(value, ThemeResource):
        # A resource's value is resolved: its keys are not all its own, so only definitions warn.
        value = value.value
    elif isinstance(value, dict):
        _check_partial(value)
    if not isinstance(value, dict) or "extends" not in value:
        return value
    own = {key: item for key, item in value.items() if key != "extends"}
    group = _partial_group(value)
    bases = value["extends"]
    result = {}
    for base in bases if isinstance(bases, (list, tuple)) else [bases]:
        if isinstance(base, str):
            parent = _theme_partial(base) if "/" in base else _theme_preset(base)
            if parent is None and "/" in base:
                raise ValueError(f'theme.extends: unknown partial theme "{base}"; choose from {", ".join(_THEME_PARTIAL_VALUES)}.')
            if parent is None:
                raise ValueError(f'theme.extends: unknown preset "{base}"; choose from {", ".join(_THEME_PRESET_VALUES)}.')
        elif isinstance(base, ThemeResource):
            parent = base
        elif isinstance(base, dict):
            parent = _theme_keys(base)
        else:
            raise TypeError("theme.extends must be a preset or partial theme name, a theme definition or a theme, or a list of them.")
        if any(parent is item for item in seen):
            raise ValueError("theme.extends: a theme cannot extend itself (a cycle of extends).")
        layer = _partial_layer(_resolve_theme(parent, (*seen, value, parent)))
        result = _theme_merge(result, _section_only(layer, _PARTIAL_SECTIONS[group]) if group else layer)
    return _theme_merge(result, own)


class ThemeResource:
    """A small, independently versioned presentation resource."""

    def __init__(self, value):
        self.id = identity("theme")
        self.version = 1
        self.value = _resolve_theme(_theme_keys(value))
        if isinstance(self.value, dict) and "axes" in self.value:
            check_axis_style(self.value["axes"], "theme.axes")
        self._scenes = set()

    def update(self, value=None, **sections):
        from .core import transaction, active_transaction

        patch = _theme_keys({**(value or {}), **sections})
        if "extends" in patch:
            raise ValueError("theme.update() cannot change extends; replace({'extends': ...}) rebases a theme.")
        tx = active_transaction()
        if tx is None:
            with transaction():
                return self.update(patch)
        tx.remember(self, ("value", "version"))
        updated = _theme_merge(self.value, patch)
        if "axes" in updated:
            check_axis_style(updated["axes"], "theme.axes")
        self.value = updated
        self.version += 1
        tx.scenes.update(self._scenes)
        return self

    def replace(self, value):
        from .core import transaction, active_transaction

        tx = active_transaction()
        if tx is None:
            with transaction():
                return self.replace(value)
        tx.remember(self, ("value", "version"))
        updated = _resolve_theme(_theme_keys(value))
        if isinstance(updated, dict) and "axes" in updated:
            check_axis_style(updated["axes"], "theme.axes")
        self.value = updated
        self.version += 1
        tx.scenes.update(self._scenes)
        return self


def create_theme(name=None, **sections):
    value = dict(sections)
    if name is not None:
        value["name"] = name
    return ThemeResource(value)

def load_theme(path):
    """Load a theme definition from a JSON file as a mutable theme resource."""
    from pathlib import Path
    import json
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    _validate_theme_definition(value)
    return ThemeResource(value)


def _validate_theme_definition(value):
    from pathlib import Path
    import json
    schema = json.loads(Path(__file__).with_name("themes").joinpath("theme.schema.json").read_text())
    if not isinstance(value, dict):
        raise ValueError("theme must be an object")
    for key, item in value.items():
        definition = schema["properties"].get(key)
        if definition is None:
            raise ValueError(f"Unsupported theme property theme.{key}")
        if key == "name":
            if not isinstance(item, str):
                raise ValueError("theme.name must be a string")
            continue
        if key == "extends":
            for base in item if isinstance(item, list) else [item]:
                if isinstance(base, dict):
                    _validate_theme_definition(base)
                elif not isinstance(base, str):
                    raise ValueError("theme.extends must be a preset or partial theme name, a theme definition, or a list of them")
            continue
        if key == "vectorTile":
            if not isinstance(item, dict):
                raise ValueError("theme.vectorTile must be an object")
            parts = schema["$defs"]["vectorTile"]["properties"]
            styles = schema["$defs"]["vectorTileStyle"]["oneOf"][1]["properties"]
            for part, style in item.items():
                if part not in parts:
                    raise ValueError(f'theme.vectorTile has no part "{part}"; the parts are {", ".join(parts)}')
                if style is False:
                    continue
                if not isinstance(style, dict):
                    raise ValueError(f"theme.vectorTile.{part} must be false or an object")
                for option in style:
                    if option not in styles:
                        raise ValueError(f"Unsupported theme property theme.vectorTile.{part}.{option}")
            continue
        if key == "palette":
            if not isinstance(item, list) or not item or any(not isinstance(v, str) for v in item):
                raise ValueError("theme.palette must be a nonempty array of colors")
            continue
        if key == "shapes":
            if not isinstance(item, dict):
                raise ValueError("theme.shapes must be an object")
            _theme_shapes(item)
            continue
        if key == "colormap":
            try:
                _validated_colormap(item)
            except (TypeError, ValueError) as error:
                raise ValueError(f"theme.colormap: {error}") from None
            continue
        if key == "missing":
            if not isinstance(item, str) or not item.strip():
                raise ValueError('theme.missing must be a CSS color, such as "#92989f"')
            continue
        if key == "marks":
            if not isinstance(item, dict):
                raise ValueError("theme.marks must be an object")
            allowed_kinds = {*_THEME_KINDS, "default"}
            for kind, options in item.items():
                if kind not in allowed_kinds:
                    raise ValueError(f"Unsupported theme mark kind theme.marks.{kind}")
                if not isinstance(options, dict):
                    raise ValueError(f"theme.marks.{kind} must be an object")
                allowed = schema["$defs"]["mark"]["properties"]
                for option in options:
                    if option not in allowed:
                        raise ValueError(f"Unsupported theme property theme.marks.{kind}.{option}")
            continue
        if not isinstance(item, dict):
            raise ValueError(f"theme.{key} must be an object")
        allowed = schema["$defs"][key]["properties"]
        for option in item:
            if option not in allowed:
                raise ValueError(f"Unsupported theme property theme.{key}.{option}")
        if key == "axes":
            check_axis_style(item, "theme.axes")
        if key == "title":
            _check_theme_title(item)
        if key == "guides":
            _check_theme_guides(item)
        if key == "numbers":
            _check_theme_numbers(item)
        if key == "controls":
            _check_theme_controls(item)
        if key == "animation":
            _check_theme_animation(item)



def _check_theme_animation(section):
    """theme.animation's values (TODO 132.7), as src/lib/plot/utils/theme.js checks them."""
    import math

    def timing(values, path):
        value = values.get("duration")
        if "duration" in values and (isinstance(value, bool) or not isinstance(value, (int, float))
                                     or not math.isfinite(value) or value < 0):
            raise ValueError(f"{path}.duration must be a nonnegative number of milliseconds, such as 300")
        if "easing" in values and values["easing"] not in EASINGS:
            raise ValueError(f"{path}.easing must be one of " + ", ".join(f'"{name}"' for name in EASINGS))

    timing(section, "theme.animation")
    for key in ("enter", "exit"):
        if key not in section:
            continue
        value, path = section[key], f"theme.animation.{key}"
        if isinstance(value, bool) or value == "fade":
            continue
        if not isinstance(value, dict):
            raise ValueError(f'{path} must be True, False, "fade" or {{"effect": "fade", "duration": ..., "easing": ...}}')
        for option in value:
            if option not in ("effect", "duration", "easing"):
                raise ValueError(f"Unsupported theme property {path}.{option}")
        if value.get("effect", "fade") != "fade":
            raise ValueError(f'{path}.effect must be "fade"')
        timing(value, path)


def _check_theme_title(title):
    """theme.title's values (TODO 132.1), as src/lib/plot/utils/theme.js checks them."""
    if title.get("align", "left") not in ("left", "center", "right"):
        raise ValueError('theme.title.align must be "left", "center" or "right"')
    for key in ("fontSize", "subtitleFontSize", "captionFontSize"):
        value = title.get(key)
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0):
            raise ValueError(f"theme.title.{key} must be a positive number of pixels")
    spacing = title.get("spacing")
    if spacing is not None and (isinstance(spacing, bool) or not isinstance(spacing, (int, float)) or spacing < 0):
        raise ValueError("theme.title.spacing must be a nonnegative number of pixels")
    weight = title.get("fontWeight")
    if weight is not None and (isinstance(weight, bool) or not isinstance(weight, int) or not 100 <= weight <= 900):
        raise ValueError("theme.title.fontWeight must be a whole number from 100 to 900, such as 600")


def _check_theme_guides(guides):
    """theme.guides' legend values (TODO 132.2), as src/lib/plot/utils/theme.js checks them."""
    for key, choices in (("position", ("top", "bottom", "left", "right")), ("layout", ("auto", "inline", "stacked")),
                         ("swatchShape", ("auto", "circle", "square"))):
        if key in guides and guides[key] not in choices:
            raise ValueError(f"theme.guides.{key} must be " + ", ".join(f'"{c}"' for c in choices[:-1]) + f' or "{choices[-1]}"')
    import math
    for key in ("swatchSize", "titleFontSize"):
        value = guides.get(key)
        if key in guides and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0):
            raise ValueError(f"theme.guides.{key} must be a positive number of pixels")
    weight = guides.get("titleFontWeight")
    if "titleFontWeight" in guides and (isinstance(weight, bool) or not isinstance(weight, int) or not 100 <= weight <= 900):
        raise ValueError("theme.guides.titleFontWeight must be a whole number from 100 to 900, such as 600")


def _check_theme_controls(controls):
    """theme.controls' input values (TODO 132.3), as src/lib/plot/utils/theme.js checks them."""
    accent = controls.get("accentColor")
    if "accentColor" in controls and (not isinstance(accent, str) or not accent.strip()):
        raise ValueError('theme.controls.accentColor must be a CSS color, such as "#0f766e"')
    import math
    size = controls.get("fontSize")
    if "fontSize" in controls and (isinstance(size, bool) or not isinstance(size, (int, float)) or not math.isfinite(size) or size <= 0):
        raise ValueError("theme.controls.fontSize must be a positive number of pixels")


# A d3-format specifier, as d3's formatSpecifier parses one.
_D3_FORMAT = re.compile(r"(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?", re.IGNORECASE)


def _check_theme_numbers(section):
    """theme.numbers's values (TODO 132.4), as src/lib/plot/utils/theme.js checks them."""
    if "format" not in section:
        return
    value = section["format"]
    if not isinstance(value, str) or not value or not _D3_FORMAT.fullmatch(value):
        raise ValueError(f'theme.numbers.format must be a d3-format string, such as ",.2f" or "$,.0f", not {value!r}')


def _preset_values():
    from pathlib import Path
    import json
    directory = Path(__file__).with_name("themes")
    preferred = (
        "hmplot", "minimal", "ink", "paper", "presentation", "colorblind", "dark", "538",
        "finance-terminal", "pastel", "graph", "sea", "sunset", "ggplot",
        "seaborn-dark", "notebook", "graphing-calculator", "observable",
        "wes-anderson", "ghibli", "yellow-glow", "8bit",
        "vaporwave", "blueprint", "bubblegum", "spooky", "treasure-map",
        "bureau", "journal", "bauhaus", "risograph", "tufte",
    )
    files = {path.stem: path for path in directory.glob("*.json") if path.name != "theme.schema.json"}
    order = [*filter(files.__contains__, preferred), *sorted(set(files) - set(preferred))]
    return {name: json.loads(files[name].read_text(encoding="utf-8")) for name in order}


_THEME_PRESET_VALUES = _preset_values()

# Partial themes (TODO 132.7): "<group>/<name>", each setting one section; a group names its
# section. As src/lib/plot/utils/themePresets.js themePartials.
_PARTIAL_SECTIONS = {"axes": "axes", "legend": "guides", "title": "title", "controls": "controls", "numbers": "numbers",
                     "animation": "animation", "marks": "marks"}


def _partial_values():
    from pathlib import Path
    import json
    directory = Path(__file__).with_name("themes") / "partials"
    values = {}
    for group, section in _PARTIAL_SECTIONS.items():
        entries = json.loads((directory / f"{group}.json").read_text(encoding="utf-8"))
        for name, contents in entries.items():
            values[f"{group}/{name}"] = {"name": f"{group}/{name}", section: contents}
    return values


_THEME_PARTIAL_VALUES = _partial_values()


class ThemePresets:
    """Fresh copies of HMPlot's curated presentation themes."""

    @property
    def hmplot(self):
        """The default: a readable white theme with palette-colored marks and subtle grids."""
        return self.get("hmplot")

    @property
    def ink(self):
        """HMPlot's readable layout with charcoal, red, blue, and other ink-like colors."""
        return self.get("ink")

    @property
    def paper(self):
        return self.get("paper")

    @property
    def minimal(self):
        return self.get("minimal")

    @property
    def presentation(self):
        return self.get("presentation")

    @property
    def colorblind(self):
        return self.get("colorblind")

    @property
    def dark(self):
        return self.get("dark")

    @property
    def five_thirty_eight(self):
        return self.get("538")

    @property
    def finance_terminal(self):
        return self.get("finance-terminal")

    @property
    def pastel(self):
        return self.get("pastel")

    @property
    def graph(self):
        return self.get("graph")

    @property
    def sea(self):
        return self.get("sea")

    @property
    def sunset(self):
        return self.get("sunset")

    @property
    def ggplot(self):
        return self.get("ggplot")

    @property
    def seaborn_dark(self):
        return self.get("seaborn-dark")

    @property
    def notebook(self):
        return self.get("notebook")

    @property
    def graphing_calculator(self):
        return self.get("graphing-calculator")

    @property
    def observable(self):
        return self.get("observable")

    @property
    def wes_anderson(self):
        return self.get("wes-anderson")

    @property
    def ghibli(self):
        return self.get("ghibli")

    @property
    def yellow_glow(self):
        return self.get("yellow-glow")

    @property
    def eight_bit(self):
        return self.get("8bit")

    @property
    def vaporwave(self):
        return self.get("vaporwave")

    @property
    def blueprint(self):
        return self.get("blueprint")

    @property
    def bubblegum(self):
        return self.get("bubblegum")

    @property
    def spooky(self):
        return self.get("spooky")

    @property
    def treasure_map(self):
        return self.get("treasure-map")

    @property
    def bureau(self):
        return self.get("bureau")

    @property
    def journal(self):
        return self.get("journal")

    @property
    def bauhaus(self):
        return self.get("bauhaus")

    @property
    def risograph(self):
        return self.get("risograph")

    @property
    def tufte(self):
        return self.get("tufte")

    def names(self):
        return tuple(_THEME_PRESET_VALUES)

    def get(self, name):
        import copy

        try:
            return copy.deepcopy(_THEME_PRESET_VALUES[name])
        except KeyError as error:
            choices = ", ".join(self.names())
            raise KeyError(f"Unknown theme preset {name!r}; choose from {choices}.") from error

    def __getitem__(self, name):
        return self.get(name)


# Definitions rather than shared resources: callers can customize a returned
# dictionary or wrap it with create_theme() without mutating another plot.
themes = ThemePresets()
