import { Raycaster, Plane, Vector2, Vector3 } from "three/webgpu";

/**
 * DRAG ROUTING (TODO 38.3). One pointer listener per canvas for all of its draggable marks, so
 * a press picks once and goes to the one mark it hit (a listener per mark, as Force's drag
 * has, would replay a missed press to the next mark's listener and back).
 *
 * A primary press without Shift (Shift-drag brushes) is held while the canvas picks. On a
 * draggable row it becomes that mark's press: pan and zoom are off and the pointer is
 * captured until it ends. On anything else the press is sent on (replayed), so the plot pans
 * and clicks select as before. The drag begins once the pointer moves 3 CSS pixels; a press
 * released before that is replayed with its release, so a click on a draggable row still
 * selects it. Each move goes through pointerData (the camera ray through the pointer, the
 * drag plane, then the pick's world-to-data mapping), and the offsets it gives are written
 * once per animation frame, as brush moves are. Escape and pointercancel end a drag and
 * restore the offsets from its start; during the pick they end the press, and the pick's late
 * result is dropped (CODEX_REVIEW #5).
 *
 * The browser's click after a held press is the router's too: picking judges a click against
 * the last press it saw, which for a drag is an earlier one (the drag's own was held). A drag's
 * click (also one cancelled with Escape) is swallowed; a click that arrives while its press is
 * still being picked (a quick tap) is held and replayed after the replayed press.
 *
 * A mark registers { draggable(), options(), directions(hit) (its dragged axes' world directions
 * in 3D), start(hit, origin) -> session | { reason }, begin(session),
 * move(session, writes), end(session, cancelled) }.
 */
const routers = new WeakMap();
const THRESHOLD = 3;

/**
 * The plane a drag moves on, through `point`: the plane the dragged axes span (two axes in 3D,
 * `directions` their world directions), the plane through one axis that faces the camera
 * most, or else the plane facing the camera (z = the point's depth in 2D).
 */
export function dragPlane(point, camera, directions = null) {
  const view = camera.isOrthographicCamera ? new Vector3(0, 0, 1) : camera.getWorldDirection(new Vector3());
  let normal = view;
  if (directions?.length === 2) {
    const spanned = new Vector3().crossVectors(directions[0], directions[1]);
    if (spanned.lengthSq() > 1e-12) normal = spanned.normalize();
  } else if (directions?.length === 1) {
    const axis = directions[0].clone().normalize();
    const facing = view.clone().sub(axis.multiplyScalar(view.dot(axis)));
    if (facing.lengthSq() > 1e-12) normal = facing.normalize();
  }
  return new Plane().setFromNormalAndCoplanarPoint(normal, point);
}

/**
 * The pointer's position in a mark's data, where the camera ray through it meets `plane`:
 * { x, y, z } from `axisValue(world, options)` (the pick's world-to-data mapping), or null
 * where the ray misses the plane. Stage 19's pointer columns can share it.
 */
export function pointerData({ clientX, clientY, element, camera, plane, options, axisValue }) {
  const box = element.getBoundingClientRect(), ray = new Raycaster();
  ray.setFromCamera(new Vector2(((clientX - box.left) / box.width) * 2 - 1, 1 - ((clientY - box.top) / box.height) * 2), camera);
  const world = ray.ray.intersectPlane(plane, new Vector3());
  return world ? axisValue([world.x, world.y, world.z], options) ?? null : null;
}

/**
 * The router for `renderer`'s canvas, created with its first draggable mark. A held press turns
 * off its view's navigation controls (`navigation`, the view's ViewNavigation) until it ends.
 */
export function dragRouter(renderer, picking, camera, navigation) {
  let router = routers.get(renderer);
  if (!router) routers.set(renderer, (router = createRouter(renderer, picking, camera, navigation)));
  return router;
}

function createRouter(renderer, picking, camera, navigation) {
  const target = renderer.domElement, marks = new Map(), replayed = new WeakSet();
  let press = null, frame = 0;
  // The press whose click comes next (set when its button comes up), and the pointer of a held
  // press that ended before its button came up (Escape, a refused drag).
  let clicking = null, cancelledPointer = null;

  const replay = (event) => {
    const copy = new PointerEvent(event.type, event);
    replayed.add(copy);
    target.dispatchEvent(copy);
  };
  /** Give the press back: controls on, capture released, and (unless it dragged) replayed. */
  function release(current, again) {
    if (press !== current) return;
    press = null;
    cancelAnimationFrame(frame);
    frame = 0;
    if (current.held) {
      const controls = navigation?.controls.current;
      if (controls) controls.enabled = current.enabled;
      try { target.releasePointerCapture(current.pointer); } catch {}
      target.style.cursor = current.cursor ?? "";
    }
    if (again) {
      replay(current.down);
      if (current.up) replay(current.up);
      if (current.click) replay(current.click);
    } else if (!current.up) {
      // Ended before its button came up (Escape, a refused drag): its click is swallowed too.
      cancelledPointer = current.pointer;
    }
  }
  async function begin(current) {
    // A start that fails refuses the drag, so the press still ends.
    const session = await Promise.resolve(current.starting).catch((error) => ({ reason: error?.message ?? String(error) }));
    if (press !== current) { session?.end?.(); return null; }
    if (!session || session.reason) {
      current.entry.refuse?.(session?.reason ?? "it cannot be dragged");
      release(current, false);
      return null;
    }
    current.session = session;
    session.layer.beginDrag();
    current.entry.begin?.(session);
    target.style.cursor = "grabbing";
    return session;
  }
  async function apply(current) {
    frame = 0;
    const session = current.session ?? (current.begun ??= begin(current), await current.begun);
    if (!session || press !== current || !current.last) return;
    const event = current.last;
    const at = pointerData({
      clientX: event.clientX, clientY: event.clientY, element: target, camera: camera(), plane: current.plane,
      options: current.entry.options(), axisValue: picking.axisValue,
    });
    const writes = session.move(at);
    if (!writes) return;
    session.write(writes);
    current.entry.move?.(session, writes);
  }
  async function finish(current, cancelled) {
    if (!current.moved) return release(current, !cancelled);
    await apply(current);
    const session = current.session ?? (await current.begun);
    if (session) {
      // The drag's last write is a drag's; a restore (Escape) is not, so it animates back.
      session.layer.endDrag();
      session.end(cancelled);
      current.entry.end?.(session, cancelled);
    }
    release(current, false);
  }

  async function down(event) {
    if (replayed.has(event)) return;
    clicking = cancelledPointer = null;
    if (event.button !== 0 || !event.isPrimary || event.shiftKey || press || !marks.size) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const current = (press = { pointer: event.pointerId, down: event, x: event.clientX, y: event.clientY, up: null, moved: false });
    // A failed pick is a miss: the press goes on to the plot.
    const hit = await Promise.resolve(picking.pickAt?.(event.clientX, event.clientY)).catch(() => null);
    // Cancelled (Escape, pointercancel) or given back while picking: the result is not used.
    if (press !== current) return;
    const entry = hit && marks.get(hit.object);
    if (!entry || !Number.isInteger(hit.instanceId) || hit.instanceId < 0 || !entry.draggable()) return release(current, true);
    const controls = navigation?.controls.current;
    Object.assign(current, { entry, hit, held: true, enabled: controls?.enabled ?? true, cursor: target.style.cursor });
    if (controls) controls.enabled = false;
    try { target.setPointerCapture(current.pointer); } catch {}
    current.plane = dragPlane(hit.point, camera(), entry.directions?.(hit));
    // The press through the same mapping as every move, so a move along one axis leaves the
    // others exactly where they were.
    const origin = pointerData({ clientX: event.clientX, clientY: event.clientY, element: target, camera: camera(),
      plane: current.plane, options: entry.options(), axisValue: picking.axisValue });
    current.starting = entry.start(hit, origin);
    if (current.up) void finish(current, false);
  }
  function move(event) {
    const current = press;
    if (!current?.entry || event.pointerId !== current.pointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < THRESHOLD) return;
    current.moved = true;
    current.last = event;
    if (!frame) frame = requestAnimationFrame(() => void apply(current));
  }
  function up(event) {
    const current = press;
    if (replayed.has(event)) return;
    if (!current && event.pointerId === cancelledPointer) {
      cancelledPointer = null;
      clicking = { moved: true };
    }
    if (!current || event.pointerId !== current.pointer) return;
    clicking = current;
    // Released while the canvas was still picking: the press finishes when the pick does.
    if (!current.entry) { current.up = event; return; }
    event.stopImmediatePropagation();
    current.up = event;
    void finish(current, false);
  }
  function click(event) {
    const current = clicking;
    if (replayed.has(event) || !current) return;
    clicking = null;
    // A drag's click; or a tap still being picked, replayed after its press. A press already
    // given back (released and replayed) lets its click through.
    if (current.moved || press === current) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!current.moved) current.click = event;
    }
  }
  // A press still being picked has no drag to end: it is given back, without a replay.
  const cancel = () => {
    if (press?.entry) void finish(press, true);
    else if (press) release(press, false);
  };
  const key = (event) => { if (event.key === "Escape") cancel(); };

  let listening = false;
  const listen = (on) => {
    if (listening === on) return;
    listening = on;
    const method = on ? "addEventListener" : "removeEventListener";
    target[method]("pointerdown", down, true);
    target[method]("pointermove", move, true);
    window[method]("pointerup", up, true);
    window[method]("click", click, true);
    target[method]("pointercancel", cancel, true);
    window[method]("keydown", key);
  };
  return {
    /** Route presses on `mark` to `entry`; returns the function that stops it. */
    add(mark, entry) {
      marks.set(mark, entry);
      listen(true);
      return () => {
        if (marks.get(mark) !== entry) return;
        marks.delete(mark);
        if (press?.entry === entry) void finish(press, true);
        if (!marks.size) listen(false);
      };
    },
    /** Whether a drag is in progress (tests; the settings pane). */
    get dragging() { return Boolean(press?.session); },
  };
}
