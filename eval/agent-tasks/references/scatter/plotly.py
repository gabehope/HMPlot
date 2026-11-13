import pandas as pd
import plotly.express as px

frame = pd.read_csv("data/penguins.csv").dropna(subset=["bill_length_mm", "bill_depth_mm"])
fig = px.scatter(frame, x="bill_length_mm", y="bill_depth_mm", color="species",
                 title="Penguin bills", labels={"bill_length_mm": "Bill length (mm)", "bill_depth_mm": "Bill depth (mm)"})
fig.write_html("output/chart.html", include_plotlyjs=True, full_html=True)
