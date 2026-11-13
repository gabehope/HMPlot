"""Fill every built-in theme with the complete shared presentation shape."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "src/lib/plot/themes"


def complete(definition: dict) -> dict:
    typography = definition.setdefault("typography", {})
    typography.setdefault("fontFamily", "system-ui, -apple-system, sans-serif")
    typography.setdefault("fontSize", 12)
    typography.setdefault("color", "#30343b")

    definition.setdefault("view", {}).setdefault("background", "#ffffff")

    axes = definition.setdefault("axes", {})
    axes.setdefault("color", typography["color"])
    axes.setdefault("fontSize", typography["fontSize"])
    axes.setdefault("lineWidth", 0.75)
    axes.setdefault("tickSize", 3)
    axes.setdefault("grid", "off")

    guides = definition.setdefault("guides", {})
    guides.setdefault("fontFamily", typography["fontFamily"])
    guides.setdefault("fontSize", typography["fontSize"])
    guides.setdefault("textColor", typography["color"])

    marks = definition.setdefault("marks", {})
    primary = (
        marks.get("Line", {}).get("color")
        or marks.get("Points", {}).get("fill")
        or definition.get("palette", ["#4c78a8"])[0]
    )
    defaults = {
        "Line": {"color": primary, "width": 1.5},
        "Points": {
            "fill": primary,
            "size": 6,
            "outlineColor": typography["color"],
            "outlineWidth": 0,
            "shape": "circle",
        },
        "Area": {"fill": primary, "opacity": 0.2},
        "ErrorBars": {"color": axes["color"], "width": 1, "capSize": 6},
        "Text": {"color": typography["color"], "size": typography["fontSize"]},
        "Links": {"color": axes["color"], "width": 1, "opacity": 1},
        "Segments": {"color": axes["color"], "width": 1, "opacity": 1},
        "Arrows": {"color": primary, "width": 2},
    }
    for kind, values in defaults.items():
        current = marks.setdefault(kind, {})
        for key, value in values.items():
            current.setdefault(key, value)
    return definition


def main() -> None:
    for path in sorted(ROOT.glob("*.json")):
        if path.name == "theme.schema.json":
            continue
        definition = complete(json.loads(path.read_text(encoding="utf-8")))
        path.write_text(json.dumps(definition, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
