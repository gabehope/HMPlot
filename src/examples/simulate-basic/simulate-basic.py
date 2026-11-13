import hmplot as hm

radius, speed = hm.row() + 1, 3 - hm.row()
# Each step, a row's angle moves on by its speed (radians per second) times the step.
angle = hm.prev.angle + speed * hm.view.dt / 1000
with hm.Data(rows=3) as table:
    hm.Checkbox(name="running", label="Run simulation", value=False)
    with hm.Simulate(initial={"angle": 0}, update={"angle": angle}, running=hm.input.running):
        with hm.Plot(height=300, axes2d=True, x={"domain": [-4, 4]}, y={"domain": [-4, 4]}):
            hm.Points(x=radius * hm.cos(hm.col.angle), y=radius * hm.sin(hm.col.angle))
table
