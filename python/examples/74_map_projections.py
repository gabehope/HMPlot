"""World map projections with curved outlines: equal-earth, natural-earth, albers and albers-usa.

The cylindrical maps (equirectangular, mercator, equal-area) repeat across the antimeridian;
these map longitude and latitude jointly into one curved outline around ``projection_center``,
cut at its seam (the center longitude + 180°), with a graticule and outline instead of edge
axes. ``albers`` is a conic equal-area map with standard ``parallels`` (default [29.5, 45.5], as
d3.geoAlbers); ``albers-usa`` draws the lower 48 with Alaska and Hawaii as insets. A click
reports the longitude and latitude under the pointer.

Run from the repository root, where ``static/data/geo/countries.json`` (Natural Earth, public
domain) lives.
"""
import json
from pathlib import Path

import hmplot as hm

countries = json.loads(Path("static/data/geo/countries.json").read_text())

with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=420):
        with hm.Plot(coordinates="spherical", projection="equal-earth", projection_center=[150, 0],
                     type="2d", height=320, axes2d=True):
            hm.GeoJSON(data=countries, fill="continent")
        with hm.Plot(coordinates="spherical", projection="albers", projection_center=[-96, 38.7],
                     parallels=[29.5, 45.5], type="2d", height=320, axes2d=True):
            hm.GeoJSON(data=countries, fill="continent")
        with hm.Plot(coordinates="spherical", projection="albers-usa", type="2d", height=320):
            hm.GeoJSON(data=countries, fill="#9fb8cf")
scene
