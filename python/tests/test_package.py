"""The wheel carries what git does not: the notebook and export bundles, built from the
JavaScript sources (python/hatch_build.py, R1.4), and the notices beside them (R1.5)."""

import zipfile
from pathlib import Path

import pytest

PYTHON = Path(__file__).resolve().parents[1]


def test_the_wheel_contains_the_bundles_the_license_and_the_notices(tmp_path):
    wheel_builder = pytest.importorskip("hatchling.builders.wheel")
    wheel = Path(next(wheel_builder.WheelBuilder(str(PYTHON)).build(directory=str(tmp_path), versions=["standard"])))
    # The wheel's name carries the version as PEP 440 normalizes it (0.1.0-alpha.1 is 0.1.0a1).
    dist_info = wheel.name.split("-py3")[0] + ".dist-info"
    with zipfile.ZipFile(wheel) as archive:
        sizes = {info.filename: info.file_size for info in archive.infolist()}
        license_text = archive.read("hmplot/LICENSE").decode()
        notices = archive.read("hmplot/static/THIRD_PARTY_NOTICES.md").decode()
        metadata = archive.read(f"{dist_info}/METADATA").decode()
    for bundle in ("hmplot/static/widget.js", "hmplot/static/standalone.js"):
        assert sizes.get(bundle, 0) > 1_000_000, bundle
    assert "hmplot/static/SourceSans3-LICENSE.md" in sizes
    assert f"{dist_info}/licenses/LICENSE" in sizes
    assert "License-Expression: MIT" in metadata
    assert license_text.startswith("MIT License\n\nCopyright (c) 2026 Gabe Hope and contributors")
    # The copies the package builds from match the repository's, where there is one.
    for name, text in (("LICENSE", license_text), ("THIRD_PARTY_NOTICES.md", notices)):
        if (PYTHON.parent / name).exists():
            assert text == (PYTHON.parent / name).read_text(), f"python's {name} differs from the repository's"
    assert "| three |" in notices and "| @hmplot/jax |" in notices
