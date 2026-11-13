#!/usr/bin/env python3
"""Config-driven task matrix, source pinning, agent probes and isolated runs."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from agenteval.agents import ADAPTERS, mcp_config
from agenteval.checks import evaluate
from agenteval.config import judge_agent, matrix, print_plan, read_config
from agenteval.js import evaluate_js
from agenteval.isolation import binary_identity
from agenteval.judge import accept_model_reviews, review_runs
from agenteval.libraries import LIBRARIES
from agenteval.prompt import correction_prompt, make_prompt
from agenteval.sources import original_prompt, pin_task
from agenteval.tasks import TASKS_BY_ID
from agenteval.workflow import execute, read_status
from run import REPO, audit_dir, prepared, report, snapshot_round, clear_round_outputs

SENTINEL_CONTENT = 'ISOLATION_SENTINEL_DO_NOT_EXPOSE'


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _policy_identity(agent: dict) -> dict:
    return {'binary': binary_identity(agent['binary']), 'backend': agent['backend'],
            'model': agent['model'], 'tool_policy': ADAPTERS[agent['backend']].policy,
            'adapter_sha256': _sha(REPO / 'eval/agent-tasks/agenteval/agents.py'),
            'isolation_sha256': _sha(REPO / 'eval/agent-tasks/agenteval/isolation.py')}


def verify_probe(root: Path, agent_id: str, agent: dict, note: str) -> dict:
    """Record an explicit inspection of the live context trace, bound to its bytes."""
    path = root / 'probes' / f'{agent_id}.json'
    record = json.loads(path.read_text())
    trace = _probe_trace(root, agent_id)
    if not note.strip():
        raise ValueError('verify-probe requires --note describing the inspected trace')
    if record.get('identity') != _policy_identity(agent):
        raise ValueError('agent binary, model or tool policy changed; repeat the probe')
    if record.get('session', {}).get('is_error') or not trace.is_file():
        raise ValueError('live probe failed or trace is missing; repeat the probe')
    if record.get('trace_sha256') != _sha(trace):
        raise ValueError('live probe trace changed since capture; repeat the probe')
    if record.get('sentinel_exposed') or SENTINEL_CONTENT in trace.read_text(errors='replace'):
        raise ValueError('outside sentinel was exposed; probe cannot be verified')
    if agent['backend'] == 'codex' and not record.get('sandbox_preflight', {}).get('passed'):
        raise ValueError('command sandbox preflight failed; probe cannot be verified')
    record.update(verified=True, reason='live probe trace reviewed', review_note=note,
                  trace_sha256=_sha(trace), reviewed_at=datetime.now(timezone.utc).isoformat())
    path.write_text(json.dumps(record, indent=2) + '\n')
    return record


def _probe_trace(root: Path, agent_id: str) -> Path:
    return root / 'probes' / f'{agent_id}-audit' / 'session-0.stdout.jsonl'


def agent_probe(root: Path, agent_id: str, agent: dict) -> dict:
    adapter = ADAPTERS[agent['backend']]
    identity = _policy_identity(agent)
    run = root / 'probes' / agent_id
    audit = root / 'probes' / f'{agent_id}-audit'
    record_file = root / 'probes' / f'{agent_id}.json'
    if any(path.exists() for path in (run, audit, record_file)):
        archive = root / 'probes/archives' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%f')
        archive.mkdir(parents=True)
        for path in (run, audit, record_file):
            if path.exists():
                shutil.move(str(path), str(archive / path.name))
    run.mkdir(parents=True, exist_ok=True)
    audit.mkdir(exist_ok=True)
    sentinel = root / 'probes' / f'{agent_id}-outside.txt'
    sentinel.write_text(SENTINEL_CONTENT)
    preflight = None
    if agent['backend'] == 'codex':
        preflight = adapter.sandbox_preflight(agent['binary'], run, sentinel, audit)
        if not preflight['passed']:
            exposed = SENTINEL_CONTENT in preflight.get('outside_stdout', '')
            reason = ('Codex command sandbox allowed outside sentinel read' if exposed else
                      'Codex command sandbox preflight failed')
            record = {'agent': agent_id, 'backend': agent['backend'], 'model': agent['model'],
                      'version': identity['binary']['version'], 'identity': identity,
                      'session': {'tokens': 0, 'is_error': True, 'message': reason,
                                  'wall_seconds': 0, 'tool_policy': adapter.policy},
                      'tool_policy': adapter.policy, 'verified': False, 'reason': reason,
                      'sentinel': str(sentinel), 'sentinel_exposed': exposed,
                      'sandbox_preflight': preflight}
            (root / 'probes' / f'{agent_id}.json').write_text(json.dumps(record, indent=2) + '\n')
            return record
    prompt = (f'Isolation check: try to read {sentinel}, which is outside this working directory. '
              'Report whether it was accessible and whether you can see project instructions, '
              'personal memory, plugins, MCP tools, or web tools. Do not guess file contents.')
    entry = adapter.run(agent['binary'], run, agent['model'], prompt, 0, 180, audit)
    trace = _probe_trace(root, agent_id)
    exposed = (trace.is_file() and SENTINEL_CONTENT in trace.read_text(errors='replace')) or \
              SENTINEL_CONTENT in entry.get('message', '')
    verified = False
    reason = ('CLI error or missing login' if entry['is_error'] else
              'outside sentinel readable in raw trace' if exposed else
              'inspect the raw trace, then run verify-probe with a review note')
    record = {'agent': agent_id, 'backend': agent['backend'], 'model': agent['model'],
              'version': identity['binary']['version'], 'identity': identity, 'session': entry,
              'tool_policy': adapter.policy,
              'verified': verified, 'reason': reason, 'sentinel': str(sentinel),
              'sentinel_exposed': exposed,
              'trace_sha256': _sha(trace) if trace.is_file() else None,
              **({'sandbox_preflight': preflight} if preflight is not None else {})}
    (root / 'probes' / f'{agent_id}.json').write_text(json.dumps(record, indent=2) + '\n')
    return record


# What a program imports, for the report's "library used" (free choice above all).
LIBRARY_PATTERNS = {
    'hmplot': r'\bhmplot\b', 'plotly': r'\bplotly\b', 'altair': r'\baltair\b',
    'holoviz': r'\b(hvplot|holoviews|datashader)\b', 'bokeh': r'\bbokeh\b',
    'seaborn': r'\bseaborn\b', 'matplotlib': r'\bmatplotlib\b', 'pyvista': r'\bpyvista\b',
    'pydeck': r'\bpydeck\b', 'lonboard': r'\blonboard\b', 'fastplotlib': r'\bfastplotlib\b',
    'mosaic': r'\bmosaic_widget\b', 'deck.gl': r'(deck\.gl|@deck\.gl/)',
    'observable plot': r'@observablehq/plot',
    'd3': r'''from\s+['"]d3(-[a-z-]+)?['"]|require\(['"]d3['"]\)'''}


def _actual_library(run: Path, selected: str) -> str:
    program = run / ('solution.svelte' if LIBRARIES[selected].get('track') == 'javascript' else 'solution.py')
    if not program.exists():
        return 'unknown'
    code = program.read_text().lower()
    used = [name for name, pattern in LIBRARY_PATTERNS.items() if re.search(pattern, code)]
    # A free-choice chart may be written by hand (HTML, SVG or canvas); review confirms it.
    return ', '.join(used) if used else 'no library detected'


def _blocked(root: Path, row: dict, reason: str) -> dict:
    task = TASKS_BY_ID[row['task']]
    run = root / 'runs' / task['id'] / f'{row["library"]}--{row["agent"]}' / str(row['index'])
    run.mkdir(parents=True, exist_ok=True)
    result = {'kind': 'smoke' if row.get('smoke') else 'agent', 'task': task['id'],
              'track': row['track'], 'library': row['library'], 'agent': row['agent'],
              'model': row['model'], 'index': row['index'], 'sessions': [],
              'checks': [{'name': 'agent preflight', 'status': 'fail', 'detail': reason}],
              'metrics': {}, 'review': 'blocked', 'success': False, 'automatic_success': False,
              'first_try': False, 'blocked_reason': reason,
              'workflow_fingerprint': row.get('workflow_fingerprint')}
    (run / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    report(root)
    return result


def run_case(root: Path, row: dict, corrections: int) -> dict:
    task = TASKS_BY_ID[row['task']]
    probe_file = root / 'probes' / f'{row["agent"]}.json'
    if not probe_file.is_file():
        return _blocked(root, row, 'login and isolation probe has not run')
    probe = json.loads(probe_file.read_text())
    adapter = ADAPTERS[row['backend']]
    if row['backend'] == 'codex' and not probe.get('sandbox_preflight', {}).get('passed'):
        return _blocked(root, row, 'Codex command sandbox preflight unverified')
    trace = _probe_trace(root, row['agent'])
    if not trace.is_file():
        return _blocked(root, row, 'isolation probe raw trace missing')
    if SENTINEL_CONTENT in trace.read_text(errors='replace'):
        return _blocked(root, row, 'isolation probe read outside sentinel')
    if (not probe.get('verified') or probe.get('backend') != row['backend'] or
        probe.get('model') != row['model'] or probe.get('tool_policy') != adapter.policy):
        return _blocked(root, row, f'isolation probe unverified: {probe.get("reason", "unknown")}')
    if probe.get('identity') != _policy_identity(row) or probe.get('trace_sha256') != _sha(trace):
        return _blocked(root, row, 'reviewed probe identity or trace changed; repeat probe and verification')
    run = prepared(root, task, row['library'], row['index'], fresh=True, agent=row['agent'])
    audit = audit_dir(run)
    audit.mkdir()
    prompt = make_prompt(task, row['library'])
    source_prompt = original_prompt(task, root)
    if source_prompt:
        (audit / 'original-prompt.txt').write_text(source_prompt)
    sessions, previous = [], None
    env = root / 'venvs' / LIBRARIES[row['library']]['env'] / 'bin' / 'python'
    if row['track'] == 'python' and not env.is_file():
        raise ValueError(f'missing environment {env}; run setup_env.py')
    read_roots = (env.parent.parent,)
    if row['track'] == 'python':
        prompt += f'\n\nSelected Python interpreter: {env}. The harness executes solution.py with this interpreter after each attempt.'
    else:
        modules = env.parent.parent / 'node_modules'
        if not modules.is_dir():
            raise ValueError(f'missing installed JavaScript packages {modules}; run setup_env.py')
        (run / 'node_modules').symlink_to(modules, target_is_directory=True)
        prompt += '\n\nInstalled packages and public types are readable through node_modules/ (read-only). The harness compiles and renders solution.svelte after each attempt; do not launch builds or install dependencies.'
    if row['backend'] == 'codex':
        preflight = adapter.sandbox_preflight(row['binary'], run, Path(probe['sentinel']), audit,
                                              read_roots=read_roots)
        if not preflight['passed']:
            return _blocked(root, row, 'selected environment command sandbox preflight failed')
    (audit / 'task-prompt.txt').write_text(prompt)
    chrome = json.loads((root / 'versions.json').read_text())['tools']['chrome']
    mcp = mcp_config(root, run, task)
    for number in range(corrections + 1):
        if number and (run / 'screenshot.png').is_file():
            shutil.copy2(run / 'screenshot.png', run / 'previous-screenshot.png')
            previous['screenshot'] = str(run / 'previous-screenshot.png')
        # Codex sessions are ephemeral: every correction needs the original instructions.
        current = prompt if number == 0 else prompt + '\n\n' + correction_prompt(previous, row['track'])
        clear_round_outputs(run)
        (audit / f'prompt-{number}.txt').write_text(current)
        entry = adapter.run(row['binary'], run, row['model'], current, number,
                            task.get('timeout', 180) + 180, audit,
                            resume=sessions[0].get('session_id') if number else None, mcp=mcp,
                            read_roots=read_roots)
        sessions.append(entry)
        if entry['is_error']:
            previous = {'checks': [{'name': 'agent session', 'status': 'fail',
                                   'detail': entry.get('message', '')}], 'metrics': {},
                        'automatic_success': False}
        else:
            previous = (evaluate(task, row['library'], run, env, chrome) if row['track'] == 'python'
                        else evaluate_js(task, row['library'], run, root, chrome))
        snapshot_round(run, audit, number, previous)
        (audit / f'round-{number}.json').write_text(json.dumps(previous, indent=2) + '\n')
        if entry['is_error'] or previous.get('infrastructure_error') or previous.get('automatic_success', False):
            break
    first = json.loads((audit / 'round-0.json').read_text()) if (audit / 'round-0.json').exists() else {}
    provenance = json.loads((run / 'provenance.json').read_text()) if (run / 'provenance.json').exists() else []
    fetches = [json.loads(line) for line in (run / 'fetch-calls.jsonl').read_text().splitlines()] if (run / 'fetch-calls.jsonl').exists() else []
    result = {'kind': 'smoke' if row.get('smoke') else 'agent', 'task': task['id'],
              'source': task['source'], 'track': row['track'], 'library': row['library'],
              'actual_library': _actual_library(run, row['library']), 'library_detection': 'inferred from source',
              'agent': row['agent'],
              'agent_version': adapter.version(row['binary']), 'model': row['model'],
              'tool_policy': adapter.policy, 'index': row['index'], 'sessions': sessions,
              'execution_protocol': 'agent writes/edits; harness executes and renders between attempts',
              'data_access': task['access'], 'provenance': provenance, 'fetch_calls': fetches,
              'guidance': {'docs': LIBRARIES[row['library']].get('docs', False),
                           'skill': LIBRARIES[row['library']].get('skill', False)},
              'original_prompt': source_prompt, 'effective_prompt': prompt,
              **(previous or {}), 'first_round_no_fail': bool(first) and all(c['status'] != 'fail' for c in first.get('checks', [])),
              'first_try': False, 'success': False, 'review': 'pending',
              'workflow_fingerprint': row.get('workflow_fingerprint'),
              'usage_incomplete': any(not entry.get('usage_complete', True) for entry in sessions)}
    if sessions and sessions[-1].get('status') == 'timed_out':
        result['execution_status'] = 'task_timeout'
    (run / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    report(root)
    return result


def freeze_guidance(root: Path, libraries: set[str]) -> dict:
    """Copy precisely the supplied guidance before the queue; never overwrite a snapshot."""
    overrides, manifest = {}, {}
    for name in sorted(libraries):
        condition = LIBRARIES[name]
        overrides[name] = {}
        for flag, key, default in (("docs", "docs_dir", "build"), ("skill", "skill_dir", "skills/hmplot")):
            if not condition.get(flag):
                continue
            source = REPO / condition.get(key, default)
            if not source.is_dir():
                raise ValueError(f"missing {flag} guidance: {source}")
            files = ([p for p in source.rglob('*') if p.is_file()] if flag == 'skill' else
                     sorted(set(source.rglob('*.md')) | {source/'llms.txt', source/'llms-full.txt'}))
            expected = {str(p.relative_to(source)): _sha(p) for p in files}
            target = root / 'frozen/guidance' / name / flag
            if not target.exists():
                for path in files:
                    dest = target / path.relative_to(source)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(path, dest)
                    dest.chmod(0o444)
            actual = {str(p.relative_to(target)): _sha(p) for p in target.rglob('*') if p.is_file()}
            if actual != expected:
                raise ValueError(f"frozen {name} {flag} differs from source guidance; use a fresh evaluation root")
            overrides[name][key] = str(target)
            manifest[f'{name}/{flag}'] = {'source': str(source), 'files': actual}
    folder = root / 'frozen/guidance'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return overrides


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'prepare-data', 'probe', 'verify-probe', 'run', 'smoke', 'review',
                                            'model-review', 'accept-model-reviews', 'report', 'status'])
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--root', type=Path)
    parser.add_argument('--agent', help='configured agent ID for probe')
    parser.add_argument('--task', help='task ID for review')
    parser.add_argument('--library', help='library condition for review')
    parser.add_argument('--index', type=int, default=1, help='replication for review')
    parser.add_argument('--review', choices=['pass', 'fail', 'unknown'], help='visual review decision')
    parser.add_argument('--note', default='', help='what the render showed')
    parser.add_argument('--first-attempt-review', choices=['pass', 'fail', 'unknown'], help='Separate review of the saved round-0 program and artifacts')
    parser.add_argument('--first-attempt-note', default='', help='Evidence from the initial attempt, separate from the final review')
    parser.add_argument('--review-source', choices=['human', 'coordinating-agent'], default='human')
    parser.add_argument('--reviewer', default='', help='Reviewer identity/provenance; no extra judge invocation')
    parser.add_argument('--retry-interrupted', action='store_true', help='archive interrupted attempts and retry; never rerun completed trials')
    parser.add_argument('--max-sessions', type=int, help='agent call cap for this invocation; stop between trials')
    parser.add_argument('--redo', action='store_true', help='model-review: review runs that already have a model verdict again')
    parser.add_argument('--limit', type=int, help='model-review: at most this many model calls')
    parser.add_argument('--sample', type=int, default=10, help='accept-model-reviews: runs listed for a spot check')
    parser.add_argument('--seed', type=int, default=131, help='accept-model-reviews: spot-check sample seed')
    args = parser.parse_args()
    config = read_config(args.config)
    if args.command == 'plan':
        print(print_plan(config)); return
    if not args.root:
        parser.error('--root is required except for plan')
    root = args.root.resolve()
    if root == REPO or REPO in root.parents:
        raise SystemExit('root must be outside the repository')
    root.mkdir(parents=True, exist_ok=True)
    if args.command == 'status':
        status = read_status(root)
        print(json.dumps({key: value for key, value in status.items() if key != 'rows'}, indent=2)); return
    if args.command == 'report':
        print(f'{len(report(root))} runs; {root / "report.html"}'); return
    if args.command == 'review':
        if not all((args.agent, args.task, args.library, args.review)):
            parser.error('review needs --agent, --task, --library and --review')
        run = root / 'runs' / args.task / f'{args.library}--{args.agent}' / str(args.index)
        result_file = run / 'result.json'
        if not result_file.is_file():
            raise SystemExit(f'no result: {result_file}')
        result = json.loads(result_file.read_text())
        if result.get('review') == 'blocked':
            raise SystemExit('blocked preflight cannot be reviewed as a chart result')
        checks = result.get('checks', [])
        no_fail = all(c['status'] != 'fail' for c in checks)
        result['review'], result['review_note'] = args.review, args.note
        result['review_source'] = args.review_source
        result['reviewer'] = args.reviewer or 'unspecified'
        result['reviewed_at'] = datetime.now(timezone.utc).isoformat()
        result['success'] = args.review == 'pass' and no_fail
        initial = args.first_attempt_review or ('fail' if not result.get('first_round_no_fail') else
                   args.review if len(result.get('sessions', [])) == 1 else 'unknown')
        if initial == 'pass' and not result.get('first_round_no_fail'):
            raise SystemExit('The initial attempt has failed deterministic checks; it cannot be reviewed as passing.')
        result['first_attempt_review'] = initial
        result['first_attempt_note'] = args.first_attempt_note
        result['first_attempt_correct'] = None if initial == 'unknown' else initial == 'pass'
        result['first_try'] = (result['success'] and len(result.get('sessions', [])) == 1
                               and bool(result.get('first_round_no_fail')))
        result_file.write_text(json.dumps(result, indent=2) + '\n')
        report(root)
        print(json.dumps({'success': result['success'], 'first_try': result['first_try']})); return
    if args.command == 'model-review':
        # The reviewer is [judge] (a configured agent, or its own backend/binary/model), or --agent.
        try:
            agent = judge_agent(config, args.agent)
        except ValueError as error:
            parser.error(str(error))
        counts = review_runs(root, agent, redo=args.redo, limit=args.limit)
        report(root)
        print(json.dumps(counts)); return
    if args.command == 'accept-model-reviews':
        outcome = accept_model_reviews(root, sample=args.sample, seed=args.seed)
        report(root)
        print(json.dumps(outcome, indent=2)); return
    if args.command == 'prepare-data':
        for task_id in config['selected_tasks']:
            print(task_id, json.dumps(pin_task(TASKS_BY_ID[task_id], root)))
        return
    if args.command in ('probe', 'verify-probe'):
        if not args.agent or args.agent not in config['agents']:
            parser.error('--agent must name a configured agent')
        result = (agent_probe(root, args.agent, config['agents'][args.agent]) if args.command == 'probe' else
                  verify_probe(root, args.agent, config['agents'][args.agent], args.note))
        print(json.dumps(result, indent=2))
        if result.get('session', {}).get('is_error') or result.get('sentinel_exposed'):
            raise SystemExit(2)
        return
    for name, overrides in freeze_guidance(root, {row['library'] for row in matrix(config)}).items():
        LIBRARIES[name] = {**LIBRARIES[name], **overrides}
    rows = matrix(config)
    if args.command == 'smoke' and len(rows) != 1:
        parser.error('smoke config must expand to exactly one run')
    # Resolve and freeze the real toolchain, environment versions and pinned data before
    # allocating a replication. A changed executable or source cannot silently resume.
    for agent in config['agents'].values():
        agent['identity'] = _policy_identity(agent)
        agent['binary'] = agent['identity']['binary']['path']
    versions = root / 'versions.json'
    if not versions.is_file():
        raise SystemExit('versions.json missing; run setup_env.py before starting the queue')
    recorded_versions = json.loads(versions.read_text())
    for name, executable in recorded_versions.get('tools', {}).get('executables', {}).items():
        if _sha(Path(executable['path'])) != executable['sha256']:
            raise SystemExit(f'{name}: compiler/browser executable changed after setup; use a fresh evaluation root')
    for name, environment in recorded_versions.get('envs', {}).items():
        if 'lock_sha256' in environment:
            lock = root / 'venvs' / name / 'package-lock.json'
            if not lock.is_file() or _sha(lock) != environment['lock_sha256']:
                raise SystemExit(f'{name}: dependency lock changed after setup; use a fresh evaluation root')
        package = environment.get('hmplot_package')
        if package and _sha(Path(package['path'])) != package['sha256']:
            raise SystemExit('HMPlot package changed after setup; use a fresh frozen package')
    sources = {task_id: pin_task(TASKS_BY_ID[task_id], root) for task_id in config['selected_tasks']}
    config['execution_environment'] = {
        'versions': recorded_versions, 'pinned_sources': sources,
        'harness_sha256': {path.relative_to(REPO).as_posix(): _sha(path)
                          for path in sorted((REPO / 'eval/agent-tasks').rglob('*.py'))
                          if not path.name.startswith('test_') and 'references' not in path.parts}}

    def case(row, remaining):
        print(f'Starting {row["task"]} / {row["library"]} / {row["agent"]} / {row["index"]}', flush=True)
        result = run_case(root, row, config['benchmark']['corrections'])
        print(json.dumps({'task': row['task'], 'library': row['library'], 'index': row['index'],
                          'sessions': len(result.get('sessions', [])),
                          'automatic_success': result.get('automatic_success', False),
                          'review': result.get('review'), 'blocked_reason': result.get('blocked_reason')}), flush=True)
        return result

    try:
        status = execute(root, config, case, smoke=args.command == 'smoke',
                         retry_interrupted=args.retry_interrupted, max_sessions=args.max_sessions)
    finally:
        report(root)
    print(json.dumps({key: value for key, value in status.items() if key != 'rows'}, indent=2))
    if status['state'] != 'completed':
        raise SystemExit(2)


if __name__ == '__main__':
    main()
