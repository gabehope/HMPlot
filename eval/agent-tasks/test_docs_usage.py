"""The docs/generation split read from a run's traces (Stage 131.5)."""

import json
import tempfile
import unittest
from pathlib import Path

from agenteval.docs_usage import CAP_TOKENS, codex_session, docs_usage
from run import audit_dir, report


def trace(path: Path, steps: list[dict], usage: dict) -> None:
    events = [{'type': 'thread.started', 'thread_id': 't'}, {'type': 'turn.started'}]
    events += [{'type': 'item.completed', 'item': {'id': f'item_{i}', **step}} for i, step in enumerate(steps)]
    events.append({'type': 'turn.completed', 'usage': usage})
    path.write_text('\n'.join(json.dumps(event) for event in events) + '\n')


STEPS = [
    {'type': 'agent_message', 'text': 'reading the skill'},
    {'type': 'command_execution', 'command': '/bin/zsh -c "cat hmplot-skill/SKILL.md hmplot-docs/llms.txt"',
     'aggregated_output': 'x' * 400},
    {'type': 'command_execution', 'command': '/bin/zsh -c "head data/penguins.csv"', 'aggregated_output': 'y' * 4000},
    {'type': 'command_execution', 'command': '/bin/zsh -c "cat hmplot-docs/reference/api.md"',
     'aggregated_output': 'z' * 200_000},
    {'type': 'file_change', 'changes': [{'path': 'solution.py'}]},
    {'type': 'agent_message', 'text': 'done'},
]


class DocsUsageTests(unittest.TestCase):
    def test_counts_docs_reads_exactly_and_estimates_their_tokens(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'session-0.stdout.jsonl'
            trace(path, STEPS, {'input_tokens': 90_000, 'output_tokens': 500})
            part = codex_session(path)
            self.assertEqual(part['docs_reads'], 2)
            self.assertEqual(part['docs_files'], ['hmplot-docs/llms.txt', 'hmplot-docs/reference/api.md',
                                                  'hmplot-skill/SKILL.md'])
            self.assertEqual(part['docs_chars'], 200_400)
            self.assertEqual((part['steps'], part['steps_before_first_write']), (6, 4))
            # 400 characters are 100 tokens, read at step 1 and carried by 4 later steps; the
            # 200,000-character output is capped and carried by 2.
            self.assertEqual(part['docs_tokens_seen_est'], 100 + CAP_TOKENS)
            self.assertEqual(part['docs_tokens_carried_est'], 100 * 4 + CAP_TOKENS * 2)

    def test_run_totals_never_exceed_reported_tokens_and_free_choice_reads_none(self):
        with tempfile.TemporaryDirectory() as directory:
            audit = Path(directory)
            trace(audit / 'session-0.stdout.jsonl', STEPS, {})
            usage = docs_usage(audit, [{'tokens': 20_000}])
            self.assertEqual((usage['docs_tokens_est'], usage['other_tokens_est']), (20_000, 0))
            usage = docs_usage(audit, [{'tokens': 100_000}])
            self.assertEqual(usage['docs_tokens_est'], 100 + CAP_TOKENS + 400 + 2 * CAP_TOKENS)
            self.assertEqual(usage['other_tokens_est'], 100_000 - usage['docs_tokens_est'])
            trace(audit / 'session-0.stdout.jsonl', [STEPS[2], STEPS[4]], {})
            self.assertEqual(docs_usage(audit, [{'tokens': 5_000}])['docs_tokens_est'], 0)

    def test_a_trace_without_tool_steps_is_not_recorded_rather_than_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            audit = Path(directory)
            (audit / 'session-0.stdout.jsonl').write_text(json.dumps({'type': 'result', 'result': 'ok'}))
            self.assertIsNone(docs_usage(audit, [{'tokens': 10}]))
            self.assertIsNone(docs_usage(Path(directory) / 'missing', []))

    def test_report_shows_the_split_per_run_and_per_condition(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for library, steps in (('hmplot', STEPS), ('free', [STEPS[2], STEPS[4]])):
                run = root / 'runs/scatter' / f'{library}--codex' / '1'
                run.mkdir(parents=True)
                audit = audit_dir(run)
                audit.mkdir()
                trace(audit / 'session-0.stdout.jsonl', steps, {})
                (run / 'result.json').write_text(json.dumps({
                    'kind': 'agent', 'task': 'scatter', 'library': library, 'agent': 'codex', 'model': 'm',
                    'index': 1, 'track': 'python', 'sessions': [{'tokens': 100_000, 'usage_complete': True}],
                    'checks': [{'name': 'text', 'status': 'pass'}], 'review': 'pending'}))
            rows = {row['library']: row for row in report(root)}
            self.assertEqual(rows['free']['docs_tokens_est'], 0)
            self.assertGreater(rows['hmplot']['docs_tokens_est'], 0)
            self.assertEqual(rows['hmplot']['steps_before_first_write'], 4)
            page = (root / 'report.html').read_text()
            self.assertIn('Mean docs tokens (est.)', page)
            self.assertIn('Docs reading: 2 command(s)', page)


if __name__ == '__main__':
    unittest.main()
