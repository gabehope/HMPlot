# literal

A constant, even where a column of that name exists.

## Example

```python
hm.Points(x="x", y="y", fill=hm.literal("white"))
```

## Parameters

- `value` (`any`): The value to use as it is, never as a column name.

## Usage

Matching columns normally take precedence in data-bearing string properties. Wrap a CSS color or other literal when its name collides with a column. Structural settings such as names and labels do not need this wrapper.
