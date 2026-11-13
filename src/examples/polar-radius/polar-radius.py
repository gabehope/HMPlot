import numpy as np
import hmplot as hm

# Forty-nine points on a polar chart: x is the angle around the circle (degrees), y the radius out
# from the center. The radius rises and falls four times a turn; the slider moves where the angles
# start, so the whole curve turns.
turn = np.arange(49) * 7.5
data = {"turn": turn, "radius": 2 + 0.6 * np.cos(np.deg2rad(turn * 4))}

with hm.Scene(gap=12) as scene:
    hm.Markdown("Angles and radial values in an explicit polar chart: **x** is the angle (degrees around "
                "the circle), **y** the radius from the center, on a domain from 0 to 3. Each point's angle "
                "is its place on the turn plus the angle origin; move the slider to turn the whole curve.")
    with hm.Row(wrap=True, min_width=0):
        hm.Slider(name="origin", label="Angle origin", min=-180, max=180, step=15, value=-90)
    with hm.Data(data):
        with hm.Calculate(angle=hm.col.turn + hm.input.origin):
            with hm.Plot(coordinates="polar", base_radius=0, radial_scale=1, y={"domain": [0, 3]}, height=440):
                hm.Line(x="angle", y="radius", width=2, color="#547ba2")
                hm.Points(x="angle", y="radius", size=2.5, fill="#cf8955")
