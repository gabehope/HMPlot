"""Probe identity and correction integration checks without model or browser calls."""

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import benchmark
from agenteval.agents import ADAPTERS
from agenteval.config import judge_agent, matrix, read_config
from agenteval.tasks import TASKS_BY_ID
from run import audit_dir


IDENTITY = {'binary': {'path': '/fixture/codex', 'version': 'fixture', 'sha256': 'original'},
            'backend': 'codex', 'model': 'fixture', 'tool_policy': 'fixture'}
AGENT = {'binary': '/fixture/codex', 'backend': 'codex', 'model': 'fixture'}


def probe_fixture(root):
    trace = root / 'probes/codex-audit/session-0.stdout.jsonl'
    trace.parent.mkdir(parents=True)
    trace.write_text('{"type":"agent_message","text":"outside read denied"}\n')
    sentinel = root / 'probes/codex-outside.txt'
    sentinel.write_text(benchmark.SENTINEL_CONTENT)
    record = {'agent': 'codex', 'backend': 'codex', 'model': 'fixture', 'identity': IDENTITY,
              'tool_policy': ADAPTERS['codex'].policy, 'session': {'is_error': False},
              'sandbox_preflight': {'passed': True}, 'sentinel_exposed': False,
              'sentinel': str(sentinel), 'verified': False,
              'trace_sha256': hashlib.sha256(trace.read_bytes()).hexdigest()}
    (root / 'probes/codex.json').write_text(json.dumps(record))
    return trace


class BenchmarkWorkflowTests(unittest.TestCase):
    def test_guidance_is_snapshotted_and_changed_bytes_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'; source.mkdir()
            for name in ('llms.txt', 'llms-full.txt', 'api.md'):
                (source/name).write_text('original')
            condition = {'docs': True, 'docs_dir': str(source)}
            with patch.dict(benchmark.LIBRARIES, {'fixture': condition}):
                result = benchmark.freeze_guidance(root, {'fixture'})
                snapshot = Path(result['fixture']['docs_dir'])
                self.assertNotEqual(snapshot, source)
                self.assertEqual((snapshot/'api.md').read_text(), 'original')
                (source/'api.md').write_text('changed')
                self.assertEqual((snapshot/'api.md').read_text(), 'original')
                with self.assertRaisesRegex(ValueError, 'frozen fixture docs differs'):
                    benchmark.freeze_guidance(root, {'fixture'})

    def test_svelte_trial_can_read_installed_types_without_a_checkout_alias(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);probe_fixture(root)
            environment=root/'venvs/javascript-hmplot';(environment/'node_modules/hmplot').mkdir(parents=True)
            (environment/'node_modules/hmplot/index.d.ts').write_text('export interface Fixture {}')
            (root/'versions.json').write_text(json.dumps({'tools':{'chrome':None}}))
            def prepare(root,task,library,index,**kwargs):
                run=root/'runs'/task['id']/f'{library}--codex'/str(index);run.mkdir(parents=True);return run
            def launch(binary,run,model,prompt,*args,**kwargs):
                self.assertEqual(kwargs['read_roots'],(environment,))
                self.assertEqual((run/'node_modules/hmplot/index.d.ts').read_text(),'export interface Fixture {}')
                self.assertIn('read-only',prompt)
                (run/'solution.svelte').write_text('<main>Fixture</main>')
                return {'is_error':False,'tokens':1,'message':'','usage_complete':True}
            row={**AGENT,'agent':'codex','task':'taxi-explorer','track':'javascript','library':'hmplot-js-web-docs','index':1}
            with patch('benchmark._policy_identity',return_value=IDENTITY),patch('benchmark.prepared',side_effect=prepare),patch('benchmark.report'),patch('benchmark.evaluate_js',return_value={'checks':[],'automatic_success':True}),patch.object(ADAPTERS['codex'],'sandbox_preflight',return_value={'passed':True}),patch.object(ADAPTERS['codex'],'run',side_effect=launch),patch.object(ADAPTERS['codex'],'version',return_value='fixture'):
                benchmark.verify_probe(root,'codex',AGENT,'Outside denied')
                result=benchmark.run_case(root,row,0)
            self.assertTrue(result['automatic_success'])

    def test_probe_verification_refuses_changed_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            probe_fixture(root)
            changed = {**IDENTITY, 'binary': {**IDENTITY['binary'], 'sha256': 'replacement'}}
            with patch('benchmark._policy_identity', return_value=changed):
                with self.assertRaisesRegex(ValueError, 'binary, model or tool policy changed'):
                    benchmark.verify_probe(root, 'codex', AGENT, 'Inspected live trace')
            self.assertFalse(json.loads((root / 'probes/codex.json').read_text())['verified'])

    def test_run_refuses_changed_reviewed_trace_before_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            trace = probe_fixture(root)
            with patch('benchmark._policy_identity', return_value=IDENTITY):
                benchmark.verify_probe(root, 'codex', AGENT, 'Read denied; no outside context')
                trace.write_text(trace.read_text() + '{"type":"new-event"}\n')
                row = {**AGENT, 'agent': 'codex', 'task': 'scatter', 'track': 'python',
                       'library': 'hmplot', 'index': 1}
                with patch('benchmark.report'), patch.object(ADAPTERS['codex'], 'run') as launch:
                    result = benchmark.run_case(root, row, 1)
                launch.assert_not_called()
                self.assertIn('trace changed', result['blocked_reason'])

    def test_probe_verification_refuses_changed_captured_trace(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            trace = probe_fixture(root)
            trace.write_text(trace.read_text() + '{"type":"new-event"}\n')
            with patch('benchmark._policy_identity', return_value=IDENTITY):
                with self.assertRaisesRegex(ValueError, 'trace'):
                    benchmark.verify_probe(root, 'codex', AGENT, 'Inspected live trace')
            self.assertFalse(json.loads((root / 'probes/codex.json').read_text())['verified'])

    def test_correction_retains_task_and_preserves_previous_outputs_before_clearing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            probe_fixture(root)
            interpreter = root / 'venvs/hmplot/bin/python'
            interpreter.parent.mkdir(parents=True)
            interpreter.write_text('fixture interpreter')
            (root / 'versions.json').write_text(json.dumps({'tools': {'chrome': None}}))
            prompts = []

            def prepare(root, task, library, index, **kwargs):
                run = root / 'runs' / task['id'] / f'{library}--{kwargs["agent"]}' / str(index)
                (run / 'output').mkdir(parents=True)
                return run

            def launch(binary, run, model, prompt, number, timeout, audit, **kwargs):
                prompts.append(prompt)
                self.assertEqual(kwargs['read_roots'], (interpreter.parent.parent,))
                if number:
                    self.assertFalse((run / 'screenshot.png').exists())
                    self.assertFalse((run / 'output/chart.html').exists())
                    self.assertEqual((audit / 'round-0-chart.html').read_text(), 'first chart')
                    self.assertEqual((audit / 'round-0-solution.py').read_text(), 'first solution')
                (run / 'solution.py').write_text('partial correction' if number else 'first solution')
                return {'is_error': bool(number), 'tokens': 10, 'message': 'fixture CLI error' if number else '',
                        'session_id': 'fixture-session', 'usage_complete': True}

            def evaluate(task, library, run, env, chrome):
                (run / 'screenshot.png').write_bytes(b'first screenshot')
                (run / 'output/chart.html').write_text('first chart')
                (run / 'program.stderr.txt').write_text('first program stderr')
                return {'automatic_success': False, 'metrics': {},
                        'checks': [{'name': 'expected text', 'status': 'fail', 'detail': 'legend missing'}]}

            row = {**AGENT, 'agent': 'codex', 'task': 'scatter', 'track': 'python',
                   'library': 'hmplot', 'index': 1, 'workflow_fingerprint': 'fixture-fingerprint'}
            with patch('benchmark._policy_identity', return_value=IDENTITY), \
                 patch('benchmark.prepared', side_effect=prepare), \
                 patch('benchmark.evaluate', side_effect=evaluate), patch('benchmark.report'), \
                 patch.object(ADAPTERS['codex'], 'sandbox_preflight', return_value={'passed': True}) as preflight, \
                 patch.object(ADAPTERS['codex'], 'run', side_effect=launch), \
                 patch.object(ADAPTERS['codex'], 'version', return_value='fixture'):
                benchmark.verify_probe(root, 'codex', AGENT, 'Read denied; no outside context')
                result = benchmark.run_case(root, row, 1)
            self.assertEqual(len(prompts), 2)
            self.assertIn(TASKS_BY_ID['scatter']['prompt'], prompts[1])
            self.assertIn('Read hmplot-skill/SKILL.md', prompts[1])
            self.assertIn(f'Selected Python interpreter: {interpreter}', prompts[1])
            self.assertIn('legend missing', prompts[1])
            self.assertEqual(preflight.call_args.kwargs['read_roots'], (interpreter.parent.parent,))
            run = root / 'runs/scatter/hmplot--codex/1'
            self.assertFalse((run / 'screenshot.png').exists())
            self.assertEqual((audit_dir(run) / 'round-1-solution.py').read_text(), 'partial correction')
            self.assertEqual(result['workflow_fingerprint'], 'fixture-fingerprint')
            self.assertFalse(result['automatic_success'])

    def test_example_matrix_pairs_hmplot_with_free_choice(self):
        path = Path(__file__).parent / 'benchmark.example.toml'
        with patch.dict('os.environ', {'CODEX_BIN': 'codex', 'CLAUDE_BIN': 'claude'}):
            config = read_config(path)
        rows = matrix(config)
        tasks = {row['task'] for row in rows}
        # Every Python task runs with HMPlot and with free choice, for every agent (paired).
        for agent in config['agents']:
            for track, pair in (('python', ('hmplot', 'free')), ('javascript', ('hmplot-js', 'free-js'))):
                for library in pair:
                    self.assertEqual({row['task'] for row in rows if row['agent'] == agent and row['library'] == library},
                                     {task for task in tasks if track in TASKS_BY_ID[task]['tracks']})
        # Cold HMPlot runs on its sample only.
        cold = {row['task'] for row in rows if row['library'] == 'hmplot-cold'}
        self.assertEqual(cold, set(config['library_tasks']['hmplot-cold']))
        self.assertEqual(len(cold), 10)
        per_agent = 2 * len(tasks) + len(cold) + 2 * sum('javascript' in TASKS_BY_ID[t]['tracks'] for t in tasks)
        self.assertEqual(sum(row['agent'] == 'codex' for row in rows), per_agent)
        self.assertEqual(len(rows), per_agent * len(config['agents']))
        self.assertEqual({row['index'] for row in rows}, {1})
        # The reviewer runs no trials.
        self.assertNotIn('judge', config['agents'])
        self.assertEqual(judge_agent(config)['model'], 'claude-opus-5-5')

    def test_pilot_is_twenty_paired_trials(self):
        path = Path(__file__).parent / 'pilot.toml'
        with patch.dict('os.environ', {'CODEX_BIN': 'codex', 'CLAUDE_BIN': 'claude'}):
            config = read_config(path)
        rows = matrix(config)
        self.assertEqual(len(rows), 20)
        self.assertEqual({row['library'] for row in rows}, {'hmplot', 'free'})
        self.assertEqual(len({TASKS_BY_ID[row['task']]['category'] for row in rows}), 8)


if __name__ == '__main__':
    unittest.main()
