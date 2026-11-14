const t=`import json
from pathlib import Path
from tempfile import TemporaryDirectory
import hmplot as hm

@hm.template
def candles(x, opening, closing, low, high, width=0.65, rising="#15805d", falling="#d34b37"):
    hm.charts.ErrorBars(x=x, y=hm.divide(hm.add(low, high), 2), lower=low, upper=high, cap_size=0, color="#334155", width=1.2)
    with hm.Calculate(columns={"left": hm.subtract(x, width / 2), "right": hm.add(x, width / 2),
                               "bottom": hm.minimum(opening, closing), "top": hm.maximum(opening, closing)}):
        with hm.Filter(where=hm.greater_equal(closing, opening)):
            hm.Rect(x0="left", x1="right", y0="bottom", y1="top", fill=rising)
        with hm.Filter(where=hm.less(closing, opening)):
            hm.Rect(x0="left", x1="right", y0="bottom", y1="top", fill=falling)
    hm.slot()

# Export and reload without changing the downloaded example files.
with TemporaryDirectory() as directory:
    candles(hm.template_param("x", default="day"), hm.template_param("opening", default="open"),
            hm.template_param("closing", default="close"), hm.template_param("low", default="low"),
            hm.template_param("high", default="high"), width=hm.template_param("width", default=0.65),
            rising=hm.template_param("rising", default="#15805d"),
            falling=hm.template_param("falling", default="#d34b37")).export_template(Path(directory) / "candlestick.hmplot.json")
    pattern = hm.load_template(Path(directory) / "candlestick.hmplot.json")

data = json.loads(Path("data.json").read_text())
with hm.Plot(data=data, responsive=True, height=380, x={'label': 'Trading day', 'domain': [-1, 30]}, y={'label': 'Price ($)'}) as plot:
    pattern()
plot
`;export{t as default};
