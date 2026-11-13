+++
schema = 1
id = "map-points"
category = "maps and 3D"
data = ["earthquakes"]
source = "hmplot"
access = "provided"
tracks = ["python", "javascript"]

[[checks]]
kind = "text"
all = ["Earthquakes of 2024"]

[[checks]]
kind = "rows"
min = 20000
+++

`data/earthquakes.csv` has 20,000 earthquakes from 2024 (time, lon, lat, depth_km, magnitude). Draw them on a world map (land or country outlines, or a basemap, behind them; any projection), sized by magnitude and colored by depth, with a color legend for depth. Title the map "Earthquakes of 2024".
