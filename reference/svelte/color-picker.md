# ColorPicker

An opaque RGB color selected with the browser color picker.

## Example

```svelte
<script>
  import { ColorPicker, InputContext, Plot, Points, input } from "hmplot";
  const data = { x: [1, 3, 5, 7, 9], y: [2, 4, 1, 5, 3] };
</script>

<InputContext>
  <ColorPicker name="ink" value="#4f7dff" />
  <Plot {data} height={300} axes2d >
    <Points x="x" y="y" size={12} fill={input("ink")} />
  </Plot>
</InputContext>
```

## Options

- `value` (`string`): A six-digit hexadecimal color; the value is lowercase #rrggbb. Default: `"#000000"`.
- `name` (`string`): The name readers use (input("name"), hm.input.name, or "$name" where a string names a column): an identifier, unique in its input context.
- `label` (`string`): The text shown beside the control. Default: the name.

## Usage

Choose an opaque RGB color using the browser's native picker. Supply a six-digit hexadecimal value, such as `#4f7dff`; the control publishes lowercase `#rrggbb`. Use the named input for a mark's `fill` or `color`. Alpha values and CSS color names are not accepted; set the mark's opacity separately.

Place the control beside the plot in an `InputContext` (JavaScript) or `Scene` (Python). Readers use `input("name")` or `hm.input.name`. The name must be unique in that context.

Static image exports show the plot at the current values and omit the controls.
