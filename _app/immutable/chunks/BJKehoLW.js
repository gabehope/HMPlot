const n=`<script>
  import { Checkbox, InputContext, Data, row, Plot, Points, Simulate, add, cos, divide, multiply, prev, sin, input, subtract } from "hmplot";
  const radius = add(row(), 1), speed = subtract(3, row());
  // Each step, a row's angle moves on by its speed (radians per second) times the step.
  const angle = add(prev("angle"), multiply(speed, divide("@dt", 1000)));
<\/script>

<InputContext>
<Checkbox name="running" label="Run simulation" value={false} />
<Data rows={3}>
  <Simulate initial={{ angle: 0 }} update={{ angle }} running={input.running}>
    <Plot height={300} axes2d x={{ domain: [-4, 4] }} y={{ domain: [-4, 4] }}>
      <Points x={multiply(radius, cos("angle"))} y={multiply(radius, sin("angle"))} />
    </Plot>
  </Simulate>
</Data>
</InputContext>
`;export{n as default};
