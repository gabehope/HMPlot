#!/usr/bin/env python3
"""Single-purpose MCP server for pinned benchmark data; no network access."""

import json
import sys
from pathlib import Path

from agenteval.sources import fetch_data
from agenteval.tasks import TASKS_BY_ID

TOOL = {'name': 'fetch_data', 'description': 'Copy one pinned task source into its fixed data/ destination.',
        'inputSchema': {'type': 'object', 'properties': {'url': {'type': 'string'},
                        'destination': {'type': 'string'}}, 'required': ['url', 'destination'],
                        'additionalProperties': False}}


def serve(root: Path, run: Path, task_id: str) -> None:
    task = TASKS_BY_ID[task_id]
    for line in sys.stdin:
        try:
            request = json.loads(line)
            method = request.get('method')
            if method == 'initialize':
                response = {'protocolVersion': '2025-03-26', 'capabilities': {'tools': {}},
                            'serverInfo': {'name': 'hmplot-fetch-data', 'version': '1'}}
            elif method == 'tools/list':
                response = {'tools': [TOOL]}
            elif method == 'tools/call':
                params = request.get('params', {})
                if params.get('name') != 'fetch_data':
                    raise ValueError('unknown tool')
                event = fetch_data(task, root, run, **params.get('arguments', {}))
                response = {'content': [{'type': 'text', 'text': json.dumps(event)}]}
            elif method == 'ping':
                response = {}
            else:
                continue
            if 'id' in request:
                sys.stdout.write(json.dumps({'jsonrpc': '2.0', 'id': request['id'], 'result': response}) + '\n')
                sys.stdout.flush()
        except Exception as error:
            if 'id' in request:
                sys.stdout.write(json.dumps({'jsonrpc': '2.0', 'id': request['id'], 'error':
                    {'code': -32603, 'message': str(error)}}) + '\n')
                sys.stdout.flush()


if __name__ == '__main__':
    serve(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3])
