import pandas as pd
import hmplot as hm

frame = pd.read_csv("data/cars.csv")
with hm.Scene() as scene:
    with hm.Data(frame.to_dict(orient="list")):
        with hm.Row():
            with hm.Plot(title="Horsepower and mpg", height=430, axes2d=True):
                hm.Points(x="horsepower", y="mpg", size=7, brush=True, respond="brushed")
            with hm.Plot(title="Weight of the selected cars", height=430, axes2d=True):
                with hm.Filter(where="@brushed", inactive="all"):
                    hm.charts.Histogram(x="weight_kg", bins=25)
hm.export_html(scene, "output/chart.html")
scene
