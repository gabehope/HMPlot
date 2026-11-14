import{a,f as s}from"./CBBAqgJ0.js";import"./COd-AvuQ.js";import{_ as r}from"./B9wkoLL1.js";var n=s(`<h2 id="usage">Usage</h2> <p><code>Transform</code> runs a named computation around its children. Pass its schema parameters in <code>params</code> in Svelte, or as keyword arguments in Python. The example uses the bundled Hull
computation; its output is the same as the Hull component’s.</p> <p>Register a JavaScript plug-in with <code>registerPlugin</code> before naming its transform or layout.
Python installs the plug-in package and calls <code>hm.use_plugin("package-name")</code> before building
the plot. The same registered code travels with exported HTML.</p> <p>A row transform reads the surrounding table. A graph layout reads GraphData and publishes
both relations: put its node marks inside Nodes and its edge marks inside Edges. Layout
parameters belong in <code>params</code>; <code>by</code> and <code>as</code> apply to row transforms.</p> <p>A missing kind leaves the input unchanged and reports a warning. Registering it later mounts
the computation. A failed update retains the last successful result and reports its error.</p> <p>For registered plug-ins, the settings pane exposes schema parameters under the transform’s
own entry. Edits rerun the computation and are included in Python edits and HTML exports.
Expression-valued parameters display their expression; change the expression or its input
to adjust those values.</p> <p>See <a href="/HMPlot/reference/svelte/plugins">plug-ins</a> for registration, schemas and authoring contracts, and <a href="/HMPlot/reference/svelte/package-templates">templates</a> for patterns composed from existing components.</p>`,1);function d(e){var t=n();r(12),a(e,t)}export{d as default};
