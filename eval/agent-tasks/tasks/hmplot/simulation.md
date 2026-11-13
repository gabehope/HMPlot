+++
schema = 1
id = "simulation"
category = "animation and simulation"
data = []
interaction = "animate"
source = "hmplot"
access = "provided"
tracks = ["python"]

[[checks]]
kind = "text"
all = ["Particles in a cellular flow"]

[[checks]]
kind = "input"
any = ["button", "checkbox"]

[[checks]]
kind = "interaction"
action = "animate"
+++

Simulate 5,000 particles in the unit square moving with the velocity field u = -sin(πx)·cos(πy), v = cos(πx)·sin(πy) (a cellular flow). The particles start at random positions and are advected continuously in the browser (for example a small time step every animation frame), indefinitely: not a precomputed clip. Draw each particle as a point colored by its speed, with both axes fixed to [0, 1], and add a "Pause" control (a button or a checkbox) that stops and resumes the motion. Title the chart "Particles in a cellular flow".
