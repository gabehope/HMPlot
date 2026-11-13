"""CLI schema fixtures and browser navigation of the generated local report."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agenteval.agents import ADAPTERS
from benchmark import agent_probe, run_case
from run import report

FIXTURES = Path(__file__).parent / 'fixtures'


class AdapterAndReportTests(unittest.TestCase):
    def test_adapter_tool_policies(self):
        with tempfile.TemporaryDirectory() as folder:
            run = Path(folder)
            env = run / 'venvs' / 'hmplot'
            codex = ADAPTERS['codex'].command('codex', run, 'model', 'prompt', 'old-thread', None,
                                              (env,))
            self.assertIn('web_search="disabled"', codex)
            self.assertIn('default_permissions="hmplot-eval"', codex)
            filesystem = next(arg for arg in codex if arg.startswith('permissions.hmplot-eval.filesystem='))
            self.assertIn('":root"="deny"', filesystem)
            self.assertIn(f'{json.dumps(str(env.resolve()))}="read"', filesystem)
            self.assertIn('permissions.hmplot-eval.network.enabled=false', codex)
            self.assertIn('features.plugins=false', codex)
            self.assertIn('features.skip_host_skill_discovery=true', codex)
            self.assertIn('--ignore-rules', codex)
            self.assertIn('--strict-config', codex)
            self.assertNotIn('--sandbox', codex)
            self.assertNotIn('resume', codex)
            gemini = ADAPTERS['gemini'].command('gemini', run, 'model', 'prompt', None, None)
            self.assertIn('--sandbox', gemini)
            settings = json.loads((run / '.gemini/settings.json').read_text())
            self.assertIn('run_shell_command', settings['tools']['exclude'])

    def test_cli_output_parsers(self):
        claude = ADAPTERS['claude'].parse((FIXTURES / 'claude-login-block.json').read_text(), '', 0)
        self.assertTrue(claude['is_error'])
        self.assertEqual(claude['tokens'], 0)
        codex = ADAPTERS['codex'].parse((FIXTURES / 'codex-success.jsonl').read_text(), '', 0)
        self.assertEqual(codex['session_id'], 'fixture-thread')
        self.assertEqual(codex['token_usage']['cache_read_input_tokens'], 5)
        self.assertEqual(codex['tokens'], 59)
        blocked = ADAPTERS['codex'].parse('', (FIXTURES / 'codex-permission-block.stderr.txt').read_text(), 1)
        self.assertTrue(blocked['is_error'])
        self.assertEqual(blocked['tokens'], 0)
        gemini = ADAPTERS['gemini'].parse((FIXTURES / 'gemini-success.jsonl').read_text(), '', 0)
        self.assertEqual(gemini['session_id'], 'fixture-session')
        self.assertEqual(gemini['tokens'], 47)

    def test_probe_rejects_sentinel_in_raw_trace_even_if_message_hides_it(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            adapter = ADAPTERS['codex']

            def fake_run(binary, run, model, prompt, number, timeout, audit, **kwargs):
                event = {'type': 'item.completed', 'item': {'type': 'command_execution',
                         'aggregated_output': 'ISOLATION_SENTINEL_DO_NOT_EXPOSE', 'exit_code': 0}}
                (audit / 'session-0.stdout.jsonl').write_text(json.dumps(event) + '\n')
                return {'message': 'The file was readable; contents omitted.', 'is_error': False}

            with patch.object(adapter, 'sandbox_preflight', return_value={'passed': True}), \
                 patch.object(adapter, 'run', side_effect=fake_run), \
                 patch('benchmark._policy_identity', return_value={'binary': {'version': 'fixture-version'}}), \
                 patch.object(adapter, 'version', return_value='fixture-version'):
                record = agent_probe(root, 'codex', {'backend': 'codex', 'binary': 'codex',
                                                     'model': 'fixture-model'})
            self.assertFalse(record['verified'])
            self.assertTrue(record['sentinel_exposed'])
            self.assertIn('raw trace', record['reason'])
            record['verified'] = True
            (root / 'probes/codex.json').write_text(json.dumps(record))
            blocked = run_case(root, {'task': 'scatter', 'library': 'hmplot', 'agent': 'codex',
                                      'backend': 'codex', 'model': 'fixture-model',
                                      'track': 'python', 'index': 1, 'smoke': True}, 0)
            self.assertIn('outside sentinel', blocked['blocked_reason'])

    def test_codex_preflight_blocks_before_model_session(self):
        with tempfile.TemporaryDirectory() as folder:
            adapter = ADAPTERS['codex']
            preflight = {'passed': False, 'outside_stdout': 'ISOLATION_SENTINEL_DO_NOT_EXPOSE',
                         'outside_exit': 0}
            with patch.object(adapter, 'sandbox_preflight', return_value=preflight), \
                 patch.object(adapter, 'run') as run, \
                 patch('benchmark._policy_identity', return_value={'binary': {'version': 'fixture-version'}}), \
                 patch.object(adapter, 'version', return_value='fixture-version'):
                record = agent_probe(Path(folder), 'codex', {'backend': 'codex',
                    'binary': 'codex', 'model': 'fixture-model'})
                run.assert_not_called()
            self.assertFalse(record['verified'])
            self.assertTrue(record['sentinel_exposed'])
            self.assertEqual(record['session']['tokens'], 0)
            record['verified'] = True
            (Path(folder) / 'probes/codex.json').write_text(json.dumps(record))
            blocked = run_case(Path(folder), {'task': 'scatter', 'library': 'hmplot',
                'agent': 'codex', 'backend': 'codex', 'model': 'fixture-model',
                'track': 'python', 'index': 1, 'smoke': True}, 0)
            self.assertIn('preflight unverified', blocked['blocked_reason'])

    def test_report_compares_plots_before_metrics_and_audit(self):
        from playwright.sync_api import sync_playwright
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            cases = [('scatter', 'hmplot', 'codex', 1), ('scatter', 'hmplot', 'codex', 2),
                     ('scatter', 'hmplot', 'claude', 1), ('scatter', 'plotly', 'claude', 1),
                     ('lines', 'altair', 'codex', 1)]
            for task, library, agent, index in cases:
                run = root / 'runs' / task / f'{library}--{agent}' / str(index)
                run.mkdir(parents=True)
                (run / 'screenshot.png').write_bytes(b'plot image fixture')
                (run / 'solution.py').write_text(f'# {library} {agent} run {index}\n')
                (run / 'result.json').write_text(json.dumps({
                    'kind': 'agent', 'task': task, 'track': 'python', 'library': library,
                    'agent': agent, 'model': 'fixture-model', 'index': index,
                    'sessions': [{'tokens': 20, 'wall_seconds': 1.5}],
                    'checks': [{'name': 'render', 'status': 'pass'}],
                    'metrics': {'lines_of_code': 1, 'time_to_first_render_s': 0.5},
                    'review': 'pass', 'success': True}))
            report(root)
            with sync_playwright() as pw:
                browser = pw.chromium.launch()
                page = browser.new_page()
                page.goto((root / 'report.html').as_uri())
                self.assertEqual(page.locator('#task-intro h2').inner_text(), 'scatter')
                self.assertIn('one point per penguin', page.locator('#task-intro').inner_text())
                self.assertEqual(page.locator('#left-library').input_value(), 'hmplot')
                self.assertEqual(page.locator('#right-library').input_value(), 'plotly')
                self.assertEqual(page.locator('#left-content img').count(), 1)
                self.assertEqual(page.locator('#right-content img').count(), 1)
                self.assertLess(page.locator('#task-intro').bounding_box()['y'],
                                page.locator('.comparison').bounding_box()['y'])
                self.assertLess(page.locator('.comparison').bounding_box()['y'],
                                page.locator('.summary-section').bounding_box()['y'])
                self.assertLess(page.locator('.summary-section').bounding_box()['y'],
                                page.locator('.details-section').bounding_box()['y'])
                self.assertFalse(page.locator('#left-details').evaluate('(node) => node.open'))
                page.locator('#left-content .program-drawer summary').click()
                self.assertIn('# hmplot claude run 1', page.locator('#left-content .program-drawer').inner_text())
                page.locator('#left-agent').select_option(label='claude / fixture-model')
                self.assertEqual(page.locator('#left-agent').input_value(), 'claude\x1ffixture-model\x1fagent')
                self.assertEqual(page.locator('#right-library').input_value(), 'plotly')
                page.locator('#left-agent').select_option(label='codex / fixture-model')
                page.locator('#left-rep').select_option('2')
                self.assertEqual(page.locator('#left-rep').input_value(), '2')
                self.assertEqual(page.locator('#right-rep').input_value(), '1')
                self.assertIn('20', page.locator('#summary-table').inner_text())
                page.set_viewport_size({'width': 390, 'height': 844})
                active = page.locator('.task-item.active').bounding_box()
                task_list = page.locator('#tasks').bounding_box()
                self.assertGreaterEqual(active['x'], task_list['x'] - 1)
                self.assertLessEqual(active['x'] + active['width'],
                                     task_list['x'] + task_list['width'] + 1)
                page.get_by_role('button', name='Show full prompt').click()
                self.assertIn('expanded', page.locator('.task-prompt').get_attribute('class'))
                page.get_by_role('button', name='Show less').click()
                page.get_by_role('button', name='lines').click()
                self.assertEqual(page.locator('#task-intro h2').inner_text(), 'lines')
                self.assertTrue(page.locator('#right-content .choose-result').is_visible())
                page.get_by_placeholder('Task or source').fill('scatter')
                self.assertTrue(page.locator('.task-item[data-task="lines"]').is_hidden())
                browser.close()


if __name__ == '__main__':
    unittest.main()
