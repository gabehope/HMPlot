+++
schema = 1
id = "parallel-coordinates"
category = "interaction"
data = ["cars"]
source = "d3-hard"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900
inspiration = "https://observablehq.github.io/notebook-kit/ex/d3/brushable-parallel-coordinates"

[[checks]]
kind = "text"
all = ["Fleet explorer"]

[[checks]]
kind = "views"
min = 1

[[checks]]
kind = "interaction"
action = "brush"
+++

`data/cars.csv` contains 406 cars: model, origin, year, horsepower, mpg and weight_kg. Make an offline dashboard titled "Fleet explorer" with brushable parallel coordinates over mpg, horsepower, weight_kg and year. Each axis needs its own numeric scale and units; connect each car across all four axes, colored by origin, with restrained opacity. Dragging an interval on any axis restricts the same cars everywhere; intervals on different axes combine with AND, remain visible, and can be cleared individually. Below, show a linked weight-versus-mpg scatter and the selected count out of 406. Add a reset button and a compact table of the first ten matching models, sorted by mpg descending. With no brushes all cars match; with disjoint brushes the count is zero, the table is empty, and the axes and brush controls remain usable. Keep unselected paths faint as context. All interactions must work without a Python kernel or network. The D3 parallel-coordinates pattern is inspiration, not a requirement to use D3.
