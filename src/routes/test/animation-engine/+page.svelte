<script>
  // Stage 13 fixtures: animate() in scale space, tween in Calculate, @time channels,
  // enter/exit values, and the frozen clock used by exports.
  import { onMount } from "svelte";
  import { Plot, Calculate, Points, animate, tween, add, multiply, sin, divide } from "$lib/index";
  let logPlot = $state(), logPoints = $state(), tweenPlot = $state(), tweenPoints = $state(),
    orbitPlot = $state(), orbitPoints = $state(), keyedPlot = $state(), keyedPoints = $state(),
    rgbPlot = $state(), rgbPoints = $state();
  let logRows = $state({ x: [1, 2, 3], y: [1, 1, 1] });
  let tweenRows = $state({ x: [1, 2, 3], v: [0, 0, 0] });
  let keyedRows = $state({ id: ["a", "b", "c"], x: [1, 2, 3], y: [5, 5, 5] });
  const orbitRows = { i: [0, 1, 2, 3], r: [1, 2, 3, 4] };
  // 7C A13: animate() on an RGB fill times the categoryColor field it writes.
  let rgbRows = $state({ x: [1, 2, 3], y: [1, 1, 1], r: [1, 1, 1], g: [0, 0, 0], b: [0, 0, 0] });
  // Read a mark's live position (or other) buffer and its transition progress in the same tick.
  async function readPosition(handle, name = "position") {
    const mark = handle.getMark();
    const field = mark.fields.get(name), attribute = field.bufferNodeSource;
    const renderer = mark.renderer, device = renderer.backend.device;
    const gpu = renderer.backend.get(attribute).buffer;
    const count = field.count, stride = 4, bytes = count * stride * 4;
    const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const transition = attribute.transition;
    const progress = transition ? transition.clock.progress(transition) : null;
    // Capture membership with the queued copy: a slow staging map can finish after
    // the transition has landed, while its copied rows still describe an earlier frame.
    const active = !!transition && transition.clock.tracks.has(transition);
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpu, 0, staging, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const values = Array.from(new Float32Array(staging.getMappedRange()));
    staging.destroy();
    const rows = [];
    for (let i = 0; i < count; i++) rows.push(values.slice(i * stride, i * stride + 3));
    return { rows, progress, active };
  }
  onMount(() => {
    window.animationEngine = {
      get logPlot() { return logPlot; }, get logPoints() { return logPoints; },
      get tweenPlot() { return tweenPlot; }, get tweenPoints() { return tweenPoints; },
      get orbitPlot() { return orbitPlot; }, get orbitPoints() { return orbitPoints; },
      get keyedPlot() { return keyedPlot; }, get keyedPoints() { return keyedPoints; },
      get rgbPlot() { return rgbPlot; }, get rgbPoints() { return rgbPoints; },
      readPosition,
      raiseLog: () => { logRows = { x: [1, 2, 3], y: [100, 100, 100] }; },
      raiseTween: () => { tweenRows = { x: [1, 2, 3], v: [10, 10, 10] }; },
      dropKeyed: () => { keyedRows = { id: ["a", "c", "d"], x: [1, 3, 4], y: [5, 5, 5] }; },
      blueRgb: () => { rgbRows = { x: [1, 2, 3], y: [1, 1, 1], r: [0, 0, 0], g: [0, 0, 0], b: [1, 1, 1] }; },
      moveRgb: () => { rgbRows = { ...rgbRows, x: [1.1, 2.1, 3.1] }; },
      redRgb: () => { rgbRows = { ...rgbRows, r: [1, 1, 1], g: [0, 0, 0], b: [0, 0, 0] }; },
    };
    return () => { delete window.animationEngine; };
  });
</script>

<h3>animate on y under a log axis</h3>
<div data-fixture="log">
  <Plot bind:this={logPlot} data={logRows} width={360} height={220} axes2d
    x={{ domain: [0, 4] }} y={{ domain: [0.5, 200], transform: "log" }}>
    <Points bind:this={logPoints} x="x" y={animate("y", { duration: 1500, easing: "linear" })} size={4} />
  </Plot>
</div>

<h3>tween in a Calculate</h3>
<div data-fixture="tween">
  <Plot bind:this={tweenPlot} data={tweenRows} width={360} height={220} axes2d
    x={{ domain: [0, 4] }} y={{ domain: [-1, 25] }}>
    <Calculate columns={{ doubled: multiply(tween("v", { duration: 1500, easing: "linear" }), 2) }}>
      <Points bind:this={tweenPoints} x="x" y="doubled" size={4} />
    </Calculate>
  </Plot>
</div>

<h3>@time orbit</h3>
<div data-fixture="orbit">
  <Plot bind:this={orbitPlot} data={orbitRows} width={360} height={220} axes2d
    x={{ domain: [-5, 5] }} y={{ domain: [-5, 5] }}>
    <Points bind:this={orbitPoints}
      x={multiply("r", sin(add(divide("@time", 1000), "i")))}
      y={multiply("r", sin(add(divide("@time", 1000), add("i", 1.5708))))}
      size={4} />
  </Plot>
</div>

<h3>enter and exit values on a keyed table</h3>
<div data-fixture="keyed">
  <Plot bind:this={keyedPlot} data={keyedRows} key="id" width={360} height={220} axes2d
    x={{ domain: [0, 5] }} y={{ domain: [-1, 11] }}>
    <Points bind:this={keyedPoints} x="x" y={animate("y", { duration: 1500, easing: "linear", enter: 0, exit: 10 })} size={4} />
  </Plot>
</div>

<h3>animate on an RGB fill</h3>
<div data-fixture="rgb">
  <Plot bind:this={rgbPlot} data={rgbRows} width={360} height={220} axes2d
    x={{ domain: [0, 4] }} y={{ domain: [0, 2] }}>
    <Points bind:this={rgbPoints} x="x" y="y" fill={animate({ r: "r", g: "g", b: "b" }, { duration: 1500, easing: "linear" })} size={4} />
  </Plot>
</div>
