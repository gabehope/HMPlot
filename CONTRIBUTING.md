# Contributing

Thank you for helping. This page covers setup, the tests, and the contribution terms.

## Setup

```sh
npm ci                                  # Node 20 or later
npm run dev                             # the docs site and gallery at http://localhost:5173
python -m venv .venv
.venv/bin/pip install -e "python[test,dataframes,arrow,netcdf]"
```

The editable install builds the Python package's notebook and export bundles
(`npm run build:python`), which git does not keep; run that again after changing the JavaScript
that Python scenes draw with. `npm run build` rebuilds these bundles before exporting the
examples, so production builds use the current JavaScript API after a pull.

WebGPU needs Chrome or Edge on the desktop. Python exports find an installed Chrome, or download
Chrome for Testing once (`hmplot install-chrome`).

The dev server builds the docs' Python examples in the background (with the `.venv`'s Python) and
keeps them current while it runs, after a pull too: a new or changed example, or one a page shows
after the Python package changed, is built, and a gallery card without a thumbnail gets one, one
capture at a time. `npm run build` builds every example and thumbnail up front. Builds take a lock
in `static/example-builds/`; one left by a build that was killed is taken over.

## Tests

[TESTING.md](TESTING.md) describes every suite and what runs in CI. Before a pull request, run
at least:

```sh
npm test                                          # unit tests, including the refactor ratchet
npm run check                                     # types: 0 errors
npm run format:check                              # the formatted areas stay formatted
npm run check:python-signatures                   # the Python API matches the props
npm run check:api                                 # the API report, and a CHANGELOG entry for a change
PYTHONPATH=python .venv/bin/python -m pytest python/tests -q
npx playwright test tests/browser/<the specs your change touches>
```

- Start a fresh dev server before a browser run that counts builds or compiles: counters read 0
  on a long-lived server after edits.
- Don't edit the tree while a browser suite runs: the dev server reloads the pages under test.
- Reproduce size and pop-in bugs at a device pixel ratio of 2.
- Tests are lean: one test per behavior, in the existing spec files where one fits.
- After changing a component's props, regenerate the Python API
  (`node scripts/generate-python-signatures.mjs`; the Python command remains a wrapper) and
  the API report (`npm run api:report`), read their diffs, and add a CHANGELOG entry.
  [API generation](docs/API-GENERATION.md) lists the maintained inputs and validation rules.
- A change to how jax-js arrays are held or released also runs the leak harness on the files it
  touches (`LEAK_CHECK=1 node --import ./tests/unit/helpers/leakHarness.js --test <file>`;
  [TESTING.md](TESTING.md)). A change that formats an area adds it to `format:check`, in a
  commit of its own listed in `.git-blame-ignore-revs`.
- `npm run check` also checks the migrated internal contracts/controllers strictly through
  `tsconfig.internal.json`; add new internal TypeScript modules there. The repository-wide
  compiler settings remain unchanged. The actual mark preparation Svelte body is checked
  with `tsconfig.preparation.json`; `npm run check:preparation` runs that focused gate, also
  included in `npm run check`. The frame publication owner and brush/tooltip overlays use
  `tsconfig.frames.json` / `npm run check:frames`, also included in the main gate.
- Fork changes must pass the pinned, nonmutating `npm run build:jax-fork -- --check` gate.
  Follow the upstream/backend and real-GPU requirements in [the patch table](vendor/jax-js/PATCHES.md).

## TODO references in comments

Many code comments cite a stage of the maintainer's internal plan, such as "(TODO 37.3)". The
plan itself is not published; read such a citation as "decided and recorded in the project's
planning notes", and the surrounding comment as the explanation. New comments should explain
themselves without one.

## Contribution terms

- **Sign off your commits** (the [Developer Certificate of Origin](https://developercertificate.org/)):
  `git commit -s` adds a `Signed-off-by` line, which says you wrote the change or have the right
  to contribute it under the project's license.
- **AI assistance is allowed.** Say so in the pull request, include tests for what the change
  does, and review the code yourself: you are responsible for it as if you had typed it.
- Security issues go through [SECURITY.md](SECURITY.md), not public issues.
- Everyone follows the [code of conduct](CODE_OF_CONDUCT.md).
