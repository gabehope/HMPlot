# Earth demo imagery

Locally resized NASA Blue Marble and GEBCO elevation maps. Color: January 2004,
4096×2048, now `src/examples/earth/color.jpg` (the paired Earth relief example, which also
has a 512×256 copy of the elevation; see its SOURCE.md). Elevation: 4096×2048, this folder's
`elevation.jpg`, grayscale 0–255 corresponds to 0–6400 meters;
this display product is not an uncapped scientific elevation model. Oceans remain
at sea level; underwater relief is not included. Both use equirectangular mapping,
longitude −180° to 180°, with north at the top.

Sources:
- https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/january/world.topo.200401.3x5400x2700.jpg
- https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_5400x2700.jpg
- https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/

Credits: NASA Earth Observatory / Reto Stöckli (Blue Marble); Jesse Allen,
NASA Earth Observatory, GEBCO / British Oceanographic Data Centre (elevation).
Resized with macOS sips; source imagery already includes topographic shading.
