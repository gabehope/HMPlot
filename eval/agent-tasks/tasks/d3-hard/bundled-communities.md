+++
schema = 1
id = "bundled-communities"
category = "interaction"
data = ["contacts"]
source = "d3-hard"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900
inspiration = "https://observablehq.com/@d3/hierarchical-edge-bundling"

[[checks]]
kind = "text"
all = ["Community connections"]

[[checks]]
kind = "views"
min = 1

[[checks]]
kind = "interaction"
action = "hover"
+++

`data/people.csv` has 400 people (person, community and other attributes) and `data/contacts.csv` contains undirected contact edges (source, target). Make a radial hierarchical edge-bundling diagram titled "Community connections". Group leaves by their eight communities around the circle, with clear community labels and stable community colors. Route each contact as a curved path through the source community, root and target community, with a bundling-strength control from 0 (direct) to 1 (strongly bundled). Draw every contact exactly once. Hovering a person emphasizes that person's incident contacts and neighbors while fading unrelated paths; clicking pins the focus, and a reset control clears it. Beside the circle, show the focused person's ID and community, degree, and a sorted neighbor list; without a focus show a community-to-community contact matrix. Avoid a ring of 400 overlapping text labels: reveal individual names on focus/hover while preserving usable pick targets. Moving the bundling control must retain focus and update the actual curves. All interactions work in the standalone HTML page without a Python kernel or network.
