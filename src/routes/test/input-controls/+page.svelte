<script>
  import { Plot, Points, InputContext, Slider, TextInput, ColorPicker, DateTimeInput, Theme, input, Select, Data, Filter, categories, col, is_in, min, max } from "$lib";
  let plot = $state(), range, text, color, date, speed;
  let groupPlot = $state(), groupSelect = $state();
  let months;
  let dates = $state({ t: [new Date("2024-01-01Z"), new Date("2024-03-01Z")] });
  let groups = $state({ x: [1, 2, 3], y: [1, 2, 3], group: ["a", "b", "c"] });
  let windowValue = $state([2, 8]);
  let bounds = $state([0, 10]), zone = $state("America/New_York");
  $effect(() => {
    window.inputControls = { plot, range, text, color, date, speed, groupPlot, groupSelect, months,
      replaceDates: () => dates = { t: [new Date("2024-03-01Z"), new Date("2024-04-01Z")] },
      replaceGroups: () => groups = { x: [1, 3], y: [1, 3], group: ["a", "c"] },
      bounds: (next) => bounds = next, zone: (next) => zone = next };
    return () => { delete window.inputControls; };
  });
</script>

<InputContext>
  <Slider bind:this={range} name="window" label="Window" min={bounds[0]} max={bounds[1]} step={1} bind:value={windowValue} />
  <Theme value={{ extends: "hmplot", controls: { accentColor: "#e4572e", fontSize: 15 } }}>
    <Slider bind:this={speed} name="speed" label="Speed" min={0} max={20000} value={12345.678} />
  </Theme>
  <TextInput bind:this={text} name="caption" label="Caption" value="Observations" placeholder="Plot title" />
  <ColorPicker bind:this={color} name="ink" label="Ink" value="#4f7dff" />
  <DateTimeInput bind:this={date} name="date" label="Date" value={new Date("2024-06-01T16:30:00Z")} timezone={zone} />
  <Plot bind:this={plot} data={{ x: [3, 5, 7], y: [1, 2, 1] }} title={"{$caption}"}
    height={350} axes2d x={{ domain: windowValue }} y={{ domain: [0, 3] }} toneMapping={0}>
    <Points x="x" y="y" size={20} fill={input("ink")} />
  </Plot>
  <Data value={groups}>
    <Select bind:this={groupSelect} name="groups" label="Groups" multiple options={categories("group")} value={["a", "b"]} />
    <Plot bind:this={groupPlot} width={360} height={200} axes2d={false} animation={false}>
      <Filter where={is_in(col("group"), input("groups"))}>
        <Points x="x" y="y" size={10} />
      </Filter>
    </Plot>
  </Data>
  <Data value={dates}>
    <Slider bind:this={months} name="months" label="Months" min={min("t")} max={max("t")}
      value={[new Date("2024-01-01Z"), new Date("2024-03-01Z")]} step="1 month" format="%b %Y" />
  </Data>
</InputContext>
