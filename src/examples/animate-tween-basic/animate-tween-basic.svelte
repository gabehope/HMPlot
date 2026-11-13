<script>
  import { Button, Calculate, Data, InputContext, Plot, Points, Text, animate, divide, equal, floor, input, multiply,
    subtract, tween, where } from "hmplot";
  const steps = Array.from({ length: 11 }, (_, i) => i / 10);
  const paths = { x: [...steps.map(() => 1), ...steps.map(() => 2)], y: [...steps.map((t) => 1000 ** t), ...steps.map((t) => 1 + 999 * t)] };
  const labels = { x: [1, 2], y: [1000, 1000], text: ["animate()", "tween()"] };
  const up = subtract(input.move, multiply(floor(divide(input.move, 2)), 2));
</script>

<!-- Each press moves a point between 1 and 1000 on a log axis. animate() moves in the axis's scale,
  by equal ratios; tween() moves the value itself, by equal steps, so it passes 100 a tenth of the
  way. The gray dots mark each tenth of the way. -->
<InputContext>
  <Button name="move" label="Move" />
  <Plot height={320} axes2d x={{ domain: [0.5, 2.8], visible: false }} y={{ domain: [1, 1000], transform: "log" }}>
    <Data value={paths}>
      <Points x="x" y="y" size={3} fill="#c3ccd5" />
    </Data>
    <Data value={labels}>
      <Text x="x" y="y" text="text" dx={12} align="left" size={13} />
    </Data>
    <Data value={{ row: [0] }}>
      <Calculate columns={{ v: where(equal(up, 1), 1000, 1) }}>
        <Points x={1} y={animate("v", { duration: 2000 })} size={7} fill="#547ba2" />
        <Points x={2} y={tween("v", { duration: 2000 })} size={7} fill="#cf8955" />
      </Calculate>
    </Data>
  </Plot>
</InputContext>
