# Validation record

The complete `npm run gate` passed on 2026-10-21. Its retained local log is
`/tmp/hmplot-web-gate-fourth.log`.

| Check | Result |
| --- | --- |
| Unit tests with leak checking | 1,640 passed |
| Svelte types, API report, Python signatures | Passed |
| Generated examples and gallery thumbnails | Passed; 114 thumbnails current |
| Python tests against rebuilt browser bundles | 1,060 passed, one skipped |
| Main browser pass | 1,353 passed, one skipped |
| Serial timing browser pass | 23 passed |
| Installed npm consumer | Types, SSR, rendering, settings, fonts, remounts, JAX and subpath exports passed |
| Evaluation harness tests | 72 passed, including native row counts and large-prompt transport |

The package consumer log is `/tmp/hmplot-web-package-final.log`. The final
evaluation tarball's SHA256 is
`d844ea19a17240a6171f953d343e84e79106bb1d316ac035edd792dc4c5b6c4e`.
This is distinct from the measured benchmark tarball recorded in
`measurements.json`; the benchmark build is preserved with its original hash.

Earlier failed validation attempts remain in `/tmp/hmplot-web-gate.log`,
`/tmp/hmplot-web-gate-final.log`, and `/tmp/hmplot-web-gate-third.log`. Repairs
covered stale native Data errors, the Force2D example's unsupported depth prop,
tutorial navigation order, duplicate displayed diagnostics, and the expected
Python-only registry metadata. A 170-case targeted rerun passed. The third gate
was stopped after an external map-tile request failed; that example rebuilt
successfully without a source change before the passing gate. Earlier traces
also retain unfinished CDN requests, a network-change error, and machine sleep
evidence. These attempts are not presented as passing runs.

The model smoke test is retained under
`/tmp/hmplot-web-smoke-20261021`. Its first submission incorrectly fetched
CSV data at runtime in an offline page. The corrected submission bundles the
data and draws 342 penguins. Source, diagnostics, and DPR-2 screenshot review
confirmed its title, axes, three species and row count. Review provenance is the
coordinating Codex implementation agent, not an independent human or paid judge.

The smoke also exposed a harness omission: the generic row check did not consume
the native inspector's renderer-owned row count. That wiring was fixed and
tested after the gate; no library source or evaluation package changed. A
supplemental browser verification of the saved smoke build passed every check,
preserving the original trial artifacts. Smoke trials are excluded from the
90-trial comparison.

All 505 baseline guidance file hashes were reverified. Both HMPlot conditions
use the same installed package, dependencies, public types and checker. Bundled
package guidance is removed. Reference implementations are outside each trial's
readable sandbox. Reviewed model probes verify the file-access policy; selected
package environments receive their own preflight checks.

See [reference-review.md](reference-review.md) for the 15 references' 55 passing
checks and remaining coverage limits, and [README.md](README.md) for measured
performance and methodology. A passing repository gate does not certify every
task-specific criterion or the correctness of an evaluated agent's submission.

The first evaluation segment completed three trials before an embedded Parquet
data URL made correction feedback exceed the operating system's argument limit.
That session never launched. The harness now supplies Codex prompts through stdin
and omits embedded data URLs from feedback, retaining full diagnostic artifacts.
Both models' isolation probes were rerun and reviewed. A versioned continuation
under `/tmp/hmplot-web-eval-20261021-v2` retains the three completed results
with their original fingerprint and result hashes in `imported_from`. All six
completed correction prompts were checked byte-for-byte against the repaired
feedback function. Task prompts, package, dependencies, guidance and checks are
unchanged. `workflow/continuation.json` and `continuation-prompt-proof.json` record
this audit; the original manifest and interrupted trial remain preserved. The
interrupted flight trial is retried, and no completed trial is rerun.
