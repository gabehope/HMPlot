+++
schema = 1
id = "surface-3d"
category = "maps and 3D"
data = ["terrain"]
interaction = "rotate"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Terrain"]

[[checks]]
kind = "interaction"
action = "rotate"
+++

`data/terrain.csv` has elevations on a 150 × 150 grid (x_km, y_km, elevation_m). Draw it as a 3D surface colored by elevation, with elevation up, that the viewer can rotate with the mouse. Title the chart "Terrain".
