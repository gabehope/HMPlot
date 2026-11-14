const e=`import numpy as np
import hmplot as hm

# 144 people in three regions, placed by two features. In the large view, hover a point, click to
# select (Shift-click toggles) and Shift-drag to brush. Beside it, the brushed rows in another
# projection, and the selected rows with the hovered one, labeled.
index = np.arange(144)
region = index % 3
phase = index * 0.73 + region * 0.9
observations = {
    "id": [f"P{i + 1:03d}" for i in index],
    "group": np.array(["North", "Central", "South"])[region],
    "x": 50 + 38 * np.sin(phase) * (0.7 + (index % 11) / 36),
    "y": 50 + 36 * np.cos(index * 0.41 + region) * (0.72 + (index % 7) / 30),
    "score": (np.sin(index * 0.29) + 1) / 2,
    "response": (np.cos(index * 0.17 + region) + 1) / 2,
}
feature_a = {"domain": [5, 95], "label": "Feature A"}
feature_b = {"domain": [5, 95], "label": "Feature B"}

# Shared side margins align the detail panels in both language versions.
panel_margins = {"axis_margin_left": 52, "axis_margin_right": 14}

with hm.Scene(gap=12) as explorer:
    hm.Markdown("Hover points, click to replace the selection, Shift-click to toggle, and Shift-drag to brush. "
                "Click an empty spot to clear the selection; press Escape, or use the brush's Clear all, to clear "
                "the brush.")
    with hm.Data(observations, key="id"):
        # The large view and a narrower column of details, 16 px apart; one column once the details
        # would be narrower than 270 px, where the two details sit side by side while they fit.
        with hm.Row(widths=[1.55, 0.8], wrap=True, min_width=270, gap=16):
            with hm.Plot(title="Shared interaction surface", height=460, axes2d=True, x=feature_a, y=feature_b):
                hm.Points(x="x", y="y", fill="group", size=5.5, outline_color="#ffffff", outline_width=0.35,
                          select=True, hover=True, brush=True, respond=["selected", "brushed", "hovered"],
                          selection_opacity=0.1)
            with hm.Row(wrap=True, min_width=260, gap=14):
                with hm.Plot(**panel_margins, title="Brushed rows in another projection", height=223, axes2d=True,
                             x={"domain": [0, 1], "label": "Score"}, y={"domain": [0, 1], "label": "Response"}):
                    with hm.Filter(where="@brushed", inactive="none"):
                        hm.Points(x="score", y="response", fill="group", size=5, respond="hovered",
                                  selection_opacity=0.2)
                with hm.Plot(**panel_margins, title="Selected rows and live hover", height=223, axes2d=True, x=feature_a,
                             y=feature_b):
                    with hm.Filter(where="@selected", inactive="none"):
                        hm.Points(x="x", y="y", fill="group", size=6)
                    with hm.Filter(where="@hovered", inactive="none"):
                        hm.Points(x="x", y="y", size=11, shape="circle-open", fill="#263545")
                        hm.Text(x="x", y="y", text="id", dy=-20, size=12, color="#263545")
`;export{e as default};
