import json

import numpy as np
import hmplot as hm

# Every earthquake of magnitude 4.5 or more in 2024 (USGS), placed at its true depth inside a
# see-through globe: the slabs where plates sink show as sheets of deep (violet) quakes. The
# slider exaggerates the depths; shift-drag on the map or the timeline to brush.
with open("quakes-2024.json") as f:
    quakes = json.load(f)
with open("countries.json") as f:
    countries = json.load(f)

# Magnitudes come rounded to 0.1, which draws the timeline as stripes: spread each by a fixed
# pseudo-random amount within 0.05, for display only.
index = np.arange(len(quakes["mag"]))
noise = np.sin(index * 12.9898) * 43758.5453
quakes["jittered"] = np.array(quakes["mag"]) + 0.1 * (noise - np.floor(noise) - 0.5)
# Shallow quakes are hot yellow; the deepest, 700 km down, violet.
depth_colors = hm.continuous(domain=[0, 700], colormap=["#ffe066", "#ff7b39", "#e0245e", "#8e2de2", "#4361ee"])
magnitudes = [round(4.5 + i * 0.1, 1) for i in range(41)]
# A spherical position is [longitude, latitude, offset], at radius 1 + offset: the depth as a
# fraction of Earth's radius, times the slider's exaggeration. Computed on the GPU, so a new value
# reruns the globe's positions only.
radius = hm.col.depth * hm.input.exaggeration * (-1 / 6371)

# Shared side margins align the detail panels in both language versions.
panel_margins = {"axis_margin_left": 64, "axis_margin_right": 14}

with hm.Scene(gap=12) as figure:
    hm.Markdown("Every magnitude 4.5+ earthquake of 2024 (6,397 of them, from the USGS catalog), placed at its "
                "true depth inside a see-through Earth. Orbit the globe and look under the western Pacific: the "
                "deep quakes trace slabs of ocean floor sinking into the mantle. Shift-drag on the map or the "
                "timeline to brush; the brushes combine, the globe keeps only the matching quakes lit, and the "
                "histogram counts them. On its log scale, counts fall on the Gutenberg–Richter line: every step "
                "of one magnitude is about ten times rarer.")
    with hm.Row(wrap=True, min_width=0):
        hm.Slider(name="exaggeration", label="Depth exaggeration", min=1, max=6, step=0.1, value=4, format=".1f")
    with hm.Theme(value=hm.themes.dark):
        with hm.Data(quakes):
            # Three fifths and two fifths, 12 px apart; one column once the side would be narrower
            # than 286 px.
            with hm.Row(widths=[3, 2], wrap=True, min_width=286, gap=12):
                # A fixed offset domain keeps the slider from changing the globe's extent. The camera
                # looks at the Pacific, where the Ring of Fire and the deep slabs are.
                with hm.Plot(coordinates="spherical", type="3d-y-up", height=594, globe_background=False,
                             z={"domain": [-0.7, 0]}, camera_position=[1.1, 0.9, -3.0]):
                    hm.GeoJSON(fill=None, data=countries, color="#5b6b82", width=1)
                    with hm.Calculate(columns={"radius": radius}):
                        hm.Points(x="lon", y="lat", z="radius", fill="depth", fill_scale=depth_colors, size=1.5,
                                  respond="brushed", legend=False)
                with hm.Column(gap=12):
                    with hm.Plot(**panel_margins, height=230, axes2d=True, x={"domain": [-180, 180], "label": "longitude"},
                                 y={"domain": [-90, 90], "label": "latitude"}):
                        hm.Points(x="lon", y="lat", fill="depth", fill_scale=depth_colors, size=1, brush=True,
                                  respond="brushed", legend=False)
                    with hm.Plot(**panel_margins, height=170, axes2d=True, x={"domain": [1, 13], "label": "month of 2024"},
                                 y={"domain": [4.4, 8.5], "label": "magnitude (jittered)"}):
                        hm.Points(x="month", y="jittered", fill="depth", fill_scale=depth_colors, size=1,
                                  brush=True, respond="brushed", legend=False)
                    with hm.Plot(**panel_margins, height=170, axes2d=True, x={"domain": [4.5, 8.5], "label": "magnitude"},
                                 y={"domain": [0.8, 3000], "transform": "log", "label": "earthquakes"}):
                        # Dim: every quake. Bright: the brushed ones (all of them with no brush).
                        with hm.stats.Bin(x="mag", bins=magnitudes):
                            hm.Rect(x0="x0", x1="x1", y0=0.8, y1="count", fill="#3b3363", legend=False)
                        with hm.stats.Bin(x="mag", bins=magnitudes, weight="@brushed"):
                            hm.Rect(x0="x0", x1="x1", y0=0.8, y1="count", fill="#ff7b39", legend=False)
    hm.Markdown("Data: U.S. Geological Survey earthquake catalog (public domain). Borders: Natural Earth "
                "(public domain).", font_size=12)
