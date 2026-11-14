const e=`<script>
  import { InputContext, Slider, Button, Theme, themes, Data, Simulate, Plot, Points, continuous,
    input, prev, col, view, add, subtract, multiply, divide, sin, cos, where, greater, logical_and } from "hmplot";

  // 45,000 particles in the double gyre (Shadden, Lekien and Marsden, 2005), a standard
  // model of mixing in ocean flows: two eddies side by side in a [0, 2] x [0, 1] basin, whose shared
  // boundary wobbles back and forth by epsilon. Simulate moves every particle on the GPU, a
  // midpoint step every 16 ms; a brush drops dye that the particles carry downstream.

  // A grid of 300 x 150 particles over the basin.
  const particles = {
    x: Float32Array.from({ length: 300 * 150 }, (_, i) => ((i % 300) + 0.5) / 150),
    y: Float32Array.from({ length: 300 * 150 }, (_, i) => (Math.floor(i / 300) + 0.5) / 150),
  };

  const A = 0.1, OMEGA = 2 * Math.PI / 10, SPEED = 3; // SPEED: units of flow time a second
  const t = multiply(divide(view.time, 1000), SPEED);
  const a = multiply(input.epsilon, sin(multiply(OMEGA, t)));
  const b = subtract(1, multiply(2, a));
  const velocity = (x, y) => {
    const f = add(multiply(multiply(a, x), x), multiply(b, x));
    return [
      multiply(multiply(-Math.PI * A, sin(multiply(Math.PI, f))), cos(multiply(Math.PI, y))),
      multiply(multiply(multiply(Math.PI * A, cos(multiply(Math.PI, f))), sin(multiply(Math.PI, y))),
        add(multiply(multiply(2, a), x), b)),
    ];
  };
  const H = 0.016 * SPEED;
  const [u, v] = velocity(prev("x"), prev("y"));
  const [mu, mv] = velocity(add(prev("x"), multiply(H / 2, u)), add(prev("y"), multiply(H / 2, v)));
  // A particle inside the brush takes up dye (1), which then fades by 0.2% a step. With no brush,
  // view.brushed is 1 everywhere, so any_brushed asks for a brush first.
  const dyed = logical_and(view.brushed, view.any_brushed);
  const update = { x: add(prev("x"), multiply(H, mu)), y: add(prev("y"), multiply(H, mv)),
    dye: where(dyed, 1, multiply(prev("dye"), 0.998)), start: prev("start") };
  // Where each particle started, sky blue at the left wall to violet at the right (0 to 0.25),
  // and dye in warm colors over it (0.5 to 1).
  const color = where(greater(col.dye, 0.02), add(0.5, multiply(0.5, col.dye)), col.start);
  const colors = continuous({ domain: [0, 1], colormap: ["#2ec4f1", "#9b5de5", "#e8336d", "#ff8c32", "#ffd23f"] });
<\/script>

<InputContext>
  <div class="scene">
    <p>45,000 particles in the <em>double gyre</em>, a standard model of mixing in ocean flows: two eddies side by side, whose shared boundary wobbles back and forth. Each particle is colored by where it started, sky blue at the left wall to violet at the right; the wobble folds the two eddies into each other. <strong>Shift-drag</strong> a box to drop dye: every particle that passes through it turns gold and carries the dye downstream, stretched into thin filaments. Set the wobble to 0 and the eddies never mix. Escape or a click outside the box clears it.</p>
    <div class="controls">
      <Slider name="epsilon" label="Wobble ε" min={0} max={0.5} step={0.01} value={0.25} />
      <Button name="reset" label="Start again" />
    </div>
    <Theme value={themes.dark}>
      <Data value={particles}>
        <Simulate initial={{ x: "x", y: "y", dye: 0, start: divide(col.x, 8) }} {update} reset={input.reset} step={16}>
          <Plot height={420} x={{ domain: [0, 2] }} y={{ domain: [0, 1] }}>
            <!-- respond={false}: the brush feeds the dye, and leaves the other particles lit. -->
            <Points x="x" y="y" fill={color} fillScale={colors} size={2} opacity={0.9} brush respond={false}
              legend={false} />
          </Plot>
        </Simulate>
      </Data>
    </Theme>
  </div>
</InputContext>

<style>
  /* Python's Scene(gap=12) and Row(wrap=True, min_width=0). */
  .scene { display: flex; flex-direction: column; gap: 12px; }
  .scene p { margin: 0; }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 20px; }
</style>
`;export{e as default};
