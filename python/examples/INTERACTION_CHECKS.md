# Interaction checks

Use the HMPlot version from the same checkout as these notebooks (or the matching release).
Each notebook generates its own small deterministic dataset; no downloads are needed. Start with the defaults
before increasing counts. These are manual stress fixtures, not benchmarks.

| Notebook | Svelte gallery page | Main checks |
| --- | --- | --- |
| `31_interaction_dashboard.ipynb` | `/examples/interaction-dashboard` | Coordinated hover, independent tables, selection, live brush filtering |
| `32_interaction_matrix.ipynb` | `/examples/interaction-matrix` | One row in 16 cells, scrolling, cached re-entry |
| `33_interaction_keyed_updates.ipynb` | `/examples/interaction-keyed-updates` | Reordering, replacement, different fade durations, retained keys |

## Suggested sequence

1. Hover a point from its edge, hold still, move within it, then leave. Look for
   oscillation, delayed size resets, loading indicators, and stale labels.
2. In the dashboard, the same row should enlarge in the other shared projection.
   The independent table must stay unchanged. Matching category colors alone do
   not establish interaction identity.
3. Click to select, Shift-click to toggle, then click blank background to clear.
4. Shift-drag a brush; the filtered panel should update during the gesture.
   Move the brush and cancel an active gesture with Escape. Double-click a band or use
   the plot's clear controls to remove a committed brush.
5. Repeat from another shared plot. Selection, brushing and hover are separate
   states; the requested response array combines their memberships as a union.
6. In the matrix, scroll several rows out of view and return. Try cache sizes
   64 and 0 (`facets.update(cache_size=0)` in a later Python cell).
7. In the keyed notebook, select rows before running the later update cells.
   Surviving IDs should keep selection after reversal; removed IDs should leave.
   Enter/exit fades are explicit, with different durations for points and labels.
8. Try a narrow notebook output and then a wider output. Repeat hover and brush
   checks after resizing.

Record the example, row count, browser/notebook host, gesture, and any console
error when reporting a failure. The Python construction/serialization checks
and browser smoke checks do not substitute for real notebook interaction tests.
