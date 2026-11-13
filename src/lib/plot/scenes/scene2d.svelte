<script>
  import { useViewServices } from "../utils/viewServices.js";
  import { plotGutters } from "../utils/plotLayout.js";
  import { spherical, polar, periodicSpherical, sphericalDomain, polarDomain,
    normalizeProjectionCenter, draggedProjectionCenter, grabbedProjectionCenter, inverseOrthographicAtCenter } from "../utils/coordinates.js";
  import { zoomViewport, lerpViewport } from "../utils/viewport.js";
  import { ease } from "../utils/animation.js";
  import { transformClamped } from "../utils/scaleTransforms.js";
  import { T, useThrelte, useThrelteUserContext } from "@threlte/core";
  import { Vector3 } from "three/webgpu";
  import { onMount, onDestroy, untrack } from "svelte";
  import { getOptionsContext } from "../utils/context.js";
  import { layerRegistry, setLayeredScene } from "../utils/layerOrder.js";
  import { onViewContext } from "../utils/viewContext.js";
  import {
    normalizeViewport,
    fittedLayout,
    labelInsetSides,
    viewportSpans,
    anchoredZoom,
    zoomDimension,
  } from "../utils/viewport.js";
  let {
    height,
    width,
    viewport = undefined,
    onviewportchange = undefined,
    interactive = true,
    // A new `viewport` eases to its value over this many ms (TODO 136.14; 0 applies it at once).
    viewportDuration = 0,
    viewportEasing = "cubic-in-out",
  } = $props();
  const options = getOptionsContext(),
    local = options.ensureChild("scene2d");
  let rootRevision = $state(0);
  const stopRoot = options.on(() => rootRevision++, "_rootRevision");
  onDestroy(stopRoot);
  const { renderer, invalidate, scene } = useThrelte();
  const viewServices = useViewServices();
  // The root frame's options (a promoted Frame's, else the Plot's), from the view's navigation.
  const coordinateOptions = () => viewServices?.navigation.rootFrame.current?.() ?? options;
  // Stage 22: while the View is 2D, its marks layer in declaration order in one render queue.
  // The scene's registry hooks the queue merge from its first frame, whether or not a slotted
  // mark has mounted here or on another plot (TODO 136.1: a raw Heatmap drew over its grid
  // until some other plot's mark merged the page's render lists).
  onMount(() => {
    layerRegistry(scene, renderer, viewServices, invalidate);
    setLayeredScene(scene, true);
    invalidate();
    return () => {
      setLayeredScene(scene, false);
      invalidate();
    };
  });
  let camera = $state();
  let current = { x: 0.5, y: 0.5, zoom: 1, zoomX: 1, zoomY: 1 };
  let target = new Vector3(),
    enabled = true,
    syncing = false,
    syncingCenter = false;
  const viewbox = $state({ x: [-50, 50], y: [-50, 50], zoom: 1 });
  useThrelteUserContext("scene2d", { viewbox }, { existing: "merge" });
  const domain = () =>
    spherical(coordinateOptions())
      ? sphericalDomain(coordinateOptions())
      : polar(coordinateOptions()) ? polarDomain(coordinateOptions())
      : { x: [...coordinateOptions().get("xrange")].sort((a,b)=>a-b), y: [...coordinateOptions().get("yrange")].sort((a,b)=>a-b) };
  const centeredOrthographic = () => spherical(coordinateOptions()) &&
    coordinateOptions().get("projection") === "orthographic" &&
    coordinateOptions().get("projectionCenter") != null;
  const units = () => {
    const d = domain();
    return { x: d.x[1] - d.x[0], y: d.y[1] - d.y[0] };
  };
  function margins() {
    const p = options.child('plot');
    return p.get('axes2d') ? plotGutters(p) : {};
  }
  // aspect="equal" on a Cartesian plot keeps a data unit the same length on x and y (TODO 67.3):
  // the camera fits the data spans the bounds give (in each axis's transformed units), not the
  // world box they are stretched onto. Polar and spherical frames are equal in world units.
  const curvedRoot = () => spherical(coordinateOptions()) || polar(coordinateOptions());
  function dataUnits() {
    const o = coordinateOptions(), span = (axis) => {
      const bounds = o.get(axis + "bounds"), kind = o.get(axis + "Transform") ?? "linear", c = o.get(axis + "TransformConstant") ?? 1;
      return Array.isArray(bounds) ? Math.abs(transformClamped(kind, bounds[1], c) - transformClamped(kind, bounds[0], c)) : NaN;
    };
    return { x: span("x"), y: span("y") };
  }
  // The room the root frame's labels need past its domain's ends (axis.svelte, TODO 136.15), as
  // pixels on each side of the plot area: a reversed range puts an axis's low end on the far side.
  function labelInsets() {
    return curvedRoot() ? null : labelInsetSides(coordinateOptions());
  }
  function spansFor(w, h, v) {
    const equal = options.child("plot").get("aspect") === "equal";
    return fittedLayout(w,h,domain(),margins(),v, curvedRoot() || equal, equal && !curvedRoot() ? dataUnits() : null, labelInsets());
  }
  // The globe (a centered orthographic view): a canvas point in world units from the disk's
  // center, for view `v`, and the [longitude, latitude] under it (null off the globe).
  function diskPoint(p, v) {
    const spans = spansFor(width, height, v), d = domain(), u = units();
    const x = d.x[0] + 0.5 * u.x - spans.offsetX + (p.x / width - 0.5) * spans.x;
    const y = d.y[0] + 0.5 * u.y - spans.offsetY - (p.y / height - 0.5) * spans.y;
    return [x - (d.x[0] + d.x[1]) / 2, y - (d.y[0] + d.y[1]) / 2];
  }
  // Fit the camera to all radial data, but grab the globe's surface at z=0. Using the
  // fitted outer extent here makes surface features lag behind the pointer.
  const diskRadius = () => coordinateOptions().get("baseRadius") || (domain().x[1] - domain().x[0]) / 2;
  function grabAt(p, v) {
    const at = inverseOrthographicAtCenter(diskPoint(p, v), coordinateOptions(), diskRadius());
    return at ? [at[0], at[1]] : null;
  }
  function zoomAt(v, f, axis, p, w, h) {
    if (centeredOrthographic()) return zoomViewport(v, f, "xy");
    const next = zoomViewport(v, f, axis),
      before = spansFor(w, h, v),
      after = spansFor(w, h, next),
      u = units();
    next.x += (((p.x - before.center.x) / w) * (before.x - after.x)) / u.x;
    next.y += (((before.center.y - p.y) / h) * (before.y - after.y)) / u.y;
    return next;
  }
  function apply(value, emit = false) {
    if (!camera) return;
    const root = coordinateOptions(), centered = centeredOrthographic();
    if (centered) {
      const zoomX = value.zoomX ?? value.zoom ?? 1,
        zoomY = value.zoomY ?? value.zoom ?? 1;
      if (Math.abs(zoomX - zoomY) > 1e-9)
        throw Error("Orthographic viewport requires equal x and y zoom.");
      const center = normalizeProjectionCenter(
        value.center ?? current.center ?? root.get("projectionCenter"), root);
      current = normalizeViewport({ ...value, x: 0.5, y: 0.5,
        zoom: zoomX, zoomX, zoomY, center });
      syncingCenter = true;
      try {
        root.set("projectionCenter", center);
        root.set("_projectionCenterLongitude", center[0]);
        root.set("_projectionCenterLatitude", center[1]);
      } finally { syncingCenter = false; }
    } else {
      const { center: unusedCenter, ...plain } = value;
      current = normalizeViewport(plain);
    }
    const spans = spansFor(width, height, current),
      u = units();
    const clamp = (value, span, unit) => span >= unit ? .5 : Math.max(span/(2*unit), Math.min(1-span/(2*unit), value));
    if (local.get('clamp')) {
      if (!periodicSpherical(coordinateOptions())) current.x = clamp(current.x, spans.insetX, u.x);
      current.y = clamp(current.y, spans.insetY, u.y);
    }
    const d = domain();
    target.set(d.x[0] + current.x*u.x - spans.offsetX, d.y[0] + current.y*u.y - spans.offsetY, 0);
    camera.position.set(target.x, target.y, 50);
    camera.zoom = 1;
    camera.left = -spans.x / 2;
    camera.right = spans.x / 2;
    camera.top = spans.y / 2;
    camera.bottom = -spans.y / 2;
    camera.userData.plotRect = spans.rect;
    // The plot area as fractions of the view, which exports at another size keep (frameEdges.js).
    camera.userData.frameFraction = width > 0 && height > 0 ? { left: spans.rect.left / width, right: spans.rect.right / width,
      top: spans.rect.top / height, bottom: spans.rect.bottom / height } : undefined;
    camera.userData.zoomX = current.zoomX; camera.userData.zoomY = current.zoomY;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Axis-margin changes alter the drawable rectangle even when the scene
    // content is unchanged. Publish the new camera frame immediately so an
    // attached minimap cannot retain its pre-toggle viewport until resize.
    viewServices.drawing.overviewFrame.current?.(false);
    syncing = true;
    // Viewport callbacks can return the accepted state through the prop. Reuse the arrays
    // so unchanged bounds do not notify tiles and guides again during that reapplication.
    viewbox.x[0] = target.x - spans.x / 2; viewbox.x[1] = target.x + spans.x / 2;
    viewbox.y[0] = target.y - spans.y / 2; viewbox.y[1] = target.y + spans.y / 2;
    viewbox.zoom = current.zoom;
    queueMicrotask(() => (syncing = false));
    if (emit) onviewportchange?.({ ...current });
    invalidate();
  }
  // The view as a prop (TODO 136.14): a new viewport eases there with the plot's animation
  // settings, holding a gesture (layout keeps its gutters) until it lands; the viewer's drag or
  // wheel cancels it where it is. A resize or a root change applies the viewport at once.
  let tween = 0,
    releaseTween = null,
    appliedViewport,
    // What the last eased frame reported (onviewportchange): a parent writing it back into the
    // prop does not restart the move.
    tweenEmitted = "";
  function cancelTween() {
    cancelAnimationFrame(tween);
    tween = 0;
    releaseTween?.();
    releaseTween = null;
  }
  onDestroy(cancelTween);
  function tweenTo(target) {
    cancelTween();
    const from = { ...current },
      to = normalizeViewport(target),
      start = performance.now(),
      root = coordinateOptions(),
      period = (root.has("anglePeriod") && root.get("anglePeriod")) || 360;
    if (JSON.stringify(normalizeViewport(from)) === JSON.stringify(to)) return apply(target);
    releaseTween = viewServices.navigation.gesture.hold();
    const step = (now) => {
      const t = Math.min(1, (now - start) / viewportDuration);
      apply(t < 1 ? lerpViewport(from, to, ease(t, viewportEasing), period) : target, true);
      tweenEmitted = JSON.stringify(current);
      if (t < 1) tween = requestAnimationFrame(step);
      else cancelTween();
    };
    tween = requestAnimationFrame(step);
  }
  $effect(() => {
    rootRevision;
    const v = viewport,
      w = width,
      h = height;
    if (!camera) return;
    untrack(() => {
      const changed = appliedViewport !== undefined && v !== undefined &&
        JSON.stringify(v) !== JSON.stringify(appliedViewport);
      if (tween && changed && JSON.stringify(v) === tweenEmitted) return;
      appliedViewport = v;
      if (changed && viewportDuration > 0) tweenTo(v);
      else if (changed) {
        cancelTween();
        apply(v);
      } else if (!tween) apply(v ?? current);
    });
  });
  $effect(() => {
    rootRevision;
    const root = coordinateOptions();
    return root.on((center) => {
      if (!syncingCenter && camera && center != null && centeredOrthographic())
        apply({ ...current, center }, true);
    }, "projectionCenter");
  });
  $effect(() => {
    rootRevision;
    const root = coordinateOptions();
    if (root === options) return;
    // albers' outline follows its parallels and center latitude (TODO 39.6).
    const stops = ["coordinates", "projection", "angleUnit", "anglePeriod",
      "baseRadius", "radialScale", "xbounds", "ybounds", "zbounds", "parallels", "_projectionCenterLatitude"]
      .map((key) => root.on(() => { if (camera) apply(current); }, key));
    return () => stops.forEach((stop) => stop());
  });
  // The camera refits when the root's label room changes (TODO 136.15).
  $effect(() => {
    rootRevision;
    const root = coordinateOptions();
    return root.on(() => { if (camera) apply(current); }, "_labelInsets");
  });
  // An equal data aspect follows the bounds (the marks' automatic domains arrive later) and
  // the aspect setting.
  $effect(() => {
    rootRevision;
    const root = coordinateOptions(), plot = options.child("plot");
    const reapply = () => { if (camera && !curvedRoot() && plot.get("aspect") === "equal") apply(current); };
    const stops = [...["xbounds", "ybounds", "xTransform", "yTransform", "xTransformConstant", "yTransformConstant"]
      .map((key) => root.on(reapply, key)), plot.on(() => { if (camera) apply(current); }, "aspect")];
    return () => stops.forEach((stop) => stop());
  });
  const blocked = (e) =>
    e.target.closest?.(
      '.minimap,.settings-trigger,[role="dialog"],button,input,select,textarea',
    );
  onMount(() => {
    const canvas = renderer.domElement;
    const controls = {
      get object() {
        return camera;
      },
      target,
      get enabled() {
        return enabled && interactive;
      },
      set enabled(v) {
        enabled = v;
      },
      getViewport() { return {...current}; },
      setViewport(v) { cancelTween(); apply(v, true); },
      panTo(x,y) {
        cancelTween();
        if (centeredOrthographic()) apply({...current,center:[x,y]},true);
        else { const d=domain(),u=units(); apply({...current,x:(x-d.x[0])/u.x,y:(y-d.y[0])/u.y},true); }
      },
      update() {
        cancelTween();
        apply(
          {
            ...current,
            x: (target.x + spansFor(width,height,current).offsetX - domain().x[0]) / units().x,
            y: (target.y + spansFor(width,height,current).offsetY - domain().y[0]) / units().y,
          },
          true,
        );
      },
    };
    const releaseControls = viewServices.navigation.controls.install(controls);
    const pointers = new Map();
    let gesture;
    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const axisAt = (p) => {
      const plot = options.child("plot");
      return zoomDimension(
        p.x,
        p.y,
        width,
        height,
        local.get("zoomAxis") ?? "xy",
        local.get("axisMarginZoom") && plot.get("axes2d") ? plotGutters(plot) : null,
      );
    };
    const snapshot = () => {
      const p = [...pointers.values()];
      if (p.length >= 2) {
        const center = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
        gesture = {
          view: { ...current },
          center,
          last: center,
          grab: centeredOrthographic() ? grabAt(center, current) : null,
          distance: Math.max(1, Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y)),
          axis: axisAt(center),
        };
      } else if (p.length) gesture = { view: { ...current }, center: p[0], last: p[0], grab: centeredOrthographic() ? grabAt(p[0], current) : null };
      else gesture = undefined;
    };
    const down = (e) => {
      if (
        !controls.enabled ||
        blocked(e) ||
        (e.pointerType !== "touch" && e.button !== 0)
      )
        return;
      cancelTween();
      pointers.set(e.pointerId, point(e));
      snapshot();
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const p = point(e);
      pointers.set(e.pointerId, p);
      if (!controls.enabled) {
        snapshot();
        return;
      }
      if (!gesture) return;
      const ps = [...pointers.values()],
        center =
          ps.length >= 2
            ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }
            : p;
      let next = { ...gesture.view };
      if (ps.length >= 2) {
        const distance = Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y);
        next = zoomAt(
          next,
          distance / gesture.distance,
          gesture.axis,
          gesture.center,
          width,
          height,
        );
      }
      const span = spansFor(width, height, next);
      if (centeredOrthographic()) {
        const radius = diskRadius();
        // A drag carries the point grabbed on the globe under the pointer, north up. Where no
        // turn does (a point near a pole carried sideways, or dragged off the globe), the drag
        // goes on from there turning longitude and latitude by its own motion.
        const grabbed = gesture.grab ? grabbedProjectionCenter(gesture.grab, diskPoint(center, next), radius, coordinateOptions()) : null;
        if (grabbed) next.center = grabbed;
        else {
          if (gesture.grab) gesture = { ...gesture, view: { ...gesture.view, center: current.center }, center: gesture.last, grab: null };
          next.center = draggedProjectionCenter(gesture.view.center,
            (center.x - gesture.center.x) * span.x / width,
            -(center.y - gesture.center.y) * span.y / height,
            radius, coordinateOptions());
        }
        gesture.last = center;
      } else {
        next.x -= ((center.x - gesture.center.x) * span.x) / width / units().x;
        next.y += ((center.y - gesture.center.y) * span.y) / height / units().y;
      }
      apply(next, true);
      e.preventDefault();
    };
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      snapshot();
    };
    const wheel = (e) => {
      if (!controls.enabled || blocked(e)) return;
      cancelTween();
      const p = point(e);
      const delta =
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1);
      let next = zoomAt(
        current,
        Math.exp(-Math.max(-1000, Math.min(1000, delta)) * 0.001),
        axisAt(p),
        p,
        width,
        height,
      );
      // The globe zooms about its center; turning it keeps the point under the pointer there.
      if (centeredOrthographic()) {
        const grab = grabAt(p, current);
        const center = grab && grabbedProjectionCenter(grab, diskPoint(p, next), diskRadius(), coordinateOptions());
        if (center) next = { ...next, center };
      }
      apply(next, true);
      e.preventDefault();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
    const stop = local.on(() => apply(current));
    const stopAxes = options.child("plot").on(() => apply(current));
    const coordinateStops = ["projection","baseRadius","radialScale","zbounds", "ybounds", "coordinates", "xrange", "yrange"].map((k) =>
      options.on(() => apply(current), k),
    );
    coordinateStops.push(onViewContext(options, () => apply(current)));
    return () => {
      stop(); stopAxes();
      coordinateStops.forEach((f) => f());
      for (const [name, fn] of [
        ["pointerdown", down],
        ["pointermove", move],
        ["pointerup", up],
        ["pointercancel", up],
        ["wheel", wheel],
      ])
        canvas.removeEventListener(name, fn);
      releaseControls();
    };
  });
</script>

<T.OrthographicCamera
  makeDefault
  manual
  bind:ref={camera}
  left={-50}
  right={50}
  top={50}
  bottom={-50}
  near={0.1}
  far={2000}
  position={[0, 0, 50]}
/>
