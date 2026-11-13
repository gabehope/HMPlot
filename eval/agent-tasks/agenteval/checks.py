"""Run a solution and collect observable HTML, interaction, HMPlot and PDF checks."""

from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageChops, ImageOps, ImageStat
from playwright.sync_api import sync_playwright

from .click_drilldown import check_click_drilldown
from .libraries import LIBRARIES


def advisories(report) -> list[str]:
    """hmplot's lints and warnings (what runs but does nothing or looks wrong: a mark that drew no
    rows, an input nothing reads, an omitted export) as lines for the correction prompt. They
    do not fail a check (2026-10-22: before this, neither track ever showed them to the agent)."""
    out = []
    for kind in ("warnings", "lints"):
        for entry in (report or {}).get(kind) or []:
            text = entry if isinstance(entry, str) else entry.get("message") or json.dumps(entry)
            out.append(f"{kind[:-1]}: {text}")
    return out


def item(name, status, detail="", **values):
    return {"name": name, "status": status, "detail": str(detail), **values}


def _hmplot_artifact_check(state):
    live = state.get("hmplotRuntime") and state.get("hmplotLiveCanvases", 0) > 0
    return item("HMPlot artifact", "pass" if live else "fail",
                "live HMPlot runtime and canvas" if live else
                "Submit the actual HMPlot chart with hm.export_html(chart, 'output/chart.html'). "
                "Custom SVG/canvas with an unused HMPlot object does not satisfy this condition.")


def _hmplot_marks_check(plots):
    rows = sum(mark.get("rows") or 0 for plot in plots for mark in plot.get("model", {}).get("marks", []))
    return item("HMPlot drawn marks", "pass" if rows > 0 else "fail",
                f"{rows} rows in HMPlot marks; an empty Plot is not the submitted chart")


def _native_observed_rows(report):
    # Use renderer-owned summaries only after completed draws, never authored debug state.
    if not report or not report.get("ready"):
        return 0
    return sum(mark.get("rows") or 0 for plot in report.get("plots", [])
               for mark in plot.get("model", {}).get("marks", []))


def _interaction_check(action: str, delta: float) -> dict:
    detail = f"image change {delta:.4f}"
    if action in {"brush", "animate"}:
        # Blank linked panels and jumps between unrelated entities also change pixels.
        detail += "; visual change alone does not verify " + (
            "linked selection membership" if action == "brush" else "animation correspondence"
        ) + "; requires review"
        return item("interaction " + action, "unknown", detail)
    return item("interaction " + action, "unknown", detail + "; requires a semantic assertion or visual review")


def _difference(before: Path, after: Path) -> float:
    with Image.open(before) as a, Image.open(after) as b:
        if a.size != b.size:
            return 1.0
        stat = ImageStat.Stat(ImageChops.difference(a.convert("RGB"), b.convert("RGB")))
        return sum(stat.mean) / (3 * 255)


def _region_difference(before: Path, after: Path, region: tuple[float, float, float, float]) -> float:
    with Image.open(before) as a, Image.open(after) as b:
        if a.size != b.size:
            return 1.0
        x, y, width, height = region
        # Browser context uses DPR 2. The box comes from getBoundingClientRect in CSS pixels.
        rect = (max(0, int(x * 2)), max(0, int(y * 2)), min(a.width, int((x + width) * 2)),
                min(a.height, int((y + height) * 2)))
        if rect[2] <= rect[0] or rect[3] <= rect[1]:
            return 0.0
        stat = ImageStat.Stat(ImageChops.difference(a.crop(rect).convert("RGB"), b.crop(rect).convert("RGB")))
        return sum(stat.mean) / (3 * 255)


def _visual_similarity(html_image: Path, pdf_image: Path) -> float:
    """A rough pixel similarity after cropping white margins; the human still compares both."""
    def content(path):
        image = Image.open(path).convert("RGB")
        difference = ImageChops.difference(image, Image.new("RGB", image.size, "white"))
        bounds = difference.getbbox()
        return image.crop(bounds) if bounds else image
    a, b = content(html_image), content(pdf_image)
    a = ImageOps.fit(a, (1000, 600)); b = ImageOps.fit(b, (1000, 600))
    return round(max(0.0, 1.0 - sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / (3 * 255)), 3)


def _sandbox_command(run_dir: Path, env_python: Path, temporary: Path, command: list[str],
                     extra_reads: tuple[Path, ...] = ()) -> list[str]:
    """Constrain generated programs to their run, venv, system files and loopback sockets."""
    if sys.platform != "darwin" or not Path("/usr/bin/sandbox-exec").exists():
        raise RuntimeError("Generated programs require macOS sandbox-exec on this pilot machine.")
    config = run_dir.parent / f".agent-config-{run_dir.name}"
    config.mkdir(exist_ok=True)
    profile = config / "program.sb"
    root = run_dir.parents[3]
    venv = env_python.parent.parent
    lines = ["(version 1)", "(allow default)",
             f"(deny file-read* (subpath {json.dumps(str(Path.home()))}))",
             f"(deny file-read* (subpath {json.dumps(str(root))}))",
             # Directory metadata is needed to resolve the interpreter symlink and cwd; their
             # children remain denied except for this run and its venv. A root under the home
             # directory needs every directory between the two as well (2026-10-22: without
             # them, python's realpath of the venv failed with "Operation not permitted").
             *[f"(allow file-read* (literal {json.dumps(str(path))}))" for path in
               (*[parent for parent in reversed(root.parents) if parent == Path.home() or Path.home() in parent.parents],
                root, root / "venvs", venv, root / "runs", run_dir.parents[2], run_dir.parents[1], run_dir.parents[0])],
             f"(allow file-read* (subpath {json.dumps(str(run_dir))}))",
             f"(allow file-read* (subpath {json.dumps(str(venv))}))",
             *[f"(allow file-read* (literal {json.dumps(str(parent))}))" for path in extra_reads
               for parent in reversed(path.parents) if parent == Path.home() or Path.home() in parent.parents],
             *[f"(allow file-read* (subpath {json.dumps(str(path))}))" for path in extra_reads],
             "(deny file-write*)",
             f"(allow file-write* (subpath {json.dumps(str(run_dir))}))",
             f"(allow file-write* (subpath {json.dumps(str(temporary))}))",
             '(allow file-write* (literal "/dev/null"))',
             "(deny network-inbound)", "(deny network-outbound)",
             f"(allow network-bind (subpath {json.dumps(str(temporary))}))",
             '(allow network-inbound (local ip "localhost:*"))',
             '(allow network-outbound (remote ip "localhost:*"))']
    profile.write_text("\n".join(lines) + "\n")
    return ["/usr/bin/sandbox-exec", "-f", str(profile), *command]


def _pdf(path: Path, spec: dict, screenshot: Path) -> tuple[list[dict], dict]:
    checks, metrics = [], {"pdf_bytes": path.stat().st_size, "pdf_engine": "poppler" if shutil.which("pdftoppm") else "PyMuPDF"}
    if all(shutil.which(x) for x in ("pdftoppm", "pdffonts", "pdftotext")):
        prefix = screenshot.with_suffix("")
        subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-scale-to", "1200", "-png", "-singlefile", str(path), str(prefix)],
                       check=True, capture_output=True, timeout=60)
        text = subprocess.run(["pdftotext", "-layout", str(path), "-"], check=True, capture_output=True, text=True, timeout=60).stdout
        fonts = subprocess.run(["pdffonts", str(path)], check=True, capture_output=True, text=True, timeout=60).stdout.splitlines()[2:]
        embedded = bool(fonts) and all(line.split()[-5].lower() == "yes" for line in fonts if len(line.split()) >= 6)
    else:
        import pymupdf
        doc = pymupdf.open(path)
        doc[0].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(screenshot)
        text = "\n".join(page.get_text() for page in doc)
        font_rows = [font for page in doc for font in page.get_fonts(full=True)]
        # Type3 glyph programs live in the PDF itself; extract_font returns no external font file.
        embedded = bool(font_rows) and all(font[2] == "Type3" or bool(doc.extract_font(font[0])[3]) for font in font_rows)
    import pymupdf
    doc = pymupdf.open(path)
    page = doc[0]
    width_mm, height_mm = page.rect.width * 25.4 / 72, page.rect.height * 25.4 / 72
    image_area = sum(abs(r.width * r.height) for image in page.get_images(full=True) for r in page.get_image_rects(image[0]))
    raster_fraction = min(1.0, image_area / (page.rect.width * page.rect.height))
    metrics.update({"pdf_pages": len(doc), "pdf_width_mm": width_mm, "pdf_height_mm": height_mm,
                    "pdf_raster_fraction": raster_fraction, "pdf_fonts_embedded": embedded})
    checks.append(item("pdf pages", "pass" if len(doc) == spec.get("pages", 1) else "fail", len(doc)))
    for axis, actual in (("width", width_mm), ("height", height_mm)):
        expected = spec.get(axis + "_mm")
        if expected:
            checks.append(item("pdf " + axis, "pass" if abs(actual - expected) <= 4 else "fail", f"{actual:.1f} mm (expected {expected})"))
    missing = [word for word in spec.get("text", []) if word.casefold() not in text.casefold()]
    checks.append(item("pdf selectable text", "fail" if missing else "pass", "missing: " + ", ".join(missing) if missing else "all expected text present"))
    if spec.get("fonts_embedded"):
        checks.append(item("pdf fonts embedded", "pass" if embedded else "fail", embedded))
    if "max_raster_fraction" in spec:
        checks.append(item("pdf vector area", "pass" if raster_fraction <= spec["max_raster_fraction"] else "fail", f"image area {raster_fraction:.3f}"))
    return checks, metrics


def _browser(html: Path, task: dict, folder: Path, chrome: str | None, library: str) -> tuple[list[dict], dict]:
    checks, metrics = [], {}
    screen = folder / "screenshot.png"
    after = folder / "after.png"
    errors, interaction_reports = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=chrome, headless=True,
                                     args=["--enable-unsafe-webgpu", "--enable-features=WebGPU"])
        context = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=2)
        # The same offline condition is used for every library. All deliverables must be standalone.
        context.route("http://**/*", lambda route: route.abort())
        context.route("https://**/*", lambda route: route.abort())
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        started = time.monotonic()
        page.goto(html.as_uri(), wait_until="load", timeout=120000)
        native = library.startswith("hmplot") and LIBRARIES.get(library, {}).get("track") == "javascript"
        report = None
        if native:
            try:
                report = page.evaluate("async () => await window.hmplotInspect()")
                (folder / "hmplot-check.json").write_text(json.dumps(report, indent=2) + "\n")
                checks.append(item("HMPlot artifact", "pass" if report.get("ready") else "fail", report.get("errors", [])))
                checks.append(_hmplot_marks_check(report.get("plots", [])))
                metrics["hmplot_advisories"] = advisories(report)
            except Exception as error:
                checks.append(item("HMPlot artifact", "fail", f"Native Svelte inspection failed: {error}"))
        try:
            page.wait_for_function("() => [...document.querySelectorAll('.canvas')].every(node => node.getAttribute('aria-busy') !== 'true')", timeout=60000)
        except Exception:
            pass
        # An HMPlot page shows its snapshot while the live view loads hidden (#hmplot-root
        # .hmplot-loading, before its canvases exist): the snapshot alone is not the drawn chart.
        try:
            page.wait_for_function("""() => document.querySelectorAll('.canvas[aria-busy=true]').length===0 &&
                !document.querySelector('#hmplot-root.hmplot-loading') &&
                [...document.querySelectorAll('canvas,svg,img')].some(n=>{const r=n.getBoundingClientRect();return r.width>100&&r.height>80})""",
                timeout=60000)
        except Exception:
            pass
        metrics["time_to_first_render_s"] = round(time.monotonic() - started, 3)
        page.wait_for_timeout(1500)
        page.screenshot(path=str(screen), full_page=True)
        if task.get("big_data"):
            # This is browser scheduling cadence, not GPU chart redraws. Keep it as a diagnostic;
            # the score's frame rate stays unmeasured unless a library exposes completed frames.
            metrics["browser_raf_fps"] = page.evaluate("""() => new Promise(resolve => {
              let frames=0, start=performance.now();
              function tick(now){frames++; if(now-start<1000) requestAnimationFrame(tick);
                else resolve(Math.round(frames*1000/(now-start)*10)/10)} requestAnimationFrame(tick);
            })""")
            metrics["frame_rate_fps"] = None
            metrics["frame_rate_note"] = "No library-neutral completed-draw counter available."
        state = page.evaluate("""() => {
          const nodes = [...document.querySelectorAll('canvas,svg,img')];
          const drawn = nodes.filter(n => {const r=n.getBoundingClientRect(); return r.width>100 && r.height>80});
          const plots = [...document.querySelectorAll('.js-plotly-plot')];
          const length = a => a?.length || a?._inputArray?.length || (a?.bdata ?
            Math.floor(atob(a.bdata).length / ({f8:8,f4:4,i4:4,u4:4,i2:2,u2:2,i1:1,u1:1}[a.dtype]||8)) : 0);
          const plotlyRows = plots.flatMap(p => p.data || []).reduce((n,t) => n + Math.max(length(t.x),length(t.y),length(t.z)),0);
          const vegaRows = document.querySelectorAll('svg .mark-symbol path').length;
          const specRows = typeof spec !== 'undefined' ? Object.values(spec.datasets||{}).reduce((n,a)=>n+a.length,0) + (spec.data?.values?.length||0) : 0;
          const specText = typeof spec !== 'undefined' ? JSON.stringify(spec,(k,v)=>k==='datasets'||k==='values'?undefined:v) : '';
          const rows = Math.max(plotlyRows,vegaRows,specRows);
          const plotText = plots.flatMap(p => (p.data||[]).map(t=>t.name||'')).join(' ');
          return {text:document.body.innerText + ' ' + [...document.querySelectorAll('svg text')].map(n=>n.textContent).join(' ') + ' ' + plotText + ' ' + specText,
            chartCount:drawn.length, plotCount:plots.length, hmplotCount:document.querySelectorAll('.canvas').length,
            hmplotRuntime:typeof hmplotExport === 'function' && !!document.getElementById('hmplot-state'),
            hmplotLiveCanvases:drawn.filter(n=>n.tagName==='CANVAS' && n.closest('#hmplot-root .canvas[aria-busy=false]')).length,
            vegaCount:document.querySelectorAll('svg .role-scope').length || document.querySelectorAll('.vega-embed').length,
            svgPanelCount:document.querySelectorAll('svg g[id^="axes_"]').length,
            rows, inputs:[...document.querySelectorAll('input')].map(n=>n.type),
            controls:document.querySelectorAll('button,select,[role=slider],.slider-container,.updatemenu-container').length,
            visible: drawn.length>0, busy:document.querySelectorAll('.canvas[aria-busy=true]').length};
        }""")
        if native:
            state["rows"] = max(state["rows"], _native_observed_rows(report))
        if library.startswith("hmplot"):
            # Svelte programs mount components directly; they have no Python scene payload.
            if LIBRARIES.get(library, {}).get("track", "python") == "python":
                checks.append(_hmplot_artifact_check(state))
            # HMPlot draws Text marks on the GPU canvas, where the DOM has no text (the page's
            # static snapshot had it, until the live plot replaced it). The page's own SVG export
            # writes them as text, so the text checks read that too (TODO 133.9).
            state["text"] += " " + page.evaluate("""async () => {
              if (typeof hmplotExport !== 'function') return '';
              try {
                const root = JSON.parse(document.getElementById('hmplot-state').textContent).state.root.id;
                const exported = await hmplotExport('export_svg', root, {});
                // A Facet exports each cell ({items}); anything else one document ({payload}).
                return (exported.items ?? [exported]).map(({payload}) => {
                  const svg = new TextDecoder().decode(Uint8Array.from(atob(payload ?? ''), c => c.charCodeAt(0)));
                  return [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('text')]
                    .map(n => n.textContent).join(' ');
                }).join(' ');
              } catch { return ''; }
            }""")
        checks.append(item("visible chart", "pass" if state["visible"] and state["busy"] == 0 else "fail", state))
        checks.append(item("browser errors", "fail" if errors else "pass", errors[:5]))
        checks.append(item("offline", "pass" if state["visible"] and not errors else "fail", "network blocked for every page"))
        for spec in task["checks"]:
            kind = spec["kind"]
            if kind == "text":
                missing = [value for value in spec["all"] if value.casefold() not in state["text"].casefold()]
                checks.append(item("expected text", "fail" if missing else "pass", "missing: " + ", ".join(missing) if missing else "all present"))
            elif kind == "rows":
                # Inspectable data arrays or native renderer summaries; otherwise leave unknown.
                checks.append(item("rows", "pass" if state["rows"] >= spec["min"] else "unknown",
                                   f"{state['rows']} observable rows; need {spec['min']}"))
            elif kind == "views":
                count = state["plotCount"] or state["hmplotCount"] or state["vegaCount"] or state["svgPanelCount"] or state["chartCount"]
                checks.append(item("views", "pass" if count >= spec["min"] else "unknown", count))
            elif kind == "input":
                found = set(state["inputs"])
                checks.append(item("input", "pass" if found.intersection(spec["any"]) or state["controls"] else "fail", sorted(found)))
            elif kind == "interaction":
                action = spec["action"]
                if action == "click" and task["id"] == "click-drilldown":
                    outcome = check_click_drilldown(page, folder, library)
                    checks.append(item("interaction click", outcome["status"], outcome["detail"]))
                    metrics["click_drilldown"] = outcome
                    continue
                if action == "click":
                    checks.append(item("interaction click", "unknown", "No targeted click oracle for this task"))
                    continue
                # The first plot (the last with target = "last", as an overview below its detail
                # is), by the most specific selector that matches: one selector list matches in
                # page order, so a title's <svg> above an HMPlot canvas took the gesture.
                pick = (lambda found: found.last) if spec.get("target") == "last" else (lambda found: found.first)
                target = next((pick(found) for found in (page.locator(selector) for selector in
                               (".canvas", ".js-plotly-plot", ".vega-embed svg", "canvas", "svg"))
                               if found.count()), None)
                if target is not None:
                    box = target.bounding_box()
                else:
                    box = None
                if action == "slider":
                    label = task.get("control_label")
                    control = page.get_by_role("slider", name=label).first if label else page.locator("input[type=range]:visible, [role=slider]:visible").first
                    if control.count():
                        control.evaluate("""el => {const lo=Number(el.min||0), hi=Number(el.max||100);
                          el.value=String(lo+(hi-lo)*.25); el.dispatchEvent(new Event('input',{bubbles:true}));
                          el.dispatchEvent(new Event('change',{bubbles:true}));}""")
                    else:
                        box = None
                elif action in ("brush", "rotate", "zoom") and box:
                    x, y = box["x"] + box["width"] * .35, box["y"] + box["height"] * .35
                    if action == "zoom":
                        page.mouse.move(x, y)
                        page.mouse.wheel(0, -450)
                    else:
                        if action == "brush" and library.startswith("hmplot"):
                            page.keyboard.down("Shift")
                        page.mouse.move(x, y)
                        page.mouse.down()
                        page.mouse.move(x + box["width"] * .3, y + box["height"] * .3, steps=8)
                        page.mouse.up()
                        if action == "brush" and library.startswith("hmplot"):
                            page.keyboard.up("Shift")
                elif action == "hover" and box:
                    page.mouse.move(box["x"] + box["width"] * .5, box["y"] + box["height"] * .5)
                elif action == "select":
                    # The second option of the labeled dropdown (a native <select>), else of the first
                    # visible one. A library's own dropdown widget leaves the image unchanged: "unknown".
                    label = task.get("control_label")
                    candidates = ([page.get_by_label(label, exact=True).first] if label else []) + \
                        [page.locator("select:visible").first]
                    for control in candidates:
                        if control.count() and control.evaluate("el => el.tagName") == "SELECT" and \
                                control.locator("option").count() > 1:
                            control.select_option(index=1)
                            break
                elif action == "animate":
                    button = page.get_by_role("button", name=re.compile("play|start|resume", re.I)).first
                    if button.count(): button.click()
                page.wait_for_timeout(1200)
                if native:
                    try:
                        observed = page.evaluate("async () => await window.hmplotInspect()")
                        interaction_reports.append({'action': action, 'report': observed})
                        checks.append(item("HMPlot after " + action, "pass" if observed.get("ready") else "fail", observed.get("errors", [])))
                    except Exception as error:
                        interaction_reports.append({'action': action, 'error': str(error)})
                        checks.append(item("HMPlot after " + action, "fail", str(error)))
                    (folder / "hmplot-check-after.json").write_text(json.dumps(interaction_reports, indent=2) + "\n")
                page.screenshot(path=str(after), full_page=True)
                delta = _difference(screen, after)
                if action == "brush":
                    panels = page.locator(".canvas, .js-plotly-plot, .vega-embed svg .role-scope")
                    if panels.count() >= 2:
                        other = panels.nth(1).bounding_box()
                        if other:
                            delta = _region_difference(screen, after, (other["x"], other["y"], other["width"], other["height"]))
                    elif box:
                        delta = _region_difference(screen, after, (box["x"] + box["width"] / 2, box["y"],
                                                                          box["width"] / 2, box["height"]))
                checks.append(_interaction_check(action, delta))
                metrics["interaction_change"] = delta
        checks.append(item("browser errors after interactions", "fail" if errors else "pass", errors[:5]))
        browser.close()
    metrics["browser_errors"] = errors
    return checks, metrics


def evaluate(task: dict, library: str, run_dir: Path, env_python: Path, chrome: str | None = None) -> dict:
    # uv's bin/python is a symlink to the base interpreter. Resolving it loses the venv.
    run_dir = run_dir.resolve()
    out = run_dir / "output"
    out.mkdir(exist_ok=True)
    for name in ("chart.html", "figure.pdf"):
        (out / name).unlink(missing_ok=True)
    for name in ("screenshot.png", "after.png", "pdf.png"):
        (run_dir / name).unlink(missing_ok=True)
    checks, metrics = [], {}
    program = run_dir / "solution.py"
    if not program.exists():
        return {"checks": [item("program", "fail", "solution.py missing")], "metrics": metrics}
    metrics["lines_of_code"] = sum(bool(line.strip()) for line in program.read_text().splitlines())
    start = time.monotonic()
    # The generated program sees a blank home and no inherited credentials or package manager
    # on PATH. HMPlot's bundled runtime and the preinstalled wheels are already in the venv.
    # Chromium uses MAC_CHROMIUM_TMPDIR (not TMPDIR) for its singleton socket on macOS.
    # Give this evaluation only a new dedicated child folder in the OS temp area.
    # Keep the Unix socket path under macOS's short sockaddr_un limit after Chrome
    # appends its per-process directory and SingletonSocket filename.
    temporary = Path(tempfile.mkdtemp(prefix="hmplot-r29-", dir="/private/tmp")).resolve()
    program_env = {"PATH": f"{env_python.parent}:/usr/bin:/bin", "HOME": str(run_dir),
                   "TMPDIR": str(temporary), "XDG_CACHE_HOME": str(temporary),
                   "MAC_CHROMIUM_TMPDIR": str(temporary),
                   "PYTHONNOUSERSITE": "1", "HMPLOT_NO_DOWNLOAD": "1",
                   # macOS Chrome cannot initialize its own nested sandbox inside this
                   # restrictive profile. The process remains inside the outer profile.
                   "HMPLOT_CHROME_NO_SANDBOX": "1"}
    try:
        done = subprocess.run(_sandbox_command(run_dir, env_python, temporary, [str(env_python), str(program)]),
                              cwd=run_dir, capture_output=True, text=True,
                              env=program_env, timeout=task.get("timeout", 180))
        metrics["run_seconds"] = round(time.monotonic() - start, 3)
        (run_dir / "program.stdout.txt").write_text(done.stdout[-20000:])
        (run_dir / "program.stderr.txt").write_text(done.stderr[-20000:])
        checks.append(item("program", "pass" if done.returncode == 0 else "fail", f"exit {done.returncode}: {done.stderr[-1200:]}"))
    except subprocess.TimeoutExpired:
        checks.append(item("program", "fail", "timed out"))
    html = out / "chart.html"
    checks.append(item("standalone HTML", "pass" if html.exists() and html.stat().st_size > 100 else "fail",
                       f"{html.stat().st_size if html.exists() else 0} bytes"))
    if html.exists() and html.stat().st_size > 100:
        try:
            more, browser = _browser(html, task, run_dir, chrome, library)
            checks.extend(more); metrics.update(browser)
        except Exception as error:
            checks.append(item("browser", "fail", repr(error)))
    if task.get("pdf"):
        pdf = out / "figure.pdf"
        checks.append(item("PDF file", "pass" if pdf.exists() and pdf.stat().st_size > 100 else "fail",
                           f"{pdf.stat().st_size if pdf.exists() else 0} bytes"))
        if pdf.exists() and pdf.stat().st_size > 100:
            try:
                more, pdf_metrics = _pdf(pdf, next(x for x in task["checks"] if x["kind"] == "pdf"), run_dir / "pdf.png")
                checks.extend(more); metrics.update(pdf_metrics)
                if (run_dir / "screenshot.png").exists():
                    metrics["pdf_html_similarity"] = _visual_similarity(run_dir / "screenshot.png", run_dir / "pdf.png")
            except Exception as error:
                checks.append(item("PDF inspection", "fail", repr(error)))
    if library.startswith("hmplot"):
        try:
            check = subprocess.run(_sandbox_command(run_dir, env_python, temporary,
                                                    [str(env_python), "-m", "hmplot", "check", str(program), "--json", "--no-png"]),
                                   cwd=run_dir, env=program_env, capture_output=True, text=True, timeout=task.get("timeout", 180))
            (run_dir / "hmplot-check.json").write_text(check.stdout)
            checks.append(item("hmplot check", "pass" if check.returncode == 0 else "fail", check.stdout[-1200:] + check.stderr[-400:]))
            if check.returncode == 0:
                checked = json.loads(check.stdout)
                plots = checked.get("plots", [])
                checks.append(_hmplot_marks_check(plots))
                metrics["hmplot_advisories"] = advisories(checked)
                rows = sum(mark.get("rows") or 0 for plot in plots for mark in plot.get("model", {}).get("marks", []))
                for entry in checks:
                    if entry["name"] == "rows" and entry["status"] == "unknown":
                        needed = next(spec["min"] for spec in task["checks"] if spec["kind"] == "rows")
                        entry.update(status="pass" if rows >= needed else "fail", detail=f"hmplot check: {rows} rows")
                    if entry["name"] == "views" and entry["status"] == "unknown":
                        needed = next(spec["min"] for spec in task["checks"] if spec["kind"] == "views")
                        entry.update(status="pass" if len(plots) >= needed else "fail", detail=f"hmplot check: {len(plots)} plots")
        except Exception as error:
            checks.append(item("hmplot check", "fail", repr(error)))
    shutil.rmtree(temporary, ignore_errors=True)
    return {"checks": checks, "metrics": metrics, "screenshot": str(run_dir / "screenshot.png"),
            "pdf_screenshot": str(run_dir / "pdf.png") if task.get("pdf") else None,
            "automatic_success": all(x["status"] == "pass" for x in checks)}
