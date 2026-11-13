import json
from pathlib import Path
import pandas as pd
import plotly.graph_objects as go

frame = pd.read_csv("data/cars.csv")
left = go.Figure(go.Scattergl(x=frame.horsepower, y=frame.mpg, mode="markers", marker={"size": 7},
                              customdata=frame.weight_kg))
left.update_layout(title="Horsepower and mpg", dragmode="select")
right = go.Figure(go.Histogram(x=frame.weight_kg, nbinsx=25))
right.update_layout(title="Weight of the selected cars")
js = left.to_html(include_plotlyjs=True, full_html=False, div_id="scatter") + right.to_html(include_plotlyjs=False, full_html=False, div_id="hist")
js += """<script>
const scatter = document.getElementById('scatter'), hist = document.getElementById('hist');
scatter.on('plotly_selected', e => Plotly.restyle(hist, {x: [e && e.points.length ? e.points.map(p => p.customdata) : DATA]}, [0]));
scatter.on('plotly_deselect', () => Plotly.restyle(hist, {x: [DATA]}, [0]));
</script>""".replace("DATA", json.dumps(frame.weight_kg.tolist()))
Path("output/chart.html").write_text("<!doctype html><meta charset='utf-8'>" + js)
