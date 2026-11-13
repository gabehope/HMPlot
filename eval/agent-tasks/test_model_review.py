"""Stage 131: free-choice conditions, condition samples, and the model's first-pass review."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import benchmark
from agenteval import judge
from agenteval.agents import ADAPTERS, Codex
from agenteval.config import judge_agent, matrix, read_config
from agenteval.libraries import DEFAULT_LIBRARIES, LIBRARIES
from run import audit_dir, report

BASE = '''
[benchmark]
tasks = ["scatter", "grouped-bars"]
repetitions = 1
corrections = 0

[agents.codex]
backend = "codex"
binary = "codex"
model = "m"

[tracks.python]
libraries = ["hmplot", "free", "hmplot-cold"]
'''


def write_result(root: Path, task: str, library: str, checks: list[dict], review='pending', **extra) -> Path:
    run = root / 'runs' / task / f'{library}--codex' / '1'
    run.mkdir(parents=True)
    result = {'kind': 'agent', 'task': task, 'library': library, 'agent': 'codex', 'model': 'm', 'index': 1,
              'track': 'python', 'sessions': [{'tokens': 1, 'usage_complete': True}], 'checks': checks,
              'review': review, 'first_round_no_fail': True, **extra}
    (run / 'result.json').write_text(json.dumps(result))
    return run


class FakeReviewer:
    """Writes a fixed verdict file in the review folder, as an agent would."""
    backend, policy = 'codex', 'fixture'

    def __init__(self, verdict):
        self.verdict, self.calls = verdict, []

    def run(self, binary, folder, model, prompt, number, timeout, audit, images=(), **kwargs):
        self.calls.append({'folder': folder, 'prompt': prompt, 'images': images})
        (folder / judge.VERDICT_FILE).write_text(json.dumps(
            {'verdict': self.verdict, 'reason': 'fixture reason', 'problems': [] if self.verdict == 'pass' else ['legend missing']}))
        return {'is_error': False, 'message': 'done', 'tokens': 7, 'wall_seconds': 1.0}


class ConditionTests(unittest.TestCase):
    def test_free_choice_conditions_exist_without_hmplot(self):
        self.assertEqual(DEFAULT_LIBRARIES, {'python': ['hmplot', 'free'], 'javascript': ['hmplot-js', 'free-js']})
        self.assertEqual(LIBRARIES['free']['env'], 'baselines')
        self.assertEqual(LIBRARIES['free-js']['track'], 'javascript')
        for name in ('free', 'free-js'):
            self.assertNotIn('HMPlot', LIBRARIES[name]['preamble'])
            self.assertIn('or none', LIBRARIES[name]['preamble'])
            self.assertFalse(LIBRARIES[name].get('docs'))

    def test_library_detection_names_free_choices_and_hand_written_charts(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            (run / 'solution.svelte').write_text("<script>import * as d3 from 'd3';</script>")
            self.assertEqual(benchmark._actual_library(run, 'free-js'), 'd3')
            (run / 'solution.py').write_text("import seaborn as sns\nimport matplotlib.pyplot as plt\n")
            self.assertEqual(benchmark._actual_library(run, 'free'), 'seaborn, matplotlib')
            (run / 'solution.py').write_text("open('output/chart.html','w').write('<svg></svg>')\n")
            self.assertEqual(benchmark._actual_library(run, 'free'), 'no library detected')


class ConfigTests(unittest.TestCase):
    def read(self, text):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.toml'
            path.write_text(text)
            return read_config(path)

    def test_library_tasks_limits_a_condition_to_its_sample(self):
        config = self.read(BASE + '\n[library_tasks]\nhmplot-cold = ["scatter"]\n')
        rows = matrix(config)
        self.assertEqual(sorted((row['task'], row['library']) for row in rows),
                         [('grouped-bars', 'free'), ('grouped-bars', 'hmplot'),
                          ('scatter', 'free'), ('scatter', 'hmplot'), ('scatter', 'hmplot-cold')])

    def test_library_tasks_rejects_unknown_conditions_and_unselected_tasks(self):
        with self.assertRaisesRegex(ValueError, 'not a configured library'):
            self.read(BASE + '\n[library_tasks]\nplotly = ["scatter"]\n')
        with self.assertRaisesRegex(ValueError, 'tasks not selected'):
            self.read(BASE + '\n[library_tasks]\nhmplot-cold = ["boxplot"]\n')
        with self.assertRaisesRegex(ValueError, 'nonempty list'):
            self.read(BASE + '\n[library_tasks]\nhmplot-cold = []\n')

    def test_judge_is_a_configured_agent_or_its_own_backend(self):
        config = self.read(BASE + '\n[judge]\nagent = "codex"\n')
        self.assertEqual(judge_agent(config)['id'], 'codex')
        config = self.read(BASE + '\n[judge]\nbackend = "claude"\nbinary = "claude"\nmodel = "reviewer"\n')
        self.assertEqual(judge_agent(config), {'id': 'judge', 'backend': 'claude', 'binary': 'claude', 'model': 'reviewer'})
        self.assertEqual(judge_agent(config, 'codex')['backend'], 'codex')
        self.assertEqual(len(matrix(config)), 6)
        with self.assertRaisesRegex(ValueError, 'not a configured agent'):
            self.read(BASE + '\n[judge]\nagent = "claude"\n')
        with self.assertRaisesRegex(ValueError, 'backend, binary and model'):
            self.read(BASE + '\n[judge]\nbackend = "claude"\nbinary = "claude"\n')


class ModelReviewTests(unittest.TestCase):
    def test_checks_verdict_and_agreement(self):
        self.assertEqual(judge.checks_verdict([{'status': 'pass'}, {'status': 'unknown'}]), 'unknown')
        self.assertEqual(judge.checks_verdict([{'status': 'pass'}, {'status': 'fail'}]), 'fail')
        self.assertEqual(judge.checks_verdict([{'status': 'pass'}]), 'pass')
        self.assertTrue(judge.agrees('pass', 'unknown'))
        self.assertTrue(judge.agrees('fail', 'fail'))
        self.assertFalse(judge.agrees('pass', 'fail'))
        self.assertFalse(judge.agrees('fail', 'pass'))
        self.assertFalse(judge.agrees('fail', 'unknown'))

    def test_codex_attaches_images_before_the_prompt(self):
        command = Codex().command('codex', Path('/run'), 'm', 'look', None, None, (), (Path('/run/a.png'),))
        self.assertEqual(command[-3:], ['--image', '/run/a.png', '-'])
        self.assertNotIn('--image', Codex().command('codex', Path('/run'), 'm', 'look', None, None))

    def test_review_is_blind_and_records_the_verdict(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run = write_result(root, 'scatter', 'free', [{'name': 'text', 'status': 'pass'}, {'name': 'rows', 'status': 'unknown'}])
            (run / 'screenshot.png').write_bytes(b'png')
            (run / 'solution.py').write_text('import plotly')
            reviewer = FakeReviewer('pass')
            with patch.dict(ADAPTERS, {'codex': reviewer}):
                counts = judge.review_runs(root, {'id': 'judge', 'backend': 'codex', 'binary': 'codex', 'model': 'r'}, log=lambda _: None)
            self.assertEqual(counts, {'reviewed': 1, 'skipped': 0, 'errors': 0})
            call = reviewer.calls[0]
            self.assertEqual(sorted(path.name for path in call['folder'].iterdir() if path.suffix == '.png'), ['screenshot.png'])
            self.assertFalse((call['folder'] / 'solution.py').exists())
            self.assertNotIn('plotly', call['prompt'].lower())
            self.assertNotIn('free', call['prompt'].lower())
            self.assertIn('Penguin bills', call['prompt'])
            self.assertTrue(str(call['folder']).startswith(str(audit_dir(run))))
            review = json.loads((run / 'result.json').read_text())['model_review']
            self.assertEqual((review['verdict'], review['checks_verdict'], review['agrees_with_checks']), ('pass', 'unknown', True))
            # Already reviewed: skipped unless redone.
            with patch.dict(ADAPTERS, {'codex': reviewer}):
                self.assertEqual(judge.review_runs(root, {'id': 'judge', 'backend': 'codex', 'binary': 'codex', 'model': 'r'},
                                                   log=lambda _: None)['skipped'], 1)

    def test_a_run_without_a_render_fails_without_a_model_call(self):
        with tempfile.TemporaryDirectory() as directory:
            run = write_result(Path(directory), 'scatter', 'hmplot', [{'name': 'program', 'status': 'fail'}])
            reviewer = FakeReviewer('pass')
            with patch.dict(ADAPTERS, {'codex': reviewer}):
                record = judge.review_run(run, json.loads((run / 'result.json').read_text()),
                                          {'id': 'judge', 'backend': 'codex', 'binary': 'codex', 'model': 'r'})
            self.assertEqual(reviewer.calls, [])
            self.assertEqual((record['verdict'], record['agrees_with_checks']), ('fail', True))

    def test_a_reply_without_a_verdict_is_an_error_not_a_score(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            self.assertIsNone(judge._parse(folder, 'I think it looks fine'))
            self.assertEqual(judge._parse(folder, 'Done. {"verdict": "fail", "reason": "no legend"}')['verdict'], 'fail')
            (folder / judge.VERDICT_FILE).write_text('{"verdict": "maybe"}')
            self.assertIsNone(judge._parse(folder, ''))

    def test_accept_scores_agreements_and_leaves_disagreements_and_humans(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            agreed = write_result(root, 'scatter', 'hmplot', [{'name': 'text', 'status': 'pass'}],
                                  model_review={'verdict': 'pass', 'agrees_with_checks': True, 'checks_verdict': 'pass', 'reason': 'ok'})
            disagreed = write_result(root, 'scatter', 'free', [{'name': 'text', 'status': 'fail'}],
                                     model_review={'verdict': 'pass', 'agrees_with_checks': False, 'checks_verdict': 'fail', 'reason': 'looks fine'})
            human = write_result(root, 'grouped-bars', 'free', [{'name': 'text', 'status': 'pass'}], review='fail',
                                 review_source='human',
                                 model_review={'verdict': 'pass', 'agrees_with_checks': True, 'checks_verdict': 'pass', 'reason': 'ok'})
            outcome = judge.accept_model_reviews(root, sample=5)
            self.assertEqual(outcome['accepted'], 1)
            self.assertEqual([item['run'] for item in outcome['disagreements']], ['runs/scatter/free--codex/1'])
            self.assertEqual(outcome['spot_check'], ['runs/scatter/hmplot--codex/1'])
            accepted = json.loads((agreed / 'result.json').read_text())
            self.assertEqual((accepted['review'], accepted['review_source'], accepted['success'], accepted['first_try']),
                             ('pass', 'model', True, True))
            self.assertEqual(json.loads((disagreed / 'result.json').read_text())['review'], 'pending')
            self.assertEqual(json.loads((human / 'result.json').read_text())['review'], 'fail')

    def test_report_shows_model_reviews_and_category_totals(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_result(root, 'grouped-bars', 'free', [{'name': 'text', 'status': 'pass'}], review='pass',
                         review_source='model', success=True, source='general',
                         model_review={'verdict': 'pass', 'agrees_with_checks': True, 'checks_verdict': 'pass',
                                       'reason': 'grouped bars as asked', 'agent': 'judge', 'model': 'r'})
            rows = report(root)
            self.assertEqual((rows[0]['model_verdict'], rows[0]['review_source'], rows[0]['category']),
                             ('pass', 'model', 'basic'))
            page = (root / 'report.html').read_text()
            self.assertIn('grouped bars as asked', page)
            self.assertIn('By category', page)
            self.assertIn('model_verdict', (root / 'results.csv').read_text().splitlines()[0])


if __name__ == '__main__':
    unittest.main()
