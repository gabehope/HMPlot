# Reference implementations

## Svelte references (2026-10-21)

All fifteen `complex` and `d3-hard` tasks have a public-API `hmplot.svelte`
implementation beside the preserved Python files. They use the installed npm package,
ordinary JavaScript preprocessing where appropriate, and HMPlot for the visualization.
`web-utils.js` is reference-only; neither it nor these solutions belongs in agent guidance.

`../run-web-references.py` compiles the consumer and runs
`../agenteval/web_reference_checks.py`. The oracles independently read the pinned data
with pandas, NumPy and SciPy, drive native controls/pointer gestures, and inspect rendered
SVG, pixels, plot summaries or application DOM. They save initial and interaction
screenshots at DPR 2. In particular, treemap area checks inspect pixels, and taxi/galaxy
brush checks compare actual selected counts with independently computed membership.
The checker does not certify an interaction solely because its screenshot changed.

The separate `html-attachment.svelte` fixture benchmarks ordinary DOM anchoring; it is
not a sixteenth evaluation task. `../benchmark-web-references.py` records startup and
warmed interactions with methodology and raw samples. Reference checks, visual reviews,
infrastructure retries and agent trials are separate evidence. A passing check list does
not imply that every possible interaction has been exhaustively verified.

## Historical Python references

The ten `complex` task directories contain HMPlot programs authored and debugged
interactively in the main Codex session. They are examples for comparison, not
isolated agent attempts, human-reviewed ground truth, or benchmark successes.

Each program runs from a task directory containing the manifest's `data/` files
and writes a self-contained `output/chart.html`. Use the benchmark's pinned
HMPlot environment to compare against its agent output. Do not run a reference
over an existing agent run: give it a separate directory and `kind="reference"`.

The 2026-10-18 hard run publishes these separately under
`runs/<task>/hmplot--reference/1`, with a `references.html` gallery and entries in
the existing comparison report. The original `hmplot--codex` runs are retained.
Structural checks and screenshots are stored alongside each implementation;
unverified interactions remain marked for review. Judging is not started.

Historical implementation choices for the pinned 2026-10-18 build follow. Limitations and workarounds below are observations of that build, not current capability claims:

Implementation choices worth comparing with the generated programs:

- Clustered expression uses explicit dendrogram geometry, one shared observation
  table, and a grouped hover reduction to propagate from a cell to its whole gene.
- Flight network keeps aggregation in the live flight pipeline and joins static
  route geometry onto its result. It does not require live right-hand joins.
  Hover-dependent values are calculated before grouping and carried into its
  outputs: direct virtual-state references after Group/Join failed on this build.
- Sensor wall uses 36 compact sensor tables rather than a region-by-all-sensors
  cross-product. Domain expressions read the common overview's brush constraints.
- Galaxy views share observation identity and a height filter. Equal spatial
  domains preserve the thin disk instead of independently stretching its z extent.
- Taxi uses every pickup and viewport-dependent hexbin radii; no downsampling or
  Python callback is substituted for the requested interaction.
  Its live count uses a ten-symbol decimal dictionary. GPU-computed numeric text
  currently requires an explicit category domain, rather than arbitrary formatting.
- Wealth/health interpolates population before calculating square-root bubble
  diameter, with a fixed size scale for proportional areas.
- Rebased returns uses numeric day coordinates with the epoch stated on the axis.
  `LinkViews` supplies shared navigation. Because it does not link pointer state,
  an explicitly documented browser adapter maps displayed tick coordinates into
  a shared native input. Computation/rendering still use HMPlot. This is extra
  application code, not evidence that native pointer linking already exists.
- Quake globe uses native globe guides. It does not invent continent boundaries;
  the current library has no bundled land dataset.
- Rent-map highlighting uses a fixed dark outline with reactive widths/sizes.
  Conditional color strings failed even when wrapped in `hm.literal` on the
  pinned build (`Invalid type for full: #111827`); the reference does not patch
  that runtime limitation.

These programs intentionally target the existing API. Planned selection operators,
keyed selections and extracted pipeline references are not prerequisites.
