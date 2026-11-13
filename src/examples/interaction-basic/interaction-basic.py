import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
# Clicked points join the selection; Interaction names it @focus, a column the Filter reads.
focus = hm.selection()
with hm.Data(data) as table:
    with hm.Interaction(columns={"@focus": focus}):
        with hm.Plot(height=300, axes2d=True):
            hm.Points(x="x", y="y", select=focus, size=4)
            # The Interaction names the selection's column: a Filter reads it.
            with hm.Filter(where="@focus", inactive="none"):
                hm.Points(x="x", y="y", size=8, fill="#e0245e")
table
