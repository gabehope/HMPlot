"""Compatibility entry point for the one-way JavaScript/Python API generator."""
from pathlib import Path
import subprocess
import sys

script = Path(__file__).resolve().with_name("generate-python-signatures.mjs")
raise SystemExit(subprocess.call(["node", str(script), *sys.argv[1:]]))
