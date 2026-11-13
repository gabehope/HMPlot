import { cameraMatrixKey } from "../plot/utils/camera.js";
import { sourcePosition } from "./sourcePosition.js";
import { spherical } from "../plot/utils/coordinates.js";
import { readPixel, readPixels } from "./readPixel.js";
import { pixelAt } from "./pixel.js";
import { nearestHit, pickWindow } from "./tolerantPick.js";
import { beginInteraction, endInteraction } from "../plot/utils/interaction.js";
import { animationVersion } from "../plot/utils/markAnimation.js";
import {
  Vector2,
  Vector3,
  Raycaster,
  Scene,
  RenderTarget,
  Mesh,
  MeshBasicNodeMaterial,
} from "three/webgpu";
import { useInteractivity } from "./context.js";
import { currentCause, adoptCause, trackPreparation } from '../plot/rendering/viewSettlement.js';
import { fromStore } from "svelte/store";
import { useThrelte } from "@threlte/core";
import { uv, uniform, ivec3 } from "three/tsl";
function createIntersectionId(intersection) {
  return `${(intersection.eventObject || intersection.object).uuid}|${intersection.index}|${intersection.instanceId}`;
}
const DOM_EVENTS = [
  ["click", false],
  ["contextmenu", false],
  ["dblclick", false],
  ["wheel", false],
  ["pointerdown", true],
  ["pointerup", true],
  ["pointerleave", true],
  ["pointerenter", true],
  ["pointermove", true],
  ["pointercancel", true],
];
// The events whose hits a click-only mark needs (its onclick and onpointermissed come from them).
const CLICK_EVENTS = new Set(["click", "contextmenu", "dblclick", "pointerdown", "pointerup"]);
export const setupInteractivity = (context) => {
  const { handlers } = useInteractivity();
  // A mark's accepted binding (Stage 117.2): its tolerant pick, area and frame.
  const binding = (object) => context.view?.marks.of(object);
  // Whether a pickable mark takes the tolerant pick's row (nearest, or a tooltip; TODO 44, 72), and
  // the largest radius (CSS pixels) of those marks.
  const nearestMarks = () => context.interactiveObjects.some((object) => binding(object)?.nearest && !object.isDisposed);
  const nearestRadius = () => {
    let radius = 0;
    for (const object of context.interactiveObjects) {
      const nearest = binding(object)?.nearest;
      if (nearest && !object.isDisposed) radius = Math.max(radius, nearest.radius ?? 0);
    }
    return radius;
  };
  // What a pick pixel's object is to a tolerant pick (tolerantPick.js).
  const pickKind = (id) => {
    const object = context.objectIdMap.get(id);
    if (!object || object.isDisposed || !handlers.has(object)) return null;
    const bound = binding(object);
    if (bound?.pickArea) return "area";
    return bound?.nearest ? "nearest" : "row";
  };
  let surfaceDrag;
  function releaseSurfaceDrag(event, cancel = false) {
    if (!surfaceDrag) return;
    const old = surfaceDrag;
    surfaceDrag = undefined;
    const controls = context.view?.navigation.controls.current;
    if (controls) controls.enabled = old.controlsEnabled;
    if (old.target?.hasPointerCapture?.(old.pointerId))
      old.target.releasePointerCapture(old.pointerId);
    if (cancel)
      handlers
        .get(old.hit.eventObject)
        ?.onpointercancel?.({ ...old.hit, nativeEvent: event });
  }
  let generation = 0;
  let latestMove = 0;
  let connected = false;
  const calculateDistance = (event) => {
    const dx = event.clientX - context.initialClick[0];
    const dy = event.clientY - context.initialClick[1];
    return Math.round(Math.hypot(dx, dy));
  };
  const cancelPointer = (intersections) => {
    if (context.hovered.size === 0) {
      return;
    }
    const hitIds = new Set();
    for (const intersection of intersections) {
      hitIds.add(createIntersectionId(intersection));
    }
    for (const [id, hoveredObj] of context.hovered) {
      // When no objects were hit or the the hovered object wasn't found underneath the cursor
      // we call pointerout and delete the object from the hovered elements map
      if (!hitIds.has(id)) {
        const { eventObject } = hoveredObj;
        context.hovered.delete(id);
        const events = handlers.get(eventObject);
        if (events) {
          // Clear out intersects, they are outdated by now
          const data = { ...hoveredObj, intersections };
          events.onpointerout?.(data);
          events.onpointerleave?.(data);
        }
      }
    }
  };
  const getHitsRaycast = () => {
    if (!context.enabled.current || !context.interactiveObjects.length)
      return [];
    const intersections = [];
    const rawHits = context.raycaster.intersectObjects(
      context.interactiveObjects,
      true,
    );
    const seen = new Set();
    // Deduplicate hits by object. When recursive=true, intersectObjects searches
    // each registered object's full subtree, so a child that is itself registered
    // appears once per registered ancestor — causing duplicate events. The key is
    // context-sensitive so that legitimate multi-hit objects are preserved:
    //   InstancedMesh — each instance is a distinct target, key by instanceId
    //   Points        — each point is a distinct target, key by point index
    //   Mesh / other  — uuid only; multiple face hits are the same surface
    const hits = rawHits.filter((hit) => {
      const key =
        hit.instanceId !== undefined
          ? `${hit.object.uuid}|${hit.instanceId}`
          : hit.object.isPoints
            ? `${hit.object.uuid}|${hit.index}`
            : hit.object.uuid;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const filtered =
      context.filter === undefined ? hits : context.filter(hits, context);
    // Bubble up the events, find the event source (eventObject)
    for (const hit of filtered) {
      let eventObject = hit.object;
      // Bubble event up
      while (eventObject) {
        if (handlers.has(eventObject))
          intersections.push({ ...hit, eventObject });
        eventObject = eventObject.parent;
      }
    }
    return intersections;
  };
  /**
   * The intersection at the pick pixel (`x`, `y`) in device pixels, from its "output" `data`
   * (objectId, instanceId, u, v) and its "world" point; null where no live object is drawn.
   */
  const intersectionAt = async (data, world, x, y) => {
    const renderer = context.renderer, { width, height } = context.scenePass.renderTarget;
    const [objectIdFloat, instanceIdFloat, uvX, uvY] = data;
    const objectId = Math.round(objectIdFloat);
    const instanceId = Math.round(instanceIdFloat);
    const object = context.objectIdMap.get(objectId);
    if (!object || object.isDisposed || !world[3]) return null;
    // An object whose mesh coordinates are not its parameters maps them (a polar Rect's).
    const uv = () => object.pickUV?.(new Vector2(uvX, uvY)) ?? new Vector2(uvX, uvY);
    let intersection = {
      object,
      eventObject: context.objectIdMap.get(objectId),
      instanceId,
      uv: uv(),
      distance: 0,
      point: new Vector3(world[0], world[1], world[2]),
      dataPoint: object.dataPoint?.(uv()),
      axisValue: context.axisValue?.(world, object.options),
      frame: binding(object)?.frameKey ?? null,
      // The picked pixel's centre in CSS pixels from the canvas's top left (a tolerant pick's
      // may be off the pointer).
      pixel: [
        ((x + 0.5) * renderer.domElement.clientWidth) / width,
        ((y + 0.5) * renderer.domElement.clientHeight) / height,
      ],
    };
    if (spherical(object.options) && object.fields?.has("position")) {
      const source = await sourcePosition(object, instanceId);
      if (source) {
        intersection.dataPoint = source;
        intersection.axisValue = {
          x: source[0],
          y: source[1],
          z: source[2] ?? 0,
        };
      }
    }
    if (object.surfaceTexture)
      intersection = await object.surfaceTexture.pick(intersection);
    return intersection ?? null;
  };
  /**
   * The hits under the pointer: the pixel under it (its pointer events, hover and selection), and
   * with `tolerant` while a mark takes nearest, `nearest` on the array: the tolerant pick's
   * intersection (TODO 72), or null.
   */
  const getHits = async (pointerSnapshot, waitForFrame = false, tolerant = false) => {
    if (!context.enabled.current || !context.interactiveObjects.length)
      return [];
    if (!context.scenePass || !context.renderer) {
      return [];
    }
    if (waitForFrame && context.isPickCurrent && !context.isPickCurrent()) {
      const pass = context.scenePass,
        epoch = generation,
        deadline = performance.now() + 1500;
      // A pick drawn on demand (TODO 63.2) is asked for again while the view still moves.
      const ask = () => (context.requestPick ? context.requestPick() : context.invalidate?.());
      ask();
      while (
        context.scenePass === pass &&
        generation === epoch &&
        !context.isPickCurrent() &&
        performance.now() < deadline
      ) {
        await new Promise(requestAnimationFrame);
        if (!context.isPickCurrent()) ask();
      }
    }
    if (context.isPickCurrent && !context.isPickCurrent())
      return surfaceDrag ? [surfaceDrag.hit] : null;
    const intersections = [];
    const scenePass = context.scenePass;
    const pickTexture = scenePass.getTexture("output");
    const camera = scenePass.camera;
    const key = () =>
      JSON.stringify([
        cameraMatrixKey(camera),
        ...context.interactiveObjects.map((o) => [
          o.uuid,
          o.geometry?.uuid,
          o.material?.version,
          o.surfaceVersion,
          animationVersion(o),
          o.surfaceTexture?.version,
          o.options?.get("zScale"),
          o.valueBoundsNode?.value,
          o.matrixWorld?.elements,
        ]),
      ]);
    const version = key(),
      epoch = generation;
    const pointer = pointerSnapshot ?? context.pointer.current;
    const renderer = context.renderer;
    // Targets the GPU has not allocated yet (the pass has not drawn since it was made or
    // resized) hold nothing to read: the pick is not ready, as an obsolete one is.
    const allocated = (texture) => Boolean(renderer.backend.get(texture)?.texture);
    if (!allocated(pickTexture) || !allocated(scenePass.getTexture("world"))) return null;
    const { width, height } = scenePass.renderTarget;
    const readX = pixelAt(pointer.x * 0.5 + 0.5, width);
    const readY = pixelAt(-pointer.y * 0.5 + 0.5, height);
    // While a mark takes nearest (or has a tooltip), a move reads a window around the pointer
    // (TODO 44, 72): the nearest row of such a mark within its radius is the tolerant pick's when
    // no row is under the pointer. The pointer's own pixel is in it, for the other events.
    const nearest = tolerant && !surfaceDrag && nearestMarks();
    const scale = width / Math.max(1, renderer.domElement.clientWidth);
    const radius = nearest ? Math.round(nearestRadius() * scale) : 0;
    let data, world, near = null;
    if (radius > 0) {
      const area = pickWindow(readX, readY, radius, width, height);
      const [pixels, center] = await Promise.all([
        readPixels(renderer, pickTexture, area.left, area.top, area.width, area.height),
        readPixel(renderer, scenePass.getTexture("world"), readX, readY),
      ]);
      const own = (area.center[1] * area.width + area.center[0]) * 4;
      data = pixels.slice(own, own + 4);
      world = center;
      const reach = (id) => Math.round((binding(context.objectIdMap.get(id))?.nearest?.radius ?? 0) * scale);
      const hit = nearestHit(pixels, area.width, area.height, area.center, radius, pickKind, reach);
      const x = area.left + hit.x, y = area.top + hit.y;
      if (x === readX && y === readY) near = { at: null };
      else {
        const at = (hit.y * area.width + hit.x) * 4;
        near = { at: [pixels.slice(at, at + 4), await readPixel(renderer, scenePass.getTexture("world"), x, y), x, y] };
      }
    } else {
      [data, world] = await Promise.all([
        readPixel(renderer, pickTexture, readX, readY),
        readPixel(renderer, scenePass.getTexture("world"), readX, readY),
      ]);
      if (nearest) near = { at: null };
    }
    if (
      epoch !== generation ||
      scenePass !== context.scenePass ||
      version !== key()
    )
      return null;
    if (context.view) context.view.diagnostics.lastPick = Array.from(data);
    let intersection = await intersectionAt(data, world, readX, readY);
    if (epoch !== generation || version !== key()) return null;
    // The tolerant pick: the pointer's own intersection, or the nearest row's.
    const nearestIntersection = !near ? undefined : near.at ? await intersectionAt(...near.at) : intersection;
    if (epoch !== generation || version !== key()) return null;
    if (intersection) {
      // The object the pixel names (a surface texture's intersection names the child it shows).
      const object = context.objectIdMap.get(Math.round(data[0])), [, , uvX, uvY] = data;
      if (surfaceDrag) {
        const surface = surfaceDrag.hit.surface;
        if (object === surface) {
          intersection = {
            ...surfaceDrag.hit,
            point: intersection?.point ?? surfaceDrag.hit.point,
            surfaceUV: new Vector2(uvX, uvY),
            dataPoint: surface.dataPoint(new Vector2(uvX, uvY)),
          };
          if (spherical(surface.options)) {
            const period =
              surface.options.get("angleUnit") === "radians"
                ? Math.PI * 2
                : 360;
            intersection.dataPoint[0] +=
              Math.round(
                (surfaceDrag.hit.dataPoint[0] - intersection.dataPoint[0]) /
                  period,
              ) * period;
          }
          surfaceDrag.hit = intersection;
        } else intersection = surfaceDrag.hit;
      }
      if (intersection) intersections.push(intersection);
    }
    if (!intersections.length && surfaceDrag)
      intersections.push(surfaceDrag.hit);
    if (nearestIntersection !== undefined) intersections.nearest = nearestIntersection;
    return intersections;
  };
  // The tolerant pick's row (TODO 72), apart from the exact pick's hover: a mark with nearest
  // gets onnearestenter when the row becomes one of its own (again for each new row of it, with
  // no leave between, so @nearest and a tooltip do not flicker), onnearestmove on every move, and
  // onnearestleave when the row goes to nothing or to another object.
  let nearestEntry = null;
  const leaveNearest = () => {
    const old = nearestEntry;
    nearestEntry = null;
    if (old) handlers.get(old.event.eventObject)?.onnearestleave?.(old.event);
  };
  const updateNearest = (hit, base) => {
    if (nearestEntry && nearestEntry.event.eventObject !== hit?.eventObject) leaveNearest();
    if (!hit) return;
    const id = createIntersectionId(hit), events = handlers.get(hit.eventObject);
    const event = { ...base, ...hit, intersections: [hit], stopped: false, stopPropagation() {}, stopImmediatePropagation() {} };
    if (nearestEntry?.id !== id) {
      nearestEntry = { id, event };
      events?.onnearestenter?.(event);
    }
    events?.onnearestmove?.(event);
  };
  const pointerMissed = (event, objects) => {
    for (const object of objects) {
      handlers.get(object)?.onpointermissed?.(event);
    }
  };
  const handlePointerLeaveOrCancel = (event) => {
    if (surfaceDrag && event?.type === "pointerleave") return;
    // A finger leaves as it lifts: a tap's hover (and its tooltip, TODO 44) stays until the next tap.
    if (event?.type === "pointerleave" && event.pointerType === "touch") return;
    releaseSurfaceDrag(event, true);
    generation++;
    latestMove++;
    cancelAnimationFrame(moveRAF);
    moveRAF = 0;
    moveDone?.(); // the canceled frame's tracked work ends here
    moveDone = null;
    queuedMoveEvent = null;
    lastMoveX = lastMoveY = -Infinity;
    context.pointerOverTarget.set(false);
    cancelPointer([]);
    leaveNearest();
  };
  const escapeSurface = (event) => {
    if (event.key === "Escape" && surfaceDrag) {
      generation++;
      releaseSurfaceDrag(event, true);
    }
  };
  const handlePointerEnter = () => {
    context.pointerOverTarget.set(true);
  };
  // A pick reads the pointer's pixel back before it dispatches: the event's change (hover,
  // selection) lands after that, so the work is tracked with the event's cause and the dispatch
  // adopts it (TODO 17.15: whenSettled() after a pointer event waits for what it reruns).
  const track = (work, cause) => {
    if (context.view) trackPreparation(context.view, work.catch(() => {}), cause);
    return work;
  };
  const handleEvent = (event, cause = currentCause()) => track(pick(event, cause), cause);
  const pick = async (event, cause) => {
    if (
      !connected ||
      !context.enabled.current ||
      !context.scenePass ||
      !context.renderer
    )
      return;
    const eventGeneration = generation;
    const eventPass = context.scenePass;
    const name = event.type;
    const isPointerMove = name === "pointermove";
    // A tap hovers what it lands on, as a move does (a finger has no hover of its own; TODO 44).
    const tapHover = name === "pointerup" && event.pointerType === "touch";
    const isClickEvent =
      name === "click" || name === "contextmenu" || name === "dblclick";
    /**
     * Will set up the raycaster. The default implementation will use the
     * mouse position on the renderers domElement.
     */
    context.compute(event, context);
    const moveId = isPointerMove ? ++latestMove : latestMove;
    const pointer = context.pointer.current.clone();
    let hits;
    try {
      // Marks that only take clicks draw their pick on demand (TODO 63.2): a move, a wheel or a
      // leave has nothing to dispatch to them, so it reads no pick.
      hits = context.pickOnDemand?.() && !CLICK_EVENTS.has(name) ? [] : await getHits(pointer, true, isPointerMove || tapHover);
      // An obsolete/unready pick is not a hit on empty background. Keep the
      // last hover until a completed pick or an actual pointer leave.
      if (hits === null) return;
    } catch (error) {
      if (
        connected &&
        generation === eventGeneration &&
        eventPass === context.scenePass
      )
        console.error("Picking read failed", error);
      return;
    }
    if (
      !connected ||
      generation !== eventGeneration ||
      eventPass !== context.scenePass ||
      (isPointerMove && moveId !== latestMove)
    )
      return;
    adoptCause(context.view, cause);
    const delta = isClickEvent ? calculateDistance(event) : 0;
    // Save initial coordinates and timestamp on pointer-down
    if (name === "pointerdown") {
      context.initialClick = [event.clientX, event.clientY];
      context.initialClickTime = event.timeStamp;
      context.initialHits = hits.map((hit) => hit.eventObject);
      const child = hits.find(
        (hit) =>
          hit.surface &&
          handlers.get(hit.eventObject)?.onpointerdown &&
          handlers.get(hit.eventObject)?.onpointermove,
      );
      if (child) {
        const controls = context.view?.navigation.controls.current;
        surfaceDrag = {
          hit: child,
          controlsEnabled: controls?.enabled ?? true,
          target: event.target,
          pointerId: event.pointerId,
        };
        if (controls) controls.enabled = false;
        event.target.setPointerCapture?.(event.pointerId);
      }
    }
    const isClick =
      isClickEvent &&
      delta <= context.clickDistanceThreshold &&
      event.timeStamp - context.initialClickTime <= context.clickTimeThreshold;
    // Fire pointermissed for objects that were not under the pointer at pointerdown.
    // Must come before the dispatch loop so user-land cleanup runs first.
    if (isClick) {
      pointerMissed(
        event,
        context.interactiveObjects.filter(
          (object) => !context.initialHits.includes(object),
        ),
      );
    }
    // Update hover state before dispatch so that pointerout/pointerleave fire
    // before pointerover/pointerenter on newly hit objects. This ordering is
    // important for useCursor and similar hooks that set state in both handlers.
    // One interaction transaction per pointer event (TODO 136.8): its leaves and enters publish
    // together; an enter that reads rows holds it until they arrive (markInteractionEvents).
    beginInteraction();
    try {
    if (isPointerMove || tapHover) cancelPointer(hits);
    let stopped = false;
    let stoppedAt = -1;
    // loop through all hits and dispatch events
    dispatchEvents: for (const hit of hits) {
      const events = handlers.get(hit.eventObject);
      if (!events) continue;
      const intersectionEvent = {
        stopped,
        ...hit,
        intersections: hits,
        stopPropagation() {
          stopped = true;
          intersectionEvent.stopped = true;
          if (
            context.hovered.size > 0 &&
            Array.from(context.hovered.values()).some(
              (i) => i.eventObject === hit.eventObject,
            )
          ) {
            // Objects cannot flush out higher up objects that have already caught the event
            const higher = hits.slice(0, hits.indexOf(hit));
            cancelPointer([...higher, hit]);
          }
        },
        stopImmediatePropagation() {
          event.stopImmediatePropagation();
        },
        camera: context.raycaster.camera,
        delta,
        nativeEvent: event,
        pointer,
        ray: context.raycaster.ray,
      };
      if (isPointerMove) {
        // Move event ...
        if (
          events.onpointerover ||
          events.onpointerenter ||
          events.onpointerout ||
          events.onpointerleave
        ) {
          const id = createIntersectionId(intersectionEvent);
          const hoveredItem = context.hovered.get(id);
          if (!hoveredItem) {
            // If the object wasn't previously hovered, book it and call its handler
            context.hovered.set(id, intersectionEvent);
            events.onpointerover?.(intersectionEvent);
            events.onpointerenter?.(intersectionEvent);
          } else if (hoveredItem.stopped) {
            // If the object was previously hovered and stopped, we shouldn't allow other items to proceed
            intersectionEvent.stopPropagation();
          }
        }
        // Call pointer move
        events.onpointermove?.(intersectionEvent);
        // If the pointermove handler called stopPropagation, update the hovered
        // entry so subsequent moves continue to block farther objects.
        if (intersectionEvent.stopped) {
          const id = createIntersectionId(intersectionEvent);
          const hoveredItem = context.hovered.get(id);
          if (hoveredItem) {
            hoveredItem.stopped = true;
          }
        }
      } else {
        if (tapHover && (events.onpointerover || events.onpointerenter || events.onpointerout || events.onpointerleave)) {
          const id = createIntersectionId(intersectionEvent);
          if (!context.hovered.has(id)) {
            context.hovered.set(id, intersectionEvent);
            events.onpointerover?.(intersectionEvent);
            events.onpointerenter?.(intersectionEvent);
          }
        }
        // All other events
        if (events[`on${name}`]) {
          if (
            !isClickEvent ||
            (isClick && context.initialHits.includes(hit.eventObject))
          ) {
            events[`on${name}`]?.(intersectionEvent);
          }
        }
      }
      if (stopped) {
        stoppedAt = hits.indexOf(hit);
        break dispatchEvents;
      }
    }
    // When propagation was stopped, run cancelPointer again with only the hits
    // up to the stopped object. The pre-loop cancelPointer passed all hits, so
    // farther objects were still considered "hovered". This second pass removes
    // them and fires pointerout/pointerleave.
    if (isPointerMove || tapHover)
      updateNearest(hits.nearest ?? null, { camera: context.raycaster.camera, delta, nativeEvent: event, pointer, ray: context.raycaster.ray });
    if (name === "pointerup") releaseSurfaceDrag(event);
    if (isPointerMove && stopped) {
      cancelPointer(hits.slice(0, stoppedAt + 1));
    }
    } finally {
      endInteraction();
    }
  };
  let discreteQueue = Promise.resolve();
  const handleDiscrete = (event) => {
    const epoch = generation, cause = currentCause();
    discreteQueue = track(discreteQueue
      .then(() => {
        if (epoch === generation && connected) return handleEvent(event, cause);
      })
      .catch((error) => console.error("Picking event failed", error)), cause);
  };
  let moveRAF = 0;
  let moveDone = null; // resolves the tracked work of the scheduled frame (see track)
  let queuedMoveEvent = null;
  let lastMoveX = -Infinity;
  let lastMoveY = -Infinity;
  const MIN_MOVE_DELTA = 0.25; // pixels; ignore tiny jitter
  // Process the first pointermove in a frame immediately for responsive hover
  // updates, then coalesce any additional moves within the same frame into one
  // deferred rAF call. This avoids the one-frame lag that causes cursor flicker
  // when moving rapidly between interactive objects.
  const handlePointerMove = (event) => {
    // ignore sub-pixel jitter to cut redundant raycasts
    if (
      Math.abs(event.clientX - lastMoveX) < MIN_MOVE_DELTA &&
      Math.abs(event.clientY - lastMoveY) < MIN_MOVE_DELTA
    ) {
      return;
    }
    lastMoveX = event.clientX;
    lastMoveY = event.clientY;
    if (!moveRAF) {
      // First move this frame — process immediately
      const cause = currentCause();
      handleEvent(event, cause);
      // Schedule a rAF to catch any coalesced moves that arrive before the next frame
      track(new Promise((resolve) => (moveDone = resolve)), cause);
      moveRAF = requestAnimationFrame(() => {
        moveRAF = 0;
        try {
          if (queuedMoveEvent) {
            handleEvent(queuedMoveEvent, cause);
            queuedMoveEvent = null;
          }
        } finally {
          moveDone?.();
          moveDone = null;
        }
      });
    } else {
      // Additional moves this frame — queue for the rAF callback
      queuedMoveEvent = event;
    }
  };
  const disconnect = (target) => {
    connected = false;
    window.removeEventListener("keydown", escapeSurface);
    handlePointerLeaveOrCancel();
    for (const [eventName] of DOM_EVENTS) {
      if (eventName === "pointerleave" || eventName === "pointercancel") {
        target.removeEventListener(eventName, handlePointerLeaveOrCancel);
      } else if (eventName === "pointermove") {
        target.removeEventListener(eventName, handlePointerMove);
      } else if (eventName === "pointerenter") {
        target.removeEventListener(eventName, handlePointerEnter);
      } else {
        target.removeEventListener(eventName, handleDiscrete);
      }
    }
  };
  const connect = (target) => {
    connected = true;
    window.addEventListener("keydown", escapeSurface);
    for (const [eventName, passive] of DOM_EVENTS) {
      if (eventName === "pointerleave" || eventName === "pointercancel") {
        target.addEventListener(eventName, handlePointerLeaveOrCancel, {
          passive,
        });
      } else if (eventName === "pointermove") {
        target.addEventListener(eventName, handlePointerMove, { passive });
      } else if (eventName === "pointerenter") {
        target.addEventListener(eventName, handlePointerEnter, { passive });
      } else {
        target.addEventListener(eventName, handleDiscrete, { passive });
      }
    }
  };
  const target = fromStore(context.target);
  $effect.pre(() => {
    const { current } = target;
    if (!current) return;
    connect(current);
    return () => {
      disconnect(current);
    };
  });
};
