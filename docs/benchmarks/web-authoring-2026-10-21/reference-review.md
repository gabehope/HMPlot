# Svelte reference validation, 2026-10-21

Reviewer: the coordinating Codex implementation agent, using source inspection,
independently computed data assertions, and saved DPR-2 screenshots. This is not
an independent human review or a separate paid model-judge pass. These authored
references and their debugging runs are excluded from the 90-trial evaluation.

All 15 references compile against the installed HMPlot npm package. The retained
oracle reports contain **55 passing checks** (including initial readiness checks).
`reference-checks.json` preserves each assertion and screenshot hashes. Initial and
interaction images are retained in the local reference run; production startup
images are also in `artifacts/web-authoring/benchmarks`. These local artifacts are
not distributed as agent guidance.

The image review confirms visible marks, controls, legends, and linked panels.
The final calendar image confirms readable weekday labels and equally sized
calendar panels. The clustered-expression image shows aligned row and column
leaves, the condition strip, z-score legend, and selected-gene box plots. The
wealth–health image has separated moving labels. Image review alone does not
certify the numerical behavior of a gesture.

| Reference | Deterministic evidence | Remaining coverage limits |
| --- | --- | --- |
| Clustered expression | SciPy correlation/average-linkage row ordering; z-scores; actual cell hover updates gene detail | Sample clustering and every dendrogram segment are source/visually reviewed, not independently compared as geometry |
| Epidemic network | Infection/recovery/transmission counts at days 0, 7, 20 and 68; rendered mark counts | Every animated intermediate day and transmission endpoint not individually asserted |
| Flight network | Full-data and brushed-hour route aggregates and airport totals | Cross-view airport hover is implemented/source-reviewed but not independently asserted for every airport |
| Galaxy slices | 200,000 rows; exact height-filter count; actual face-view brush and 3D partition membership | Camera navigation is not a separate reference oracle |
| Quake globe | Three rolling date windows and synchronized depth bins; drag changes globe center | Per-point age opacity/depth color is source/visually reviewed rather than pixel-calibrated |
| Rebased returns | Date control and actual pointer rebasing; independently computed endpoint returns | Shared navigation is implemented/source-reviewed, not independently asserted in this reference suite |
| Rent map linked | Five quantile classes, least-squares coefficients, selected district detail | Full two-way pointer-hover identity coverage remains unverified |
| Sensor wall | 36 panels, missing hours, independent rolling sample statistics/outliers; actual overview brush | Each individual gap and tooltip target is not pixel-asserted |
| Taxi explorer | All million rows; exact full/hour/brush counts and combined filters | Zoom-dependent bin radius is implemented/source-reviewed but bin geometry at several zoom levels is not independently measured |
| Wealth–health trails | All 120 countries and independently interpolated values at 1950, 1982.5 and 2020 | Population circle areas and each trail endpoint are source/visually reviewed, not pixel-area asserted |
| Bundled communities | Sorted neighborhood/degree; pinned focus persists across strength 0/1; reset | Every hierarchical path and pointer pin target is not independently asserted |
| Calendar anomalies | Full leap-year and selected-window counts; actual Feb-29 hover outside the current lens preserves fixed monthly baseline | Missing/zero color distinction is source/visually reviewed rather than pixel-calibrated |
| Parallel coordinates | Actual axis brush, persistent second brush with AND membership, linked ranking, empty result and reset | Exhaustive brush combinations are not enumerated |
| Streamgraph lens | Inclusive full/range totals; baseline switching preserves range; actual date-lens gesture | Every stacked boundary and tooltip target is not independently compared |
| Zoomable portfolio | Root/subtree totals and ranks, metric switching; rendered rectangle areas within 1%; actual rectangle drill | Every deeper hierarchy branch is not individually exercised |

Unverified criteria above remain **unknown**, rather than being promoted to passes
from screenshots. The implementations are usable references with explicit coverage
limits, not claims of exhaustive task certification.

One full-run taxi attempt encountered a Metal GPU device loss during SVG count
inspection. Its failed diagnostics and screenshots remain under
`taxi-explorer/reference/infrastructure-20261021-metal-device-loss/` in the local
reference root. An isolated rerun passed all taxi checks. This is recorded as an
infrastructure retry, not a task correction or an evaluation success. A calendar
hover assertion initially matched the library tooltip's table as well as the
application table; the selector was narrowed to the application table and the
check rerun. The final cosmetic calendar x-margin change was verified in the
production startup screenshot; it did not change data processing.

Performance methodology and raw measurements are in [README.md](README.md) and
[measurements.json](measurements.json). No claim is made about genuinely cold Metal
shader compilation. The initial interaction measurement without an explicit new
completed-frame barrier is superseded; its raw record is retained locally as
`/tmp/hmplot-benchmark-pre-frame-barrier.json`.
