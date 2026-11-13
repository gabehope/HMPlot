"""Parse a benchmark TOML file and expand a deterministic run matrix."""

from __future__ import annotations

import hashlib
import json
import os
import re
import random
import tomllib
from pathlib import Path

from .agents import ADAPTERS
from .libraries import LIBRARIES
from .tasks import TASKS_BY_ID

BACKENDS = set(ADAPTERS)


def read_config(path: Path) -> dict:
    raw = path.read_bytes()
    config = tomllib.loads(raw.decode())
    benchmark = config.get("benchmark", {})
    for key in ("repetitions", "corrections"):
        value = benchmark.get(key)
        if type(value) is not int or value < (1 if key == "repetitions" else 0):
            raise ValueError(f"benchmark.{key} must be a valid integer")
    agents = config.get("agents", {})
    if not agents:
        raise ValueError("configure at least one agent")
    for name, agent in agents.items():
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', name):
            raise ValueError(f'agent ID {name!r}: use letters, digits, underscores or hyphens')
        if agent.get("backend") not in BACKENDS or not agent.get("binary") or not agent.get("model"):
            raise ValueError(f"agent {name}: backend, binary and model are required")
        agent["binary"] = os.path.expandvars(agent["binary"])
        if '${' in agent['binary']:
            raise ValueError(f"agent {name}: unresolved binary environment variable")
        if not agent['binary'].strip():
            raise ValueError(f"agent {name}: binary expanded to an empty path; set its environment variable or use an absolute path")
    selected = benchmark.get("tasks", [])
    sources = benchmark.get("sources", [])
    if bool(selected) == bool(sources):
        raise ValueError("choose benchmark.tasks or benchmark.sources")
    if sources:
        unknown = set(sources) - {task['source'] for task in TASKS_BY_ID.values()}
        if unknown:
            raise ValueError(f'unknown sources: {sorted(unknown)}')
        selected = [task["id"] for task in TASKS_BY_ID.values() if task["source"] in sources]
        if not selected:
            raise ValueError("no tasks matched benchmark.sources")
    if len(selected) != len(set(selected)):
        raise ValueError('duplicate task in benchmark.tasks')
    for task_id in selected:
        if task_id not in TASKS_BY_ID:
            raise ValueError(f"unknown task {task_id}")
    tracks = config.get("tracks", {})
    if not tracks:
        raise ValueError("configure at least one track")
    for track, entry in tracks.items():
        if track not in ("python", "javascript"):
            raise ValueError(f"unknown track {track}")
        if not entry.get('libraries'):
            raise ValueError(f"track {track} requires libraries")
        if len(entry['libraries']) != len(set(entry['libraries'])):
            raise ValueError(f'duplicate library in track {track}')
        for library in entry.get("libraries", []):
            if library not in LIBRARIES or LIBRARIES[library].get("track", "python") != track:
                raise ValueError(f"{library} is not a {track} library")
    # The visual reviewer (Stage 131.3): a configured agent by ID, or its own backend, binary and
    # model, so a reviewer model need not also run benchmark trials.
    judge = config.get("judge")
    if judge is not None:
        if "agent" in judge:
            if judge["agent"] not in agents:
                raise ValueError(f"judge.agent {judge['agent']!r} is not a configured agent")
        elif judge.get("backend") not in BACKENDS or not judge.get("binary") or not judge.get("model"):
            raise ValueError("judge: give agent = <configured agent>, or backend, binary and model")
        else:
            judge["binary"] = os.path.expandvars(judge["binary"])
            if "${" in judge["binary"] or not judge["binary"].strip():
                raise ValueError("judge: binary expanded to an empty path or an unresolved variable")
    # A condition that runs on a sample of the selected tasks (hmplot-cold, Stage 131).
    configured = {library for entry in tracks.values() for library in entry.get("libraries", [])}
    for library, sample in config.get("library_tasks", {}).items():
        if library not in configured:
            raise ValueError(f"library_tasks.{library}: not a configured library")
        if not isinstance(sample, list) or not sample or len(sample) != len(set(sample)):
            raise ValueError(f"library_tasks.{library}: give a nonempty list of distinct task IDs")
        unselected = [task_id for task_id in sample if task_id not in selected]
        if unselected:
            raise ValueError(f"library_tasks.{library}: tasks not selected: {unselected}")
    for task_id, override in config.get("task_overrides", {}).items():
        if task_id not in selected or type(override.get("repetitions")) is not int or override["repetitions"] < 1:
            raise ValueError(f"invalid repetition override for {task_id}")
    if not any(track in tracks for task_id in selected for track in TASKS_BY_ID[task_id]['tracks']):
        raise ValueError('selected tasks have no configured track')
    config["selected_tasks"] = selected
    config["sha256"] = hashlib.sha256(raw).hexdigest()
    return config


def matrix(config: dict) -> list[dict]:
    result = []
    for task_id in config["selected_tasks"]:
        task = TASKS_BY_ID[task_id]
        repeats = config.get("task_overrides", {}).get(task_id, {}).get("repetitions",
                  config["benchmark"]["repetitions"])
        for track in task["tracks"]:
            for library in config.get("tracks", {}).get(track, {}).get("libraries", []):
                sample = config.get("library_tasks", {}).get(library)
                if sample is not None and task_id not in sample:
                    continue
                for agent_id, agent in config["agents"].items():
                    for index in range(1, repeats + 1):
                        result.append({"task": task_id, "source": task["source"], "track": track,
                                       "library": library, "agent": agent_id, "backend": agent["backend"],
                                       "model": agent["model"], "binary": agent["binary"], "index": index})
    seed = config['benchmark'].get('seed')
    if seed is not None:
        blocks = {}
        for row in result:
            blocks.setdefault((row['task'], row['agent'], row['index'], row['track']), []).append(row)
        ordered = list(blocks.values())
        random.Random(seed).shuffle(ordered)
        result = []
        for index, block in enumerate(ordered):
            offset = index % len(block)
            result.extend(block[offset:] + block[:offset])
    return result


def print_plan(config: dict) -> str:
    rows = matrix(config)
    calls = len(rows) * (config["benchmark"]["corrections"] + 1)
    return json.dumps({"runs": len(rows), "maximum_agent_calls": calls, "matrix": rows}, indent=2)


def judge_agent(config: dict, agent_id: str | None = None) -> dict:
    """The reviewer as an agent record ({id, backend, binary, model}); `agent_id` overrides the config."""
    judge = config.get("judge") or {}
    name = agent_id or judge.get("agent")
    if name is not None:
        if name not in config["agents"]:
            raise ValueError(f"{name!r} is not a configured agent")
        return {**config["agents"][name], "id": name}
    if not judge:
        raise ValueError('configure [judge] (agent = "<id>", or backend, binary and model) or pass --agent')
    return {"id": "judge", "backend": judge["backend"], "binary": judge["binary"], "model": judge["model"]}
