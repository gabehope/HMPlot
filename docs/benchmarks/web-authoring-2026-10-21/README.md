# Web reference measurements

Recorded 2026-10-21T18:08:26.702907+00:00 on Apple M2 Max, macOS-15.6.1-arm64-arm-64bit-Mach-O, Chrome 156.0.8078.47; DPR 2.

navigation through first completed draws for every mounted plot; five fresh contexts per production page
Shared OS/Metal cache is not cleared. Fresh-page startup is measured; genuinely cold shader compilation is not measured.
Two-second warmup, then three serial samples of at least five seconds. Each input waits for corresponding completed draws through public whenSettled barriers.
CPU-observed intervals between completed draws, sampled by rAF; not GPU execution durations. Multiple increments in one observation share the interval. Counters observe the primary plot, except the sensor overview and taxi count plot; latency waits for all exposed linked handles.
Browser performance.now from native input dispatch through public whenSettled across exposed linked handles and an explicit subsequent completed-frame counter advance; includes preparation and draw.

| Reference | Fresh-page startup mean (ms) | p95 (ms) |
| --- | ---: | ---: |
| bundled-communities | 804.2 | 813.9 |
| calendar-anomalies | 1487.8 | 1528.0 |
| clustered-expression | 880.0 | 909.8 |
| epidemic-network | 735.4 | 745.5 |
| flight-network | 952.1 | 979.2 |
| galaxy-slices | 1286.7 | 1311.4 |
| parallel-coordinates | 834.9 | 845.8 |
| quake-globe | 698.1 | 710.8 |
| rebased-returns | 772.2 | 779.5 |
| rent-map-linked | 748.2 | 763.2 |
| sensor-wall | 4323.2 | 4486.7 |
| streamgraph-lens | 1101.9 | 1137.4 |
| taxi-explorer | 7227.5 | 8811.2 |
| wealth-health-trails | 654.6 | 675.6 |
| zoomable-portfolio | 548.1 | 561.1 |

| Interaction | Mean input-to-draw (ms) | Completed draws/s | p95 observed frame interval (ms) |
| --- | ---: | ---: | ---: |
| taxi-explorer | 1592.3 | 0.6 | 2232.4 |
| sensor-wall | 257.8 | 3.9 | 417.5 |
| galaxy-slices | 360.1 | 2.8 | 577.5 |
| wealth-health-trails | 18.2 | 55.7 | 16.8 |
| html-attachment | 16.6 | 60.1 | 16.7 |
| rebased-returns | 37.8 | 59.5 | 16.8 |

Raw samples, artifact SHA256 hashes, and toolchain records are in `measurements.json`. These are measurements of these implementations on this machine, not universal throughput claims.
