"""Writes the Parquet fixtures for tests/unit/providers.test.js (TODO 48.3): the same small
table from pyarrow (snappy, its default) and from Polars (zstd, its default), with a missing
value in every column. Run from the repository root with the .venv Python:

    .venv/bin/python tests/unit/fixtures-parquet.py
"""
import datetime as dt
from pathlib import Path

import polars as pl
import pyarrow as pa
import pyarrow.parquet as pq

out = Path(__file__).parent / "fixtures-parquet"
out.mkdir(exist_ok=True)
t0 = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
columns = {
    "x": [1.5, None, 3.5],
    "i": [1, None, 2**40],
    "s": ["a", None, "b"],
    "t": [t0, None, t0 + dt.timedelta(milliseconds=1500)],
    "b": [True, None, False],
}
pq.write_table(pa.table(columns), out / "pyarrow-snappy.parquet")
pl.DataFrame(columns).write_parquet(out / "polars-zstd.parquet")
