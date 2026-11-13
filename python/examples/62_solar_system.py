"""A 3D solar system: the Sun and the eight planets as textured spherical Frames.

Display ``scene`` in a notebook, then run ``task = asyncio.ensure_future(play())`` to set the
planets orbiting and spinning; ``task.cancel()`` stops them. ``show(day)`` jumps to a day since
J2000 (2000-01-01 12:00 UTC). Drag to orbit the view, scroll to zoom.

Each body is a spherical Frame placed in a Cartesian 3D Plot: its placement puts it on its
orbit, sizes it, and spins it about its tilted axis. The planets are lit Images (their surface
maps), shaded by a point light at the Sun; the Sun's own Image is unlit, and it glows. Saturn's
rings are an Image in a polar Frame turned onto Saturn's equator. A sky effect puts the stars and the
Milky Way all around. Moving a Frame changes only its placement, so playing re-prepares nothing
in the browser.

Not to scale: distances grow with the square root of the true distance and radii with
(radius / Earth's)^0.45, so Mercury and Neptune fit one view; spins are slowed.

Textures: Solar System Scope (https://www.solarsystemscope.com/textures/), CC BY 4.0. Run from the
repository, the bundled 1024 x 512 copies in src/examples/solar-system are used. Decoding them
needs Pillow (``pip install pillow``). They are sent at 512 x 256, about 14 MB for all nine;
``build(texture_width=1024)`` sends them at full size (four times as much) for sharper close-ups.
The star map goes to the browser as its JPEG file (250 KB), which the browser decodes.
"""
import asyncio
import math
import time
from pathlib import Path
from typing import Any

import numpy as np

import hmplot as hm

TEXTURES = "src/examples/solar-system"

# Mean distance (AU), radius (km), orbital period (years), rotation period (days, negative for
# retrograde), axial tilt (degrees) and mean longitude at J2000 (degrees).
PLANETS = [
    dict(name="Mercury", texture="mercury", au=0.387, km=2440, year=0.241, day=58.6, tilt=0.03, longitude=252.25),
    dict(name="Venus", texture="venus_atmosphere", au=0.723, km=6052, year=0.615, day=-243, tilt=177.4, longitude=181.98),
    dict(name="Earth", texture="earth_daymap", au=1, km=6371, year=1, day=1, tilt=23.44, longitude=100.46),
    dict(name="Mars", texture="mars", au=1.524, km=3390, year=1.881, day=1.03, tilt=25.19, longitude=355.45),
    dict(name="Jupiter", texture="jupiter", au=5.203, km=69911, year=11.86, day=0.414, tilt=3.13, longitude=34.4),
    dict(name="Saturn", texture="saturn", au=9.537, km=58232, year=29.46, day=0.444, tilt=26.73, longitude=49.94),
    dict(name="Uranus", texture="uranus", au=19.19, km=25362, year=84.0, day=-0.718, tilt=97.77, longitude=313.23),
    dict(name="Neptune", texture="neptune", au=30.07, km=24622, year=164.8, day=0.671, tilt=28.32, longitude=304.88),
]
SUN = dict(name="Sun", texture="sun", day=25.4, tilt=7.25)
SUN_DIAMETER = 6
# Saturn's rings span 1.24 to 2.27 Saturn radii (the C ring to the A ring's edge).
RING_INNER, RING_OUTER = 1.24, 2.27


def orbit_radius(au):
    return 3.5 + 8 * math.sqrt(au)


def diameter(km):
    return 2.2 * (km / 6371) ** 0.45


def spin_seconds(day):
    """A spin period in seconds that grows slowly with the true one."""
    return 6 * abs(day) ** 0.35


def find(relative):
    """The repository copy of a file, searching up from the working directory."""
    for base in (Path.cwd(), *Path.cwd().parents):
        if (base / relative).exists():
            return base / relative
    raise FileNotFoundError(
        f"{relative} was not found above {Path.cwd()}. Run from the hmplot repository, or "
        "download the 2K textures from https://www.solarsystemscope.com/textures/ into that folder.")


def load_texture(name, width=512):
    """A surface map as a float32 [height, width, 3] array (0-1, top row north)."""
    from PIL import Image as PILImage
    with PILImage.open(find(f"{TEXTURES}/{name}.jpg")) as image:
        image = image.convert("RGB")
        if image.width != width:
            image = image.resize((width, width // 2), PILImage.LANCZOS)
        return np.asarray(image, dtype=np.float32) / 255


def load_rings(rows=512):
    """Saturn's rings over the polar Frame's grid: angle across (constant), radius down, from the
    outer edge (top row) to the inner. The texture runs inner to outer, its gaps in alpha."""
    from PIL import Image as PILImage
    with PILImage.open(find(f"{TEXTURES}/saturn_ring_alpha.png")) as image:
        pixels = np.asarray(image.convert("RGBA"), dtype=np.float64)
    profile = pixels.mean(axis=0) / 255  # [width, 4], inner to outer
    columns = np.minimum(profile.shape[0] - 1, ((rows - 1 - np.arange(rows)) / rows * profile.shape[0]).astype(int))
    return np.repeat(profile[columns][:, None, :], 2, axis=1).astype(np.float32)


def load_sky(width=None):
    """The star map for the sky effect: its file, sent as the JPEG it is, or resized to `width` (JPEG bytes)."""
    path = find(f"{TEXTURES}/stars_milky_way.jpg")
    if width is None:
        return path
    import io
    from PIL import Image as PILImage
    with PILImage.open(path) as image:
        buffer = io.BytesIO()
        image.convert("RGB").resize((width, width // 2), PILImage.LANCZOS).save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


def placements(day, seconds=0.0):
    """Each planet's body, label and (Saturn) ring placement on `day` since J2000; spins turn
    with `seconds` of play."""
    out: list[dict[str, Any]] = []
    for planet in PLANETS:
        angle = math.radians(planet["longitude"] + 360 * day / (365.25 * planet["year"]))
        r, d = orbit_radius(planet["au"]), diameter(planet["km"])
        anchor = [r * math.cos(angle), 0, -r * math.sin(angle)]
        spin = math.copysign(1, planet["day"]) * 360 * seconds / spin_seconds(planet["day"])
        out.append(dict(
            body={"anchor": anchor, "size": [d, d, d], "rotation": [planet["tilt"], spin, 0]},
            label={"anchor": [anchor[0], d / 2 + 1.2, anchor[2]], "size": [1, 1, 1]},
            # The rings lie in the planet's equator: the polar plane turned onto it, then tilted.
            rings={"anchor": anchor, "size": [d * RING_OUTER] * 3, "rotation": [planet["tilt"] - 90, 0, 0]}
            if planet["name"] == "Saturn" else None,
        ))
    return out


def sun_placement(seconds=0.0) -> hm.FramePlacement:
    return {"anchor": [0, 0, 0], "size": [SUN_DIAMETER] * 3,
            "rotation": [float(SUN["tilt"]), 360 * seconds / spin_seconds(SUN["day"]), 0]}


def orbit_path(au, points=161):
    r = orbit_radius(au)
    return [[r * math.cos(t), 0, -r * math.sin(t)] for t in np.linspace(0, 2 * math.pi, points)]


def build(texture_width=512, sky_width=None):
    """The scene and its movable Frames: {"sun", "bodies", "labels", "rings"}."""
    textures = {body["texture"]: load_texture(body["texture"], texture_width) for body in (SUN, *PLANETS)}
    rings = load_rings()
    frames = {"bodies": [], "labels": [], "rings": None}
    start = placements(0)
    globe: dict[str, Any] = dict(coordinates="spherical", x={"domain": [-180, 180]}, y={"domain": [-90, 90]})
    hidden: hm.AxisDefinition = {"domain": [-1, 1], "visible": False}
    with hm.Scene() as scene:
        with hm.Plot(type="3d-y-up", height=560, responsive=True, background="#04060d", tone_mapping=0,
                     name="Solar system", camera_position=[0, 52, 92],
                     # The stars and the Milky Way all around, behind everything; they turn with the view.
                     effects=[hm.effect("sky", image=load_sky(sky_width))],
                     x={"domain": [-50, 50], "visible": False}, y={"domain": [-50, 50], "visible": False},
                     z={"domain": [-50, 50], "visible": False},
                     lights=[hm.light("ambient", intensity=0.18),
                             hm.light("point", position=[0, 0, 0], intensity=3.2, decay=0)]):
            # The Sun's light: from its center, not dimming with distance.
            for planet in PLANETS:
                hm.Line(position=orbit_path(planet["au"]), color="#3a4560", width=1)
            # The Sun is unlit: its Image is its own light, and it glows.
            with hm.Frame(name="Sun", placement=sun_placement(), **globe) as frames["sun"]:
                hm.Image(data=textures[SUN["texture"]], glow=1)
            for planet, place in zip(PLANETS, start):
                # Earth's atmosphere: a blue rim around its globe.
                with hm.Frame(name=planet["name"], placement=place["body"],
                              atmosphere={"thickness": 0.25} if planet["name"] == "Earth" else False, **globe) as body:
                    hm.Image(data=textures[planet["texture"]], lit=True)
                frames["bodies"].append(body)
                if place["rings"]:
                    with hm.Frame(name="Saturn's rings", coordinates="polar", angle_unit="degrees", base_radius=0,
                                  x={"domain": [0, 360], "visible": False}, y={"domain": [0, RING_OUTER], "visible": False},
                                  z={"visible": False}, placement=place["rings"]) as frames["rings"]:
                        hm.Image(data=rings, xbounds=[0, 360], ybounds=[RING_INNER, RING_OUTER])
                # The label rides in its own small placed Frame above the planet.
                with hm.Frame(name=f"{planet['name']} label", placement=place["label"],
                              x=hidden, y=hidden, z=hidden) as label:
                    hm.Text(position=[[0, 0, 0]], text=[planet["name"]], size=12, color="#dce7f4")
                frames["labels"].append(label)
    return scene, frames


scene, frames = build()


def show(day, seconds=0.0):
    """Move every body to `day` since J2000, in one update."""
    with scene.batch_update():
        frames["sun"].update(placement=sun_placement(seconds))
        for place, body, label in zip(placements(day, seconds), frames["bodies"], frames["labels"]):
            body.update(placement=place["body"])
            label.update(placement=place["label"])
            if place["rings"]:
                frames["rings"].update(placement=place["rings"])


async def play(days_per_second=20, fps=30, start_day=0.0):
    """Orbit and spin until cancelled: `task = asyncio.ensure_future(play())`, then `task.cancel()`."""
    begin = time.perf_counter()
    while True:
        seconds = time.perf_counter() - begin
        show(start_day + seconds * days_per_second, seconds)
        await asyncio.sleep(1 / fps)


scene
