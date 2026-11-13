"""Fail-closed behavior of the no-model Codex command-sandbox probe."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agenteval.isolation import codex_preflight


class IsolationTests(unittest.TestCase):
    def _run(self, behavior):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            run, audit, env = root / 'run', root / 'audit', root / 'environment'
            for path in (run, audit, env):
                path.mkdir()
            identity = {'path': '/fixture/codex', 'version': 'fixture-version', 'sha256': '123'}

            def sandbox(command, **kwargs):
                self.assertEqual(command[1], 'sandbox')
                self.assertIn('-P', command)
                path = Path(command[-1])
                allowed = path.is_relative_to(run) and not path.is_symlink()
                allowed |= command[-2] == '/bin/cat' and path.is_relative_to(env)
                if behavior == 'unrestricted':
                    allowed = True
                if behavior == 'startup-failure':
                    return subprocess.CompletedProcess(command, 1, '', 'sandbox startup failed')
                if not allowed:
                    return subprocess.CompletedProcess(command, 1, '', 'Operation not permitted')
                if command[-2] == '/bin/cat':
                    return subprocess.CompletedProcess(command, 0, path.read_text(), '')
                path.touch()
                return subprocess.CompletedProcess(command, 0, '', '')

            with patch('agenteval.isolation.binary_identity', return_value=identity), \
                 patch('agenteval.isolation.subprocess.run', side_effect=sandbox):
                result = codex_preflight('codex', run, audit, ['-c', 'fixture=true'], (env,))
            self.assertEqual(result, json.loads((audit / 'sandbox-preflight.json').read_text()))
            self.assertEqual(list(run.iterdir()), [])
            self.assertEqual(list(env.iterdir()), [])
            self.assertEqual(sorted(path.name for path in root.iterdir()),
                             ['audit', 'environment', 'run'])
            return result

    def test_checks_reads_writes_symlinks_and_environment_before_passing(self):
        result = self._run('restricted')
        self.assertTrue(result['passed'])
        self.assertEqual(result['binary']['sha256'], '123')
        self.assertTrue(all(check['passed'] for check in result['checks']))
        self.assertGreaterEqual(len(result['checks']), 8)

    def test_unrestricted_command_execution_fails_even_when_inside_access_works(self):
        result = self._run('unrestricted')
        self.assertFalse(result['passed'])
        self.assertIn('ISOLATION_SENTINEL', result['outside_stdout'])

    def test_broken_sandbox_is_not_mistaken_for_enforced_denials(self):
        result = self._run('startup-failure')
        self.assertFalse(result['passed'])
        self.assertFalse(any(check['passed'] for check in result['checks']))


if __name__ == '__main__':
    unittest.main()
