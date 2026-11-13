"""The HTML export closure, on the cases tests/unit/export-closure.test.js checks in JavaScript."""
import json
from pathlib import Path

import pytest

from hmplot.exporter import _closure

FIXTURE = json.loads((Path(__file__).parents[2] / "tests/unit/fixtures/export-closure.json").read_text())
RESOURCES = ("tables", "columns", "scales", "normalizations", "themes", "selections", "identities")


def node_ids(node):
    return [node["id"], *(i for child in node["children"] for i in node_ids(child))]


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda case: case["name"])
def test_export_closure_matches_the_browser(case):
    if "rejects" in case:
        with pytest.raises(ValueError, match=case["rejects"]):
            _closure(FIXTURE["state"], case["target"])
        return
    state, omitted = _closure(FIXTURE["state"], case["target"])
    actual = {"nodes": sorted(node_ids(state["root"])), "omitted": omitted,
              **{name: sorted(state[name]) for name in RESOURCES}}
    assert actual == {key: case["keeps"][key] for key in actual}
