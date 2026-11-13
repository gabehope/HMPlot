"""The libraries (conditions) the eval compares, and what each environment installs.

A condition is a library plus what the agent gets with it. Every condition gets the same task
prompt; only its preamble (a short paragraph naming the library, and for HMPlot where its docs
are) differs. HMPlot runs with its docs and its skill ("hmplot"), and cold ("hmplot-cold", the
R4.4 knowledge-lag check). The others run cold, as agents meet them today.

The default comparison (TODO Stage 131) is HMPlot against the agent's free choice: "hmplot" and
"free" on every prompt (Python), "hmplot-js" and "free-js" (JavaScript), and "hmplot-cold" on a
small sample. Free choice offers the usual libraries without HMPlot, or none: a chart written
by hand is a free-choice result too. The per-library conditions stay available to a config.
"""

from __future__ import annotations

# The harness's own environment (never given to an agent).
HARNESS_PACKAGES = ["playwright>=1.50", "pymupdf>=1.24", "pillow>=10"]

# In every environment: the data packages any of the tasks' programs reads data with.
COMMON_PACKAGES = ["numpy>=1.26", "pandas>=2.2", "pyarrow>=17", "scipy>=1.13"]

# The baselines (OPEN-SOURCE-PLAN R2.9's table), with the extras their exports need: Kaleido for
# Plotly's PNG/PDF, vl-convert for Altair's PNG/PDF and inline HTML, VegaFusion for Altair over
# more than 5,000 rows, geopandas for the map libraries, glfw so fastplotlib imports (it needs a
# window toolkit), PyVista's jupyter extra (trame) for its HTML export. Seaborn, because agents
# reach for it on the basics; PyVista, the categories table's 3D comparison.
BASELINE_PACKAGES = [
    "matplotlib>=3.9", "seaborn>=0.13",
    "plotly>=6", "kaleido>=1", "dash>=3",
    "altair>=5.4", "vl-convert-python>=1.7", "vegafusion>=2",
    "holoviews>=1.20", "hvplot>=0.11", "datashader>=0.17", "panel>=1.5", "bokeh>=3.6",
    "lonboard>=0.10", "pydeck>=0.9", "geopandas>=1", "shapely>=2",
    "fastplotlib>=0.5", "glfw>=2.7",
    "mosaic-widget>=0.17", "duckdb>=1.1",
    "pyvista[jupyter]>=0.44",
    "ipywidgets>=8", "anywidget>=0.9",
]

# TODO 133.7 (2026-10-12): the skill and one small reference page per component, rather than
# the whole-docs files the pilot's agents printed first (token counts from here on are not
# comparable with the pilot's).
HMPLOT_DOCS = (
    "Its documentation is in the folder `hmplot-docs/` here: each component has a short page, "
    "`hmplot-docs/reference/python/<name>.md` (for example `reference/python/bar.md`), and "
    "`hmplot-docs/llms.txt` lists every page with a one-line summary (paths relative to that "
    "folder). `hmplot-docs/llms-full.txt` (every page) and `hmplot-docs/reference/api.md` (every "
    "signature) are large: search them rather than printing them."
)

# id: name, the environment its runs use, the preamble, and what the run directory gets.
# `exports` is what the library can write, as far as known before setup (capabilities.py checks
# HTML and PDF with a tiny figure in the baselines environment and versions.json records it):
# True, False, or a note. A task whose output a library cannot write is still run: the agent may
# find a way, and a library that cannot do a task gets that as its result.
LIBRARIES: dict[str, dict] = {
    "hmplot": {
        "name": "HMPlot (docs and skill)",
        "env": "hmplot",
        "preamble": "Use HMPlot (the Python package `hmplot`, imported as `import hmplot as hm`) for this task. "
                    "Render the chart with HMPlot marks and submit its live page using hm.export_html. "
                    "Do not substitute a custom SVG/canvas chart or create an unused HMPlot object. " + HMPLOT_DOCS,
        "docs": True,
        "skill": True,
        "exports": {"html": True, "pdf": True},
    },
    "hmplot-cold": {
        "name": "HMPlot (cold)",
        "env": "hmplot",
        "preamble": "Use HMPlot (the Python package `hmplot`, imported as `import hmplot as hm`) for this task.",
        "docs": False,
        "skill": False,
        "exports": {"html": True, "pdf": True},
    },
    "free": {
        "name": "Agent's free choice",
        "env": "baselines",
        "preamble": ("Use whichever installed Python plotting library fits the task best, or none if you "
                     "prefer to write the chart yourself."),
        "exports": {"html": "depends on the choice", "pdf": "depends on the choice"},
    },
    "plotly": {
        "name": "Plotly",
        "env": "baselines",
        "preamble": "Use Plotly (the Python package `plotly`) for this task.",
        "exports": {"html": True, "pdf": "Kaleido (draws in Chrome)"},
    },
    "altair": {
        "name": "Altair",
        "env": "baselines",
        "preamble": "Use Altair (the Python package `altair`, Vega-Lite) for this task.",
        "exports": {"html": True, "pdf": "vl-convert"},
    },
    "holoviz": {
        "name": "HoloViz",
        "env": "baselines",
        "preamble": "Use the HoloViz tools (hvPlot, HoloViews, Datashader, Panel, with Bokeh) for this task.",
        "exports": {"html": "a static save: Datashader's re-aggregation and Python callbacks need a server",
                    "pdf": "HoloViews' Matplotlib backend; none from Bokeh"},
    },
    "lonboard": {
        "name": "Lonboard",
        "env": "baselines",
        "preamble": "Use Lonboard (the Python package `lonboard`) for this task.",
        "exports": {"html": True, "pdf": False},
    },
    "pydeck": {
        "name": "pydeck",
        "env": "baselines",
        "preamble": "Use pydeck (the Python package `pydeck`, deck.gl) for this task.",
        "exports": {"html": True, "pdf": False},
    },
    "fastplotlib": {
        "name": "fastplotlib",
        "env": "baselines",
        "preamble": "Use fastplotlib (the Python package `fastplotlib`) for this task.",
        "exports": {"html": False, "pdf": False},
    },
    "mosaic": {
        "name": "Mosaic (vgplot)",
        "env": "baselines",
        "preamble": ("Use Mosaic (vgplot, over DuckDB) for this task: from Python with the `mosaic_widget` "
                     "package, or its JavaScript packages in the page."),
        "exports": {"html": "no export from mosaic-widget; a page that loads Mosaic's JavaScript", "pdf": False},
    },
    "matplotlib": {
        "name": "Matplotlib",
        "env": "baselines",
        "preamble": "Use Matplotlib (the Python package `matplotlib`) for this task.",
        "exports": {"html": "an image in a page (no interaction)", "pdf": True},
    },
    "pyvista": {
        "name": "PyVista",
        "env": "baselines",
        "preamble": "Use PyVista (the Python package `pyvista`) for this task.",
        "exports": {"html": "export_html (needs trame/vtk.js)", "pdf": "save_graphic (vector PDF of a 3D scene, limited)"},
    },
}

# The data-pipeline comparison (TODO 144): the same docs and skill, written either with nested
# transform blocks or with chained pipelines (hm.Data(df).filter(...).group_by(...).agg(...)).
# Both doc sets come from one script (npm run build:llm-docs writes build-llm/standard and
# build-llm/fluent), so they differ only in how pipelines are written; the skills are
# skills/hmplot and the generated eval/agent-tasks/variants/fluent/skill. The preamble is
# HMPlot's, word for word.
LIBRARIES["hmplot-standard"] = {
    **LIBRARIES["hmplot"], "name": "HMPlot (nested-pipeline docs)",
    "docs_dir": "build-llm/standard", "skill_dir": "skills/hmplot",
}
LIBRARIES["hmplot-fluent"] = {
    **LIBRARIES["hmplot"], "name": "HMPlot (chained-pipeline docs)",
    "docs_dir": "build-llm/fluent", "skill_dir": "eval/agent-tasks/variants/fluent/skill",
}

LIBRARIES["free-baselines"] = {
    **LIBRARIES["free"], "name": "Free choice (Python baselines)",
}
LIBRARIES["free-all"] = {
    "name": "Free choice (all Python libraries)", "env": "all",
    "preamble": "Use whichever installed Python plotting library fits the task best. HMPlot is also installed, and optional local documentation is in hmplot-docs/.",
    "docs": True, "skill": False,
    "exports": {"html": "depends on choice", "pdf": "depends on choice"},
}
LIBRARIES.update({
    "hmplot-js": {"name": "HMPlot JavaScript", "track": "javascript", "env": "javascript",
                  "preamble": "Use HMPlot's JavaScript Svelte components. Its local docs are in hmplot-docs/.",
                  "docs": True, "skill": True},
    "deckgl": {"name": "deck.gl", "track": "javascript", "env": "javascript",
               "preamble": "Use deck.gl for this JavaScript task."},
    "observable-plot": {"name": "Observable Plot", "track": "javascript", "env": "javascript",
                        "preamble": "Use Observable Plot for this JavaScript task."},
    "free-js-baselines": {"name": "Free choice (JavaScript baselines)", "track": "javascript",
                          "env": "javascript", "preamble": "Use either installed deck.gl or Observable Plot, whichever fits best."},
    "free-js": {"name": "Agent's free choice (JavaScript)", "track": "javascript", "env": "javascript",
                "preamble": ("Use whichever installed JavaScript plotting library fits the task best (D3, "
                             "Observable Plot or deck.gl), or none if you prefer to write the chart yourself.")},
    "free-js-all": {"name": "Free choice (all JavaScript libraries)", "track": "javascript",
                    "env": "javascript", "docs": True,
                    # The same choice as free-js plus HMPlot, with its docs and skill offered, not prescribed
                    # (TODO 145.6d): whether an agent picks HMPlot when it may.
                    "preamble": ("Use whichever installed JavaScript plotting library fits the task best (D3, Observable Plot, "
                                 "deck.gl or HMPlot), or none if you prefer to write the chart yourself. HMPlot's documentation "
                                 "is in hmplot-docs/ and hmplot-skill/ if you choose it.")},
})

# The pilot's conditions (R2.9, 2026-10-03): HMPlot with docs and skill, Plotly (what agents reach
# for) and Altair (the closest design peer).
PILOT_LIBRARIES = ["hmplot", "plotly", "altair"]

# The default comparison (Stage 131): HMPlot with its docs and skill against the agent's free choice.
# Paired web-authoring conditions share one installed package; only guidance differs.
_WEB_PREAMBLE = ("Use HMPlot's Svelte components for the visualization. Render the chart with HMPlot marks; "
                "do not substitute a custom SVG/canvas chart or an unused Plot. "
                "Its local documentation is in hmplot-docs/.")
for _name, _docs, _skill in [
    ("hmplot-js-baseline-docs", "artifacts/web-authoring/baseline/docs", "artifacts/web-authoring/baseline/skill"),
    ("hmplot-js-web-docs", "build-llm/standard", "skills/hmplot"),
]:
    LIBRARIES[_name] = {"name": _name, "track": "javascript", "env": "javascript-hmplot",
                       "preamble": _WEB_PREAMBLE, "docs": True, "skill": True,
                       "docs_dir": _docs, "skill_dir": _skill}
LIBRARIES["hmplot-js"]["env"] = "javascript-hmplot"
LIBRARIES["free-js-all"]["env"] = "javascript-hmplot"
# Its docs and skill are the web-docs condition's, copied in but optional: no instruction to read.
LIBRARIES["free-js-all"].update({"skill": True, "optional": True, "docs_dir": "build-llm/standard", "skill_dir": "skills/hmplot"})

DEFAULT_LIBRARIES = {"python": ["hmplot", "free"], "javascript": ["hmplot-js", "free-js"]}
