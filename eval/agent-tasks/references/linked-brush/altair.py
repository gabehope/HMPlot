import altair as alt
import pandas as pd

frame = pd.read_csv("data/cars.csv")
brush = alt.selection_interval(name="car_brush")
scatter = alt.Chart(frame).mark_circle(size=50).encode(
    x=alt.X("horsepower:Q"), y=alt.Y("mpg:Q"),
    color=alt.condition(brush, alt.value("#3273aa"), alt.value("#ccc")),
).add_params(brush).properties(title="Horsepower and mpg", width=400, height=350)
hist = alt.Chart(frame).transform_filter(brush).mark_bar().encode(
    x=alt.X("weight_kg:Q", bin=alt.Bin(maxbins=25)), y="count()"
).properties(title="Weight of the selected cars", width=400, height=350)
(scatter | hist).save("output/chart.html", inline=True, embed_options={"renderer": "svg"})
