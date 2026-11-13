"""numpy oracle for tests/unit/reductions.test.js (12C C1).

Writes fixtures-reductions10k.json next to this file. The 10,000 rows are not stored: the
test rebuilds them from the same Park-Miller sequence (exact in JavaScript doubles and in
Python integers), so the fixture holds only the seed and numpy's answers.

    python tests/unit/fixtures-reductions10k.py
"""
import json
from pathlib import Path

import numpy as np

SEED, ROWS, GROUPS = 20260923, 10_000, ["a", "b", "c", "d"]


def rows():
    state = SEED
    def uniform():
        nonlocal state
        state = state * 16807 % 2147483647
        return state / 2147483647
    x, k, g = [], [], []
    for _ in range(ROWS):
        # Irwin-Hall(3), single precision like the GPU column; about 5% missing.
        value = float(np.float32((uniform() + uniform() + uniform() - 1.5) * 4))
        missing = uniform() < 0.05
        x.append(float("nan") if missing else value)
        # A small integer column for mode: floor(x), whose -1 and 0 are about equally common,
        # so the groups' modes differ and ties exercise the smallest-value rule.
        k.append(float("nan") if missing else float(np.floor(value)))
        g.append(GROUPS[int(uniform() * 4)])
    return np.array(x), np.array(k), np.array(g)


def mode(values):
    values = values[~np.isnan(values)]
    if not values.size:
        return float("nan")
    unique, counts = np.unique(values, return_counts=True)
    return float(unique[np.argmax(counts)])  # np.unique sorts, so ties give the smallest


def summary(x, k):
    present = x[~np.isnan(x)]
    return {
        "mean": float(np.nanmean(x)), "sum": float(np.nansum(x)), "count": int(present.size),
        "min": float(np.nanmin(x)), "max": float(np.nanmax(x)),
        "std": float(np.nanstd(x)), "variance": float(np.nanvar(x)),
        "median": float(np.nanmedian(x)), "mode": mode(k),
        "first": float(present[0]), "last": float(present[-1]),
    }


x, k, g = rows()
fixture = {
    "seed": SEED, "rows": ROWS, "groups": GROUPS,
    "numpy": np.__version__,
    "all": summary(x, k),
    "by": {group: summary(x[g == group], k[g == group]) for group in GROUPS},
    "firstValues": [None if np.isnan(v) else v for v in x[:5].tolist()],
}
Path(__file__).with_name("fixtures-reductions10k.json").write_text(json.dumps(fixture, indent=1) + "\n")
