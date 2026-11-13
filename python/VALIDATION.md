# Notebook release checks

Validated with Python 3.13, anywidget 0.11, JupyterLab 4.6, Notebook 7.6, and the installed VS Code Python/Jupyter extensions on macOS. Browser checks use Chrome with WebGPU. The isolated VS Code profile disables external widget script sources.

- Python tests cover construction rollback, reopened containers, ownership, concurrent tasks, references, tables and adapters, categorical identities, changed-column transfers, handshake/backpressure, asynchronous callbacks, and disposed views.
- Browser scene fixtures cover all twelve example notebooks. They check preserved component/resource identity after updates, failed-transaction retention, and nonempty GPU-exported PNG pixels.
- Interaction checks exercise actual picking, axis-margin linked zoom with independent Y state, and committed bin-control synchronization.
- Fresh-wheel notebook checks exercise rendering, live binary-column updates, awaited settlement, and PNG export in JupyterLab and Notebook 7. VS Code is checked through a real notebook webview, using the installed wheel rather than an editable import.
- Existing library checks include numerical tests, Svelte type checks, production build, and a fresh npm-package consumer (types, SSR, browser rendering, fonts, settings, and remounts).

These are short deterministic smoke checks, not large-data performance benchmarks. WebGPU availability and notebook content-security policies remain environment requirements. Generic `Surface` keeps the existing mesh-preparation path; regular GPU surfaces should use `Heatmap`.

Version 0.2 adds data shortcuts, View/Axes frames, histogram controls, and facet settings. Focused frame checks cover twin-axis picking, shared zoom, exports and single-renderer ownership.
