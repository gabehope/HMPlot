"""A slider that filters the data
An input is read by name (hm.input.name); a filter that reads it re-runs when the viewer moves it."""
import numpy as np
import hmplot as hm

rng = np.random.default_rng(8)
products = hm.Data({"price": rng.uniform(10, 500, 400), "rating": rng.uniform(1, 5, 400)})
affordable = products.filter(hm.col.price <= hm.input.max_price)

with hm.Scene() as chart:
    hm.Slider(name="max_price", label="Max price", min=10, max=500, step=10, value=250)
    with hm.Plot(height=320, x={"domain": [0, 500]}, y={"domain": [1, 5]}):
        hm.Points(data=affordable, x="price", y="rating", size=5)
chart
