"""Attempt artifacts survive corrections and cannot be mistaken for fresh results."""

import json
import tempfile
import unittest
from pathlib import Path

from run import _rounds_html, audit_dir, clear_round_outputs, report, snapshot_round


class ArtifactTests(unittest.TestCase):
    def test_snapshots_preserve_files_and_logs_after_failed_correction(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run = root / 'runs/scatter/hmplot--codex/1'
            (run / 'output').mkdir(parents=True)
            audit = audit_dir(run)
            audit.mkdir()
            original = {'solution.py': 'print("plot")', 'screenshot.png': 'render',
                        'after.png': 'interaction', 'pdf.png': 'pdf render', 'click-north.png': 'north',
                        'output/chart.html': '<html>first attempt</html>',
                        'output/figure.pdf': 'pdf', 'program.stdout.txt': 'program output',
                        'program.stderr.txt': 'program warning', 'hmplot-check.json': '{}',
                        'hmplot-check-after.json': '[{"action":"brush","report":{"ready":true}}]'}
            for name, content in original.items():
                (run / name).write_text(content)
            (run / 'data.csv').write_text('x,y\n1,2\n')
            (run / 'hmplot-docs').mkdir()
            (run / 'hmplot-docs/api.md').write_text('supplied guidance')
            first = {'checks': [{'name': 'render', 'status': 'pass'}]}
            snapshot_round(run, audit, 0, first)
            (audit / 'round-0.json').write_text(json.dumps(first))

            clear_round_outputs(run)
            self.assertEqual(list((run / 'output').iterdir()), [])
            for name in original:
                if name != 'solution.py':
                    self.assertFalse((run / name).exists(), name)
            self.assertEqual((run / 'solution.py').read_text(), original['solution.py'])
            self.assertTrue((run / 'data.csv').exists())
            self.assertTrue((run / 'hmplot-docs/api.md').exists())
            for name, content in original.items():
                self.assertEqual((audit / f'round-0-{Path(name).name}').read_text(), content)

            failed = {'checks': [{'name': 'agent session', 'status': 'fail'}]}
            snapshot_round(run, audit, 1, failed)
            self.assertEqual(set(failed['artifacts']), {'solution'})
            (audit / 'round-1.json').write_text(json.dumps(failed))
            report = _rounds_html(root, run, {'track': 'python', 'sessions': [
                {'tokens': 100, 'usage_complete': True},
                {'tokens': 20, 'usage_complete': False}]})
            for name in ('chart.html', 'figure.pdf', 'program.stdout.txt', 'program.stderr.txt'):
                self.assertIn(f'round-0-{name}', report)
                self.assertNotIn(f'round-1-{name}', report)
            self.assertIn('uncached input', report)
            self.assertIn('Token usage is incomplete', report)

    def test_cleanup_does_not_follow_an_output_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run, outside = root / 'run', root / 'outside'
            run.mkdir()
            outside.mkdir()
            (outside / 'keep.txt').write_text('preserve')
            (run / 'output').symlink_to(outside, target_is_directory=True)
            clear_round_outputs(run)
            self.assertFalse((run / 'output').is_symlink())
            self.assertEqual(list((run / 'output').iterdir()), [])
            self.assertEqual((outside / 'keep.txt').read_text(), 'preserve')

    def test_report_retains_unknown_usage_in_downloaded_results(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run = root / 'runs/scatter/hmplot--codex/1'
            run.mkdir(parents=True)
            (run / 'result.json').write_text(json.dumps({
                'kind': 'smoke', 'task': 'scatter', 'library': 'hmplot', 'index': 1,
                'first_attempt_review': 'pass', 'first_attempt_correct': True,
                'review_source': 'coordinating-agent', 'reviewer': 'fixture reviewer',
                'sessions': [{'tokens': None, 'usage_complete': False}]}))
            rows = report(root)
            self.assertTrue(rows[0]['usage_incomplete'])
            self.assertIs(rows[0]['first_attempt_correct'], True)
            self.assertEqual(rows[0]['first_attempt_review'], 'pass')
            self.assertEqual(rows[0]['reviewer'], 'fixture reviewer')
            self.assertIn('usage_incomplete', (root / 'results.csv').read_text())
            self.assertIn('Token usage is incomplete', (root / 'report.html').read_text())

    def test_aggregate_excludes_incomplete_trials_and_separates_pending_reviews(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [
                {'review': 'pass', 'success': True},
                {'review': 'fail', 'checks': [{'name': 'program', 'status': 'fail'}]},
                {'review': 'pending', 'success': True},
                {'review': 'blocked', 'sessions': [], 'blocked_reason': 'login unavailable'},
                {'sessions': [{'tokens': 20, 'is_error': True}]},
                {'sessions': [{'tokens': 20, 'status': 'timed_out'}]},
                {'kind': 'smoke', 'review': 'pass', 'success': True},
                {'kind': 'reference', 'review': 'pass', 'success': True},
                {'execution_status': 'interrupted'},
                {'infrastructure_error': 'browser executable unavailable'},
            ]
            for index, values in enumerate(cases, 1):
                run = root / f'runs/scatter/hmplot--codex/{index}'
                run.mkdir(parents=True)
                (run / 'result.json').write_text(json.dumps({
                    'kind': 'agent', 'task': 'scatter', 'library': 'hmplot', 'index': index,
                    'sessions': [{'tokens': 20, 'is_error': False, 'status': 'completed'}],
                    'checks': [{'name': 'render', 'status': 'pass'}],
                    'review': 'pending', 'success': False, **values}))
            rows = report(root)
            self.assertEqual(sum(row['benchmark_completed'] for row in rows), 3)
            page = (root / 'report.html').read_text()
            self.assertIn('<th>Reviewed trials</th><th>Completed trials</th>', page)
            self.assertIn('<td>python</td><td>hmplot</td><td>1</td><td>2</td><td>3</td>', page)

    def test_aggregate_counts_explicit_task_timeout_but_not_infrastructure_timeout(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [
                {'execution_status': 'task_timeout'},
                {},
                {'execution_status': 'task_timeout', 'infrastructure_error': 'login unavailable'},
                {'execution_status': 'task_timeout', 'sessions': [
                    {'is_error': True, 'status': 'timed_out'}, {'is_error': True, 'status': 'failed'}]},
            ]
            for index, values in enumerate(cases, 1):
                run = root / f'runs/scatter/hmplot--codex/{index}'
                run.mkdir(parents=True)
                (run / 'result.json').write_text(json.dumps({
                    'kind': 'agent', 'task': 'scatter', 'library': 'hmplot', 'index': index,
                    'sessions': [{'is_error': True, 'status': 'timed_out', 'tokens': 20}],
                    'checks': [{'name': 'agent time limit', 'status': 'fail'}],
                    'review': 'pending', 'success': False, **values}))
            rows = report(root)
            self.assertEqual([row['benchmark_completed'] for row in rows], [True, False, False, False])
            self.assertFalse(any(row['success_within_rounds'] for row in rows))
            self.assertIn('<td>python</td><td>hmplot</td><td>0</td><td>0</td><td>1</td>',
                          (root / 'report.html').read_text())


if __name__ == '__main__':
    unittest.main()
