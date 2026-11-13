"""How much of a run went to reading HMPlot's docs and skill (TODO Stage 131.5).

Read from the agent's raw trace after the run, so it needs no new runs and changes nothing the
agent sees. Two kinds of numbers:

- Exact, from the trace: the commands that read `hmplot-docs/` or `hmplot-skill/`, the files
  they named, the agent's steps before it first wrote the solution, and the characters those
  commands printed (an upper bound on what the model saw: the CLI truncates long tool output).
- An estimate of the tokens the docs cost. Codex's JSON reports one usage total per turn, not per
  model request, so the split is modeled: each docs output counts as min(characters / 4, CAP)
  tokens when read, and again for every later step that carries it in context (mostly cached
  input). CAP is an assumption about the CLI's tool-output truncation, recorded with the result.
  An exact split needs per-request usage (Claude's stream-json output has it; this adapter
  records only the final result).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

DOCS = re.compile(r'hmplot-(docs|skill)/')
FILES = re.compile(r'hmplot-(?:docs|skill)/[\w./-]+')
CHARS_PER_TOKEN = 4
CAP_TOKENS = 10_000
STEP_TYPES = ('command_execution', 'file_change', 'agent_message', 'mcp_tool_call', 'web_search')


def _items(path: Path) -> list[dict]:
    items = []
    for line in path.read_text(errors='replace').splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        item = event.get('item') if isinstance(event, dict) else None
        if event.get('type') == 'item.completed' and isinstance(item, dict) and item.get('type') in STEP_TYPES:
            items.append(item)
    return items


def codex_session(path: Path) -> dict:
    """The docs reading in one Codex session trace (session-N.stdout.jsonl)."""
    steps = _items(path)
    first_write = next((i for i, item in enumerate(steps) if item['type'] == 'file_change'), len(steps))
    reads, files, chars, seen, carried = 0, set(), 0, 0, 0
    for index, item in enumerate(steps):
        command = item.get('command') or ''
        if item['type'] != 'command_execution' or not DOCS.search(command):
            continue
        output = item.get('aggregated_output') or ''
        reads += 1
        files.update(FILES.findall(command))
        chars += len(output)
        visible = min(len(output) / CHARS_PER_TOKEN, CAP_TOKENS)
        seen += visible
        carried += visible * (len(steps) - index - 1)
    return {'docs_reads': reads, 'docs_files': sorted(files), 'docs_chars': chars,
            'steps': len(steps), 'steps_before_first_write': first_write,
            'docs_tokens_seen_est': round(seen), 'docs_tokens_carried_est': round(carried)}


def docs_usage(audit: Path, sessions: list[dict]) -> dict | None:
    """Sum over a run's sessions; None when its traces record no tool steps (Claude's JSON result
    output, for one), so the split is "not recorded" rather than zero."""
    parts = [codex_session(path) for path in sorted(audit.glob('session-*.stdout.jsonl'))]
    if not parts or not any(part['steps'] for part in parts):
        return None
    total = {key: sum(part[key] for part in parts) for key in
             ('docs_reads', 'docs_chars', 'steps', 'docs_tokens_seen_est', 'docs_tokens_carried_est')}
    total['docs_files'] = sorted({name for part in parts for name in part['docs_files']})
    total['steps_before_first_write'] = parts[0]['steps_before_first_write']
    estimate = total['docs_tokens_seen_est'] + total['docs_tokens_carried_est']
    tokens = sum(session.get('tokens') or 0 for session in sessions)
    # The estimate never exceeds what the session reported.
    total['docs_tokens_est'] = min(round(estimate), tokens) if tokens else round(estimate)
    total['other_tokens_est'] = max(0, tokens - total['docs_tokens_est'])
    total['method'] = (f'estimate: each docs output counted at up to {CAP_TOKENS} tokens '
                       f'({CHARS_PER_TOKEN} characters per token) when read and for each later step')
    return total
