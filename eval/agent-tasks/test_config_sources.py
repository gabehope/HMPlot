"""Matrix expansion, immutable source snapshots, and restricted fetches."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agenteval.config import matrix, read_config
from agenteval.sources import fetch_data, pin_task, stage_task


class ConfigAndSourceTests(unittest.TestCase):
    def test_matrix_and_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'benchmark.toml'
            path.write_text('''[benchmark]
tasks = ["scatter"]
repetitions = 3
corrections = 1
[agents.codex]
backend = "codex"
binary = "codex"
model = "gpt-6-sol"
[tracks.python]
libraries = ["hmplot", "plotly"]
[tracks.javascript]
libraries = ["hmplot-js", "deckgl"]
''')
            config = read_config(path)
            rows = matrix(config)
            self.assertEqual(len(rows), 12)
            self.assertEqual({r['track'] for r in rows}, {'python', 'javascript'})
            self.assertEqual({r['index'] for r in rows}, {1, 2, 3})
            path.write_text(path.read_text().replace('"hmplot-js", "deckgl"', '"plotly"'))
            with self.assertRaisesRegex(ValueError, 'not a javascript library'):
                read_config(path)

    def test_empty_agent_binary_after_environment_expansion(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'benchmark.toml'
            path.write_text('''[benchmark]
tasks = ["scatter"]
repetitions = 1
corrections = 0
[agents.codex]
backend = "codex"
binary = "${CODEX_BIN}"
model = "gpt-6-sol"
[tracks.python]
libraries = ["hmplot"]
''')
            with patch.dict('os.environ', {'CODEX_BIN': ''}):
                with self.assertRaisesRegex(ValueError, 'binary expanded to an empty path'):
                    read_config(path)

    def test_snapshot_hash_and_fetch_policy(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source.csv'
            source.write_text('x,y\n1,2\n3,4\n')
            task = {'id': 'local-fixture', 'access': 'agent_fetch', 'sources': [{
                'url': source.as_uri(), 'destination': 'data.csv', 'max_bytes': 100,
                'license': 'test fixture', 'transformation': 'none'}]}
            pinned = pin_task(task, root)
            self.assertEqual(pinned[0]['rows'], 2)
            self.assertEqual(len(pinned[0]['sha256']), 64)
            run = root / 'runs' / 'case'
            run.mkdir(parents=True)
            self.assertEqual(stage_task(task, root, run), pinned)
            self.assertFalse((run / 'data/data.csv').exists())
            with self.assertRaises(PermissionError):
                fetch_data(task, root, run, source.as_uri() + '?changed', 'data.csv')
            with self.assertRaises(ValueError):
                fetch_data(task, root, run, source.as_uri(), '../escape.csv')
            event = fetch_data(task, root, run, source.as_uri(), 'data.csv')
            self.assertEqual(event['sha256'], pinned[0]['sha256'])
            self.assertEqual(json.loads((run / 'fetch-calls.jsonl').read_text())['destination'], 'data/data.csv')
            (root / 'source-cache/local-fixture/data.csv').write_text('tampered')
            with self.assertRaisesRegex(ValueError, 'pinned source changed'):
                pin_task(task, root)

    def test_size_limit(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'large.csv'
            source.write_bytes(b'x' * 20)
            task = {'id': 'too-large', 'access': 'provided', 'sources': [{
                'url': source.as_uri(), 'destination': 'large.csv', 'max_bytes': 10}]}
            with self.assertRaisesRegex(ValueError, 'exceeds'):
                pin_task(task, root)


if __name__ == '__main__':
    unittest.main()
