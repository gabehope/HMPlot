"""Serial production-page benchmarks. Never equate a fresh context with a cold shader cache."""
from __future__ import annotations
import argparse
import hashlib
import json
import platform
import shutil
import subprocess
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
from playwright.sync_api import sync_playwright
from agenteval.js import evaluate_js

HERE=Path(__file__).resolve().parent
SCENARIOS={
    'taxi-explorer':('counter','Hour',0,23),
    'sensor-wall':('overview','Start day',0,150),
    'galaxy-slices':('primary','Maximum height',.1,2),
    'wealth-health-trails':('primary','Year',1950,2020),
    'html-attachment':('primary','Anchor',1,9),
    'rebased-returns':('primary',None,0,0),
}

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def summary(values):
    return {'n':len(values),'mean':float(np.mean(values)),'p50':float(np.percentile(values,50)),
            'p95':float(np.percentile(values,95)),'min':float(min(values)),'max':float(max(values))} if values else {'n':0}

# whenSettled is the supported corresponding-draw barrier. rAF merely observes
# completed-frame counters; rAF ticks themselves are never counted as plot frames.
SAMPLE=r'''async ({handle,label,low,high,duration}) => {
  const plot=window.referencePlots[handle], handles=[...new Set(Object.values(window.referencePlots))];
  const frame=()=>plot.getDiagnostics().completedFrame;
  const latencies=[], intervals=[], counts=[];
  let running=true,last=performance.now(),previous=frame(),startCount=previous;
  const sampleStart=last;
  function observe(now){
    const current=frame();
    if(current>previous){intervals.push((now-last)/(current-previous));counts.push(current-previous);last=now;previous=current;}
    if(running)requestAnimationFrame(observe);
  }
  requestAnimationFrame(observe);
  let i=1;
  while(performance.now()-sampleStart<duration){
    const value=low+(high-low)*((i++%31)/30), started=performance.now(), before=frame();
    if(label){
      const input=[...document.querySelectorAll('input')].find(e=>e.getAttribute('aria-label')===label);
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      const previousValue=input.value;setter.call(input,String(value));if(input.value===previousValue){await new Promise(requestAnimationFrame);continue;}input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    }else{
      const canvas=document.querySelector('.canvas'),box=canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:box.left+box.width*(.2+.6*((i%31)/30)),clientY:box.top+box.height*.5}));
    }
    let timeout;
    try {
      await Promise.race([(async()=>{await Promise.all(handles.map(h=>h.whenSettled())); while(frame()<=before) await new Promise(requestAnimationFrame);})(),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('corresponding draw timed out')),30000))]);
    } finally { clearTimeout(timeout); }
    latencies.push(performance.now()-started);
  }
  running=false;
  const elapsed=performance.now()-sampleStart,completed=frame()-startCount;
  return {observedHandle:handle,elapsed,completed,completedFps:completed*1000/elapsed,latencies,intervals,observedFrameIncrements:counts};
}'''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--interactions-only',action='store_true',help='Reuse recorded startup samples after validating production-page hashes')
    options=parser.parse_args();root=options.root.resolve();options.out.mkdir(parents=True,exist_ok=True)
    versions=json.loads((root/'versions.json').read_text());chrome=versions['tools']['chrome']
    runs=root/'runs/web-references'
    fixture=runs/'html-attachment/reference';fixture.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(HERE/'references/html-attachment.svelte',fixture/'solution.svelte')
    shutil.copyfile(HERE/'references/web-utils.js',fixture/'web-utils.js')
    if not options.interactions_only:
        built=evaluate_js({'timeout':180},'hmplot-js-web-docs',fixture,root,chrome,build_only=True)
        assert all(c['status']=='pass'for c in built['checks']),built
    pages={p.parent.parent.parent.name:p for p in sorted(runs.glob('*/reference/output/chart.html'))}
    assert len(pages)==16,pages.keys()
    report={'schema':1,'date':datetime.now(timezone.utc).isoformat(),
            'hardware':subprocess.check_output(['sysctl','-n','machdep.cpu.brand_string'],text=True).strip(),
            'memory_bytes':int(subprocess.check_output(['sysctl','-n','hw.memsize'],text=True)),
            'platform':platform.platform(),'dpr':2,'viewport':[1280,1000],
            'methodology':{'startup':'navigation through first completed draws for every mounted plot; five fresh contexts per production page',
              'shader_cache':'Shared OS/Metal cache is not cleared. Fresh-page startup is measured; genuinely cold shader compilation is not measured.',
              'interactions':'Two-second warmup, then three serial samples of at least five seconds. Each input waits for corresponding completed draws through public whenSettled barriers.',
              'frame_times':'CPU-observed intervals between completed draws, sampled by rAF; not GPU execution durations. Multiple increments in one observation share the interval. Counters observe the primary plot, except the sensor overview and taxi count plot; latency waits for all exposed linked handles.',
              'latency':'Browser performance.now from native input dispatch through public whenSettled across exposed linked handles and an explicit subsequent completed-frame counter advance; includes preparation and draw.'},
            'toolchain':versions,'artifacts':{name:digest(path)for name,path in pages.items()},'startup':{},'interactions':{}}
    if options.interactions_only:
        previous=json.loads((options.out/'measurements.json').read_text())
        assert previous['artifacts']==report['artifacts'], 'Production pages changed; rerun startup measurements'
        report['startup']=previous['startup']
        report['startup_recorded_at']=previous.get('startup_recorded_at',previous['date'])
    def save(): (options.out/'measurements.json').write_text(json.dumps(report,indent=2)+'\n')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--enable-unsafe-webgpu'])
        report['browser']=browser.version
        for name,path in pages.items():
            if name=='html-attachment' or options.interactions_only:continue
            measurements=[]
            for repetition in range(5):
                context=browser.new_context(viewport={'width':1280,'height':1000},device_scale_factor=2)
                page=context.new_page();page.goto(path.as_uri(),wait_until='load')
                page.wait_for_function("() => document.querySelectorAll('.canvas').length && !document.querySelector('.canvas[aria-busy=\"true\"]') && !document.querySelector('main')?.innerText.includes('Loading')",timeout=60000)
                elapsed=page.evaluate('performance.now()')
                inspection=page.evaluate('window.hmplotInspect()');assert inspection['ready'],inspection['errors']
                if repetition==0:page.screenshot(path=str(options.out/f'{name}-startup.png'),full_page=True)
                measurements.append({'milliseconds':elapsed,'plots':len(inspection['plots'])})
                context.close()
            report['startup'][name]={'samples':measurements,'milliseconds':summary([m['milliseconds']for m in measurements])};save();print('startup',name,flush=True)
        for name,(handle,label,low,high) in SCENARIOS.items():
            context=browser.new_context(viewport={'width':1280,'height':1000},device_scale_factor=2)
            page=context.new_page();page.goto(pages[name].as_uri(),wait_until='load');page.wait_for_function('window.hmplotInspect !== undefined')
            inspection=page.evaluate('window.hmplotInspect()');assert inspection['ready'],inspection['errors']
            config={'handle':handle,'label':label,'low':low,'high':high,'duration':2000}
            page.evaluate(SAMPLE,config)
            config['duration']=5000;samples=[]
            for _ in range(3):
                result=page.evaluate(SAMPLE,config)
                result['input_to_draw_ms']=summary(result['latencies']);result['frame_interval_ms']=summary(result['intervals']);samples.append(result)
            page.screenshot(path=str(options.out/f'{name}-interaction.png'),full_page=True)
            report['interactions'][name]=samples;save();context.close();print('interaction',name,flush=True)
        browser.close()
    lines=['# Web reference measurements','',f"Recorded {report['date']} on {report['hardware']}, {report['platform']}, Chrome {report['browser']}; DPR 2.",'',*report['methodology'].values(),'','| Reference | Fresh-page startup mean (ms) | p95 (ms) |','| --- | ---: | ---: |']
    for name,result in report['startup'].items():
        s=result['milliseconds'];lines.append(f"| {name} | {s['mean']:.1f} | {s['p95']:.1f} |")
    lines+=['','| Interaction | Mean input-to-draw (ms) | Completed draws/s | p95 observed frame interval (ms) |','| --- | ---: | ---: | ---: |']
    for name,samples in report['interactions'].items():
        latency=summary([v for s in samples for v in s['latencies']]);interval=summary([v for s in samples for v in s['intervals']]);fps=np.mean([s['completedFps']for s in samples])
        lines.append(f"| {name} | {latency['mean']:.1f} | {fps:.1f} | {interval.get('p95',float('nan')):.1f} |")
    lines+=['','Raw samples, artifact SHA256 hashes, and toolchain records are in `measurements.json`. These are measurements of these implementations on this machine, not universal throughput claims.']
    (options.out/'README.md').write_text('\n'.join(lines)+'\n')

if __name__=='__main__':main()
