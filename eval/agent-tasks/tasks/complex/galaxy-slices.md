+++
schema = 1
id = "galaxy-slices"
category = "maps and 3D"
data = ["stars"]
interaction = "rotate"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Galaxy", "Face-on view"]

[[checks]]
kind = "views"
min = 2

[[checks]]
kind = "interaction"
action = "rotate"
+++

`data/stars.parquet` has 200,000 stars of a simulated galaxy (x_kpc, y_kpc, z_kpc, age_gyr). Make two linked views. The first, titled "Galaxy", is a rotatable 3D point cloud of every star colored by age (young blue to old red) with a color bar, small points with additive blending so dense regions glow. The second, titled "Face-on view", is a 2D scatter of x against y. Dragging a rectangle on the face-on view selects stars: in the 3D view the selected stars keep their color and the others turn a faint grey. A slider for the maximum height above the disk (|z_kpc|, from 0.1 to the largest |z|) filters both views live.
