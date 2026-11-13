import csv
from pathlib import Path
import hmplot as hm

ROOT = Path(__file__).resolve().parent
with (ROOT / 'data/sales.csv').open(newline='') as stream:
    rows = [row for row in csv.DictReader(stream) if row['quarter'].startswith('2024-')]
sales = {name: [float(row[name]) if name == 'revenue_k' else row[name] for row in rows]
         for name in ('region', 'product', 'revenue_k')}
focus = hm.selection()
with hm.Data(sales) as chart:
    with hm.Row(gap=20):
        with hm.Plot(height=420, title='Revenue by region',
                     x={'label': 'Region', 'scale': hm.categorical(domain=['North', 'South', 'East', 'West'])}, y={'label': 'Revenue (thousands of USD)'}):
            with hm.Group(by='region', columns={'revenue': hm.sum('revenue_k')}):
                hm.Bar(x='region', y='revenue', select=focus, respond=False)
        with hm.Plot(height=420, title='Revenue by product',
                     x={'label': 'Product', 'scale': hm.categorical(domain=['Hardware', 'Software', 'Services'])}, y={'label': 'Revenue (thousands of USD)'}):
            with hm.Filter(where=focus, inactive='all'):
                with hm.Group(by='product', columns={'revenue': hm.sum('revenue_k')}):
                    hm.Bar(x='product', y='revenue')
(ROOT / 'output').mkdir(exist_ok=True)
hm.export_html(chart, ROOT / 'output/chart.html')
