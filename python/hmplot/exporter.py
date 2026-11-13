"""Standalone browser exports for scripts and batch jobs."""

from __future__ import annotations
import asyncio
import atexit
import base64
import html
import copy
from contextlib import AbstractContextManager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import numbers
from pathlib import Path
import logging
import re
import secrets
import threading
import time
import uuid
import warnings

from . import plugins

_logger = logging.getLogger(__name__)


def _open_page(url):
    """Headless Chrome at the export frontend (chrome.py finds or downloads one)."""
    from . import chrome
    return chrome.open_page(url, "typeof hmplotStandalone === 'function'")


class _Assets(AbstractContextManager):
    """The export browser's page and the standalone runtime, served on 127.0.0.1 under a random
    path (the session's token): another local user or process that finds the port gets 404s.
    The mounted scene's columns are served here too (``serve``): a DevTools message holds at most
    about 100 MB, so ten million rows did not reach the page as an argument."""

    def __init__(self):
        self.bundle = Path(__file__).with_name("static") / "standalone.js"
        if not self.bundle.exists():
            raise RuntimeError("The standalone export frontend is missing from this installation.")
        self.token = secrets.token_urlsafe(24)
        self.columns = {}
        self.plugins = {}

    def serve(self, state, columns):
        """The payload ``hmplotStandalone`` takes, its columns' bytes served from here (each at a
        URL of its own) instead of inline. They replace the last scene's: the page reads them
        again when it exports itself."""
        self.columns = {f"{index}": value.payload for index, value in enumerate(columns.values())}
        # The plugins the state names (TODO 138.4), each file at a URL of its own.
        sources = plugins.payload_sources(state)
        self.plugins = {f"{index}": entry["source"].encode("utf-8") for index, entry in enumerate(sources.values())}
        payload = {"state": state, "columns": {key: {"descriptor": value.descriptor(), "url": f"{self.url}columns/{index}"}
                                               for index, (key, value) in enumerate(columns.items())}}
        if sources:
            payload["plugins"] = {name: {"hash": entry["hash"], "url": f"{self.url}plugins/{index}"}
                                  for index, (name, entry) in enumerate(sources.items())}
        return payload

    def __enter__(self):
        bundle = self.bundle.read_bytes()
        root, assets = f"/{self.token}/", self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(handler):
                column = handler.path.removeprefix(root + "columns/") if handler.path.startswith(root + "columns/") else None
                plugin = handler.path.removeprefix(root + "plugins/") if handler.path.startswith(root + "plugins/") else None
                if column is not None and column in assets.columns:
                    content, mime = assets.columns[column], "application/octet-stream"
                elif plugin is not None and plugin in assets.plugins:
                    content, mime = assets.plugins[plugin], "text/javascript; charset=utf-8"
                elif handler.path == root + "standalone.js":
                    content, mime = bundle, "text/javascript; charset=utf-8"
                elif handler.path == root:
                    content, mime = (
                        b'<!doctype html><meta charset="utf-8"><style>html,body,#hmplot-root{margin:0;width:100%;min-height:100%}body{font-family:system-ui,sans-serif;color:#30343b}</style><div id="hmplot-root"></div><script type="module" src="standalone.js"></script>',
                        "text/html; charset=utf-8",
                    )
                else:
                    handler.send_error(404)
                    return
                handler.send_response(200)
                handler.send_header("Content-Type", mime)
                handler.send_header("Content-Length", str(len(content)))
                handler.end_headers()
                handler.wfile.write(content)

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}{root}"
        return self

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


def _encode(state, columns):
    """A scene snapshot (``scene._snapshot()``) as the standalone runtime takes it: the state, and
    each column's descriptor and payload (base64)."""
    encoded = {}
    for key, value in columns.items():
        encoded[key] = {
            "descriptor": value.descriptor(),
            "payload": base64.b64encode(value.payload).decode("ascii"),
        }
    payload = {"state": state, "columns": encoded}
    # The plugins the state names travel with it (TODO 138.4): the page checks each against its hash.
    sources = plugins.payload_sources(state)
    if sources:
        payload["plugins"] = sources
    return payload


# The characters of an export's result (base64) one DevTools message brings back (_command).
_RESULT_SLICE = 64 << 20

_RESOURCES = {"table": "tables", "column": "columns", "scale": "scales", "normalization": "normalizations",
              "theme": "themes", "selection": "selections", "identity": "identities"}


def _closure(snapshot, target_id):
    """What an HTML export of node `target_id` keeps of a scene state (Stage 115.3), as
    src/lib/scene/exportClosure.js does: the target's subtree (the whole scene for its root)
    without callbacks, and the resources it references, and theirs (a table's columns, grid and
    interaction resources, an identity's key column and resources, a scale's normalization).
    A target referencing a component outside its subtree is refused. Returns the state (a copy)
    and the callbacks left out. tests/unit/fixtures/export-closure.json holds the cases both must
    agree on."""
    state = copy.deepcopy(snapshot)
    whole = target_id == state["root"]["id"]

    def keep_path(node):
        if whole or node["id"] == target_id:
            return node
        children = [child for child in (keep_path(c) for c in node["children"]) if child]
        if children:
            node["children"] = children
            return node
        return None

    if not whole:
        root = keep_path(state["root"])
        if root is None:
            raise ValueError("The export target is not part of this scene.")
        state["root"] = root

    omitted = []
    ids = set()
    refs = {kind: set() for kind in _RESOURCES}

    def scan(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key[:1] == "$" and key[1:] in refs:
                    refs[key[1:]].add(item)
                else:
                    scan(item)
        elif isinstance(value, list):
            for item in value:
                scan(item)

    def clean(node):
        ids.add(node["id"])
        if node.get("events"):
            omitted.extend(f'{node["kind"]}.{event}' for event in node["events"])
        node["events"] = []
        scan(node["props"])
        for child in node["children"]:
            clean(child)

    clean(state["root"])
    # A pruned target can reference a sibling (an external Legend): its page could not draw it.
    referenced_nodes = set()

    def scan_node_refs(value):
        if isinstance(value, dict):
            if "$ref" in value:
                referenced_nodes.add(value["$ref"])
            for item in value.values():
                scan_node_refs(item)
        elif isinstance(value, list):
            for item in value:
                scan_node_refs(item)

    scan_node_refs(state["root"])
    outside = sorted(referenced_nodes - ids)
    if outside:
        kind = state["root"]["kind"] if whole else _find(state["root"], target_id)["kind"]
        raise ValueError(
            f"HTML export of this {kind}: it references a component outside it ({', '.join(outside)}). "
            "Export the Scene that contains both instead, e.g. hm.export_html(scene, \"page.html\").")

    # Kept tables, identities and scales reference further resources: read each once, until
    # nothing new is kept. A table's `key` names a column, not a resource.
    read = {"table": set(), "identity": set(), "scale": set()}
    grew = True
    while grew:
        grew = False
        for kind in read:
            for item_id in list(refs[kind]):
                if item_id in read[kind]:
                    continue
                read[kind].add(item_id)
                grew = True
                descriptor = state.get(_RESOURCES[kind], {}).get(item_id)
                if descriptor is not None:
                    scan({key: value for key, value in descriptor.items() if key != "key"} if kind == "table" else descriptor)
    for kind, name in _RESOURCES.items():
        state[name] = {k: v for k, v in state.get(name, {}).items() if k in refs[kind]}
    return state, omitted


def _find(node, node_id):
    if node["id"] == node_id:
        return node
    return next((found for child in node["children"] if (found := _find(child, node_id))), None)


def _html_parts(target):
    """The target's callback-free, resource-pruned declarative state, the columns it uses (not yet
    encoded) and the callbacks it leaves out."""
    scene = target._scene()
    scene._validate()
    snapshot, scene_columns = scene._snapshot()
    state, omitted = _closure(snapshot, snapshot["root"]["id"] if target is scene else target.id)
    columns = {k: v for k, v in scene_columns.items() if k in state["columns"]}
    return state, columns, omitted


def _html_payload(target):
    """Return a callback-free, resource-pruned declarative snapshot."""
    state, columns, omitted = _html_parts(target)
    return _encode(state, columns), omitted


def _html_data_bytes(target):
    """About how many bytes of the target's page Python can count before a browser draws it: its
    state and columns as the page's JSON holds them (base64), as runtime.svelte.js exportHTML writes
    them. The snapshot, the page's own code and what the browser adds (the loaded results of
    Providers and VectorTiles) come on top."""
    state, columns, _ = _html_parts(target)
    text = json.dumps({"state": state, "columns": {k: {"descriptor": c.descriptor(), "payload": ""} for k, c in columns.items()}},
                      ensure_ascii=False, separators=(",", ":"))
    sources = plugins.payload_sources(state)
    if sources:
        # The page's JSON holds them as ',"plugins":{...}' beside the columns.
        text = text[:-1] + ',"plugins":' + json.dumps(sources, ensure_ascii=False, separators=(",", ":")) + "}"
    return len(text.encode("utf-8")) + sum(4 * -(-memoryview(c.payload).nbytes // 3) for c in columns.values())


def _live_loads(node):
    """(kind, id) of the Providers and VectorTiles in an exported tree that ask for a snapshot
    (the default). Without a browser there is no loaded result to embed, so they are exported
    live (TODO 20, 24). A VectorTile given decoded `data`, or its tiles as `tileData` (TODO 35),
    draws without loading."""
    props = node["props"]
    live = props.get("snapshot", True) is not False and (
        node["kind"] == "Provider" or (node["kind"] == "VectorTile" and props.get("data") is None and props.get("tileData") is None))
    found = [(node["kind"], node["id"])] if live else []
    for child in node["children"]:
        found.extend(_live_loads(child))
    return found


def _state_title(root):
    """The page title (TODO 49): the first Title's text or Plot title in the tree, {$name} filled
    from the inputs' values; else "HMPlot" (utils/describe.js stateTitle)."""
    values, nodes = {}, []

    def walk(node):
        nodes.append(node)
        props = node.get("props") or {}
        if isinstance(props.get("name"), str) and "value" in props:
            values[props["name"]] = props["value"]
        for child in node.get("children") or []:
            walk(child)

    walk(root)
    for node in nodes:
        props = node.get("props") or {}
        text = props.get("text") if node.get("kind") == "Title" else props.get("title") if node.get("kind") == "Plot" else None
        if isinstance(text, str) and text.strip():
            filled = re.sub(r"\{\$([A-Za-z_]\w*)\}", lambda m: str(values[m.group(1)]) if m.group(1) in values else m.group(0), text)
            return re.sub(r"\s*\n\s*", " ", filled).strip()
    return "HMPlot"


# A page's module script: the runtime, this line, then the page's own code, as scene/htmlPage.js
# writes it. The runtime reads its own source from there to export the page again.
_PAGE_CODE = "\n// The page's own code, after the HMPlot runtime:\n"
# Where a page the browser exports for Python leaves the runtime (htmlPage.js RUNTIME_PLACEHOLDER):
# a notebook front end sends no message over 10 MB to the kernel, and the runtime is 14 MB.
_RUNTIME_SCRIPT = '<script type="module" id="hmplot-runtime">'
_RUNTIME_PLACEHOLDER = "/* HMPlot runtime */"
# A notebook view sends a command's result to the kernel as one websocket message, and Jupyter's
# server closes the connection on a message over 10 MiB (tornado's websocket_max_message_size),
# which ends the session. A notebook's export_html sends no page over _NOTEBOOK_PAGE_LIMIT (the
# message's own JSON gets the rest) and exports a larger one headlessly (_notebook_html).
_NOTEBOOK_MESSAGE_LIMIT = 10 * 1024 * 1024
_NOTEBOOK_PAGE_LIMIT = _NOTEBOOK_MESSAGE_LIMIT - 64 * 1024


def _standalone_source():
    """The standalone runtime, escaped for an inline <script>."""
    bundle_path = Path(__file__).with_name("static") / "standalone.js"
    if not bundle_path.exists():
        raise RuntimeError("The standalone HTML frontend is missing from this installation.")
    return bundle_path.read_text(encoding="utf-8").replace("</script", "<\\/script")


def _with_runtime(page):
    """A page exported by the browser (bytes), with the runtime in its placeholder."""
    marker = (_RUNTIME_SCRIPT + _RUNTIME_PLACEHOLDER).encode("utf-8")
    if marker not in page:
        raise RuntimeError("The exported HTML page has no place for the standalone runtime.")
    return page.replace(marker, (_RUNTIME_SCRIPT + _standalone_source()).encode("utf-8"), 1)


def _notebook_html(target, path, snapshot, size, page=True):
    """A notebook's export_html of a page too large to send from the view (core.py; ``size``
    says how large): exported as hm.export_html() exports it, headlessly. Its snapshot needs the
    export browser; when none starts, the error names both limits and what to do."""
    with ExportSession() as session:
        if snapshot:
            try:
                session._ensure_browser()
            except Exception as error:
                raise RuntimeError(
                    f"export_html: {size}, over the {_NOTEBOOK_MESSAGE_LIMIT >> 20} MiB a notebook can send "
                    "from the browser to the kernel (Jupyter's server closes the connection on a larger "
                    "message). hm.export_html() has no such limit, but it draws the page's snapshot in a "
                    f"headless browser, which did not start: {error}\nWith a browser installed, export again "
                    "or call hm.export_html(scene, path); or export a smaller scene. snapshot=False writes a "
                    "page without a snapshot, which needs no browser."
                ) from error
        data = session.html(target, path, snapshot=snapshot, page=page)
        # As the view's export does, the report stays on the scene (its snapshot's kind and size).
        target._scene().last_export_report = session.last_report
        return data


def _page_style(layout):
    """The page's base style for a layout (_page_layout), as scene/htmlPage.js pageStyle writes it."""
    width, margin = layout["maxWidth"], layout["margin"]
    bounded = "" if width is None else f"max-width:calc({width:g}px + 2 * var(--hmplot-margin));margin:0 auto;"
    narrow = f"@media (max-width:600px){{body{{--hmplot-margin:{margin / 2:g}px}}}}" if margin > 0 else ""
    return ("html,body{margin:0;min-height:100%;background:#fff}"
            f"body{{--hmplot-margin:{margin:g}px;position:relative;{bounded}padding:var(--hmplot-margin);box-sizing:border-box;"
            f"font-family:system-ui,sans-serif;color:#30343b}}{narrow}")


# The export window's width (chrome.py new_page), and an exported page's content width when it
# has no maximum (page={"max_width": None}).
_EXPORT_WIDTH = 1200


def _html_document(target, layout):
    payload, omitted = _html_payload(target)
    bundle = _standalone_source()
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    encoded = encoded.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
    title = html.escape(_state_title(payload["state"]["root"]))
    document = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>
{_page_style(layout)}
#hmplot-root{{width:100%;min-height:1px}}#hmplot-error{{font:14px system-ui;color:#9b1c1c;white-space:pre-wrap}}
</style></head><body><div id="hmplot-root"></div><div id="hmplot-error" role="alert"></div>
<script id="hmplot-state" type="application/json">{encoded}</script>
{_RUNTIME_SCRIPT}{bundle}{_PAGE_CODE}const payload=JSON.parse(document.getElementById("hmplot-state").textContent);
hmplotStandalone(payload).catch(error=>{{document.getElementById("hmplot-error").textContent=`${{!navigator.gpu||error?.code==="webgpu.unavailable"?"Unable to render this HMPlot document. A WebGPU-capable browser is required.":"This HMPlot document failed to render:"}}\n${{error?.message??error}}`;}});
</script></body></html>'''
    return document.encode("utf-8"), omitted, _live_loads(payload["state"]["root"])


def _svg_size(svg):
    """The root element's width and height as CSS lengths (unitless numbers are pixels)."""
    root = re.search(r"<svg\b[^>]*>", svg)
    size = []
    for name in ("width", "height"):
        match = root and re.search(rf'\s{name}="([^"]+)"', root.group(0))
        if not match:
            raise ValueError(f"The exported SVG has no {name}.")
        value = match.group(1).strip()
        size.append(f"{value}px" if re.fullmatch(r"[0-9.eE+-]+", value) else value)
    return tuple(size)


def _css_pixels(length):
    """A CSS length (px, pt, pc, in, cm or mm) in CSS pixels."""
    match = re.fullmatch(r"\s*([0-9.eE+-]+)\s*(px|pt|pc|in|cm|mm)?\s*", length)
    if not match:
        raise ValueError(f"Unsupported SVG size {length!r}.")
    per = {"px": 1, "pt": 96 / 72, "pc": 16, "in": 96, "cm": 96 / 2.54, "mm": 96 / 25.4}
    return float(match.group(1)) * per[match.group(2) or "px"]


def _svg_title(svg):
    match = re.search(r"<svg\b[^>]*>\s*<title>(.*?)</title>", svg, re.S)
    return html.unescape(match.group(1)) if match else None


# The targets exported while `hmplot check` runs a program (a list), else None: a program that
# builds its plot inside a function and exports it leaves no plot behind to check (TODO 133.10).
_checked_exports = None


def _note_export(target):
    if _checked_exports is not None and not any(item is target for item in _checked_exports):
        _checked_exports.append(target)


class ExportSession(AbstractContextManager):
    """Reuse one private headless Chrome for several exports: png(), svg(), pdf(), html() and
    mp4() take a component and an optional path, as hm.export_png and the others do, without
    starting a browser for each.

    Example:
        with hm.ExportSession() as session:
            session.png(plot, "plot.png", scale=2)
            session.svg(plot, "plot.svg", mode="vector")
    """

    def __enter__(self):
        self.assets = None
        self.browser = None
        self.page = None
        self.print_page = None
        self.last_report = None
        return self

    def _ensure_browser(self):
        if self.page is not None:
            return
        self.assets = _Assets().__enter__()
        try:
            self.browser, self.page = _open_page(self.assets.url)
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def _export(self, target, kind, path=None, **options):
        _note_export(target)
        if kind not in ("png", "svg", "pdf"):
            raise ValueError("Standalone export supports PNG, SVG, and PDF.")
        self._ensure_browser()
        self._mount(target)
        args = (
            {"scale": options.get("scale", 2), "cells": options.get("cells", False)}
            if kind == "png"
            else {
                "width": options.get("width"),
                "height": options.get("height"),
                "mode": options.get("mode", "auto"),
                "rasterDpi": options.get("raster_dpi", 300),
                "text": options.get("text", "embedded"),
                "primitiveBudget": options.get("primitive_budget", 100000),
                "cells": options.get("cells", False),
            }
        )
        result = self._command(f"export_{kind}", target._export_target(), args)
        if "items" in result:
            return [
                {
                    **{k: v for k, v in item.items() if k != "payload"},
                    "data": base64.b64decode(item["payload"]),
                }
                for item in result["items"]
            ]
        data = base64.b64decode(result["payload"])
        self.last_report = result.get("report")
        if path is not None:
            Path(path).write_bytes(data)
        return data

    def pdf(self, target, path=None, **options):
        """The SVG export printed to PDF by headless Chrome: vector, text kept as text, the
        bundled font embedded (``print_pdf``). ``cells=True`` prints each cell's SVG."""
        result = self._export(target, "svg", None, **options)
        if isinstance(result, list):
            return [{**item, "data": self.print_pdf(item["data"])} for item in result]
        report = self.last_report
        data = self.print_pdf(result)
        if report is not None:
            report = {**report, "fonts": self.last_report["fonts"],
                      "warnings": [*report.get("warnings", []), *self.last_report["warnings"]]}
        self.last_report = report
        if path is not None:
            Path(path).write_bytes(data)
        return data

    def print_pdf(self, svg):
        """Print an SVG document (bytes or str) to a one-page PDF the size of its root element,
        in this session's Chrome. Its fonts are planned as the report lists them
        (``hmplotPrintableSVG``), and ``last_report`` becomes ``{fonts, warnings}``."""
        self._ensure_browser()
        text = svg.decode("utf-8") if isinstance(svg, (bytes, bytearray)) else str(svg)
        planned = self.page.evaluate("svg => hmplotPrintableSVG(svg)", text)
        width, height = _svg_size(planned["svg"])
        title = _svg_title(planned["svg"])
        if self.print_page is None:
            self.print_page = self.browser.new_page()
        self.print_page.set_content(
            "<!doctype html><meta charset=\"utf-8\">"
            + (f"<title>{html.escape(title)}</title>" if title else "")
            + f"<style>{planned['css']}@page{{size:{width} {height};margin:0}}"
            f"html,body{{margin:0;padding:0;width:{width};height:{height};overflow:hidden}}svg{{display:block}}</style>"
            + planned["svg"]
        )
        data = self.print_page.pdf(_css_pixels(width), _css_pixels(height))
        self.last_report = {"fonts": planned["fonts"], "warnings": planned["warnings"]}
        return data

    def svg(self, target, path=None, **options):
        return self._export(target, "svg", path, **options)

    def png(self, target, path=None, **options):
        return self._export(target, "png", path, **options)

    def _mount(self, target, *, fill=False):
        """Mount the target's scene, once per revision. An image has no host to fill, so a plot
        without a width keeps its 800px default (TODO 132.5); a page (``fill=True``) fills, or
        fills its content at most ``fill`` px wide (an exported page's maximum width, TODO 132.6)."""
        scene = target._scene()
        scene._validate()
        state, columns = scene._snapshot()
        key = (scene.id, state["revision"])
        # A page wider than the export window (TODO 132.6) widens it, so its snapshot is drawn at
        # its width; otherwise the window is 1200 px, the width of a page with no maximum.
        viewport = max(_EXPORT_WIDTH, fill) if type(fill) in (int, float) else _EXPORT_WIDTH
        if getattr(self, "_viewport", _EXPORT_WIDTH) != viewport:
            self.page.call("Emulation.setDeviceMetricsOverride", {"width": viewport, "height": 800, "deviceScaleFactor": 1, "mobile": False})
            self._viewport = viewport
        if getattr(self, "_mounted", None) != key:
            self.page.evaluate("payload => hmplotStandalone(payload)", {**self.assets.serve(state, columns), "fill": fill})
            self._mounted = key
        elif (type(fill), fill) != (type(getattr(self, "_fill", None)), getattr(self, "_fill", None)):
            # The same mount, refit: a viewport or clock set through this session stays.
            self.page.evaluate("fill => hmplotFill(fill)", fill)
        self._fill = fill
        return scene

    def _command(self, command, target, args):
        """hmplotExport's result; an export's payload (base64) over _RESULT_SLICE characters
        comes in slices, as DevTools sends a message of a few hundred MB slowly, if at all."""
        result = self.page.evaluate(
            """async arg => {
              const result = await hmplotExport(arg.command, arg.target, arg.args);
              if (!(result?.payload?.length > arg.slice)) return result;
              globalThis.hmplotResult = result.payload;
              return { ...result, payload: null, payloadLength: result.payload.length };
            }""",
            {"command": command, "target": target, "args": args, "slice": _RESULT_SLICE},
        )
        if result and result.get("payloadLength") is not None:
            length = result.pop("payloadLength")
            try:
                result["payload"] = "".join(
                    self.page.evaluate("range => globalThis.hmplotResult.slice(range[0], range[1])", [start, start + _RESULT_SLICE])
                    for start in range(0, length, _RESULT_SLICE))
            finally:
                self.page.evaluate("() => { delete globalThis.hmplotResult; }")
        return result

    def _clock(self, target, **args):
        """The `time` command on the export target: {"time": ms, "frozen": bool}."""
        return self._command("time", target._export_target(), args)["value"]

    def set_time(self, target, time, *, freeze=True):
        """Set a plot's clock (milliseconds); None resumes it. Returns the clock. Mounts the
        scene when it is not already showing."""
        from .core import _clock_time

        time = _clock_time(time)
        self._ensure_browser()
        self._mount(target)
        return self._clock(target, time=time, freeze=bool(freeze))["time"]

    def get_viewport(self, plot):
        """Read the mounted 2D Plot viewport from the private headless browser."""
        self._ensure_browser()
        self._mount(plot)
        return self._command("viewport", plot.id, {})["value"]

    def set_viewport(self, plot, state=None, **fields):
        """Update a mounted 2D Plot viewport, including orthographic center."""
        from .core import _viewport_patch

        patch = _viewport_patch(state, fields)
        self._ensure_browser()
        self._mount(plot)
        return self._command("viewport", plot.id, {"state": patch})["value"]

    def mp4(self, target, path, *, duration, fps=30, start=0, scale=2, encoder="ffmpeg"):
        """Render a plot's @time animation to an MP4: one PNG per frame, piped to ffmpeg, or with
        ``encoder="browser"`` encoded in the headless Chrome by WebCodecs (hmplot/video). The
        clock returns to its previous time and frozen state afterwards, so later exports in this
        session are not stuck on the last frame."""
        _note_export(target)
        times = _frame_times(start, duration, fps)
        if _video_encoder(encoder) == "browser":
            path = _mp4_path(path)
            self._ensure_browser()
            self._mount(target)
            result = self._command("export_video", target._export_target(),
                                   {"duration": float(duration), "fps": float(fps), "start": float(start), "scale": scale})
            path.write_bytes(base64.b64decode(result["payload"]))
            return path
        ffmpeg, path = _mp4_encoder(path)
        self._ensure_browser()
        self._mount(target)
        previous = self._clock(target)
        video = _Mp4Writer(ffmpeg, path, fps)
        try:
            for time in times:
                self._clock(target, time=time, freeze=True)
                result = self._command("export_png", target._export_target(), {"scale": scale, "cells": False})
                video.write(base64.b64decode(result["payload"]))
            return video.close()
        finally:
            video.abort()
            self._clock(target, time=previous["time"], freeze=previous["frozen"])

    def html(self, target, path=None, *, snapshot="svg", page=True, **options):
        """The target as a page. The scene is drawn in this session's headless Chrome, which
        exports the page with a snapshot shown first (``"svg"``, ``"png"``) and the loaded
        results of Providers and VectorTiles; ``snapshot=False``, or no browser, builds the page
        without one (TODO 54). ``page`` lays it out (TODO 132.6): a margin and the content at
        most 960 px wide by default, ``{"max_width": ..., "margin": ...}``, or False for a bare page."""
        _note_export(target)
        from .core import _check_snapshot, _page_layout
        if options:
            names = ", ".join(sorted(options))
            raise TypeError(f"Unsupported HTML export option(s): {names}.")
        _check_snapshot(snapshot)
        state = target._scene()._snapshot()[0]
        layout = _page_layout(page, _find(state["root"], state["root"]["id"] if target is target._scene() else target.id))
        if snapshot:
            # No browser to run, or a scene that does not start there (a
            # Provider's URL relative to a server): the page without a snapshot, as before.
            try:
                self._ensure_browser()
                # Drawn at the page's content width, so the snapshot matches the live view.
                self._mount(target, fill=layout["maxWidth"] or True)
                result = self._command("export_html", target._export_target("export_html"), {"snapshot": snapshot, "embedRuntime": False, "page": layout})
            except Exception as error:
                warnings.warn(f"HTML export without a snapshot: {error}", RuntimeWarning, stacklevel=2)
                snapshot = None
        if snapshot:
            data = _with_runtime(base64.b64decode(result["payload"]))
            report = result.get("report") or {}
            self.last_report = {"snapshot": report.get("snapshot"), "omitted_callbacks": report.get("warnings", []),
                                "live_providers": [], "live_tiles": []}
            for warning in report.get("warnings", []):
                warnings.warn(f"HTML export: {warning}", RuntimeWarning, stacklevel=2)
            if path is not None:
                Path(path).write_bytes(data)
            return data
        data, omitted, live = _html_document(target, layout)
        self.last_report = {"snapshot": None, "omitted_callbacks": omitted,
                            "live_providers": [id for kind, id in live if kind == "Provider"],
                            "live_tiles": [id for kind, id in live if kind == "VectorTile"]}
        if omitted:
            warnings.warn(
                "HTML export omitted Python callbacks: " + ", ".join(omitted),
                RuntimeWarning,
                stacklevel=2,
            )
        if live:
            warnings.warn(
                "HTML export: " + ", ".join(f"{kind} {id}" for kind, id in live) + " will load when the page opens. "
                "hm.export_html runs no browser, so there is no loaded result to embed; display the "
                "scene and use `await scene.export_html()` to embed it, or pass snapshot=False.",
                RuntimeWarning,
                stacklevel=2,
            )
        if path is not None:
            Path(path).write_bytes(data)
        return data

    def __exit__(self, *_):
        browser = getattr(self, "browser", None)
        if browser:
            browser.close()
        self.browser = self.page = self.print_page = None
        assets = getattr(self, "assets", None)
        if assets:
            assets.__exit__(None, None, None)


# A notebook's static images (TODO 71) -------------------------------------------------------------

# The page width, in CSS pixels, a notebook display's SVG is drawn at when no view gave its own:
# about a notebook's output column, so a plot that fills the width reads at its own size where
# static viewers show it.
DISPLAY_WIDTH = 800


def _snapshot_svg(session, source, width=None, *, download=True):
    """The scene in ``source`` (``scene._snapshot()``: its state and columns) as one SVG, its export of the scene root, drawn in
    ``session``'s Chrome on a page ``width`` CSS pixels wide, so its plots lay out as a notebook
    view that wide does. ``download=False`` refuses, saying what to install, instead of
    downloading Chrome for Testing. Rasters are at 192 dpi, twice a screen's pixels. A failure
    closes the browser, so the next image starts a new one."""
    from . import chrome

    width = int(width or DISPLAY_WIDTH)
    try:
        if session.page is None and not download:
            chrome.find_chrome(download=False)
        session._ensure_browser()
        state, columns = source
        key = ("display", state["scene"], state["revision"], width)
        if getattr(session, "_mounted", None) != key:
            session.page.call("Emulation.setDeviceMetricsOverride", {
                "width": width, "height": 800, "deviceScaleFactor": 1, "mobile": False})
            session.page.evaluate("payload => hmplotStandalone(payload)", session.assets.serve(state, columns))
            session._mounted = key
        result = session._command("export_svg", state["root"]["id"], {
            "width": None, "height": None, "mode": "auto", "rasterDpi": 192, "text": "embedded",
            "primitiveBudget": 100000, "cells": False})
        return base64.b64decode(result["payload"])
    except BaseException:
        session.__exit__(None, None, None)
        session._mounted = None
        raise


class _SnapshotSession(ExportSession):
    """The snapshot thread's export session: its browser closes at exit."""

    def _ensure_browser(self):
        if self.page is not None:
            return
        super()._ensure_browser()
        # Registered again after each launch: exit handlers run last-registered first, so the
        # browser closes before its profile directory (a TemporaryDirectory) is removed.
        atexit.unregister(self._exit)
        atexit.register(self._exit)

    def _exit(self):
        self.__exit__(None, None, None)


class _Snapshots:
    """Static images of notebook scenes (TODO 71), drawn one at a time on a thread of their own
    in one private headless Chrome. The browser stays open while views keep asking, and closes
    after ``idle`` seconds without a request, and at exit."""

    debounce = 0.25
    idle = 60.0

    def __init__(self):
        self.condition = threading.Condition()
        self.jobs = {}
        self.thread = None

    def submit(self, key, job, delay=None):
        """Run ``job(session)`` on the worker ``delay`` seconds from now (``debounce`` by
        default). A job already waiting under ``key`` is replaced but keeps its time, so a burst
        of updates draws once."""
        with self.condition:
            due = self.jobs[key][0] if key in self.jobs else time.monotonic() + (
                self.debounce if delay is None else delay)
            self.jobs[key] = (due, job)
            if self.thread is None:
                self.thread = threading.Thread(target=self._run, name="hmplot-snapshots", daemon=True)
                self.thread.start()
            self.condition.notify()

    def cancel(self, key):
        with self.condition:
            self.jobs.pop(key, None)

    def call(self, job, timeout=120):
        """Run ``job(session)`` on the worker now and return its result, or raise its error."""
        done, outcome = threading.Event(), {}

        def run(session):
            try:
                outcome["value"] = job(session)
            except BaseException as error:
                outcome["error"] = error
            finally:
                done.set()

        self.submit(object(), run, 0)
        if not done.wait(timeout):
            raise TimeoutError(f"The static image took more than {timeout} s to draw.")
        if "error" in outcome:
            raise outcome["error"]
        return outcome["value"]

    def _next(self):
        """The next job once it is due; None after ``idle`` seconds without one, when the thread
        ends (a later ``submit`` starts another)."""
        with self.condition:
            idle = time.monotonic() + self.idle
            while True:
                now = time.monotonic()
                if self.jobs:
                    key, (due, job) = min(self.jobs.items(), key=lambda item: item[1][0])
                    if due <= now:
                        del self.jobs[key]
                        return job
                    self.condition.wait(due - now)
                elif now >= idle:
                    self.thread = None
                    return None
                else:
                    self.condition.wait(idle - now)

    def _run(self):
        session = _SnapshotSession().__enter__()
        try:
            while (job := self._next()) is not None:
                try:
                    job(session)
                except Exception:
                    _logger.exception("A notebook static image failed.")
        finally:
            atexit.unregister(session._exit)
            session.__exit__(None, None, None)


SNAPSHOTS = _Snapshots()


def _finite(value, minimum=0, strict=False):
    return (not isinstance(value, bool) and isinstance(value, numbers.Real) and math.isfinite(value)
            and (value > minimum if strict else value >= minimum))


def _frame_times(start, duration, fps):
    """Clock times, in milliseconds, of the frames of a video: every frame time
    start + i * 1000 / fps that falls before start + duration, so there are
    ceil(duration * fps / 1000) frames, at least one (150 ms at 10 fps is 2 frames, 250 ms
    is 3)."""
    if not _finite(duration, strict=True):
        raise ValueError("duration must be a positive, finite number of milliseconds.")
    if not _finite(fps, strict=True):
        raise ValueError("fps must be a positive, finite number.")
    if not _finite(start):
        raise ValueError("start must be a finite, nonnegative number of milliseconds.")
    # Rounding first keeps a product like 3.0000000000000004 from adding a frame.
    frames = max(1, math.ceil(round(float(duration) * float(fps) / 1000, 9)))
    return [float(start) + index * 1000 / float(fps) for index in range(frames)]


def _video_encoder(encoder):
    if encoder not in ("ffmpeg", "browser"):
        raise ValueError('export_mp4 encoder is "ffmpeg" or "browser".')
    return encoder


def _mp4_path(path):
    path = Path(path)
    if path.suffix.lower() != ".mp4":
        raise ValueError("export_mp4 writes .mp4 files.")
    return path


def _mp4_encoder(path):
    """Check an export_mp4 destination before any frame renders: a .mp4 suffix, and ffmpeg (from
    imageio-ffmpeg, a dependency). Returns (ffmpeg, path)."""
    path = _mp4_path(path)
    try:
        import imageio_ffmpeg
    except ImportError as error:
        raise RuntimeError("export_mp4 needs imageio-ffmpeg: pip install imageio-ffmpeg.") from error
    return imageio_ffmpeg.get_ffmpeg_exe(), path


class _Mp4Writer:
    """An H.264 MP4 written by ffmpeg from PNG frames piped to it (see _mp4_encoder)."""

    def __init__(self, ffmpeg, path, fps):
        import subprocess

        fps = int(fps) if isinstance(fps, numbers.Integral) else float(fps)
        self.path = Path(path)
        self.process = subprocess.Popen([
            ffmpeg, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps), "-i", "-",
            # Even dimensions and yuv420p are what most players need.
            "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-pix_fmt", "yuv420p", "-c:v", "libx264",
            str(self.path),
        ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    def write(self, png):
        try:
            self.process.stdin.write(png)
        except BrokenPipeError:
            self.close()

    def close(self):
        """Finish the file and return its path; a failed encode raises with ffmpeg's message."""
        if self.process.stdin.closed:
            error = b""
        else:
            self.process.stdin.close()
            error = self.process.stderr.read()
        if self.process.wait() != 0:
            raise RuntimeError(f"ffmpeg failed: {error.decode(errors='replace').strip()}")
        return self.path

    def abort(self):
        """Stop an unfinished encode (after a failed frame); a no-op once closed."""
        if self.process.poll() is None:
            self.process.kill()
            self.process.wait()


def print_pdf(svg):
    """Print an exported SVG document (bytes or str) to PDF in a private headless Chrome: what
    a live view's ``export_pdf`` does with the SVG its browser exported."""
    with ExportSession() as session:
        return session.print_pdf(svg)


def export_pdf(target, path=None, **options):
    """The target (a Plot, Facet, Scene or layout) as a PDF, drawn in a private headless Chrome
    without a notebook: vector where it can be (the SVG export printed to PDF, text kept as
    text). Options are the SVG export's: width, height ("160mm"), mode ("auto", "vector",
    "raster"), raster_dpi, text and primitive_budget. Writes path when given; returns the bytes.

    Example:
        hm.export_pdf(plot, "figure.pdf", width="160mm")
    """
    with ExportSession() as session:
        return session.pdf(target, path, **options)


def export_svg(target, path=None, **options):
    """The target as an SVG document, drawn in a private headless Chrome: axes, text and 2D marks
    as vectors, what has no vector form as images (mode="vector" refuses those instead). Options:
    width, height, mode, raster_dpi, text ("embedded" or "outlines"), primitive_budget. Writes
    path when given; returns the bytes.

    Example:
        hm.export_svg(plot, "figure.svg", mode="vector")
    """
    with ExportSession() as session:
        return session.svg(target, path, **options)


def export_png(target, path=None, **options):
    """The target as a PNG, drawn in a private headless Chrome with WebGPU (SwiftShader's where
    there is no GPU); scale is the pixel ratio (2 by default). Writes path when given; returns
    the bytes.

    Example:
        hm.export_png(plot, "plot.png", scale=2)
    """
    with ExportSession() as session:
        return session.png(target, path, **options)


def export_html(target, path=None, **options):
    """The target as one standalone HTML page with the runtime and data inside: it opens without
    Python or a server and stays interactive (Python callbacks are left out). snapshot="svg"
    (the default) or "png" shows a picture first and in browsers without WebGPU; False builds
    the page without a browser. page=True gives the page a margin and centers its content at
    most 960 px wide (the plots fill it); page={"max_width": 1200, "margin": 16} sets them
    (max_width=None for none), page=False makes a bare page. Writes path when given; returns
    the bytes.

    Example:
        hm.export_html(plot, "plot.html")
    """
    with ExportSession() as session:
        return session.html(target, path, **options)


def export_mp4(target, path, *, duration, fps=30, start=0, scale=2, encoder="ffmpeg"):
    """Render a plot's @time animation headlessly to an MP4: duration and start in ms of the
    plot's clock, fps frames a second (``encoder="browser"``: encoded in the headless Chrome by
    WebCodecs instead of ffmpeg). Returns the path.

    Example:
        hm.export_mp4(plot, "orbit.mp4", duration=4000, fps=30)
    """
    with ExportSession() as session:
        return session.mp4(target, path, duration=duration, fps=fps, start=start, scale=scale, encoder=encoder)


async def export_mp4_async(target, path, **options):
    """export_mp4 on a worker thread, for code already in an event loop (a notebook cell).

    Example:
        await hm.export_mp4_async(plot, "orbit.mp4", duration=4000)
    """
    return await asyncio.to_thread(export_mp4, target, path, **options)


async def export_pdf_async(target, path=None, **options):
    """export_pdf on a worker thread, for code already in an event loop.

    Example:
        await hm.export_pdf_async(plot, "figure.pdf")
    """
    return await asyncio.to_thread(export_pdf, target, path, **options)


async def export_svg_async(target, path=None, **options):
    """export_svg on a worker thread, for code already in an event loop.

    Example:
        await hm.export_svg_async(plot, "figure.svg")
    """
    return await asyncio.to_thread(export_svg, target, path, **options)


async def export_png_async(target, path=None, **options):
    """export_png on a worker thread, for code already in an event loop.

    Example:
        await hm.export_png_async(plot, "plot.png")
    """
    return await asyncio.to_thread(export_png, target, path, **options)


async def export_html_async(target, path=None, **options):
    """export_html on a worker thread, for code already in an event loop.

    Example:
        await hm.export_html_async(plot, "plot.html")
    """
    return await asyncio.to_thread(export_html, target, path, **options)


_OPTIONS = {
    "png": {"scale"},
    "svg": {"width", "height", "mode", "raster_dpi", "text", "primitive_budget"},
    "pdf": {"width", "height", "mode", "raster_dpi", "text", "primitive_budget"},
    "html": set(),
}


def context_export_request(target, filename, options):
    path = Path(filename)
    kind = path.suffix.lower().removeprefix(".")
    if kind not in _OPTIONS:
        raise ValueError("filename must end in .png, .svg, .pdf, or .html.")
    unknown = set(options) - _OPTIONS[kind]
    if unknown:
        names = ", ".join(sorted(unknown))
        raise TypeError(f"Unsupported {kind.upper()} export option(s): {names}.")
    if not path.parent.exists():
        raise FileNotFoundError(f"Export directory does not exist: {path.parent}")
    return {"target": target, "path": path, "kind": kind, "options": dict(options)}


def _facet_ancestor(target):
    node = target.parent
    while node is not None:
        if node.kind == "Facet":
            return node
        node = node.parent
    return None


def _token(value):
    text = str(value).replace("/", "-").replace("\\", "-")
    text = re.sub(r"[^\w.-]+", "-", text, flags=re.UNICODE).strip(" .-_")
    return text or "empty"


def _cell_paths(path, facet, items):
    fields = (("row", facet.props.get("row")), ("column", facet.props.get("column")))
    used = set()
    output = []
    for item in items:
        parts = [
            f"{_token(field)}-{_token(item[dimension])}"
            for dimension, field in fields
            if field and item.get(dimension) is not None
        ]
        stem = "_".join([*parts, path.stem])
        candidate = path.with_name(stem + path.suffix)
        index = 2
        while candidate in used:
            candidate = path.with_name(f"{stem}-{index}{path.suffix}")
            index += 1
        used.add(candidate)
        output.append((candidate, item["data"]))
    return output


def _atomic_write(path, data):
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_bytes(data)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _save_context_exports(requests):
    rendered = []
    with ExportSession() as session:
        for request in requests:
            target, path, kind = request["target"], request["path"], request["kind"]
            facet = _facet_ancestor(target) if target.kind == "Plot" and kind != "html" else None
            options = dict(request["options"])
            if kind != "html":
                options["cells"] = facet is not None
            result = getattr(session, kind)(target, **options)
            rendered.extend(
                _cell_paths(path, facet, result)
                if facet is not None
                else [(path, result)]
            )
    if len({path for path, _ in rendered}) != len(rendered):
        raise ValueError("Context exports resolve to duplicate filenames.")
    for path, data in rendered:
        _atomic_write(path, data)


def save_context_exports(requests):
    """Synchronously save a committed context, even under a running event loop."""
    result = {}

    def run():
        try:
            _save_context_exports(requests)
        except BaseException as error:
            result["error"] = error

    worker = threading.Thread(target=run, name="hmplot-context-export")
    worker.start()
    worker.join()
    if "error" in result:
        raise result["error"]
