"""Python snapshots for tests/browser/python-color.spec.js (rendered through /test/notebook).

Writes static/test/notebook-7c-color.json (plots "theme", "uint8", "rows", "image" and "solid")
and static/test/notebook-42_rgb_and_colormaps.json (from python/examples/42_rgb_and_colormaps.py).
Run: python scripts/generate-color-fixtures.py
"""
from pathlib import Path
import json, base64, sys, runpy
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "python"))
import numpy as np
import hmplot as hm
assert Path(hm.__file__).resolve().is_relative_to(root), hm.__file__

def write(scene, name):
    state, columns = scene._snapshot()
    data = {"metadata": {k: c.descriptor() for k, c in columns.items()}, "state": state,
            "buffers": {k: base64.b64encode(c.payload).decode() for k, c in columns.items()}}
    (root / "static/test" / f"notebook-{name}.json").write_text(json.dumps(data))
    print(name, "OK")

ns = runpy.run_path(str(root / "python/examples/42_rgb_and_colormaps.py"))
write(ns["scene"], "42_rgb_and_colormaps")

x = np.array([10, 30, 50, 70, 90]); y = np.full(5, 50)
common = dict(width=360, height=140, responsive=False, axes2d=True, tone_mapping=0, x={"domain": [0, 100]}, y={"domain": [0, 100]})
values = {"x": x, "y": y, "value": np.array([0, 0.25, 0.5, 0.75, 1.0])}
table = {"x": x, "y": y, "r": np.array([255, 0, 0, 255, 0], dtype=np.uint8),
         "g": np.array([0, 255, 0, 255, 0], dtype=np.uint8), "b": np.array([0, 0, 255, 0, 0], dtype=np.uint8)}
rows = np.array([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 0, 0]], dtype=np.uint8)
with hm.Scene() as scene:
    # 7C A7: a continuous scale without a colormap inherits the theme's default.
    with hm.Theme(value=hm.create_theme(colormap="Magma")):
        with hm.Plot(name="theme", data=values, **common):
            hm.Points(x="x", y="y", fill="value", fill_scale=hm.continuous(domain=[0, 1]), size=12)
    # 7C A1: uint8 columns through hm.rgb, a uint8 N x 3 array, and integer x/y arrays.
    with hm.Plot(name="uint8", data=table, **common):
        hm.Points(x="x", y="y", fill=hm.rgb("r", "g", "b"), size=12)
    with hm.Plot(name="rows", **common):
        hm.Points(x=x, y=y, fill=rows, size=12)
    # 7C B1: a uint8 [H, W, 3] Image is 0-255 (half-intensity bytes must render as 128).
    quadrants = np.array([[[128, 0, 0], [0, 128, 0]], [[0, 0, 128], [128, 128, 0]]], dtype=np.uint8)
    with hm.Plot(name="image", **{**common, "x": {"domain": [0, 1]}, "y": {"domain": [0, 1]}}):
        hm.Image(data=quadrants, pixelated=True)
    # TODO 69.17: Points3D, Arrows3D and Text3D with no color take the theme's Points, Arrows and
    # Text colors (dark's here); unlit and without tone mapping, they export those colors.
    solid = dict(type="3d", width=300, height=300, responsive=False, tone_mapping=0, axes3d=False,
                 x={"domain": [-1, 1]}, y={"domain": [-1, 1]}, z={"domain": [-1, 1]})
    with hm.Theme(value=hm.create_theme(extends="dark")):
        with hm.Plot(name="solid", **solid):
            hm.Points3D(x=[0], y=[0.4], z=[0], size=40)
            hm.Arrows3D(start=[[-0.8, -0.3, 0]], end=[[0.8, -0.3, 0]], width=8, head_width=16, head_length=16)
            hm.Text3D(text="HM", position=[0, -0.75, 0], size=30)
write(scene, "7c-color")
