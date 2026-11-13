from pathlib import Path

import pandas as pd
import plotly.express as px

frame = pd.read_csv('data/penguins_raw.csv')
frame = frame.dropna(subset=['Culmen Length (mm)', 'Culmen Depth (mm)'])
frame['species'] = frame['Species'].str.split().str[0]
fig = px.scatter(frame, x='Culmen Length (mm)', y='Culmen Depth (mm)', color='species',
                 title='Palmer penguin bills', labels={'Culmen Length (mm)': 'Bill length (mm)',
                  'Culmen Depth (mm)': 'Bill depth (mm)'})
fig.update_layout(width=950, height=610)
Path('output').mkdir(exist_ok=True)
fig.write_html('output/chart.html', include_plotlyjs=True, full_html=True)
