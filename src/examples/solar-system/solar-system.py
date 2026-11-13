import datetime
import math

import numpy as np
from PIL import Image as Picture
import hmplot as hm

# The Sun and the eight planets as textured spherical Frames placed in a 3D scene, orbiting at
# their true periods and spinning on tilted axes. The Date control plays the clock; each body's
# placement is an expression of it, which the browser evaluates as it plays.

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
SUN = dict(texture="sun", day=25.4, tilt=7.25)
SUN_DIAMETER = 6
# Saturn's rings span 1.24 to 2.27 Saturn radii (the C ring to the A ring's edge).
RING_INNER, RING_OUTER = 1.24, 2.27


# Not to scale: distances grow with the square root of the true distance and radii with
# (radius / Earth's)^0.45, so Mercury and Neptune fit one view and every planet is visible.
def orbit_radius(au):
    return 3.5 + 8 * math.sqrt(au)


def diameter(km):
    return 2.2 * (km / 6371) ** 0.45


# Spins are slowed to be seen: one turn in seconds (at 20 days a second) that grow slowly with
# the true period.
def spin_seconds(day):
    return 6 * abs(day) ** 0.35


# Days since J2000 (2000-01-01 12:00 UTC), from the Date control's value (a time in milliseconds).
J2000 = datetime.datetime(2000, 1, 1, 12, tzinfo=datetime.timezone.utc)
days = (hm.input.date - int(J2000.timestamp() * 1000)) / 86_400_000


def body(planet):
    """A planet's placement on the day: on its orbit, sized, spun about its tilted axis."""
    angle = math.radians(planet["longitude"]) + 2 * math.pi * days / (365.25 * planet["year"])
    r, d = orbit_radius(planet["au"]), diameter(planet["km"])
    spin = math.copysign(360, planet["day"]) * days / 20 / spin_seconds(planet["day"])
    return {"anchor": [r * hm.cos(angle), 0, -r * hm.sin(angle)], "size": [d, d, d],
            "rotation": [planet["tilt"], spin, 0]}


def orbit(au, points=161):
    angle = np.linspace(0, 2 * np.pi, points)
    return np.stack([orbit_radius(au) * np.cos(angle), 0 * angle, -orbit_radius(au) * np.sin(angle)], axis=1)


# Saturn's rings over the polar Frame's grid: angle across (two equal columns), radius down from
# the outer edge (top row) to the inner. The ring texture runs inner to outer, its gaps in alpha.
with Picture.open("saturn_ring_alpha.png") as image:
    profile = np.asarray(image.convert("RGBA"), dtype=np.float64).mean(axis=0) / 255
columns = np.minimum(len(profile) - 1, ((511 - np.arange(512)) / 512 * len(profile)).astype(int))
rings = np.repeat(profile[columns][:, None, :], 2, axis=1).astype(np.float32)

globe = dict(coordinates="spherical", x={"domain": [-180, 180]}, y={"domain": [-90, 90]})
hidden = {"domain": [-1, 1], "visible": False}

with hm.Scene(gap=12) as scene:
    with hm.Row(wrap=True, min_width=0):
        # Plays from J2000 through Neptune's year, at the slider's days a second.
        hm.Playback(name="date", label="Date", min=J2000, max=J2000 + datetime.timedelta(days=60_200), value=J2000,
                    rate=hm.input.speed * 86_400_000, loop=True, autoplay=True, format="%Y-%m-%d")
        hm.Slider(name="speed", label="Days per second", min=1, max=200, step=1, value=20)
        hm.Checkbox(name="orbits", label="Orbits", value=True)
        hm.Checkbox(name="labels", label="Labels", value=True)
        hm.Checkbox(name="stars", label="Stars", value=True)
        hm.Checkbox(name="glow", label="Glow", value=True)
    # The stars and the Milky Way all around, behind everything; they turn with the view.
    with hm.Plot(type="3d-y-up", height=560, background="#04060d", tone_mapping=0, name="Solar system",
                 effects=[hm.effect("sky", image="stars_milky_way.jpg", visible=hm.input.stars)],
                 camera_position=[0, 52, 92], x={"domain": [-50, 50], "visible": False},
                 y={"domain": [-50, 50], "visible": False}, z={"domain": [-50, 50], "visible": False},
                 lights=[hm.light("ambient", intensity=0.18),
                         hm.light("point", position=[0, 0, 0], intensity=3.2, decay=0)]):
        # The Sun's light: from its center, not dimming with distance.
        for planet in PLANETS:
            hm.Line(position=orbit(planet["au"]), color="#3a4560", width=1, visible=hm.input.orbits)
        # The Sun is unlit: its Image is its own light, and it glows.
        sun_spin = 360 * days / 20 / spin_seconds(SUN["day"])
        with hm.Frame(name="Sun", placement={"anchor": [0, 0, 0], "size": [SUN_DIAMETER] * 3,
                                             "rotation": [SUN["tilt"], sun_spin, 0]}, **globe):
            hm.Image(data="sun.jpg", glow=hm.where(hm.input.glow, 1, 0))
        for planet in PLANETS:
            place = body(planet)
            # A planet: a spherical Frame at its orbital position, spun about its tilted axis,
            # showing its map lit by the Sun; Earth with its atmosphere's blue rim.
            with hm.Frame(name=planet["name"], placement=place,
                          atmosphere={"thickness": 0.25} if planet["name"] == "Earth" else False, **globe):
                hm.Image(data=f"{planet['texture']}.jpg", lit=True)
            if planet["name"] == "Saturn":
                # The rings lie in the planet's equator: the polar plane turned onto it, then tilted.
                ring = {"anchor": place["anchor"], "size": [place["size"][0] * RING_OUTER] * 3,
                        "rotation": [planet["tilt"] - 90, 0, 0]}
                with hm.Frame(name="Saturn's rings", coordinates="polar", angle_unit="degrees", base_radius=0,
                              x={"domain": [0, 360], "visible": False}, y={"domain": [0, RING_OUTER], "visible": False},
                              z={"visible": False}, placement=ring):
                    hm.Image(data=rings, xbounds=[0, 360], ybounds=[RING_INNER, RING_OUTER])
            # The label rides in its own small placed Frame above the planet.
            anchor = place["anchor"]
            with hm.Frame(name=f"{planet['name']} label", x=hidden, y=hidden, z=hidden,
                          placement={"anchor": [anchor[0], place["size"][0] / 2 + 1.2, anchor[2]], "size": [1, 1, 1]}):
                hm.Text(position=[[0, 0, 0]], text=[planet["name"]], size=12, color="#dce7f4", visible=hm.input.labels)
    hm.Markdown("The Sun and planets are spherical Frames placed in a 3D Cartesian scene; each shows its surface "
                "map, spins on its tilted axis, and orbits at its true period (days per second sets the pace). Not "
                "to scale: distances grow with the square root of the true distance, radii are exaggerated, and "
                "spins are slowed. Drag to orbit the view, scroll to zoom. Planet and star textures: "
                "[Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0.",
                font_size=13, color="#667085")
