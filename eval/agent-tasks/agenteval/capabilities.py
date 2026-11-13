"""What each baseline can export, confirmed with a tiny figure (run in the baselines environment by
setup_env.py; the last line printed is JSON). Each library's attempt runs in its own process with
a time limit, so one that hangs (a missing browser for Kaleido) is recorded as such."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

# Each snippet writes out.html and/or out.pdf in the current folder, or raises. A library with no
# such export says so by raising NotImplementedError with what it has instead.
ATTEMPTS = {
    "matplotlib": {
        "pdf": "import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt; plt.plot([1,2,3],[3,1,2]); plt.title('t'); plt.savefig('out.pdf')",
        "html": "raise NotImplementedError('no HTML export: an image (PNG or SVG) embedded in a page')",
    },
    "plotly": {
        "html": "import plotly.express as px; px.scatter(x=[1,2,3], y=[3,1,2]).write_html('out.html')",
        "pdf": "import plotly.express as px; px.scatter(x=[1,2,3], y=[3,1,2]).write_image('out.pdf')",
    },
    "altair": {
        "html": "import altair as alt, pandas as pd; alt.Chart(pd.DataFrame({'x':[1,2,3],'y':[3,1,2]})).mark_point().encode(x='x', y='y').save('out.html')",
        "pdf": "import altair as alt, pandas as pd; alt.Chart(pd.DataFrame({'x':[1,2,3],'y':[3,1,2]})).mark_point().encode(x='x', y='y').save('out.pdf')",
    },
    "holoviews (bokeh)": {
        "html": "import holoviews as hv; hv.extension('bokeh'); hv.save(hv.Scatter([(1,3),(2,1),(3,2)]), 'out.html')",
        "pdf": "import holoviews as hv; hv.extension('bokeh'); hv.save(hv.Scatter([(1,3),(2,1),(3,2)]), 'out.pdf')",
    },
    "holoviews (matplotlib)": {
        "pdf": "import holoviews as hv; hv.extension('matplotlib'); hv.save(hv.Scatter([(1,3),(2,1),(3,2)]), 'out.pdf', backend='matplotlib')",
    },
    "bokeh": {
        "html": "from bokeh.plotting import figure, save, output_file; p = figure(); p.scatter([1,2,3],[3,1,2]); output_file('out.html'); save(p)",
        "pdf": "import bokeh.io as io; assert not hasattr(io, 'export_pdf'), 'unexpected'; raise NotImplementedError('no PDF export: export_png and export_svg (with Selenium) only')",
    },
    "panel": {
        "html": "import panel as pn; pn.Column('# t', pn.widgets.FloatSlider(start=0, end=1)).save('out.html', embed=True)",
    },
    "pydeck": {
        "html": "import pydeck as pdk; pdk.Deck(layers=[pdk.Layer('ScatterplotLayer', data=[{'p':[0,0]}], get_position='p', get_radius=1000)], map_style=None).to_html('out.html', open_browser=False)",
        "pdf": "import pydeck as pdk; d = pdk.Deck(); assert not any('pdf' in n for n in dir(d)); raise NotImplementedError('no PDF export (to_html and to_json only)')",
    },
    "lonboard": {
        "html": ("import geopandas as gpd, shapely; from lonboard import viz; "
                 "m = viz(gpd.GeoDataFrame(geometry=[shapely.Point(0, 0), shapely.Point(1, 1)], crs='EPSG:4326')); m.to_html('out.html')"),
        "pdf": "import lonboard; m = lonboard.Map([]); assert not any('pdf' in n for n in dir(m)); raise NotImplementedError('no PDF export (to_html only)')",
    },
    "fastplotlib": {
        "html": "import fastplotlib as fpl; assert not any('html' in n for n in dir(fpl.Figure)); raise NotImplementedError('no HTML export: a desktop window, a Jupyter canvas, or a screenshot')",
        "pdf": "import fastplotlib as fpl; assert not any('pdf' in n for n in dir(fpl.Figure)); raise NotImplementedError('no PDF export')",
    },
    "mosaic-widget": {
        "html": "import mosaic_widget; assert not any('html' in n.lower() for n in dir(mosaic_widget.MosaicWidget)); raise NotImplementedError('no HTML export from the widget; a page that loads Mosaic from a CDN works')",
        "pdf": "raise NotImplementedError('no PDF export')",
    },
    "pyvista": {
        "html": "import pyvista as pv; pv.OFF_SCREEN = True; p = pv.Plotter(off_screen=True); p.add_mesh(pv.Sphere()); p.export_html('out.html')",
        "pdf": "import pyvista as pv; pv.OFF_SCREEN = True; p = pv.Plotter(off_screen=True); p.add_mesh(pv.Sphere()); p.save_graphic('out.pdf')",
    },
}


def attempt(code: str, kind: str, timeout: float = 180) -> dict:
    with tempfile.TemporaryDirectory() as folder:
        try:
            done = subprocess.run([sys.executable, "-c", code], cwd=folder, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": f"timed out after {timeout:.0f} s"}
        out = Path(folder) / f"out.{kind}"
        if done.returncode == 0 and out.exists() and out.stat().st_size > 0:
            return {"ok": True, "bytes": out.stat().st_size}
        lines = [line for line in done.stderr.strip().splitlines() if line.strip()]
        return {"ok": False, "error": lines[-1][:400] if lines else f"exit {done.returncode}, no file"}


def main():
    results = {}
    for library, kinds in ATTEMPTS.items():
        results[library] = {kind: attempt(code, kind) for kind, code in kinds.items()}
        print(library, results[library], file=sys.stderr, flush=True)
    print(json.dumps(results))


if __name__ == "__main__":
    main()
