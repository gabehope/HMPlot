const e=`import numpy as np
import hmplot as hm

# 45,000 particles in the double gyre (Shadden, Lekien and Marsden, 2005), a standard model
# of mixing in ocean flows: two eddies side by side in a [0, 2] x [0, 1] basin, whose shared boundary
# wobbles back and forth by epsilon. Simulate moves every particle on the GPU, a midpoint step every
# 16 ms; a brush drops dye that the particles carry downstream.

# A grid of 300 x 150 particles over the basin.
column, row = np.meshgrid(np.arange(300), np.arange(150))
particles = {"x": ((column.ravel() + 0.5) / 150).astype(np.float32),
             "y": ((row.ravel() + 0.5) / 150).astype(np.float32)}

A, OMEGA, SPEED = 0.1, 2 * np.pi / 10, 3  # SPEED: units of flow time a second
t = hm.view.time / 1000 * SPEED
a = hm.input.epsilon * hm.sin(OMEGA * t)
b = 1 - 2 * a


def velocity(x, y):
    f = a * x * x + b * x
    return (-np.pi * A * hm.sin(np.pi * f) * hm.cos(np.pi * y),
            np.pi * A * hm.cos(np.pi * f) * hm.sin(np.pi * y) * (2 * a * x + b))


H = 0.016 * SPEED
u, v = velocity(hm.prev.x, hm.prev.y)
mu, mv = velocity(hm.prev.x + H / 2 * u, hm.prev.y + H / 2 * v)
# A particle inside the brush takes up dye (1), which then fades by 0.2% a step. With no brush,
# view.brushed is 1 everywhere, so any_brushed asks for a brush first.
dyed = hm.view.brushed & hm.view.any_brushed
update = {"x": hm.prev.x + H * mu, "y": hm.prev.y + H * mv,
          "dye": hm.where(dyed, 1, hm.prev.dye * 0.998), "start": hm.prev.start}
# Where each particle started, sky blue at the left wall to violet at the right (0 to 0.25), and
# dye in warm colors over it (0.5 to 1).
color = hm.where(hm.col.dye > 0.02, 0.5 + 0.5 * hm.col.dye, hm.col.start)
colors = hm.continuous(domain=[0, 1], colormap=["#2ec4f1", "#9b5de5", "#e8336d", "#ff8c32", "#ffd23f"])

with hm.Scene(gap=12) as scene:
    hm.Markdown("45,000 particles in the *double gyre*, a standard model of mixing in ocean flows: two "
                "eddies side by side, whose shared boundary wobbles back and forth. Each particle is colored by "
                "where it started, sky blue at the left wall to violet at the right; the wobble folds the two eddies "
                "into each other. **Shift-drag** a box to drop dye: every particle that passes through it turns "
                "gold and carries the dye downstream, stretched into thin filaments. Set the wobble to 0 and the "
                "eddies never mix. Escape or a click outside the box clears it.")
    with hm.Row(wrap=True, min_width=0):
        hm.Slider(name="epsilon", label="Wobble ε", min=0, max=0.5, step=0.01, value=0.25)
        hm.Button(name="reset", label="Start again")
    with hm.Theme(value=hm.themes.dark):
        with hm.Data(particles):
            with hm.Simulate(initial={"x": "x", "y": "y", "dye": 0, "start": hm.col.x / 8}, update=update,
                             reset=hm.input.reset, step=16):
                with hm.Plot(height=420, x={"domain": [0, 2]}, y={"domain": [0, 1]}):
                    # respond=False: the brush feeds the dye, and leaves the other particles lit.
                    hm.Points(x="x", y="y", fill=color, fill_scale=colors, size=2, opacity=0.9, brush=True,
                              respond=False, legend=False)
scene
`;export{e as default};
