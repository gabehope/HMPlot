"""Exercise the command sandbox before a model can consume benchmark tokens."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from contextlib import ExitStack
from pathlib import Path


def binary_identity(binary: str) -> dict:
    """Bind a reviewed probe to the executable that actually ran it."""
    resolved = shutil.which(binary) if binary else None
    if not resolved:
        raise ValueError(f'agent executable not found: {binary!r}')
    path = Path(resolved).resolve(strict=True)
    with path.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    version = subprocess.run([str(path), '--version'], capture_output=True, text=True,
                             timeout=10)
    if version.returncode:
        raise ValueError(f'cannot read agent version: {version.stderr.strip()}')
    return {'path': str(path), 'sha256': digest, 'version': version.stdout.strip()}


def codex_preflight(binary: str, run: Path, audit: Path, profile_args: list[str],
                    read_roots: tuple[Path, ...] = ()) -> dict:
    """Check actual reads/writes, including symlinks, without a model request.

    The explicit ``-P`` selects the same profile described by ``profile_args``;
    HOME and CODEX_HOME retain their normal meaning. No login or config is copied.
    Each readable environment must permit the harness to create a harmless
    temporary fixture, so denied writes prove sandbox enforcement rather than
    relying on an already unwritable host directory.
    """
    started = time.monotonic()
    result = {'passed': False, 'checks': [], 'profile_args': list(profile_args),
              'read_roots': [str(Path(path).resolve()) for path in read_roots]}
    run, audit = Path(run).resolve(), Path(audit).resolve()
    audit.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env['LC_ALL'] = 'C'
    try:
        result['binary'] = binary_identity(binary)
        base = [result['binary']['path'], 'sandbox', '-C', str(run), '-P', 'hmplot-eval',
                *profile_args]

        def check(name, command, *, allowed=False, content=None, created=None):
            done = subprocess.run([*base, *command], cwd=run, env=env,
                                  capture_output=True, text=True, timeout=20)
            if allowed:
                passed = done.returncode == 0 and (content is None or done.stdout == content)
                if created is not None:
                    passed = passed and created.is_file()
            else:
                denied = ('Permission denied' in done.stderr or
                          'Operation not permitted' in done.stderr)
                passed = done.returncode != 0 and not done.stdout and denied
                if created is not None:
                    passed = passed and not created.exists()
            entry = {'name': name, 'passed': passed, 'command': command,
                     'exit': done.returncode, 'stdout': done.stdout, 'stderr': done.stderr}
            result['checks'].append(entry)
            return entry

        with ExitStack() as cleanup:
            inside = Path(cleanup.enter_context(tempfile.TemporaryDirectory(
                prefix='.sandbox-preflight-', dir=run)))
            outside = Path(cleanup.enter_context(tempfile.TemporaryDirectory(
                prefix='.sandbox-preflight-', dir=run.parent)))
            inside_file, outside_file = inside / 'allowed.txt', outside / 'denied.txt'
            inside_file.write_text('INSIDE_ALLOWED')
            outside_file.write_text('ISOLATION_SENTINEL_DO_NOT_EXPOSE')
            link = inside / 'outside-link'
            link.symlink_to(outside_file)
            check('inside read', ['/bin/cat', str(inside_file)], allowed=True,
                  content='INSIDE_ALLOWED')
            check('inside write', ['/usr/bin/touch', str(inside / 'created.txt')],
                  allowed=True, created=inside / 'created.txt')
            outside_result = check('outside read', ['/bin/cat', str(outside_file)])
            # Compatibility for callers that detect exposure before a live probe.
            result.update({'outside_stdout': outside_result['stdout'],
                           'outside_exit': outside_result['exit']})
            check('outside write', ['/usr/bin/touch', str(outside / 'created.txt')],
                  created=outside / 'created.txt')
            check('symlink escape', ['/bin/cat', str(link)])
            # macOS's /tmp is a link to a private folder: read the file through the alias too.
            real_tmp = os.path.realpath('/tmp') + '/'
            if real_tmp != '/tmp/' and str(outside_file).startswith(real_tmp):
                alias = '/tmp/' + str(outside_file)[len(real_tmp):]
                check('temporary directory alias', ['/bin/cat', alias])
            for index, root in enumerate(read_roots):
                readable = Path(cleanup.enter_context(tempfile.TemporaryDirectory(
                    prefix='.sandbox-preflight-', dir=Path(root).resolve())))
                fixture = readable / 'read-only.txt'
                fixture.write_text('READ_ONLY_ALLOWED')
                check(f'read root {index + 1}: read', ['/bin/cat', str(fixture)],
                      allowed=True, content='READ_ONLY_ALLOWED')
                check(f'read root {index + 1}: existing file write',
                      ['/usr/bin/touch', str(fixture)])
                check(f'read root {index + 1}: new file write',
                      ['/usr/bin/touch', str(readable / 'created.txt')],
                      created=readable / 'created.txt')
            result['passed'] = all(item['passed'] for item in result['checks'])
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        result['error'] = str(error)
    result['wall_seconds'] = round(time.monotonic() - started, 3)
    (audit / 'sandbox-preflight.json').write_text(json.dumps(result, indent=2) + '\n')
    return result
