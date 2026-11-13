"""Agent process lifecycle and token accounting, using local fake CLI processes."""

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from agenteval.agents import ADAPTERS, Codex


class ScriptAgent(Codex):
    stdin_prompt = False

    def command(self, binary, run, model, prompt, resume, mcp, read_roots=()):
        return [sys.executable, '-u', '-c', prompt]


class AgentTests(unittest.TestCase):
    def test_codex_large_prompt_uses_stdin_without_changing_bytes(self):
        class StdinAgent(Codex):
            def command(self, *args, **kwargs):
                return [sys.executable, '-c',
                        'import sys,json; data=sys.stdin.buffer.read(); '
                        'print(json.dumps({"type":"turn.completed","usage":{"input_tokens":len(data),"output_tokens":1}}))']
        prompt = 'data:application/octet-stream;base64,' + 'A' * 2_000_000 + ' café'
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            result = StdinAgent().run('unused', root, 'fixture', prompt, 0, 10, root/'audit')
            self.assertFalse(result['is_error'])
            self.assertEqual(result['tokens'], len(prompt.encode()) + 1)
            self.assertEqual((root/'audit/session-0.stdin.txt').read_bytes(), prompt.encode())
        self.assertEqual(Codex().command('codex', Path('/run'), 'model', prompt, None, None)[-1], '-')

    def test_codex_sums_turns_without_counting_cached_input_twice(self):
        events = [
            {'type': 'thread.started', 'thread_id': 'fixture'},
            {'type': 'turn.completed', 'usage': {'input_tokens': 100, 'cached_input_tokens': 40,
                                                'output_tokens': 10}},
            {'type': 'turn.completed', 'usage': {'input_tokens': 70, 'cached_input_tokens': 20,
                                                'output_tokens': 5}},
        ]
        raw = '\n'.join(json.dumps(event) for event in events)
        result = ADAPTERS['codex'].parse(raw, '', 0)
        self.assertFalse(result['is_error'])
        self.assertEqual(result['tokens'], 185)
        self.assertEqual(result['token_usage']['input_tokens'], 110)
        self.assertEqual(result['token_usage']['cache_read_input_tokens'], 60)
        self.assertEqual(result['raw_usage'], [event['usage'] for event in events[1:]])
        partial = ADAPTERS['codex'].parse(raw + '\n{"type":', '', -15)
        self.assertTrue(partial['is_error'])
        self.assertEqual(partial['tokens'], 185)
        self.assertIn('incomplete JSON', partial['message'])

    def test_missing_or_malformed_results_are_errors_for_every_backend(self):
        for adapter in ADAPTERS.values():
            for raw in ('', '{"type":', '[]', '{"type":"unrelated"}'):
                with self.subTest(backend=adapter.backend, raw=raw):
                    self.assertTrue(adapter.parse(raw, '', 0)['is_error'])

    def test_codex_uses_clean_command_environment_without_changing_login_home(self):
        command = Codex().command('codex', Path('/run'), 'model', 'prompt', None, None)
        for setting in ['approval_policy="never"', 'project_doc_max_bytes=0',
                        'allow_login_shell=false', 'shell_environment_policy.inherit="none"',
                        'features.hooks=false', 'features.shell_snapshot=false',
                        'features.browser_use=false', 'features.computer_use=false',
                        'features.image_generation=false', 'features.skill_mcp_dependency_install=false',
                        'features.skill_search=false']:
            self.assertIn(setting, command)
        self.assertNotIn('--dangerously-bypass-approvals-and-sandbox', command)

    def test_timeout_retains_partial_trace_tokens_and_kills_descendants(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            child_code = 'import pathlib,time; time.sleep(0.7); pathlib.Path("leaked.txt").touch()'
            script = ('import subprocess,time,json,sys\n'
                      f'subprocess.Popen([sys.executable,"-c",{child_code!r}])\n'
                      'print(json.dumps({"type":"turn.completed","usage":'
                      '{"input_tokens":12,"cached_input_tokens":3,"output_tokens":2}}),flush=True)\n'
                      'time.sleep(30)\n')
            result = ScriptAgent().run('unused', root, 'fixture', script, 0, 0.2, root / 'audit')
            self.assertTrue(result['is_error'])
            self.assertEqual(result['status'], 'timed_out')
            self.assertEqual(result['tokens'], 14)
            self.assertIn('turn.completed', (root / 'audit/session-0.stdout.jsonl').read_text())
            self.assertEqual(result, json.loads((root / 'audit/session-0.json').read_text()))
            time.sleep(0.8)
            self.assertFalse((root / 'leaked.txt').exists())

    def test_cancel_saves_audit_before_propagating_interrupt(self):
        real_popen = subprocess.Popen

        def interrupted_popen(*args, **kwargs):
            process = real_popen(*args, **kwargs)
            real_wait = process.wait
            first = True

            def wait(timeout=None):
                nonlocal first
                if first:
                    first = False
                    time.sleep(0.1)
                    raise KeyboardInterrupt()
                return real_wait(timeout=timeout)

            process.wait = wait
            return process

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with patch('agenteval.agents.subprocess.Popen', side_effect=interrupted_popen):
                with self.assertRaises(KeyboardInterrupt):
                    ScriptAgent().run('unused', root, 'fixture',
                                      'import time; print("partial trace",flush=True); time.sleep(30)',
                                      0, 10, root / 'audit')
            record = json.loads((root / 'audit/session-0.json').read_text())
            self.assertEqual(record['status'], 'cancelled')
            self.assertTrue(record['is_error'])
            self.assertEqual((root / 'audit/session-0.stdout.jsonl').read_text(), 'partial trace\n')

    def test_launch_failure_is_recorded_instead_of_raising(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            result = Codex().run(str(root / 'missing-codex'), root, 'fixture', 'prompt',
                                 0, 1, root / 'audit')
            self.assertEqual(result['status'], 'failed')
            self.assertTrue(result['is_error'])
            self.assertIn('cannot start agent', result['message'])
            self.assertTrue((root / 'audit/session-0.json').is_file())


if __name__ == '__main__':
    unittest.main()
