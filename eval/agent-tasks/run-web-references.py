"""Build isolated packaged Svelte references; never expose these sources to evaluated agents."""
from pathlib import Path
import argparse
import json
import shutil
from agenteval.data import place
from agenteval.tasks import TASKS_BY_ID
from agenteval.js import evaluate_js
from agenteval.web_reference_checks import check_reference

HERE = Path(__file__).resolve().parent

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path)
    parser.add_argument('--tasks',required=True,help='Comma-separated reference task IDs')
    parser.add_argument('--build-only',action='store_true')
    parser.add_argument('--reference-only',action='store_true',help='Build and run independent reference oracles without repeating generic harness gestures')
    options=parser.parse_args()
    root=options.root.resolve()
    chrome=json.loads((root/'versions.json').read_text())['tools']['chrome']
    for name in options.tasks.split(','):
        task=TASKS_BY_ID[name]
        run=root/'runs'/'web-references'/name/'reference'
        run.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(HERE/'references'/name/'hmplot.svelte',run/'solution.svelte')
        shutil.copyfile(HERE/'references/web-utils.js',run/'web-utils.js')
        place(task['data'],root/'data-cache',run)
        result=evaluate_js(task,'hmplot-js-web-docs',run,root,chrome,build_only=options.build_only or options.reference_only)
        (run/'result.json').write_text(json.dumps(result,indent=2)+'\n')
        print(name,json.dumps(result),flush=True)
        if not options.build_only and (run/'output/chart.html').is_file():
            print(name,json.dumps(check_reference(name,run,chrome)),flush=True)

if __name__=='__main__':main()
