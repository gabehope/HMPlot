const e=`import numpy as np
from PIL import Image as Picture
import hmplot as hm

# NASA's Blue Marble over an elevation surface on a globe (or a map). The color image travels as
# its JPEG file and the browser decodes it; the elevation is a 512 x 256 grid of 0 (sea level) to
# 1 (6,400 m), south row first as a heatmap's rows run.
with Picture.open("elevation.png") as image:
    elevation = np.asarray(image, dtype=np.float32)[::-1] / 255
# The relief in globe radii: 6,400 m of Earth's 6,371 km, times the Height scale slider.
relief = hm.input.relief * 6400 / 6_371_000
globe = hm.input.view == hm.literal("3d-y-up")

with hm.Scene(gap=12) as scene:
    with hm.Row(wrap=True, min_width=0):
        hm.Select(name="view", label="Earth view", options={"3D globe": "3d-y-up", "2D map": "2d"})
        hm.Slider(name="relief", label="Height scale", min=0, max=200, step=1, value=50)
        hm.Checkbox(name="lit", label="Lit mode", value=True)
        hm.Select(name="projection", label="Earth projection",
                  options={"Equirectangular": "equirectangular", "Mercator": "mercator", "Equal area": "equal-area"})
    with hm.Plot(type=hm.input.view, coordinates="spherical", projection=hm.input.projection, base_radius=1,
                 x={"domain": [-180, 180]}, y={"domain": [-90, 90]}, height=520, overview=True, tone_mapping=0,
                 name="Earth",
                 lights=[hm.light("ambient", intensity=hm.where(hm.input.lit, 0.35, 0)),
                         hm.light("directional", position=[3, 2, 4], intensity=hm.where(hm.input.lit, 2, 0))]):
        # Lit mode: the sun from the upper right; off, the image's own colors.
        with hm.Heatmap(fill=elevation, name="Elevation", z_scale=relief, surface_mode=True, lit=hm.input.lit & globe,
                        detail=256, fill_scale=hm.continuous(domain=[0, 1]), zrange=[0, 0], texture_resolution=[4096, 2048]):
            hm.Image(data="color.jpg", name="Blue Marble", zrange=[0, 0])
    hm.Markdown("[NASA Blue Marble](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/"
                "base-topography/) · [GEBCO elevation](https://science.nasa.gov/earth/earth-observatory/"
                "blue-marble-next-generation/topography-bathymetry-maps/). Relief exaggerated; elevation product "
                "spans 0–6,400 m. The projection applies to the 2D map.", font_size=11, color="#687782")
`;export{e as default};
