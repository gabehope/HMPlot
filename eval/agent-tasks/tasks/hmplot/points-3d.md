+++
schema = 1
id = "points-3d"
category = "maps and 3D"
data = ["stars"]
interaction = "rotate"
source = "hmplot"
access = "provided"
tracks = ["python", "javascript"]

[[checks]]
kind = "text"
all = ["A simulated galaxy"]

[[checks]]
kind = "rows"
min = 200000

[[checks]]
kind = "interaction"
action = "rotate"
+++

`data/stars.parquet` has 200,000 stars of a simulated galaxy (x_kpc, y_kpc, z_kpc, age_gyr). Draw them as a 3D point cloud colored by age, which the viewer can rotate and zoom with the mouse. Title the chart "A simulated galaxy".
