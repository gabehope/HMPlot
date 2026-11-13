"""Durable, sequential benchmark queue. No agent launches happen in this module."""

from __future__ import annotations

import contextlib
import fcntl
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .config import matrix
from .libraries import LIBRARIES
from .prompt import make_prompt
from .tasks import TASKS_BY_ID

REPO = Path(__file__).resolve().parents[3]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def _write(path: Path, value: dict) -> None:
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w') as output:
        json.dump(value, output, indent=2)
        output.write('\n')
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(path)


def row_key(row: dict) -> str:
    return f'{row["task"]}/{row["library"]}--{row["agent"]}/{row["index"]}'


def _guidance(libraries: set[str]) -> dict:
    """Freeze the actual optional guidance bytes, including their absence."""
    paths = set()
    for name in libraries:
        condition = LIBRARIES[name]
        if condition.get('docs'):
            build = REPO / condition.get('docs_dir', 'build')
            paths.update(build.rglob('*.md'))
            paths.update(build / file for file in ('llms.txt', 'llms-full.txt'))
        if condition.get('skill'):
            skill = REPO / condition.get('skill_dir', 'skills/hmplot')
            paths.update(path for path in skill.rglob('*') if path.is_file())
    return {(path.relative_to(REPO).as_posix() if path.is_relative_to(REPO) else str(path)): hashlib.sha256(path.read_bytes()).hexdigest()
            if path.is_file() else 'missing' for path in sorted(paths)}


def manifest(config: dict, *, smoke: bool = False) -> dict:
    rows = matrix(config)
    libraries = {row['library'] for row in rows}
    # Raw TOML whitespace is irrelevant; expanded binaries and configured versions matter.
    resolved = {key: value for key, value in config.items() if key != 'sha256'}
    identity = {'schema': 1, 'smoke': smoke, 'config': resolved,
                'tasks': {name: TASKS_BY_ID[name] for name in config['selected_tasks']},
                'libraries': {name: LIBRARIES[name] for name in sorted(libraries)},
                'prompts': {f'{row["task"]}/{row["library"]}':
                            make_prompt(TASKS_BY_ID[row['task']], row['library']) for row in rows},
                'guidance_sha256': _guidance(libraries), 'rows': rows}
    return {**identity, 'fingerprint': _digest(identity)}


@contextlib.contextmanager
def _lock(folder: Path):
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / 'lock').open('a+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError(f'another benchmark process holds {folder / "lock"}') from error
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _classify(result: dict) -> str:
    if result.get('blocked_reason') or result.get('review') == 'blocked':
        return 'blocked'
    if result.get('infrastructure_error') or result.get('execution_status') in (
            'interrupted', 'infrastructure_failure', 'session_limit'):
        return 'interrupted'
    errors = [session for session in result.get('sessions', []) if session.get('is_error')]
    if errors and result.get('execution_status') == 'task_timeout' and all(
            session.get('status') == 'timed_out' for session in errors):
        return 'completed'
    # Sessions that stopped at their own turn or budget cap: a failed task result, not a pause.
    if errors and all(session.get('status') == 'limit_reached' for session in errors):
        return 'completed'
    if errors:
        return 'interrupted'
    return 'completed'


def _archive(root: Path, key: str, item: dict) -> None:
    run = root / 'runs' / key
    related = (run, run.parent / f'.agent-audit-{run.name}',
               run.parent / f'.agent-config-{run.name}')
    archive = root / 'workflow/archives' / key / str(item.get('attempts', 0))
    if any(path.exists() for path in related):
        # A process can stop between moving the run and its audit/config directories.
        archive.mkdir(parents=True, exist_ok=True)
        for path in related:
            if path.exists():
                destination = archive / path.name
                if destination.exists():
                    raise ValueError(f'archive destination already exists: {destination}')
                shutil.move(str(path), str(destination))
        relative = archive.relative_to(root).as_posix()
        if relative not in item.setdefault('archives', []):
            item['archives'].append(relative)


def read_status(root: Path) -> dict:
    path = root / 'workflow/status.json'
    if not path.is_file():
        return {'state': 'not_started', 'rows': {}, 'counts': {}, 'sessions_spent': 0}
    return json.loads(path.read_text())


def _save(folder: Path, status: dict) -> None:
    counts = {}
    for key, item in status['rows'].items():
        # Result artifacts are committed before queue status. Recover their accounting
        # after a crash in between those writes, including earlier archived attempts.
        attempts = [folder.parent / 'runs' / key]
        archive = folder / 'archives' / key
        if archive.is_dir():
            attempts.extend(path / Path(key).name for path in archive.iterdir() if path.is_dir())
        recovered = 0
        for run in attempts:
            result_calls, summary_calls = 0, 0
            path = run / 'result.json'
            if path.is_file():
                try:
                    result = json.loads(path.read_text())
                    if not isinstance(result, dict):
                        raise ValueError('result must be a JSON object')
                    if result.get('workflow_fingerprint') == status['fingerprint']:
                        result_calls = sum(session.get('invocation_started', True) is not False
                                           for session in result.get('sessions', []))
                        if result.get('usage_incomplete'):
                            item['usage_incomplete'] = True
                except (OSError, ValueError):
                    item['usage_incomplete'] = True
            audit = run.parent / f'.agent-audit-{run.name}'
            for summary in audit.glob('session-[0-9]*.json'):
                try:
                    session = json.loads(summary.read_text())
                    running = session.get('status') == 'running'
                    # If the process died between Popen and persisting its start flag,
                    # reserve the possibly launched invocation and mark usage unknown.
                    summary_calls += session.get('invocation_started', True) is not False or running
                    if running or not session.get('usage_complete', True):
                        item['usage_incomplete'] = True
                except (OSError, ValueError):
                    summary_calls += 1
                    item['usage_incomplete'] = True
            recovered += max(result_calls, summary_calls)
        item['sessions_spent'] = max(item.get('sessions_spent', 0), recovered)
        counts[item['state']] = counts.get(item['state'], 0) + 1
    status.update(updated_at=_now(), counts=counts,
                  sessions_spent=sum(item.get('sessions_spent', 0) for item in status['rows'].values()),
                  usage_incomplete=any(item.get('usage_incomplete') for item in status['rows'].values()))
    _write(folder / 'status.json', status)


def execute(root: Path, config: dict, run_case, *, smoke: bool = False,
            retry_interrupted: bool = False, max_sessions: int | None = None) -> dict:
    """Run pending rows, passing ``(row, remaining_sessions)`` to the supplied callback.

    A row reserves its maximum correction calls before launch. The cap therefore stops
    between trials. Completed rows include unsuccessful charts and pending visual reviews;
    CLI/infrastructure failures require an explicit retry, which archives their artifacts.
    """
    if max_sessions is not None and (type(max_sessions) is not int or max_sessions < 1):
        raise ValueError('max_sessions must be a positive integer')
    root = root.resolve()
    folder = root / 'workflow'
    with _lock(folder):
        current = manifest(config, smoke=smoke)
        manifest_file = folder / 'manifest.json'
        if manifest_file.is_file():
            previous = json.loads(manifest_file.read_text())
            if previous.get('fingerprint') != current['fingerprint']:
                raise ValueError('benchmark configuration, tasks, or guidance changed; use a new results root')
        else:
            for row in current['rows']:
                if (root / 'runs' / row_key(row)).exists():
                    raise ValueError('selected runs already exist without a workflow manifest; use a new results root')
            _write(manifest_file, current)

        status = read_status(root)
        status.update(fingerprint=current['fingerprint'], state='running', stop_reason=None)
        for row in current['rows']:
            status['rows'].setdefault(row_key(row), {'state': 'pending', 'attempts': 0,
                                                     'sessions_spent': 0})
        spent = 0
        reservation = config['benchmark']['corrections'] + 1
        _save(folder, status)
        for source_row in current['rows']:
            key = row_key(source_row)
            item = status['rows'][key]
            run = root / 'runs' / key
            result_path = run / 'result.json'
            result, result_error = None, None
            try:
                if result_path.is_file():
                    result = json.loads(result_path.read_text())
                    if not isinstance(result, dict):
                        raise ValueError('result must be a JSON object')
            except (OSError, ValueError) as error:
                result_error = str(error)
            if result_error is not None:
                item.update(state='interrupted', usage_incomplete=True,
                            reason=f'result.json could not be read: {result_error}')
            elif result and result.get('workflow_fingerprint') == current['fingerprint']:
                item['state'] = _classify(result)
            elif item['state'] in ('running', 'completed') or run.exists():
                item['state'] = 'interrupted'
                item['reason'] = 'run did not finish with a matching workflow result'
                item['usage_incomplete'] = True
            if item['state'] == 'completed':
                continue
            if item['state'] == 'interrupted' and not retry_interrupted:
                status.update(state='paused', stop_reason=f'{key} was interrupted; use --retry-interrupted to archive and retry')
                break
            if max_sessions is not None and max_sessions - spent < reservation:
                status.update(state='paused', stop_reason=f'session cap reached; next trial needs a reservation of {reservation} calls')
                break
            if item['state'] in ('blocked', 'interrupted'):
                _archive(root, key, item)
            item.update(state='running', started_at=_now(), attempts=item['attempts'] + 1)
            item.pop('reason', None)
            _save(folder, status)
            row = {**source_row, 'workflow_fingerprint': current['fingerprint']}
            if smoke:
                row['smoke'] = True
            try:
                result = run_case(row, None if max_sessions is None else max_sessions - spent)
                result['workflow_fingerprint'] = current['fingerprint']
                run.mkdir(parents=True, exist_ok=True)
                _write(result_path, result)
                calls = len(result.get('sessions', []))
                spent += calls
                item.update(state=_classify(result), finished_at=_now())
                if item['state'] in ('blocked', 'interrupted'):
                    item['reason'] = result.get('blocked_reason') or result.get('infrastructure_error') or 'agent session failed'
                    status.update(state='paused', stop_reason=f'{key}: {item["reason"]}')
                    break
            except BaseException as error:
                item.update(state='interrupted', finished_at=_now(), reason=str(error),
                            usage_incomplete=True)
                status.update(state='paused', stop_reason=f'{key}: {type(error).__name__}: {error}')
                _save(folder, status)
                raise
            _save(folder, status)
        else:
            status.update(state='completed', stop_reason=None)
        status['sessions_this_invocation'] = spent
        _save(folder, status)
        return status
