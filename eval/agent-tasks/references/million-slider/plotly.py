import pandas as pd
import plotly.graph_objects as go

frame = pd.read_parquet("data/pickups.parquet")
fig = go.Figure(go.Scattergl(x=frame.x_km, y=frame.y_km, mode="markers",
    marker={"size": 2, "color": frame.fare_usd, "colorscale": "Viridis", "showscale": True},
    customdata=frame.fare_usd))
fig.update_layout(title="One million taxi pickups", xaxis_title="km east", yaxis_title="km north",
                  yaxis_scaleanchor="x", dragmode="pan")
fig.write_html("output/chart.html", include_plotlyjs=True, full_html=True, div_id="chart",
               post_script="""const p=document.getElementById('chart');
const slider=document.createElement('input'); slider.type='range'; slider.min=0; slider.max=100; slider.value=100;
const label=document.createElement('label'); label.textContent='Maximum fare (USD)'; label.appendChild(slider);
document.body.prepend(label);
slider.oninput=()=>{let selected=p.data[0].customdata._inputArray.map(v=>v<=+slider.value ? 1 : 0);
Plotly.restyle(p,{'marker.opacity':[selected]},[0]);};""")
