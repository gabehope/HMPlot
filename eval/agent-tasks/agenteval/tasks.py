"""Versioned task manifests: TOML metadata above a Markdown prompt."""

from __future__ import annotations

import hashlib
import tomllib
from pathlib import Path

CATALOG = Path(__file__).resolve().parents[1] / "tasks"
PILOT_TASKS = ["scatter", "linked-brush", "million-slider"]
ORDER = ("scatter", "lines", "histogram", "facets", "linked-brush", "crossfilter",
         "hover-tooltip", "flights-airports", "slider-filter", "million-slider",
         "ten-million", "map-points", "map-tiles", "choropleth", "surface-3d",
         "points-3d", "animation", "simulation", "offline-html", "pdf-figure",
         "pdf-bigdata", "pdf-3d")


def read_task(path: Path) -> dict:
    text = path.read_text()
    if not text.startswith("+++\n") or "\n+++\n" not in text[4:]:
        raise ValueError(f"{path}: expected +++ TOML frontmatter")
    metadata, prompt = text[4:].split("\n+++\n", 1)
    task = tomllib.loads(metadata)
    if task.get("schema") != 1 or not prompt.strip():
        raise ValueError(f"{path}: schema must be 1 and prompt must be nonempty")
    if task.get("access") not in ("provided", "agent_fetch"):
        raise ValueError(f"{path}: access must be provided or agent_fetch")
    if not task.get("id") or not task.get("source") or not task.get("category"):
        raise ValueError(f"{path}: id, source and category are required")
    if not task.get("tracks") or not task.get("checks"):
        raise ValueError(f"{path}: tracks and checks are required")
    if task["access"] == "agent_fetch" and not task.get("sources"):
        raise ValueError(f"{path}: agent_fetch requires sources")
    for source in task.get('sources', []):
        if not source.get('url', '').startswith('https://'):
            raise ValueError(f'{path}: source URLs must use HTTPS')
        destination = source.get('destination', '')
        if not destination or Path(destination).name != destination or destination in ('.', '..'):
            raise ValueError(f'{path}: source destination must be a filename')
        if not isinstance(source.get('max_bytes'), int) or source['max_bytes'] < 1:
            raise ValueError(f'{path}: source needs positive max_bytes')
    task["prompt"] = prompt.strip()
    task["manifest"] = str(path.relative_to(CATALOG))
    task["prompt_sha256"] = hashlib.sha256(task["prompt"].encode()).hexdigest()
    return task


def load_tasks() -> list[dict]:
    tasks = [read_task(path) for path in sorted(CATALOG.glob("*/*.md"))]
    ids = [task["id"] for task in tasks]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate task ID")
    tasks.sort(key=lambda task: (ORDER.index(task["id"]) if task["id"] in ORDER else len(ORDER), task["id"]))
    return tasks


TASKS = load_tasks()
TASKS_BY_ID = {task["id"]: task for task in TASKS}
