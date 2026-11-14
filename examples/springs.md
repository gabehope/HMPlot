# Springs

Simulate steps a ring of damped springs every 16 ms: Sliders set the stiffness and damping, Run pauses, Kick starts again, and a clicked point's spring pulls it out.

## Python

```python
import math
import hmplot as hm

# A ring of points, each on a spring to its place in the ring; a clicked point's place moves out.
count = 48
angles = [i / count * 2 * math.pi for i in range(count)]
ring = {
    "id": list(range(count)),
    "rx": [math.cos(a) for a in angles], "ry": [math.sin(a) for a in angles],
    "x0": [0.3 * math.cos(a + 1.2) for a in angles], "y0": [0.3 * math.sin(a + 1.2) for a in angles],
}
seconds = hm.view.dt / 1000
# Each axis's velocity after this step: the spring's pull toward the point's place, less damping.
# Every update reads the previous step (hm.prev), so x repeats the update of vx.
def velocity(axis):
    place = hm.where("@selected", hm.col[f"r{axis}"] * 1.6, hm.col[f"r{axis}"])
    pull = hm.input.stiffness * (place - hm.prev[axis]) - hm.input.damping * hm.prev[f"v{axis}"]
    return hm.prev[f"v{axis}"] + pull * seconds

with hm.Scene() as scene:
    with hm.Controls():
        hm.Slider(name="stiffness", min=5, max=120, step=1, value=40, label="Stiffness")
        hm.Slider(name="damping", min=0, max=12, step=0.5, value=3, label="Damping")
        hm.Checkbox(name="run", value=True, label="Run")
        hm.Button(name="kick", label="Kick")
    with hm.Data(ring, key="id"):
        # Steps every 16 ms of its clock; settles when no position moves 0.0005 in 30 steps.
        with hm.Simulate(initial={"x": "x0", "y": "y0", "vx": 0, "vy": 0},
                         update={"vx": velocity("x"), "vy": velocity("y"),
                                 "x": hm.prev.x + velocity("x") * seconds, "y": hm.prev.y + velocity("y") * seconds},
                         step=16, running=hm.input.run, reset=hm.input.kick,
                         stop={"tolerance": 0.0005, "every": 30, "columns": ["x", "y"]}) as springs:
            with hm.Plot(axes2d=True, x={"domain": [-2, 2]}, y={"domain": [-2, 2]}):
                hm.Points(x="x", y="y", size=hm.where("@selected", 12, 8), fill="#547ba2", select=True)
scene
```

## Svelte

```svelte
<InputContext>
  <Slider name="stiffness" min={5} max={120} value={40} /> <Checkbox name="run" value={true} /> <Button name="kick" />
  <Data value={ring} key="id">
    <Simulate initial={{ x: "x0", vx: 0 }} update={{ vx: velocity, x: add(prev("x"), multiply(velocity, divide("@dt", 1000))) }}
      running={input("run")} reset={input("kick")} stop={{ tolerance: 0.0005 }}>
      <Plot><Points x="x" y="y" select /></Plot>
    </Simulate>
  </Data>
</InputContext>
```
