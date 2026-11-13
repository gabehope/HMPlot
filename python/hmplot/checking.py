"""Render a scene headlessly and say what it drew: hm.check and `hmplot check` (R2.8).

An agent, or a person without a notebook, builds a plot, checks it, reads the summary and looks at
the PNG, then fixes what is wrong. The scene is drawn as the exports draw it (exporter.py: a
private headless Chrome with WebGPU, SwiftShader's where there is no GPU).
"""

from __future__ import annotations

import ast
import base64
import contextlib
import json
import os
import struct
import sys
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .core import Node


@dataclass
class CheckResult:
    """What hm.check found: ``errors`` (each a message naming the component, from Python's
    validation or the browser), ``warnings`` (what the SVG export draws as images and why, marks
    that drew no rows, what the page logged), ``lints`` (what runs but does nothing, or looks
    wrong: a legend that explains nothing; ``strict=True`` lists them as errors), ``plots`` (each
    mounted plot: its marks with their row counts and columns, its axes' ranges, its size and
    description) and ``png`` (the scene as the browser drew it). ``ok`` is True without errors.
    ``str(result)`` is the summary.

    Example:
        result = hm.check(plot)
        print(result)
        result.save_png("plot.png")
    """

    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    #: What runs but does nothing or looks wrong, each naming the component and the fix (TODO
    #: 136.13). ``check(strict=True)`` lists them with the ``errors`` instead.
    lints: list[str] = field(default_factory=list)
    plots: list[dict[str, Any]] = field(default_factory=list)
    png: bytes | None = None
    report: dict[str, Any] | None = None
    #: Each error, warning and lint the browser reported as a dict: severity, code, component,
    #: node (the scene node's id), property, message and hint (TODO 136.6).
    diagnostics: list[dict[str, Any]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        """True when the scene validated and drew without errors."""
        return not self.errors

    @property
    def png_size(self) -> tuple[int, int] | None:
        """The PNG's width and height in pixels."""
        if not self.png or self.png[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        return struct.unpack(">II", self.png[16:24])

    def save_png(self, path: str | Path) -> Path:
        """Write the PNG to path and return the path. Raises when the scene drew none."""
        if self.png is None:
            raise ValueError("check: there is no PNG to save; the scene did not draw (see errors).")
        path = Path(path)
        path.write_bytes(self.png)
        return path

    def to_dict(self) -> dict[str, Any]:
        """The result as JSON-ready data, without the PNG's bytes (its size instead)."""
        return {"ok": self.ok, "errors": list(self.errors), "warnings": list(self.warnings),
                "lints": list(self.lints), "plots": self.plots, "png": list(self.png_size) if self.png_size else None}

    def summary(self) -> str:
        """The result as text: a line per plot and per mark, then the errors and warnings."""
        lines = []
        count = len(self.plots)
        state = "no errors" if self.ok else f"{len(self.errors)} error{'s' * (len(self.errors) != 1)}"
        lines.append(f"check: {count} plot{'s' * (count != 1)} drawn, {state}"
                     + (f", {len(self.warnings)} warning{'s' * (len(self.warnings) != 1)}" if self.warnings else "")
                     + (f", {len(self.lints)} lint{'s' * (len(self.lints) != 1)}" if self.lints else "") + ".")
        for index, plot in enumerate(self.plots):
            lines.extend(_plot_lines(plot, index + 1))
        if self.errors:
            lines.append("errors:")
            lines.extend(f"  - {error}" for error in self.errors)
        if self.warnings:
            lines.append("warnings:")
            lines.extend(f"  - {warning}" for warning in self.warnings)
        if self.lints:
            lines.append("lints:")
            lines.extend(f"  - {lint}" for lint in self.lints)
        size = self.png_size
        lines.append(f"png: {size[0]} x {size[1]} px" if size else "png: none")
        return "\n".join(lines)

    __str__ = summary

    def _repr_mimebundle_(self, include=None, exclude=None):
        bundle = {"text/plain": self.summary()}
        if self.png:
            bundle["image/png"] = base64.b64encode(self.png).decode("ascii")
        return bundle


def _value(value):
    if isinstance(value, dict) and "categories" in value:
        return ", ".join(map(str, value["categories"][:8])) + (" ..." if len(value["categories"]) > 8 else "")
    if isinstance(value, dict) and "low" in value:
        scale = f" ({value['kind']})" if value.get("kind") not in (None, "numeric") else ""
        return f"{value['low']} to {value['high']}{scale}"
    return None


def _plot_lines(plot, number):
    model = plot.get("model") or {}
    # Its title, else its name, else its place in the scene.
    name = repr(plot.get("title") or plot.get("name")) if plot.get("title") or plot.get("name") else str(number)
    where = f" (cell {', '.join(str(v) for v in (plot.get('cell') or {}).values() if v is not None)})" if plot.get("cell") else ""
    size = f", {plot['width']} x {plot['height']} px" if plot.get("width") is not None else ""
    coordinates = model.get("coordinates") or "cartesian"
    lines = [f"{plot['kind']} {name}{where}{size}, {model.get('mode') or '2d'}"
             + (f", {coordinates}" if coordinates != "cartesian" else "") + ":"]
    marks = model.get("marks") or []
    if not marks:
        lines.append("  no marks")
    for mark in marks:
        channels = ", ".join(f"{key}: {value}" for key, value in mark.items()
                             if key not in ("kind", "rows", "categories") and isinstance(value, str))
        rows = mark.get("rows")
        # Rows are counted from a table; a mark given arrays has none to count.
        text = f"  {mark.get('kind')}: " + (f"{rows} row{'s' * (rows != 1)}" if rows is not None else "drawn from arrays")
        lines.append(text + (f"; {channels}" if channels else ""))
        for channel, categories in (mark.get("categories") or {}).items():
            lines.append(f"    {channel} categories: {', '.join(map(str, categories[:8]))}"
                         + (f" and {len(categories) - 8} more" if len(categories) > 8 else ""))
    axes = [f"{axis} {_value(value)}" for axis, value in (model.get("axes") or {}).items()
            if value and _value(value) and (axis != "z" or model.get("mode") == "3d")]
    if axes:
        lines.append(f"  axes: {'; '.join(axes)}")
    if plot.get("description"):
        lines.append(f"  description: {plot['description']}")
    return lines


def _nodes(scene):
    found = {}

    def walk(node):
        found[node.id] = node
        for child in node.children:
            walk(child)

    walk(scene)
    return found


def check(target: Node, *, scale: float = 1, vector: bool = True, timeout: float = 60, strict: bool = False,
          session=None) -> CheckResult:
    """Render the scene that holds target headlessly, as the exports do, and return what it drew:
    the validation errors (Python's, and each one the browser showed), each plot's marks with their
    row counts, axes and description, warnings (what the SVG export draws as images, marks that
    drew no rows), lints (what runs but does nothing or looks wrong) and a PNG at ``scale`` times
    the CSS pixels. ``strict=True`` lists each lint as an error, so ``ok`` is False while any
    is left. ``vector=False`` skips the SVG export's report. Pass an ``ExportSession`` to
    reuse its browser. Raises RuntimeError when no headless browser with WebGPU starts (see
    install_chrome).

    ``timeout`` is the seconds allowed for each wait for component preparation or first-frame
    readiness, including the initial mount. It does not bound resource loading or image export.

    Example:
        with hm.Plot(data={"x": [1, 2, 3], "y": [3, 1, 2]}, axes2d=True) as plot:
            hm.Points(x="x", y="y")
        result = hm.check(plot)
        print(result.summary())
        result.ok
    """
    from . import exporter

    if not isinstance(target, Node):
        raise TypeError(f"check takes an HMPlot component, such as a Plot or Scene; received {type(target).__name__}.")
    result = CheckResult()
    try:
        scene = target._scene()
        scene._validate()
        state, columns = scene._snapshot()
    except (TypeError, ValueError, RuntimeError) as error:
        result.errors.append(f"{type(error).__name__}: {error}")
        result.diagnostics.append({"severity": "error", "code": "python." + type(error).__name__,
                                   "message": result.errors[-1]})
        return result
    own = session is None
    session = exporter.ExportSession().__enter__() if own else session
    try:
        session._ensure_browser()
        # Drawn as an image export draws it (exporter.ExportSession._mount).
        payload = {**session.assets.serve(state, columns), "fill": False}
        found = session.page.evaluate(
            "arg => hmplotCheck(arg.payload, arg.options)",
            {"payload": payload, "options": {"scale": scale, "vector": vector, "timeoutMs": timeout * 1000}},
        )
        # The scene stays mounted: the session's next export of it draws without mounting again.
        session._mounted, session._fill = (scene.id, payload["state"]["revision"]), False
    finally:
        if own:
            session.__exit__(None, None, None)
    nodes = _nodes(scene)
    result.errors.extend(found["errors"])
    result.warnings.extend(found.get("warnings", []))
    # strict: each lint is an error (listed once, with the errors).
    (result.errors if strict else result.lints).extend(found.get("lints", []))
    result.diagnostics.extend({key: value for key, value in entry.items() if value is not None}
                              for entry in found.get("diagnostics", []))
    for item in found["plots"]:
        node = nodes.get(item["id"])
        props = node.props if node is not None else {}
        result.plots.append({"id": item["id"], "kind": node.kind if node is not None else "Plot",
                             "name": props.get("name"), "title": item.get("title") or props.get("title") or "",
                             "cell": item.get("cell"), "width": item.get("width"), "height": item.get("height"),
                             "description": item.get("description") or "", "model": item.get("model") or {},
                             "error": item.get("error")})
    report = found.get("report")
    if report:
        result.report = report
        result.warnings.extend(warning for warning in report.get("warnings", []) if warning not in result.warnings)
        # What the SVG and PDF exports draw as images, unless a warning already says why.
        images = [mark for layer in report.get("rasterLayers", []) for mark in layer.get("marks", [])
                  if not any(mark in warning for warning in result.warnings)]
        if images:
            result.warnings.append(f"SVG and PDF exports draw {', '.join(dict.fromkeys(images))} as images, not vectors.")
    for message in found.get("logged", []):
        if not any(message in error or error in message for error in result.errors) and message not in result.warnings:
            result.warnings.append(f"console: {message}")
    if found.get("png"):
        result.png = base64.b64decode(found["png"])
    return result


# The command line: `hmplot check file.py` ------------------------------------------------------


def _run_file(path, quiet=False):
    """Run a Python file as a script (in its folder, so relative data files load) and return
    (targets, error): the value of its last line when that is an expression and a component (as a
    notebook displays it), else each top-level component it leaves without a parent, else each
    component it exported (a plot built inside a function); or the error it raised, as a message
    with the line in the file."""
    path = Path(path).resolve()
    source = path.read_text()
    try:
        tree = ast.parse(source, str(path))
    except SyntaxError as error:
        return [], f"{path.name}:{error.lineno}: SyntaxError: {error.msg}"
    last = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
    namespace = {"__name__": "__main__", "__file__": str(path)}
    cwd = os.getcwd()
    sys.path.insert(0, str(path.parent))
    from . import exporter

    exported, exporter._checked_exports = exporter._checked_exports, []
    try:
        os.chdir(path.parent)
        with contextlib.redirect_stdout(sys.stderr) if quiet else contextlib.nullcontext():
            exec(compile(tree, str(path), "exec"), namespace)
            value = eval(compile(ast.Expression(last.value), str(path), "eval"), namespace) if last else None
    except Exception as error:
        frames = [frame for frame in traceback.extract_tb(error.__traceback__) if frame.filename == str(path)]
        line = f"{path.name}:{frames[-1].lineno}: " if frames else ""
        return [], f"{line}{type(error).__name__}: {error}"
    finally:
        os.chdir(cwd)
        sys.path.remove(str(path.parent))
        exported, exporter._checked_exports = exporter._checked_exports, exported
    if isinstance(value, Node):
        return [value], None
    roots, scenes = [], set()
    top_level = [item for item in namespace.values() if isinstance(item, Node) and item.parent is None]
    # A program that builds its plot inside a function and exports it leaves none behind: check
    # what it exported (TODO 133.10).
    for item in top_level or exported:
        if isinstance(item, Node):
            scene = item._scene()
            if scene.id not in scenes:
                scenes.add(scene.id)
                roots.append(item)
    return roots, None


def main(argv):
    """`hmplot check FILE.py`: run the program, check each plot it leaves (its last expression,
    or its top-level components, or else the plots it exported), print the summary (or JSON) and save each PNG. Exit status 0
    when every check passed, 1 when the program failed or a check found errors (with --strict, or
    lints), 2 when there was nothing to check or no browser to draw with."""
    import argparse

    parser = argparse.ArgumentParser(prog="hmplot check", description=main.__doc__.split("\n\n")[0])
    parser.add_argument("file", help="a Python program that builds a plot (as a notebook cell does)")
    parser.add_argument("--png", help="where to save the PNG (default: FILE's name with .check.png); "
                        "with several plots, -1, -2, ... before the suffix")
    parser.add_argument("--no-png", action="store_true", help="save no PNG")
    parser.add_argument("--scale", type=float, default=1, help="the PNG's pixel ratio (default 1)")
    parser.add_argument("--no-vector", action="store_true", help="skip the SVG export's report")
    parser.add_argument("--json", action="store_true", help="print JSON instead of the summary")
    parser.add_argument("--strict", action="store_true", help="count lints (what runs but does nothing or looks wrong) as errors")
    options = parser.parse_args(argv)
    path = Path(options.file)
    targets, error = _run_file(path, quiet=options.json)
    if error:
        print(json.dumps({"ok": False, "errors": [error]}, indent=2) if options.json else f"check: the program failed.\n{error}")
        return 1
    if not targets:
        message = f"{path.name} builds no plot: end it with the plot (as a notebook cell does) or leave the component in a variable."
        print(json.dumps({"ok": False, "errors": [message]}, indent=2) if options.json else message)
        return 2
    results, status = [], 0
    from .exporter import ExportSession
    with ExportSession() as session:
        for index, target in enumerate(targets):
            try:
                result = check(target, scale=options.scale, vector=not options.no_vector, strict=options.strict,
                               session=session)
            except RuntimeError as error:
                print(f"check: no headless browser could draw: {error}", file=sys.stderr)
                return 2
            saved = None
            if result.png and not options.no_png:
                base = Path(options.png) if options.png else path.with_name(path.stem + ".check.png")
                saved = result.save_png(base if len(targets) == 1 else base.with_name(f"{base.stem}-{index + 1}{base.suffix}"))
            results.append((result, saved))
            status = max(status, 0 if result.ok else 1)
    if options.json:
        data = [{**result.to_dict(), "png_file": str(saved) if saved else None} for result, saved in results]
        print(json.dumps(data[0] if len(data) == 1 else data, indent=2, default=str))
    else:
        for result, saved in results:
            print(result.summary() + (f" ({saved})" if saved else ""))
    return status
