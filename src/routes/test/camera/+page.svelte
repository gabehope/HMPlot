<script>
  // Stage 9 / 9D fixtures: a flyover plot (speed from the page), an orbit plot with camera
  // props, and a "lab" plot whose type, mode, lens, and animation settings the tests change.
  import { onMount } from "svelte";
  import { Plot, Points } from "$lib/index";
  import { Vector3 } from "three/webgpu";
  let fly = $state(), orbit = $state(), lab = $state();
  let flyMark = $state(), orbitMark = $state(), labMark = $state();
  let speed = $state(1), fov = $state(40), changes = $state(0), last = $state(null);
  let orbitUp = $state(undefined), orbitPosition = $state([60, 40, 60]);
  let labType = $state("3d"), labMode = $state("orbit"), labNear = $state(undefined), labFar = $state(undefined),
    labDuration = $state(300), labPosition = $state([100, 0, 30]), labTarget = $state([5, 0, 0]);
  const marks = { fly: () => flyMark, orbit: () => orbitMark, lab: () => labMark };
  const threeCamera = (key) => marks[key]()?.getMark()?.view.navigation.controls.current?.object;
  onMount(() => {
    window.cameraFixture = {
      get fly() { return fly; }, get orbit() { return orbit; }, get lab() { return lab; },
      setSpeed: (value) => (speed = value), setFov: (value) => (fov = value),
      setOrbitUp: (value) => (orbitUp = value), setOrbitPosition: (value) => (orbitPosition = value),
      setLab: (patch) => {
        if ("type" in patch) labType = patch.type;
        if ("mode" in patch) labMode = patch.mode;
        if ("near" in patch) labNear = patch.near;
        if ("far" in patch) labFar = patch.far;
        if ("duration" in patch) labDuration = patch.duration;
        if ("position" in patch) labPosition = patch.position;
        if ("target" in patch) labTarget = patch.target;
      },
      /** Client pixel of a world point through the plot's real camera. */
      project: (key, point) => {
        const camera = threeCamera(key);
        camera.updateMatrixWorld();
        const v = new Vector3(...point).project(camera);
        const rect = marks[key]().getMark().renderer.domElement.getBoundingClientRect();
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, depth: v.z };
      },
      /** The point of the y = 0 ground plane under a client pixel, through the plot's real camera. */
      groundAt: (key, x, y) => {
        const camera = threeCamera(key);
        camera.updateMatrixWorld();
        const rect = marks[key]().getMark().renderer.domElement.getBoundingClientRect();
        const ray = new Vector3((2 * (x - rect.left)) / rect.width - 1, 1 - (2 * (y - rect.top)) / rect.height, 0.5)
          .unproject(camera).sub(camera.position).normalize();
        return camera.position.clone().addScaledVector(ray, -camera.position.y / ray.y).toArray();
      },
      /** projectionMatrix[1][1] = 1 / tan(fov / 2): the vertical focal length. */
      focal: (key) => threeCamera(key).projectionMatrix.elements[5],
      get changes() { return changes; }, get last() { return last; },
    };
    return () => { delete window.cameraFixture; };
  });
  const points = [[-20, 0, -20], [20, 0, -20], [0, 20, 0], [-20, 0, 20], [20, 0, 20]];
</script>
<Plot bind:this={fly} name="Fly" type="3d-y-up" cameraMode="flyover" flySpeed={speed} width={500} height={320}
  cameraPosition={[0, 20, 120]} cameraTarget={[0, 0, 0]}
  oncamerachange={(camera) => { changes++; last = camera; }}>
  <Points bind:this={flyMark} position={points} size={6} fill="#547ba2" />
</Plot>
<Plot bind:this={orbit} type="3d-y-up" width={500} height={320} cameraFov={fov}
  cameraPosition={orbitPosition} cameraTarget={[5, 0, 0]} cameraUp={orbitUp}>
  <Points bind:this={orbitMark} position={points} size={6} fill="#c0504d" />
</Plot>
<Plot bind:this={lab} name="Lab" type={labType} width={500} height={320} cameraMode={labMode} overview
  cameraPosition={labPosition} cameraTarget={labTarget} cameraUp={[0, 0, 1]}
  cameraNear={labNear} cameraFar={labFar} animationDuration={labDuration}>
  <Points bind:this={labMark} position={points} size={6} fill="#4f9d69" />
</Plot>
