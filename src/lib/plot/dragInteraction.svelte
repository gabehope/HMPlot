<script>
  import { coordinateView } from "./utils/viewContext.js";
  import { useViewServices } from "./utils/viewServices.js";
  // A mark's drag (TODO 38.3): presses on its rows come from the canvas's drag router
  // (utils/dragRouter.js); `config()` is the mark's latest preparation: its scope, the
  // channels drag moves with their lineage, its selection and its drag events.
  import { useThrelte } from "@threlte/core";
  import { useInteractivity } from "../picking/context.js";
  import { dragRouter } from "./utils/dragRouter.js";
  import { startDrag, dragEvent } from "./utils/dragSession.js";
  import { framePoint } from "./utils/framePlacement.js";
  import { Vector3 } from "three/webgpu";
  let { mark, config } = $props();
  const { renderer, camera } = useThrelte(),
    picking = useInteractivity();
  const viewServices = useViewServices();
  const noted = new WeakMap();
  // In development, the first drag that writes a column no view reads says so once.
  function noteUnread(session, kind) {
    if (!import.meta.env?.DEV) return;
    const layer = session.layer, seen = noted.get(layer) ?? new Set();
    noted.set(layer, seen);
    for (const { column } of session.axes)
      if (!layer.wasRead(column) && !seen.has(column)) {
        seen.add(column);
        console.info(`${kind}: dragging writes offsets to ${column}, but no view reads them, so nothing on screen moves. Read moved("${column}") where a view should follow.`);
      }
  }
  $effect(() => {
    if (!mark) return;
    // The mark is a pick target even without pointer handlers; one it did not have is removed after.
    const added = !picking.interactiveObjects.includes(mark);
    if (added) picking.addInteractiveObject(mark, {});
    const stop = dragRouter(renderer, picking, () => camera.current, viewServices.navigation).add(mark, {
      draggable: () => Boolean(config()),
      options: () => mark.options,
      // In 3D, one or two dragged axes set the drag plane (38.4): their world directions at
      // the grabbed point.
      directions(hit) {
        const axes = Object.keys(config()?.channels ?? {});
        if (coordinateView(mark.options) !== "3d" || !axes.length || axes.length > 2) return null;
        const at = picking.axisValue?.([hit.point.x, hit.point.y, hit.point.z], mark.options);
        const p = ["x", "y", "z"].map((axis) => at?.[axis] ?? 0);
        const world = framePoint(mark.options, p);
        return axes.map((axis) => {
          const i = "xyz".indexOf(axis), q = [...p], step = Math.max(1e-6, Math.abs(q[i]) * 1e-3);
          q[i] += step;
          const moved = framePoint(mark.options, q);
          return new Vector3(moved[0] - world[0], moved[1] - world[1], moved[2] - world[2]);
        });
      },
      async start(hit, origin) {
        const current = config();
        if (!current) return { reason: "it is not draggable" };
        return startDrag({ scope: current.scope, row: hit.instanceId, channels: current.channels, origin,
          selection: current.selection, time: viewServices.clock.time });
      },
      begin: (session) => noteUnread(session, config()?.kind ?? "Mark"),
      move: (session) => config()?.ondrag?.(dragEvent(session)),
      end: (session, cancelled) => config()?.ondragend?.(Object.assign(dragEvent(session), { cancelled })),
      refuse: (reason) => console.warn(`${config()?.kind ?? "Mark"}: this row cannot be dragged: ${reason}.`),
    });
    return () => {
      stop();
      if (added && picking.handlers.get(mark) && !Object.keys(picking.handlers.get(mark)).length) picking.removeInteractiveObject(mark);
    };
  });
</script>
