# HMPlot library replacement trials

**Codex-generated**

**Date:** October 10, 2026

**Status:** Optional design trials; no dependency or implementation change selected.

**Reconciled source:** local main `e95c208d2ea20be9f7981c87fa808f9033c81367`.

This plan owns the former R11 proposals from the
[readability plan](READABILITY-PLAN-2026-10-09.md). Dependency replacements change packaging,
compatibility and resource ownership, so they need their own review and measured trial.
They are not prerequisites for readability work. Preserve the supported user workflows.

## Trial boundaries

These are optional bounded trials, not selected dependencies or approved behavior removals.
Compare maintenance removed with adapter complexity, package/bundle impact, and compatibility.
Use existing dependencies where sufficient; do not add a framework to replace a small helper.

| Target | Candidate | Trial boundary and gate |
|---|---|---|
| [vectorTiles.js](../src/lib/plot/utils/vectorTiles.js) | [Mapbox vector-tile](https://github.com/mapbox/vector-tile-js) with `pbf` | Replace protobuf/MVT decoding only; retain layer filtering, tile geometry policy, diagnostics, and numeric/ring semantics; compare dense-tile behavior and bundle cost |
| [chrome.py](../python/hmplot/chrome.py) | [websocket-client](https://websocket-client.readthedocs.io/en/latest/core.html) | Replace framing/handshake transport only; retain browser discovery, WebGPU flags, proxy/origin policy, errors, large messages, and shutdown behavior |
| Settings floating placement | [Floating UI](https://floating-ui.com/docs/computeposition) and [autoUpdate](https://floating-ui.com/docs/autoupdate) | Replace placement/tracking mechanics; retain drawer/focus policy and test mobile zoom, notebook scrollers, clipping, and first-visible-frame placement |
| Python theme structure validation | [jsonschema](https://python-jsonschema.readthedocs.io/en/stable/validate/) | First correct the schema and normalize accepted Python input forms; retain HMPlot semantic validators and actionable errors |

Prefer sharing the existing small clipping functions over adding a large geometry stack.
Do not replace GPU interpolation, KDE, animation, or curve refinement with CPU libraries
merely because their APIs are shorter. Likewise, replacing the PNG-pipe MP4 writer with an
API requiring decoded frames is not a simplification without changing the transport contract.

**Done when:** a trial either eliminates an owned implementation with a demonstrably smaller
adapter and parity evidence, or records why the existing implementation should remain. Any
new runtime dependency and material compatibility change is explicit in its implementation PR.

## Execution and evidence

Select one adapter at a time. Record the exact implementation to retire, installed versions,
license and bundle/package impact, compatibility differences, and rollback boundary. Research
candidate documentation at trial time; the links above identify candidates, not validated
current compatibility. Do not introduce a dependency before showing a smaller maintained
adapter with the existing behavior.

| Trial | Existing behavioral checks | Additional evidence required |
|---|---|---|
| MVT decoder | [vector-tiles.test.js](../tests/unit/vector-tiles.test.js), [vector-tiles.spec.js](../tests/browser/vector-tiles.spec.js), [vector-tile-export.spec.js](../tests/browser/vector-tile-export.spec.js) | Decoded numeric values, winding/holes, malformed input diagnostics, dense-tile time and worker/bundle size parity |
| Browser transport | [test_core.py](../python/tests/test_core.py), [test_animation.py](../python/tests/test_animation.py), [test_package.py](../python/tests/test_package.py) | Inspect which tests exercise real Chrome transport; add focused large-message, disconnect and shutdown coverage for any untested adapter boundary |
| Settings placement | [settings.spec.js](../tests/browser/settings.spec.js) | Inspect current focus/scroll/zoom assertions; add only missing notebook-scroll, clipping or first-visible-frame cases |
| Theme validation | [test_themes.py](../python/tests/test_themes.py), [theme.test.js](../tests/unit/theme.test.js), [shapes.test.js](../tests/unit/shapes.test.js) | Accepted-input matrix, identical semantic checks and error quality; separate a confirmed schema bug fix from replacement |

Report owned implementations before and after, including adapter code. Source LOC and bundle
size are supporting measurements; unchanged behavior and fewer maintained responsibilities
are the decision criteria. The readability plan's local gates and performance gate apply
when a trial reaches a per-frame path. Generated changes must be intentional and reviewed.
