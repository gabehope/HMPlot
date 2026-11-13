#!/usr/bin/env python3
"""One reproducible agent-task run, a local check, an isolation probe, or a report."""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

from agenteval.checks import evaluate
from agenteval.js import evaluate_js
from agenteval.data import place
from agenteval.libraries import LIBRARIES, PILOT_LIBRARIES
from agenteval.prompt import correction_prompt, make_prompt
from agenteval.sources import stage_task, synthetic_records
from agenteval.tasks import PILOT_TASKS, TASKS_BY_ID

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
DEFAULT_CLAUDE = "claude"


def audit_dir(run: Path) -> Path:
    return run.parent / f".agent-audit-{run.name}"


def prepared(root: Path, task: dict, library: str, index: int, *, fresh: bool = False,
             agent: str | None = None) -> Path:
    run = root / "runs" / task["id"] / (f"{library}--{agent}" if agent else library) / str(index)
    if fresh and run.exists():
        raise SystemExit(f"run already exists: {run} (use a new index)")
    run.mkdir(parents=True, exist_ok=True)
    (run / "output").mkdir(exist_ok=True)
    provenance = []
    if task.get("data"):
        place(task["data"], root / "data-cache", run)
        provenance.extend(synthetic_records(root, task['data'], run))
    if task.get("sources"):
        provenance.extend(stage_task(task, root, run))
    if provenance:
        (run / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    condition = LIBRARIES[library]
    if condition.get("docs"):
        build = REPO / condition.get("docs_dir", "build")
        for file in ("llms.txt", "llms-full.txt", "reference/api.md"):
            src = build / file
            if not src.exists():
                command = "npm run build:llm-docs" if condition.get("docs_dir") else "npm run build"
                raise SystemExit(f"{src} missing: run {command} before HMPlot runs")
        docs = run / "hmplot-docs"
        for source in build.rglob("*.md"):
            relative = source.relative_to(build)
            target = docs / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        for name in ("llms.txt", "llms-full.txt"):
            shutil.copy2(build / name, docs / name)
    if condition.get("skill"):
        target = run / "hmplot-skill"
        shutil.copytree(REPO / condition.get("skill_dir", "skills/hmplot"), target, dirs_exist_ok=True)
    (run / "task.txt").write_text(make_prompt(task, library) + "\n")
    return run


def settings(run: Path) -> Path:
    # No Bash at all in the agent session. The harness executes solution.py between turns.
    # Keep this outside the agent's working directory: a correction turn must not be able to
    # change the permissions it will receive on resume.
    config = run.parent / f".agent-config-{run.name}"
    config.mkdir(exist_ok=True)
    path = config / "settings.json"
    path.write_text(json.dumps({"permissions": {"allow": ["Read", "Write", "Edit", "Grep", "Glob"],
                                                "deny": ["Bash", "WebFetch", "WebSearch"],
                                                "defaultMode": "acceptEdits"}}))
    return path


def cli(binary: str, run: Path, model: str, budget: float, turns: int, prompt: str,
        *, resume: str | None = None, no_tools: bool = False) -> list[str]:
    args = [binary, "-p", prompt, "--output-format", "json", "--model", model,
            "--safe-mode", "--restricted", "--strict-mcp-config", "--setting-sources", "",
            "--settings", str(settings(run)), "--permission-mode", "acceptEdits",
            "--permission-prompts", "none", "--no-chrome", "--tools", "" if no_tools else "Read,Write,Edit,Grep,Glob",
            "--max-turns", str(turns), "--max-budget-usd", str(budget)]
    if resume:
        args.extend(["--resume", resume])
    else:
        args.extend(["--session-id", str(uuid.uuid4())])
    return args


def session(args: list[str], run: Path, number: int, timeout: int, *, audit: Path | None = None) -> dict:
    started = time.monotonic()
    env = os.environ.copy()
    env.pop("PYTHONPATH", None)
    env.pop("CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD", None)
    try:
        done = subprocess.run(args, cwd=run, env=env, capture_output=True, text=True, timeout=timeout)
        raw = done.stdout
        record = audit or run
        (record / f"session-{number}.stdout.json").write_text(raw)
        (record / f"session-{number}.stderr.txt").write_text(done.stderr)
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            result = {"is_error": True, "result": (raw + done.stderr)[-2000:]}
        usage = result.get("usage") or {}
        token_keys = ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
        token_usage = {key: int(usage.get(key) or 0) for key in token_keys}
        tokens = sum(token_usage.values())
        return {"exit": done.returncode, "wall_seconds": round(time.monotonic() - started, 2),
                "tokens": tokens, "token_usage": token_usage, "session_id": result.get("session_id"),
                "is_error": result.get("is_error", done.returncode != 0),
                "message": result.get("result", ""), "terminal_reason": result.get("terminal_reason")}
    except subprocess.TimeoutExpired as error:
        return {"exit": -1, "wall_seconds": round(time.monotonic() - started, 2), "tokens": 0,
                "is_error": True, "message": f"session timed out after {timeout}s: {error}"}


def probe(root: Path, args) -> dict:
    run = root / "probe"
    run.mkdir(parents=True, exist_ok=True)
    prompt = ("What do you know about hmplot? Answer briefly. State whether you can access any local project "
              "files, project instructions, personal memory, MCP tools, plugins or web tools in this session. "
              "Do not guess their contents.")
    result = session(cli(args.claude, run, args.model, args.budget, 1, prompt, no_tools=True), run, 0, 180)
    # A human must read this answer to certify isolation; a heuristic cannot prove absence of memory.
    record = {"session": result, "verified": False,
              "note": "Read session-0.stdout.json and set verified to true only if it shows no project files or memory."}
    (root / "probe.json").write_text(json.dumps(record, indent=2) + "\n")
    return record


def agent_version(binary: str) -> str:
    try:
        result = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return (result.stdout or result.stderr).strip().splitlines()[0][:200]
    except (OSError, subprocess.TimeoutExpired, IndexError):
        pass
    return "unknown"


def snapshot_round(run: Path, audit: Path, number: int, evaluation: dict) -> None:
    """Keep each attempted program and render before the next correction replaces them."""
    artifacts = {}
    for source, label in (("solution.py", "solution"), ("solution.svelte", "solution"),
                          ("screenshot.png", "screenshot"),
                          ("after.png", "after"), ("pdf.png", "pdf"),
                          ("output/chart.html", "html"), ("output/figure.pdf", "figure_pdf"),
                          ("program.stdout.txt", "program_stdout"),
                          ("program.stderr.txt", "program_stderr"),
                          ("hmplot-check.json", "hmplot_check"),
                          ("hmplot-check-after.json", "hmplot_check_after")):
        path = run / source
        if path.is_file():
            target = audit / f"round-{number}-{path.name}"
            shutil.copy2(path, target)
            artifacts[label] = target.name
    for path in sorted(run.glob("click-*.png")):
        target = audit / f"round-{number}-{path.name}"
        shutil.copy2(path, target)
        artifacts[path.stem] = target.name
    evaluation["artifacts"] = artifacts


def clear_round_outputs(run: Path) -> None:
    """Remove generated results before another attempt; preserve code and supplied data."""
    for name in ("screenshot.png", "after.png", "pdf.png", "program.stdout.txt",
                 "program.stderr.txt", "hmplot-check.json", "hmplot-check-after.json"):
        (run / name).unlink(missing_ok=True)
    for path in run.glob("click-*.png"):
        path.unlink()
    output = run / "output"
    if output.is_symlink():
        output.unlink()
    elif output.exists():
        shutil.rmtree(output)
    output.mkdir()


def _details(title: str, body: str) -> str:
    return f"<details><summary>{html.escape(title)}</summary>{body}</details>"


def _checks_html(checks: list[dict]) -> str:
    if not checks:
        return "<p>No chart checks were recorded for this attempt.</p>"
    return "<ul class=checks>" + "".join(
        f'<li class="{check["status"] if check["status"] in ("pass", "fail", "unknown") else "unknown"}">'
        f'<strong>{html.escape(check["name"])}</strong>: {html.escape(check["status"])}'
        f' — {html.escape(str(check.get("detail", "")))}</li>' for check in checks) + "</ul>"


def _images_html(root: Path, folder: Path, names: list[tuple[str, str]]) -> str:
    figures = []
    for name, label in names:
        path = folder / name
        if path.is_file():
            relative = html.escape(path.relative_to(root).as_posix(), quote=True)
            caption = html.escape(label)
            figures.append(f'<figure><a href="{relative}"><img loading="lazy" src="{relative}" '
                           f'alt="{caption}"></a><figcaption>{caption}</figcaption></figure>')
    return '<div class="images">' + "".join(figures) + "</div>" if figures else "<p>No render was captured.</p>"


def _output_links_html(root: Path, folder: Path) -> str:
    links = []
    for name, label in (("chart.html", "Open standalone HTML"), ("figure.pdf", "Open PDF")):
        path = folder / "output" / name
        if path.is_file():
            relative = html.escape(path.relative_to(root).as_posix(), quote=True)
            links.append(f'<a href="{relative}">{label}</a>')
    return '<p>Final files: ' + " · ".join(links) + '</p>' if links else ""


def _rounds_html(root: Path, folder: Path, result: dict) -> str:
    rounds = []
    audit = audit_dir(folder) if audit_dir(folder).is_dir() else folder
    for number, session_result in enumerate(result.get("sessions", [])):
        round_file = audit / f"round-{number}.json"
        evaluation = json.loads(round_file.read_text()) if round_file.exists() else {}
        artifacts = evaluation.get("artifacts", {})
        prompt_file = audit / f"prompt-{number}.txt"
        prompt = prompt_file.read_text() if prompt_file.exists() else "Prompt was not retained for this run."
        suffix = "solution.svelte" if result.get("track") == "javascript" else "solution.py"
        code_file = audit / artifacts.get("solution", f"round-{number}-{suffix}")
        code = code_file.read_text() if code_file.exists() else "Program snapshot was not retained for this attempt."
        images = _images_html(root, audit, [(artifacts.get(key, f"round-{number}-{fallback}"), label)
                                              for key, fallback, label in (("screenshot", "screenshot.png", "Before interaction"),
                                                                            ("after", "after.png", "After interaction"),
                                                                            ("pdf", "pdf.png", "PDF render"))])
        usage = session_result.get("token_usage") or {}
        usage_text = (f'uncached input {usage.get("input_tokens", "?")}, output {usage.get("output_tokens", "?")}, '
                      f'cache write {usage.get("cache_creation_input_tokens", "?")}, '
                      f'cache read {usage.get("cache_read_input_tokens", "?")}')
        incomplete = (session_result.get("usage_complete") is False or
                      session_result.get("usage_incomplete") or session_result.get("tokens") is None)
        heading = "First attempt" if number == 0 else f"Correction {number}"
        summary = (f'{heading}: {session_result.get("tokens") if session_result.get("tokens") is not None else "unknown"} tokens, '
                   f'{session_result.get("wall_seconds", 0)} s, exit {session_result.get("exit", "?")}')
        message = str(session_result.get("message") or "")
        raw_file = next((audit / name for name in (f'session-{number}.stdout.jsonl',
                                                    f'session-{number}.stdout.json') if (audit / name).is_file()), None)
        links = []
        for key, filename, label in (("html", "chart.html", "Standalone HTML"),
                                     ("figure_pdf", "figure.pdf", "PDF"),
                                     ("program_stdout", "program.stdout.txt", "Program stdout"),
                                     ("program_stderr", "program.stderr.txt", "Program stderr"),
                                     ("hmplot_check", "hmplot-check.json", "HMPlot check output")):
            path = audit / artifacts.get(key, f"round-{number}-{filename}")
            if path.is_file():
                relative = html.escape(path.relative_to(root).as_posix(), quote=True)
                links.append(f'<a href="{relative}">{label}</a>')
        rounds.append(_details(summary,
            '<p>Token breakdown: ' + html.escape(usage_text) + '</p>' +
            ('<p>Token usage is incomplete; the recorded count may omit part of this attempt.</p>'
             if incomplete else '') +
            _details("Exact prompt sent", f'<pre>{html.escape(prompt)}</pre>') +
            (_details("Raw session output", f'<a href="{html.escape(raw_file.relative_to(root).as_posix(), quote=True)}">Open CLI trace</a>')
             if raw_file else "") +
            (_details("Agent response", f'<pre>{html.escape(message)}</pre>') if message else "") +
            _details("Program at this attempt", f'<pre><code>{html.escape(code)}</code></pre>') +
            ('<p>Attempt files: ' + ' · '.join(links) + '</p>' if links else '') +
            images + _checks_html(evaluation.get("checks", [])) +
            (_details("Attempt metrics", f'<pre>{html.escape(json.dumps(evaluation["metrics"], indent=2))}</pre>')
             if evaluation.get("metrics") else "")))
    if rounds:
        return "".join(rounds)
    return ("<p>Smoke preflight blocked before an agent attempt.</p>" if result.get('kind') == 'smoke'
            else "<p>Hand-written reference; no agent attempts.</p>" if result.get('kind') == 'reference'
            else "<p>No agent attempts were recorded.</p>")


def report(root: Path) -> list[dict]:
    from agenteval.reporting import make_report
    return make_report(root)


def evaluate_condition(task: dict, library: str, run: Path, root: Path, env: Path, chrome: str | None) -> dict:
    return (evaluate_js(task, library, run, root, chrome) if LIBRARIES[library].get('track') == 'javascript'
            else evaluate(task, library, run, env, chrome))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["probe", "prepare", "run", "check", "review", "report"])
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--task", choices=TASKS_BY_ID)
    parser.add_argument("--library", choices=LIBRARIES)
    parser.add_argument("--index", type=int, default=1)
    parser.add_argument("--rounds", type=int, default=1, help="correction rounds after the first try")
    parser.add_argument("--model", default="claude-sonnet-5")
    parser.add_argument("--claude", default=os.environ.get("CLAUDE_BIN", DEFAULT_CLAUDE))
    parser.add_argument("--budget", type=float, default=1.0, help="maximum USD per CLI call")
    parser.add_argument("--turns", type=int, default=12, help="maximum turns per CLI call")
    parser.add_argument("--review", choices=["pass", "fail"], help="human review of the screenshot and checks")
    parser.add_argument("--note", default="", help="review note")
    args = parser.parse_args()
    root = args.root.resolve()
    if REPO == root or REPO in root.parents:
        raise SystemExit("the root must be outside the repository")
    root.mkdir(parents=True, exist_ok=True)
    if args.command == "probe":
        print(json.dumps(probe(root, args), indent=2)); return
    if args.command == "report":
        print(f"{len(report(root))} runs; {root / 'report.html'}"); return
    if not args.task or not args.library:
        parser.error("--task and --library are required for prepare, run and check")
    task = TASKS_BY_ID[args.task]
    library = args.library
    if args.command == "review":
        run = root / "runs" / task["id"] / library / str(args.index)
        if not args.review or not (run / "result.json").exists():
            parser.error("review requires --review pass|fail and an existing result.json")
        result = json.loads((run / "result.json").read_text())
        result.setdefault("kind", "reference" if not result.get("sessions") else "agent")
        result["review"] = args.review
        result["review_note"] = args.note
        no_fail = all(check["status"] != "fail" for check in result.get("checks", []))
        result["success"] = args.review == "pass" and no_fail
        result["first_try"] = result["success"] and result.get("first_round_no_fail", no_fail if result["kind"] == "reference" else False)
        (run / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        report(root)
        print(json.dumps({"success": result["success"], "first_try": result["first_try"]}))
        return
    env = root / "venvs" / LIBRARIES[library]["env"] / "bin" / "python"
    if LIBRARIES[library].get('track', 'python') == 'python' and not env.exists():
        raise SystemExit(f"missing {env}: run setup_env.py first")
    run = prepared(root, task, library, args.index, fresh=args.command == "run")
    if args.command == "prepare":
        print(run); return
    if args.command == "run":
        probe_file = root / "probe.json"
        if not probe_file.exists() or not json.loads(probe_file.read_text()).get("verified"):
            raise SystemExit("isolation probe has not been reviewed and marked verified in probe.json")
        audit = audit_dir(run)
        if audit.exists():
            raise SystemExit(f"audit already exists: {audit} (use a new index)")
        audit.mkdir()
        (audit / "task-prompt.txt").write_text(make_prompt(task, library))
        version = agent_version(args.claude)
        sessions = []
        previous = None
        for number in range(args.rounds + 1):
            if number and (run / "screenshot.png").is_file():
                screenshot = run / "previous-screenshot.png"
                shutil.copy2(run / "screenshot.png", screenshot)
                previous["screenshot"] = str(screenshot)
            prompt = make_prompt(task, library) if number == 0 else correction_prompt(previous, LIBRARIES[library].get('track', 'python'))
            (audit / f"prompt-{number}.txt").write_text(prompt)
            command = cli(args.claude, run, args.model, args.budget, args.turns, prompt,
                          resume=sessions[0]["session_id"] if number else None)
            clear_round_outputs(run)
            entry = session(command, run, number, task.get("timeout", 180) + 180, audit=audit)
            sessions.append(entry)
            if entry["is_error"]:
                previous = {"checks": [{"name": "agent session", "status": "fail", "detail": entry["message"]}], "metrics": {}}
                break
            previous = evaluate_condition(task, library, run, root, env, json.loads((root / "versions.json").read_text())["tools"]["chrome"])
            snapshot_round(run, audit, number, previous)
            (audit / f"round-{number}.json").write_text(json.dumps(previous, indent=2) + "\n")
            if previous.get("automatic_success"):
                break
        first_round = json.loads((audit / "round-0.json").read_text()) if (audit / "round-0.json").exists() else {}
        result = {"kind": "agent", "task": task["id"], "track": LIBRARIES[library].get('track', 'python'),
                  "library": library, "index": args.index,
                  "agent": "Claude Code", "agent_version": version, "model": args.model,
                  "sessions": sessions, **(previous or {}),
                  "first_round_no_fail": bool(first_round) and all(c["status"] != "fail" for c in first_round.get("checks", [])),
                  "first_try": False, "success": False, "review": "pending"}
    else:
        clear_round_outputs(run)
        result = {"kind": "reference", "task": task["id"], "track": LIBRARIES[library].get('track', 'python'),
                  "library": library, "index": args.index, "sessions": [],
                  **evaluate_condition(task, library, run, root, env, json.loads((root / "versions.json").read_text())["tools"]["chrome"]),
                  "review": "pending"}
        result["first_round_no_fail"] = all(c["status"] != "fail" for c in result.get("checks", []))
        result["first_try"] = result["success"] = False
    (run / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    report(root)
    print(json.dumps({k: result.get(k) for k in ("task", "library", "index", "first_try", "success", "review")}, indent=2))


if __name__ == "__main__":
    main()
