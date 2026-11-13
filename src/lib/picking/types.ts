import type {
  Camera,
  Object3D,
  Ray,
  Intersection as ThreeIntersection,
  Vector2,
} from "three";

export type DomEvent = PointerEvent | MouseEvent | WheelEvent;

export interface Intersection extends ThreeIntersection {
  /** The event source (the object which registered the handler) */
  eventObject: Object3D;
}

export interface IntersectionEvent<NativeEvent> extends Intersection {
  /** The event source (the object which registered the handler) */
  eventObject: Object3D;
  /** An array of intersections */
  intersections: Intersection[];
  /** Normalized event coordinates */
  pointer: Vector2;
  /** Delta between first click and this event */
  delta: number;
  /** The ray that pierced it */
  ray: Ray;
  /** The camera that was used by the raycaster */
  camera: Camera;
  /** stopPropagation will stop underlying handlers from firing */
  stopPropagation: () => void;
  /** stopImmediatePropagation delegates to the native event, blocking any further DOM listeners (e.g. OrbitControls) */
  stopImmediatePropagation: () => void;
  /** The original host event */
  nativeEvent: NativeEvent;
  /** If the event was stopped by calling stopPropagation */
  stopped: boolean;
}

export interface PointerCaptureTarget {
  intersection: Intersection;
  target: Element;
}

export type ThrelteEvents = {
  onclick: IntersectionEvent<MouseEvent>;
  oncontextmenu: IntersectionEvent<MouseEvent>;
  ondblclick: IntersectionEvent<MouseEvent>;
  onwheel: IntersectionEvent<WheelEvent>;
  onpointerup: IntersectionEvent<PointerEvent>;
  onpointercancel: IntersectionEvent<PointerEvent>;
  onpointerdown: IntersectionEvent<PointerEvent>;
  onpointerover: IntersectionEvent<PointerEvent>;
  onpointerout: IntersectionEvent<PointerEvent>;
  onpointerenter: IntersectionEvent<PointerEvent>;
  onpointerleave: IntersectionEvent<PointerEvent>;
  onpointermove: IntersectionEvent<PointerEvent>;
  onpointermissed: MouseEvent;
  /** The tolerant pick (TODO 72): the row under the pointer, else the nearest drawn row of a mark with nearest within its radius, became this one. */
  onnearestenter: IntersectionEvent<PointerEvent>;
  /** The tolerant pick's row, on each move while it is this object's. */
  onnearestmove: IntersectionEvent<PointerEvent>;
  /** The tolerant pick's row stopped being this object's. */
  onnearestleave: IntersectionEvent<PointerEvent>;
};

export type InteractivityProps = {
  [K in keyof ThrelteEvents]?: (event: ThrelteEvents[K]) => void;
};
