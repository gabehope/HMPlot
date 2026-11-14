import{a,f as o}from"./CBBAqgJ0.js";import"./COd-AvuQ.js";import{_ as l}from"./B9wkoLL1.js";var r=o(`<h2 id="usage">Usage</h2> <p><code>hm.slot()</code> marks where a template’s caller children go. Call it once inside <code>build()</code> or an <code>@hm.template</code> function, in the data and component scope the children should inherit. A helper
called from the build may place it. A Calculate above the slot supplies its output to the
caller’s marks; a Plot above it supplies their drawing context.</p> <p><code>with template:</code>, <code>template.add(...)</code>, <code>remove</code> and <code>clear</code> operate on this slot. The caller’s
children stay before anything the build creates after the slot; clearing them keeps the
built-in parts. They do not become the template’s main or named parts. Calling slot outside a
build, or twice in one template, raises. A template without one refuses caller children.</p> <p>There is one unnamed slot. <code>hm.contract(parts=&#123;...&#125;)</code> names existing components for property
edits and handles; it does not create named or replaceable child slots. A rebuild with <code>template.update(...)</code> moves the caller’s children to the rebuilt slot. Portable export needs
an empty slot; fill it after loading.</p> <p>In an ordinary Svelte component, place caller children with <code>&#123;@render children?.()&#125;</code>. <a href="package-templates"><code>PortableTemplate</code></a> places its Svelte children at the file’s exported slot.
See <a href="template">Template</a> for parameters, updates and contracts.</p>`,1);function s(e){var t=r();l(8),a(e,t)}export{s as default};
