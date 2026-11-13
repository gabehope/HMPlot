# Ten million stars

Both programs use `Data(rows=N)` for the row count and ten independent seeded `random()`
expressions inside `Calculate` to generate the same illustrative stellar population on the
browser's GPU. Python sends the configuration and expressions; it uploads no stellar table. The model
uses approximate Kroupa birth masses, lifetimes, giant tracks and white-dwarf cooling. It is
not an observed catalog or a stellar-evolution calculation.

The dark 3D galaxy and its fixed 100,000-star Hertzsprung–Russell sample share the generated
data identity, temperature ramp, age filters and coordinate brushing. Both use square points
and disable antialiasing. The galaxy keeps additive blending, which already disables depth
writes for its beauty pass. Square points change the silhouette and coverage; no speedup is
claimed without a matched rendering measurement.

Download `galaxy.js` alongside the Svelte program. It constructs the expressions with the
public HMPlot functions passed by the program; there is no private evaluator or host generator.
The Python program contains those expressions directly and has no companion dependency.

The default remains ten million stars in both languages. Ten retained float32 random draws
alone use about 400 MB, before calculated fields, mark buffers and intermediate GPU work.
The two ordinary Calculate steps generate the population, then brightness from luminosity;
this keeps serialized expressions within the normal operation limit. The
shared Example provides the preview, source languages, downloads, component tree and Python
editor. A built scene payload contains the configuration rather than millions of rows.
