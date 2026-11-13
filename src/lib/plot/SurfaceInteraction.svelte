<script>
  import { useViewServices } from "./utils/viewServices.js";
  import { useThrelte } from "@threlte/core";
  import { useInteractivity } from "../picking/context.js";
  import { Raycaster, Plane, Vector2, Vector3, Matrix4 } from "three/webgpu";
  let { surface, marker, onstart, onpreview, oncommit, oncancel, onhover } =
    $props();
  const { renderer, camera } = useThrelte(),
    context = useInteractivity();
  const viewServices = useViewServices();
  $effect(() => {
    if (!surface || !marker) return;
    context.addInteractiveObject(surface, {});
    context.addInteractiveObject(marker, {});
    const target = renderer.domElement,
      replayed = new WeakSet(),
      ray = new Raycaster();
    let alive = true,
      epoch = 0,
      drag = false,
      held = false,
      pointer = -1,
      last,
      startPosition,
      lastClick,
      lastDouble = -Infinity,
      enabled = true,
      pending = false,
      queued,
      hoverPending = false,
      moved = false;
    // A flat surface has an exact CPU intersection. This uses the same surface
    // transform and camera as rendering; displaced surfaces retain GPU picking.
    function flat(e, only) {
      if (surface.surface3d) return undefined;
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      camera.current.updateMatrixWorld();
      surface.updateWorldMatrix(true, false);
      ray.setFromCamera(
        new Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          1 - ((e.clientY - r.top) / r.height) * 2,
        ),
        camera.current,
      );
      const localRay = ray.ray
        .clone()
        .applyMatrix4(new Matrix4().copy(surface.matrixWorld).invert());
      const local = localRay.intersectPlane(
        new Plane(new Vector3(0, 0, 1), 0),
        new Vector3(),
      );
      if (!local) return null;
      const xr = surface.options.get("xrange"),
        yr = surface.options.get("yrange");
      const uv = new Vector2(
        (local.x - xr[0]) / (xr[1] - xr[0]),
        (local.y - yr[0]) / (yr[1] - yr[0]),
      );
      if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) return null;
      let object = surface;
      const p = marker.fields.get("position").uniformNode?.value;
      if (!only && p && !marker.fields.get("position").isBufferNode) {
        const xb = surface.options.get("xbounds"),
          yb = surface.options.get("ybounds");
        const q = new Vector3(
          xr[0] + ((p.x - xb[0]) / (xb[1] - xb[0])) * (xr[1] - xr[0]),
          yr[0] + ((p.y - yb[0]) / (yb[1] - yb[0])) * (yr[1] - yr[0]),
          0,
        )
          .applyMatrix4(surface.matrixWorld)
          .project(camera.current);
        if (
          Math.hypot(
            ((q.x + 1) * r.width) / 2 + r.left - e.clientX,
            ((1 - q.y) * r.height) / 2 + r.top - e.clientY,
          ) <= 10
        )
          object = marker;
      }
      return {
        object,
        uv,
        dataPoint: surface.dataPoint(uv),
        point: local.applyMatrix4(surface.matrixWorld),
      };
    }
    const pick = (e, only) => {
      const hit = flat(e, only);
      return hit === undefined
        ? context.pickAt?.(e.clientX, e.clientY, only)
        : hit;
    };
    const restore = () => {
      if (viewServices.navigation.controls.current) viewServices.navigation.controls.current.enabled = enabled;
      try {
        target.releasePointerCapture(pointer);
      } catch {}
    };
    const cancel = () => {
      ++epoch;
      held = false;
      queued = undefined;
      if (drag) {
        drag = false;
        restore();
        oncancel?.();
      }
    };
    function begin(hit, e, token) {
      if (!alive || token !== epoch || !held) return;
      if (hit?.object === marker) {
        enabled = viewServices.navigation.controls.current?.enabled ?? true;
        if (viewServices.navigation.controls.current) viewServices.navigation.controls.current.enabled = false;
        drag = true;
        target.setPointerCapture(pointer);
        onstart?.();
      } else {
        const event = new PointerEvent("pointerdown", e);
        replayed.add(event);
        target.dispatchEvent(event);
      }
    }
    const down = (e) => {
      if (replayed.has(e) || e.button !== 0) return;
      if (!e.isPrimary) {
        if (drag) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      startPosition = { x: e.clientX, y: e.clientY };
      moved = false;
      held = true;
      pointer = e.pointerId;
      last = undefined;
      e.preventDefault();
      e.stopImmediatePropagation();
      const token = ++epoch;
      const hit = pick(e);
      if (hit?.then) hit.then((h) => begin(h, e, token)).catch(cancel);
      else begin(hit, e, token);
    };
    const preview = (hit) => {
      if (hit?.dataPoint) {
        last = hit.dataPoint;
        onpreview?.(last);
      }
    };
    const move = (e) => {
      if (
        startPosition &&
        held &&
        Math.hypot(e.clientX - startPosition.x, e.clientY - startPosition.y) > 3
      )
        moved = true;
      if (!drag) {
        if (!held && !hoverPending) {
          const token = epoch,
            hit = pick(e);
          const show = (h) => {
            if (alive && token === epoch) onhover?.(h?.object === marker);
          };
          if (hit?.then) {
            hoverPending = true;
            hit.then(show).finally(() => (hoverPending = false));
          } else show(hit);
        }
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      const hit = flat(e, surface);
      if (hit !== undefined) {
        preview(hit);
        return;
      }
      queued = { clientX: e.clientX, clientY: e.clientY };
      if (pending) return;
      pending = true;
      void (async () => {
        try {
          while (queued && drag && alive) {
            const current = queued;
            queued = undefined;
            const token = epoch;
            const result = await pick(current, surface);
            if (token === epoch && !queued) preview(result);
          }
        } finally {
          pending = false;
        }
      })();
    };
    async function place(e) {
      if (performance.now() - lastDouble < 300) return;
      lastDouble = performance.now();
      const token = ++epoch;
      held = false;
      queued = undefined;
      if (drag) {
        drag = false;
        restore();
        oncancel?.();
      }
      // Finish camera damping before requesting an exact displaced-surface hit.
      viewServices.navigation.controls.current?.update();
      let hit = pick(e, surface);
      if (hit?.then) hit = await hit;
      if (!hit && surface.surface3d && alive && token === epoch)
        hit = await pick(e, surface);
      if (alive && token === epoch && hit?.dataPoint) oncommit?.(hit.dataPoint);
    }
    const up = (e) => {
      if (e.pointerId !== pointer) return;
      held = false;
      const clicked =
          !moved &&
          startPosition &&
          Math.hypot(e.clientX - startPosition.x, e.clientY - startPosition.y) <
            5,
        now = performance.now();
      const double =
        clicked &&
        lastClick &&
        now - lastClick.time < 550 &&
        Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 8;
      lastClick = clicked
        ? { x: e.clientX, y: e.clientY, time: now }
        : undefined;
      if (double) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void place(e);
        return;
      }
      if (!drag) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (clicked) {
        cancel();
        return;
      }
      const token = ++epoch;
      queued = undefined;
      const finish = (hit) => {
        if (!alive || token !== epoch || !drag) return;
        if (hit?.dataPoint) last = hit.dataPoint;
        drag = false;
        restore();
        if (last) oncommit?.(last);
        else oncancel?.();
      };
      const hit = pick(e, surface);
      if (hit?.then) hit.then(finish);
      else finish(hit);
    };
    const double = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      void place(e);
    };
    const leave = () => {
      if (!drag) onhover?.(false);
    };
    const key = (e) => {
      if (e.key === "Escape") cancel();
    };
    target.addEventListener("pointerdown", down, true);
    target.addEventListener("pointermove", move, true);
    // Capture release before OrbitControls can consume it.
    window.addEventListener("pointerup", up, true);
    target.addEventListener("pointercancel", cancel, true);
    target.addEventListener("dblclick", double, true);
    target.addEventListener("pointerleave", leave);
    window.addEventListener("keydown", key);
    return () => {
      alive = false;
      cancel();
      context.removeInteractiveObject(marker);
      context.removeInteractiveObject(surface);
      target.removeEventListener("pointerdown", down, true);
      target.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      target.removeEventListener("pointercancel", cancel, true);
      target.removeEventListener("dblclick", double, true);
      target.removeEventListener("pointerleave", leave);
      window.removeEventListener("keydown", key);
      onhover?.(false);
    };
  });
</script>
