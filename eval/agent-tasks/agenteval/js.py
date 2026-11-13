"""Build a Svelte solution into one offline HTML file, then run the shared browser checks."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from .checks import _browser, _sandbox_command, item
from .libraries import LIBRARIES

REPO = Path(__file__).resolve().parents[3]

# Match the library's standalone exporter: offline file:// pages have opaque origins
# and cannot load module workers. This changes bundling, not package resolution.
INLINE_WORKERS = r'''
const inlineWorkers = {
  name: 'inline-offline-hmplot-workers', enforce: 'pre',
  transform(code, id) {
    const factories = {
      '/plot/utils/geoWorker.js': ['GeometryWorker', 'geoGeometry.worker.js'],
      '/plot/utils/dodge.js': ['DodgePlacementWorker', 'dodgePlacement.worker.js'],
      '/plot/utils/vectorTileWorker.js': ['VectorTileWorker', 'vectorTile.worker.js'],
    };
    const entry = Object.entries(factories).find(([suffix]) => id.endsWith(suffix));
    if (!entry) return;
    const [name, file] = entry[1];
    return `import ${name} from '../workers/${file}?worker&inline';\n` +
      code.replace(/new Worker\(\s*new URL\([^;]*?\{\s*type:\s*"module"\s*\},?\s*\)/, `new ${name}()`);
  }
};
'''


def evaluate_js(task: dict, library: str, run: Path, root: Path, chrome: str | None, *, build_only=False) -> dict:
    source = run / 'solution.svelte'
    # A failed correction must never inherit a previous attempt's compiled artifact.
    shutil.rmtree(run / 'output', ignore_errors=True)
    if not source.is_file():
        return {'checks': [item('program', 'fail', 'solution.svelte missing')], 'metrics': {},
                'automatic_success': False}
    package = root / 'venvs' / LIBRARIES[library]['env']
    binary = package / 'node_modules' / '.bin' / 'vite'
    if not binary.is_file():
        return {'checks': [item('environment', 'fail', f'{binary} missing')], 'metrics': {},
                'automatic_success': False}
    (run / 'index.html').write_text('<!doctype html><html><meta charset="utf-8"><div id="app"></div><script type="module" src="/main.js"></script></html>')
    (run / 'main.js').write_text("import { mount } from 'svelte'; import App from './solution.svelte'; mount(App, { target: document.getElementById('app') });\n")
    if library.startswith('hmplot'):
        with (run / 'main.js').open('a') as target:
            target.write("import { inspect } from 'hmplot/check'; window.hmplotInspect = () => inspect();\n")
    # Resolve actual package exports, including subpaths; no checkout aliases or reads.
    config = f'''import {{ defineConfig }} from 'vite';
import {{ svelte, vitePreprocess }} from '@sveltejs/vite-plugin-svelte';
import {{ viteSingleFile }} from 'vite-plugin-singlefile';
import {{ transform }} from 'esbuild';
{INLINE_WORKERS}
const stripTypes = {{script: async (input) => input.attributes.lang === 'ts' ?
  {{ code: (await transform(input.content, {{ loader: 'ts', target: 'esnext',
    tsconfigRaw: {{ compilerOptions: {{ verbatimModuleSyntax: true }} }} }})).code }} : undefined }};
export default defineConfig({{
  root: {json.dumps(str(run))},
  cacheDir: {json.dumps(str(run / '.vite-cache'))},
  plugins: [inlineWorkers, svelte({{ include: [/\\.svelte$/], preprocess: [stripTypes, vitePreprocess()] }}), viteSingleFile()],
  worker: {{ format: 'iife' }},
  resolve: {{ dedupe: ['svelte', 'three', '@threlte/core'] }},
  server: {{ fs: {{ allow: [{json.dumps(str(run))}, {json.dumps(str(package))}] }} }},
  build: {{ outDir: {json.dumps(str(run / 'output'))}, emptyOutDir: true,
    assetsInlineLimit: 100000000, cssCodeSplit: false, rollupOptions: {{ output: {{ inlineDynamicImports: true }} }} }}
}});
'''
    (run / 'vite.config.mjs').write_text(config)
    modules = run / 'node_modules'
    if not modules.exists():
        modules.symlink_to(package / 'node_modules', target_is_directory=True)
    temporary = Path(tempfile.mkdtemp(prefix='hmplot-js-', dir='/private/tmp')).resolve()
    env = {'PATH': f'{package / "node_modules/.bin"}:/usr/bin:/bin:/opt/homebrew/bin',
           'HOME': str(run), 'TMPDIR': str(temporary), 'NODE_ENV': 'production'}
    start = time.monotonic()
    checks = []
    metrics = {'lines_of_code': sum(bool(line.strip()) for line in source.read_text().splitlines())}
    try:
        node = shutil.which('node') or '/usr/bin/node'
        (run / 'tsconfig.json').write_text(json.dumps({"compilerOptions": {
            "target": "ESNext", "module": "ESNext", "moduleResolution": "bundler",
            "allowJs": True, "checkJs": False, "strict": True, "skipLibCheck": True,
            "allowArbitraryExtensions": True, "noEmit": True}, "include": ["solution.svelte", "env.d.ts"]}))
        (run / 'env.d.ts').write_text('/// <reference types="vite/client" />\n')
        checker = package / 'node_modules/svelte-check/bin/svelte-check'
        static_command = [node, str(checker), '--tsconfig', str(run / 'tsconfig.json'), '--output', 'machine-verbose']
        static = subprocess.run(_sandbox_command(run, package / 'bin/python', temporary, static_command,
                                extra_reads=(package,)), cwd=run, env=env, capture_output=True, text=True,
                                timeout=task.get('timeout', 180))
        (run / 'static-diagnostics.txt').write_text(static.stdout + static.stderr)
        checks.append(item('Svelte types', 'pass' if static.returncode == 0 else 'fail', (static.stdout + static.stderr)[-6000:]))
        if static.returncode:
            return {'checks': checks, 'metrics': metrics, 'automatic_success': False}
        command = [node, str(binary.resolve()), 'build', '--config', str(run / 'vite.config.mjs'),
                   '--configLoader', 'runner']
        done = subprocess.run(_sandbox_command(run, package / 'bin/python', temporary, command,
                              extra_reads=(package,)), cwd=run, env=env,
                              capture_output=True, text=True, timeout=task.get('timeout', 180))
        (run / 'program.stdout.txt').write_text(done.stdout[-20000:])
        (run / 'program.stderr.txt').write_text(done.stderr[-20000:])
        checks.append(item('build', 'pass' if done.returncode == 0 else 'fail',
                           f'exit {done.returncode}: {done.stderr[-1200:]}'))
    except (subprocess.TimeoutExpired, OSError) as error:
        checks.append(item('build', 'fail', str(error)))
    finally:
        shutil.rmtree(temporary, ignore_errors=True)
    metrics['build_seconds'] = round(time.monotonic() - start, 3)
    html = run / 'output/chart.html'
    built = run / 'output/index.html'
    if built.is_file():
        built.rename(html)
    checks.append(item('standalone HTML', 'pass' if html.is_file() and html.stat().st_size > 100 else 'fail',
                       html.stat().st_size if html.is_file() else 0))
    if html.is_file() and not build_only:
        try:
            more, browser = _browser(html, task, run, chrome, library)
            checks.extend(more); metrics.update(browser)
        except Exception as error:
            checks.append(item('browser', 'fail', repr(error)))
    infrastructure = any('gpu.device-lost' in c.get('detail', '') or
                         'Metal command buffer failed' in c.get('detail', '') or
                         '[Device] is lost' in c.get('detail', '') for c in checks)
    return {'checks': checks, 'metrics': metrics, 'screenshot': str(run / 'screenshot.png'),
            **({'infrastructure_error': 'WebGPU device lost during browser validation'} if infrastructure else {}),
            'automatic_success': all(c['status'] == 'pass' for c in checks)}
