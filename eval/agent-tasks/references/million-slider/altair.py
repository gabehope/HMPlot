import altair as alt
import pandas as pd

frame = pd.read_parquet("data/pickups.parquet")
alt.data_transformers.disable_max_rows()
fare = alt.param(name="max_fare", value=100, bind=alt.binding_range(min=0, max=100, step=1, name="Maximum fare (USD)"))
chart = alt.Chart(frame).mark_circle(size=5).encode(
    x=alt.X("x_km:Q", title="km east", scale=alt.Scale(zero=False)),
    y=alt.Y("y_km:Q", title="km north", scale=alt.Scale(zero=False)),
    color=alt.Color("fare_usd:Q", scale=alt.Scale(scheme="viridis")),
).add_params(fare).transform_filter("datum.fare_usd <= max_fare").properties(
    title="One million taxi pickups", width=600, height=600)
chart.save("output/chart.html", inline=True, embed_options={"renderer": "canvas"})
