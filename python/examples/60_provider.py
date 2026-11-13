"""A Provider: data the browser loads from a URL, following params (docs/PROVIDERS.md).

The browser fetches one year of USGS earthquakes (magnitude 4.5+) at a time; Python never sees
the rows. Assigning `quakes.params` loads another year, and the plots keep the last one until it
arrives. The files come from this repository's static/data folder, served here on a local port
with a CORS header: the notebook page and the data have different origins, as with most APIs.
"""
import functools
import http.server
import threading
from pathlib import Path

import hmplot as hm

DATA = Path(__file__).resolve().parents[2] / "static" / "data"


class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # The notebook's origin may read these files (use a specific origin for real data).
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(CORSHandler, directory=DATA))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_address[1]}"

colors = hm.continuous(domain=[0, 700], colormap=["#ffe066", "#ff7b39", "#e0245e", "#8e2de2", "#4361ee"])
edges = [round(4.5 + i * 0.1, 1) for i in range(41)]

with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=0):
        hm.Button(name="reload", label="Refresh")  # each press loads the same year again
    with hm.Provider(url=base + "/earthquakes/by-year/{year}.csv", format="csv", params={"year": 2024},
                     refresh=hm.input.reload) as quakes:
        with hm.Row():
            with hm.Plot(height=320, axes2d=True, x={"domain": [-180, 180], "label": "longitude"},
                         y={"domain": [-90, 90], "label": "latitude"}):
                hm.Points(x="lon", y="lat", fill="depth", fill_scale=colors, size=1.5)
            with hm.Plot(height=320, axes2d=True, x={"domain": [4.5, 8.5], "label": "magnitude"},
                         y={"domain": [0.8, 5000], "transform": "log", "label": "earthquakes"}):
                with hm.stats.Bin(x="mag", bins=edges):
                    hm.Rect(x0="x0", x1="x1", y0=0.8, y1="count", fill="#e0245e")


# Each load: rows and milliseconds (print() in a callback may not reach the notebook output).
loads = []
quakes.on_event("load", lambda event: loads.append((event.rows, round(event.ms))))


# In a notebook:
#     quakes.params = {"year": 2020}     # the browser loads 2020; 2024 stays until it arrives
#     await scene.when_settled()         # waits for that load
#     await quakes.refresh()             # the same year again
#     await scene.export_html("quakes.html")   # embeds the year on screen: the file works offline
scene
