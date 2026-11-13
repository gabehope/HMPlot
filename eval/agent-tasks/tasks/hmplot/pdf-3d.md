+++
schema = 1
id = "pdf-3d"
category = "export"
data = ["terrain"]
pdf = true
interaction = "rotate"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Terrain"]

[[checks]]
kind = "pdf"
pages = 1
width_mm = 120
text = ["Terrain"]
fonts_embedded = true

[[checks]]
kind = "interaction"
action = "rotate"
+++

`data/terrain.csv` has elevations on a 150 × 150 grid (x_km, y_km, elevation_m). Draw it as a 3D surface colored by elevation, with elevation up, the title "Terrain" and the axis titles "x (km)", "y (km)" and "elevation (m)". Save it as `output/figure.pdf`, 120 mm wide (any height), with selectable text, and also as the page `output/chart.html`, where it can be rotated with the mouse.
