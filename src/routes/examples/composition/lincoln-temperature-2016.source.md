# Lincoln daily mean temperatures, 2016

The same 366 daily observations used in
[SveltePlot's ridgeline example](https://svelteplot.dev/examples/area/ridgeline),
downloaded on 2026-10-04 from https://svelteplot.dev/data/lincoln_weather.csv.
The example credits [Austin Wehrwein's original chart](https://austinwehrwein.com/data-visualization/it-brings-me-ggjoy/).

`lincoln-temperature-2016.json` keeps the original `Mean Temperature [F]` values as
`meanF` and converts the month in `CST` to zero-based `month` indices. No observations
are generated or dropped. The Svelte example converts Fahrenheit to Celsius and computes
Gaussian kernel density estimates on the GPU. Its standard deviation is 4 / sqrt(5) °C,
matching the variance of the reference's width-4 Epanechnikov kernel. Tiny Gaussian
tails are omitted from the drawn ridges so the month baselines remain faint.
