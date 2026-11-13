<script>
  import { Plot, Frame, Anchor, Points, Segments, connect } from "$lib/index";
  let plot = $state(), source = $state(), target = $state(), connector = $state();
  let center = $state([0, 0]);
  const rows = { id: [1], angle: [6], radius: [1], tx: [-0.8], ty: [-0.7] };
  $effect(() => {
    window.stage14ConnectionsMixed = {
      get plot() { return plot; }, get source() { return source; },
      get target() { return target; }, get connector() { return connector; },
      center(value) { center = value; },
    };
    return () => { delete window.stage14ConnectionsMixed; };
  });
</script>

<Plot bind:this={plot} data={rows} type="2d" axes2d={false}
  width={400} height={400} x={{ domain: [-2, 2] }} y={{ domain: [-2, 2] }}>
  <Frame coordinates="spherical" projection="orthographic" projectionCenter={center} radialScale={0}
    x={{ domain: [-180, 180], range: [-2, 2], visible: false }}
    y={{ domain: [-90, 90], range: [-2, 2], visible: false }}>
    <Frame coordinates="cartesian"
      x={{ domain: [0, 4], range: [0, 45], transform: "sqrt", visible: false }}
      y={{ domain: [1, 100], range: [1, 30], transform: "log", visible: false }}>
      <Frame coordinates="polar" angleUnit="custom" anglePeriod={24} radialScale={1}
        x={{ domain: [0, 24], range: [0, 4], visible: false }}
        y={{ domain: [0, 1], range: [1, 5], visible: false }}>
        <Anchor bind:this={source} x="angle" y="radius" />
        <Points x="angle" y="radius" size={5} fill="#e02b32" />
      </Frame>
    </Frame>
  </Frame>
  <Points bind:this={target} x="tx" y="ty" size={5} fill="#2665de" />
  <Segments bind:this={connector} connections={connect(source, target, { key: "id" })}
    color="#159e46" width={3} />
</Plot>
