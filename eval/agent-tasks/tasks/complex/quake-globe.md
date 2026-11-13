+++
schema = 1
id = "quake-globe"
category = "maps and 3D"
data = ["earthquakes"]
interaction = "slider"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Earthquakes by depth", "Depth (km)"]

[[checks]]
kind = "input"
any = ["range"]

[[checks]]
kind = "interaction"
action = "slider"
+++

`data/earthquakes.csv` has 20,000 earthquakes in 2024 (time, lon, lat, depth_km, magnitude). Show them on a rotatable 3D globe (orthographic, drag to rotate) with land outlines if your library has them built in, each quake a point sized by magnitude and colored by depth with a color bar. Add a time window control: a slider for the window's end date and a play button that sweeps a 30-day window through the year, so only quakes in the window are drawn and the newest ones in the window are brightest. Beside the globe, show a histogram of depth for the quakes in the current window that updates with it, titled "Depth (km)". Title the globe "Earthquakes by depth".
