from pathlib import Path
import json, base64, sys

r = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(r / "python"))
import hmplot as hm

# Notebook names (e.g. 27_lollipop) regenerate only those fixtures; none regenerates every one.
only = set(sys.argv[1:])
for path in (r / "python/examples").glob("*.ipynb"):
    if only and path.stem not in only:
        continue
    n = json.loads(path.read_text())
    ns = {}
    cell = next(c for c in n["cells"] if c["cell_type"] == "code")
    try:
        exec("".join(cell["source"]), ns)
        roots = [
            v for v in ns.values() if isinstance(v, hm.core.Node) and v.parent is None
        ]
        scene = next((v for v in roots if isinstance(v, hm.Scene)), roots[0]._scene())
        state, columns = scene._snapshot()
        data = {
            "metadata": {k: c.descriptor() for k, c in columns.items()},
            "state": state,
            "buffers": {
                k: base64.b64encode(c.payload).decode() for k, c in columns.items()
            },
        }
        (r / "static/test" / f"notebook-{path.stem}.json").write_text(json.dumps(data))
        print(path.name, "OK")
    except Exception as e:
        print(path.name, type(e).__name__, e)
        raise
