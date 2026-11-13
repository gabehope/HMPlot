import altair as alt
import pandas as pd

frame = pd.read_csv("data/penguins.csv").dropna(subset=["bill_length_mm", "bill_depth_mm"])
chart = alt.Chart(frame).mark_circle(size=70).encode(
    x=alt.X("bill_length_mm:Q", title="Bill length (mm)"),
    y=alt.Y("bill_depth_mm:Q", title="Bill depth (mm)"),
    color=alt.Color("species:N", title="Species"),
).properties(title="Penguin bills", width=700, height=480)
chart.save("output/chart.html", inline=True, embed_options={"renderer": "svg"})
