import hmplot as hm

# Six observations scored from 0 to 100 in three bands, and a second table with a score column
# of its own.
observations = {"x": [0, 1, 2, 3, 4, 5], "y": [2, 4, 3, 5, 4, 6], "score": [8, 25, 42, 58, 78, 96],
                "group": ["Low", "Low", "Middle", "Middle", "High", "High"]}
comparison = {"x": [0, 1, 2, 3, 4, 5], "y": [6, 5, 6, 4, 3, 2], "score": [20, 35, 40, 60, 74, 82]}
# One normalization feeds a color scale and a size scale, so a score means the same in both.
shared = hm.normalization(domain=[0, 100])
color = hm.continuous(normalization=shared, colormap="Viridis")
size = hm.continuous(normalization=shared, range=[8, 22])
# An ordinal colormap samples its colors in the categories' order.
ordered = hm.ordinal(domain=["Low", "Middle", "High"], colormap="Viridis")
bounds = {"x": {"domain": [-0.3, 5.3]}, "y": {"domain": [1, 7]}}
outline = {"outline_color": "#263545", "outline_width": 0.25}

with hm.Scene() as scene:
    # Panels at least 360 px wide, 20 px apart: two to a line at the docs' width, one on a phone.
    with hm.Row(wrap=True, min_width=360, gap=20):
        with hm.Column(gap=6):
            hm.Title("One source, two encodings")
            hm.Markdown("Color and size use one normalization. The same score keeps the same meaning in either "
                        "channel.", color="#627080")
            with hm.Plot(data=observations, height=310, axes2d=True, **bounds):
                points = hm.Points(x="x", y="y", fill="score", size="score", fill_scale=color, size_scale=size,
                                   **outline)
                hm.Legend(target=points, channel="fill", label="Score", position="right")
        with hm.Column(gap=6):
            hm.Title("Separate data scope")
            hm.Markdown("This table also has a “score” column. Its automatic scale remains independent.",
                        color="#627080")
            with hm.Plot(data=comparison, height=310, axes2d=True, **bounds):
                hm.Points(x="x", y="y", fill="score", size=6, **outline)
        with hm.Column(gap=6):
            hm.Title("Ordered categories")
            hm.Markdown("An ordinal colormap samples colors in the supplied category order.", color="#627080")
            with hm.Plot(data=observations, height=270, axes2d=True, **bounds):
                bands = hm.Points(x="x", y="y", fill="group", fill_scale=ordered, size=7.5, **outline)
                hm.Legend(target=bands, channel="fill", label="Band", position="right")
scene
