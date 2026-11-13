import hmplot as hm

data = {"source": ["in", "in", "a", "b"], "target": ["a", "b", "out", "out"], "value": [3, 2, 3, 2]}
with hm.Plot(data=data, height=300) as plot:
    with hm.GraphData(source="source", target="target"):
        with hm.Sankey(value="value"):
            with hm.Edges():
                hm.Flow(start_lower="startLower", end_lower="endLower",
                        start_upper="startUpper", end_upper="endUpper")
plot
