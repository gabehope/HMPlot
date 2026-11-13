"""Resume and retry guarantees of the local benchmark queue, without agent calls."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agenteval import workflow
from agenteval.tasks import TASKS_BY_ID


def configuration(repetitions=2):
    return {'benchmark': {'tasks': ['scatter'], 'repetitions': repetitions, 'corrections': 1},
            'selected_tasks': ['scatter'], 'tracks': {'python': {'libraries': ['plotly']}},
            'agents': {'codex': {'backend': 'codex', 'binary': '/fixture/codex', 'model': 'fixture'}}}


def completed(row):
    return {**row, 'sessions': [{'tokens': 11, 'is_error': False}],
            'checks': [{'name': 'chart', 'status': 'fail'}],
            'review': 'pending', 'success': False}


class WorkflowTests(unittest.TestCase):
    def test_resume_skips_finished_trials_and_reserves_correction_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            root, calls = Path(directory), []

            def run(row, remaining):
                calls.append((row['index'], remaining))
                return completed(row)

            config = configuration()
            status = workflow.execute(root, config, run, max_sessions=2)
            self.assertEqual(calls, [(1, 2)])
            self.assertEqual(status['counts'], {'completed': 1, 'pending': 1})
            self.assertEqual(status['sessions_this_invocation'], 1)
            status = workflow.execute(root, config, run, max_sessions=2)
            self.assertEqual(calls, [(1, 2), (2, 2)])
            self.assertEqual(status['state'], 'completed')
            self.assertEqual(status['sessions_spent'], 2)
            workflow.execute(root, config, run)
            self.assertEqual(len(calls), 2)

    def test_changed_model_or_task_refuses_mixed_results(self):
        with tempfile.TemporaryDirectory() as directory:
            root, config = Path(directory), configuration(1)
            workflow.execute(root, config, lambda row, _: completed(row))
            config['agents']['codex']['model'] = 'different-model'
            with self.assertRaisesRegex(ValueError, 'changed'):
                workflow.execute(root, config, lambda *_: self.fail('must not launch'))
            config['agents']['codex']['model'] = 'fixture'
            changed_task = {**TASKS_BY_ID['scatter'], 'prompt': 'A different prompt'}
            with patch.dict(TASKS_BY_ID, {'scatter': changed_task}):
                with self.assertRaisesRegex(ValueError, 'changed'):
                    workflow.execute(root, config, lambda *_: self.fail('must not launch'))

    def test_changed_execution_environment_refuses_mixed_results(self):
        with tempfile.TemporaryDirectory() as directory:
            root, config = Path(directory), configuration(1)
            config['execution_environment'] = {'codex': '1.2.3', 'runtime': 'frozen-environment'}
            workflow.execute(root, config, lambda row, _: completed(row))
            config['execution_environment']['codex'] = '1.2.4'
            with self.assertRaisesRegex(ValueError, 'changed'):
                workflow.execute(root, config, lambda *_: self.fail('must not launch'))

    def test_recover_session_accounting_from_result_before_status_was_saved(self):
        with tempfile.TemporaryDirectory() as directory:
            root, config = Path(directory), configuration(1)

            def failed_session(row, _):
                result = completed(row)
                result['sessions'][0]['is_error'] = True
                return result

            workflow.execute(root, config, failed_session)
            # Recreate the durable files at the instant after result.json was committed
            # but before status.json recorded its session count.
            status_path = root / 'workflow/status.json'
            status = json.loads(status_path.read_text())
            item = status['rows']['scatter/plotly--codex/1']
            item.update(state='running', sessions_spent=0)
            status['sessions_spent'] = 0
            status_path.write_text(json.dumps(status))
            status = workflow.execute(root, config, lambda *_: self.fail('must not retry implicitly'))
            self.assertEqual(status['sessions_spent'], 1)
            # Explicit retry moves the failed result into archives. Both attempts count
            # exactly once, including if a later invocation resumes the finished queue.
            status = workflow.execute(root, config, lambda row, _: completed(row), retry_interrupted=True)
            self.assertEqual(status['sessions_spent'], 2)
            status = workflow.execute(root, config, lambda *_: self.fail('must not rerun completed'))
            self.assertEqual(status['sessions_spent'], 2)

    def test_interrupted_session_summaries_count_without_final_result(self):
        with tempfile.TemporaryDirectory() as directory:
            root, config = Path(directory), configuration(1)

            def interrupted(row, _):
                run = root / 'runs' / workflow.row_key(row)
                run.mkdir(parents=True)
                audit = run.parent / '.agent-audit-1'
                audit.mkdir()
                (audit / 'session-0.json').write_text(json.dumps({
                    'status': 'completed', 'invocation_started': True, 'usage_complete': True}))
                (audit / 'session-1.json').write_text(json.dumps({
                    'status': 'running', 'invocation_started': True}))
                raise KeyboardInterrupt()

            with self.assertRaises(KeyboardInterrupt):
                workflow.execute(root, config, interrupted)
            status = workflow.read_status(root)
            self.assertEqual(status['sessions_spent'], 2)
            self.assertTrue(status['usage_incomplete'])
            status = workflow.execute(root, config, lambda row, _: completed(row), retry_interrupted=True)
            self.assertEqual(status['sessions_spent'], 3)
            self.assertTrue(status['usage_incomplete'])

    def test_truncated_result_can_be_archived_and_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            root, config = Path(directory), configuration(1)

            def finish(row, _):
                run = root / 'runs' / workflow.row_key(row)
                run.mkdir(parents=True, exist_ok=True)
                audit = run.parent / '.agent-audit-1'
                audit.mkdir()
                (audit / 'session-0.json').write_text(json.dumps({
                    'status': 'completed', 'invocation_started': True, 'usage_complete': True}))
                return completed(row)

            workflow.execute(root, config, finish)
            result = root / 'runs/scatter/plotly--codex/1/result.json'
            result.write_text('{"sessions": [')
            status = workflow.execute(root, config, lambda *_: self.fail('must not implicitly retry'))
            self.assertIn('--retry-interrupted', status['stop_reason'])
            status = workflow.execute(root, config, finish, retry_interrupted=True)
            self.assertEqual(status['state'], 'completed')
            self.assertEqual(status['sessions_spent'], 2)
            archive = root / status['rows']['scatter/plotly--codex/1']['archives'][0]
            self.assertEqual((archive / '1/result.json').read_text(), '{"sessions": [')

    def test_configured_task_timeout_finishes_failed_trial_and_continues(self):
        with tempfile.TemporaryDirectory() as directory:
            root, calls = Path(directory), []

            def run(row, _):
                calls.append(row['index'])
                result = completed(row)
                if row['index'] == 1:
                    result['execution_status'] = 'task_timeout'
                    result['sessions'] = [{'is_error': True, 'status': 'timed_out', 'tokens': 5}]
                return result

            status = workflow.execute(root, configuration(), run)
            self.assertEqual(calls, [1, 2])
            self.assertEqual(status['counts'], {'completed': 2})
            workflow.execute(root, configuration(), lambda *_: self.fail('finished trials must not rerun'))
            self.assertEqual(workflow._classify({'sessions': [{'is_error': True, 'status': 'timed_out'}]}),
                             'interrupted')
            self.assertEqual(workflow._classify({'execution_status': 'task_timeout', 'sessions': [
                {'is_error': True, 'status': 'timed_out'}, {'is_error': True, 'status': 'failed'}]}),
                'interrupted')
            # A Claude session that stopped at its own turn or budget cap is a failed task result
            # (2026-10-13: the queue paused on Sonnet's 12-turn cap); any other error still pauses.
            self.assertEqual(workflow._classify({'sessions': [{'is_error': True, 'status': 'limit_reached'}]}),
                             'completed')
            self.assertEqual(workflow._classify({'sessions': [
                {'is_error': True, 'status': 'limit_reached'}, {'is_error': True}]}), 'interrupted')
            from agenteval.agents import Claude, CLAUDE_SESSION_TURNS
            capped = Claude().parse(json.dumps({'type': 'result', 'subtype': 'error_max_turns', 'is_error': True,
                                                'errors': ['Reached maximum number of turns (12)'],
                                                'usage': {'input_tokens': 10, 'output_tokens': 5}}), '', 1)
            self.assertEqual((capped['status'], capped['is_error'], capped['usage_complete'], capped['tokens']),
                             ('limit_reached', True, True, 15))
            self.assertIn('maximum number of turns', capped['message'])
            self.assertNotIn('status', Claude().parse('not json', 'crashed', 1))
            self.assertGreaterEqual(CLAUDE_SESSION_TURNS, 100)

    def test_interrupted_trial_requires_explicit_retry_and_keeps_old_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root, config = Path(directory), configuration(1)

            def interrupted(row, _):
                run = root / 'runs' / workflow.row_key(row)
                run.mkdir(parents=True)
                (run / 'solution.py').write_text('partial solution')
                audit = run.parent / '.agent-audit-1'
                audit.mkdir()
                (audit / 'session-0.stdout.jsonl').write_text('partial trace')
                raise RuntimeError('terminal disconnected')

            with self.assertRaisesRegex(RuntimeError, 'terminal disconnected'):
                workflow.execute(root, config, interrupted)
            status = workflow.execute(root, config, lambda *_: self.fail('must not silently retry'))
            self.assertIn('--retry-interrupted', status['stop_reason'])
            status = workflow.execute(root, config, lambda row, _: completed(row), retry_interrupted=True)
            self.assertEqual(status['state'], 'completed')
            archive = root / status['rows']['scatter/plotly--codex/1']['archives'][0]
            self.assertEqual((archive / '1/solution.py').read_text(), 'partial solution')
            self.assertEqual((archive / '.agent-audit-1/session-0.stdout.jsonl').read_text(), 'partial trace')

    def test_blocked_preflight_can_resume_without_consuming_replication(self):
        with tempfile.TemporaryDirectory() as directory:
            root, config = Path(directory), configuration(1)
            status = workflow.execute(root, config, lambda row, _: {
                **row, 'sessions': [], 'review': 'blocked', 'blocked_reason': 'login unavailable'})
            self.assertEqual(status['counts'], {'blocked': 1})
            self.assertEqual(status['sessions_spent'], 0)
            status = workflow.execute(root, config, lambda row, _: completed(row))
            self.assertEqual(status['counts'], {'completed': 1})
            self.assertEqual(status['rows']['scatter/plotly--codex/1']['attempts'], 2)

    def test_lock_prevents_duplicate_launches(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with workflow._lock(root / 'workflow'):
                with self.assertRaisesRegex(ValueError, 'another benchmark process'):
                    workflow.execute(root, configuration(1), lambda *_: self.fail('must not launch'))

    def test_legacy_result_requires_new_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run = root / 'runs/scatter/plotly--codex/1'
            run.mkdir(parents=True)
            (run / 'result.json').write_text(json.dumps({'old_result': True}))
            with self.assertRaisesRegex(ValueError, 'without a workflow manifest'):
                workflow.execute(root, configuration(1), lambda *_: self.fail('must not launch'))
            self.assertEqual(json.loads((run / 'result.json').read_text()), {'old_result': True})


if __name__ == '__main__':
    unittest.main()
