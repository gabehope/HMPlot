import math
import runpy
from pathlib import Path

import pytest

pytest.importorskip("PIL")

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "62_solar_system.py"


@pytest.fixture(scope="module")
def example():
    return runpy.run_path(str(EXAMPLE))


def test_solar_system_builds_lit_textured_bodies(example):
    scene, frames = example["scene"], example["frames"]
    assert len(frames["bodies"]) == len(frames["labels"]) == 8 and frames["rings"] is not None
    images = [node.children[0] for node in frames["bodies"]]
    assert all(image.kind == "Image" and image.props["lit"] is True for image in images)
    assert images[0].props["data"].shape == (256, 512, 3)
    assert frames["sun"].children[0].props.get("lit") is None
    lights = scene.children[0].props["lights"]
    assert [light["kind"] for light in lights] == ["ambient", "point"]
    assert lights[1] == {"kind": "point", "position": [0, 0, 0], "intensity": 3.2, "decay": 0}
    # The Milky Way goes to the browser as its JPEG file, and the Sun glows (TODO 37.5).
    [sky] = scene.children[0].props["effects"]
    assert sky["kind"] == "sky" and sky["image"].mime == "image/jpeg"
    assert frames["sun"].children[0].props["glow"] == 1


def test_show_moves_only_placements(example):
    frames, show = example["frames"], example["show"]
    earth = frames["bodies"][2]
    before = dict(earth.props)
    show(365.25 / 4, seconds=1.5)
    after = earth.props["placement"]
    assert set(earth.props) == set(before)
    # A quarter of Earth's year turns it a quarter orbit, counterclockwise seen from above.
    start = example["placements"](0)[2]["body"]["anchor"]
    turn = math.atan2(-after["anchor"][2], after["anchor"][0]) - math.atan2(-start[2], start[0])
    assert math.isclose(turn % (2 * math.pi), math.pi / 2, abs_tol=1e-6)
    assert after["size"] == before["placement"]["size"]
    assert after["rotation"][0] == 23.44 and after["rotation"][1] == pytest.approx(360 * 1.5 / 6)
    label = frames["labels"][2].props["placement"]
    assert label["anchor"][0] == after["anchor"][0] and label["anchor"][2] == after["anchor"][2]
    show(0)
    assert earth.props["placement"]["anchor"] == start
