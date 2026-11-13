from pathlib import Path

import pandas as pd
import plotly.graph_objects as go

frame = pd.read_csv('data/data.csv')
frame['date'] = pd.to_datetime(frame['date'])
frame = frame.loc[(frame.date >= '2006-10-01') & (frame.date <= '2013-08-31')]
fig = go.Figure()
for left, right in zip(frame.iloc[:-1].itertuples(index=False), frame.iloc[1:].itertuples(index=False)):
    daily, average = left[1], left[2]
    fig.add_shape(type='rect', x0=left.date, x1=right.date,
                  y0=min(daily, average), y1=max(daily, average),
                  fillcolor='#38a17d' if daily >= average else '#d3716e',
                  opacity=0.18, line_width=0, layer='below')
fig.add_trace(go.Scatter(x=frame.date, y=frame['Dow Jones Industrial Average'],
                         mode='lines', name='Dow Jones Industrial Average'))
fig.add_trace(go.Scatter(x=frame.date, y=frame['1 year moving average'],
                         mode='lines', name='1 year moving average'))
fig.update_layout(title='Dow Jones and moving average', xaxis_title='Date',
                  yaxis_title='Index level', width=950, height=610)
Path('output').mkdir(exist_ok=True)
fig.write_html('output/chart.html', include_plotlyjs=True, full_html=True)
