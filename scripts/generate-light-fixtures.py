"""Python snapshots for tests/browser/python-lights.spec.js (rendered through /test/notebook).

Writes static/test/notebook-62_solar_system.json (python/examples/62_solar_system.py, with 64 x 32
textures and a 256 x 128 star map to keep the fixture small) and static/test/notebook-lights.json
(point and hemisphere Plot light specs on lit globes; glowing globes; a sky image sent as PNG bytes
behind a globe in fog). Needs Pillow. Run: python scripts/generate-light-fixtures.py
"""
from pathlib import Path
import json, base64, io, os, sys, runpy
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


os.chdir(root)
ns = runpy.run_path(str(root / "python/examples/62_solar_system.py"))
scene, _ = ns["build"](texture_width=64, sky_width=256)
write(scene, "62_solar_system")

# One uniform gray lit globe per Plot: a point light spec to its right, then a hemisphere light spec with a
# white sky above and a black ground below.
gray = np.full((4, 8, 3), 0.8, dtype=np.float32)
globe = dict(coordinates="spherical", x={"domain": [-180, 180]}, y={"domain": [-90, 90]},
             placement={"anchor": [0, 0, 0], "size": [40, 40, 40]})
common = dict(type="3d", width=320, height=320, responsive=False, background="#000000", tone_mapping=0,
              camera_position=[0, 0, 100], camera_target=[0, 0, 0], camera_up=[0, 1, 0],
              x={"domain": [-50, 50], "visible": False}, y={"domain": [-50, 50], "visible": False},
              z={"domain": [-50, 50], "visible": False})
with hm.Scene() as lights:
    with hm.Row():
        with hm.Plot(name="point", **common,
            lights=[hm.light("ambient", intensity=0.3),
                    hm.light("point", position=[300, 0, 0], intensity=2.5, decay=0)]):
            with hm.Frame(**globe):
                hm.Image(data=gray, lit=True)
        with hm.Plot(name="hemisphere", **common,
            lights=[hm.light("hemisphere", color="#ffffff", ground_color="#000000", intensity=2.5)]):
            with hm.Frame(**globe):
                hm.Image(data=gray, lit=True)
    # Glow and bloom (TODO 37.3): two equally bright globes, the left glowing, and a glowing globe
    # hidden behind a black one nearer the camera. A click handler makes a globe pickable.
    pickable = lambda image: image.on_event("click", lambda event: None) or image
    with hm.Row():
        orange = np.full((4, 8, 3), [1.0, 0.55, 0.1], dtype=np.float32)
        black = np.zeros((4, 8, 3), dtype=np.float32)
        place = lambda anchor, size: dict(coordinates="spherical", x={"domain": [-180, 180]}, y={"domain": [-90, 90]},
                                          placement={"anchor": anchor, "size": [size] * 3})
        with hm.Plot(name="glow", effects=[hm.effect("bloom", strength=1.5, radius=0.5)], **common):
            with hm.Frame(**place([-25, 12, 0], 16)):
                pickable(hm.Image(data=orange, glow=1))
            with hm.Frame(**place([25, 12, 0], 16)):
                pickable(hm.Image(data=orange))
            with hm.Frame(**place([0, -22, -10], 10)):
                hm.Image(data=orange, glow=1)
            with hm.Frame(**place([0, -22, 10], 20)):
                hm.Image(data=black)
        # Sky and fog (TODO 37.2, 37.4): a sky image sent as PNG bytes (the top half red, the bottom
        # half blue: the encoded-image transport) behind a gray globe in green fog.
        from PIL import Image as PILImage
        sky = PILImage.new("RGB", (64, 32), (0, 0, 255))
        sky.paste((255, 0, 0), (0, 0, 64, 16))
        png = io.BytesIO()
        sky.save(png, format="PNG")
        with hm.Plot(name="sky", effects=[hm.effect("sky", image=png.getvalue()),
                                          hm.effect("fog", near=60, far=140, color="#00ff00")], **common):
            with hm.Frame(**globe):
                pickable(hm.Image(data=gray))
        # Fog and glow together on a transparent canvas (document-export.spec.js).
        with hm.Plot(name="transparent", effects=[hm.effect("fog", near=60, far=140, color="#00ff00")],
                     **{**common, "background": "transparent"}):
            with hm.Frame(**place([0, 0, 0], 30)):
                hm.Image(data=orange, glow=1)
write(lights, "lights")
