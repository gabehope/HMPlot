# Expression functions

Arithmetic, comparisons, logic, math and missing values, per row on the GPU wherever a column goes.

## Example

```python
with hm.Calculate(density=hm.col.mass / hm.col.volume):
    with hm.Filter(where=hm.is_finite("density") & (hm.col.density >= 1)):
        hm.Points(x="volume", y="density")
```

## Functions

- `hm.add(a, b)` (`number`): a + b. A datetime plus a number of milliseconds stays a datetime. Python: a + b.
- `hm.row()` (`number`): Zero-based position among visible rows. Calculate before filtering to preserve source positions; Data(rows=N) supplies rows without a table.
- `hm.random(seed=0, distribution='uniform')` (`number`): One deterministic draw per input row: uniform [0, 1), standard normal or mean-one exponential. Seed defaults to 0; use distinct seeds for independent streams and Calculate before Filter/Sample to preserve source-row draws.
- `hm.subtract(a, b)` (`number`): a − b. Two datetimes give milliseconds; a datetime minus a number stays a datetime. Python: a - b.
- `hm.multiply(a, b)` (`number`): a × b. Python: a * b.
- `hm.divide(a, b)` (`number`): a ÷ b, in float32: x ÷ 0 is ±Infinity and 0 ÷ 0 is NaN. Python: a / b.
- `hm.power(a, b)` (`number`): a to the power b. Python: a ** b.
- `hm.negative(a)` (`number`): −a. Python: -a.
- `hm.abs(a)` (`number`): The absolute value of a.
- `hm.square(a)` (`number`): a².
- `hm.sqrt(a)` (`number`): The square root of a; NaN below 0.
- `hm.log(a)` (`number`): The natural logarithm of a; −Infinity at 0 and NaN below it.
- `hm.exp(a)` (`number`): e to the power a.
- `hm.sin(a)` (`number`): The sine of a, in radians.
- `hm.cos(a)` (`number`): The cosine of a, in radians.
- `hm.floor(a)` (`number`): The largest integer not above a.
- `hm.round(a)` (`number`): a rounded to the nearest integer, ties to even (0.5 is 0, 1.5 is 2), as NumPy does.
- `hm.minimum(a, b)` (`number`): The smaller of a and b in each row; of two datetimes, a datetime.
- `hm.maximum(a, b)` (`number`): The larger of a and b in each row; of two datetimes, a datetime.
- `hm.clip(a, low, high)` (`number`): a limited to [low, high].
- `hm.equal(a, b)` (`boolean`): Whether a equals b. A category column compares with a category by value: equal("species", literal("Adelie")). Python: a == b.
- `hm.not_equal(a, b)` (`boolean`): Whether a differs from b. Python: a != b.
- `hm.less(a, b)` (`boolean`): Whether a < b. Python: a < b.
- `hm.less_equal(a, b)` (`boolean`): Whether a ≤ b. Python: a <= b.
- `hm.greater(a, b)` (`boolean`): Whether a > b. Python: a > b.
- `hm.greater_equal(a, b)` (`boolean`): Whether a ≥ b. Python: a >= b.
- `hm.logical_and(a, b)` (`boolean`): Whether both are true (nonzero). Python: a & b, with parentheses around comparisons.
- `hm.logical_or(a, b)` (`boolean`): Whether either is true (nonzero). Python: a | b.
- `hm.logical_not(a)` (`boolean`): Whether a is false (zero). Python: ~a.
- `hm.where(condition, a, b)` (`number`): a where condition is true (nonzero), else b, row by row.
- `hm.is_missing(a)` (`boolean`): Whether a is missing: NaN or ±Infinity in a numeric column, a missing category in a categorical one.
- `hm.is_finite(a)` (`boolean`): The opposite of is_missing: a finite number, or a present category.
- `hm.coalesce(a, fallback)` (`number`): a where it is a finite number, else fallback (a number or another column).
- `hm.is_in(value, values)` (`boolean`): Whether a is one of values: a list of numbers or categories (categories compare by value), or a multiple Select's input. An empty list is false everywhere.

## Usage

An expression is computed for every row on the GPU, wherever a column goes: a mark channel, a `Calculate` column, a `Filter` condition or a transform parameter. Its arguments are columns, other expressions, numbers, [input reads and state](names) such as `input("threshold")` and `view.time`. Inside an expression a string is always a column, so `greater("mass", 50)` compares the column mass with 50, and text or a category is written `literal("Adelie")`. One expression holds at most 256 operations, nested at most 64 deep.

Python writes most of them as operators on columns: `hm.col.mass / hm.col.volume`, `hm.col.x >= 1`, `(hm.col.a > 0) & (hm.col.b > 0)`, `~hm.is_missing("x")`. Use `&`, `|` and `~` with parentheses around comparisons: `and`, `or`, `not` and chained comparisons are errors. `hm.round` (like `hm.min`, `hm.max` and `hm.sum`, the [reductions](reductions)) is left out of `from hmplot import *`, which would hide Python's own.

Values are float32. Comparisons, the logic functions, `is_missing`, `is_finite` and `is_in` give booleans: a `Filter` keeps the rows where its condition is true, and in arithmetic true is 1. A missing number is NaN: arithmetic with it is NaN and a comparison with it is false, so `coalesce(x, 0)` or `where(is_missing(x), 0, x)` give it a value. A category column compares by its categories, `equal(col.species, literal("Adelie"))` (Python `hm.col.species == hm.literal("Adelie")`) or `is_in("species", ["Adelie", "Gentoo"])`; a number or boolean names a category of a numeric or boolean category column directly. A datetime column takes part in milliseconds: adding a number keeps it a datetime, and two datetimes subtract to milliseconds.

A changed number in an expression (a slider's value, a new threshold) reaches the GPU as a value, not as new code, so moving it compiles nothing. See [Reductions](reductions) for whole-column values, [Calendar functions](calendar-functions) for dates and [Casts](casts) for types.

### Seeded random values

`random({seed: 7, distribution: "normal"})` (Python:
`hm.random(seed=7, distribution="normal")`) produces one float32 draw per input row. The
default distribution is `"uniform"` in [0, 1); `"normal"` has mean 0 and variance 1, and
`"exponential"` has mean 1. Multiply or add ordinary expressions to scale or shift them.

The default seed is 0. The same seed, distribution and input row count reproduce the same
values, including in exports. Use different seeds for independent streams. Seeds must be
integers from 0 to 4294967295 and may read a scalar input; table columns cannot supply seeds.
Reading the expression again does not advance a random generator. A changed seed,
distribution or row count produces new values; an unchanged configuration reuses its cached
GPU array in `Calculate`.

Values are assigned by input row position. Calculate them before `Filter`, `Sort` or `Sample`
when they should follow the original observations through those transforms. A masked
`Calculate` evaluates every physical row, including hidden rows, rather than resampling a
smaller selection bucket. Rewriting a grid coordinate with per-row randomness drops the
coordinate grid; random value fields preserve it. [Ten million stars](/HMPlot/examples/ten-million-stars.md)
uses seeded uniform, normal and exponential streams to generate both linked views on the GPU.

## Related examples

- [Calculated scatterplot matrix](/HMPlot/examples/calculate-matrix.md)
- [Respond only while active](/HMPlot/examples/any-interaction-columns.md)
- [Filter and bin inputs](/HMPlot/examples/transform-controls.md)
