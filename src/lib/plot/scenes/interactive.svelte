<script>
  import { cameraMatrixKey } from "../utils/camera.js";
  import { coordinateView } from "../utils/viewContext.js";
  import { useViewServices } from "../utils/viewServices.js";
  import { copyPickingMaterial } from "../../picking/copyPickingMaterial.js";
  import {refinesPieces} from "../utils/curves.js";
  import { animationClock } from "../utils/animation.js";
  import { markAnimation, animationVersion } from "../utils/markAnimation.js";
  import { installWrappedRender } from "../utils/wrappedRender.js";
  import { spherical, polar, coordinateValue,
    inverseOrthographicAtCenter } from "../utils/coordinates.js";
  import { buildCoordinateOperations } from "../utils/coordinateOperations.js";
  import { onMount, onDestroy, untrack } from "svelte";
  import {
    prepareCurves,
    curveRender,
    curveErrors,
    curvePending,
  } from "../utils/curvedPaths.js";
  import { sampledRender } from "../utils/sampledBuffers.js";
  import { antialiasSamples, antialiasResolution, supersampledColor, withRenderScale } from "../utils/antialias.js";
  import { PickingPass } from "../utils/pickingPass.js";
  import { alphaSmaa } from "../../threeExtensions/smaa.js";
  import { getOptionsContext } from "../utils/context.js";
  import { placedFrame, framePointInverse } from "../utils/framePlacement.js";
  import { axisValue } from "../utils/axes.js";
  import { readPixel, readPixels } from "../../picking/readPixel.js";
  import { pixelAt } from "../../picking/pixel.js";
  import { interactionRows } from "../utils/interaction.js";
  import { useTask, useThrelte } from "@threlte/core";
  import { interactivity, useInteractivity } from "../../picking/index.js";
  import {
    pass,
    vec4,
    mrt,
    float,
    uniform,
    Fn,
    instanceIndex,
    positionWorld,
    varyingProperty,
    uv,
  } from "three/tsl";
  import * as THREE from "three/webgpu";
  import { Presentation } from "../utils/presentation.js";
  import { analyticEdges } from "../utils/analyticEdges.js";

  const { renderStage, autoRender, scene, renderer, camera, invalidate } =
    useThrelte();
  const viewServices = useViewServices();
  const axisOptions = getOptionsContext();
  const plotAppearance = axisOptions.hasChild("plot")
    ? axisOptions.child("plot")
    : axisOptions;
  let backgroundRevision = $state(0);
  const stopBackground = plotAppearance.on(
    () => backgroundRevision++,
    "background",
  );
  $effect(() => {
    backgroundRevision;
    // Keep the GPU scene transparent. Scene backgrounds pass through the
    // renderer's tone mapper, which turns exact CSS colors (including white)
    // into visibly different colors. The live host and export compositors own
    // the presentation background instead.
    scene.background = null;
    invalidate();
  });
  onMount(() => installWrappedRender(renderer));
  // Native 4x MSAA, higher-resolution hybrid sampling, alpha-aware SMAA, or off.
  // Exports always render with 4x MSAA at their requested resolution.
  // `presentation`: the Plot's effects (utils/presentation.js; TODO 37, 138.1), composited after
  // the scene pass through their hooks.
  let { antialias = "msaa", presentation: plotPresentation = undefined, children } = $props();
  // One per Plot, for the component's life.
  const presentation = untrack(() => plotPresentation) ?? new Presentation();
  const beautySamples = $derived(antialiasSamples(antialias));
  const beautyResolution = $derived(antialiasResolution(antialias));
  const EXPORT_SAMPLES = 4;
  const pickingMaterials = new Map();
  const instanceId = float(instanceIndex).toVarying("vPickingInstanceId");
  const pickingNode = Fn(({ objectId, index = instanceId }) =>
    vec4(float(uniform(objectId)), index, uv()),
  );
  interactivity();
  const context = useInteractivity();
  let beautyPipeline, retryFrame, brushGeneration = 0;
  function retry() {
    if (!retryFrame) retryFrame = requestAnimationFrame(() => { retryFrame = 0; invalidate(); });
  }
  onDestroy(() => {
    cancelAnimationFrame(retryFrame);
    stopBackground();
  });
  /**
   * Draw the picking (data) pass into context.scenePass, then put the scene back, also when
   * drawing throws. Each visible interactive object (only `only`, when given) draws with its
   * picking material; every other object with a material is hidden. Integer IDs and precise
   * coordinates are not color data, so noninteractive marks, including background rules, are
   * omitted. A 3D basemap's colorless ground plane stays (TODO 66.2): it writes the ground's
   * depth and no ID, so what lies under the ground is not picked through it.
   */
  function drawPickPass(only = undefined) {
    const swapped = new Map(),
      hidden = [];
    scene.traverse((object) => {
      if (!object.material || !object.visible || object.plotGround) return;
      if (
        !context.interactiveObjects.includes(object) ||
        (only && object !== only)
      ) {
        hidden.push(object);
        object.visible = false;
      } else if (object.material.isNodeMaterial) {
        swapped.set(object, object.material);
        object.material = pickingMaterial(object);
      }
    });
    try {
      curveRender(scene, () =>
        sampledRender(scene, null, () => context.scenePass?.render(renderer)),
      );
    } finally {
      for (const [object, material] of swapped) object.material = material;
      for (const object of hidden) object.visible = true;
    }
  }

  function disposePickingMaterial(object) {
    const cached = pickingMaterials.get(object);
    if (cached) {
      viewServices?.diagnostics.instrumentation.current?.pickingMaterial(object, cached.source, cached.material, cached.objectId, "disposed");
      cached.material.dispose();
    }
    pickingMaterials.delete(object);
  }
  // The pick output reads the row index, which a sampled or refined mark takes from storage
  // nodes it replaces when their buffers grow. Built with each new version of the source, it
  // reads the nodes the mark does: a kept output would declare the old binding next to the new
  // one, under the same name, and the shader would not compile.
  const pickOutput = (object, objectId, source) => mrt({
    output: pickingNode({
      objectId,
      index:
        (refinesPieces(object)
          ? object.curvedPaths.index
          : object.sampling?.index) ?? instanceId,
    }),
    // A screen-space line places its quad itself; its material carries the
    // world point along the segment instead.
    world: vec4(source.isLine2NodeMaterial
      ? varyingProperty("vec3", "pickWorld") : positionWorld, 1),
  });
  function pickingMaterial(object) {
    const source = object.material;
    const objectId = context.objectIdReverseMap.get(object);
    let cached = pickingMaterials.get(object);
    let reason;
    if (!cached || cached.source !== source || cached.objectId !== objectId) {
      reason = !cached ? "first use" : cached.source !== source ? "source material replaced" : "object ID changed";
      disposePickingMaterial(object);
      cached = { source, objectId, version: -1, material: source.clone() };
      pickingMaterials.set(object, cached);
    }
    if (cached.version !== source.version) {
      // Point beauty can skip depth writes, while the pick pass still identifies the
      // nearest visible point. Marks that deliberately disable depth testing keep it.
      const point = ["Points", "Points3D"].includes(object.constructor?.componentName);
      copyPickingMaterial(cached.material, source, point && source.depthTest
        ? { depthWrite: true } : undefined);
      cached.material.mrtNode = pickOutput(object, objectId, source);
      // Blending IDs would produce intersections with unrelated objects.
      cached.material.transparent = false;
      cached.material.blending = THREE.NoBlending;
      cached.material.alphaTest = Math.max(source.alphaTest, 0.001);
      cached.material.alphaToCoverage = false;
      cached.material.needsUpdate = true;
      cached.version = source.version;
      viewServices?.diagnostics.instrumentation.current?.pickingMaterial(object, source, cached.material, objectId, reason ?? "source material version changed");
    }
    // Diagnostics may be enabled after this cache was populated. Attribute later builds
    // without changing or invalidating the already compatible material.
    viewServices?.diagnostics.instrumentation.current?.pickingMaterial(object, source, cached.material, objectId, "observed existing material");
    return cached.material;
  }
  // The effects the presentation composites (TODO 37, 138.1): the scene pass's attachments while
  // the scene asks for them (checked each frame), and the hooks a render through the camera
  // shows. A change of either key rebuilds the pipeline; settings are uniforms, so changing
  // them compiles nothing.
  let attachments = $state(""), presentationRevision = $state(0);
  // Effects inside the Plot report from their own $effects: count without reading there.
  const stopPresentation = presentation.subscribe(() => { untrack(() => presentationRevision++); invalidate(); });
  onDestroy(stopPresentation);
  /**
   * The scene pass for `eye` (the camera), with the attachments `key` names: the live canvas's
   * (the on-screen antialiasing) or an export's (4x MSAA, at the target's size).
   */
  function scenePassFor(eye, key, samples, size = null) {
    const scenePass = pass(scene, eye, { samples });
    // An export renders at its target's size, not the canvas's.
    if (size) scenePass.setSize = function () { this.renderTarget.setSize(size.width, size.height); };
    const attached = presentation.attach(scenePass, key);
    return { eye, scenePass, attachments: attached.attachments, dispose() { attached.dispose(); scenePass.dispose(); } };
  }
  /**
   * Its presentation with `active`'s hooks: the canvas's (premultiplied alpha, SMAA when on) or
   * a PNG's (straight). A multisampled transparent scene contains premultiplied linear RGB. The
   * presentation unpremultiplies before the nonlinear output conversion, then premultiplies for
   * the canvas compositor. Otherwise antialiased gray rules turn white.
   */
  function presentationFor(source, active, { smaa = false, supersample = false, premultiplied }) {
    const pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputColorTransform = false;
    pipeline.outputNode = presentation.output({
      color: smaa ? alphaSmaa(source.scenePass) : supersample ? supersampledColor(source.scenePass) : source.scenePass,
      scenePass: source.scenePass, attachments: source.attachments, active,
      toneMapping: renderer.toneMapping, colorSpace: renderer.outputColorSpace, premultiplied,
    });
    return pipeline;
  }
  // The live scene pass: rebuilt for another camera or antialiasing, or when its attachments
  // change (they exist only while the scene asks for them). The other hooks change only the
  // presentation's output node.
  let liveSource = $state.raw(null), liveActive = [];
  $effect(() => {
    const source = scenePassFor($camera, attachments, beautySamples);
    source.scenePass.setResolutionScale(beautyResolution);
    liveSource = source;
    return () => source.dispose();
  });
  const liveHooks = $derived.by(() => {
    presentationRevision;
    return liveSource ? presentation.activeFor(liveSource.eye, liveSource.attachments) : null;
  });
  const liveKey = $derived(liveHooks?.key);
  $effect(() => {
    liveKey;
    const source = liveSource, active = untrack(() => liveHooks?.active);
    if (!source || !active) return;
    const pipeline = presentationFor(source, active, { smaa: antialias === "smaa", supersample: beautyResolution > 1, premultiplied: true });
    beautyPipeline = pipeline;
    liveActive = active;
    // Exports check which effects a plot shows (utils/documentExport.js): with one, SVG and PDF
    // export the plot as one raster.
    const releaseEffects = viewServices.export.effects.install(() => presentation.rasterEffects($camera, scene));
    invalidate();
    return () => {
      releaseEffects();
      if (beautyPipeline === pipeline) beautyPipeline = undefined;
      pipeline.dispose();
    };
  });
  $effect(() => {
    const pickPass = new PickingPass(scene, $camera);

    pickPass.getTexture("world").type = THREE.FloatType;
    pickPass.getTexture("output").type = THREE.FloatType;
    const renderExport = async (target, scale = 1) => {
      while (
        !prepareCurves(
          scene,
          $camera,
          renderer.domElement.width,
          renderer.domElement.height,
        ) ||
        curvePending(scene)
      ) {
        if (curveErrors(scene).length) throw Error(curveErrors(scene)[0]);
        await Promise.all([
          viewServices.lifecycle.geometryQueue,
          new Promise(requestAnimationFrame),
        ]);
      }
      for (const layer of viewServices.drawing.surfaceTextures)
        while (!layer.render()) {
          if (layer.error || curveErrors(layer.scene).length)
            throw Error(layer.error || curveErrors(layer.scene)[0]);
          await Promise.all([
            viewServices.lifecycle.geometryQueue,
            new Promise(requestAnimationFrame),
          ]);
        }
      // The live presentation's effects, with this frame's attachments, through the same
      // compositor: PNG stores straight alpha, unlike the premultiplied presentation canvas.
      const eye = $camera, source = scenePassFor(eye, presentation.attachmentsFor(scene), EXPORT_SAMPLES, target);
      const { active } = presentation.activeFor(eye, source.attachments);
      const conversion = presentationFor(source, active, { premultiplied: false });
      const oldTarget = renderer.getRenderTarget(), oldMRT = renderer.getMRT();
      try {
        presentation.beforeRender(eye, active);
        renderer.setMRT(null); renderer.setRenderTarget(target);
        curveRender(scene, () => sampledRender(scene, null, () => withRenderScale(scene, scale, () => conversion.render())));
      } finally {
        renderer.setRenderTarget(oldTarget); renderer.setMRT(oldMRT);
        await renderer.backend.device.queue.onSubmittedWorkDone();
        conversion.dispose(); source.dispose();
      }
    };
    const cameraReader = () => $camera;
    context.scenePass = pickPass;
    context.renderer = renderer;
    context.view = viewServices;
    context.invalidate = invalidate;
    const cancelBrushRead = () => { ++brushGeneration; };
    const brushRead = async ({ left, top, right, bottom, axis = "xy" }, phase = "preview") => {
      const generation = ++brushGeneration;
      // A pending upload is not an empty brush. Wait for the matching pick
      // frame, while allowing newer gestures/disposal to cancel this request.
      const deadline = performance.now() + 1500;
      while (context.frameStale || completedPickKey !== currentPickKey()) {
        if (generation !== brushGeneration || context.scenePass !== pickPass) return 0;
        if (performance.now() >= deadline) throw Error("Brush is waiting for a completed plot frame. Try again after the update settles.");
        context.requestPick();
        await new Promise(requestAnimationFrame);
      }
      const frameKey = currentPickKey();
      const target = pickPass.renderTarget;
      const cssWidth = Math.max(1, renderer.domElement.clientWidth);
      const cssHeight = Math.max(1, renderer.domElement.clientHeight);
      const x0 = Math.max(0, Math.min(target.width - 1, Math.floor(Math.min(left, right) * target.width / cssWidth)));
      const y0 = Math.max(0, Math.min(target.height - 1, Math.floor(Math.min(top, bottom) * target.height / cssHeight)));
      const x1 = Math.max(x0 + 1, Math.min(target.width, Math.ceil(Math.max(left, right) * target.width / cssWidth)));
      const y1 = Math.max(y0 + 1, Math.min(target.height, Math.ceil(Math.max(top, bottom) * target.height / cssHeight)));
      const pixels = await readPixels(renderer, pickPass.getTexture("output"), x0, y0, x1 - x0, y1 - y0);
      // The marks' accepted bindings (Stage 117.2), each held while its rows are read.
      const interaction = (object) => viewServices.marks.of(object)?.interaction;
      const hits = new Map();
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const object = context.objectIdMap.get(Math.round(pixels[offset]));
        const instance = Math.round(pixels[offset + 1]);
        const binding = interaction(object);
        if (!binding?.brush || binding.brushAxis !== axis || instance < 0) continue;
        let indices = hits.get(object);
        if (!indices) hits.set(object, indices = new Set());
        indices.add(instance);
      }
      const groups = new Map();
      for (const object of context.interactiveObjects) {
        const binding = interaction(object);
        if (!binding?.brush || binding.brushAxis !== axis) continue;
        let group = groups.get(binding.brush);
        if (!group) groups.set(binding.brush, group = new Map());
        if (!group.has(binding.owner)) group.set(binding.owner, new Set());
      }
      const held = [...hits.keys()].map((object) => [object, viewServices.marks.acquire(object)]);
      try {
        for (const [object, { value }] of held) {
          const binding = value?.interaction, indices = hits.get(object);
          if (!binding) continue;
          let group = groups.get(binding.brush);
          if (!group) groups.set(binding.brush, group = new Map());
          let rows = group.get(binding.owner);
          if (!rows) group.set(binding.owner, rows = new Set());
          for (const row of await interactionRows(binding.scope, [...indices])) rows.add(row);
        }
      } finally { held.forEach(([, binding]) => binding.release()); }
      if (generation !== brushGeneration || context.frameStale || completedPickKey !== frameKey || currentPickKey() !== frameKey) return 0;
      for (const [resource, owners] of groups)
        for (const [owner, rows] of owners)
          resource.replace(owner, rows, { phase });
      return [...groups.values()].reduce((sum, owners) => sum + [...owners.values()].reduce((n, rows) => n + rows.size, 0), 0);
    };
    context.pickAt = pickAt;
    context.axisValue = (world, frameOptions = axisOptions) => {
      const chain = buildCoordinateOperations(frameOptions);
      if (chain.some(operation => operation.kind === "fit") ||
          chain.length > 1 && chain.some(operation =>
            operation.kind === "polar" || operation.kind.startsWith("spherical-"))) {
        const source = framePointInverse(frameOptions, world, chain);
        return { x: source[0], y: source[1], z: source[2], frameCoordinates: source };
      }
      if (polar(frameOptions)) {
        const source = framePointInverse(frameOptions, world, chain);
        return { x: source?.[0], y: source?.[1], z: source?.[2],
          frameCoordinates: source };
      }
      if (placedFrame(frameOptions)) {
        const local = framePointInverse(frameOptions, world, chain);
        return {x:local[0],y:local[1],z:local[2],frameCoordinates:local};
      }
      if(spherical(frameOptions)&&frameOptions.get('projection')==='orthographic'&&(coordinateView(frameOptions)!=='3d'||frameOptions.get('sphericalView')==='projected')){
        const projected=coordinateView(frameOptions)==='3d'?[world[0],-world[2]]:[world[0],world[1]];
        const source=inverseOrthographicAtCenter(projected,frameOptions);
        return {x:source?.[0],y:source?.[1],z:source?.[2],projectedCoordinates:projected};
      }
      const p = coordinateValue(frameOptions, world);
      return p
        ? { x: p[0], y: p[1], z: p[2] }
        : {
            x: axisValue(frameOptions, "x", world[0]),
            y: axisValue(frameOptions, "y", world[1]),
          };
    };
    // The view borrows these while this pass exists; a replacement's survive this cleanup.
    const releases = [viewServices.export.render.install(renderExport), viewServices.picking.scene.install(scene),
      viewServices.picking.camera.install(cameraReader), viewServices.picking.context.install(context),
      viewServices.picking.brushReadback.install({ read: brushRead, cancel: cancelBrushRead })];
    invalidate();
    return () => {
      cancelBrushRead();
      if (context.scenePass === pickPass) context.scenePass = undefined;
      if (context.pickAt === pickAt) context.pickAt = undefined;
      releases.forEach((release) => release());
      pickPass.dispose();
      for (const object of pickingMaterials.keys())
        disposePickingMaterial(object);
    };
  });
  // This scene renders through the beauty pipeline, whose output pass premultiplies for the
  // canvas. Threlte's Canvas re-applies its autoRender default after this effect runs, and a
  // frame where only its direct render ran (ours waiting on an upload) showed every soft
  // edge with a light halo. Keep the direct render off.
  $effect(() => {
    const before = autoRender.current;
    const stop = autoRender.subscribe((on) => { if (on) autoRender.set(false); });
    return () => { stop(); autoRender.set(before); };
  });
  let pickQueue = Promise.resolve();
  const objectKey = (o) =>
    JSON.stringify([
      o.material?.version,
      o.renderOrder,
      o.geometry?.uuid,
      o.surfaceVersion,
      animationVersion(o),
      o.surfaceTexture?.version,
      o.options?.get("zScale"),
      o.valueBoundsNode?.value,
      o.xboundsNode?.value,
      o.yboundsNode?.value,
      o.matrixWorld.elements,
      o.visible,
      o.count,
    ]);
  let completedPickKey = "";
  // Picking on demand (TODO 63.2). A frame draws the picking pass only while some interactive
  // mark needs it under a moving pointer (hover, brush, tooltips, nearby, nearest, pointer-move or
  // wheel handlers), or when an event asks for one (requestPick): marks that only take clicks (a live
  // VectorTile's slots, onclick on a mark) cost nothing while the view moves, and a click waits
  // for one frame that draws the pick of the current view.
  let pickWanted = false, pickDrawn = false;
  const MOVE_HANDLERS = ["onpointermove", "onpointerover", "onpointerout", "onpointerenter", "onpointerleave", "onwheel",
    "onnearestenter", "onnearestmove", "onnearestleave"];
  const clickOnly = (object) => {
    const binding = viewServices.marks.of(object);
    if (binding?.interaction || binding?.nearest || binding?.tooltip) return false;
    const handlers = context.handlers.get(object);
    return !MOVE_HANDLERS.some((name) => typeof handlers?.[name] === "function");
  };
  const pickOnDemand = () => context.interactiveObjects.length > 0 && context.interactiveObjects.every(clickOnly);
  context.pickOnDemand = pickOnDemand;
  context.requestPick = () => {
    pickWanted = true;
    invalidate();
  };
  // On demand, a field written since (a tile slot given another tile) makes the pick stale too.
  const currentPickKey = () =>
    JSON.stringify([
      cameraMatrixKey($camera),
      ...context.interactiveObjects.map((o) => [o.uuid, objectKey(o)]),
      pickOnDemand() ? viewServices.drawing.revision : 0,
    ]);
  // Drawn every frame, a pick is current but for surface textures; drawn on demand, it is current
  // while the view and the marks are those it was drawn with.
  context.isPickCurrent = () =>
    (!viewServices.drawing.surfaceTextures.size && !pickOnDemand()) ||
    (!context.frameStale && completedPickKey === currentPickKey());
  function pickAt(clientX, clientY, only) {
    const task = pickQueue.then(async () => {
      if (!context.scenePass) return;
      const pass = context.scenePass,
        cameraNow = $camera;
      cameraNow.updateMatrixWorld();
      const cameraKey = cameraMatrixKey(cameraNow);
      const r = renderer.domElement.getBoundingClientRect();
      if (
        clientX < r.left ||
        clientX > r.right ||
        clientY < r.top ||
        clientY > r.bottom
      )
        return;
      const versions = new Map(
        context.interactiveObjects.map((o) => [o, objectKey(o)]),
      );
      drawPickPass(only);
      const { width, height } = pass.renderTarget;
      const x = pixelAt((clientX - r.left) / r.width, width);
      const y = pixelAt((clientY - r.top) / r.height, height);
      const [data, world] = await Promise.all([
        readPixel(renderer, pass.getTexture("output"), x, y),
        readPixel(renderer, pass.getTexture("world"), x, y),
      ]);
      if (
        pass !== context.scenePass ||
        cameraKey !== cameraMatrixKey(cameraNow)
      )
        return;
      const object = context.objectIdMap.get(Math.round(data[0]));
      if (!object || object.isDisposed || !world[3]) return;
      if (versions.get(object) !== objectKey(object)) return;
      // An object whose mesh coordinates are not its parameters maps them (a polar Rect's).
      const uv = object.pickUV?.(new THREE.Vector2(data[2], data[3])) ?? new THREE.Vector2(data[2], data[3]);
      return {
        object,
        instanceId: Math.round(data[1]),
        uv,
        point: new THREE.Vector3(world[0], world[1], world[2]),
        dataPoint: object.dataPoint?.(uv),
        axisValue: context.axisValue?.(world, object.options),
        frame: viewServices.marks.of(object)?.frameKey ?? null,
      };
    });
    pickQueue = task.catch(() => {});
    return task;
  }
  useTask(
    () => {
      // Hidden/zero-size containers cannot own valid WebGPU render targets.
      const { lifecycle } = viewServices;
      if(lifecycle.deviceLost || !lifecycle.drawable || renderer.domElement.width<1 || renderer.domElement.height<1)return;
      // Navigation UI must not wait for pending geometry or texture uploads.
      // GPU overview content still refreshes after a complete main frame.
      viewServices.drawing.overviewFrame.current?.(false);
      if (!beautyPipeline) return;
      if (viewServices.clock.busy || animationClock(renderer).unapplied()) { retry(); return; }
      context.frameStale = true;
      let uploading = false;
      scene.traverse(o => { if (o.visible && o.manager?.pendingUpdates) uploading = true; });
      if (uploading) { retry(); return; }
      // A scene that starts or stops asking for an attachment (a mark lighting it up) rebuilds the
      // pipeline with or without it; this frame still draws with the current one.
      const wanted = presentation.attachmentsFor(scene);
      if (wanted !== attachments) attachments = wanted;
      if (
        !prepareCurves(
          scene,
          $camera,
          renderer.domElement.width,
          renderer.domElement.height,
        )
      ) {
        lifecycle.geometryBusy = !curveErrors(scene).length;
        if (lifecycle.geometryBusy) retry();
        return;
      }
      // A layer whose render failed is settled: the frame draws without it, its error on the
      // plot (TODO 136.2); one still preparing holds the frame.
      for (const layer of viewServices.drawing.surfaceTextures)
        if (!layer.render() && !layer.error) { retry(); return; }
      const renderingStart=performance.now();
      curveRender(scene, () =>
        sampledRender(scene, null, () => {
          const interactive = new Set(context.interactiveObjects);
          for (const object of pickingMaterials.keys())
            if (!interactive.has(object)) disposePickingMaterial(object);
          pickDrawn = interactive.size > 0 && (pickWanted || !pickOnDemand());
          // A hidden mark (a free tile slot) is not drawn: no picking material for it.
          if (pickDrawn) drawPickPass();
          presentation.beforeRender($camera, liveActive);
          // A single-sampled canvas draws Rect edges analytically (TODO 59); every other
          // render (picking above, exports, minimaps) draws them plain.
          analyticEdges.value = beautySamples > 1 ? 0 : 1;
          try { withRenderScale(scene, beautyResolution, () => beautyPipeline.render()); }
          finally { analyticEdges.value = 0; }
        }),
      );
      const clock = animationClock(renderer);
      for (const owner of clock.owners) {
        const animation = markAnimation(owner);
        animation.ready = true;
        if (![...clock.tracks].some(track => track.owner === owner)) animation.snap = false;
      }
      viewServices.diagnostics.instrumentation.current?.sample("renderSubmission",performance.now()-renderingStart);
      lifecycle.completedFrame++;
      lifecycle.geometryBusy = false;
      for (const callback of lifecycle.frameCallbacks) callback();
      clock.drawn();
      viewServices.diagnostics.instrumentation.current?.sample("frame");
      // The pick target holds the last drawn pick: its view and marks.
      if (pickDrawn) {
        completedPickKey = currentPickKey();
        pickWanted = false;
        viewServices.diagnostics.counters.pickFrames++;
      }
      context.frameStale = false;
      viewServices.drawing.overviewFrame.current?.();
    },
    { stage: renderStage, autoInvalidate: false },
  );
</script>

{@render children?.()}
