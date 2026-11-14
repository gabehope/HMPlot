const e=`import math
import hmplot as hm

# All ten million rows are generated on the browser's GPU. Python sends this scene's
# configuration and expressions, not NumPy columns or a downloaded stellar catalog.
STARS = 10_000_000
c = hm.col
born = hm.random(seed=7) * 10
bulge = hm.random(seed=8) < 0.14
age = hm.where(bulge, born * 0.3 + 7, born)
arm = hm.floor(hm.random(seed=9) * 2) * math.pi
radius = (hm.random(seed=10, distribution="exponential") + hm.random(seed=11, distribution="exponential")) * 1.8
spread = hm.square(age * 0.1) * 1.2 + 0.15 + hm.exp(hm.square(radius) * -0.5) * 1.5
angle = hm.log(radius + 0.5) * 2.6 + arm + hm.random(seed=12, distribution="normal") * spread
r = radius * (hm.random(seed=13, distribution="normal") * 0.07 + 1)
x = hm.where(bulge, hm.random(seed=12, distribution="normal") * 0.65 - hm.random(seed=13, distribution="normal") * 0.2, r * hm.cos(angle))
z = hm.where(bulge, hm.random(seed=13, distribution="normal") * 0.6 + hm.random(seed=12, distribution="normal") * 0.2, r * hm.sin(angle))
y = hm.random(seed=14, distribution="normal") * hm.where(bulge, 0.4, age * 0.025 + 0.055)

# Kroupa birth masses: dN/dM ~ M^-1.3 / M^-2.3, continuous at 0.5 solar masses.
# https://arxiv.org/abs/astro-ph/0011328
# Lifetimes, giant tracks and white-dwarf cooling are illustrative approximations.
low = (0.5 ** -0.3 - 0.08 ** -0.3) / -0.3
high = 0.5 * (30 ** -1.3 - 0.5 ** -1.3) / -1.3
p = low / (low + high)
small = (hm.clip(hm.random(seed=15) / p, 0, 1) * (0.5 ** -0.3 - 0.08 ** -0.3) + 0.08 ** -0.3) ** (-1 / 0.3)
large = (hm.clip((hm.random(seed=15) - p) / (1 - p), 0, 1) * (30 ** -1.3 - 0.5 ** -1.3) + 0.5 ** -1.3) ** (-1 / 1.3)
mass = hm.where(hm.random(seed=15) < p, small, large)
lifetime = mass ** -2.5 * 10
phase = age / lifetime
giant = hm.clip((phase - 1) / 0.12, 0, 1)
main_t = hm.minimum(hm.where(mass < 1, mass ** 0.35, mass ** 0.55) * 5772, 40000)
main_l = hm.where(mass < 0.43, mass ** 2.3 * 0.23, mass ** 3.5)
giant_t = hm.sqrt(giant) * -1800 + 4900
giant_l = 10 ** (giant * 2.4 + 1.2)
cooling = hm.maximum(age - lifetime * 1.12, 0)
dwarf_t = (cooling * 6 + 1) ** -0.35 * 26000
dwarf_l = (dwarf_t / 5772) ** 4 * 0.012 ** 2
remnant_l = hm.where(mass >= 8, 0, dwarf_l)
temperature = hm.where(phase < 1, main_t, hm.where(phase < 1.12, giant_t, dwarf_t))
luminosity = hm.where(phase < 1, main_l, hm.where(phase < 1.12, giant_l, remnant_l)) * 10 ** (hm.random(seed=16, distribution="normal") * 0.08)
intensity = hm.where(c.luminosity > 0, hm.clip(c.luminosity ** 0.3 * 0.012, 0.001, 0.25), 0)
columns = dict(x=x, y=y, z=z, age=age, temperature=temperature, luminosity=luminosity)

# Approximate blackbody colors, shared by both views; sunlight is warm white.
temperatures = hm.continuous(domain=[2400, 40000], colormap={
    "colors": ["#ff9955", "#ffc184", "#ffe4c4", "#fff4ea", "#e4ebff", "#a9c5ff"],
    "positions": [0, 0.029, 0.0585, 0.096, 0.202, 1], "space": "srgb",
})
kept = (c.age >= hm.input.youngest) & (c.age <= hm.input.oldest)

with hm.Scene(gap=12) as scene:
    hm.Markdown("Ten million synthetic stars in a 3D spiral galaxy with an older central bulge. Most are faint "
                "red dwarfs; rare hot stars and red giants supply much of the light. Color follows temperature "
                "and brightness follows luminosity, compressed to keep faint stars visible. This is an "
                "illustrative population, not an observed catalog. Drag the galaxy to orbit; scroll to zoom. "
                "The Hertzsprung–Russell (H–R) diagram shows a fixed sample of 100,000 stars. Shift-drag a box "
                "to highlight all matching stars in the galaxy, including those outside the sample; "
                "double-click inside the box to clear. Hot stars are on the left, luminous stars at the top. "
                "The age sliders filter both plots.")
    with hm.Row(wrap=True, min_width=0):
        hm.Slider(name="youngest", label="Youngest (billion years)", min=0, max=10, step=0.05, value=0)
        hm.Slider(name="oldest", label="Oldest (billion years)", min=0, max=10, step=0.05, value=10)
    with hm.Theme(value=hm.themes.dark):
        with hm.Data(rows=STARS):
            with hm.Calculate(columns=columns):
                with hm.Calculate(columns={"intensity": intensity}):
                    with hm.Row(widths=[3, 2], wrap=True, min_width=286, gap=12):
                        with hm.Filter(where=kept):
                            with hm.Plot(type="3d", height=500, antialias="off", tone_mapping=4, camera_position=[105, 95, 165],
                                         x={"domain": [-10, 10]}, y={"domain": [-10, 10]}, z={"domain": [-10, 10]}):
                                # Additive blending already disables depth writes in the beauty pass.
                                hm.Points(x="x", y="y", z="z", fill="temperature", fill_scale=temperatures, shape="square",
                                          size=0.7, opacity="intensity", blend="additive", respond="brushed",
                                          selection_opacity=0.015, legend=False)
                        # Sample the source once; age changes filter these same rows without resampling.
                        with hm.Sample(size=100_000, seed=42):
                            with hm.Filter(where=kept):
                                with hm.Plot(height=500, axes2d=True, antialias="off",
                                             x={"domain": [2000, 40000], "transform": "log", "invert": True,
                                                "label": "temperature (K)", "format": "~s"},
                                             y={"domain": [0.00001, 100000], "transform": "log",
                                                "label": "luminosity (Sun = 1)", "format": "~g"}):
                                    hm.Points(x="temperature", y="luminosity", fill="temperature", fill_scale=temperatures,
                                              shape="square", size=1.2, opacity=0.4, brush=True, respond="brushed",
                                              selection_opacity=0.08, legend=False)
scene
`;export{e as default};
