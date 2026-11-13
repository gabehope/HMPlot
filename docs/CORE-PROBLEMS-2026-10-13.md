# Core problems and the plan to fix them (2026-10-13)

Three agent evals in two days (the full eval: 63 tasks × Luna and Sonnet, HMPlot against free
choice; and a complex eval: 10 hard tasks × Opus and Sol, HMPlot only) produced about 75
reviewed HMPlot failures. Fixing them one at a time, about half the fixes were band-aids: they
removed a symptom and left the cause, and the same cause kept producing new symptoms. This
document names the causes, the design that removes each, and an order of work.

Under an Opus review of the renders, HMPlot lost to free choice in both full runs (Luna 28 vs
49 of 63, Sonnet 34 vs 40) at 5.6× (Luna) and 14.5× (Sonnet) the tokens per success, and passed
3/10 (Opus) and 4/10 (Sol) of the complex tasks. Two different models failed the same charts the
same way: the failures are mostly the library's, not the agents'.

## The seven core problems

| # | Problem | Share of the reviewed failures (approx.) | Root flaw |
|---|---|---|---|
| 1 | Layout and visual defaults | ~25 | No layout model: margins are fixed inputs, the plot rectangle is derived in 5+ places, CSS composes boxes that cannot align plot areas, layout leaks into scale domains, defaults are chosen per feature with no reviewed design system. |
| 2 | Failures are silent or hang | ~12 | No single diagnostics channel: errors live in 6+ stores, each consumer (hm.check, the exported page, the widget) scrapes a different subset; settling waits on draws that can never happen and reads errors only afterwards; nothing flags configurations that do nothing. |
| 3 | The docs and API do not fit agents | ~12, and the token cost | Generated, component-ordered docs (agents read 7–16 pages and 627 KB files before writing); examples are demos that agents copy as defaults; a 131-component, 3,053-keyword surface with several spellings per concept; no components for common compound tasks (live readout, focus+context, shared-x panels, marginals). |
| 4 | Reactive data flow: loops, flashes, settling | ~5, plus the three the maintainer saw | Nothing marks data as computed from the view, so view → transform → domain cycles are allowed; one slot (`xbounds`) holds the inferred domain, the padded display range and explicit bounds; interaction changes publish partial states; settlement is "draws finished", not "graph quiescent". |
| 5 | Data semantics and capacity limits on the GPU | ~6 | No missing-value contract (NaN, a 1e20 sentinel, opacity 0, weight 0, prefix counts all mean "missing"; the sentinel leaks into geometry and is tested with five different thresholds); capacity limits are scattered constants that throw at runtime (1,024 curved paths, 1,024 reduction groups, 2^24) instead of degrading. |
| 6 | State: one mutable store, full-state replay | ~4 | `OptionsNode` has one value map and one "explicit" bit for authored, theme, user, derived and default values; data preparation writes plot settings as it runs; exports and Python edits replay full state, so each derived key needs a new skip rule; private option keys serve as message channels. |
| 7 | Quality gates have eroded | (enabled the rest) | 11 browser tests fail on main and have for days (one hid the 3ddd9e7e breaks regression for two days); the eval's automatic checks passed charts that a reviewer failed; nothing reviews the library's own defaults against reference renders; no tests sweep row counts across limits. |

The ~8 eval-harness failures (a load race, the brush aimed at the wrong or off-screen plot, a
clipped data fixture) are fixed or listed in TODO 134/135 and are not repeated here.

## 1. Layout and visual defaults

**Symptoms.** Category labels dropped; long names and y titles clipped; bars floating above the
axis; ticks chosen for the margins; a pie on Cartesian axes; markers covering the plot; poor
callouts; misaligned sunburst rings; marginal histograms far from the scatter; facet columns
scrolling; stacked panels misaligned; a plot wider than the page clipped silently; a globe with
no sphere, at half size.

**Root flaw.** Margins are inputs (`axisMargin*`, defaults that disagree across viewCore,
options.json and the themes), never outputs; the plot rectangle is recomputed in viewCore,
axisOverlayContent, scene2d/viewport.js, axis.svelte and zoomDimension with different clamps;
label measurement (titleReach) only positions, never sizes; legends are CSS flex siblings that
shrink the canvas; Row/Column/Facet are CSS boxes whose inner plot areas cannot align;
`screenPaddedDomain` puts label room into the data domain, and the bar-baseline rule keys on a
column name; there is no gallery baseline and no review of defaults.

**Target.** One pure layout solver (`plotLayout.js`): canvas, axis specs, a measure function,
titles, guide sizes and pinned margins in; plot rectangle, gutters, guide slots and axis
offsets out, by a short fixed-point loop (ticks for the area → measure → gutters). `axisMargin*`
defaults to `"auto"`; a number pins a side. Every consumer reads the solver's output. Legends
and titles become solver slots. Alignment groups (Row, Column, Grid, Facet, marginals,
LinkViews) take the maximum gutter on shared edges; a Facet draws one set of outer axes. An
overflow policy (shrink, warn; facets never scroll). Scale policy by mark role (zero/expand),
label room as a gutter not a domain, `aspect="equal"` letterboxes. A token file for spacing and
type; a gallery of ~40 canonical charts with reference renders (Vega-Lite, Observable Plot,
ggplot), checked by geometry (no text outside the canvas, aligned areas, no overlaps), pixel
diffs, and the blind model judge.

**Layout under motion.** The solver reruns only when an input changes (canvas size, tick label
text, titles, guide sizes, pinned margins), never for rows moving inside a domain, and a run is a
few cached text measurements. The risk is stability: on pan, zoom or an animated domain the tick
labels change every frame, and a re-solved gutter would shift the plot under the pointer. So:
gutters are frozen during a gesture (labels that do not fit clip to the gutter) and re-solved
once at rest; while an animation or simulation runs they only grow, shrinking when it stops; a
settled gutter shrinks only by more than a few pixels; a relayout is a viewport and camera
change, never a data upload.

## 2. Silent failures and hangs

**Symptoms.** "Scene command timed out during component preparation" for a mark over a capacity
limit (flight network, ten million rows); exported pages stuck on "Static preview"; a legend
error on the page that hm.check does not report; a shader compile error as a warning;
Legend(channel) explaining nothing, an ignored colormap name, a brush filter linked to nothing,
a map domain that changed only labels — all with no message; errors that name no component or
fix ("Dash lengths must be positive").

**Root flaw.** `view.diagnostics` joins errors into one string; axis errors, guide errors,
transform statuses, `runtime.error`, ~20 components' own `role="alert"`, and GPU validation each
live elsewhere; hmplotCheck scrapes the DOM and console, the page's `keep()` swallowed errors,
the widget forwards only apply-time errors; `settle()` waits on `whenSettled` before reading any
error, and a frame that returns early never resolves its draw waiters; structured
`diagnostic()` exists but ~32 of ~1,250 throw sites use it.

**Target.** One `Diagnostic {severity: error|warning|lint, code, component, node, property,
message, hint}` that every layer reports into (a SceneNode context attributes plain strings);
`runtime.diagnostics()` that hm.check, the page, the widget and settle all read; settle
resolves or fails as soon as an error exists, and a timeout names what is outstanding; lints
for silent no-ops (static in Python's validation, runtime from mark bindings: marks outside
their axes, a map not fitted, culled labels, NaN ticks, markers covering the plot); errors with
the prop path and the fix.

## 3. Docs and API for agents

**Symptoms.** HMPlot sessions spend 71–91% of their tokens reading docs; `reference/api.md`
(187 KB) read 582 times across one run; every pie drew axes because the example does; grouped
bars garbled because llms.txt titles the old Facet recipe "Grouped bars"; Histogram's `brush`
missing from its generated page (the generator drifted from the stub), so an agent hand-built
brushes; flight arcs built from Anchors; live counts built from seven digit Texts or patched
page JavaScript; focus+context written against minified internals.

**Root flaw.** The docs are a generated dump ordered by component, not a map from tasks to
code; boilerplate paragraphs open many pages and 73 props have empty descriptions; examples
are demos, unreviewed, and two competing ways exist for several tasks; the API is large and
irregular and lacks components for common compound tasks; agents' only feedback (hm.check)
misses wrong-looking output.

**Target.** A task-ordered quick-start of ~20 recipes (≤25 lines each, tested, render-reviewed
against their captions) as the first thing agents read, with SKILL.md pointing to it; one
canonical way per concept in recipes; examples audited as defaults (a blind model review of
every example render, gating CI for recipes); a test that every stub keyword appears in its
reference page; four compound components (Readout, shared-x panels, FocusContext, Marginals;
perhaps a Globe preset); errors with paths and fixes; hm.check lints. The maintainer writes the
intro and tutorial; recipes are a separate page.

## 4. Reactive data flow

**Symptoms.** The taxi explorer re-bins forever while idle (a Hexbin radius reading the view);
rebasing flashes the un-hovered state on every pointer move; Sol's sensor-wall tooltip flips
sides at frame rate; linked plots misaligned; `hm.view` in a transform never settles.

**Root flaw.** A transform reading `@view_*` produces data with nothing marking it as
view-derived, so its extents set the domain that changes the view it reads; `@view_*` and
`@pointer` are one dependency kind; the inferred domain, the padded display range and explicit
bounds share `xbounds`; `interaction.notify` publishes each partial change, and a leave then an
enter are two publications with a GPU readback between; settlement has no notion of a loop.

**Target.** A fixed direction: data → domains → layout → view → view-derived computation → draw;
nothing downstream of the view writes a domain. Scopes carry `viewDerived`; a view-derived mark
contributes no domain (a binning transform declares `domainFrom: "input"`). `@view_*` separate
from `@pointer`. Domain and range as separate values; aspect widens the range, never an explicit
domain. Interaction transactions (one notification per pointer dispatch; a leave folded into the
following enter). A domain-group service for facets and LinkViews. Settlement as quiescence,
with a loop guard that reports the cycle by name.

**Transactions.** A transaction queues writes to selection resources and applies them in one
commit, notifying each changed resource once; reads during it see the committed state, so no
frame draws an intermediate one. Today a hover's leave is synchronous (`cancelPreview` in
markInteractionEvents.ts) while its enter awaits a row readback, so a frame draws the un-hovered
state between them: the rebasing flash. The picking dispatch (setupInteractivity's `pick`) opens
a transaction before it cancels the old hits and commits after the dispatch and its handlers'
promises, within a deadline of about one frame; a queued cancel followed by a replace of the
same owner folds into the replace. One transaction is open per canvas, a newer dispatch takes it
over, and commits happen at most once per frame. Writes from user code or Python stay immediate.

**Gestures.** One level up, the view carries `gesture.active` and `whenIdle()`: a drag, a brush,
a wheel burst (ending ~150 ms after the last event) or animation playback. The layout solver
freezes gutters during one, a view-derived transform may defer to its end, and settlement waits
for it: settled means no open transaction, no active gesture, no pending transform rerun, and
the draws done.

## 5. Data semantics and capacity limits

**Symptoms.** Series lines on a log axis drawn toward the far corner; Density exact and
quadratic (fixed by binning); 1,025 curved paths hang; an opacity above 1 speckles; a vertex
varyings overflow as a WGSL compile error.

**Root flaw.** "Missing" has five encodings; frameNodes turns NaN into `vec3(1e20)`, which
marks test with thresholds of 1e12, 1e19, 1e30 and 3.4e38 (the last two pass the sentinel: the
Triangles and Arrows smear is still there); opacity is clamped in one place; limits are
constants (sphericalBudget's 1,024, expressions' 1,024 groups, stack's 2^24, ~15 ad-hoc storage
checks, an untested varyings budget), most throwing at runtime, and a unit test locks the 1,024
cliff in as expected behavior.

**Target.** One validity contract: positions carry a validity bit through the frame
(`{position, valid}`), marks consume it through one helper, appearance channels are sanitized in
one place, and hidden rows, series breaks and zero-weight padding reduce to the same mask. A
capacity registry (`limits.js`): each limit with its unit and strategy (chunk, LOD, spill,
coarsen, error) and one error format naming the component. Curved paths by a parallel scan or in
1,024-path batches. Scale-sweep tests per mark family at 1, 1k, 1,025, 100k, 1M (10M by device
mock), asserting pixels drawn, and a missing-data matrix (family × linear/log/polar/globe ×
NaN/≤0/hidden/series break).

## 6. State and the settings round trip

**Symptoms.** An exported page with a shared fill scale never went live (quantize and levels
replayed beside the scale); a faceted time axis crashed ("e.set is not a function"); a 2D plot
warned about camera settings; derived values became Python props through edits.

**Root flaw.** `OptionsNode.set()` is the one verb for authored props, the theme, the settings
pane, data preparation (bindDatetimeAxis, category scales) and domain inference, and marks every
value explicit; the settings snapshot is every value, defaults and derived included, filtered by
a growing list of special cases in settingsProps; private keys (`_coordinateView`,
`_explicitViewport`, `_radialExtent`) are message channels; the theme reaches only registered
keys, so results depend on mount order.

**Target.** Layered resolution per node (user > authored > theme > derived > kind default >
definition), with `set(key, value, {layer})`; derived state written only by its owner and never
persisted or replayed; preparation pure (it returns derived axis types, origins, categories and
bounds for the frame to merge); exports and Python edits as the user-layer diff only, so
settingsProps becomes a renaming; view state in a typed context, not option keys; the theme as a
lazily resolved layer.

## 7. Quality gates

**Symptoms.** 11 browser tests failing on main before 2026-10-13, unnoticed; a refactor
(3ddd9e7e) silently dropped break positions; the eval's checks passed charts a reviewer failed;
nothing compares the library's defaults with reference renders.

**Target.** Main green, kept green (a failing browser test blocks a merge; flaky tests fixed or
quarantined with an owner and a date); the gallery review of defaults (problem 1); scale sweeps
(problem 5); idle-quiescence and no-intermediate-frame tests (problem 4); a tiered agent eval
(below) as the measure of progress.

## Order of work

Each step ships on its own and ends with its tests green. Effort: S ≤ 1 day, M 2–4 days,
L 1–2 weeks (agent-assisted).

**Phase 0: make failures visible and the gates trustworthy (about a week).** Everything later
depends on seeing failures.
1. Fix the 11 red browser tests; gate merges on the suite (7, M).
2. Settle fails fast: a blocked frame releases its waiters, settle races error diagnostics, and
   `getRenderError` includes axis errors; a 1,100-row projected Line returns its budget error in
   under 2 s (2, S).
3. One sentinel check matching what frameNodes emits, and opacity sanitized in one place, with
   the missing-data matrix test (5, S).
4. Characterization tests for the state round trip: export a fill_scale scene, a datetime facet,
   a 2D plot and a legend plot; exported props equal authored props plus pane edits, and the page
   goes live (6, S).
5. The docs tax: recipes.md first in llms.txt, SKILL.md trimmed to point at it, boilerplate
   removed, empty descriptions filled, the stub/reference keyword test, the Pie example and
   default fixed, "Grouped bars" retitled (3, S–M).

**Phase 1: the channels (2–3 weeks).**
6. The diagnostics model and `runtime.diagnostics()`; hm.check, the page and the widget read it
   (2, M + M).
7. Options layers, then export and Python edits as the user diff; delete settingsProps' special
   cases (6, M + S–M).
8. View-derived scopes, `@view_*` split from `@pointer`, `domainFrom: "input"` for binning; the
   loop guard in settlement; interaction transactions (4, M + S + M).
9. The capacity registry with one error format and a build-time varyings check (5, M).

**Phase 2: the structural redesigns (3–5 weeks).**
10. The layout solver with auto gutters, then legends and titles as slots, then alignment groups
    and the overflow policy (1, M + M–L + M + L + S).
11. The validity contract out of the frame; curved paths in batches or by a parallel scan;
    vertex-buffer spill for segments; chunking past 2^24 (5, M + L).
12. Pure preparation; view state as a typed context; the theme as a layer (6, L + M + S–M).
13. hm.check lints for silent no-ops and wrong-looking output (2, M–L).

**Phase 3: semantics and product (ongoing).**
14. Domain/range split; domain groups for facets and LinkViews (4, L + M).
15. Scale policy by mark role; aspect letterboxing (1, M).
16. Compound components: Readout, shared-x panels, FocusContext, Marginals, a Globe preset (3, L).
17. The defaults gallery with reference renders and judged review in CI; annotation, pie,
    sunburst, globe and heatmap defaults fixed as their gallery items fail (1, M, ongoing).
18. Unify hidden-row forms; scale sweeps in nightly CI (5, M + M).

**Measuring progress.** A tiered eval: on each change to docs, recipes or defaults, 12 targeted
tasks with Sonnet, HMPlot only, two repetitions (~20M tokens); weekly, the full 63 with two
models against free choice and cold; per phase, the 10 complex tasks held out. Metrics: pass rate
under Opus review; tokens per success relative to free (now 5.6–14.5×; target ≤ 2×); the docs
share of tokens (now 71–91%; target < 40%); first-try and correction-round pass rates; the cold
pass rate. Targets: match free on basic tasks, beat it on interaction and scale.

## Today's fixes, against this plan

Kept as they are (they fix the cause): Python export transport for millions of rows; category
label overlap; restored break positions; Density binning; GeoJSON fit and explicit domains on
flat maps (into the layout and map work later); the harness fixes; the cars fixture.

To be replaced by the core work:
- The facet snapshot's no-op `set` → pure preparation (step 12).
- Skipping quantize/levels in settingsProps → the user-diff export (step 7).
- Dropping segments past the 1e19 sentinel → the validity contract (steps 3, 11).
- The tick `area` and its whole-canvas fallback → the layout solver (step 10).
- `baselineAxes` keyed on `__barSpan` → scale policy by mark role (step 15).
- Held on a stash, not committed: the view-tracking sticky domain (→ step 8), the deferred hover
  cancel (→ step 8's transactions), the tooltip `width: max-content` and clamp (this one fixes
  the cause; it can go in on its own).

## Decisions (the maintainer, 2026-10-13)

1. Margins: `axisMargin*` is `"auto"` by default, measured from tick labels and titles; a number
   still pins a side (step 10; a deliberate rebaseline of every plot's layout, in the CHANGELOG).
2. Linked axes: LinkViews shares one union domain by default (opt out per link), and a Facet
   draws one set of outer axes, as ggplot's facet_grid does (steps 10, 14).
3. Late notebook errors (after a scene was accepted) are reported on the plot and to Python
   (`scene.diagnostics`, hm.check); the scene is not rolled back. Errors during apply roll back
   as now (step 6).
4. Band order: the first category of a band y axis is at the top, as in Vega-Lite and Observable
   Plot and in reading order; `invert=True` keeps bottom-up (a behavior change, in the
   CHANGELOG; step 15).
5. Compound components are Stage 130 templates: public names (hm.Readout, hm.FocusContext,
   hm.Panels, hm.Marginals, a Globe preset) composed from public components; where one cannot be
   written that way, the missing capability goes into the core (a Text or Title formatting a
   computed value, shared with 130's Crosshair readout; a brush setting another view's domain,
   with domain groups; alignment groups from the layout solver; globe guide presets) (step 16).
6. Eval budget: lighter. Tier 1 (12 targeted tasks, Sonnet, HMPlot only) one repetition per
   docs/defaults change; Tier 2 (the full 63, two models against free and cold) at the end of
   each phase instead of weekly; Tier 3 (the 10 complex tasks) at the end of Phase 2 only.
