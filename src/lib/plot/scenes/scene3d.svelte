<script>
  import { useViewServices } from "../utils/viewServices.js";
  import { T, useThrelte } from "@threlte/core";
  import { getOptionsContext } from "../utils/context.js";
  import { OrbitControls } from "@threlte/extras";
  import { Vector3 } from "three/webgpu";
  import { createFlyoverControls } from "./flyoverControls.js";
  import { syncOrbitUp } from "./orbitUp.js";
  import { ease } from "../utils/animation.js";
  import {
    resolveCameraState, validateCameraPatch, lerpCamera, cameraDefaults, cameraPropsIssue, explicitCameraKey,
  } from "../utils/camera.js";
  import {
    SphereGeometry,
    MeshBasicMaterial,
    FrontSide,
  } from "three/webgpu";
  import { onDestroy, untrack } from "svelte";
  import { reportDataError } from "../utils/dataErrors.js";
  import { trackPreparation } from '../rendering/viewSettlement.js';
  import { aspect3dMetric, register3dDisplayScene } from "../utils/aspect3d.js";
  import { viewContextOf } from "../utils/viewContext.js";

  let {
    interactive = true, fitRevision = 0, cameraMemory = {}, cameraMode = "orbit",
    cameraPosition = undefined, cameraTarget = undefined, cameraUp = undefined,
    cameraFov = undefined, cameraNear = undefined, cameraFar = undefined,
    flySpeed = 1, flyoverMomentum = true, oncamerachange = undefined, animationDuration = 300, animationEasing = "cubic-in-out",
    // Camera props that change ease there over animationDuration (TODO 136.14: the Plot's
    // animation is on); the viewer's input cancels the move where it is.
    animateCamera = false,
  } = $props();

  const coordinateOptions = getOptionsContext();
  const localOptions = getOptionsContext().ensureChild("scene3d");

  const { renderer, invalidate, scene } = useThrelte();
  const viewServices = useViewServices();
  onDestroy(register3dDisplayScene(coordinateOptions, scene, viewServices));
  onDestroy(coordinateOptions.child("plot").on(() => {
    viewServices.drawing.revision++;
    invalidate();
  }, "aspect"));
  let orbitControls = $state();
  let flyControls = $state();
  const controls = $derived(cameraMode === "flyover" ? flyControls : orbitControls);
  let camera = $state();
  // Globe views have no ground plane: flyover pans at a rate and dollies along the view there.
  const groundPlane = () =>
    !(coordinateOptions.get("coordinates") === "spherical" && coordinateOptions.get("sphericalView") !== "projected");
  $effect(() => {
    if (cameraMode !== "flyover" || !camera || !renderer.domElement) return;
    // The camera keeps its up vector (cameraUp, spherical views) when flyover starts, and the
    // target carries over from the previous controls (A11).
    const fly = createFlyoverControls(camera, renderer.domElement, invalidate, {
      onChange: () => emitChange(), onInput: () => finishTransition(), target: untrack(() => previousControls?.target),
      ground: untrack(groundPlane), enabled: untrack(() => interactive), speed: untrack(() => flySpeed),
      // A glide (TODO 66.6) is work the plot's whenSettled and exports wait for: it ends in 1.5 s.
      momentum: untrack(() => flyoverMomentum), onGlide: (done) => trackPreparation(viewServices, done),
    });
    flyControls = fly;
    return () => {
      fly.dispose();
      if (flyControls === fly) flyControls = undefined;
    };
  });
  $effect(() => { if (flyControls) flyControls.speed = flySpeed; });
  $effect(() => { if (flyControls) flyControls.momentum = flyoverMomentum; });
  $effect(() => { if (flyControls) flyControls.enabled = interactive; });
  $effect(() => { coordinateRevision; if (flyControls) flyControls.ground = groundPlane(); });
  // Leaving orbit disposes its controls at once: Threlte's deferred disposal left the old
  // OrbitControls capturing pointers on the canvas parent, so flyover never saw pointerup (A12).
  $effect(() => {
    if (cameraMode === "orbit") return;
    const orbit = untrack(() => orbitControls);
    orbit?.dispose?.();
  });
  // oncamerachange: at most once per frame, after orbit or flyover moves the camera. The view's
  // camera listeners (a live VectorTile, TODO 66.1) hear every move at once.
  let changeFrame = 0;
  function emitChange() {
    viewServices.navigation.cameraMoved();
    if (!oncamerachange || changeFrame) return;
    changeFrame = requestAnimationFrame(() => {
      changeFrame = 0;
      if (camera && controls) oncamerachange(cameraState());
    });
  }
  onDestroy(() => {
    cancelAnimationFrame(changeFrame);
    reportDataError(viewServices, reportCamera, "");
  });
  $effect(() => {
    const orbit = orbitControls;
    if (!orbit?.addEventListener) return;
    const listener = () => emitChange();
    const started = () => finishTransition();
    orbit.addEventListener("change", listener);
    orbit.addEventListener("start", started);
    return () => { orbit.removeEventListener("change", listener); orbit.removeEventListener("start", started); };
  });
  function cameraState() {
    return {
      position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray(),
      fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom, mode: cameraMode,
    };
  }
  /** Re-read camera.up into whichever controls are active (flyover keeps its own copy, orbit its quaternion). */
  function syncUp() {
    if (controls?.syncUp) controls.syncUp();
    else if (controls?._quat) syncOrbitUp(controls);
  }
  function applyCamera(state) {
    if (state.position) camera.position.fromArray(state.position);
    if (state.up) { camera.up.fromArray(state.up); syncUp(); }
    if (state.target) controls.target.fromArray(state.target);
    for (const key of ["fov", "near", "far", "zoom"]) if (state[key] !== undefined) camera[key] = state[key];
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
  }
  // One animated setCamera at a time: a newer call or user input settles the pending one
  // where it is (resolved), unmounting rejects it with "camera transition interrupted".
  let transition = 0, pending = null;
  function finishTransition(reason = "") {
    cancelAnimationFrame(transition);
    transition = 0;
    const settle = pending;
    pending = null;
    if (!settle) return;
    if (reason) settle.reject(Error(reason));
    else settle.resolve();
  }
  onDestroy(() => finishTransition("camera transition interrupted"));
  /** Apply a partial camera state now, or animate to it over animationDuration ms. */
  function setCamera(patch, { animate = false } = {}) {
    validateCameraPatch(patch, camera ? { near: camera.near, far: camera.far } : {});
    if (!camera || !controls) throw Error("The 3D camera is not ready yet.");
    finishTransition();
    if (!animate || !(animationDuration > 0)) { applyCamera(patch); return Promise.resolve(); }
    const from = cameraState(), start = performance.now();
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      const step = (now) => {
        const t = Math.min(1, (now - start) / animationDuration);
        applyCamera(lerpCamera(from, patch, ease(t, animationEasing)));
        if (t < 1) transition = requestAnimationFrame(step);
        else { transition = 0; pending = null; resolve(); }
      };
      transition = requestAnimationFrame(step);
    });
  }
  $effect(() => {
    if (!camera || !controls) return;
    return viewServices.navigation.camera.install({ get: cameraState, set: setCamera });
  });
  $effect(() => {
    if (controls) {
      return viewServices.navigation.controls.install(controls);
    }
  });
  let firstCamera = true,
    previousKey,
    previousFit,
    previousCoordinates,
    previousControls;
  // Camera memory: navigation plus the lens, except near/far that came from props (an
  // emptied field must return to the scene-derived value, A6), keyed by the explicit props in
  // effect so a remount under the same props restores the user's navigation (A9).
  const saveCamera = (key) => {
    if (camera && controls && key) {
      const explicit = untrack(explicitCamera);
      cameraMemory[key] = {
        coordinates: coordinateOptions.get("coordinates"),
        position: camera.position.toArray(),
        up: camera.up.toArray(),
        target: controls.target.toArray(),
        fov: camera.fov, zoom: camera.zoom,
        near: explicit.near === undefined ? camera.near : undefined,
        far: explicit.far === undefined ? camera.far : undefined,
        explicit: explicitCameraKey(explicit),
      };
    }
  };
  const explicitCamera = () => ({ position: cameraPosition, target: cameraTarget, up: cameraUp,
    fov: cameraFov, near: cameraNear, far: cameraFar });
  // Invalid camera props report through the plot's render error instead of throwing inside an
  // effect (A5); the camera keeps working with the last valid values.
  let reportedIssue = "";
  function reportCamera(message) {
    if (message === reportedIssue) return;
    reportedIssue = message;
    reportDataError(viewServices, reportCamera, message);
  }
  let coordinateRevision = $state(0);
  const stops = [
    "coordinates",
    "sphericalView",
    "projection",
    "baseRadius",
    "globeBackground",
    "globeBackgroundVisible",
  ].map((key) => coordinateOptions.on(() => coordinateRevision++, key));
  const globeGeometry = new SphereGeometry(1, 128, 64);
  const globeMaterial = new MeshBasicMaterial({
    color: "#e7edf2",
    side: FrontSide,
  });
  onDestroy(() => {
    globeGeometry.dispose();
    globeMaterial.dispose();
  });
  const globe = $derived.by(() => {
    coordinateRevision;
    globeMaterial.color.set(coordinateOptions.get("globeBackground"));
    globeMaterial.needsUpdate = true;
    return {
      visible:
        coordinateOptions.get("coordinates") === "spherical" &&
        coordinateOptions.get("sphericalView") !== "projected" &&
        coordinateOptions.get("globeBackgroundVisible"),
      radius: Math.max(0, coordinateOptions.get("baseRadius") * 0.999),
    };
  });
  onDestroy(() => stops.forEach((stop) => stop()));
  const cameraKey = () =>
    coordinateOptions.get("coordinates") === "spherical" &&
    coordinateOptions.get("sphericalView") === "projected"
      ? "projected"
      : "three";
  const sceneRadius = () =>
    coordinateOptions.get("coordinates") === "spherical"
      ? (Math.max(coordinateOptions.get("baseRadius"),Math.abs(coordinateOptions.get("radialScale")||1)*Math.max(...(viewContextOf(coordinateOptions)?.radialExtent??coordinateOptions.get("zbounds")??[0,1])),1e-3) / 50) *
        (coordinateOptions.get("sphericalView") === "projected" ? 4 : 1)
      : coordinateOptions.get("coordinates") === "cartesian"
        ? Math.max(1e-3, ...aspect3dMetric(viewServices.navigation.rootFrame.current?.() ?? coordinateOptions).display.map(range => Math.abs(range[1] - range[0]) / 100))
        : 1;
  $effect(() => {
    fitRevision;
    coordinateRevision;
    if (camera && controls) {
      const key = cameraKey(),
        coordinates = coordinateOptions.get("coordinates"),
        switching = previousKey !== key,
        fitting = previousFit !== undefined && previousFit !== fitRevision,
        coordinateChange = previousCoordinates !== undefined && previousCoordinates !== coordinates;
      if (switching) saveCamera(previousKey);
      previousKey = key;
      previousFit = fitRevision;
      previousCoordinates = coordinates;
      if (firstCamera || switching || coordinateChange || fitting) {
        // Priority: explicit camera props > the camera remembered for these coordinates >
        // defaults scaled to the scene, except that memory saved under the same props wins.
        // A fit ignores memory and recomputes the position.
        const radius = sceneRadius();
        const memory = !fitting && cameraMemory[key]?.coordinates === coordinates ? cameraMemory[key] : undefined;
        const explicit = untrack(explicitCamera);
        let state;
        try {
          state = resolveCameraState(explicit, memory, radius);
          reportCamera("");
        } catch (error) {
          reportCamera(error.message);
          state = resolveCameraState({}, memory, radius);
        }
        // Fit the same displayed box used by marks and guides. Domain/aspect
        // updates do not enter this branch, preserving user navigation.
        if (coordinates === "cartesian" && !memory) {
          const center = aspect3dMetric(viewServices.navigation.rootFrame.current?.() ?? coordinateOptions).center;
          if (!explicit.target) state.target = center;
          if (!explicit.position) state.position = state.position.map((value, axis) => value + center[axis]);
        }
        camera.position.fromArray(state.position);
        camera.up.fromArray(state.up);
        camera.fov = state.fov; camera.near = state.near; camera.far = state.far;
        camera.zoom = memory?.zoom ?? 1;
        camera.updateProjectionMatrix();
        controls.target.fromArray(state.target);
        syncUp();
        appliedExplicit = explicitCameraKey(explicit);
      } else if (controls !== previousControls) {
        // A controls swap keeps the target: OrbitControls' constructor looked at the origin.
        if (previousControls?.target) controls.target.copy(previousControls.target);
        else {
          const direction = camera.getWorldDirection(new Vector3());
          controls.target.copy(camera.position).addScaledVector(direction, Math.max(1, camera.position.length()));
        }
        syncUp();
      }
      firstCamera = false;
      previousControls = controls;
      controls.update();
    }
  });
  // Camera props changed after mount: apply only the props that changed (a parent
  // re-render with equal arrays must not reset the user's navigation). A cleared near/far/fov
  // returns to the scene-derived default; an invalid value is reported and skipped.
  let appliedExplicit = "", cameraGoal = null;
  $effect(() => {
    const explicit = explicitCamera(), key = explicitCameraKey(explicit);
    if (!camera || !controls || firstCamera || key === appliedExplicit) return;
    const previous = appliedExplicit ? JSON.parse(appliedExplicit) : {};
    appliedExplicit = key;
    untrack(() => {
      const defaults = cameraDefaults(sceneRadius());
      const patch = {};
      for (const [name, value] of Object.entries(explicit)) {
        if (JSON.stringify(value) === JSON.stringify(previous[name])) continue;
        if (value === undefined) { if (["fov", "near", "far"].includes(name)) patch[name] = defaults[name]; }
        else patch[name] = value;
      }
      const issue = cameraPropsIssue(patch, { near: camera.near, far: camera.far });
      reportCamera(issue);
      if (issue) return;
      if (!Object.keys(patch).length) return;
      if (!animateCamera) applyCamera(patch);
      else {
        // The move goes where the props say: a change during a move keeps the rest of its goal,
        // and the position swings about the target (lerpCamera) rather than cutting through it.
        const state = cameraState(),
          goal = { ...(transition && cameraGoal ? cameraGoal : {}), ...patch };
        goal.target ??= state.target;
        goal.up ??= state.up;
        cameraGoal = goal;
        const release = viewServices.navigation.gesture.hold();
        try {
          setCamera(goal, { animate: true }).catch(() => {}).finally(() => {
            release();
            if (cameraGoal === goal) cameraGoal = null;
          });
        } catch (error) {
          release();
          throw error;
        }
      }
    });
  });
  onDestroy(() => {
    saveCamera(cameraKey());
    localOptions.dispose();
  });
</script>

<T.PerspectiveCamera
  makeDefault
  bind:ref={camera}
  position={[90, 70, 140]}
  oncreate={(ref) => {
    ref.up.fromArray(cameraUp ?? [0, 0, 1]);
    ref.lookAt(0, 0, 0);
  }}
>
  {#if cameraMode === "orbit"}<OrbitControls enabled={interactive} bind:ref={orbitControls} />{/if}
</T.PerspectiveCamera>
<T.Mesh
  geometry={globeGeometry}
  material={globeMaterial}
  visible={globe.visible && globe.radius > 0}
  scale={[globe.radius, globe.radius, globe.radius]}
  userData={{ omitOverview: false }}
  renderOrder={-1000}
/>
