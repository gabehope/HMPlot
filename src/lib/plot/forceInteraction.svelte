<script>
  import { useViewServices } from "./utils/viewServices.js";
  import { useThrelte } from "@threlte/core";
  import { useInteractivity } from "../picking/context.js";
  import { Raycaster, Plane, Vector2, Vector3, Matrix4 } from "three/webgpu";
  import { axisValue } from "./utils/axes.js";
  import { trackPreparation } from './rendering/viewSettlement.js';
  let { mark, force } = $props();
  const { renderer, camera } = useThrelte(),
    picking = useInteractivity();
  const viewServices = useViewServices();
  $effect(() => {
    if (!mark || !force) return;
    if (mark.options.get("coordinates") === "spherical")
      throw Error("Force node dragging requires Cartesian coordinates.");
    picking.addInteractiveObject(mark, {});
    const target = renderer.domElement,
      replayed = new WeakSet(),
      ray = new Raycaster();
    let alive = true,
      epoch = 0,
      pointer = -1,
      held = false,
      drag = null,
      enabled = true,
      // A drag's latest target, applied at most once per display frame (TODO 65.1): one waits
      // for the next frame, one at most is being applied, and older pointer positions are
      // dropped, not queued behind it.
      pending = null,
      scheduled = null,
      applying = false,
      // A drag holds the layout's alphaTarget up (d3's drag idiom), once per drag.
      holding = false;
    const hold = (on) => {
      if (holding === on) return;
      holding = on;
      force.hold?.(on);
    };
    const data = (world) => {
      const p = world
        .clone()
        .applyMatrix4(new Matrix4().copy(mark.matrixWorld).invert());
      return [p.x, p.y, p.z]
        .slice(0, force.dimensions)
        .map((v, i) => axisValue(mark.options, ["x", "y", "z"][i], v));
    };
    function project(e) {
      const box = target.getBoundingClientRect();
      ray.setFromCamera(
        new Vector2(
          ((e.clientX - box.left) / box.width) * 2 - 1,
          1 - ((e.clientY - box.top) / box.height) * 2,
        ),
        camera.current,
      );
      return ray.ray.intersectPlane(drag.plane, new Vector3());
    }
    function restore() {
      if (viewServices.navigation.controls.current) viewServices.navigation.controls.current.enabled = enabled;
      try {
        target.releasePointerCapture(pointer);
      } catch {}
    }
    async function down(e) {
      if (replayed.has(e) || e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      held = true;
      pointer = e.pointerId;
      const token = ++epoch,
        generation = force.generation;
      const hit = await picking.pickAt?.(e.clientX, e.clientY);
      if (!alive || token !== epoch || !held) return;
      if (hit?.object !== mark) {
        held = false;
        const copy = new PointerEvent("pointerdown", e);
        replayed.add(copy);
        target.dispatchEvent(copy);
        return;
      }
      if (!Number.isInteger(hit.instanceId) || hit.instanceId < 0) {
        held = false;
        return;
      }
      enabled = viewServices.navigation.controls.current?.enabled ?? true;
      if (viewServices.navigation.controls.current) viewServices.navigation.controls.current.enabled = false;
      target.setPointerCapture(pointer);
      const index = hit.instanceId,
        start = await force.select(index),
        pinned = await force.pinned(index);
      if (!alive || token !== epoch || !held) {
        restore();
        return;
      }
      const normal = camera.current.isOrthographicCamera
        ? new Vector3(0, 0, 1)
        : camera.current.getWorldDirection(new Vector3());
      drag = {
        index,
        start,
        pinned,
        generation,
        origin: data(hit.point),
        plane: new Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
        // The latest target, applied or not: a release ends there.
        target: start,
      };
      hold(true);
      await force.constrain(index, start, true, generation);
    }
    // The next display frame applies the latest target. A page without frames (hidden) has a
    // timer instead, so settling never waits for a frame that does not come. The scheduled
    // application counts as the plot's preparation and the layout's work until it is drawn.
    function schedule() {
      if (scheduled || applying || !drag || !pending) return;
      let done;
      const entry = { promise: new Promise((resolve) => (done = resolve)), done };
      const run = () => {
        if (scheduled !== entry) return;
        unschedule(false);
        void apply().finally(done);
      };
      entry.frame = requestAnimationFrame(run);
      entry.timer = setTimeout(run, 100);
      scheduled = entry;
      force.track?.(entry.promise);
      trackPreparation(viewServices, entry.promise);
    }
    function unschedule(resolve = true) {
      const entry = scheduled;
      if (!entry) return;
      scheduled = null;
      cancelAnimationFrame(entry.frame);
      clearTimeout(entry.timer);
      if (resolve) entry.done();
    }
    async function apply() {
      const current = drag,
        next = pending;
      if (!current || !next || !alive) return;
      pending = null;
      applying = true;
      try {
        await force.constrain(current.index, next, true, current.generation, { move: true });
      } finally {
        applying = false;
      }
      // Moves that arrived meanwhile go in the next frame, not straight away: the plot draws
      // this one first.
      schedule();
    }
    function move(e) {
      if (!drag || e.pointerId !== pointer) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const point = project(e);
      if (point) {
        const at = data(point);
        drag.target = pending = at.map((v, i) => drag.start[i] + v - drag.origin[i]);
        schedule();
      }
    }
    // A release ends at the latest target, applied or not, and gives the node back its pin state;
    // a cancellation returns it to its start. Either follows the move being applied (the
    // layout applies its constraints in order) and replaces the one waiting for a frame.
    function finish(cancelled) {
      ++epoch;
      held = false;
      const old = drag;
      drag = null;
      pending = null;
      unschedule();
      restore();
      hold(false);
      if (old)
        return force.constrain(old.index, cancelled ? old.start : old.target, old.pinned, old.generation);
    }
    const up = (e) => {
      if (e.pointerId === pointer) void finish(false);
    };
    const cancel = () => void finish(true);
    const key = (e) => {
      if (e.key === "Escape") cancel();
    };
    target.addEventListener("pointerdown", down, true);
    target.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    target.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", key);
    return () => {
      alive = false;
      epoch++;
      held = false;
      hold(false);
      drag = null;
      pending = null;
      unschedule();
      restore();
      picking.removeInteractiveObject(mark);
      target.removeEventListener("pointerdown", down, true);
      target.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      target.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", key);
    };
  });
</script>
