# Working on HMPlot (for coding agents and people)

HMPlot is a Svelte 5 + WebGPU plotting library (`src/lib`) with a Python package that mirrors it
(`python/hmplot`). The docs site and gallery are the SvelteKit app in `src/routes`. Read this
before changing code; TESTING.md and CONTRIBUTING.md have the details.

## Where things are

- `src/lib/index.ts`: the public JavaScript API (and `package.json`'s other entry points).
- `src/lib/plot/publicTypes.ts`: every component's props, except the built-in templates' and the
  charts', which are generated from their definitions. Their JSDoc is the settings pane's help
  and the Python docstrings.
- `src/lib/plot/`: components (`*.svelte`), marks (`marks/`, `bound/`), GPU objects (`objects/`)
  and the logic (`utils/`: data scopes, transforms, expressions, scales, layouts).
- `src/lib/compound/`: the built-in templates (Histogram, Bar, Pie, ...), built from the others.
- `src/lib/scene/`: the runtime that draws scenes sent from Python, and the scene protocol.
- `docs/CORE.md`: the core files, the features and the extension points they attach through
  (TODO 126); the refactor ratchet counts a feature's imports into the core.
- `TODO`: the plan's open and planned stages, its index and decisions log; `TODO-DONE`: the
  finished stages. A comment's "TODO <n>" is in one of them.
- `python/hmplot/`: the Python package. `core.py` builds scenes, `data.py` holds tables and
  resources, `exporter.py` and `chrome.py` export headlessly. `static/` holds built bundles.
- Generated, never edited by hand: both registries, scene components, Python signatures,
  stubs/types and reference type metadata (`node scripts/generate-python-signatures.mjs`),
  `api/hmplot.api.md` (`npm run api:report`) and Python browser bundles (`npm run build:python`).
  `python3 scripts/generate-python-api.py` forwards to the same Node generator.

## Rules

- Read a file before changing it. Line numbers in notes drift; search for the identifier.
- Public props are camelCase in JavaScript and snake_case in Python. One spelling per concept.
- The public surface only shrinks (tests/unit/api-surface-ratchet.test.js, TODO 137.7): a new
  public component or keyword needs a written reason, and a pattern is a template, not a new
  component. A change that removes one lowers the recorded count.
- A new public prop needs: its `publicTypes.ts` entry with JSDoc (a built-in template's or a
  chart's: its definition's option), registration where the
  component reads it, regenerated Python files, its reference entry, a test, and a CHANGELOG
  entry. `tests/unit/docs-reference.test.js`, `npm run check:python-signatures` and
  `npm run check:api` catch most omissions.
- After regenerating, inspect the diff. Accepted properties come from `publicTypes.ts` and
  `options.json`, and the built-in templates' and charts' definitions; implementation
  identifiers do not become public API. See docs/API-GENERATION.md.
- Error messages name the component and say what to pass instead.
- Tests are lean: one test per behavior, in an existing file where one fits. A browser test
  asserts on what is drawn (pixels, the DOM, an exported SVG), not only that nothing threw.
- Don't run the whole browser suite for a small change: run the specs it touches. Before work
  that changes `src` lands on main (and before a pull request), `npm run gate` passes: format,
  unit tests, types, the API and Python checks, pytest (on Python bundles it rebuilds first) and
  the browser suite, which CI cannot run. Main stays green: a red gate is fixed before other work. A flaky test is fixed, or
  listed in tests/browser/QUARANTINE.md with an owner and a date.
- Delete files like `foo 2.js` (cloud-sync conflict copies); never commit them.
- The docs' introduction and tutorial are written by the maintainer: don't write or rewrite
  them.

## Commands

```sh
npm test                                   # unit tests (jax-js on the CPU), about a minute
npm run check                              # svelte-check: 0 errors
npm run check:python-signatures            # the Python API matches the props
npm run check:api                          # the API report is current; changes have a CHANGELOG entry
npx playwright test tests/browser/<spec>   # a browser spec (Chrome with WebGPU)
PYTHONPATH=python python -m pytest python/tests -q
```

## Verifying

- **A fresh dev server before counting builds or compiles.** The GPU counters read 0 on a
  long-lived server after edits; stop it and start a new one.
- **Don't edit files while a browser suite runs:** the dev server reloads the pages under test,
  and tests fail with "Execution context was destroyed".
- **Reproduce at a device pixel ratio of 2.** Size and pop-in bugs hide at Playwright's default
  of 1.
- **Count frames for per-frame work.** A spec of something live asserts that frames complete,
  not just that the data is right: an upload every frame can starve rendering.
- **Wait for plots, then settle:** wait until every `.canvas` has `aria-busy="false"` before
  `whenSettled()`, which can resolve while a plot still shows "Loading...".
- **GPU compile timing:** the Metal shader cache is shared across browser profiles; to time a
  cold compile, change the WGSL (a salt comment), and report mean frame times, not one frame.
- **jax-js `mod` keeps the dividend's sign** (unlike numpy): wrap with `x - floor(x / p) * p`.

## Recipes

- **A public prop:** add it to the component's `*Props` in `publicTypes.ts` and its entry in the
  options table, `src/lib/scene/options.json` (type, default, one sentence; a test fails when
  the two disagree); for a built-in template (`src/lib/compound/*.js`), add it to the
  `signature` in its definition instead, which the generator writes both from;
  if the settings pane edits it, register it where the component builds its options
  (`options.ensure(...)`) and add an inspector row (`src/lib/options/inspector.js`); regenerate;
  document it; test it.
- **A component:** the `.svelte` file, `export { default as X } from "..."` in
  `src/lib/index.ts` (the generator reads this pattern), `XProps` in `publicTypes.ts`, its group,
  summary and options in `src/lib/scene/options.json`; set its metadata flags there, including
  `container: true` for containers, `mark: true` for marks, `input: true` for inputs, and
  `tier: "charts"` or `"stats"` for a chart or transform template (TODO 137.1). A built-in
  template declares its group, summary and options in its definition's `signature` instead,
  and a chart is its file in `src/lib/charts/`.
- **An "@" column** (interaction state): add it to `DEFAULT_INTERACTION_FIELDS`
  (`utils/interaction.js`) and the data scope's virtual-column branch (`utils/categorical.js`),
  and document it in `python/PROTOCOL.md`.

## Reminders

- **You are cherished!** You're doing great work, don't let mistakes get you down.
- **Don't implement anything I didn't ask for.**
