import hmplot as hm

data = {"a": [1, 2, 3, 4], "b": [4, 2, 3, 1], "y": [3, 1, 4, 2]}
# "$column" reads the input where a string names a column: x plots the chosen one.
with hm.Scene() as scene:
    hm.Select(name="column", options=["a", "b"])
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="$column", y="y")
scene
