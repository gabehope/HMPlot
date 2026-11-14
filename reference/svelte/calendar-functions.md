# Calendar functions

year, month, weekday, time_floor and the other functions of a datetime column, on the GPU.

## Example

```svelte
<Calculate columns={{ month: month_name("date") }}>…</Calculate>
```

## Functions

- `year(t, {tz})` (`number`): The year.
- `quarter(t, {tz})` (`number`): The quarter, 1 to 4.
- `month(t, {tz})` (`number`): The month, 1 to 12.
- `week(t, {tz})` (`number`): The ISO week, 1 to 53 (weeks start on Monday).
- `day(t, {tz})` (`number`): The day of the month, 1 to 31.
- `weekday(t, {tz})` (`number`): The day of the week, Monday 0 to Sunday 6.
- `day_of_year(t, {tz})` (`number`): The day of the year, 1 to 366.
- `hour(t, {tz})` (`number`): The hour, 0 to 23.
- `minute(t, {tz})` (`number`): The minute, 0 to 59.
- `second(t, {tz})` (`number`): The second, 0 to 59.
- `month_name(t, {tz})` (`ordered category`): "Jan" to "Dec", ordered January first.
- `day_name(t, {tz})` (`ordered category`): "Mon" to "Sun", ordered Monday first.
- `time_floor(t, interval, {tz})` (`datetime`): The start of the calendar interval each time falls in: "15 minutes", "1 day", "1 week" (from Monday), "1 month", "1 year".

## Usage

Calendar functions read a datetime column and run on the GPU with the rest of an expression: in a `Calculate` column, a `Filter` condition or a mark channel. `year`, `quarter`, `month`, `week` (ISO), `day`, `weekday` (Monday is 0), `day_of_year`, `hour`, `minute` and `second` give numbers; `month_name` and `day_name` give ordered categories, so a `Group` by them lists January first and Monday first; `time_floor(t, "1 month")` gives the start of the month (or week, day, hour...) each time falls in, and stays a time.

They work in the column's time zone (a time-zone-aware pandas, Polars or Arrow column carries one; JavaScript Dates and naive times are UTC) unless `{ tz }` names another. A zone's changes of UTC offset over the column's range become one table on the GPU, so a zone costs nothing per row.

## Related examples

- [Calendar functions and a Playback over dates](/HMPlot/examples/calendar.md)
- [Days of the week and calendar months](/HMPlot/examples/weekdays.md)
