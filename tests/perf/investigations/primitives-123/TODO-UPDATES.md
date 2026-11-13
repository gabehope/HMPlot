# Proposed TODO updates (not applied)

Neither 123.9 nor 123.10 should be checked off on the current evidence.

Suggested progress note for **123.9**:

> Isolated exclusive-int32-scan/scatter and sort fixtures prepared from 0041638d.
> CPU/WASM order, hidden-destination, ownership/provenance and bucket checks pass.
> Frozen-build 90k/500k interleaving and moving-particles latency/frame harnesses
> are ready. Exclusive GPU coordination, real-WebGPU correctness and measured
> crossover remain pending; keep production sort.

Suggested progress note for **123.10**:

> Prepared a segment-restricted left/right-bound prototype with cached visible
> predecessor/successor scans, including changing-mask cost, plus a precomputed
> endpoint ablation of complete Slice. CPU/WASM holes/duplicate/empty/boundary
> checks pass. Long-history/actual moving-particles GPU attribution and completed
> frames remain pending. No fork search primitive is justified by current evidence.

Replace these progress notes with measured outcomes only after accepted plain,
counter and timestamp captures. The pending GPU window is an experimental blocker,
not evidence that either algorithm loses.
