"""Animation: animate() per channel, tween() in expressions, @time, and MP4 export.

Display `scene`, then run `step()` a few times to see keyed updates: each point moves in
log space to its new value, new rows rise from `enter`, departing rows sink to `exit`.
The satellites read @time and orbit continuously on fixed rows of their own.
`await plot.export_mp4(...)` renders the orbit to a video (needs ffmpeg on PATH);
`hm.export_mp4(plot, ...)` does it headlessly.
"""
import math

import hmplot as hm


def noise(i, k):
    value = math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return value - math.floor(value)


def rows(step):
    ids = [f"r{(i + step) % 15}" for i in range(12)]
    return {
        "id": ids,
        "x": [1 + i for i in range(12)],
        "y": [10 ** (1 + 2 * noise(i + step, 1)) for i in range(12)],
    }


# The satellites' own fixed rows: a @time channel has no transition (it would jump to each
# keyed update's new values), so on fixed rows @time is their only motion.
slots = {"x": list(range(1, 13)), "y": [3] * 12, "angle": list(range(12))}


table = hm.Table(rows(0), key="id")
with hm.Scene() as scene:
    with hm.Data(table):
        with hm.Plot(height=400, axes2d=True, x={"domain": [0, 13]},
                     y={"domain": [1, 2000], "transform": "log"}) as plot:
            hm.Points(x="x", y=hm.animate("y", duration=900, enter=1, exit=1500), size=7)
            with hm.Data(slots):
                t = hm.view.time / 700
                hm.Points(x=hm.col.x + 0.35 * hm.cos(t + hm.col.angle),
                                 y=hm.col.y * (1 + 0.25 * hm.sin(t + hm.col.angle)),
                                 size=3, fill="#cf8955")
        with hm.Plot(height=300, axes2d=True, x={"domain": [0, 13]}, y={"domain": [0, 250]}):
            # A tween inside a Calculate: the mark animates the doubled value in raw units.
            with hm.Calculate(doubled=hm.tween("y", duration=900) * 0.1):
                hm.Points(x="x", y="doubled", size=5, fill="#7b9865")

scene

state = {"step": 0}


def step():
    state["step"] += 1
    table.replace(rows(state["step"]))


async def video(path="orbit.mp4"):
    # Run after displaying the scene: `await video()`.
    return await plot.export_mp4(path, duration=4000, fps=30)


# Headless, without a notebook:
#   hm.export_mp4(plot, "orbit.mp4", duration=4000, fps=30)
