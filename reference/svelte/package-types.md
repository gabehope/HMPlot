# hmplot/types

Option types for settings a component registers: a default, a settings-pane control and a conversion.

## Example

```svelte
<script>
  // A pattern's settings, shown in the settings pane (see hmplot/compound).
  import { composition } from "hmplot/compound";
  import { IntegerType, SelectType } from "hmplot/types";
  let { name = undefined } = $props();
  const options = composition.getOptionsContext().splitUnique(name, "group", "Strip");
  composition.setOptionsContext(options);
  options.ensure("stripBins", new IntegerType({ defaultValue: 20, min: 1, max: 100 }));
  options.ensure("stripScale", new SelectType({ defaultValue: "count", options: ["count", "density"] }));
</script>
```

## Exports

- `FieldType` (`class`): The base type. params: defaultValue, label (default from the name), transform (value conversion) and ui (the pane's control spec, or false for none).
- `ScalarType` (`class`): A number: params min, max and step; a slider (0 to 1 by 0.01 unless given).
- `IntegerType` (`class`): A ScalarType rounded to an integer; step 1.
- `CountType` (`class`): An IntegerType from 0 to 100,000.
- `ValueType` (`class`): A ScalarType from 0 to 1.
- `OpacityType` (`class`): A ScalarType from 0 to 1, default 1.
- `WidthType` (`class`): A ScalarType from 0 to 20 by 0.1, default 1.
- `BooleanType` (`class`): true or false, default false; a checkbox.
- `SelectType` (`class`): One of params.options; a select.
- `ColormapType` (`class`): A colormap name (default Viridis).
- `ShapeType` (`class`): A point shape name (default circle), the registered shapes included.
- `Shape3DType` (`class`): "sphere" (default) or "cube".
- `TransformType` (`class`): A scale transform: linear (default), log, sqrt or symlog.
- `VectorType` (`class`): A vector of params.dimensions numbers.
- `Vector2Type` (`class`): A VectorType of 2.
- `Vector3Type` (`class`): A VectorType of 3.
- `Vector4Type` (`class`): A VectorType of 4.
- `PositionType` (`class`): A 3D position, default [0, 0, 0].
- `SizeType` (`class`): A size from 1 to 100, default 1.
- `RangeType` (`class`): A [min, max] pair, default [-1, 1]; an interval slider.
- `BoundsType` (`class`): A RangeType for an extent.
- `ColorType` (`class`): A CSS color, default white; a color picker.
- `FillType` (`class`): A fill color, default steelblue.
- `TypeRegistry` (`object`): The types by name: boolean, bounds, color, colormap, count, fill, integer, opacity, position, range, scalar, shape, shape3d, size, transform, value, vector2, vector3, vector4 and width.
- `createType(type, params)` (`FieldType`): A type from its registry name or class with params; a FieldType passes through. An unknown name is an error.

## Usage

A component's settings (what its settings pane edits, and what Python's `update()` and theme defaults reach) are registered on an options node: `options.ensure(name, type)` names a setting and gives it a type, whose `defaultValue` is its value until something sets it, whose `ui` is the pane's control (a slider, checkbox, select, color picker or text field) and whose `transform` converts what the pane sends. A pattern written in Svelte registers its settings this way, through `getOptionsContext()` and `setOptionsContext()` from [hmplot/compound](package-compound)'s `composition`; `composition` exports `IntegerType`, `SelectType` and `FieldType` too.

The constructor's params are `defaultValue`, `label` (default: from the setting's name), `ui` (an object merged into the control's spec, or `false` for no control) and `transform`; the numeric types also take `min`, `max` and `step`, and `SelectType` takes `options`. The types' other members (the GPU nodes a setting feeds, its uniform type) are internal to the marks and may change.
