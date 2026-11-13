"""Draw the defaults gallery's references (TODO 136.17): each chart's data as JSON, then the chart
as Vega-Lite and Observable Plot draw it (references.mjs) and as ggplot draws it (plotnine), each
with its defaults, into references/<library>/<name>.png. The gallery's report shows them beside
HMPlot's. Run `npm run gallery:references` (plotnine: `.venv/bin/python -m pip install plotnine`;
without it the ggplot references are left as they are).
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from charts import CHARTS  # noqa: E402

WIDTH, HEIGHT, DPI = 480, 320, 96


def columns(data):
    """The chart's data as JSON columns: dates as ISO strings."""
    out = {}
    for key, values in data.items():
        values = np.asarray(values)
        out[key] = values.astype(str).tolist() if values.dtype.kind in "MUSO" else values.tolist()
    return out


def ggplot(name, frame):
    """The chart in plotnine, with its defaults; None where ggplot has no such chart."""
    from plotnine import (aes, coord_flip, facet_wrap, geom_area, geom_boxplot, geom_col, geom_histogram,
                          geom_line, geom_point, geom_segment, geom_text, geom_tile, geom_violin, ggplot as g,
                          scale_y_reverse)
    import pandas as pd
    charts = {
        "scatter": lambda: g(frame, aes("x", "y")) + geom_point(),
        "scatter-categorical": lambda: g(frame, aes("length", "width", color="species")) + geom_point(),
        "bubbles": lambda: g(frame, aes("gdp", "life", size="people")) + geom_point(),
        "line-time": lambda: g(frame.assign(date=pd.to_datetime(frame.date)), aes("date", "price")) + geom_line(),
        "lines": lambda: g(frame, aes("hour", "temperature", color="city")) + geom_line(),
        "area": lambda: g(frame, aes("week", "visits")) + geom_area(),
        "stacked-area": lambda: g(frame, aes("week", "visits", fill="source")) + geom_area(),
        "bars": lambda: g(frame, aes("fruit", "sold")) + geom_col(),
        "bars-horizontal": lambda: g(frame, aes("fruit", "sold")) + geom_col() + coord_flip(),
        "grouped-bars": lambda: g(frame, aes("region", "sales", fill="year")) + geom_col(position="dodge"),
        "stacked-bars": lambda: g(frame, aes("region", "sales", fill="year")) + geom_col(),
        "histogram": lambda: g(frame, aes("score")) + geom_histogram(),
        "boxplot": lambda: g(frame, aes("species", "length")) + geom_boxplot(),
        "violin": lambda: g(frame, aes("species", "length")) + geom_violin(),
        "lollipop": lambda: g(frame, aes("fruit", "sold")) + geom_segment(aes(xend="fruit", yend=0)) + geom_point(),
        # Row 0 at the top, as the other references draw it.
        "heatmap": lambda: g(frame, aes("column", "row", fill="value")) + geom_tile() + scale_y_reverse(),
        "annotated-line": lambda: g(frame, aes("t", "v")) + geom_line()
        + geom_text(pd.DataFrame({"t": [9.4], "v": [60], "text": ["peak"]}), aes(label="text")),
        "small-multiples": lambda: g(frame, aes("x", "y")) + geom_point() + facet_wrap("site"),
    }
    return charts[name]() if name in charts else None


def main():
    # Each library's references are drawn afresh, so a renamed or dropped chart leaves none behind.
    clear = lambda library: [png.unlink() for png in (HERE / "references" / library).glob("*.png")]
    clear("vega-lite"), clear("plot")
    with tempfile.TemporaryDirectory() as folder:
        for chart in CHARTS:
            (Path(folder) / f"{chart.name}.json").write_text(json.dumps(columns(chart.data())))
        subprocess.run(["node", str(HERE / "references.mjs"), folder], check=True)
    try:
        import pandas as pd
        import plotnine  # noqa: F401
    except ImportError:
        print("plotnine is not installed: the ggplot references are left as they are.")
        return
    out = HERE / "references" / "ggplot"
    out.mkdir(parents=True, exist_ok=True)
    clear("ggplot")
    for chart in CHARTS:
        plot = ggplot(chart.name, pd.DataFrame(columns(chart.data())))
        if plot is not None:
            plot.save(out / f"{chart.name}.png", width=WIDTH / DPI, height=HEIGHT / DPI, dpi=DPI, verbose=False)
            print(f"ggplot/{chart.name}.png")


if __name__ == "__main__":
    main()
