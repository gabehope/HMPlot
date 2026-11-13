"""Build the docs' examples (R2.0b.4). Each example is a folder src/examples/<id>/ holding
<id>.py and <id>.svelte (and any data files they read). For each, this runs the Python program and
writes under static/example-builds/<id>/:

  payload.<hash>.json  the scene (state and columns), which the page draws live;
  preview.<hash>.svg, or preview-<width>.<hash>.webp at 1x and 2x  its web preview, shown at once
                (in the page's first HTML) until the live view has drawn, and instead of it
                without WebGPU (TODO 68.3): the SVG export when it is small, else WebP images;
  tree.<hash>.json, tree-preview.<hash>.svg  the same two for hm.visualize_tree of it (the "Show
                tree" view);
  thumbnail-<width>.<hash>.webp at 1x and 2x  its gallery thumbnail (TODO 69.19): the plot, or
                one panel of it (THUMBNAIL_PANELS), within 320 x 200 CSS pixels;
  assets.json   the example's manifest record: these files' names, sizes and alternative text;
  snapshot.svg, tree.svg  the full-quality SVG exports at the docs' column width;
  files.json, files/  the example's data files, which the Pyodide editor copies before a run;
  compare/<n>.svg  the SVG export of each Facet and each Plot outside one, in the tree's
                order: what the Svelte program's exports are checked against (R2.0b.3,
                docs-site.spec.js).

The files the page loads are named by a hash of their contents, so a host can cache them for
good (TODO 68.4); manifest.json, which lists every example's record by id, is not. It also writes
index.json (each example, how many exports it compares, and whether it has a Svelte program; a
Python-only component's has none) and builds the package's wheel, which the editor installs in
Pyodide. An example that warns fails to build; one whose files, and the package, are unchanged
since its last build is skipped. Run it through scripts/build-examples.mjs (npm run
build:examples), which picks the Python.

  build_examples.py [id ...]   only these examples

Examples build in order, except that ids listed in .priority (one per line; the dev server writes
it for a page that is waiting, scripts/vite-examples.js) go next, in a build of every example also
one added after the build started. "Examples: built <id>" and
"Examples: failed <id>" lines report each one as it finishes, and the manifest is rewritten
after each.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import os
import re
import runpy
import subprocess
import shutil
import sys
import traceback
import warnings
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

import hmplot as hm  # noqa: E402
from hmplot.core import Node  # noqa: E402
from hmplot.exporter import ExportSession  # noqa: E402

EXAMPLES = ROOT / "src" / "examples"
OUT = ROOT / "static" / "example-builds"
# The width examples are laid out at: the docs' column (820px, DocsPage.svelte) less the Example's
# border, so the snapshot matches the live view that replaces it.
WIDTH = 818


# Examples that fail on a known library bug, skipped (with a note) until it is fixed: id to reason.
KNOWN_FAILURES = {}

# The web previews (TODO 68.3), by purpose: each is preview()'s keyword arguments, and the page
# finds it under views.<view>.previews.<purpose> in the manifest. A small SVG export stays vector
# (crisp at any zoom); a large one, usually 3D scenes, maps and images embedded as megabytes of
# base64 PNG, becomes WebP images at 1x and 2x its CSS size for a srcset, when they are smaller.
# "views" lists the views a purpose has (both by default). The gallery's thumbnails (TODO 69.19)
# are the plot's only, fitted within 320 x 200 CSS pixels (a card's image frame), and always
# images: an SVG was 1 to 6 KB smaller than the 2x WebP for simple charts (both a few KB), while
# an image draws its text in the bundled font and costs the same to decode however many marks the
# chart has. scripts/build-thumbnails.mjs makes the same thumbnails for the gallery's programs
# that have no Python pair.
PREVIEWS = {"web": {"scales": (1, 2), "format": "webp", "quality": 0.85},
            "thumbnail": {"views": ("plot",), "width": 320, "height": 200, "scales": (1, 2), "format": "webp",
                          "quality": 0.8, "vector": False}}
# An SVG preview this small (gzipped) is kept without trying images.
VECTOR_BYTES = 40_000
# The panel a thumbnail shows for an example whose whole composition is unreadable at a card's
# size: its index among the example's Facets and Plots outside one (plots(); compare/<n>.svg).
THUMBNAIL_PANELS = {"coordinated-explorer": 0, "earthquakes": 0, "lorenz-attractor": 0, "layered-signal": 0, "scale-resources": 0}
# TODO 69.10: the view, without its guidance (unreadable at a card's size).
THUMBNAIL_PANELS.update({id: 0 for id in ("calculate-matrix", "calculate-large", "interaction-dashboard", "interaction-matrix",
                                         "interaction-keyed-updates", "scatterplot-matrix", "enter-exit")})


def display_handle(namespace):
    """The example's display handle: its one root component (the rule the editor uses too)."""
    handles = [value for value in namespace.values() if isinstance(value, Node)]
    roots = list({id(value): value for value in handles if value.parent is None}.values())
    if len(roots) == 1:
        return roots[0]
    if not roots and handles:
        return handles[-1]
    raise RuntimeError("An example keeps one display handle at top level, such as a Plot or a Scene.")


def payload(handle):
    scene = handle._scene()
    scene._validate()
    state, columns = scene._snapshot()
    return {"state": state, "columns": {key: {"descriptor": column.descriptor(),
                                              "payload": base64.b64encode(column.payload).decode("ascii")}
                                        for key, column in columns.items()}}


def plots(node):
    """What exports on its own under `node`, in the tree's order (the Svelte page's order too):
    each Facet, and each Plot outside one."""
    if node.kind in ("Plot", "Facet"):
        yield node
        return
    for child in node.children:
        yield from plots(child)


def package_digest():
    """What builds depend on besides an example: this builder, the package and its bundle."""
    digest = hashlib.sha256()
    digest.update(Path(__file__).read_bytes())
    for path in sorted((ROOT / "python" / "hmplot").rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            digest.update(str(path.relative_to(ROOT)).encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def example_digest(folder, package):
    digest = hashlib.sha256(package.encode())
    for path in sorted(folder.iterdir()):
        if path.is_file() and path.name != ".origin.json":
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def build_wheel(package):
    """The package's wheel for Pyodide, rebuilt when the package changed."""
    stamp = OUT / "wheel.sha256"
    wheels = list(OUT.glob("hmplot-*.whl"))
    if wheels and stamp.exists() and stamp.read_text() == package:
        return wheels[0]
    for wheel in wheels:
        wheel.unlink()
    # Pyodide needs no notebook or export bundles (28 MB): the build hook doesn't build them
    # (python/hatch_build.py), and hmplot/static is left out, with its lines in the wheel's RECORD.
    subprocess.run([sys.executable, "-m", "pip", "wheel", str(ROOT / "python"), "--no-deps", "--no-build-isolation",
                    "--quiet", "--wheel-dir", str(OUT)], check=True, env={**os.environ, "HMPLOT_SKIP_BUNDLES": "1"})
    wheel = next(OUT.glob("hmplot-*.whl"))
    slim = wheel.with_suffix(".slim")
    with zipfile.ZipFile(wheel) as source, zipfile.ZipFile(slim, "w", zipfile.ZIP_DEFLATED) as target:
        for info in source.infolist():
            if info.filename.startswith("hmplot/static/"):
                continue
            data = source.read(info)
            if info.filename.endswith(".dist-info/RECORD"):
                data = b"".join(line for line in data.splitlines(keepends=True) if not line.startswith(b"hmplot/static/"))
            target.writestr(info, data)
    slim.replace(wheel)
    stamp.write_text(package)
    (OUT / "wheel.json").write_text(json.dumps({"name": wheel.name}))
    return wheel


def hashed(out, stem, suffix, data):
    """Writes `data` as out/<stem>.<hash><suffix> and returns its path under OUT."""
    path = out / f"{stem}.{hashlib.sha256(data).hexdigest()[:10]}{suffix}"
    if not path.exists():
        path.write_bytes(data)
    return f"{out.name}/{path.name}"


# The mounted scene's plots as a screen reader hears the live view: each one's title and its
# generated description (TODO 49), for a preview's alternative text. Descriptions follow the
# export by a moment: wait up to 2 s for every plot's.
DESCRIBE = """async () => {
  const plots = () => [...document.querySelectorAll("section.plot")];
  for (let i = 0; i < 40 && !plots().every((plot) => plot.getAttribute("aria-describedby")); i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  return plots().map((plot) => {
    const text = (name) => plot.getAttribute(name) && document.getElementById(plot.getAttribute(name))?.textContent?.trim();
    return [text("aria-labelledby"), text("aria-describedby")].filter(Boolean).join(". ");
  }).filter(Boolean).join(" ");
}"""

# A PNG (base64) resized in the browser to each [width, height] and encoded as `type`, and its
# top left pixel's color ("#rrggbb", null when not opaque): the image's background, which a frame
# around it can match.
ENCODE = """async ({png, sizes, type, quality}) => {
  const image = new Image();
  image.src = "data:image/png;base64," + png;
  await image.decode();
  const corner = new OffscreenCanvas(1, 1).getContext("2d");
  corner.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
  const [r, g, b, a] = corner.getImageData(0, 0, 1, 1).data;
  const background = a === 255 ? "#" + [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("") : null;
  const encoded = [];
  for (const [width, height] of sizes) {
    const canvas = new OffscreenCanvas(width, height), context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type, quality })).arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    encoded.push(btoa(binary));
  }
  return { encoded, background };
}"""


def preview(session, node, svg, out, stem, *, scales=(1, 2), format="webp", quality=0.85, width=None, height=None,
            vector=True, vector_bytes=VECTOR_BYTES):
    """One web preview of `node`, whose SVG export is `svg`, written under `out` (TODO 68.3): the
    SVG itself when `vector` and it is under `vector_bytes` gzipped, else the node's PNG export
    resized to `width` CSS pixels (its own width by default; with `height` too, to fit within both)
    at each of `scales` and encoded as `format` ("webp" or "png") at `quality`, unless `vector` and
    the largest image is no smaller than the gzipped SVG. Returns its manifest record: src, type,
    width and height (CSS pixels), bytes, alt, and for images srcset ([src, pixel width] per scale)
    and background (the image's top left color, when opaque)."""
    root = re.search(rb"<svg\b[^>]*>", svg).group(0)
    size = [float(re.search(rb'\s%s="([0-9.]+)"' % name, root).group(1)) for name in (b"width", b"height")]
    fit = min(width / size[0], height / size[1]) if width and height else width / size[0] if width else 1
    css = (round(size[0] * fit), round(size[1] * fit))
    record = {"alt": session.page.evaluate(DESCRIBE), "width": css[0], "height": css[1]}
    packed = len(gzip.compress(svg))
    if vector and packed <= vector_bytes:
        return {**record, "src": hashed(out, stem, ".svg", svg), "type": "image/svg+xml", "bytes": len(svg)}
    png = session.png(node, scale=max(scales))
    sizes = [[round(css[0] * scale), round(css[1] * scale)] for scale in scales]
    result = session.page.evaluate(
        ENCODE, {"png": base64.b64encode(png).decode(), "sizes": sizes, "type": f"image/{format}", "quality": quality})
    images = [base64.b64decode(item) for item in result["encoded"]]
    if vector and len(images[-1]) >= packed:
        return {**record, "src": hashed(out, stem, ".svg", svg), "type": "image/svg+xml", "bytes": len(svg)}
    srcset = [[hashed(out, f"{stem}-{w}", f".{format}", data), w] for (w, _), data in zip(sizes, images)]
    return {**record, "src": srcset[-1][0], "srcset": srcset, "type": f"image/{format}", "bytes": [len(data) for data in images],
            **({"background": result["background"]} if result["background"] else {})}


def build(folder, session, digest):
    name = folder.name
    out = OUT / name
    out.mkdir(parents=True, exist_ok=True)
    cwd = os.getcwd()
    os.chdir(folder)  # data files are read by relative path
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            namespace = runpy.run_path(str(folder / f"{name}.py"), run_name="__main__")
    finally:
        os.chdir(cwd)
    handle = display_handle(namespace)
    tree = hm.visualize_tree(handle)
    shutil.rmtree(out / "compare", ignore_errors=True)
    (out / "compare").mkdir()
    panels = []
    for index, plot in enumerate(plots(handle)):
        panels.append((plot, session.svg(plot)))
        (out / "compare" / f"{index}.svg").write_bytes(panels[-1][1])
    views = {}
    for view, node in (("plot", handle), ("tree", tree)):
        data = json.dumps(payload(node)).encode()
        # A root that draws nothing itself (a Data holding Plots) exports as its scene.
        shown = node if node.kind in ("Plot", "Facet", "Scene") else node._scene()
        svg = session.svg(shown)
        (out / f"{'snapshot' if view == 'plot' else 'tree'}.svg").write_bytes(svg)
        previews = {}
        for purpose, options in PREVIEWS.items():
            options = dict(options)
            if view not in options.pop("views", ("plot", "tree")):
                continue
            # Files: preview.*, tree-preview.* for the web; <purpose>.*, tree-<purpose>.* otherwise.
            stem = ("preview" if purpose == "web" else purpose) if view == "plot" else f"tree-{'preview' if purpose == 'web' else purpose}"
            target, target_svg = panels[THUMBNAIL_PANELS[name]] if purpose == "thumbnail" and name in THUMBNAIL_PANELS else (shown, svg)
            previews[purpose] = preview(session, target, target_svg, out, stem, **options)
        views[view] = {"payload": hashed(out, "payload" if view == "plot" else "tree", ".json", data), "previews": previews}
    # The data files the programs read by relative path (a .md beside them is a note, such as the
    # data's source), copied where the Pyodide editor fetches them.
    files = [path.name for path in sorted(folder.iterdir())
             if path.is_file() and path.suffix not in (".py", ".svelte", ".md") and not path.name.startswith(".")]
    shutil.rmtree(out / "files", ignore_errors=True)
    if files:
        (out / "files").mkdir()
        for name in files:
            shutil.copyfile(folder / name, out / "files" / name)
    (out / "files.json").write_text(json.dumps(files))
    record = {"views": views, "files": files}
    # The hashed files of this build and the previous one stay (a page loaded just before a
    # rebuild still finds its files); older ones, and the unhashed payloads of earlier builders, go.
    def named(record):
        return {path.split("/")[-1] for view in record.get("views", {}).values() for path in
                [view["payload"], *(item for preview in view["previews"].values()
                                    for item in [preview["src"], *(src for src, _ in preview.get("srcset", []))])]}
    previous = json.loads((out / "assets.json").read_text()) if (out / "assets.json").exists() else {}
    kept = named(record) | named(previous)
    (out / "assets.json").write_text(json.dumps(record))
    for path in out.iterdir():
        if path.is_file() and path.name not in kept and (re.fullmatch(r"(payload|tree|preview|thumbnail)[\w-]*\.[0-9a-f]{10}\.\w+", path.name)
                                                         or path.name in ("payload.json", "tree.json")):
            path.unlink()
    # Written last: an interrupted build is redone.
    (out / "digest").write_text(digest)


def write_manifest():
    """manifest.json: every built example's record (assets.json), by id. Replaced atomically: the
    dev server reads it while examples build."""
    manifest = {}
    for folder in sorted(OUT.iterdir()):
        record = folder / "assets.json"
        if folder.is_dir() and record.exists() and (folder / "digest").exists():
            manifest[folder.name] = json.loads(record.read_text())
    temporary = OUT / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, separators=(",", ":")))
    temporary.replace(OUT / "manifest.json")


def priority():
    """The ids in .priority (the dev server's, for pages waiting for them)."""
    try:
        return [line.strip() for line in (OUT / ".priority").read_text().splitlines() if line.strip()]
    except FileNotFoundError:
        return []


def prioritized(pending):
    """`pending` (a dict, in build order) with the ids in .priority first."""
    first = priority()
    return {**{folder: digest for folder, digest in pending.items() if folder.name in first}, **pending}


def added(pending, done, package):
    """The examples in .priority that this build did not start with (added since: TODO 73.8) and
    that are missing or stale, with their digests."""
    found = {}
    for name in priority():
        folder = EXAMPLES / name
        if (name in done or name in KNOWN_FAILURES or folder in pending or "/" in name
                or not (folder / f"{name}.py").exists()):
            continue
        digest, stamp = example_digest(folder, package), OUT / name / "digest"
        if not (stamp.exists() and stamp.read_text() == digest):
            found[folder] = digest
    return found


def main(ids):
    OUT.mkdir(parents=True, exist_ok=True)
    package = package_digest()
    build_wheel(package)
    folders = sorted(path for path in EXAMPLES.iterdir() if path.is_dir() and (path / f"{path.name}.py").exists())
    if ids:
        missing = set(ids) - {folder.name for folder in folders}
        if missing:
            raise SystemExit(f"No such example: {', '.join(sorted(missing))}")
        folders = [folder for folder in folders if folder.name in ids]
    for name, reason in KNOWN_FAILURES.items():
        print(f"Examples: skipping {name} ({reason}).")
    folders = [folder for folder in folders if folder.name not in KNOWN_FAILURES]
    stale = {}
    for folder in folders:
        digest, stamp = example_digest(folder, package), OUT / folder.name / "digest"
        if not (stamp.exists() and stamp.read_text() == digest):
            stale[folder] = digest
    if stale:
        with ExportSession() as session:
            session._ensure_browser()
            session.page.call("Emulation.setDeviceMetricsOverride",
                              {"width": WIDTH, "height": 800, "deviceScaleFactor": 2, "mobile": False})
            # Reduced motion stops every clock at 0 (clockScope.js), so an animated example
            # exports the same moment every time; the Svelte-versus-Python check does the same.
            session.page.call("Emulation.setEmulatedMedia",
                              {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]})
            failures = []
            pending, done = dict(stale), set()
            while True:
                # A build of every example also builds one a page waits for that was added since.
                if not ids:
                    pending.update(added(pending, done, package))
                if not pending:
                    break
                folder = next(iter(prioritized(pending)))
                pending.pop(folder)
                done.add(folder.name)
                # Its files as they are now (an example saved since this build started builds as
                # saved); one saved during its build is left stale, for the next build.
                digest = example_digest(folder, package)
                try:
                    build(folder, session, digest)
                    if example_digest(folder, package) != digest:
                        (OUT / folder.name / "digest").unlink(missing_ok=True)
                    write_manifest()
                    print(f"Examples: built {folder.name}", flush=True)
                except Exception as error:
                    origin_path = folder / ".origin.json"
                    origin = json.loads(origin_path.read_text()) if origin_path.exists() else None
                    frames = traceback.extract_tb(error.__traceback__)
                    line = next((frame.lineno for frame in reversed(frames) if frame.filename == str(folder / f"{folder.name}.py")), 1)
                    if isinstance(error, SyntaxError):
                        line = error.lineno or line
                    location = f"{origin['file']}:{origin['pythonLine'] + line - 1}" if origin else f"src/examples/{folder.name}/{folder.name}.py:{line}"
                    failures.append(f"{location}: {type(error).__name__}: {str(error).splitlines()[0]}")
                    print(f"Examples: failed {folder.name}", flush=True)
    write_manifest()
    if stale and failures:
        raise SystemExit("\n".join(failures))
    # Every example (not only these), with how many Plots each compares.
    every = sorted(path.name for path in EXAMPLES.iterdir() if path.is_dir() and (path / f"{path.name}.py").exists())
    (OUT / "index.json").write_text(json.dumps([
        {"id": name, "plots": len(list((OUT / name / "compare").glob("*.svg"))),
         "svelte": (EXAMPLES / name / f"{name}.svelte").exists(),
         "origin": json.loads((EXAMPLES / name / ".origin.json").read_text()) if (EXAMPLES / name / ".origin.json").exists() else None}
        for name in every if (OUT / name / "digest").exists()]))
    print(f"Examples: {len(done) if stale else 0} built, {len(folders) - len(stale)} up to date.")


if __name__ == "__main__":
    main(sys.argv[1:])
