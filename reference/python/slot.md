# slot

Where a template's children go: hm.slot() marks the place in its build().

## Example

```python
import hmplot as hm


@hm.template
def panel(data):
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.slot()
        hm.Line(x="x", y="y")


data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with panel(data) as chart:
    hm.Points(x="x", y="y")
chart
```

## Usage

`hm.slot()` marks where a template's caller children go. Call it once inside `build()` or an
`@hm.template` function, in the data and component scope the children should inherit. A helper
called from the build may place it. A Calculate above the slot supplies its output to the
caller's marks; a Plot above it supplies their drawing context.

`with template:`, `template.add(...)`, `remove` and `clear` operate on this slot. The caller's
children stay before anything the build creates after the slot; clearing them keeps the
built-in parts. They do not become the template's main or named parts. Calling slot outside a
build, or twice in one template, raises. A template without one refuses caller children.

There is one unnamed slot. `hm.contract(parts={...})` names existing components for property
edits and handles; it does not create named or replaceable child slots. A rebuild with
`template.update(...)` moves the caller's children to the rebuilt slot. Portable export needs
an empty slot; fill it after loading.

In an ordinary Svelte component, place caller children with `{@render children?.()}`.
[`PortableTemplate`](package-templates) places its Svelte children at the file's exported slot.
See [Template](template) for parameters, updates and contracts.
