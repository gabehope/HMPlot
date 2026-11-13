"""VectorTile: a basemap from vector map tiles (docs/VECTOR-TILES.md).

The browser loads the tile named for a place and draws it as a styled map: water, parks,
buildings, roads, railways and place names. Python never sees the tiles. The map is live: as you
pan and zoom, the tiles the view shows load too. Without url=, they come from VersaTiles
(OpenStreetMap data, zoom 0 to 14, no key), credited in the plot and its exports; with your own
url=, credit its data with attribution=.

Offline, set OFFLINE = True: the four tiles in this repository's static/data/vector-tiles folder
are served on a local port with a CORS header, and live=False keeps to them.

At the end, `flyover` flies over the same place in 3D, with the tiles' buildings standing.
"""
import functools
import http.server
import threading
from pathlib import Path

import hmplot as hm

OFFLINE = False
TILES = Path(__file__).resolve().parents[2] / "static" / "data" / "vector-tiles"


class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # The notebook's origin may read these files (use a specific origin for real data).
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, *args):
        pass


if OFFLINE:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(CORSHandler, directory=TILES))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}" + "/{z}/{x}/{y}.mvt"
else:
    url = None  # the default tiles (hm.VectorTile's url)

# Hard-coded tiles ([zoom, column, row]) and one landmark each, in longitude/latitude.
places = {
    "Stockholm": ((14, 9014, 4818), (18.0716, 59.3268), "Royal Palace"),
    "Amsterdam": ((14, 8414, 5384), (4.8930, 52.3731), "Dam Square"),
    "Venice": ((13, 4376, 2932), (12.3397, 45.4341), "St Mark's Square"),
    "New York Harbor": ((13, 2411, 3080), (-74.0445, 40.6892), "Statue of Liberty"),
}
tile, landmark, label = places["Stockholm"]

with hm.Plot(coordinates="spherical", projection="mercator", tone_mapping=0, height=480) as plot:
    tiles = hm.VectorTile(url=url, tile=tile, live=not OFFLINE, styles={"water": {"fill": "#9ccbe0"}},
                          attribution="© OpenStreetMap contributors · VersaTiles" if OFFLINE else None)
    marker = hm.Points(position=[landmark], size=6, fill="#d6453d")
    name = hm.Text(position=[landmark], text=[label], dy=-16, size=13, color="#8f1f19")

# Clicked features: their source layer and tags (print() in a callback may not reach the output).
picked = []
tiles.on_click(lambda event: picked.append(event.feature["properties"]))


def show(place):
    """Move the map to another place: the browser loads its tile, keeping this one until then."""
    tile, landmark, label = places[place]
    with plot.batch_update():
        tiles.update(tile=tile)
        marker.update(position=[landmark])
        name.update(position=[landmark], text=[label])


# A 3D flyover over the same place (docs/VECTOR-TILES.md, "Live tiles under a 3D flyover"): the
# tiles lie on the ground in a local plane around the landmark (0.01 units a meter: a 100 m
# building stands 1 unit tall) and follow the camera, at a zoom from its height; the zoom-14
# tiles' buildings stand from their height tags. extrude_buildings=False lays them flat, and a
# drag released while moving glides on (flyover_momentum=False stops it). Offline, live=False
# keeps to the bundled tile, its buildings standing.
with hm.Plot(type="3d-y-up", camera_mode="flyover", height=480, tone_mapping=0,
             x={"domain": [-50, 50], "range": [-50, 50]}, y={"domain": [-50, 50], "range": [-50, 50]},
             z={"domain": [0, 30], "range": [0, 30]}, camera_position=[0, 3, 6], camera_target=[0, 0, 0],
             effects=[hm.effect("fog", near=10, far=45)]) as flyover:
    hm.VectorTile(url=url, tile=tile, live=not OFFLINE, origin=landmark, units_per_meter=0.01, plane="xz",
                  styles={"places": False}, extrude_buildings=True,
                  attribution="© OpenStreetMap contributors · VersaTiles" if OFFLINE else None)

# In a notebook:
#     show("Venice")
#     await plot.when_settled()             # waits for the tile
#     await plot.export_html("venice.html")  # embeds the tiles on screen: the file works offline
#     flyover                               # the 3D flyover above
plot
