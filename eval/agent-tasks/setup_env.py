"""Set up the agent-task eval's environments in ROOT (any folder outside the repository).

    python3 setup_env.py ROOT [--only harness,baselines,hmplot,all,javascript] [--python 3.13]

Separate environments, so a run sees only what its condition allows:

- ROOT/venvs/harness: what the harness itself uses (Playwright with the installed Chrome,
  PyMuPDF for PDFs when poppler is missing, NumPy/pandas/pyarrow for the task data). The agents
  never run it.
- ROOT/venvs/baselines: the other libraries (libraries.py, BASELINE_PACKAGES) and the common data
  packages. The baseline runs and the free-choice runs use it. HMPlot is not in it.
- ROOT/venvs/hmplot: HMPlot built from this checkout's python/ folder (a wheel, as users install
  it, not an editable install that points into the repository) and the common data packages.
- ROOT/venvs/all: HMPlot plus the Python baselines for all-library free choice.
- ROOT/venvs/javascript: scratch-only npm packages for Svelte, deck.gl,
  Observable Plot and D3; the lockfile lives here, outside the repository.

With uv on PATH the environments are made with uv, without pip in them: a run cannot install
packages (the prompt says so, and the permission rules deny pip too). Without uv, venv and pip
are used and pip is removed from the run environments afterwards.

It writes ROOT/versions.json: the Python, every installed package's version per environment,
Chrome's and poppler's presence, and what each baseline can export (capabilities.py, run in the
baselines environment: HTML, PDF and PNG with a tiny figure; a library that cannot gets that
recorded with the error).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))

from agenteval.libraries import BASELINE_PACKAGES, COMMON_PACKAGES, HARNESS_PACKAGES  # noqa: E402

ENVS = ("harness", "baselines", "hmplot", "all", "javascript", "javascript-hmplot")

JS_PACKAGES = {"private": True, "type": "module", "dependencies": {
    "svelte": "5.54.0", "vite": "6.4.1", "@sveltejs/vite-plugin-svelte": "5.1.1",
    "vite-plugin-singlefile": "^2.3.0", "@deck.gl/core": "^9.1.0",
    "@deck.gl/layers": "^9.1.0", "@deck.gl/geo-layers": "^9.1.0",
    "@observablehq/plot": "^0.6.0", "d3": "^7.9.0", "svelte-check": "4.3.0",
    "typescript": "6.0.3", "hyparquet": "1.31.2", "hyparquet-compressors": "1.1.2"}}


def make_js_env(root: Path, name="javascript", tarball: Path | None = None) -> dict:
    folder = root / "venvs" / name
    folder.mkdir(parents=True, exist_ok=True)
    manifest = folder / "package.json"
    packages = json.loads(json.dumps(JS_PACKAGES))
    if name == 'javascript-hmplot':
        if not tarball or not tarball.is_file():
            raise SystemExit('javascript-hmplot requires --hmplot-package pointing to a frozen npm tarball.')
        packages['dependencies']['hmplot'] = str(tarball.resolve())
    if manifest.exists() and json.loads(manifest.read_text()) != packages:
        raise SystemExit(f'{manifest} already describes different dependencies; use a fresh evaluation root.')
    manifest.write_text(json.dumps(packages, indent=2) + "\n")
    if name == 'javascript-hmplot':
        # A rebuilt tarball keeps its version, and npm then keeps the installed copy (2026-10-23:
        # an eval's Svelte conditions ran a day-old build). Drop it so this tarball is extracted.
        shutil.rmtree(folder / 'node_modules/hmplot', ignore_errors=True)
        lock = folder / "package-lock.json"
        if lock.exists():
            locked = json.loads(lock.read_text())
            locked.get("packages", {}).pop("node_modules/hmplot", None)
            lock.write_text(json.dumps(locked, indent=2) + "\n")
    run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", folder])
    if name == 'javascript-hmplot':
        # Both doc conditions get identical code/types, with guidance supplied only by the harness.
        installed = folder / 'node_modules/hmplot'
        shutil.rmtree(installed / 'docs', ignore_errors=True)
        shutil.rmtree(folder / 'node_modules/hmplot/dist/docs', ignore_errors=True)
        for markdown in installed.glob('*.md'):
            if markdown.name not in {'LICENSE.md', 'THIRD_PARTY_NOTICES.md'}:
                markdown.unlink()
    lock = folder / "package-lock.json"
    return {"packages": json.loads(lock.read_text()).get("packages", {}),
            "lock_sha256": hashlib.sha256(lock.read_bytes()).hexdigest(),
            **({'hmplot_package': {'path': str(tarball.resolve()),
                                  'sha256': hashlib.sha256(tarball.read_bytes()).hexdigest()}}
               if name == 'javascript-hmplot' else {})}


def run(command, **kwargs):
    print("$", " ".join(map(str, command)), flush=True)
    return subprocess.run(list(map(str, command)), check=True, **kwargs)


def make_env(root: Path, name: str, packages: list[str], python: str, uv: str | None):
    env = root / "venvs" / name
    py = env / "bin" / "python"
    if not py.exists():
        if uv:
            run([uv, "venv", "--python", python, env])
        else:
            run([sys.executable, "-m", "venv", env])
    # A rebuilt wheel keeps its version: reinstall it, or the old build stays (see make_js_env).
    wheel = any(str(item).split("[")[0].endswith(".whl") for item in packages)
    if uv:
        run([uv, "pip", "install", "--python", py, *(["--reinstall-package", "hmplot"] if wheel else []), *packages])
    else:
        run([py, "-m", "pip", "install", "--upgrade", *(["--force-reinstall"] if wheel else []), *packages])
    return py


def freeze(py: Path) -> dict[str, str]:
    code = ("import json, importlib.metadata as m; "
            "print(json.dumps({d.metadata['Name']: d.version for d in m.distributions()}))")
    out = subprocess.run([str(py), "-c", code], check=True, capture_output=True, text=True).stdout
    return dict(sorted(json.loads(out).items(), key=lambda item: item[0].lower()))


def hmplot_wheel(out: Path) -> Path:
    """Build HMPlot's wheel from the checkout (needs the bundles: npm run build:python)."""
    static = REPO / "python" / "hmplot" / "static" / "standalone.js"
    if not static.exists():
        raise SystemExit("python/hmplot/static has no bundles: run `npm run build:python` in the repository first.")
    uv = shutil.which("uv")
    if uv:
        run([uv, "build", "--wheel", "--out-dir", out, REPO / "python"])
    else:
        run([sys.executable, "-m", "pip", "wheel", "--no-deps", "-w", out, REPO / "python"])
    wheels = sorted(out.glob("hmplot-*.whl"))
    if not wheels:
        raise SystemExit("no hmplot wheel was built")
    return wheels[-1]


def tools() -> dict[str, object]:
    found = {name: shutil.which(name) for name in ("pdftoppm", "pdffonts", "pdftotext", "uv")}
    chrome = None
    for candidate in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", shutil.which("google-chrome"),
                      shutil.which("google-chrome-stable"), shutil.which("chromium")):
        if candidate and Path(candidate).exists():
            chrome = candidate
            break
    found["chrome"] = chrome
    if chrome:
        try:
            found["chrome_version"] = subprocess.run([chrome, "--version"], capture_output=True, text=True, timeout=30).stdout.strip()
        except Exception as error:  # noqa: BLE001
            found["chrome_version"] = f"unknown ({error})"
    # Record the host tools that compile and render the frozen package, not only npm dependencies.
    found['executables'] = {}
    for name, executable in [('node', shutil.which('node')), ('npm', shutil.which('npm')), ('chrome', chrome)]:
        if not executable:
            continue
        path = Path(executable).resolve()
        version = subprocess.run([str(path), '--version'], capture_output=True, text=True, timeout=30)
        found['executables'][name] = {'path': str(path),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'version': (version.stdout or version.stderr).strip()}
    return found


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("root", type=Path, help="where the environments go (outside the repository)")
    parser.add_argument("--only", default=",".join(ENVS), help="which environments: harness,baselines,hmplot,all,javascript")
    parser.add_argument("--hmplot-package", type=Path, help="Frozen HMPlot npm tarball for JavaScript conditions")
    parser.add_argument("--python", default="3.13", help="the Python version (uv) for every environment")
    options = parser.parse_args(argv)
    root = options.root.resolve()
    if REPO in root.parents or root == REPO:
        raise SystemExit("ROOT must be outside the repository (the runs must not see its files).")
    root.mkdir(parents=True, exist_ok=True)
    uv = shutil.which("uv")
    only = [name.strip() for name in options.only.split(",") if name.strip()]
    versions_file = root / "versions.json"
    versions = json.loads(versions_file.read_text()) if versions_file.exists() else {}
    versions.update({"date": date.today().isoformat(), "platform": platform.platform(), "tools": tools(), "envs": versions.get("envs", {})})
    pythons = {}
    for name in only:
        if name in {"javascript", "javascript-hmplot"}:
            versions["envs"][name] = make_js_env(root, name, options.hmplot_package)
            continue
        if name == "harness":
            py = make_env(root, name, HARNESS_PACKAGES + COMMON_PACKAGES, options.python, uv)
        elif name == "baselines":
            py = make_env(root, name, BASELINE_PACKAGES + COMMON_PACKAGES, options.python, uv)
        elif name == "hmplot":
            with tempfile.TemporaryDirectory() as folder:
                wheel = hmplot_wheel(Path(folder))
                py = make_env(root, name, [f"{wheel}[dataframes,arrow]", *COMMON_PACKAGES], options.python, uv)
        elif name == "all":
            with tempfile.TemporaryDirectory() as folder:
                wheel = hmplot_wheel(Path(folder))
                py = make_env(root, name, [f"{wheel}[dataframes,arrow]", *COMMON_PACKAGES,
                                           *BASELINE_PACKAGES], options.python, uv)
        else:
            raise SystemExit(f"unknown environment {name!r}: pass {', '.join(ENVS)}")
        if not uv and name != "harness":
            # Runs must not install packages: remove pip from their environments.
            subprocess.run([str(py), "-m", "pip", "uninstall", "-y", "pip"], check=False)
        pythons[name] = py
        versions["envs"][name] = {"python": str(py), "python_version": subprocess.run(
            [str(py), "-c", "import sys; print(sys.version.split()[0])"], capture_output=True, text=True).stdout.strip(),
            "packages": freeze(py)}
    if "baselines" in pythons:
        out = subprocess.run([str(pythons["baselines"]), str(HERE / "agenteval" / "capabilities.py")],
                             capture_output=True, text=True, timeout=1800)
        try:
            versions["capabilities"] = json.loads(out.stdout.strip().splitlines()[-1])
        except (IndexError, json.JSONDecodeError):
            versions["capabilities"] = {"error": (out.stdout + out.stderr)[-4000:]}
    versions_file.write_text(json.dumps(versions, indent=2) + "\n")
    print(f"wrote {versions_file}")
    missing = [name for name in ("pdftoppm", "pdffonts", "pdftotext") if not versions["tools"].get(name)]
    if missing:
        print("poppler is missing (" + ", ".join(missing) + "): the PDF checks use PyMuPDF instead. "
              "Install poppler for the reference checks (macOS: `brew install poppler`; Debian/Ubuntu: "
              "`apt install poppler-utils`).")


if __name__ == "__main__":
    main()
