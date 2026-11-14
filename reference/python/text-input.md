# TextInput

Text edited by the viewer, updated on each keystroke.

## Example

```python
import hmplot as hm

data = {"x": [1, 3, 5, 7, 9], "y": [2, 4, 1, 5, 3]}
with hm.Scene() as scene:
    hm.TextInput(name="caption", value="My observations", placeholder="Plot title")
    with hm.Plot(data=data, height=300, axes2d=True, title=hm.input.caption):
        hm.Points(x="x", y="y", size=12)
scene
```

## Options

Keywords are snake_case.

- `value` (`string`): The initial text. Default: `""`.
- `placeholder` (`string`): A hint shown while the input is empty.
- `name` (`string`): The name readers use (input("name"), hm.input.name, or "$name" where a string names a column): an identifier, unique in its input context.
- `label` (`string`): The text shown beside the control. Default: the name.

## Usage

Enter a string. The value updates on each keystroke; clearing the box publishes an empty string. `placeholder` supplies a hint while the box is empty and does not become its value. A string used as a mark channel can name a column; the example uses it as a plot title.

Place the control beside the plot in an `InputContext` (JavaScript) or `Scene` (Python). Readers use `input("name")` or `hm.input.name`. The name must be unique in that context.

Static image exports show the plot at the current values and omit the controls.
