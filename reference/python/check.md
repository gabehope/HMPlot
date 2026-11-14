# check

Draw a plot headlessly and say what it drew: errors, each mark's rows and columns, the axes, and a PNG.

## Example

```python
with hm.Plot(data={"x": [1, 2, 3], "y": [3, 1, 2]}, axes2d=True) as plot:
    hm.Points(x="x", y="y")
result = hm.check(plot)
print(result)
result.save_png("plot.png")
```

## Parameters

- `target` (`Node`): A Plot, Facet, Scene or layout (or a mark with data=); the check draws the scene that holds it.
- `scale` (`number`): The PNG's pixel ratio. Default: 1.
- `vector` (`boolean`): Also make the SVG export, for its report of what it draws as images. Default: true.
- `timeout` (`number`): Seconds to wait for the scene to draw. Default: 60.
- `session` (`ExportSession`): A session whose browser to reuse, for several checks.
- `returns` (`CheckResult`): ok, errors, warnings, plots (each plot's marks with their rows and columns, its axes, size and description), png (bytes), save_png(path), summary() (also str(result)) and to_dict().

## Usage

`hm.check(plot)` draws the scene that holds `plot` in a private headless Chrome, as `hm.export_png` does, and returns what it drew, so a program (or an agent writing one) can see its result and fix its own mistakes without a notebook:

- `errors`: Python's validation errors and every error the browser showed (a missing column, a failed transform), each naming the component and what to pass instead. `ok` is true without any.
- `plots`: each plot's marks with their row counts and the columns they draw, its axes' ranges (or categories), its size in CSS pixels and its description (the summary screen readers get).
- `warnings`: marks that drew no rows, a legend whose mark has not bound yet, and what SVG and PDF exports draw as images rather than vectors (the export report; `vector=False` skips it).
- `lints`: what runs but does nothing or looks wrong, each naming the component and the fix: a Legend that explains nothing (no mark maps its channel), a Filter on `"@brushed"` over data no mark brushes, a color mapped from data with no legend to say which color is which (a color repeating the x or y column needs none), an explicit `x` or `y` domain at least 20 times wider than the data, or one holding none of it (in 3D, data past the domain, which draws outside the axes), category labels hidden where they would overlap, and points at least half the plot across (a size drawn as pixels). `strict=True` lists each lint as an error instead, so `ok` is false while any is left.
- `png`: the scene as drawn, `scale` times its CSS pixels (a fixed-width Plot at its own width); `save_png(path)` writes it.

`str(result)` (or `result.summary()`) is all of it as text; `result.to_dict()` is the same as JSON-ready data. In a notebook the result shows the PNG with the summary. A scene that fails before its plots draw has its errors and no PNG.

`timeout=60` gives each wait for component preparation or first-frame readiness 60 seconds, including the initial mount. Increase it for large scenes on software WebGPU. It is not an overall deadline for resource loading and image export.

```text
check: 1 plot drawn, no errors.
Plot 1, 1200 x 400 px, 2d:
  Points: 3 rows; x: x, y: y
  axes: x 0.9 to 3.1; y 0.9 to 3.1
  description: Scatter plot of y against x. x from 0.9 to 3.1, y from 0.9 to 3.1. 3 points.
png: 1200 x 400 px
```

## From the command line

`hmplot check plot.py` (or `python -m hmplot check plot.py`) runs a program as a notebook cell runs, in its own folder, and checks what it shows: its last line when that is a component (as a notebook displays it), else each component it leaves at top level, else each plot it exported (a plot built and exported inside `main()`). It prints the summary, saves the PNG beside the program as `plot.check.png` (`--png PATH` elsewhere, `--no-png` not at all) and exits with 0 when every check passed, 1 when the program raised (with the line: `plot.py:3: TypeError: Points: unknown property 'colr'. Did you mean 'color'?`) or a check found errors, and 2 when there was nothing to check or no browser could draw. `--json` prints the result as JSON, `--scale` sets the PNG's pixel ratio, and `--strict` counts lints as errors.

The browser is the exports' (`hm.install_chrome`): an installed Chrome, Edge or Chromium, else Chrome for Testing, downloaded once; WebGPU on the machine's GPU, or on SwiftShader's software adapter where there is none. Reuse one `hm.ExportSession()` as `session=` for many checks.

An MCP server can offer the check to an agent as one tool: take a program's path, run `hmplot check PATH --json`, and return the JSON with the saved PNG as an image.
