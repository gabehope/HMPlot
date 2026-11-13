"""Sea-surface temperature from a NetCDF file: grid tables, streamed months and anomalies.

`hm.Table.from_netcdf(path, **selection)` opens a NetCDF file with xarray, selects, and loads its
variables as a grid table: a row per cell of their dimensions, with the coordinates as columns
the browser computes from their 1-D values, so only the temperatures travel. The variable's long
name and units title the legend and the tooltip, and the land, which has no values, is blank.

- The globe streams the months: `hm.stream(path, dim="time", at=hm.input.month)` keeps the
  dataset in Python and sends the month the Playback is at (loading the next one ahead while it
  plays), so the notebook never holds the whole series. An HTML export keeps the month showing.
- The Hovmöller diagram loads the latitudes next to the equator for every month, takes each
  cell's anomaly from its own three-year mean with Calculate, and slices along the equator: the
  2015-16 El Niño is the warm band spreading east across the Pacific.

NetCDF needs xarray and a NetCDF backend: `pip install "hmplot[netcdf]"`.

Data: NOAA ERSST v5 monthly sea-surface temperature, 2014 to 2016, from xarray's tutorial data
(no constraints on use). Run from the repository.
"""
from pathlib import Path

import hmplot as hm

FILE = Path("static/data/ersst/ersst-v5-2014-2016.nc")

sst = hm.stream(FILE, dim="time", at=hm.input.month)
band = hm.Table.from_netcdf(FILE, lat=slice(2, -2))
temperature = hm.continuous(domain=[-2, 32], colormap=["#313695", "#74add1", "#ffffbf", "#f46d43", "#a50026"])
anomalies = hm.continuous(domain=[-3, 3], colormap=["#2166ac", "#f7f7f7", "#b2182b"])

with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=420):
        with hm.Column():
            hm.Playback(name="month", min=0, max=sst.size - 1, step=1, rate=2, loop=True,
                        label="Months since January 2014")
            with hm.Plot(data=sst, coordinates="spherical", projection="orthographic",
                         projection_center=[-150, 0], type="2d", height=420):
                field = hm.Heatmap(fill="sst", fill_scale=temperature, tooltip=True)
                hm.Legend(target=field, channel="fill", position="right")
        with hm.Data(band):
            with hm.Calculate(anomaly=hm.col.sst - hm.mean("sst", by=["lat", "lon"])):
                with hm.Slice(field="lat", at=0):
                    with hm.Plot(height=420, axes2d=True, title="Anomaly along the equator (°C)"):
                        trend = hm.Heatmap(x="lon", y="time", fill="anomaly", fill_scale=anomalies, tooltip=True)
                        hm.Legend(target=trend, channel="fill", position="right")
scene
