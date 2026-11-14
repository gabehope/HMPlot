import{a as o,f as a}from"./CBBAqgJ0.js";import"./COd-AvuQ.js";import{_ as n}from"./B9wkoLL1.js";const r={title:"Html"},{title:p}=r;var s=a(`<p><code>Html</code> anchors native HTML at a scalar numeric position in the nearest 2D Cartesian
Frame. Its top-left corner follows the displayed scales and camera; <code>dx</code> and <code>dy</code> are CSS-pixel offsets. Use CSS on your content for additional alignment.</p> <p>Attachments preserve Svelte context and state. They do not set domains or reserve
layout space. Use a keyed Svelte loop for a small collection of attachments; use
marks for data-sized collections. Invalid or clipped anchors hide their content
and remove it from keyboard navigation. Content can extend into margins but is
clipped at the canvas boundary.</p> <p>Native controls retain their normal semantics and events. Provide accessible
names and keyboard behavior for custom controls. If a focused attachment becomes
hidden or is removed, focus returns to the plot canvas. The overlay background is
pointer-transparent, and plot navigation ignores events originating in attachments.
Positions update after resize, navigation and scale animation. Destruction removes
the wrapper and subscription; SSR creates neither.</p> <p>HTML is excluded from plot PNG/SVG/PDF exports. Browser screenshots include it.
Categorical frames, 3D, and following an animated mark endpoint are not supported.</p> <p>For external overlays, the Plot and Frame handles expose <code>getScreenMapping()</code> and <code>subscribeScreenMapping(listener)</code>. A mapping snapshot has <code>width</code>, <code>height</code>, <code>revision</code>, <code>project(&#123;x,y&#125;)</code>, and <code>unproject(&#123;x,y&#125;)</code>. Pixel coordinates are local to
the canvas in CSS pixels, independent of device pixel ratio. To convert an event,
subtract the canvas bounding rectangle’s <code>left</code> and <code>top</code> from <code>clientX/clientY</code>.
Do not apply CSS transforms to the canvas when using that simple subtraction.</p> <p>Snapshots describe completed draws and remain unchanged during subsequent updates.
The subscription immediately receives the current mapping, then changed mappings
after draws; its return value unsubscribes. A mapping is null before drawing, after
disposal, or for unsupported geometry. Invalid coordinates map to null. Projected
points outside the visible frame retain their coordinates with <code>inside: false</code>;
inverse mapping does not clamp.</p>`,1);function l(e){var t=s();n(10),o(e,t)}export{l as default,r as metadata};
