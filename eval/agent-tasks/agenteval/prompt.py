"""Identical task instructions across conditions, with only a short library preamble."""

from .libraries import LIBRARIES
import re


def make_prompt(task: dict, library: str) -> str:
    condition = LIBRARIES[library]
    docs = ("Read hmplot-skill/SKILL.md first: its index names the reference page and the keywords for each "
            "task. Search the docs for those keywords and read the lines the search finds, a page at a time.\n"
            if condition.get("skill") and not condition.get("optional") else "")
    track = condition.get("track", "python")
    deliverable = ("Write a complete Python program at solution.py. Running it with the provided Python interpreter "
                   if track == "python" else
                   "Write a complete Svelte 5 component at solution.svelte. The harness mounts and bundles it with the preinstalled JavaScript packages; the resulting build ")
    access = ("Request each named source URL using the fetch_data tool. It copies the pinned snapshot into data/; "
              "the only accepted URLs and destinations are those named here. " if task["access"] == "agent_fetch" else "")
    sources = "\n".join(f"Source: {source['url']} -> data/{source['destination']}" for source in task.get("sources", []))
    return (
        f"{condition['preamble']}\n{docs}\n"
        f"Task: {task['prompt']}\n{sources}\n\n"
        f"{access}{deliverable}"
        "must create output/chart.html (one standalone, self-contained HTML page). PDF tasks must also "
        "create output/figure.pdf. The data is in data/. All packages are already installed; do not install "
        "anything, use the network, or change files outside this directory. "
        "Write or edit the solution and inspect local files as needed, but do not execute the solution "
        "or launch Python, a browser, or a development server yourself. The harness alone executes "
        "and renders the program after your response, then provides checks and a screenshot if a "
        "correction is needed. End with a brief explanation."
    )


def correction_prompt(result: dict, track: str = "python") -> str:
    def detail(check):
        text = str(check.get('detail', check['status']))
        # Preserve diagnostic context without sending an entire embedded dataset.
        # Full reports stay in the trial's hmplot-check*.json and round audit.
        return re.sub(r'data:[^\s\"\'<>]*;base64,[A-Za-z0-9+/=]+',
                      '[embedded data URL omitted; see saved diagnostic report]', text)

    failures = [f"- {check['name']}: {detail(check)}" for check in result["checks"]
                if check["status"] != "pass"]
    program = "solution.svelte" if track == "javascript" else "solution.py"
    # hmplot's lints and warnings: not failures, but what the agent would see from `hmplot check`.
    advisories = [f"- {line}" for line in (result.get("metrics") or {}).get("hmplot_advisories") or []][:12]
    notes = ("\nhmplot check also noted (not failures):\n" + "\n".join(advisories)) if advisories else ""
    return (f"The previous solution did not pass these checks. Edit {program} and try again. "
            "The harness will run it after this turn.\n" + "\n".join(failures) + notes +
            f"\nThe browser screenshot is {result.get('screenshot', 'unavailable')}."
            " Do not install packages or access the network.")
