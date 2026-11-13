"""Write the fixtures of tests/browser/python-templates.spec.js (Stage 27).

static/test/notebook-templates.json is a scene built with templates (hm.Template,
@hm.template, hm.slot()) inside a Row, a Plot, a Facet, a Partition, and a graph layout;
static/test/notebook-templates-plain.json is the same scene written out by hand. The spec
checks the two render the same. static/test/notebook-templates-tree.json is hm.visualize_tree of
the templated scene, whose hovered node highlights its path (R2.0b.5).
static/test/notebook-templates-follow.json is a lollipop template whose head is its main part, so
the stems follow it (TODO 130.2 slice 9a), and a group with a declared legend entry (slice 9b). Run from anywhere:
python3 scripts/generate-template-fixtures.py [templates | templates-plain | templates-tree | templates-follow ...]
"""
from pathlib import Path
import base64, json, sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "python"))
import hmplot as hm

PLAIN = dict(width=260, height=180, responsive=False, tone_mapping=0, axes2d=False)
FRAME = dict(x={"domain": [0, 4]}, y={"domain": [0, 4]}, **PLAIN)
POINTS = {"x": [1.0, 2.0, 3.0], "y": [1.0, 3.0, 2.0], "g": ["a", "b", "a"]}
EDGES = {"source": ["p", "p"], "target": ["q", "r"]}
NODES = {"id": ["p", "q", "r"], "x": [0.0, -1.0, 1.0], "y": [1.0, 0.0, 0.0]}
RED, BLUE, GREEN = "#ff0000", "#0000ff", "#00c800"


class Panel(hm.Template):
    """A Plot whose blue markers are drawn after, so over, the caller's children."""

    def build(self, data, name):
        with hm.Data(data):
            with hm.Plot(name=name, **FRAME):
                hm.slot()
                hm.Points(x="x", y="y", size=4, fill=BLUE)


@hm.template
def mapped():
    with hm.Mapping(x="x", y="y"):
        hm.slot()


@hm.template
def layer():
    hm.slot()


@hm.template
def stem():
    """Two sibling marks and no slot."""
    hm.charts.ErrorBars(x="x", y="y", lower=0, upper="y", color=GREEN, width=3, cap_size=0)
    hm.Points(x="x", y="y", size=6, fill=RED)


class Lollipop(hm.Template):
    """Stems and heads; the heads are the main part, so the legend and visibility are theirs."""

    def build(self, x, y):
        hm.charts.ErrorBars(x=x, y=y, lower=0, upper=y, color=GREEN, width=3, cap_size=0)
        head = hm.Points(x=x, y=y, size=8, fill=RED, label="Lollipops")
        hm.contract(main=head)


# Large enough for the plot's settings button (the pane lists a template as one group).
BIG = {**FRAME, "width": 340, "height": 260}


@hm.template
def faceted():
    """A Facet inside the template: each cell's stems follow that cell's heads."""
    with hm.Facet(column="g"):
        with hm.Plot(name="faceted", **FRAME):
            hm.charts.ErrorBars(x="x", y="y", lower=0, upper="y", color=GREEN, width=3, cap_size=0)
            head = hm.Points(x="x", y="y", size=8, fill=RED, label="Faceted")
            hm.Legend()
    hm.contract(main=head)


@hm.template
def dumbbell():
    """A group whose declared legend entry stands for the stems and both ends; the blue
    markers keep their own entry."""
    start = hm.Points(x="x", y=0, size=8, fill=RED)
    stem = hm.charts.ErrorBars(x="x", y="y", lower=0, upper="y", color=GREEN, width=3, cap_size=0)
    end = hm.Points(x="x", y="y", size=8, fill=RED)
    hm.Points(x="y", y="x", size=6, fill=BLUE, label="Other")
    hm.contract(legend_entries=[{"label": "Change", "swatch": end, "parts": [start, stem, end]}])


def follow():
    with hm.Scene() as scene:
        with hm.Data(POINTS):
            with hm.Row(gap=16):
                with hm.Plot(name="lollipop", **BIG):
                    Lollipop("x", "y")
                    hm.Legend()
                faceted()
                with hm.Plot(name="dumbbell", **BIG):
                    dumbbell()
                    hm.Legend()
    return scene


def panel(data, name, children):
    """Panel written out by hand."""
    with hm.Data(data):
        with hm.Plot(name=name, **FRAME):
            children()
            hm.Points(x="x", y="y", size=4, fill=BLUE)


def build(templated):
    with hm.Scene() as scene:
        with hm.Row(gap=16):
            if templated:
                with Panel(POINTS, "points"):
                    hm.Points(x="x", y="y", size=10, fill=RED)
                with Panel(POINTS, "line"):
                    hm.Line(x="x", y="y", color=GREEN, width=3)
            else:
                panel(POINTS, "points", lambda: hm.Points(x="x", y="y", size=10, fill=RED))
                panel(POINTS, "line", lambda: hm.Line(x="x", y="y", color=GREEN, width=3))
        with hm.Data(POINTS):
            with hm.Row(gap=16):
                with hm.Facet(column="g"):
                    with hm.Plot(name="facet", **FRAME):
                        with (mapped() if templated else hm.Mapping(x="x", y="y")):
                            hm.Points(size=7, fill=RED)
                with hm.Plot(name="partition", **FRAME):
                    with hm.Partition(by="g"):
                        with (mapped() if templated else hm.Mapping(x="x", y="y")):
                            hm.Line(color=GREEN, width=3)
                            hm.Points(size=5, fill=BLUE)
                with hm.Plot(name="stem", **FRAME):
                    if templated:
                        stem()
                    else:
                        hm.charts.ErrorBars(x="x", y="y", lower=0, upper="y", color=GREEN, width=3, cap_size=0)
                        hm.Points(x="x", y="y", size=6, fill=RED)
        with hm.Data(EDGES):
            with hm.GraphData(nodes=NODES, edges=EDGES, node_key="id", source="source", target="target"):
                with hm.Nodes():
                    with hm.Calculate(columns={"x": "x", "y": "y"}):
                        with hm.Plot(name="graph", x={"domain": [-2, 2]}, y={"domain": [-1, 2]}, **PLAIN):
                            if templated:
                                with layer():
                                    with hm.Edges():
                                        hm.Segments(start="start", end="end", color=GREEN, width=3)
                            else:
                                with hm.Edges():
                                    hm.Segments(start="start", end="end", color=GREEN, width=3)
                            with hm.Nodes():
                                hm.Points(position="position", size=8, fill=RED)
    return scene


if set(sys.argv[1:]) - {"templates", "templates-plain", "templates-tree", "templates-follow"}:
    raise SystemExit("Choose templates, templates-plain, templates-tree, or templates-follow; omit names to generate all.")

for scene, name in ((build(True), "templates"), (build(False), "templates-plain"),
                    (hm.visualize_tree(build(True))._scene(), "templates-tree"), (follow(), "templates-follow")):
    # Optional fixture names allow regenerating one changed scene without UUID churn elsewhere.
    if sys.argv[1:] and name not in sys.argv[1:]:
        continue
    scene._validate()
    state, columns = scene._snapshot()
    data = {
        "metadata": {k: c.descriptor() for k, c in columns.items()},
        "state": state,
        "buffers": {k: base64.b64encode(c.payload).decode() for k, c in columns.items()},
    }
    (root / "static/test" / f"notebook-{name}.json").write_text(json.dumps(data))
    print(f"notebook-{name}.json")
