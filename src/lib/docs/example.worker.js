// The docs editor's Python (R2.0b.4): Pyodide in a worker, from its CDN at the version the npm
// package pins, with the package installed from the wheel the site builds
// (scripts/build_examples.py). Before each run it loads the packages the code imports and copies
// the example's data files next to it; `urllib`, `requests` and `pd.read_csv(url)` fetch through
// pyodide-http. With an interrupt buffer (a cross-origin isolated page), Stop raises
// KeyboardInterrupt; without one the page terminates the worker.
import { loadPyodide, version } from "pyodide";

let pyodide;
async function runtime(wheel) {
  if (pyodide) return pyodide;
  pyodide = await loadPyodide({ indexURL: `https://cdn.jsdelivr.net/pyodide/v${version}/full/` });
  await pyodide.loadPackage(["micropip", "numpy", "pyodide-http"]);
  // The notebook widget's packages (anywidget, ipywidgets) and imageio-ffmpeg are not needed here.
  await pyodide.pyimport("micropip").install.callKwargs(new URL(wheel, self.location.href).href, { deps: false });
  pyodide.runPython("import pyodide_http; pyodide_http.patch_all()");
  return pyodide;
}

self.onmessage = async ({ data }) => {
  if (data.type !== "run") return;
  try {
    const py = await runtime(data.wheel);
    if (data.interrupt) py.setInterruptBuffer(data.interrupt);
    await py.loadPackagesFromImports(data.source);
    const folder = "/home/pyodide/example";
    py.FS.mkdirTree(folder);
    for (const file of data.files ?? []) {
      const response = await fetch(new URL(file.url, self.location.href));
      if (!response.ok) throw Error(`The example's file ${file.name} could not be loaded (${response.status}).`);
      py.FS.writeFile(`${folder}/${file.name}`, new Uint8Array(await response.arrayBuffer()));
    }
    py.globals.set("_example_source", data.source);
    py.globals.set("_example_tree", Boolean(data.tree));
    const result = await py.runPythonAsync(`
import base64, contextlib, io, json, os
import hmplot as hm
from hmplot.core import Node

os.chdir("/home/pyodide/example")
namespace = {"__name__": "__main__"}
output = io.StringIO()
with contextlib.redirect_stdout(output):
    exec(compile(_example_source, "<example>", "exec"), namespace)
handles = [value for value in namespace.values() if isinstance(value, Node)]
# A chain's hm.Data (TODO 144) is a source the displayed scene includes, not a display handle.
roots = list({id(value): value for value in handles if value.parent is None and not getattr(value, "_chain_root", False)}.values())
if len(roots) == 1:
    selected = roots[0]
elif not roots and handles:
    selected = handles[-1]
else:
    raise RuntimeError("Keep one display handle at top level, such as a Plot or a Scene.")

def payload(node):
    scene = node._scene()
    scene._validate()
    state, columns = scene._snapshot()
    return {"state": state, "columns": {key: {"descriptor": column.descriptor(),
                                             "payload": base64.b64encode(column.payload).decode("ascii")}
                                       for key, column in columns.items()}}

json.dumps({"payload": payload(selected), "tree": payload(hm.visualize_tree(selected)) if _example_tree else None,
            "stdout": output.getvalue()})
`);
    self.postMessage({ type: "result", value: JSON.parse(result) });
  } catch (error) {
    // The traceback from the example's first frame (Pyodide's own come first), and the line of
    // the example it points at, for the editor's mark.
    let message = error?.message ?? String(error);
    const first = message.indexOf('  File "<example>"');
    if (message.startsWith("Traceback") && first > 0) message = `Traceback (most recent call last):\n${message.slice(first)}`;
    const lines = [...message.matchAll(/File "<example>", line (\d+)/g)];
    self.postMessage({ type: "error", error: message, line: lines.length ? Number(lines.at(-1)[1]) : null });
  }
};
