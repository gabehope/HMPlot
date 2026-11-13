"""Polar orbits, nested spherical planets, and two ways to place an inset.

Display ``scene`` in a notebook. The right plot has an orthographic root: drag
it to rotate the sphere. The blue points belong to a chart warped over the
surface; the orange points sit in a rigid tangent inset.
"""

import hmplot as hm


with hm.Scene() as scene:
    with hm.Row():
        with hm.Plot(type="2d", width=400, height=400):
            with hm.Frame(coordinates="polar", angle_unit="custom", angle_period=24,
                          x={"domain": [0, 24], "visible": False},
                          y={"domain": [0, 3], "visible": False}):
                hm.Points(position=[[0, 0]], size=14, fill="#e8b84e")
                for angle, radius, size, color in (
                    (3, 0.85, 38, "#a5aaa9"),
                    (6, 1.8, 60, "#4c88cb"),
                    (14, 2.5, 48, "#be6b50"),
                ):
                    with hm.Frame(coordinates="spherical", projection="orthographic",
                                  projection_center=[0, 0], radial_scale=0,
                                  placement={"anchor": [angle, radius], "size": [size, size]},
                                  x={"domain": [-180, 180], "visible": False},
                                  y={"domain": [-90, 90], "visible": False}):
                        hm.Points(position=[[0, 0]], size=size * 0.275, fill=color)
                        hm.Points(position=[[-38, 30], [38, -20]],
                                         size=2.5, fill="#f7f0dd")

        with hm.Plot(type="2d", width=400, height=400):
            with hm.Frame(coordinates="spherical", projection="orthographic",
                          projection_center=[20, 0],
                          x={"domain": [-180, 180], "visible": False},
                          y={"domain": [-90, 90], "visible": False}):
                # Parent-data ranges bend the child with the sphere.
                with hm.Frame(coordinates="cartesian",
                              x={"domain": [-1, 1], "range": [0, 40], "visible": False},
                              y={"domain": [-1, 1], "range": [-20, 20], "visible": False}):
                    hm.Points(position=[[-1, -1], [1, -1], [-1, 1], [1, 1]],
                                     size=8, fill="#3176b2")
                # A rigid placement uses local east/north at its anchor.
                with hm.Frame(coordinates="cartesian",
                              placement={"anchor": [-35, 0], "size": [66, 66],
                                         "orientation": "tangent"},
                              x={"domain": [-1, 1], "visible": False},
                              y={"domain": [-1, 1], "visible": False}):
                    hm.Points(position=[[-1, 0], [0, 0], [1, 0], [0, 1]],
                                     size=7, fill="#d77b45")

scene
