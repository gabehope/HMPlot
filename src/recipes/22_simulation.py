"""A simulation stepped on the GPU
Simulate keeps state columns on the GPU: initial= sets them, update= computes each step from hm.prev and hm.view.dt."""
import numpy as np
import hmplot as hm

n = 2000
rng = np.random.default_rng(8)
data = {"radius": rng.uniform(0.5, 4, n), "speed": rng.uniform(0.2, 1.5, n), "phase": rng.uniform(0, 6.28, n)}
angle = hm.prev.angle + hm.col.speed * hm.view.dt / 1000

with hm.Data(data) as chart:
    hm.Checkbox(name="running", label="Run", value=True)
    with hm.Simulate(initial={"angle": hm.col.phase}, update={"angle": angle}, running=hm.input.running):
        with hm.Plot(height=360, x={"domain": [-4.5, 4.5]}, y={"domain": [-4.5, 4.5]}):
            hm.Points(x=hm.col.radius * hm.cos(hm.col.angle), y=hm.col.radius * hm.sin(hm.col.angle), fill="speed")
chart
