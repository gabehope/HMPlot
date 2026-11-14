# Casts

as_category, as_ordinal, as_numeric, as_datetime and as_duration: a value's type for one use.

## Example

```python
hm.Points(x=hm.as_category("year"), y="value")
```

## Functions

- `hm.as_category(value, domain=None)` (`category`): Categories: with a domain, those in that order and other values missing (matched on the GPU); without one, the distinct values, numbers ascending.
- `hm.as_ordinal(value, domain=None)` (`ordered category`): Ordered categories, as as_category; text needs a domain (its alphabetical order is rarely right).
- `hm.as_numeric(value)` (`number`): Text parsed as numbers (once per category), booleans as 0 and 1.
- `hm.as_datetime(value, unit=None, timezone=None)` (`datetime`): Numbers in unit (ms by default; ns, us, ms, s, m, h or d) or ISO 8601 text, as times shown in timezone (UTC by default).
- `hm.as_duration(value, unit=None)` (`duration`): Numbers in unit (ms by default) as durations.

## Usage

A schema types a column for its whole scope; a cast types one use of a value. `as_category` and `as_ordinal` make categories, `as_numeric` numbers, `as_datetime` times and `as_duration` durations, and the result carries its type to the axis, scale, legend and tooltip that show it. A domain fixes the categories and their order and is matched on the GPU; text is parsed once per category, never per row.

## Related examples

- [Categorical and datetime frames](/HMPlot/examples/typed-axes.md)
