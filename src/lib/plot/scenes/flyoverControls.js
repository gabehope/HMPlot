import { Quaternion, Vector3 } from "three/webgpu";
import {
  panOffset, wheelStep, SHIFT_MULTIPLIER, clampFlySpeed,
  groundPoint, rayPoint, anchorPan, groundHeight, zoomStep, zoomToward, zoomMinDistance,
  reseatTarget, flyVelocity, pinchStep, FLY_PITCH_LIMIT as PITCH_LIMIT,
} from "../utils/camera.js";

// Momentum's tuning (TODO 66.6, internal): the release velocity's window and the pause that cancels
// it (ms), the decay's time constant (s), the most travel in camera heights, the longest glide (s),
// the longest frame step taken (s), and the speed (camera heights per second) it stops under.
const GLIDE_WINDOW = 80, GLIDE_PAUSE = 40, GLIDE_TAU = 0.25, GLIDE_TRAVEL = 1.5, GLIDE_SECONDS = 1.5, GLIDE_STEP = 0.05, GLIDE_STOP = 0.02;

/**
 * First-person navigation that preserves the plot's chosen world-up axis, with map-style pan
 * and zoom: left-drag keeps the ground point under the cursor (the ground plane G is the plane
 * through the origin perpendicular to up), the wheel zooms toward the point under the cursor,
 * right-drag or Alt+left-drag looks around, and WASD/QE fly. On touch, one finger pans like the
 * drag and two fingers pinch: the ground point under their midpoint follows it and grows with
 * their spread. `speed` and Shift scale the wheel and keys, not the drag or the pinch. With
 * `ground: false` (spherical globe views) the drag pans at a rate and the wheel and pinch dolly
 * along the view, since a globe has no ground plane. `onChange` runs after each camera change
 * and `onInput` at the start of every user gesture.
 *
 * With `momentum` (TODO 66.6, the default) a ground pan released while moving glides on along
 * the ground, slowing exponentially (GLIDE_TAU) and bounded in speed, travel and time; height and
 * orientation stay. Its velocity is the ground displacement of the last GLIDE_WINDOW ms of the
 * drag, so a drag held still before release (GLIDE_PAUSE) does not glide. Reduced motion, any new
 * input, Escape, blur, a hidden page, disabling, a programmatic update() and dispose() stop it.
 * `onGlide(promise)` receives each glide, settled when it stops (the Plot's whenSettled waits).
 */
export function createFlyoverControls(
  camera,
  element,
  invalidate,
  { speed = 1, onChange = () => {}, onInput = () => {}, target: initialTarget = undefined, ground = true, enabled = true,
    momentum = true, onGlide = () => {} } = {},
) {
  speed = clampFlySpeed(speed);
  const up = camera.up.clone().normalize();
  const target = initialTarget
    ? new Vector3().copy(initialTarget)
    : camera.position.clone().addScaledVector(camera.getWorldDirection(new Vector3()), Math.max(1, camera.position.length()));
  const forward = new Vector3();
  const right = new Vector3();
  const planar = new Vector3();
  const lastPlanar = new Vector3();
  const motion = new Vector3();
  const unprojected = new Vector3();
  const yaw = new Quaternion();
  const pitch = new Quaternion();
  const keys = new Set();
  let dragging = false;
  let looking = false;
  let shift = false;
  let pointerId = -1;
  let lastX = 0;
  let lastY = 0;
  let anchor = null; // the grabbed ground point A, fixed for the whole drag
  const touches = new Map(); // touch pointerId -> client point, for the fingers of a touch drag
  let pinchSpread = 0; // the fingers' previous spread in pixels while two are down
  let frame = 0;
  let previousTime = 0;
  // Momentum (TODO 66.6): the camera's positions during a ground pan, and the glide under way.
  let samples = [], gliding = false;
  let glide = null, glideFrame = 0;
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  let focusDistance = Math.max(1, camera.position.distanceTo(target));
  const ownsTabIndex = enabled && element.tabIndex < 0;
  const previousTouchAction = element.style.touchAction;

  const sceneSize = () => camera.far / 20;
  const height = () => groundHeight(camera.position.toArray(), up.toArray());
  // A camera on the ground plane has no ground point to anchor: fall back to the rate-based pan.
  const anchored = () => ground && Math.abs(height()) > 1e-3 * sceneSize();
  const minDistance = () => zoomMinDistance(camera.near, sceneSize());

  const controls = {
    object: camera,
    target,
    get enabled() { return enabled; },
    set enabled(value) {
      enabled = !!value;
      if (!enabled) stopGlide();
    },
    get speed() { return speed; },
    set speed(value) { speed = clampFlySpeed(value); },
    /** false for globe views: no ground plane, so the drag pans at a rate and the wheel dollies. */
    get ground() { return ground; },
    set ground(value) {
      ground = !!value;
      if (!ground) stopGlide();
    },
    /** Whether a released ground pan glides on (TODO 66.6). */
    get momentum() { return momentum; },
    set momentum(value) {
      momentum = !!value;
      if (!momentum) stopGlide();
    },
    /** Whether a glide is under way. */
    get gliding() { return !!glide; },
    /** Apply the camera and target (a programmatic change stops a glide). */
    update() {
      stopGlide();
      refresh();
    },
    stopGlide() { stopGlide(); },
    /** Re-read world-up after the camera's up vector was set programmatically (cameraUp, setCamera). */
    syncUp() { up.copy(camera.up).normalize(); },
    dispose() {
      cancelAnimationFrame(frame);
      stopGlide();
      endDrag();
      element.removeEventListener("pointerdown", pointerDown);
      element.removeEventListener("pointermove", pointerMove);
      element.removeEventListener("pointerup", pointerUp);
      element.removeEventListener("pointercancel", pointerUp);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("keydown", keyDown);
      element.removeEventListener("keyup", keyUp);
      element.removeEventListener("blur", blur);
      element.removeEventListener("contextmenu", contextMenu);
      element.removeEventListener("lostpointercapture", lostCapture);
      globalThis.document?.removeEventListener("visibilitychange", hidden);
      reducedMotion?.removeEventListener?.("change", motionChanged);
      element.style.touchAction = previousTouchAction;
      if (ownsTabIndex) element.removeAttribute("tabindex");
    },
  };

  function refresh() {
    camera.up.copy(up);
    clampPitch();
    focusDistance = Math.max(0.01, camera.position.distanceTo(target));
    camera.lookAt(target);
    invalidate();
    onChange();
  }

  /** Keep the view off the pitch limit so lookAt never degenerates (a top-down align stops here). */
  function clampPitch() {
    forward.copy(target).sub(camera.position);
    const distance = forward.length();
    if (distance < 1e-9) { forward.copy(lastPlanar.lengthSq() ? lastPlanar : defaultPlanar()); }
    forward.normalize();
    const cosine = forward.dot(up);
    planar.copy(forward).addScaledVector(up, -cosine);
    if (planar.lengthSq() > 1e-12) lastPlanar.copy(planar).normalize();
    if (Math.abs(cosine) <= PITCH_LIMIT) return;
    const level = lastPlanar.lengthSq() ? lastPlanar : defaultPlanar();
    forward.copy(level).multiplyScalar(Math.sqrt(1 - PITCH_LIMIT * PITCH_LIMIT))
      .addScaledVector(up, Math.sign(cosine) * PITCH_LIMIT);
    target.copy(camera.position).addScaledVector(forward, Math.max(distance, 1e-3));
  }
  function defaultPlanar() {
    const axis = Math.abs(up.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    return axis.addScaledVector(up, -axis.dot(up)).normalize();
  }
  function setForward(direction) {
    forward.copy(direction).normalize();
    target.copy(camera.position).addScaledVector(forward, focusDistance);
    controls.update();
  }
  /** Put the target on the ground (or the horizon cap) along the centre ray. */
  function reseat() {
    if (!ground) return;
    target.fromArray(reseatTarget(
      { position: camera.position.toArray(), target: target.toArray(), up: up.toArray() },
      camera.far, minDistance(),
    ));
  }
  /** The world ray through a pointer position, through the camera's real projection. */
  function cursorRay(clientX, clientY) {
    const rect = element.getBoundingClientRect();
    const x = (2 * (clientX - rect.left)) / Math.max(1, rect.width) - 1;
    const y = 1 - (2 * (clientY - rect.top)) / Math.max(1, rect.height);
    camera.updateMatrixWorld();
    unprojected.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
    return { origin: camera.position.toArray(), direction: unprojected.toArray() };
  }
  const currentSpeed = () => speed * (shift ? SHIFT_MULTIPLIER : 1);
  /** Grab the ground point under a pointer for an anchored pan (null when there is none). */
  const grab = (clientX, clientY) =>
    anchored() ? groundPoint(cursorRay(clientX, clientY), up.toArray(), camera.far) : null;

  /** The touch gesture's point (the fingers' midpoint) and spread, in client pixels. */
  function touchCentre() {
    const [a, b] = touches.values();
    if (!b) return { x: a.x, y: a.y, spread: 0 };
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, spread: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  /** Re-anchor a touch drag when a finger lands or lifts, so the view does not jump. */
  function regrab() {
    const { x, y, spread } = touchCentre();
    lastX = x;
    lastY = y;
    pinchSpread = spread;
    anchor = grab(x, y);
  }

  function pointerDown(event) {
    if (!controls.enabled) return;
    const touch = event.pointerType === "touch";
    stopGlide();
    if (dragging) {
      // A second finger turns a one-finger drag into a pinch; a third is ignored.
      if (touch && touches.size === 1 && !touches.has(event.pointerId)) {
        onInput();
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        element.setPointerCapture?.(event.pointerId);
        regrab();
        // A pinch never glides: its fingers' earlier pan is forgotten.
        samples = [];
        gliding = false;
      }
      return;
    }
    if (!touch && event.button !== 0 && event.button !== 2) return;
    onInput();
    dragging = true;
    looking = !touch && (event.button === 2 || event.altKey);
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    if (touch) touches.set(pointerId, { x: lastX, y: lastY });
    anchor = looking ? null : grab(event.clientX, event.clientY);
    // Only a ground pan (a grabbed ground point) can glide.
    samples = [];
    gliding = !looking && !!anchor;
    if (controls.enabled) element.focus({ preventScroll: true });
    element.setPointerCapture?.(pointerId);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
  }
  /** Pan so the grabbed ground point is under (clientX, clientY), or at a rate with no anchor. */
  function pan(clientX, clientY, dx, dy) {
    if (anchor) {
      // Map-style pan: B from the current camera, translate camera and target by A - B.
      motion.fromArray(anchorPan(anchor, cursorRay(clientX, clientY), up.toArray(), camera.far));
    } else {
      // No ground point (globe, or a camera on the ground): pan at a rate along the ground.
      motion.fromArray(panOffset({ position: camera.position.toArray(), target: target.toArray(), up: up.toArray() }, dx, dy,
        { fov: camera.fov ?? 50, height: element.clientHeight, speed: currentSpeed() }));
    }
    camera.position.add(motion);
    target.add(motion);
  }
  /** Map-style zoom by log factor k: along the ray under (clientX, clientY), then re-seat the target. */
  function zoomAt(clientX, clientY, k) {
    const zoomAnchor = rayPoint(cursorRay(clientX, clientY), up.toArray(), camera.far);
    const next = zoomToward(camera.position.toArray(), zoomAnchor, k,
      { minDistance: minDistance(), maxDistance: 0.5 * camera.far });
    motion.fromArray(next).sub(camera.position);
    camera.position.add(motion);
    target.add(motion);
    reseat();
  }
  /** Globe views: move camera and target along the view. */
  function dolly(step) {
    forward.copy(target).sub(camera.position).normalize();
    camera.position.addScaledVector(forward, step);
    target.addScaledVector(forward, step);
  }
  /** Two fingers: the grabbed point follows their midpoint, then the view zooms toward it by the change in spread. */
  function pinchMove() {
    const { x, y, spread } = touchCentre();
    const dx = x - lastX, dy = y - lastY;
    const k = pinchStep(pinchSpread, spread);
    lastX = x;
    lastY = y;
    pinchSpread = spread;
    if (dx || dy) pan(x, y, dx, dy);
    if (k && ground) zoomAt(x, y, k);
    else if (k) dolly(-focusDistance * Math.expm1(k));
    if (dx || dy || k) controls.update();
  }
  function pointerMove(event) {
    if (!controls.enabled || !dragging) return;
    const finger = touches.has(event.pointerId);
    if (!finger && event.pointerId !== pointerId) return;
    if (event.buttons === 0) { endDrag(); return; } // the release was never delivered
    if (finger) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size > 1) { pinchMove(); return; }
    shift = event.shiftKey;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!dx && !dy) return;
    if (!looking) {
      pan(event.clientX, event.clientY, dx, dy);
      controls.update();
      if (gliding && anchor) {
        const time = event.timeStamp || performance.now();
        samples.push({ time, position: camera.position.clone() });
        while (samples.length > 2 && samples[0].time < time - 2 * GLIDE_WINDOW) samples.shift();
      }
      return;
    }
    forward.copy(target).sub(camera.position).normalize();
    yaw.setFromAxisAngle(up, -dx * 0.003);
    forward.applyQuaternion(yaw);
    right.crossVectors(forward, up).normalize();
    pitch.setFromAxisAngle(right, -dy * 0.003);
    const candidate = forward.clone().applyQuaternion(pitch);
    if (Math.abs(candidate.dot(up)) < PITCH_LIMIT) forward.copy(candidate);
    setForward(forward);
  }
  function endDrag(release = null) {
    if (!dragging) return;
    const wasLooking = looking;
    // A drag released while moving glides on (a pointerup; not a cancel or a lost release).
    if (release !== null && gliding && !wasLooking && touches.size <= 1) startGlide(release);
    samples = [];
    gliding = false;
    dragging = false;
    looking = false;
    anchor = null;
    for (const id of new Set([pointerId, ...touches.keys()]))
      if (id >= 0 && element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    touches.clear();
    pinchSpread = 0;
    pointerId = -1;
    window.removeEventListener("pointerup", pointerUp);
    window.removeEventListener("pointercancel", pointerUp);
    if (wasLooking) { reseat(); controls.update(); }
  }
  function pointerUp(event) {
    if (touches.size > 1 && touches.has(event.pointerId)) {
      // One finger of a pinch lifted: the other keeps dragging from where it is.
      touches.delete(event.pointerId);
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
      pointerId = touches.keys().next().value;
      regrab();
      return;
    }
    if (event.pointerId !== pointerId) return;
    endDrag(event.type === "pointerup" ? event.timeStamp || performance.now() : null);
  }
  /** Pointer capture lost while the drag is under way (not its own release): the drag ends, no glide. */
  function lostCapture(event) {
    if (dragging && (event.pointerId === pointerId || touches.has(event.pointerId))) endDrag();
  }
  /**
   * Glide on from a drag released at `time` (TODO 66.6): the camera's ground velocity over the last
   * GLIDE_WINDOW ms, along the ground, at most GLIDE_TRAVEL camera heights of travel; none when
   * the drag stood still for GLIDE_PAUSE ms, or is too slow to matter.
   */
  function startGlide(time) {
    if (!momentum || !ground || !controls.enabled || reducedMotion?.matches) return;
    const recent = samples.filter((sample) => sample.time >= time - GLIDE_WINDOW);
    if (recent.length < 2 || time - recent.at(-1).time > GLIDE_PAUSE) return;
    const span = (time - recent[0].time) / 1000;
    if (!(span >= 0.008)) return;
    const velocity = recent.at(-1).position.clone().sub(recent[0].position).divideScalar(span);
    velocity.addScaledVector(up, -velocity.dot(up));
    const level = Math.max(Math.abs(height()), 1e-3 * sceneSize());
    const fastest = (GLIDE_TRAVEL * level) / GLIDE_TAU;
    if (velocity.length() > fastest) velocity.setLength(fastest);
    if (!(velocity.length() > GLIDE_STOP * level)) return;
    let resolve;
    const done = new Promise((settle) => (resolve = settle));
    glide = { velocity, level, last: time, elapsed: 0, resolve };
    glideFrame = requestAnimationFrame(glideStep);
    onGlide(done);
  }
  /** One frame of the glide: the exact exponential decay over the time since the last, so 60 and
   * 120 Hz travel alike; a long gap counts as GLIDE_STEP at most. */
  function glideStep(now) {
    glideFrame = 0;
    if (!glide) return;
    const elapsed = Math.max(0, (now - glide.last) / 1000), dt = Math.min(GLIDE_STEP, elapsed);
    glide.last = Math.max(glide.last, now);
    // A delayed frame must not move the camera after the wall-time deadline.
    glide.elapsed += elapsed;
    if (glide.elapsed >= GLIDE_SECONDS) { stopGlide(); return; }
    if (dt > 0) {
      const decay = Math.exp(-dt / GLIDE_TAU);
      motion.copy(glide.velocity).multiplyScalar(GLIDE_TAU * (1 - decay));
      camera.position.add(motion);
      target.add(motion);
      glide.velocity.multiplyScalar(decay);
      refresh();
    }
    if (glide.velocity.length() < GLIDE_STOP * glide.level) stopGlide();
    else glideFrame = requestAnimationFrame(glideStep);
  }
  function stopGlide() {
    cancelAnimationFrame(glideFrame);
    glideFrame = 0;
    const ended = glide;
    glide = null;
    ended?.resolve();
  }
  const hidden = () => { if (globalThis.document?.visibilityState === "hidden") stopGlide(); };
  const motionChanged = () => { if (reducedMotion?.matches) stopGlide(); };
  function wheel(event) {
    if (!controls.enabled) return;
    event.preventDefault();
    stopGlide();
    onInput();
    // Chrome turns Shift+wheel into horizontal scroll: read deltaX then.
    const delta = event.deltaY === 0 && event.shiftKey ? event.deltaX : event.deltaY;
    if (!delta) return;
    if (ground) zoomAt(event.clientX, event.clientY, zoomStep(delta, event.deltaMode, speed, event.shiftKey));
    else dolly(wheelStep(delta, event.deltaMode, focusDistance, speed * (event.shiftKey ? SHIFT_MULTIPLIER : 1)));
    controls.update();
  }
  const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);
  function keyDown(event) {
    if (event.key === "Shift") shift = true;
    if (event.key === "Escape") stopGlide();
    if (!controls.enabled || !movementKeys.has(event.code)) return;
    // Cmd+S, Ctrl+W and friends belong to the page, not the camera.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    stopGlide();
    if (!keys.has(event.code)) onInput();
    keys.add(event.code);
    if (!frame) frame = requestAnimationFrame(advance);
  }
  function keyUp(event) {
    if (event.key === "Shift") shift = false;
    // macOS does not deliver the letter's keyup while Cmd is held: release everything with it.
    if (event.key === "Meta" || event.key === "Control") keys.clear();
    keys.delete(event.code);
  }
  function blur() {
    shift = false;
    keys.clear();
    previousTime = 0;
    stopGlide();
  }
  function contextMenu(event) {
    if (controls.enabled) event.preventDefault();
  }
  function advance(time) {
    frame = 0;
    if (!controls.enabled || !keys.size) {
      previousTime = 0;
      return;
    }
    const dt = previousTime ? Math.min(0.05, (time - previousTime) / 1000) : 0;
    previousTime = time;
    forward.copy(target).sub(camera.position).normalize();
    right.crossVectors(forward, up).normalize();
    planar.copy(forward).addScaledVector(up, -forward.dot(up)).normalize();
    motion.set(0, 0, 0);
    if (keys.has("KeyW")) motion.add(planar);
    if (keys.has("KeyS")) motion.sub(planar);
    if (keys.has("KeyD")) motion.add(right);
    if (keys.has("KeyA")) motion.sub(right);
    if (keys.has("KeyE")) motion.add(up);
    if (keys.has("KeyQ")) motion.sub(up);
    if (motion.lengthSq() && dt) {
      // Speed follows the height above the ground, so keys slow down near it at any pitch.
      const velocity = ground ? flyVelocity(height(), sceneSize(), speed, shift) : Math.max(2, focusDistance * 0.7) * currentSpeed();
      motion.normalize().multiplyScalar(velocity * dt);
      camera.position.add(motion);
      target.add(motion);
      controls.update();
    }
    frame = requestAnimationFrame(advance);
  }

  if (ownsTabIndex) element.tabIndex = 0;
  element.style.touchAction = "none";
  element.addEventListener("pointerdown", pointerDown);
  element.addEventListener("pointermove", pointerMove);
  element.addEventListener("pointerup", pointerUp);
  element.addEventListener("pointercancel", pointerUp);
  element.addEventListener("wheel", wheel, { passive: false });
  element.addEventListener("keydown", keyDown);
  element.addEventListener("keyup", keyUp);
  element.addEventListener("blur", blur);
  element.addEventListener("contextmenu", contextMenu);
  element.addEventListener("lostpointercapture", lostCapture);
  globalThis.document?.addEventListener("visibilitychange", hidden);
  reducedMotion?.addEventListener?.("change", motionChanged);
  reseat();
  controls.update();
  return controls;
}
