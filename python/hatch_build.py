"""Hatch build hook: builds the notebook and export bundles when they are missing (R1.4).

hmplot/static/widget.js and standalone.js are built from the JavaScript sources in the
repository (`npm run build:python`), not kept in git. Building a wheel or sdist from a source
checkout without them runs that build first, so it needs Node.js and the repository's
dependencies (`npm ci` in the repository root). An sdist carries the bundles, so a wheel built
from it needs no Node. HMPLOT_SKIP_BUNDLES=1 builds without them: the docs' Pyodide wheel
(scripts/build_examples.py) leaves them out anyway.
"""

import os
import shutil
import subprocess
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

# What `npm run build:python` writes beside the Python code, all of which ships.
BUILT = ("widget.js", "standalone.js", "SourceSans3-LICENSE.md", "THIRD_PARTY_NOTICES.md")


class BundleHook(BuildHookInterface):
    PLUGIN_NAME = "custom"

    def initialize(self, version, build_data):
        static = Path(self.root) / "hmplot" / "static"
        missing = [name for name in BUILT if not (static / name).exists()]
        if not missing or os.environ.get("HMPLOT_SKIP_BUNDLES"):
            return
        repository = Path(self.root).parent
        npm = shutil.which("npm")
        if not (repository / "package.json").exists() or npm is None or not (repository / "node_modules").exists():
            raise RuntimeError(
                f"hmplot/static is missing {', '.join(missing)}: the notebook and export bundles, built from "
                "HMPlot's JavaScript sources. Building the Python package from a source checkout needs Node.js "
                "and npm: run `npm ci` in the repository root, then build again (or run `npm run "
                "build:python` first). To install without building, use a released wheel: pip install hmplot."
            )
        self.app.display_info("Building the notebook and export bundles (npm run build:python)")
        subprocess.run([npm, "run", "build:python"], cwd=repository, check=True)
        missing = [name for name in BUILT if not (static / name).exists()]
        if missing:
            raise RuntimeError(f"npm run build:python did not write hmplot/static/{', '.join(missing)}.")
