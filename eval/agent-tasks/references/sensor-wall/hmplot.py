"""Reference: 36 compact tables; shared overview brush controls domain expressions."""
from pathlib import Path
import numpy as np
import pandas as pd
import hmplot as hm

Path("output").mkdir(exist_ok=True)
readings = pd.read_parquet("data/readings.parquet")
sensors = pd.read_csv("data/sensors.csv").sort_values(["region", "sensor"])
readings["time"] = pd.to_datetime(readings.time, utc=True)
origin = pd.Timestamp("2024-01-01", tz="UTC")
readings["day"] = (readings.time - origin).dt.total_seconds() / 86400
daily = readings.groupby(readings.time.dt.floor("D")).temp_c.mean().reset_index()
daily["day"] = (daily.time - origin).dt.total_seconds() / 86400
tables = {}
for sensor, group in readings.groupby("sensor"):
    group = group.sort_values("time").set_index("time")
    mean = group.temp_c.rolling("7D", min_periods=24).mean()
    sd = group.temp_c.rolling("7D", min_periods=24).std()
    group["anomaly"] = (group.temp_c - mean).abs() > 4 * sd
    # Explicit missing hourly records split Line paths at outages.
    group = group.reindex(pd.date_range(origin, periods=366 * 24, freq="h"))
    group["day"] = (group.index - origin).total_seconds() / 86400
    group["sensor"] = str(sensor)
    group["region"] = str(sensors.set_index("sensor").loc[sensor, "region"])
    tables[sensor] = group.reset_index(drop=True)
low, high = float(readings.temp_c.min()) - 1, float(readings.temp_c.max()) + 1
lo = hm.coalesce(hm.min("@brush_min:day"), 0)
hi = hm.coalesce(hm.max("@brush_max:day"), 366)
with hm.Scene(gap=8) as chart:
    hm.Title("Sensor temperatures 2024")
    with hm.Data(daily):
        for region, region_sensors in sensors.groupby("region", sort=True):
            with hm.Row(gap=8):
                for _, sensor in region_sensors.iterrows():
                    with hm.Plot(title=f"{region} · {sensor.sensor}", width=188, height=165,
                                 x={"domain": [lo, hi], "label": "Day of 2024", "tick_count": 3},
                                 y={"domain": [low, high], "label": "°C", "tick_count": 3}):
                        # The plot's domain reads the shared daily scope; local marks read
                        # only their sensor's table. No region x sensor cross-product.
                        with hm.Data(tables[sensor.sensor]):
                            hm.Line(x="day", y="temp_c", color="#4d819e", width=1,
                                    tooltip=["sensor", "region", "day", "temp_c"])
                            with hm.Filter(where="anomaly"):
                                hm.Points(x="day", y="temp_c", size=3.5, fill="#d7473c")
        with hm.Plot(title="Sensor temperatures 2024", height=190,
                     x={"domain": [0, 366], "label": "Overview · Shift-drag to set the detail range"},
                     y={"label": "Daily mean (°C)"}):
            hm.Line(x="day", y="temp_c", color="#315f7b", width=2,
                    brush={"axis": "x"}, tooltip=["day", "temp_c"])
hm.export_html(chart, "output/chart.html")
