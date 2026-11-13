"""Pin external bytes before runs; agents can only request previously pinned files."""

from __future__ import annotations

import csv
import hashlib
import json
import shutil
import struct
import urllib.request
import zipfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def _download(url: str, destination: Path, limit: int) -> None:
    request = urllib.request.Request(url, headers={'User-Agent': 'HMPlot-agent-eval/1'})
    temporary = destination.with_suffix('.partial')
    try:
        with urllib.request.urlopen(request, timeout=90) as response, temporary.open('wb') as file:
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > limit:
                    raise ValueError(f'source exceeds {limit} bytes: {url}')
                file.write(chunk)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def _safe_name(name: str) -> str:
    if not name or Path(name).name != name or name in ('.', '..') or '/' in name or '\\' in name:
        raise ValueError(f'unsafe data destination: {name}')
    return name


def pin_task(task: dict, root: Path) -> list[dict]:
    """First call downloads; subsequent calls verify immutable local snapshots."""
    if not task.get('sources'):
        return []
    folder = root / 'source-cache' / task['id']
    folder.mkdir(parents=True, exist_ok=True)
    manifest = folder / 'provenance.json'
    if manifest.exists():
        pinned = json.loads(manifest.read_text())
        if len(pinned) != len(task['sources']):
            raise ValueError(f'{task["id"]}: pinned source list differs from task manifest')
        for item, source in zip(pinned, task['sources']):
            if item['url'] != source['url'] or (source.get('sha256') and
               (item.get('source_sha256') or item['sha256']) != source['sha256']):
                raise ValueError(f'{task["id"]}: pinned source differs from task manifest')
            path = folder / item['destination']
            if not path.is_file() or sha256(path) != item['sha256']:
                raise ValueError(f'pinned source changed: {path}')
            if item.get('source_file'):
                original = folder / item['source_file']
                if not original.is_file() or sha256(original) != item['source_sha256']:
                    raise ValueError(f'pinned archive changed: {original}')
        return pinned
    records = []
    for source in task['sources']:
        name = _safe_name(source['destination'])
        limit = int(source.get('max_bytes', 100_000_000))
        if limit < 1:
            raise ValueError('max_bytes must be positive')
        path = folder / name
        shared_dir = root / 'source-cache' / '_downloads'
        shared_dir.mkdir(exist_ok=True)
        shared = shared_dir / hashlib.sha256(source['url'].encode()).hexdigest()
        if not shared.is_file():
            _download(source['url'], shared, limit)
        if shared.stat().st_size > limit:
            raise ValueError(f'source exceeds {limit} bytes: {source["url"]}')
        shutil.copy2(shared, path)
        if source.get('sha256') and sha256(path) != source['sha256']:
            path.unlink()
            raise ValueError(f'hash mismatch: {source["url"]}')
        # The archive is retained verbatim; only the selected CSV and instruction JSON are read.
        source_file = name if source.get('archive_member') else None
        source_hash = sha256(path) if source_file else None
        if source_file:
            member = source['archive_member']
            with zipfile.ZipFile(path) as archive:
                matches = [n for n in archive.namelist() if n.endswith(member)]
                if len(matches) != 1:
                    raise ValueError(f'archive must contain one {member}: {matches}')
                if archive.getinfo(matches[0]).file_size > limit:
                    raise ValueError(f'extracted source exceeds {limit} bytes: {member}')
                extracted = folder / _safe_name(source['extract_as'])
                with archive.open(matches[0]) as incoming, extracted.open('wb') as outgoing:
                    total = 0
                    while chunk := incoming.read(1024 * 1024):
                        total += len(chunk)
                        if total > limit:
                            raise ValueError(f'extracted source exceeds {limit} bytes: {member}')
                        outgoing.write(chunk)
                path = extracted
                name = extracted.name
        rows = None
        if name.lower().endswith('.csv'):
            with path.open(newline='', encoding='utf-8-sig') as stream:
                rows = sum(1 for _ in csv.reader(stream)) - 1
        elif name.lower().endswith('.parquet'):
            import pyarrow.parquet as pq
            rows = pq.ParquetFile(path).metadata.num_rows
        elif name.lower().endswith('.zip'):
            with zipfile.ZipFile(path) as archive:
                dbfs = [n for n in archive.namelist() if n.lower().endswith('.dbf')]
                if len(dbfs) == 1:
                    with archive.open(dbfs[0]) as dbf:
                        header = dbf.read(8)
                    rows = struct.unpack('<I', header[4:8])[0]
        records.append({'url': source['url'], 'destination': name, 'sha256': sha256(path),
                        'bytes': path.stat().st_size, 'rows': rows,
                        'source_file': source_file, 'source_sha256': source_hash,
                        'role': source.get('role', 'data'),
                        'license': source.get('license', 'not verified'),
                        'transformation': source.get('transformation', 'none'),
                        'upstream_id': source.get('upstream_id')})
    manifest.write_text(json.dumps(records, indent=2) + '\n')
    return records


def pinned_task(task: dict, root: Path) -> list[dict]:
    if not task.get('sources'):
        return []
    manifest = root / 'source-cache' / task['id'] / 'provenance.json'
    if not manifest.is_file():
        raise ValueError(f'{task["id"]}: pin external data with prepare-data before runs')
    return pin_task(task, root)


def stage_task(task: dict, root: Path, run: Path) -> list[dict]:
    records = pinned_task(task, root)
    if task['access'] == 'provided':
        data = run / 'data'
        data.mkdir(exist_ok=True)
        for record in records:
            if record['role'] == 'data':
                shutil.copy2(root / 'source-cache' / task['id'] / record['destination'], data / record['destination'])
    return records


def synthetic_records(root: Path, names: list[str], run: Path) -> list[dict]:
    cache = root / 'data-cache' / 'provenance.json'
    saved = json.loads(cache.read_text()) if cache.is_file() else {}
    records = []
    from .data import DATASETS
    for name in names:
        for filename in DATASETS[name][1]:
            path = run / 'data' / filename
            if filename not in saved or saved[filename]['sha256'] != sha256(path):
                if filename.endswith('.parquet'):
                    import pyarrow.parquet as pq
                    rows = pq.ParquetFile(path).metadata.num_rows
                elif filename.endswith('.csv'):
                    with path.open(newline='', encoding='utf-8') as stream:
                        rows = sum(1 for _ in csv.reader(stream)) - 1
                else:
                    rows = None
                saved[filename] = {'url': f'hmplot:data.py#{name}', 'destination': filename,
                                   'sha256': sha256(path), 'bytes': path.stat().st_size,
                                   'rows': rows, 'license': 'HMPlot synthetic fixture (MIT)',
                                   'transformation': f'seeded generator {name}'}
            records.append(saved[filename])
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(saved, indent=2) + '\n')
    return records


def fetch_data(task: dict, root: Path, run: Path, url: str, destination: str) -> dict:
    """Tool implementation: only a listed URL, exact destination and pinned hash."""
    records = pinned_task(task, root)
    name = _safe_name(destination)
    permitted = [r for r in records if r['role'] == 'data' and r['url'] == url and r['destination'] == name]
    if len(permitted) != 1 or task['access'] != 'agent_fetch':
        raise PermissionError('fetch_data only accepts a task-listed URL and destination')
    source = root / 'source-cache' / task['id'] / name
    if sha256(source) != permitted[0]['sha256']:
        raise ValueError('pinned source hash mismatch')
    target = run / 'data' / name
    target.parent.mkdir(exist_ok=True)
    if target.exists() and sha256(target) != permitted[0]['sha256']:
        raise ValueError('destination already exists with different bytes')
    shutil.copy2(source, target)
    event = {'url': url, 'destination': f'data/{name}', 'sha256': permitted[0]['sha256'],
             'bytes': permitted[0]['bytes']}
    with (run / 'fetch-calls.jsonl').open('a') as log:
        log.write(json.dumps(event) + '\n')
    return event


def original_prompt(task: dict, root: Path) -> str | None:
    if task['source'] != 'matplotbench':
        return None
    path = root / 'source-cache' / task['id'] / 'benchmark_instructions.json'
    if not path.is_file():
        return None
    entries = json.loads(path.read_text())
    found = [e for e in entries if e.get('id') == task['upstream_id']]
    if len(found) != 1:
        raise ValueError(f'upstream prompt ID {task["upstream_id"]} missing')
    return found[0]['simple_instruction']
