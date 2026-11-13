"""The defaults gallery's blind judge (TODO 136.17): a model compares each HMPlot chart with the
same chart as a reference library draws it (references/), both with their defaults, and says
which serves a reader better. It is not told which library drew which: the two images are A and
B, HMPlot's side chosen at random (seeded by the chart and library, so a rerun is the same
draw). A pair the same model judged with the same prompt and the same two images keeps that
verdict (`--redo` asks again). Each comparison's folder, prompt and answer stay in out/judge/;
out/judge.json holds the latest verdict of every pair judged, and the run prints where HMPlot lost
and why.

Run `npm run gallery` first (it draws out/<name>.png), then `npm run gallery:judge`, optionally
with `-- --charts bars,pie --libraries ggplot --model claude-opus-5-5`. It runs on demand: each
comparison is a model session. The model runs through the agent eval's adapters
(eval/agent-tasks/agenteval/agents.py), with only file tools; they need the Python playwright
package (`.venv/bin/python -m pip install playwright`) and the model's CLI (`--binary`).
"""

import argparse
import json
import random
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "eval" / "agent-tasks"))
from agenteval.agents import ADAPTERS  # noqa: E402
from charts import CHARTS  # noqa: E402
from conftest import LIBRARIES, OUT  # noqa: E402

VERDICT_FILE = "verdict.json"
RECORD_FILE = "record.json"
TIMEOUT = 300
SEED = 136


def prompt(chart):
    columns = ", ".join(chart.data())
    return (
        f"A.png and B.png in this folder are the same chart ({chart.name.replace('-', ' ')}, of the "
        f"columns {columns}), drawn by two plotting libraries with their defaults: nothing was tuned. "
        "Which libraries drew them is not shown on purpose. Open both images.\n\n"
        "For each, list the problems a reader would notice: text that is clipped, overlaps or is "
        "too small to read; a color or size with no legend or label saying what it means; marks "
        "that are hidden, clipped or hard to tell apart; a scale, range or aspect that misleads or "
        "wastes the space; missing axis labels or ticks a reader needs. Then say which one serves "
        "a reader better as a default, or that they are equal. Judge the chart only: a library's "
        "house style (fonts, palette, background) is not a problem unless it hurts reading.\n\n"
        f"Write the file {VERDICT_FILE} in this folder containing only JSON: "
        '{"better": "A", "B" or "equal", "reason": "one or two sentences", '
        '"problems": {"A": ["each problem"], "B": ["each problem"]}}. '
        "Do not run programs, install anything, or use the network. End with the same JSON."
    )


def parse(folder, message):
    """The verdict from the file the model wrote, or from its last message; None without one."""
    for text in ((folder / VERDICT_FILE).read_text() if (folder / VERDICT_FILE).is_file() else "", message or ""):
        start, end = text.find("{"), text.rfind("}")
        try:
            value = json.loads(text[start:end + 1]) if 0 <= start < end else None
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and value.get("better") in ("A", "B", "equal"):
            problems = value.get("problems") if isinstance(value.get("problems"), dict) else {}
            listed = lambda side: [str(p)[:300] for p in problems[side]][:20] if isinstance(problems.get(side), list) else []
            return {"better": value["better"], "reason": str(value.get("reason", ""))[:1000],
                    "A": listed("A"), "B": listed("B")}
    return None


def compare(chart, library, agent, folder, redo=False):
    """One blind comparison: HMPlot's chart against `library`'s, as a verdict about HMPlot."""
    hmplot = random.Random(f"{SEED}:{chart.name}:{library}").choice("AB")
    other = "B" if hmplot == "A" else "A"
    images = {hmplot: OUT / f"{chart.name}.png", other: HERE / "references" / library / f"{chart.name}.png"}
    # A verdict the same model gave for the same prompt and the same two images is kept: a rerun
    # judges only what changed. Only a verdict that came back is recorded (RECORD_FILE).
    text = prompt(chart)
    stored = json.loads((folder / RECORD_FILE).read_text()) if (folder / RECORD_FILE).is_file() else {}
    same = stored.get("model") == agent["model"] and stored.get("prompt") == text and all(
        (folder / f"{side}.png").is_file() and (folder / f"{side}.png").read_bytes() == path.read_bytes()
        for side, path in images.items())
    found, entry = (stored.get("found") if same and not redo else None), {}
    if found is None:
        if folder.exists():
            shutil.rmtree(folder)
        folder.mkdir(parents=True)
        for side, path in images.items():
            shutil.copy2(path, folder / f"{side}.png")
        (folder / "prompt.txt").write_text(text)
        entry = ADAPTERS[agent["backend"]].run(agent["binary"], folder, agent["model"], text, 0, TIMEOUT,
                                               folder / "trace", images=(folder / "A.png", folder / "B.png"))
        found = None if entry.get("is_error") else parse(folder, entry.get("message", ""))
        if found is not None:
            (folder / RECORD_FILE).write_text(json.dumps({"model": agent["model"], "prompt": text, "found": found}))
    record = {"chart": chart.name, "library": library, "model": agent["model"], "hmplot_side": hmplot,
              "tokens": entry.get("tokens", 0)}
    if found is None:
        return {**record, "winner": "error", "reason": (entry.get("message") or "no verdict written")[-500:]}
    winner = {"equal": "equal", hmplot: "hmplot", other: library}[found["better"]]
    return {**record, "winner": winner, "reason": found["reason"],
            "hmplot_problems": found[hmplot], "reference_problems": found[other]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--charts", help="comma-separated chart names (default: all)")
    parser.add_argument("--libraries", default=",".join(LIBRARIES), help="comma-separated reference libraries")
    parser.add_argument("--backend", default="claude", choices=sorted(ADAPTERS))
    parser.add_argument("--binary", default="claude")
    parser.add_argument("--model", default="claude-opus-5-5")
    parser.add_argument("--redo", action="store_true", help="judge again pairs whose images have not changed")
    args = parser.parse_args(argv)
    names = set(args.charts.split(",")) if args.charts else None
    agent = {"backend": args.backend, "binary": args.binary, "model": args.model}
    charts = [chart for chart in CHARTS if names is None or chart.name in names]
    if names is not None and names - {chart.name for chart in charts}:
        sys.exit(f"no such chart: {', '.join(sorted(names - {chart.name for chart in charts}))}")
    missing = [chart.name for chart in charts if not (OUT / f"{chart.name}.png").exists()]
    if missing:
        sys.exit(f"out/{missing[0]}.png and {len(missing) - 1} more are missing: run npm run gallery first")
    records = []
    for chart in charts:
        for library in args.libraries.split(","):
            if (HERE / "references" / library / f"{chart.name}.png").exists():
                record = compare(chart, library, agent, OUT / "judge" / f"{chart.name}--{library}", args.redo)
                records.append(record)
                print(f"{chart.name} vs {library}: {record['winner']}", flush=True)
    # The pairs judged replace theirs in out/judge.json; the others are kept.
    judged = {(r["chart"], r["library"]) for r in records}
    kept = json.loads((OUT / "judge.json").read_text()) if (OUT / "judge.json").is_file() else []
    (OUT / "judge.json").write_text(json.dumps([r for r in kept if (r["chart"], r["library"]) not in judged] + records,
                                               indent=2) + "\n")
    tally = {winner: sum(r["winner"] == winner for r in records) for winner in ("hmplot", "equal", "error")}
    print(f"\nHMPlot better {tally['hmplot']}, equal {tally['equal']}, "
          f"worse {len(records) - sum(tally.values())}, no verdict {tally['error']} (out/judge.json)")
    for r in records:
        if r["winner"] not in ("hmplot", "equal", "error"):
            print(f"- {r['chart']} vs {r['library']}: {r['reason']}")


if __name__ == "__main__":
    main()
