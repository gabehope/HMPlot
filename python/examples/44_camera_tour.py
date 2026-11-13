"""A 3D camera tour: camera keywords for the start, set_camera for animated moves.

Display `scene` in a notebook first, then run the tour cell; each set_camera call eases
over the plot's animation duration and returns the resulting camera state.
"""
import asyncio
import math

import hmplot as hm

n = 400
points = [[30 * math.cos(i * 0.3), i * 0.15 - 30, 30 * math.sin(i * 0.3)] for i in range(n)]

with hm.Scene() as scene:
    plot = hm.Plot(type="3d-y-up", height=480, camera_position=[90, 60, 120], camera_fov=45,
                   animation_duration=1200)
    with plot:
        hm.Points(position=points, size=4, fill=[p[1] for p in points])

scene


async def tour():
    # Run after displaying the scene: `await tour()`.
    for position in ([0, 140, 1], [120, 0, 0], [0, 0, 120], [90, 60, 120]):
        state = await plot.set_camera(position=position, target=[0, 0, 0], animate=True)
        print([round(v, 1) for v in state["position"]])
        await asyncio.sleep(0.2)
