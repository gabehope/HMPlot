+++
schema = 1
id = "streamgraph-lens"
category = "interaction"
data = ["channel_traffic"]
source = "d3-hard"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900
inspiration = "https://observablehq.com/@d3/streamgraph-transitions"

[[checks]]
kind = "text"
all = ["Traffic by source"]

[[checks]]
kind = "views"
min = 1

[[checks]]
kind = "interaction"
action = "brush"
+++

`data/channel_traffic.csv` has daily sessions for 18 named sources from 2022-01-01 through 2024-12-31, one row per source and date. Make a dashboard titled "Traffic by source". The main view is a smooth streamgraph with a wiggle baseline, distinct stable source colors and a readable legend. Include a control switching between streamgraph and ordinary zero-baseline stacked area, retaining the source order and current date range. A smaller overview underneath shows the total sessions across the full period; its range brush sets the main view's date range while the overview stays fixed. Hovering the main view gives the date and all sources' values at that date, ordered by value, and emphasizes the hovered source. A side bar chart shows each source's summed sessions for the brushed interval, sorted descending and updating live; its totals must come from the same interval and use inclusive calendar dates. Clear the brush to restore the full period. The streams must meet without gaps or overlap, never connect different sources as one path, and keep readable axes during brushing. No Python kernel or network may be required.
