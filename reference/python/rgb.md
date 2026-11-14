# rgb

Color each row from red, green and blue columns: 0-255 for integers, 0-1 for floats.

## Example

```python
hm.Points(x="x", y="y", fill=hm.rgb("red", "green", "blue"))
```

## Parameters

- `r, g, b` (`column`): The red, green and blue columns (or arrays).
- `a` (`column`): Optional alpha: the row's opacity.

## Usage

Give `fill`, `color`, or `outlineColor` an `{r, g, b, a?}` object naming columns, or an N x 3 / N x 4 array, to color each row directly. Integer data is 0-255 and float data 0-1; values outside the range, or a mix of integer and float components, raise an error naming the channel. Python uses `hm.rgb("red", "green", "blue")` or a NumPy array. RGB colors skip scales, colormaps, and legends. A fourth channel is per-row opacity on point marks and labels. Plots draw these colors exactly by default (no tone mapping).

## Related examples

- [RGB colors from data](/HMPlot/examples/rgb-points.md)
