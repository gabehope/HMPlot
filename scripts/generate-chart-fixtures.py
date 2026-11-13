"""Write the Python half of tests/browser/charts.spec.js (TODO 130.4): each chart's reference
example (src/examples/<id>-basic/<id>-basic.py) run and snapshotted as
static/test/notebook-chart-<id>.json, so the spec draws the chart from Python as from Svelte.
Run from anywhere: python3 scripts/generate-chart-fixtures.py
Or update selected charts: python3 scripts/generate-chart-fixtures.py EndLabels
"""
from pathlib import Path
import base64, json, re, runpy, sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "python"))

charts = json.loads((root / "src/lib/scene/options.charts.json").read_text())
selected = set(sys.argv[1:])
if unknown := selected - charts.keys():
    raise SystemExit(f"Unknown chart(s): {', '.join(sorted(unknown))}")
for kind in charts:
    if selected and kind not in selected:
        continue
    page = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", kind).lower()
    program = root / "src/examples" / f"{page}-basic" / f"{page}-basic.py"
    scene = runpy.run_path(str(program))["plot"]._scene()
    scene._validate()
    state, columns = scene._snapshot()
    data = {
        "metadata": {k: c.descriptor() for k, c in columns.items()},
        "state": state,
        "buffers": {k: base64.b64encode(c.payload).decode() for k, c in columns.items()},
    }
    (root / "static/test" / f"notebook-chart-{page}.json").write_text(json.dumps(data))
    print(f"notebook-chart-{page}.json")
