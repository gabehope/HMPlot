"""Write static/test/notebook-<name>.json from recipes (src/recipes/<name>.py, its `chart`), for
browser specs that draw a recipe from Python (tests/browser/pipeline-reference-python.spec.js).
Run: python3 scripts/generate-recipe-fixtures.py 33_live_route_statistics
"""
from pathlib import Path
import base64, json, runpy, sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "python"))
# A recipe's fixture is named as its number puts it among the notebook fixtures.
FIXTURES = {"33_live_route_statistics": "83_live_route_statistics", "34_live_readout": "84_live_readout",
            "35_focus_context": "85_focus_context", "36_stacked_panels": "86_stacked_panels",
            "37_layered_dag": "87_layered_dag", "38_sankey": "88_sankey",
            # TODO 144: chained-pipeline versions (src/recipes/fluent) drawn as the nested ones are.
            "fluent/10_linked_brushing": "89_fluent_linked_brushing",
            "fluent/24_click_drilldown": "90_fluent_click_drilldown",
            "fluent/33_live_route_statistics": "91_fluent_live_route_statistics",
            "fluent/34_live_readout": "92_fluent_live_readout"}
for name in sys.argv[1:] or FIXTURES:
    chart = runpy.run_path(str(root / "src/recipes" / f"{name}.py"))["chart"]
    state, columns = chart._scene()._snapshot()
    data = {"metadata": {k: c.descriptor() for k, c in columns.items()}, "state": state,
            "buffers": {k: base64.b64encode(c.payload).decode() for k, c in columns.items()}}
    (root / "static/test" / f"notebook-{FIXTURES.get(name, name)}.json").write_text(json.dumps(data))
    print(f"notebook-{FIXTURES.get(name, name)}.json")
