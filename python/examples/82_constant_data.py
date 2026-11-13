"""GPU-generated rows for a simulation: no dummy table is uploaded."""
import hmplot as hm
import math

# Only these properties travel to the browser; no dummy NumPy table is uploaded.
initial = {"angle": hm.row() * (2 * math.pi / 256)}
update = {"angle": hm.prev.angle + (1 + hm.col.random) * hm.view.dt / 1000}
with hm.Scene() as scene:
    hm.Checkbox(name="running", label="Run simulation", value=False)
    with hm.Data(rows=256), hm.Calculate(columns={"random": hm.random(seed=0)}):
        with hm.Simulate(initial=initial, update=update, running=hm.input.running):
            with hm.Plot(height=360, x={"domain": [-2, 2]}, y={"domain": [-2, 2]}):
                hm.Points(x=(0.5 + hm.col.random) * hm.cos(hm.col.angle),
                          y=(0.5 + hm.col.random) * hm.sin(hm.col.angle),
                          fill="random", fill_scale=hm.continuous(domain=[0, 1]), size=5)
scene
