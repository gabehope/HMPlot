"""Static, local comparison report for benchmark attempts and reference renders."""

from __future__ import annotations

import csv
import html
import json
import re
from collections import defaultdict
from pathlib import Path

from .docs_usage import docs_usage
from .libraries import LIBRARIES
from .sources import original_prompt
from .tasks import TASKS_BY_ID


def e(value) -> str:
    return html.escape(str(value), quote=True)


def detail(title: str, body: str) -> str:
    return f'<details><summary>{e(title)}</summary>{body}</details>'


def file_link(root: Path, path: Path, label: str) -> str:
    return f'<a href="{e(path.relative_to(root).as_posix())}">{e(label)}</a>'


def prompt_html(prompt: str) -> str:
    parts = re.split(r'(\x60[^\x60]+\x60)', prompt)
    return ''.join(f'<code>{e(part[1:-1])}</code>' if part.startswith(chr(96)) and part.endswith(chr(96))
                   else e(part) for part in parts)


def provenance_table(records: list[dict]) -> str:
    if not records:
        return '<p>Seeded synthetic data generated locally, or no data supplied.</p>'
    header = '<tr><th>Source</th><th>File</th><th>Rows</th><th>Bytes</th><th>File SHA-256</th><th>Source SHA-256</th><th>License</th><th>Transformation</th></tr>'
    body = ''.join('<tr>' + ''.join(f'<td>{e(r.get(key) if r.get(key) is not None else "—")}</td>' for key in
                   ('url', 'destination', 'rows', 'bytes', 'sha256', 'source_sha256', 'license', 'transformation')) + '</tr>'
                   for r in records)
    return f'<div class="table-scroll"><table>{header}{body}</table></div>'


def plot_gallery(root: Path, folder: Path) -> str:
    choices = []
    for name, label in (('screenshot.png', 'Final plot'),
                        ('after.png', 'After interaction'),
                        ('pdf.png', 'PDF render')):
        path = folder / name
        if path.is_file():
            relative = e(path.relative_to(root).as_posix())
            choices.append((name, label, relative))
    if not choices:
        return '<div class="plot-empty">No plot captured for this result.</div>'
    switch = ''
    if len(choices) > 1:
        options = ''.join(f'<option value="{e(name)}">{e(label)}</option>' for name, label, _ in choices)
        switch = f'<label class="view-control">View <select class="view-select">{options}</select></label>'
    figures = ''.join(
        f'<figure class="plot-view" data-view="{e(name)}"{" hidden" if i else ""}>'
        f'<a href="{relative}" target="_blank" rel="noopener">'
        f'<img loading="lazy" src="{relative}" alt="{e(label)}"></a>'
        f'<figcaption>{e(label)} · click to open image</figcaption></figure>'
        for i, (name, label, relative) in enumerate(choices))
    return f'<div class="gallery">{switch}<div class="plot-frame">{figures}</div></div>'


STYLE = """
<style>
:root{font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;color:#26313b;background:#fff}
*{box-sizing:border-box}body{margin:0}a{color:#215b85}button,select,input{font:inherit}button{cursor:pointer}[hidden]{display:none!important}
.site-header{max-width:1600px;margin:auto;min-height:66px;padding:0 28px;border-bottom:1px solid #dce1e5;display:flex;align-items:center;gap:24px}
.brand{font-weight:650}.site-section{color:#52616d}.local-label{margin-left:auto;color:#687582;font-size:.84rem}
.layout{max-width:1600px;margin:auto;display:grid;grid-template-columns:225px minmax(0,1fr);gap:30px;padding:30px 28px 70px}
.sidebar{border-right:1px solid #e2e6e9;padding-right:18px;position:sticky;top:20px;align-self:start;max-height:calc(100vh - 40px);overflow:auto}
.sidebar label,.selector label{font-size:12px;font-weight:600;color:#5c6872;letter-spacing:.04em;text-transform:uppercase}
.sidebar input,.selector select{width:100%;border:1px solid #cbd5de;border-radius:3px;background:#fff;padding:6px 8px;margin:4px 0 8px;color:#26313b}
.task-list{margin-top:8px}.task-item{display:flex;width:100%;justify-content:space-between;text-align:left;border:0;background:transparent;padding:5px 8px;color:#52616d;font-size:13px}
.task-item:hover,.task-item.active{background:#edf4f8}.task-item.active{font-weight:600;color:#215b85}.task-item small{color:#8a959e}
main{min-width:0;width:100%}
.task-intro{margin-bottom:20px}
.task-intro h2{font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-.5px;margin:4px 0 8px}.task-meta{color:#5c6872;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.task-prompt{white-space:pre-wrap;margin:0;max-width:100ch;color:#52616d;font-size:16px;line-height:1.6}
.task-prompt code{font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;background:#f8fafb;color:#263c4a;padding:1px 3px}
.prompt-toggle{display:none;border:0;background:transparent;color:#215b85;padding:4px 0;font-size:13px}
.comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
.compare-panel{background:#fff;border:1px solid #dce2e6;border-radius:4px;min-width:0;overflow:hidden}
.panel-heading{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem;padding:12px 14px 3px}
.panel-heading h3{margin:0;font-size:16px;font-weight:600}.panel-status{color:#687582;font-size:12px;text-align:right}
.panel-controls{display:grid;grid-template-columns:1.1fr 1.35fr .72fr;gap:8px;padding:0 14px 10px}
.selector{min-width:0}.selector select{margin-bottom:0;text-overflow:ellipsis}
.panel-content{border-top:1px solid #e0e5e9;padding:10px 14px 14px;min-height:370px}
.result-head{margin-bottom:.45rem}.result-kind{font-size:12px;color:#687582}
.plot-frame{height:clamp(300px,34vw,540px);background:#fff;border:1px solid #dce2e6;border-radius:4px;display:grid;place-items:center}
.plot-view{margin:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}
.plot-view a{display:flex;align-items:center;justify-content:center;min-height:0;flex:1;width:100%}
.plot-view img{max-width:100%;max-height:100%;object-fit:contain}.plot-view figcaption{font-size:12px;color:#687582;padding:4px}
.plot-empty,.choose-result{height:clamp(300px,34vw,540px);border:1px dashed #cbd5de;border-radius:4px;display:grid;place-items:center;text-align:center;color:#687582;padding:1rem}
.view-control{display:flex;align-items:center;justify-content:flex-end;gap:.5rem;font-size:12px;color:#52616d;margin-bottom:6px}
.view-control select{font:inherit;border:1px solid #cbd5de;border-radius:3px;background:#fff;padding:3px}
.result-links{font-size:.84rem;margin:.6rem 0;overflow-wrap:anywhere}.result-links a{margin-right:.8rem}
.program-drawer{margin:.7rem 0 0}.program-drawer summary{font-weight:700}
.summary-section,.details-section{margin-top:26px}.summary-section h2,.details-section h2{font-size:20px;font-weight:600;margin:0 0 8px}
.summary-note{color:#596976;font-size:14px;margin:0 0 8px}
.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;background:#fff;font-size:.88rem}
td,th{text-align:left;border-top:1px solid #e0e5e9;padding:8px 12px 8px 0;vertical-align:top;overflow-wrap:anywhere}
th{color:#5c6872;font-weight:600}#summary-table th:first-child,#summary-table td:first-child{width:170px;color:#52616d}
#summary-table th:not(:first-child),#summary-table td:not(:first-child){width:calc((100% - 170px)/2)}
.details-section{border-top:1px solid #e0e5e9;padding-top:20px}
details{border:1px solid #dce2e6;border-radius:4px;margin:8px 0;padding:8px 10px;background:#fff}
summary{cursor:pointer;font-weight:600;color:#215b85}details details{background:#f8fafb}
.detail-content{padding:.25rem .3rem}.detail-content h3{font-size:1rem;margin:1rem 0 .35rem}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:34rem;overflow:auto;background:#f8fafb;color:#263c4a;padding:12px;font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace}
.checks{padding-left:1.2rem}.checks li{margin:.2rem 0;overflow-wrap:anywhere}.fail{color:#a71e31}.unknown{color:#846000}.pass{color:#176637}
@media(max-width:1050px){.comparison{grid-template-columns:1fr}.plot-frame,.plot-empty,.choose-result{height:460px}}
@media(max-width:690px){.site-header{padding:12px 16px;min-height:0;gap:12px}.local-label{display:none}.layout{display:block;padding:16px}.sidebar{position:static;max-height:none;border-right:0;border-bottom:1px solid #e0e5e9;margin-bottom:18px;padding:0 0 10px}.task-list{display:flex;overflow:auto;gap:4px}.task-item{min-width:max-content;gap:8px}.panel-controls{grid-template-columns:1fr 1fr}.panel-controls .selector:last-child{grid-column:span 2}.plot-frame,.plot-empty,.choose-result{height:330px}.task-prompt:not(.expanded){display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;line-clamp:5;overflow:hidden}.prompt-toggle{display:block}}
</style>
"""


SCRIPT = """
const byPath = new Map(rows.map((row, index) => [row.path, {row, index}]));
const tasks = [...new Set(rows.map(row => row.task))];
const params = new URLSearchParams(location.hash.slice(1));
const state = {task: params.get('task') || (tasks.includes('scatter') ? 'scatter' : tasks[0]) || '', left: params.get('left') || '', right: params.get('right') || ''};
const sides = ['left', 'right'];
function taskRows(){return rows.filter(row => row.task === state.task)}
function preferred(options){return options.find(row => row.library === 'hmplot' && row.review === 'pass')
    || options.find(row => row.library === 'hmplot-js' && row.review === 'pass')
    || options.find(row => row.review === 'pass') || options[0]}
function defaults(){
  const options=taskRows(), first=preferred(options);
  const second=options.find(row => row.track === first?.track && row.library !== first.library && row.review === 'pass')
    || options.find(row => row.library !== first?.library && row.review === 'pass')
    || options.find(row => row.path !== first?.path);
  state.left=first?.path || '';
  state.right=second?.path || 'none';
}
if(!tasks.includes(state.task)){state.task=tasks[0] || '';defaults()}
else if(!params.has('left') && !params.has('right')) defaults();
function agentKey(row){return [row.agent,row.model,row.kind].join('\\u001f')}
function agentLabel(row){return row.kind === 'reference' ? 'Hand-written reference'
  : row.agent + (row.model ? ' / ' + row.model : '') + (row.kind === 'smoke' ? ' · smoke' : '')}
function nearest(options, previous){
  return options.find(row => row.agent === previous?.agent && row.model === previous?.model && row.kind === previous?.kind && row.index === previous?.index)
    || options.find(row => row.agent === previous?.agent && row.model === previous?.model && row.kind === previous?.kind)
    || options.find(row => row.index === previous?.index && row.review === 'pass')
    || options.find(row => row.review === 'pass') || options[0]
}
function setOptions(select, pairs, selected, placeholder){
  select.replaceChildren();
  if(placeholder) select.add(new Option(placeholder,''));
  for(const [value,label] of pairs) select.add(new Option(label,value));
  select.value=selected || '';
  select.disabled=!pairs.length;
}
function drawSide(side, options){
  let selected=byPath.get(state[side])?.row;
  if(selected && selected.task !== state.task) selected=null;
  const lib=document.getElementById(side+'-library');
  const agent=document.getElementById(side+'-agent');
  const rep=document.getElementById(side+'-rep');
  const libs=[...new Set(options.map(row => row.library))].sort((a,b) =>
    (a.startsWith('hmplot') ? -1 : 0) - (b.startsWith('hmplot') ? -1 : 0) || a.localeCompare(b));
  setOptions(lib,libs.map(value=>[value,value]),selected?.library,side==='right'?'Select library':null);
  lib.onchange=()=>{const candidates=options.filter(row=>row.library===lib.value);state[side]=nearest(candidates,selected)?.path || 'none';draw()};
  const libraryRows=options.filter(row=>row.library===selected?.library);
  const agents=[...new Map(libraryRows.map(row=>[agentKey(row),agentLabel(row)])).entries()];
  setOptions(agent,agents,selected ? agentKey(selected) : '',null);
  agent.onchange=()=>{const candidates=libraryRows.filter(row=>agentKey(row)===agent.value);state[side]=nearest(candidates,selected)?.path || 'none';draw()};
  const agentRows=libraryRows.filter(row=>selected && agentKey(row)===agentKey(selected));
  const reps=[...new Set(agentRows.map(row=>row.index))].sort((a,b)=>a-b);
  setOptions(rep,reps.map(value=>[String(value),'Run '+value]),selected ? String(selected.index) : '',null);
  rep.onchange=()=>{const next=agentRows.find(row=>String(row.index)===rep.value);if(next){state[side]=next.path;draw()}};
  const content=document.getElementById(side+'-content');
  content.replaceChildren();
  if(!selected){const p=document.createElement('div');p.className='choose-result';p.textContent=side==='right'?'Select a library to compare another result.':'No result for this task.';content.append(p);return null}
  const panel=document.getElementById('panel-'+byPath.get(selected.path).index);
  content.append(panel.content.cloneNode(true));
  const view=content.querySelector('.view-select');
  if(view) view.onchange=()=>content.querySelectorAll('.plot-view').forEach(figure=>{figure.hidden=figure.dataset.view!==view.value});
  return selected;
}
function outcome(row){
  if(!row)return '—';
  if(row.review==='blocked')return 'Blocked before run';
  if(row.kind==='reference')return row.review==='pass'?'Reviewed reference':row.review==='fail'?'Reference failed review':'Reference pending review';
  if(row.review==='pass' && row.success_within_rounds)return 'Reviewed success';
  if(row.review==='fail')return 'Reviewed failure';
  return row.review==='pending'?'Pending review':'No reviewed success';
}
function checkText(row){
  if(!row)return '—';
  if(!row.check_count)return 'No checks recorded';
  let label=row.passed_checks+' / '+row.check_count+' passed';
  if(row.unknown_checks)label+=' · unknown: '+row.unknown_checks;
  if(row.failed_checks)label+=' · failed: '+row.failed_checks;
  return label;
}
function tokenText(row){
  if(row.kind==='reference')return '—';
  if(row.usage_incomplete && !row.tokens)return 'Unknown';
  return row.tokens.toLocaleString()+(row.usage_incomplete?' (incomplete)':'');
}
function metricRows(left,right){
  const format=(row,fn)=>row?fn(row):'—';
  return [
    ['Library',format(left,r=>r.library),format(right,r=>r.library)],
    ['Agent / model',format(left,agentLabel),format(right,agentLabel)],
    ['Outcome',outcome(left),outcome(right)],
    ['Checks',checkText(left),checkText(right)],
    ['First try',format(left,r=>r.kind==='agent' && r.sessions ? (r.first_try?'Yes':'No') : '—'),
                 format(right,r=>r.kind==='agent' && r.sessions ? (r.first_try?'Yes':'No') : '—')],
    ['Attempts',format(left,r=>r.kind==='reference'?'—':String(r.sessions)),
                format(right,r=>r.kind==='reference'?'—':String(r.sessions))],
    ['Tokens',format(left,tokenText),format(right,tokenText)],
    ['Agent time',format(left,r=>r.kind==='reference'?'—':r.wall_seconds+' s'),
                  format(right,r=>r.kind==='reference'?'—':r.wall_seconds+' s')],
    ['Time to render',format(left,r=>r.render_seconds==null?'—':r.render_seconds+' s'),
                      format(right,r=>r.render_seconds==null?'—':r.render_seconds+' s')],
    ['Code lines',format(left,r=>r.lines_of_code?String(r.lines_of_code):'—'),
                  format(right,r=>r.lines_of_code?String(r.lines_of_code):'—')]
  ];
}
function drawSummary(left,right){
  const body=document.getElementById('summary-body');
  body.replaceChildren();
  for(const values of metricRows(left,right)){
    const tr=document.createElement('tr');
    values.forEach((value,index)=>{const cell=document.createElement(index?'td':'th');cell.textContent=value;tr.append(cell)});
    body.append(tr);
  }
}
function drawDetails(side,row){
  const drawer=document.getElementById(side+'-details');
  const content=drawer.querySelector('.detail-content');
  content.replaceChildren();
  drawer.hidden=!row;
  if(!row)return;
  drawer.querySelector('summary').textContent=(side==='left'?'A':'B')+' · '+row.library+' · '+agentLabel(row)+' · run '+row.index;
  content.append(document.getElementById('audit-'+byPath.get(row.path).index).content.cloneNode(true));
}
function draw(){
  const options=taskRows();
  if(state.left && !options.some(row=>row.path===state.left))state.left=preferred(options)?.path || '';
  if(state.right!=='none' && state.right && !options.some(row=>row.path===state.right))state.right='none';
  const prompt=document.getElementById('task-intro');prompt.replaceChildren();
  const template=document.getElementById('prompt-'+state.task);
  if(template)prompt.append(template.content.cloneNode(true));
  const toggle=prompt.querySelector('.prompt-toggle');
  if(toggle)toggle.onclick=()=>{
    const body=prompt.querySelector('.task-prompt');
    body.classList.toggle('expanded');
    toggle.textContent=body.classList.contains('expanded')?'Show less':'Show full prompt';
  };
  const left=drawSide('left',options),right=drawSide('right',options);
  drawSummary(left,right);drawDetails('left',left);drawDetails('right',right);
  document.querySelectorAll('.task-item').forEach(button=>button.classList.toggle('active',button.dataset.task===state.task));
  history.replaceState(null,'','#'+new URLSearchParams(state).toString());
}
function centerActiveTask(){
  if(!window.matchMedia('(max-width:690px)').matches)return;
  const nav=document.getElementById('tasks'), active=nav.querySelector('.task-item.active');
  if(!active)return;
  const listBox=nav.getBoundingClientRect(), activeBox=active.getBoundingClientRect();
  nav.scrollLeft+=activeBox.left-listBox.left-(listBox.width-activeBox.width)/2;
}
document.querySelectorAll('.task-item').forEach(button=>button.onclick=()=>{state.task=button.dataset.task;defaults();draw();centerActiveTask();window.scrollTo({top:0})});
document.getElementById('search').oninput=event=>{
  const query=event.target.value.toLowerCase();
  document.querySelectorAll('.task-item').forEach(button=>{
    button.hidden=!(button.dataset.task.toLowerCase().includes(query)||button.dataset.source.toLowerCase().includes(query));
  });
};
draw();
centerActiveTask();
window.addEventListener('resize',centerActiveTask);
"""


def make_report(root: Path) -> list[dict]:
    from run import _checks_html, _rounds_html, audit_dir

    rows, panels, audits = [], [], []
    counts = defaultdict(lambda: {'completed': 0, 'reviewed': 0, 'passed': 0,
                                  'tokens': 0, 'split_runs': 0, 'docs_tokens_est': 0})
    by_category = defaultdict(lambda: {'completed': 0, 'reviewed': 0, 'passed': 0})
    for path in sorted((root / 'runs').glob('*/*/*/result.json')):
        result = json.loads(path.read_text())
        folder = path.parent
        task = TASKS_BY_ID.get(result['task'], {})
        kind = result.get('kind', 'agent')
        track = result.get('track', 'python')
        agent = result.get('agent', 'Hand-written reference' if kind == 'reference' else 'Claude Code')
        model = result.get('model', '')
        checks = result.get('checks', [])
        metrics = result.get('metrics') or {}
        sessions = result.get('sessions', [])
        task_timeout = result.get('execution_status') == 'task_timeout'
        completed = (kind == 'agent' and bool(sessions) and bool(checks) and
                     not result.get('blocked_reason') and result.get('review') != 'blocked' and
                     not result.get('infrastructure_error') and
                     result.get('execution_status') not in ('interrupted', 'infrastructure_failure', 'session_limit') and
                     all((not session.get('is_error') and session.get('status', 'completed') == 'completed') or
                         (task_timeout and session.get('status') == 'timed_out')
                         for session in sessions))
        model_review = result.get('model_review') or {}
        # What went to reading HMPlot's docs and skill (an estimate; docs_usage.py says how).
        usage = docs_usage(audit_dir(folder), result.get('sessions', [])) if audit_dir(folder).is_dir() else None
        row = {'kind': kind, 'track': track, 'task': result['task'], 'source': result.get('source', task.get('source', 'hmplot')),
               'category': task.get('category', ''),
               'library': result['library'], 'actual_library': result.get('actual_library', result['library']),
               'agent': agent, 'agent_version': result.get('agent_version', ''), 'model': model,
               'index': result['index'], 'path': folder.relative_to(root).as_posix(),
               'data_access': result.get('data_access', task.get('access', 'provided')),
               'sessions': len(result.get('sessions', [])),
               'tokens': sum(s.get('tokens') or 0 for s in result.get('sessions', [])),
               'usage_incomplete': bool(result.get('usage_incomplete') or any(
                   session.get('usage_complete') is False or session.get('tokens') is None
                   for session in result.get('sessions', []))),
               'wall_seconds': round(sum(s.get('wall_seconds', 0) for s in result.get('sessions', [])), 2),
               'first_try': result.get('first_try', False),
               'first_attempt_review': result.get('first_attempt_review', 'unknown'),
               'first_attempt_correct': result.get('first_attempt_correct'),
               'reviewer': result.get('reviewer', ''),
               'success_within_rounds': result.get('success', False),
               'automatic_success': result.get('automatic_success', False),
               'review': result.get('review', 'pending'),
               'review_source': result.get('review_source', 'human' if result.get('review') in ('pass', 'fail') else ''),
               'model_verdict': model_review.get('verdict', ''),
               'model_agrees_with_checks': model_review.get('agrees_with_checks', ''),
               'benchmark_completed': completed,
               'lines_of_code': metrics.get('lines_of_code', 0),
               'render_seconds': metrics.get('time_to_first_render_s'),
               'check_count': len(checks),
               'passed_checks': sum(check.get('status') == 'pass' for check in checks),
               'failed_checks': '; '.join(c['name'] for c in checks if c['status'] == 'fail'),
               'unknown_checks': '; '.join(c['name'] for c in checks if c['status'] == 'unknown'),
               'docs_reads': usage['docs_reads'] if usage else '',
               'docs_tokens_est': usage['docs_tokens_est'] if usage else '',
               'other_tokens_est': usage['other_tokens_est'] if usage else '',
               'steps_before_first_write': usage['steps_before_first_write'] if usage else ''}
        rows.append(row)
        number = len(rows) - 1
        if completed:
            for bucket in (counts[(track, result['library'])], by_category[(row['category'], track, result['library'])]):
                bucket['completed'] += 1
                bucket['reviewed'] += int(result.get('review') in ('pass', 'fail'))
                bucket['passed'] += int(result.get('review') == 'pass' and bool(result.get('success')))
            bucket = counts[(track, result['library'])]
            bucket['tokens'] += row['tokens']
            if usage:
                bucket['split_runs'] += 1
                bucket['docs_tokens_est'] += usage['docs_tokens_est']
        audit = audit_dir(folder) if audit_dir(folder).is_dir() else folder
        saved = audit / 'task-prompt.txt'
        task_prompt = saved.read_text() if saved.is_file() else (folder / 'task.txt').read_text() if (folder / 'task.txt').is_file() else result.get('effective_prompt', '')
        original = (result.get('original_prompt') or
                    ((audit / 'original-prompt.txt').read_text() if (audit / 'original-prompt.txt').is_file() else None) or
                    (original_prompt(task, root) if task.get('source') == 'matplotbench' else None) or
                    task.get('prompt', ''))
        program = folder / ('solution.svelte' if track == 'javascript' else 'solution.py')
        code = program.read_text() if program.is_file() else 'No final program was written.'
        outputs = ' · '.join(file_link(root, file, file.name) for file in sorted((folder / 'output').glob('*')) if file.is_file()) if (folder / 'output').is_dir() else ''
        program_link = file_link(root, program, 'Open source file') if program.is_file() else ''
        fetches = result.get('fetch_calls', [])
        guidance = result.get('guidance', LIBRARIES.get(row['library'], {}))
        guidance_text = ('Local HMPlot docs: ' + ('yes' if guidance.get('docs') else 'no') +
                         ' · HMPlot skill: ' + ('yes' if guidance.get('skill') else 'no'))
        provenance = provenance_table(result.get('provenance') or
                                      (json.loads((folder / 'provenance.json').read_text()) if (folder / 'provenance.json').is_file() else []))
        kind_label = 'Hand-written reference' if kind == 'reference' else 'Smoke test' if kind == 'smoke' else 'Benchmark run'
        panel = (f'<template id="panel-{number}"><div class="result-head">'
                 f'<span class="result-kind">{e(kind_label)} · {e(row["review"])}</span></div>'
                 + plot_gallery(root, folder)
                 + (f'<p class="result-links">{outputs}</p>' if outputs else '<p class="result-links">No final files.</p>')
                 + detail('Final program', (f'<p>{program_link}</p>' if program_link else '') +
                          '<pre><code>' + e(code) + '</code></pre>').replace('<details>', '<details class="program-drawer">', 1)
                 + '</template>')
        panels.append(panel)
        problems = ''.join(f'<li>{e(item)}</li>' for item in model_review.get('problems', []))
        model_html = ('<p>No model review yet.</p>' if not model_review else
                      f'<p>Model review: {e(model_review.get("verdict"))} · checks {e(model_review.get("checks_verdict", ""))} · '
                      + ('agrees' if model_review.get('agrees_with_checks') else 'disagrees, needs a human review')
                      + f' · {e(model_review.get("agent", ""))} {e(model_review.get("model", ""))}. '
                      f'{e(model_review.get("reason", ""))}</p>' + (f'<ul>{problems}</ul>' if problems else ''))
        usage_html = ('<p>Docs reading: not recorded (this trace has no tool steps).</p>' if not usage else
                      f'<p>Docs reading: {usage["docs_reads"]} command(s) over {len(usage["docs_files"])} file(s), '
                      f'{usage["docs_chars"]:,} characters printed; {usage["steps_before_first_write"]} of '
                      f'{usage["steps"]} steps before the first write. Estimated tokens: {usage["docs_tokens_est"]:,} '
                      f'for the docs, {usage["other_tokens_est"]:,} for the rest ({e(usage["method"])}).</p>')
        audit_body = (
            f'<p>Selected library: {e(row["library"])} · Library used: {e(row["actual_library"])} · '
            f'Track: {e(track)} · Agent version: {e(row["agent_version"] or "—")} · '
            f'Model: {e(model or "—")} · {row["sessions"]} session(s) · {row["tokens"]} tokens · '
            f'{row["wall_seconds"]} s agent time</p>'
            + ('<p>Token usage is incomplete; recorded totals may omit part of this run.</p>'
               if row['usage_incomplete'] else '') +
            f'<p>Review: {e(row["review"])}{" (" + e(row["review_source"]) + ")" if row["review_source"] else ""}. '
            f'{e(result.get("review_note", result.get("blocked_reason", "")))}</p>'
            + model_html + usage_html +
            f'<h3>Dataset provenance</h3><p>Access mode: <strong>{e(row["data_access"])}</strong></p>{provenance}'
            + detail('Fetch calls', '<pre>' + e(json.dumps(fetches, indent=2)) + '</pre>')
            + f'<h3>Prompts and guidance</h3><p>{e(guidance_text)}</p>'
            + detail('Original task prompt', '<pre>' + e(original) + '</pre>')
            + detail('Full initial prompt', '<pre>' + e(task_prompt) + '</pre>')
            + '<h3>Attempts and corrections</h3>' + _rounds_html(root, folder, result)
            + '<h3>Final result</h3>'
            + (f'<p>Final files: {outputs}</p>' if outputs else '<p>No final files.</p>')
            + _checks_html(checks)
            + detail('Final metrics', '<pre>' + e(json.dumps(metrics, indent=2)) + '</pre>')
            + f'<p>{file_link(root, path, "Open full result JSON")}</p>')
        audits.append(f'<template id="audit-{number}">{audit_body}</template>')
    (root / 'results.json').write_text(json.dumps(rows, indent=2) + '\n')
    with (root / 'results.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else ['task', 'library', 'index'])
        writer.writeheader()
        writer.writerows(rows)
    tasks = sorted({row['task'] for row in rows})
    task_buttons = ''.join(
        f'<button type="button" class="task-item" data-task="{e(task_id)}" data-source="{e(TASKS_BY_ID.get(task_id, {}).get("source", ""))}">'
        f'{e(task_id)} <small>{sum(row["task"] == task_id for row in rows)}</small></button>' for task_id in tasks)
    prompts = ''.join(
        f'<template id="prompt-{e(task_id)}"><div class="task-meta">{e(TASKS_BY_ID.get(task_id, {}).get("source", "local"))}'
        f' · {e(TASKS_BY_ID.get(task_id, {}).get("category", "task"))}'
        f' · {e(TASKS_BY_ID.get(task_id, {}).get("access", "provided"))} data</div>'
        f'<h2>{e(task_id)}</h2><div class="task-prompt">{prompt_html(TASKS_BY_ID.get(task_id, {}).get("prompt", "Prompt unavailable for this task."))}</div>'
        f'<button class="prompt-toggle" type="button">Show full prompt</button></template>'
        for task_id in tasks)
    aggregate = ('<p>No completed agent benchmark trials yet. Smoke tests, references, and interrupted trials are excluded.</p>'
                 if not counts else
                 '<p>Completed trials awaiting review are included in the total but have no reviewed score. '
                 'Smoke tests, references, and interrupted trials are excluded.</p>'
                 '<div class="table-scroll"><table><tr><th>Track</th><th>Library</th><th>Reviewed successes</th>'
                 '<th>Reviewed trials</th><th>Completed trials</th><th>Mean tokens</th>'
                 '<th>Mean docs tokens (est.)</th><th>Mean other tokens (est.)</th></tr>' +
                 ''.join(f'<tr><td>{e(track)}</td><td>{e(lib)}</td><td>{value["passed"]}</td>'
                         f'<td>{value["reviewed"]}</td><td>{value["completed"]}</td>'
                         f'<td>{round(value["tokens"] / value["completed"]):,}</td>'
                         + (f'<td>{round(value["docs_tokens_est"] / value["split_runs"]):,}</td>'
                            f'<td>{round(value["tokens"] / value["completed"] - value["docs_tokens_est"] / value["split_runs"]):,}</td>'
                            if value['split_runs'] == value['completed'] else '<td>—</td><td>—</td>')
                         + '</tr>'
                         for (track, lib), value in sorted(counts.items())) + '</table></div>'
                 '<p>Docs tokens are an estimate from the traces (docs_usage.py): Codex reports one usage total '
                 'per turn, not per request. "—" where a run\'s trace records no tool steps.</p>'
                 '<h3>By category</h3><div class="table-scroll"><table><tr><th>Category</th><th>Track</th><th>Library</th>'
                 '<th>Reviewed successes</th><th>Reviewed trials</th><th>Completed trials</th></tr>' +
                 ''.join(f'<tr><td>{e(category or "—")}</td><td>{e(track)}</td><td>{e(lib)}</td><td>{value["passed"]}</td>'
                         f'<td>{value["reviewed"]}</td><td>{value["completed"]}</td></tr>'
                         for (category, track, lib), value in sorted(by_category.items())) + '</table></div>')
    controls = ''.join(
        f'<section class="compare-panel" aria-label="Comparison {label}"><div class="panel-heading"><h3>{label}</h3>'
        f'<span class="panel-status">{text}</span></div><div class="panel-controls">'
        f'<div class="selector"><label for="{side}-library">Library</label><select id="{side}-library"></select></div>'
        f'<div class="selector"><label for="{side}-agent">Agent / model</label><select id="{side}-agent"></select></div>'
        f'<div class="selector"><label for="{side}-rep">Replication</label><select id="{side}-rep"></select></div>'
        f'</div><div id="{side}-content" class="panel-content"></div></section>'
        for side, label, text in (('left', 'A', 'First result'), ('right', 'B', 'Compare with')))
    page = ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>HMPlot agent-task eval</title>' + STYLE +
            '<header class="site-header"><span class="brand">HMPlot</span><span class="site-section">Agent-task eval</span><span class="local-label">Local report</span></header>'
            '<div class="layout"><aside class="sidebar"><label for="search">Search tasks</label>'
            '<input id="search" type="search" placeholder="Task or source"><nav id="tasks" class="task-list" aria-label="Tasks">' +
            task_buttons + '</nav></aside><main>'
            '<section id="task-intro" class="task-intro" aria-label="Task prompt"></section>'
            '<section class="comparison" aria-label="Side by side comparison">' + controls + '</section>'
            '<section class="summary-section"><h2>Summary</h2>'
            '<p class="summary-note">Reference solutions and smoke tests are shown for inspection. Benchmark totals distinguish reviewed results from completed trials awaiting review.</p>'
            '<div class="table-scroll"><table id="summary-table"><thead><tr><th>Metric</th><th>A</th><th>B</th></tr></thead>'
            '<tbody id="summary-body"></tbody></table></div></section>'
            '<section class="details-section"><h2>Full details</h2>'
            '<details id="left-details"><summary>A · run details</summary><div class="detail-content"></div></details>'
            '<details id="right-details"><summary>B · run details</summary><div class="detail-content"></div></details>'
            '<details><summary>Benchmark totals by track</summary>' + aggregate + '</details></section>'
            '</main></div>' + prompts + ''.join(panels) + ''.join(audits) +
            '<script>const rows=' + json.dumps(rows).replace('<', '\\u003c') + ';' + SCRIPT + '</script></html>')
    (root / 'report.html').write_text(page)
    return rows
