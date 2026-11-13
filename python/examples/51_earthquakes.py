"""Earthquakes beneath the globe: ten years of the USGS catalog at their true depth.

Every magnitude 4.5+ earthquake from 2015 to 2024 (72,956 events), placed inside a see-through
Earth: deep quakes trace slabs of ocean floor sinking into the mantle under the western Pacific
and South America. Shift-drag on the map or the timeline to brush; brushes on different columns
combine, the globe keeps only the matching quakes lit, and the log-scale histogram counts them.
The counts fall on the Gutenberg-Richter line: each magnitude step is about ten times rarer.
Call `set_exaggeration(6)` to push the deep quakes further toward the center.

Data: U.S. Geological Survey earthquake catalog (public domain); borders: Natural Earth (public
domain). Run from the repository, the bundled copies are used; elsewhere the catalog is
downloaded from USGS (about 2.4 MB) and cached next to the notebook.
"""
import csv
import io
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import hmplot as hm

CATALOG = "static/data/earthquakes/usgs-m45-2015-2024.csv"
BORDERS = "static/data/geo/countries.json"
USGS = ("https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&minmagnitude=4.5"
        "&orderby=time-asc&starttime={year}-01-01&endtime={next}-01-01")


def find(relative):
    """The repository copy of a data file, searching up from the working directory."""
    for base in (Path.cwd(), *Path.cwd().parents):
        if (base / relative).exists():
            return base / relative
    return None


def download_catalog(path):
    """Build the same CSV as scripts/build-earthquakes.py: year, lat, lon, depth, mag."""
    rows = []
    for year in range(2015, 2025):
        with urllib.request.urlopen(USGS.format(year=year, next=year + 1), timeout=120) as response:
            events = csv.DictReader(io.StringIO(response.read().decode("utf-8")))
            for e in events:
                if e["type"] != "earthquake" or not (e["depth"] and e["mag"]):
                    continue
                t = datetime.fromisoformat(e["time"].replace("Z", "+00:00"))
                start = datetime(t.year, 1, 1, tzinfo=timezone.utc)
                span = (datetime(t.year + 1, 1, 1, tzinfo=timezone.utc) - start).total_seconds()
                rows.append((t.year + (t - start).total_seconds() / span, float(e["latitude"]),
                             float(e["longitude"]), float(e["depth"]), float(e["mag"])))
    rows.sort()
    with open(path, "w") as f:
        f.write("year,lat,lon,depth,mag\n")
        f.writelines(f"{y:.4f},{la:.2f},{lo:.2f},{d:.1f},{m:.1f}\n" for y, la, lo, d, m in rows)
    return path


catalog = find(CATALOG) or (Path("usgs-m45-2015-2024.csv") if Path("usgs-m45-2015-2024.csv").exists()
                            else download_catalog(Path("usgs-m45-2015-2024.csv")))
year, lat, lon, depth, mag = np.loadtxt(catalog, delimiter=",", skiprows=1, dtype=np.float32).T
borders_path = find(BORDERS)
borders = json.loads(borders_path.read_text()) if borders_path else None

# Magnitudes come rounded to 0.1, which draws the timeline as stripes; spread each one by a
# fixed pseudo-random amount within +-0.05 for display only.
noise = np.sin(np.arange(len(mag)) * 12.9898) * 43758.5453
jittered = (mag + 0.1 * (noise - np.floor(noise) - 0.5)).astype(np.float32)


def radius(exaggeration):
    # Spherical positions are [longitude, latitude, offset] with radius = 1 + offset: depth as a
    # fraction of Earth's radius, exaggerated so the slabs show. Computed on the GPU by a
    # Calculate on the globe, so a new exaggeration reruns the globe only.
    return {"radius": hm.col.depth * (-exaggeration / 6371)}


quakes = hm.Table({"year": year, "lat": lat, "lon": lon, "depth": depth, "mag": mag, "jittered": jittered})
# Shallow quakes are hot yellow; the deepest, 700 km down in sinking slabs, are violet.
depth_colors = hm.continuous(domain=[0, 700], colormap=["#ffe066", "#ff7b39", "#e0245e", "#8e2de2", "#4361ee"])
magnitude_edges = [round(4.5 + i * 0.1, 1) for i in range(41)]

with hm.Scene() as scene:
    with hm.Theme(value=hm.themes.dark):
        with hm.Data(quakes):
            with hm.Row(wrap=True):
                # A fixed offset domain keeps exaggeration updates from changing the globe's
                # compiled extent; the camera looks at the Pacific (160 degrees east).
                with hm.Plot(coordinates="spherical", type="3d-y-up", height=560, globe_background=False,
                             z={"domain": [-0.7, 0]}, camera_position=[1.1, 0.9, -3.0]):
                    if borders:
                        hm.GeoJSON(fill=None, data=borders, color="#5b6b82", width=1)
                    with hm.Calculate(columns=radius(4)) as globe_radius:
                        hm.Points(x="lon", y="lat", z="radius", fill="depth", fill_scale=depth_colors,
                                         size=1.5, respond="brushed", label="Earthquakes", legend=False)
                with hm.Column():
                    with hm.Plot(height=230, axes2d=True, x={"domain": [-180, 180], "label": "longitude"},
                                 y={"domain": [-90, 90], "label": "latitude"}):
                        hm.Points(x="lon", y="lat", fill="depth", fill_scale=depth_colors, size=1,
                                         brush=True, respond="brushed", label="Map", legend=False)
                    with hm.Plot(height=170, axes2d=True, x={"domain": [2015, 2025], "label": "year"},
                                 y={"domain": [4.4, 8.5], "label": "magnitude (jittered)"}):
                        hm.Points(x="year", y="jittered", fill="depth", fill_scale=depth_colors,
                                         size=1, brush=True, respond="brushed", label="Timeline",
                                         legend=False)
                    with hm.Plot(height=170, axes2d=True, x={"domain": [4.5, 8.5], "label": "magnitude"},
                                 y={"domain": [0.8, 30000], "transform": "log", "label": "earthquakes"}):
                        # Dim: every quake. Bright: the brushed ones (all of them with no brush).
                        with hm.stats.Bin(x="mag", bins=magnitude_edges):
                            hm.Rect(x0="x0", x1="x1", y0=0.8, y1="count", fill="#3b3363", legend=False)
                        with hm.stats.Bin(x="mag", bins=magnitude_edges, weight="@brushed"):
                            hm.Rect(x0="x0", x1="x1", y0=0.8, y1="count", fill="#ff7b39", legend=False)

scene


def set_exaggeration(factor):
    """Move the quakes deeper (or shallower) on the globe; only the globe's Calculate reruns."""
    globe_radius.update(columns=radius(factor))
