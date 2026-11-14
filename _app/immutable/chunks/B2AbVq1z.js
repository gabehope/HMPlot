const e=`import json

import hmplot as hm

# A globe whose basemap streams in as the view moves: OpenStreetMap vector tiles from VersaTiles,
# loaded at the zoom the view needs, with every earthquake of magnitude 4.5 or more in 2024 (USGS)
# on top, sized by magnitude and colored by depth.
with open("quakes-2024.json") as f:
    quakes = json.load(f)

# Shallow quakes are orange; the deepest, 700 km down in sinking slabs, dark violet.
depth_colors = hm.continuous(domain=[0, 700], colormap=["#ff9f1c", "#f3722c", "#d62828", "#7b2cbf", "#3c096c"])

with hm.Scene(gap=12) as scene:
    hm.Markdown("A globe whose map streams in as you move it. Drag to turn the globe and scroll to zoom, from the "
                "whole planet down to a city's streets: at each zoom, the vector tiles the view shows load from "
                "VersaTiles (OpenStreetMap data, no key) and draw as they arrive, finer tiles over coarser ones. On "
                "top, every earthquake of magnitude 4.5 or more in 2024 (6,397, from the USGS catalog), sized by "
                "magnitude and colored by depth, traces the plate boundaries.")
    with hm.Plot(data=quakes, coordinates="spherical", projection="orthographic", tone_mapping=0, height=560):
        # Without url=, VersaTiles' tiles, credited in the plot's corner. The requested tile (zoom 2, from
        # China to the Pacific) frames the globe; live tiles follow the view from there.
        hm.VectorTile(tile=[2, 3, 1])
        hm.Points(x="lon", y="lat", size="mag", size_scale=hm.continuous(domain=[4.5, 8], range=[2, 14]), fill="depth",
                  fill_scale=depth_colors, opacity=0.75, legend=False)
scene
`;export{e as default};
