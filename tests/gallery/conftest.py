"""The defaults gallery's headless browser and report (TODO 136.17)."""

import html
import os
from pathlib import Path

import pytest

from hmplot import exporter

HERE = Path(__file__).parent
OUT = HERE / "out"
RESULTS = {}
LIBRARIES = ("vega-lite", "plot", "ggplot")


@pytest.fixture(scope="session")
def session():
    # No browser fails the run (the gallery is run on purpose), rather than skipping it green.
    session = exporter.ExportSession().__enter__()
    session._ensure_browser()
    yield session
    session.__exit__(None, None, None)


def pytest_sessionfinish(session):
    """out/index.html: each chart as drawn, its baseline, what its checks found, and the references (the same
    chart as Vega-Lite, Observable Plot and ggplot draw it; render_references.py)."""
    if not RESULTS:
        return
    OUT.mkdir(exist_ok=True)
    rows = []
    for name, found in sorted(RESULTS.items()):
        problems = "".join(f"<li>{html.escape(p)}</li>" for p in found["problems"]) or "<li>ok</li>"
        covers = ", ".join(found["covers"])
        references = "".join(f"<td><img src='../references/{library}/{name}.png'></td>"
                             if (HERE / "references" / library / f"{name}.png").exists() else "<td>none</td>"
                             for library in LIBRARIES)
        rows.append(f"<tr><th>{name}<br><small>{covers}</small></th><td><img src='{name}.png'></td>"
                    f"<td><img src='../baselines/{name}.png'></td>"
                    f"<td><ul>{problems}</ul></td>{references}</tr>")
    (OUT / "index.html").write_text(
        "<!doctype html><meta charset=utf-8><title>Defaults gallery</title>"
        "<style>body{font:14px system-ui}td,th{vertical-align:top;padding:8px;text-align:left}"
        "img{max-width:360px;border:1px solid #ddd}</style>"
        "<table><tr><th>chart</th><th>HMPlot</th><th>baseline</th><th>checks</th>"
        + "".join(f"<th>{library}</th>" for library in LIBRARIES) + "</tr>"
        + "".join(rows) + "</table>")
    print(f"\nDefaults gallery: {os.path.relpath(OUT / 'index.html')}")
