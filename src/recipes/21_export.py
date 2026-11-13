"""Save a chart: interactive HTML, PNG, SVG, or a check of what it drew
export_html writes a standalone interactive page; check renders headlessly and reports errors."""
import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Plot(data=data, height=300) as chart:
    hm.Line(x="x", y="y")

# hm.check(chart).summary()            errors, row counts, axes and a PNG, rendered headlessly
# hm.export_html(chart, "chart.html")   a standalone page that stays interactive
# hm.export_png(chart, "chart.png")     also export_svg and export_pdf
# From a shell: hmplot check program.py
chart
