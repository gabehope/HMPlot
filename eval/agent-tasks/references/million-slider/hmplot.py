import hmplot as hm

table = hm.Table.from_parquet("data/pickups.parquet")
with hm.Scene() as scene:
    with hm.Column():
        with hm.Plot(data=table, title="One million taxi pickups", height=560, axes2d=True,
                     x={"label": "km east"}, y={"label": "km north"}):
            with hm.Filter(where=hm.col.fare_usd <= hm.input.max_fare):
                hm.Points(x="x_km", y="y_km", fill="fare_usd", size=2)
        hm.Slider(name="max_fare", min=0, max=100, step=1, value=100, label="Maximum fare (USD)")
hm.export_html(scene, "output/chart.html", snapshot="png")
scene
