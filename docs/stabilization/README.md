# Stabilization checks

Run the normal development server, then set `HEATMAP_TEST_URL` if it is not `http://[::1]:5184`.

- `node tests/stabilization.mjs`: cold pixels at DPR 1/2, held uploads, minimap updates/rebinding/mode changes, repeated toggles, 200 constraints and 60 force steps.
- `node tests/stabilization-interactions.mjs`: actual node dragging against GPU hits, appearance-only uploads, settings search.
- `node tests/stabilization-scale.mjs`: bounded points/lines/rasters, followed by force tiers. `MARKS_ONLY=1` covers other mark families; `FORCE_ONLY=1` isolates graph tiers.
- `node tests/stabilization-facets.mjs`: 4/16/64 cells and virtualization.

Run these sequentially, not concurrently. Results and screenshots go to `/tmp/heatmap-stabilization`; create that directory before running. Larger tiers stop after browser/GPU errors or two updates over one second. These scripts preserve the library's existing allocation and spherical limits. No stress test can guarantee protection from driver faults; host timeouts are not a GPU watchdog.

Enable diagnostic counters with `plot.getDiagnostics({enabled:true})`. Subsequent `getDiagnostics()` calls report completed-frame generations, overview source identity and resources, pending preparation, and opt-in timing/GPU counters. Instrumentation adds no numerical-array reads or synchronization. GPU counters cover allocations made while enabled; they are not an estimate of total process memory. Upload preparation and render submission are CPU wall times, not GPU timer-query durations. The frame interval includes idle periods.

Scale timings include host fixture generation, publication, and two animation-frame waits. They are end-to-end replacement latency, not FPS, and three samples per tier are insufficient to certify a p95 SLA. Force tiers use 20 steps; the first includes compilation. Keep raw results with hardware/browser details.

Notebook host checks use a freshly installed wheel. Browser-adapter tests alone do not replace actual JupyterLab, Notebook 7, or VS Code verification.
