"""Reference: interpolate population, then take its square root for bubble diameter."""
from pathlib import Path
import numpy as np
import pandas as pd
import hmplot as hm

Path("output").mkdir(exist_ok=True)
frame = pd.read_csv("data/countries_years.csv").sort_values(["country", "year"])
latest = frame[frame.year == 2020]
featured = latest.nlargest(5, "population").country.tolist()
continents = sorted(frame.continent.unique())
palette = hm.categorical(domain=continents, range=["#d15c50", "#d39c35", "#5b96c8", "#62a07c", "#9579b7"])
max_pop = float(frame.population.max())
with hm.Scene() as chart:
    hm.Playback(name="year", label="Year", min=1950, max=2020, value=1950,
                step=0.1, rate=4, loop=False)
    with hm.Plot(height=620, title="Wealth and health, 1950-2020",
                 x={"domain": [float(frame.gdp_per_capita.min()) * 0.8,
                               float(frame.gdp_per_capita.max()) * 1.2], "transform": "log", "label": "GDP per capita"},
                 y={"domain": [float(frame.life_expectancy.min()) - 3,
                               float(frame.life_expectancy.max()) + 3], "label": "Life expectancy (years)"}):
        hm.Text(data={"x": [float(np.sqrt(frame.gdp_per_capita.min() * frame.gdp_per_capita.max()))],
                      "y": [float(frame.life_expectancy.min()) + 7]},
                x="x", y="y", text=hm.floor(hm.input.year), size=70, opacity=0.14, color="#64748b")
        with hm.Data(frame[frame.country.isin(featured)]):
            with hm.Filter(where=hm.col.year <= hm.input.year):
                hm.Line(x="gdp_per_capita", y="life_expectancy", series="country",
                        color="continent", color_scale=palette, opacity=0.22, width=2, domains=False)
        with hm.Data(frame):
            with hm.Slice(field="year", at=hm.input.year, by="country",
                          values=["gdp_per_capita", "life_expectancy", "population", "continent"]):
                bubbles = hm.Points(x="gdp_per_capita", y="life_expectancy",
                                     size=50 * hm.sqrt(hm.col.population / max_pop),
                                     size_scale=hm.continuous(domain=[0, 50], range=[0, 50]),
                                     fill="continent", fill_scale=palette, opacity=0.75,
                                     outline_color="#ffffff", outline_width=0.8,
                                     tooltip=["country", "population", "gdp_per_capita", "life_expectancy"])
                with hm.Filter(where=hm.is_in("country", featured)):
                    hm.Text(x="gdp_per_capita", y="life_expectancy", text="country",
                            dx=10, dy=-12, align="left", size=11, color="#26384a", domains=False)
                hm.Legend(target=bubbles, channel="fill", label="Continent", position="right")
hm.export_html(chart, "output/chart.html")
