"""A model's first-pass visual review of each render (TODO Stage 131.3).

The browser checks run first and stay authoritative where they can decide (text, views, PDF).
A model then looks at a run's renders against the task's prompt and writes a verdict. The
review is blind: it sees the prompt and the images, never the program, the library or the
condition. Runs where the model and the automatic checks agree can be accepted in bulk
(`accept_model_reviews`); every disagreement, and a seeded sample of the accepted runs, goes to
the maintainer's review (`benchmark.py review`), which always wins.
"""

from __future__ import annotations

import json
import random
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .agents import ADAPTERS
from .tasks import TASKS_BY_ID

RENDERS = (('screenshot.png', 'the page as loaded'),
           ('after.png', 'the page after the harness performed the task\'s interaction ({action})'),
           ('pdf.png', 'the first page of the PDF the program saved'))
VERDICT_FILE = 'model-review.json'
TIMEOUT = 300


def checks_verdict(checks: list[dict]) -> str:
    """'fail' if any check failed, 'pass' if all passed, else 'unknown' (left to review)."""
    statuses = {check.get('status') for check in checks}
    return 'fail' if 'fail' in statuses else 'pass' if statuses == {'pass'} else 'unknown'


def agrees(model: str, checks: str) -> bool:
    """A model pass agrees with passing or undecided checks; a model fail only with failed checks."""
    return (model == 'pass' and checks in ('pass', 'unknown')) or (model == 'fail' and checks == 'fail')


def review_prompt(task: dict, images: list[tuple[str, str]]) -> str:
    listing = '\n'.join(f'- {name}: {description}' for name, description in images)
    return (
        'You are reviewing a chart that a program made for the request below. The program, and '
        'which tools made it, are not shown on purpose. Open each image file in this folder:\n'
        f'{listing}\n\n'
        f'The request:\n{task["prompt"]}\n\n'
        'Decide whether the chart does what the request asks: the requested chart type, the data '
        'mapped as asked (axes, colors, sizes, grouping, sorting), the requested titles, labels and '
        'legend, and for a requested interaction or animation whether the second image shows its '
        'effect. Judge the chart, not the page around it: ignore page decoration (cards, '
        'backgrounds, padding, headers beyond the requested titles), which real charts in a '
        'notebook or a host page do not have. '
        'Ignore styling the request does not specify, and do not fail a chart for an '
        'interaction the harness could not perform. A chart that is blank, broken, unreadable or '
        'clearly shows different data fails.\n\n'
        f'Write the file {VERDICT_FILE} in this folder containing only JSON: '
        '{"verdict": "pass" or "fail", "reason": "one or two sentences", '
        '"problems": ["each specific problem, empty when it passes"]}. '
        'Do not run programs, install anything, or use the network. End with the same JSON.'
    )


def _parse(folder: Path, message: str) -> dict | None:
    for text in ((folder / VERDICT_FILE).read_text() if (folder / VERDICT_FILE).is_file() else '', message or ''):
        start, end = text.find('{'), text.rfind('}')
        if start < 0 or end <= start:
            continue
        try:
            value = json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and value.get('verdict') in ('pass', 'fail'):
            problems = value.get('problems') if isinstance(value.get('problems'), list) else []
            return {'verdict': value['verdict'], 'reason': str(value.get('reason', ''))[:1000],
                    'problems': [str(item)[:300] for item in problems][:20]}
    return None


def review_run(run: Path, result: dict, agent: dict, *, timeout: int = TIMEOUT) -> dict:
    """Review one run's renders; return the record stored as result['model_review']."""
    from run import audit_dir

    task = TASKS_BY_ID[result['task']]
    action = task.get('interaction', 'none')
    renders = [(name, description.format(action=action)) for name, description in RENDERS
               if (run / name).is_file()]
    checks = checks_verdict(result.get('checks', []))
    stamp = datetime.now(timezone.utc).isoformat()
    base = {'agent': agent['id'], 'backend': agent['backend'], 'model': agent['model'], 'at': stamp,
            'checks_verdict': checks, 'images': [name for name, _ in renders]}
    if not renders:
        # Nothing was drawn: no model call is needed to fail it.
        return {**base, 'verdict': 'fail', 'reason': 'no render was captured', 'problems': [],
                'tokens': 0, 'agrees_with_checks': agrees('fail', checks), 'status': 'no render'}
    audit = audit_dir(run)
    audit.mkdir(exist_ok=True)
    number = len(list(audit.glob('model-review-*')))
    folder = audit / f'model-review-{number}'
    folder.mkdir()
    for name, _ in renders:
        shutil.copy2(run / name, folder / name)
    prompt = review_prompt(task, renders)
    (folder / 'prompt.txt').write_text(prompt)
    adapter = ADAPTERS[agent['backend']]
    entry = adapter.run(agent['binary'], folder, agent['model'], prompt, 0, timeout, folder / 'trace',
                        images=tuple(folder / name for name, _ in renders))
    parsed = None if entry.get('is_error') else _parse(folder, entry.get('message', ''))
    if parsed is None:
        return {**base, 'verdict': 'error', 'reason': (entry.get('message') or 'no verdict written')[-500:],
                'problems': [], 'tokens': entry.get('tokens', 0), 'agrees_with_checks': False,
                'status': 'error', 'folder': folder.name}
    record = {**base, **parsed, 'tokens': entry.get('tokens', 0), 'wall_seconds': entry.get('wall_seconds'),
              'agrees_with_checks': agrees(parsed['verdict'], checks), 'status': 'reviewed',
              'folder': folder.name}
    (folder / 'record.json').write_text(json.dumps(record, indent=2) + '\n')
    return record


def reviewable(result: dict) -> bool:
    return (result.get('kind', 'agent') == 'agent' and result.get('review') != 'blocked' and
            bool(result.get('sessions')) and not result.get('blocked_reason'))


def review_runs(root: Path, agent: dict, *, redo: bool = False, limit: int | None = None,
                log=print) -> dict:
    """Review every reviewable run without a model review (all of them with `redo`)."""
    counts = {'reviewed': 0, 'skipped': 0, 'errors': 0}
    for path in sorted((root / 'runs').glob('*/*/*/result.json')):
        if limit is not None and counts['reviewed'] + counts['errors'] >= limit:
            break
        result = json.loads(path.read_text())
        if not reviewable(result) or (result.get('model_review', {}).get('verdict') in ('pass', 'fail') and not redo):
            counts['skipped'] += 1
            continue
        record = review_run(path.parent, result, agent)
        result['model_review'] = record
        path.write_text(json.dumps(result, indent=2) + '\n')
        counts['errors' if record['verdict'] == 'error' else 'reviewed'] += 1
        log(json.dumps({'run': path.parent.relative_to(root).as_posix(), 'verdict': record['verdict'],
                        'checks': record['checks_verdict'], 'agrees': record['agrees_with_checks']}))
    return counts


def accept_model_reviews(root: Path, *, sample: int = 10, seed: int = 131) -> dict:
    """Score runs whose model review agrees with the checks; list disagreements and a spot sample.

    A human review is never overwritten. A run accepted here can still be reviewed by hand.
    """
    accepted, disagreements = [], []
    for path in sorted((root / 'runs').glob('*/*/*/result.json')):
        result = json.loads(path.read_text())
        review = result.get('model_review') or {}
        name = path.parent.relative_to(root).as_posix()
        if not reviewable(result) or result.get('review_source') == 'human' or review.get('verdict') not in ('pass', 'fail'):
            continue
        if not review.get('agrees_with_checks'):
            disagreements.append({'run': name, 'model': review['verdict'], 'checks': review.get('checks_verdict'),
                                  'reason': review.get('reason', '')})
            continue
        checks = result.get('checks', [])
        no_fail = all(check.get('status') != 'fail' for check in checks)
        result['review'], result['review_source'] = review['verdict'], 'model'
        result['review_note'] = 'model review: ' + review.get('reason', '')
        result['success'] = review['verdict'] == 'pass' and no_fail
        result['first_try'] = (result['success'] and len(result.get('sessions', [])) == 1
                               and bool(result.get('first_round_no_fail')))
        path.write_text(json.dumps(result, indent=2) + '\n')
        accepted.append(name)
    spot = sorted(random.Random(seed).sample(accepted, min(sample, len(accepted))))
    return {'accepted': len(accepted), 'disagreements': disagreements, 'spot_check': spot}
