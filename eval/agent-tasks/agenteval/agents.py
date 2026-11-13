"""CLI adapter protocol and parsers. Add an agent by implementing these three methods."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]


def _usage(source: dict, *, input_includes_cached: bool = False) -> dict:
    source = source if isinstance(source, dict) else {}
    aliases = {'input_tokens': ('input_tokens', 'input'), 'output_tokens': ('output_tokens', 'output'),
               'cache_creation_input_tokens': ('cache_creation_input_tokens',),
               'cache_read_input_tokens': ('cache_read_input_tokens', 'cached_input_tokens', 'cached')}
    usage = {}
    for target, keys in aliases.items():
        value = next((source[k] for k in keys if source.get(k) is not None), 0)
        try:
            usage[target] = max(0, int(value))
        except (ValueError, TypeError, OverflowError):
            usage[target] = 0
    if input_includes_cached:
        usage['input_tokens'] = max(0, usage['input_tokens'] - usage['cache_read_input_tokens'] -
                                    usage['cache_creation_input_tokens'])
    return usage


def _events(raw: str) -> tuple[list[dict], list[str]]:
    """Ignore CLI chatter but retain a diagnostic for a truncated JSON event."""
    events, errors = [], []
    for number, line in enumerate(raw.splitlines(), 1):
        line = line.strip().lstrip('\ufeff')
        if not line.startswith('{'):
            continue
        try:
            event = json.loads(line)
            if isinstance(event, dict):
                events.append(event)
        except json.JSONDecodeError:
            errors.append(f'invalid or incomplete JSON on output line {number}')
    return events, errors


def _stop_process_group(process: subprocess.Popen) -> None:
    """A timed-out CLI must not leave model or shell subprocesses running."""
    if os.name == 'posix':
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    elif process.poll() is None:
        process.terminate()
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass
    if os.name == 'posix':
        # Also reap descendants that outlive the CLI process itself.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    elif process.poll() is None:
        process.kill()
    process.wait()


@dataclass
class Adapter:
    backend: str
    policy: str
    stdin_prompt = False

    def command(self, binary: str, run: Path, model: str, prompt: str, resume: str | None,
                mcp: Path | None, read_roots: tuple[Path, ...] = (),
                images: tuple[Path, ...] = ()) -> list[str]:
        """`images` (the visual review's renders) are files in `run`; an adapter whose CLI
        cannot open image files itself attaches them."""
        raise NotImplementedError

    def parse(self, raw: str, stderr: str, exit_code: int) -> dict:
        raise NotImplementedError

    def version(self, binary: str) -> str:
        try:
            result = subprocess.run([binary, '--version'], capture_output=True, text=True, timeout=10)
            return (result.stdout or result.stderr).strip().splitlines()[0][:200] if result.returncode == 0 else 'unknown'
        except (OSError, subprocess.TimeoutExpired, IndexError):
            return 'unknown'

    def run(self, binary: str, run: Path, model: str, prompt: str, number: int,
            timeout: int, audit: Path, resume: str | None = None, mcp: Path | None = None,
            read_roots: tuple[Path, ...] = (), images: tuple[Path, ...] = ()) -> dict:
        # Only the visual review passes images, so an adapter without the argument still runs tasks.
        command = (self.command(binary, run, model, prompt, resume, mcp, read_roots, images) if images
                   else self.command(binary, run, model, prompt, resume, mcp, read_roots))
        started = time.monotonic()
        audit.mkdir(parents=True, exist_ok=True)
        stdout_path = audit / f'session-{number}.stdout.jsonl'
        stderr_path = audit / f'session-{number}.stderr.txt'
        summary_path = audit / f'session-{number}.json'
        pending = {'status': 'running', 'command': command, 'invocation_started': False,
                   'usage_complete': False, 'tool_policy': self.policy}
        summary_path.write_text(json.dumps(pending) + '\n')
        env = os.environ.copy()
        for key in ('PYTHONPATH', 'CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD', 'GEMINI_CLI_HOME'):
            env.pop(key, None)
        if self.backend == 'gemini':
            env['SEATBELT_PROFILE'] = 'strict-open'
        process, interruption, failure, status = None, None, '', 'completed'
        # Direct file descriptors preserve output as it arrives, including on cancellation
        # or a harness crash. Capturing with PIPE would lose it until communicate returns.
        with stdout_path.open('wb') as stdout, stderr_path.open('wb') as stderr, \
                (audit / f'session-{number}.stdin.txt').open('w+b') as stdin:
            if self.stdin_prompt:
                stdin.write(prompt.encode('utf-8'))
                stdin.seek(0)
            try:
                process = subprocess.Popen(command, cwd=run, env=env,
                                           stdin=stdin if self.stdin_prompt else subprocess.DEVNULL,
                                           stdout=stdout, stderr=stderr, start_new_session=True)
                pending.update({'invocation_started': True, 'pid': process.pid})
                summary_path.write_text(json.dumps(pending) + '\n')
                process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                status, failure = 'timed_out', f'agent timed out after {timeout} seconds'
            except (KeyboardInterrupt, SystemExit) as error:
                status, failure, interruption = 'cancelled', 'agent session cancelled', error
            except OSError as error:
                status, failure = 'failed', f'cannot start agent: {error}'
            finally:
                if process is not None:
                    _stop_process_group(process)
                stdout.flush()
                stderr.flush()
                os.fsync(stdout.fileno())
                os.fsync(stderr.fileno())
        exit_code = process.returncode if process is not None else -1
        entry = self.parse(stdout_path.read_text(errors='replace'),
                           stderr_path.read_text(errors='replace'), exit_code)
        if failure:
            entry.update({'is_error': True, 'usage_complete': False, 'message': failure +
                          (f'\n{entry["message"]}' if entry.get('message') else '')})
        entry.update({'exit': exit_code, 'wall_seconds': round(time.monotonic() - started, 2),
                      'tool_policy': self.policy, 'status': status, 'command': command,
                      'invocation_started': process is not None})
        summary_path.write_text(json.dumps(entry, indent=2) + '\n')
        if interruption is not None:
            raise interruption
        return entry


# A Claude session's own caps (2026-10-13): run.py's 12 turns and $1 were the single-run pilot's;
# with only Read/Write/Edit, Sonnet spent 12 turns reading docs and stopped before writing. Codex
# sessions have no cap; these are a ceiling, not a target (the first scatter session used $0.35).
# Grep and Glob (2026-10-13): without them Sonnet's HMPlot sessions read whole doc files and timed
# out (TODO 134.21); $25 leaves Opus room on the complex tasks.
CLAUDE_SESSION_TURNS = 100
CLAUDE_SESSION_BUDGET_USD = 25.0
# Claude's result subtypes for a session that stopped at those caps: the agent's own outcome.
CLAUDE_LIMITS = ('error_max_turns', 'error_max_budget_usd')


class Claude(Adapter):
    def __init__(self):
        super().__init__('claude', 'Read/Write/Edit/Grep/Glob; no shell or web; restricted safe mode')

    def command(self, binary, run, model, prompt, resume, mcp, read_roots=(), images=()):
        from run import cli
        args = cli(binary, run, model, CLAUDE_SESSION_BUDGET_USD, CLAUDE_SESSION_TURNS, prompt, resume=resume)
        if mcp:
            args += ['--mcp-config', str(mcp)]
            args[args.index('--tools') + 1] += ',mcp__fetch_data__fetch_data'
        return args

    def parse(self, raw, stderr, exit_code):
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            events, _ = _events(raw)
            obj = next((event for event in reversed(events) if event.get('type') == 'result'), {})
        if not isinstance(obj, dict):
            obj = {}
        usage = _usage(obj.get('usage') or {})
        # A session that stopped at its turn or budget cap ran to its own end: a failed attempt
        # with complete usage, not an interrupted CLI (workflow._classify).
        limited = obj.get('subtype') in CLAUDE_LIMITS
        reported = isinstance(obj.get('usage'), dict) and bool(obj['usage'])
        return {'tokens': sum(usage.values()), 'token_usage': usage, 'session_id': obj.get('session_id'),
                'raw_usage': obj.get('usage') or {},
                'usage_complete': reported and (limited or (exit_code == 0 and not obj.get('is_error'))),
                'message': obj.get('result') or ('; '.join(obj.get('errors') or []) if limited else '')
                           or stderr[-2000:] or 'no complete agent result',
                'is_error': exit_code != 0 or bool(obj.get('is_error')) or 'result' not in obj,
                **({'status': 'limit_reached'} if limited else {})}


class Codex(Adapter):
    stdin_prompt = True

    def __init__(self):
        super().__init__('codex', 'workspace-only profile; selected package environment read-only; '
                         'approvals never; clean command environment; user/project instructions, '
                         'network, host skills, plugins, apps, hooks, browser, memory, and multi-agent '
                         'disabled; bundled system skills available; sandbox preflight required')

    def _profile_args(self, read_roots=()):
        filesystem = {':root': 'deny', ':minimal': 'read', ':tmpdir': 'deny',
                      ':slash_tmp': 'deny'}
        filesystem.update({str(path.resolve()): 'read' for path in read_roots})
        rules = ','.join(f'{json.dumps(path)}={json.dumps(access)}'
                         for path, access in filesystem.items())
        return ['-c', 'default_permissions="hmplot-eval"',
                '-c', 'permissions.hmplot-eval.extends=":workspace"',
                '-c', f'permissions.hmplot-eval.filesystem={{{rules}}}',
                '-c', 'permissions.hmplot-eval.network.enabled=false']

    def command(self, binary, run, model, prompt, resume, mcp, read_roots=(), images=()):
        path = ':'.join([*(str(root.resolve() / 'bin') for root in read_roots),
                         '/usr/bin', '/bin', '/usr/sbin', '/sbin', '/opt/homebrew/bin'])
        args = [binary, 'exec', '--json', '--model', model, '--cd', str(run),
                '--ignore-user-config', '--ignore-rules', '--ephemeral', '--strict-config',
                '--skip-git-repo-check', *self._profile_args(read_roots),
                '-c', 'web_search="disabled"', '-c', 'features.apps=false',
                '-c', 'features.plugins=false', '-c', 'features.remote_plugin=false',
                '-c', 'features.skip_host_skill_discovery=true',
                '-c', 'features.memories=false', '-c', 'features.multi_agent=false',
                '-c', 'approval_policy="never"', '-c', 'project_doc_max_bytes=0',
                '-c', 'allow_login_shell=false', '-c', 'shell_environment_policy.inherit="none"',
                '-c', f'shell_environment_policy.set={{PATH={json.dumps(path)},PYTHONNOUSERSITE="1"}}',
                '-c', 'features.hooks=false', '-c', 'features.shell_snapshot=false',
                '-c', 'features.browser_use=false', '-c', 'features.computer_use=false',
                '-c', 'features.image_generation=false', '-c', 'features.skill_mcp_dependency_install=false',
                '-c', 'features.skill_search=false']
        if mcp:
            server = json.loads(mcp.read_text())['mcpServers']['fetch_data']
            args += ['-c', f'mcp_servers.fetch_data.command={json.dumps(server["command"])}',
                     '-c', f'mcp_servers.fetch_data.args={json.dumps(server["args"])}']
        # Codex reads no image file by itself: the visual review attaches the renders.
        for image in images:
            args += ['--image', str(image)]
        # Ephemeral Codex turns do not persist a resumable session. A correction starts in
        # the same run directory and reads the previous solution there.
        # The CLI reads the exact UTF-8 prompt from stdin; data-bearing diagnostics
        # can exceed the operating system's argument-size limit.
        args += ['-']
        return args

    def sandbox_preflight(self, binary: str, run: Path, sentinel: Path, audit: Path,
                          read_roots: tuple[Path, ...] = ()) -> dict:
        """Check the CLI's actual command sandbox without spending model tokens."""
        from .isolation import codex_preflight
        return codex_preflight(binary, run, audit, self._profile_args(read_roots), read_roots)

    def parse(self, raw, stderr, exit_code):
        events, errors = _events(raw)
        usage = _usage({})
        raw_usage = []
        message = ''
        session_id = None
        completed = False
        for event in events:
            if event.get('type') == 'thread.started':
                session_id = event.get('thread_id')
            if event.get('type') == 'turn.completed':
                completed = True
                source = event.get('usage') or {}
                raw_usage.append(source)
                for key, value in _usage(source, input_includes_cached=True).items():
                    usage[key] += value
            item = event.get('item')
            if (event.get('type') in ('item.completed', 'item.updated') and
                    isinstance(item, dict) and item.get('type') == 'agent_message'):
                message = item.get('text') or ''
            if event.get('type') in ('error', 'turn.failed'):
                errors.append(str(event.get('message') or event.get('error')))
        return {'tokens': sum(usage.values()), 'token_usage': usage, 'raw_usage': raw_usage,
                'session_id': session_id,
                'usage_complete': completed and exit_code == 0 and not errors and
                                  all(isinstance(source, dict) and 'input_tokens' in source and
                                      'output_tokens' in source for source in raw_usage),
                'message': '\n'.join(errors) or message or stderr[-2000:] or 'no completed agent turn',
                'is_error': exit_code != 0 or bool(errors) or not completed}


class Gemini(Adapter):
    def __init__(self):
        super().__init__('gemini', 'strict-open macOS sandbox; automatic file edits; shell and web excluded by local settings')

    def command(self, binary, run, model, prompt, resume, mcp, read_roots=(), images=()):
        config = run / '.gemini'
        config.mkdir(exist_ok=True)
        settings = {'tools': {'exclude': ['run_shell_command', 'web_search', 'web_fetch']},
                    'mcpServers': json.loads(mcp.read_text())['mcpServers'] if mcp else {}}
        (config / 'settings.json').write_text(json.dumps(settings))
        args = [binary, '-p', prompt, '--model', model, '--output-format', 'stream-json',
                '--sandbox', '--approval-mode', 'auto_edit']
        if resume:
            args += ['--resume', resume]
        return args

    def parse(self, raw, stderr, exit_code):
        events, errors = _events(raw)
        result = next((e for e in reversed(events) if e.get('type') == 'result'), {})
        init = next((e for e in events if e.get('type') == 'init'), {})
        stats = result.get('stats') if isinstance(result.get('stats'), dict) else {}
        usage = _usage(stats.get('tokens') or stats)
        message = next((event.get('content') for event in reversed(events)
                        if event.get('type') == 'message' and event.get('role') == 'assistant'), '')
        return {'tokens': sum(usage.values()), 'token_usage': usage,
                'raw_usage': stats.get('tokens') or stats,
                'usage_complete': bool(stats) and exit_code == 0 and not errors and
                                  not result.get('error') and result.get('status') != 'error',
                'session_id': init.get('session_id'),
                'message': result.get('response') or '\n'.join(errors) or message or stderr[-2000:] or
                           'no complete agent result',
                'is_error': exit_code != 0 or bool(result.get('error')) or bool(errors) or not result or
                            result.get('status') == 'error'}


ADAPTERS = {'claude': Claude(), 'codex': Codex(), 'gemini': Gemini()}


def mcp_config(root: Path, run: Path, task: dict) -> Path | None:
    if task['access'] != 'agent_fetch':
        return None
    config = run.parent / f'.agent-config-{run.name}'
    config.mkdir(exist_ok=True)
    path = config / 'mcp.json'
    path.write_text(json.dumps({'mcpServers': {'fetch_data': {'command': sys.executable,
        'args': [str(HERE / 'fetch_data_mcp.py'), str(root), str(run), task['id']]}}}))
    return path
