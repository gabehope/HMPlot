import { untrack } from "svelte";
import { rootFrameDimension, frameMappingSnapshot } from "./frameMapping.js";
import { nearbyConstraint, nearbyUnion } from "./interaction.js";
import { stripAt, brushHitMode as hitMode, brushCursor, resizedRect, translatedRect, bandInStrip, movedSpan, nudgedSpan, stripColumn, stripBindings, constraintPixels, bandsFor, brushConstraint } from "./brushStrips.js";
import { seriesConstraint } from "./series.js";
import { axisValue, axisWorld, axisWorldArray } from "./axes.js";
import { currentCause, publishWithCause, trackPreparation } from '../rendering/viewSettlement.js';
import type { BrushHost, BrushColumn, BrushResource, BrushBinding, NearbyBinding, BrushRect, BrushGesture, PendingBrush, StripBand, BandTarget, BandEdit, NudgeBand } from "./viewControllerTypes.js";
import type { Array as JaxArray } from "@hmplot/jax";
import type { CanvasRect, FrameEntry, NavigationControls } from "./internalTypes.js";

/** One view's gesture state. Current renderer/layout are borrowed through getters. */
export function createBrushController(host: BrushHost) {
  let disposed = false;
  let brushGesture = $state<BrushGesture | null>(null), brushRect = $state<BrushRect | null>(null), brushActive = $state(false), brushOtherCount = $state(0), brushOtherNames = $state("");
  let gesturePreviewBinding: BrushBinding | null = null;
  let brushControlsFocused = $state(false), brushControlsDismissed = $state(false);
  let pendingBrush = $state<PendingBrush | null>(null), outsideBrushPress: { start: number[]; pointerId: number } | null = null;
  let brushPreviewPending = false, queuedBrushPreview: BrushRect | null = null;
  // Strip brushing: bands drawn on child-frame axis strips, the band being dragged or wheeled,
  // the last edited constraint (Escape clears it), and the hover cursor for brush edges.
  let stripBands = $state.raw<StripBand[]>([]), stripDrag = $state<(CanvasRect & { key?: string; axis?: string }) | null>(null), brushCursorState = $state("");
  let lastEdited: BandEdit | null = null;
  // The constraint whose bands are hovered or focused ({owner, identities, key}): every band of it
  // is highlighted and a strip band shows its clear control. `currentBand` is what "Clear current"
  // clears: the band last hovered, focused, or edited.
  let activeBand = $state.raw<BandTarget | null>(null), currentBand: BandEdit | null = null, rootIdentities = $state.raw<string[]>([]), rootBinding = $state.raw<BrushBinding | null>(null);
  const grabMargin = (event?: PointerEvent) => event?.pointerType === "touch" ? 12 : 6;
  // Strips are where each child frame's AxisOverlay actually draws its ticks and labels. Spatial
  // children (ranged, facet cells) and twin axes (children drawing their own axis on the root
  // rect's side) are strip frames; `depth` lets the innermost strip win where strips nest.
  let drawnStrips = $state.raw<Record<string, { x: CanvasRect | null; y: CanvasRect | null } | null>>({});
  function publishStrips(key: string, strips: { x: CanvasRect | null; y: CanvasRect | null } | null) {
    const previous = drawnStrips[key];
    const same = (a: CanvasRect | null, b: CanvasRect | null) => a === b || a !== null && b !== null && (["left", "right", "top", "bottom"] as const).every((edge) => a[edge] === b[edge]);
    if ((previous ?? null) === (strips ?? null) || previous && strips && same(previous.x, strips.x) && same(previous.y, strips.y)) return;
    drawnStrips = { ...drawnStrips, [key]: strips };
  }
  const stripFrames = $derived.by(() => {
    const frames = host.frames.frames(), byKey = new Map(frames.map((f) => [f.key, f]));
    const depth = (f: FrameEntry) => { let d = 0; for (let p: FrameEntry | undefined = f; p?.parentKey != null && d < 64; p = byKey.get(p.parentKey)) d++; return d; };
    return frames.filter((f) => f.parentKey != null && f.layout && !f.layout.polar && (f.spatial || drawnStrips[f.key]?.x || drawnStrips[f.key]?.y))
      .map((f) => ({ key: f.key, depth: depth(f), strips: drawnStrips[f.key] ?? { x: null, y: null } }));
  });
  const isStripFrame = (frameKey: string) => stripFrames.some((frame) => frame.key === frameKey);
  // The frame tree for strip columns: a strip also counts the brushable marks of descendant frames
  // that inherit its axis (a Frame in a facet cell that owns x plots on the cell's y axis).
  const frameTree = () => host.frames.frames().map((f) => ({ key: f.key, parentKey: f.parentKey,
    inherits: Object.fromEntries((["x", "y"] as const).map((a) => [a, host.frames.inherits(f, a)])) }));
  const stripOf = (band: StripBand) => ({ binding: band.binding, axis: band.axis, bounds: band.strip, frameKey: band.frameKey });
  /** Record an edit: Escape clears it next, and "Clear current" targets it. */
  function markEdited(binding: BrushBinding, identities: string[], key: string) {
    if (!binding || !identities.length) return;
    lastEdited = { binding, identities };
    currentBand = { binding, identities, key };
  }
  /** Remove constraints; forget them as the last edited or current band. */
  function removeColumns(binding: BrushBinding, identities: string[]) {
    binding.brush.clearColumns(binding.owner, identities);
    const removed = (entry: BandEdit | null) => entry?.binding?.owner === binding.owner && entry.identities.some((identity) => identities.includes(identity));
    if (removed(lastEdited)) lastEdited = null;
    if (removed(currentBand)) currentBand = null;
  }
  const hasConstraint = (entry: BandEdit | null) => Boolean(entry?.binding?.brush?.getConstraints(entry.binding.owner).some((value) => entry.identities.includes(value.identity)));
  function bandAt(point: number[], event?: PointerEvent) {
    for (let index = stripBands.length - 1; index >= 0; index--) {
      const band = stripBands[index], mode = hitMode(band.rect, point, { axis: band.axis, outer: grabMargin(event) });
      if (mode) return { band, mode };
    }
    return null;
  }
  function brushBindings(axis?: string) {
    const result: BrushBinding[] = [];
    host.view.picking.scene.current?.traverse((object) => {
      const binding = host.view.marks.of(object)?.interaction;
      if (binding?.brush && (!axis || [...axis].every(dimension => binding.brushAxis?.includes(dimension)))) result.push(binding as BrushBinding);
    });
    return result;
  }
  function clampPoint(point: number[]) {
    return [Math.max(0, Math.min(host.canvasHost!.clientWidth, point[0])), Math.max(0, Math.min(host.canvasHost!.clientHeight, point[1]))];
  }
  function normalizedBrush(start: number[], end: number[], axis: string, rootAxis = false) {
    let [left, top] = clampPoint(start), [right, bottom] = clampPoint(end);
    const rect = plotRectangle();
    left = Math.max(rect.left, Math.min(rect.right, left)); right = Math.max(rect.left, Math.min(rect.right, right));
    top = Math.max(rect.top, Math.min(rect.bottom, top)); bottom = Math.max(rect.top, Math.min(rect.bottom, bottom));
    if (axis === "x") { top = rect.top; bottom = rect.bottom; }
    if (axis === "y") { left = rect.left; right = rect.right; }
    return { left: Math.min(left, right), top: Math.min(top, bottom), right: Math.max(left, right), bottom: Math.max(top, bottom), axis, rootAxis };
  }
  function plotRectangle() {
    return host.layout ? { left: host.layout.left, right: host.layout.right, top: host.layout.top, bottom: host.layout.bottom } :
      { left: 0, right: host.canvasHost?.clientWidth ?? 1, top: 0, bottom: host.canvasHost?.clientHeight ?? 1 };
  }
  function gestureAxis(point: number[], configured = "xy") {
    const r = plotRectangle(), insideX = point[0] >= r.left && point[0] <= r.right,
      insideY = point[1] >= r.top && point[1] <= r.bottom;
    if (insideX && insideY) return configured;
    if (insideX && !insideY) return "x";
    if (!insideX && insideY) return "y";
    return null;
  }
  function primaryBrushBinding(axis?: string, rootAxis = false, bindings = brushBindings()) {
    const candidates = bindings.filter(binding => {
      const requested = axis ?? binding.brushAxis;
      return [...requested].every(a => binding.brushColumns?.[a] && (!rootAxis || rootFrameDimension(binding.frameOptions ?? host.plotOptions,a)));
    });
    if (!candidates.length) return null;
    // Child frames brush through their axis strips; root gestures prefer root-frame marks
    // and fall back to child-frame marks only when the root has none.
    const rootOnly = candidates.filter((binding) => !isStripFrame(binding.frameKey));
    if (rootOnly.length) candidates.splice(0, candidates.length, ...rootOnly);
    const frames = new Set(candidates.map(binding => binding.frameKey));
    if (frames.size > 1) throw Error("Brush producers from different Axes frames are ambiguous. Enable brushing on one frame.");
    return candidates[0];
  }
  // The visible world range spans the whole canvas, as ticks and marks do; the plot
  // rectangle only excludes the axis margins and must not rescale it.
  function pixelAt(axis: "x" | "y", world: number) {
    const visible = host.viewFrame![axis], fraction = (world - visible[0]) / (visible![1] - visible![0]);
    return (axis === "x" ? fraction : 1 - fraction) * host.canvasSize(axis);
  }
  function dataValue(binding: BrushBinding, axis: string, pixel: number) {
    const world = host.worldAt(axis, pixel);
    if (world === null) throw Error("Brush requires a completed Cartesian 2D axis frame.");
    return axisValue(binding.frameOptions ?? host.plotOptions, axis, world);
  }
  // `frame` and `origin` let bands reproject after navigation without gesture state and keep
  // strip-made constraints out of the full-plot rectangle. A bound from a degenerate axis (NaN)
  // throws, so every caller skips the update and reports it instead of storing [NaN, NaN].
  function constraintFor(binding: BrushBinding, axis: string, a: number, b: number, origin = "plot") {
    // A series mark's brush takes whole series (TODO 62.1).
    return seriesConstraint(brushConstraint(binding.brushColumns[axis], { frame: binding.frameKey, axis, origin }, a, b), binding.brushSeries);
  }
  function applyBrushRect(rect: BrushRect, phase: import("./viewControllerTypes.js").InteractionPhase = "preview") {
    if (rect.strip) {
      const { binding, axis } = rect.strip;
      if (brushGesture && phase === "preview") gesturePreviewBinding = binding;
      const [low, high] = axis === "x" ? [rect.left, rect.right] : [rect.bottom, rect.top];
      binding.brush.setConstraints(binding.owner,
        [constraintFor(binding, axis, dataValue(binding, axis, low), dataValue(binding, axis, high), "strip")], { phase });
      return;
    }
    const binding = primaryBrushBinding(rect.axis, rect.rootAxis);
    if (!binding) throw Error("Brush channels must be named one-dimensional columns with stable row provenance.");
    if (brushGesture && phase === "preview") gesturePreviewBinding = binding;
    const updates = [];
    if (rect.axis.includes("x")) updates.push(constraintFor(binding, "x", dataValue(binding, "x", rect.left), dataValue(binding, "x", rect.right)));
    if (rect.axis.includes("y")) updates.push(constraintFor(binding, "y", dataValue(binding, "y", rect.bottom), dataValue(binding, "y", rect.top)));
    if (updates.length === 2 && updates[0].identity === updates[1].identity) {
      const bounds = [Math.max(updates[0].bounds[0], updates[1].bounds[0]), Math.min(updates[0].bounds[1], updates[1].bounds[1])];
      updates.splice(0, 2, constraintFor(binding, "x", bounds[0], bounds[1]));
    }
    binding.brush.setConstraints(binding.owner, updates, { phase });
  }
  function projectConstraint(binding: BrushBinding, axis: "x" | "y", constraint: Parameters<typeof constraintPixels>[0]) {
    if (!host.viewFrame?.[axis]) return null;
    const options = binding.frameOptions ?? host.plotOptions;
    return constraintPixels(constraint, binding.brushColumns?.[axis], (value: number) => axisWorld(options, axis, value), (world: number) => pixelAt(axis, world));
  }
  function refreshBrushRect() {
    if (brushGesture || brushWheelBinding) return;
    // Runs on every camera change: one scene traversal, and nothing more while no brush has constraints.
    const bindings = brushBindings();
    if (!bindings.some((binding) => binding.brush.getConstraints(binding.owner).length)) {
      if (stripBands.length) stripBands = [];
      brushRect = null;
      if (rootIdentities.length) rootIdentities = [];
      brushOtherCount = 0; brushOtherNames = "";
      activeBand = focusedBand = null;
      return;
    }
    const tree = frameTree();
    stripBands = bandsFor(stripFrames, {
      column: (frameKey: string, axis: string) => stripColumn(stripBindings(bindings, tree, frameKey, axis), axis),
      constraint: (binding: BrushBinding, column: BrushColumn) => binding.brush.getConstraints(binding.owner).find((value: { identity: unknown }) => value.identity === column.identity),
      project: projectConstraint,
    });
    // A band removed elsewhere (Python, another view) no longer holds hover or focus.
    if (activeBand && activeBand.key !== "root" && !stripBands.some((band) => band.key === activeBand!.key)) activeBand = focusedBand = null;
    let binding: BrushBinding | null = null;
    try { binding = primaryBrushBinding(undefined, false, bindings); } catch { binding = null; }
    if (!binding) { brushRect = null; rootIdentities = []; brushOtherCount = 0; brushOtherNames = ""; return; }
    // A child-frame fallback binding shows plot-made constraints only; strip-made ones live on their strips.
    const fallback = isStripFrame(binding.frameKey);
    const constraints = binding.brush.getConstraints(binding.owner).filter((value) => !(fallback && value.origin === "strip")),
      byId = new Map(constraints.map(value => [value.identity, value]));
    const x = binding.brushColumns?.x && byId.get(binding.brushColumns.x.identity), y = binding.brushColumns?.y && byId.get(binding.brushColumns.y.identity);
    const displayed = new Set([binding.brushColumns?.x?.identity, binding.brushColumns?.y?.identity]);
    // Constraints a strip band already shows are not "other" constraints.
    const onStrips = new Set(stripBands.filter((band) => band.binding.owner === binding.owner).map((band) => band.identity));
    const other = constraints.filter(value => !displayed.has(value.identity) && !onStrips.has(value.identity)); brushOtherCount = other.length; brushOtherNames = other.map(value => value.name).join(", ");
    const px = x && projectConstraint(binding, "x", x), py = y && projectConstraint(binding, "y", y), r = plotRectangle();
    brushRect = px || py ? { left: px ? Math.min(...px) : r.left, right: px ? Math.max(...px) : r.right,
      top: py ? Math.min(...py) : r.top, bottom: py ? Math.max(...py) : r.bottom, axis: px && py ? "xy" : px ? "x" : "y" } : null;
    rootBinding = binding;
    rootIdentities = [px && (x as { identity: string }).identity, py && (y as { identity: string }).identity].filter(Boolean);
  }
  function pointInBrush([x, y]: number[]) {
    return brushRect && x >= brushRect.left && x <= brushRect.right && y >= brushRect.top && y <= brushRect.bottom;
  }
  function clearBrush() {
    cancelBrushWheel();
    queuedBrushPreview = null;
    for (const binding of brushBindings()) binding.brush.clear(binding.owner);
    brushRect = null;
    stripBands = [];
    lastEdited = null;
    currentBand = null;
    activeBand = null;
    brushOtherCount = 0;
    brushOtherNames = "";
    brushControlsDismissed = true;
  }
  /** Identities of the root rect's columns for an edit of `rect`, with the binding they belong to. */
  function rootEdit(rect: BrushRect): {binding: BrushBinding, identities: string[]} | null {
    try {
      const binding = primaryBrushBinding(rect.axis, rect.rootAxis);
      return binding ? { binding, identities: [...new Set([...rect.axis].map((a) => binding.brushColumns?.[a]?.identity).filter(Boolean))] as string[] } : null;
    } catch { return null; }
  }
  // A gesture holds the view's navigation controls: off until it ends, then as they were. The
  // controls it held are restored even if others replaced them meanwhile (a mode switch).
  function holdControls(): { controlOwner?: NavigationControls; controls: boolean } {
    const controlOwner = host.view.navigation.controls.current;
    const controls = controlOwner?.enabled ?? true;
    if (controlOwner) controlOwner.enabled = false;
    return { controlOwner, controls };
  }
  function beginBrush(event: PointerEvent) {
    if (disposed) return;
    if ((event.target as HTMLElement)?.closest?.("[data-brush-controls]")) return;
    if (host.mode !== "2d" || event.button !== 0) return;
    host.issue("gesture");
    const rootCoordinates = (host.frames.rootFrame()?.options ?? host.plotOptions).get("coordinates");
    if (rootCoordinates !== "cartesian") {
      if (event.shiftKey && brushBindings().length)
        host.issue("gesture", `${rootCoordinates} root axes do not support Cartesian interval brushing.`);
      return;
    }
    const bindings = brushBindings();
    if (!bindings.length) return;
    const start = host.localPointer(event);
    // Shift-drag on a child frame's axis strip brushes that frame's column along the strip.
    // Strip gestures come first: each involves one frame's bindings, so neither the view-wide
    // brush-axis rule nor the root's bindings apply to them. True when it handled the press.
    const stripBrush = () => {
      const hit = stripAt(start, stripFrames), found = hit && stripColumn(stripBindings(bindings, frameTree(), hit.frame.key, hit.axis), hit.axis);
      if (hit && found?.ambiguous) {
        host.issue("gesture", `Frame ${hit.axis}-axis brushing is ambiguous: the brushable marks on this frame's ${hit.axis} axis (in the frame or in child frames that inherit it) plot different ${hit.axis} columns (${found.names.join(", ")}). Enable brush on marks that plot one ${hit.axis} column per frame.`);
        return true;
      }
      if (!found) return false;
      pendingBrush = { start, pointerId: event.pointerId, axis: hit.axis,
        strip: { binding: found.binding, axis: hit.axis, bounds: hit.frame.strips[hit.axis], frameKey: hit.frame.key },
        ...holdControls() };
      return true;
    };
    // A drag on a band edits it. Edits start from the band's full interval (`span`), not the part
    // drawn on the strip, and only once the pointer passes the drag threshold, so a click never
    // rewrites a constraint.
    const editBand = () => {
      const editable = bandAt(start, event);
      if (!editable) return false;
      event.preventDefault(); event.stopPropagation();
      const { band, mode } = editable;
      brushGesture = { mode, start, originalRect: { ...band.span }, pointerId: event.pointerId, axis: band.axis, moved: false,
        strip: stripOf(band), key: band.key, identity: band.identity, ...holdControls() };
      host.canvasHost!.setPointerCapture?.(event.pointerId);
      return true;
    };
    // A new root brush. Root gestures use root-frame bindings (child ones only as a fallback), so
    // only they must share a brush axis.
    const rootBrush = () => {
      const rootBindings = bindings.filter((binding) => !isStripFrame(binding.frameKey));
      const axes = [...new Set((rootBindings.length ? rootBindings : bindings).map((binding) => binding.brushAxis))];
      if (axes.length !== 1) { host.issue("gesture", "Brush participants in one View must use the same axis."); return; }
      const axis = gestureAxis(start, axes[0]); if (!axis) return;
      const r = plotRectangle(), rootAxis = start[0]<r.left || start[0]>r.right || start[1]<r.top || start[1]>r.bottom;
      if (rootAxis) {
        try {
          if (!primaryBrushBinding(axis, true, bindings)) throw Error("This root axis has no unambiguous brush column. Brush a compatible mark in the plot interior instead.");
        } catch (error: unknown) { host.issue("gesture", (error as Error).message); return; }
      }
      // Wait for actual movement so a click still reaches mark selection.
      pendingBrush = { start, pointerId: event.pointerId, axis, rootAxis, ...holdControls() };
    };
    // A drag inside the root brush moves or resizes it. True when it handled the press.
    const editRoot = () => {
      if (!brushRect) return false;
      const hit = hitMode(brushRect, start, { axis: brushRect.axis, outer: grabMargin(event) });
      if (!hit) {
        outsideBrushPress = { start, pointerId: event.pointerId };
        return false;
      }
      event.preventDefault(); event.stopPropagation();
      brushGesture = { mode: hit, start, originalRect: { ...brushRect }, pointerId: event.pointerId, axis: brushRect.axis, moved: false, ...holdControls() };
      host.canvasHost!.setPointerCapture?.(event.pointerId);
      return true;
    };
    // interactive="brush" (TODO 145.5): a plain drag brushes, as Shift-drag does elsewhere, and
    // Shift-drag is left to the view, which pans. A drag on a band or inside the brush still
    // edits it, so a brush can be moved without a modifier.
    if (host.interactive === "brush") {
      if (event.shiftKey) return;
      if (editBand() || stripBrush() || editRoot()) return;
      rootBrush();
      return;
    }
    if (event.shiftKey) {
      if (stripBrush()) return;
    } else if (editBand()) return;
    // A plot that does not pan or zoom (interactive=false) brushes with a plain drag too
    // (FocusContext's context strip, TODO 136.16).
    if (event.shiftKey || host.interactive === false) {
      rootBrush();
      return;
    }
    editRoot();
  }
  function moveBrush(event: PointerEvent) {
    if (disposed) return;
    if (pendingBrush?.pointerId === event.pointerId) {
      const current = host.localPointer(event);
      if (Math.hypot(current[0] - pendingBrush.start[0], current[1] - pendingBrush.start[1]) < 5) return;
      const pending = pendingBrush;
      pendingBrush = null;
      outsideBrushPress = null; // the press became a drag: not a click outside the brush
      if (pending.strip) {
        brushGesture = { ...pending, mode: "create", originalRect: null, moved: true,
          key: `${pending.strip.frameKey}:${pending.axis}:${pending.strip.binding.brushColumns[pending.axis]!.identity}`,
          identity: pending.strip.binding.brushColumns[pending.axis]!.identity };
      } else {
        brushGesture = { ...pending, mode: "create", originalRect: brushRect ? { ...brushRect } : null, moved: true };
        brushRect = normalizedBrush(pending.start, current, pending.axis, pending.rootAxis);
      }
      host.canvasHost!.setPointerCapture?.(event.pointerId);
    }
    if (!brushGesture || event.pointerId !== brushGesture.pointerId) {
      if (!brushGesture && !pendingBrush && !(event.target as HTMLElement)?.closest?.("[data-brush-controls]")) {
        const point = host.localPointer(event), band = bandAt(point, event);
        const rootMode = !band && brushRect ? hitMode(brushRect, point, { axis: brushRect.axis, outer: grabMargin(event) }) : null;
        brushCursorState = brushCursor(band?.mode ?? rootMode);
        hoverBand(band ? band.band : rootMode ? "root" : null);
      }
      return;
    }
    event.preventDefault(); event.stopPropagation();
    const current = host.localPointer(event);
    if (!brushGesture.moved) {
      if (Math.hypot(current[0] - brushGesture.start[0], current[1] - brushGesture.start[1]) < 3) return;
      brushGesture.moved = true;
    }
    if (brushGesture.strip) {
      const { axis, bounds } = brushGesture.strip, along = axis === "x" ? 0 : 1, original = brushGesture.originalRect;
      const [lo, hi] = axis === "x" ? ["left", "right"] as const : ["top", "bottom"] as const;
      const next = brushGesture.mode === "move" ? movedSpan(original, brushGesture.start, current, bounds, axis)
        : brushGesture.mode.startsWith("resize-") ? resizedRect(original, brushGesture.mode, current, bounds)
        : bandInStrip(bounds, axis, brushGesture.start[along], current[along]);
      const shown = next && bandInStrip(bounds, axis, next[lo], next[hi]);
      if (!shown) return;
      stripDrag = { ...shown, axis, key: brushGesture.key };
      brushGesture.last = { ...next, axis };
      queuedBrushPreview = { ...next, axis, strip: brushGesture.strip };
    } else {
      brushRect = brushGesture.mode === "move"
        ? translatedRect(brushGesture.originalRect, brushGesture.start, current, { left: 0, top: 0, right: host.canvasHost!.clientWidth, bottom: host.canvasHost!.clientHeight }, brushGesture.originalRect!.axis ?? "xy")
        : brushGesture.mode.startsWith("resize-")
          ? resizedRect(brushGesture.originalRect, brushGesture.mode, current, plotRectangle())
          : normalizedBrush(brushGesture.start, current, brushGesture.axis, brushGesture.rootAxis);
      queuedBrushPreview = brushRect;
    }
    if (!brushPreviewPending) {
      brushPreviewPending = true;
      // The preview is applied at the next frame, as part of this pointer move's change: tracked
      // with its cause, so whenSettled() waits for the Filters it reruns (TODO 17.15).
      const frame = () => {
        const cause = currentCause();
        let done: (() => void) | undefined;
        if (host.renderer) trackPreparation(host.view, new Promise<void>((resolve) => (done = resolve)), cause);
        requestAnimationFrame(function flushBrushPreview() {
          try {
            if (!brushGesture || !queuedBrushPreview) { brushPreviewPending = false; return; }
            const rect = queuedBrushPreview;
            queuedBrushPreview = null;
            brushPreviewPending = true;
            try { publishWithCause(host.view, cause, () => applyBrushRect(rect, "preview")); }
            catch (error: unknown) { host.issue("gesture", (error as Error).message); }
            finally {
              brushPreviewPending = false;
              if (brushGesture && queuedBrushPreview) { brushPreviewPending = true; frame(); }
            }
          } finally { done?.(); }
        });
      };
      frame();
    }
  }
  type BrushCancelEvent = Pick<PointerEvent, "pointerId" | "preventDefault" | "stopPropagation">;
  function finishBrush(event: PointerEvent, cancel?: false): Promise<void>;
  function finishBrush(event: BrushCancelEvent, cancel: true): Promise<void>;
  async function finishBrush(event: PointerEvent | BrushCancelEvent, cancel = false) {
    if (pendingBrush?.pointerId === event.pointerId) {
      if (pendingBrush.controlOwner) pendingBrush.controlOwner.enabled = pendingBrush.controls;
      pendingBrush = null;
      // With interactive="brush" a press outside the brush is both a pending brush and a press
      // that clears it: a click there (no drag) clears, as it does in other plots.
      if (outsideBrushPress?.pointerId !== event.pointerId) return;
    }
    if (!brushGesture || event.pointerId !== brushGesture.pointerId) {
      if (outsideBrushPress?.pointerId === event.pointerId) {
        const start = outsideBrushPress.start;
        outsideBrushPress = null;
        if (!cancel && "clientX" in event) {
          const current = host.localPointer(event);
          if (Math.hypot(current[0] - start[0], current[1] - start[1]) < 5) {
            let binding: BrushBinding | null = null;
            try { binding = primaryBrushBinding(); } catch { binding = null; }
            const columns = binding && [...new Set(Object.values(binding.brushColumns ?? {}).filter(Boolean).map((column: BrushColumn | null | undefined) => column!.identity))];
            if (binding && columns?.length) removeColumns(binding, columns); else clearBrush();
          }
        }
      }
      return;
    }
    event.preventDefault(); event.stopPropagation(); queuedBrushPreview = null;
    const gesture = brushGesture, rect = brushRect;
    if (gesture.controlOwner) gesture.controlOwner.enabled = gesture.controls;
    if (host.canvasHost!.hasPointerCapture?.(event.pointerId)) host.canvasHost!.releasePointerCapture(event.pointerId);
    if (gesture.strip) {
      const { binding } = gesture.strip, last = gesture.last;
      try {
        // A press that never passed the drag threshold (a click) leaves the constraint alone.
        if (gesture.moved && (cancel || !last)) binding.brush.cancelConstraintPreview(binding.owner);
        else if (gesture.moved) {
          applyBrushRect({ ...last!, strip: gesture.strip }, "preview");
          binding.brush.commitConstraintPreview(binding.owner);
          markEdited(binding, [gesture.identity!], gesture.key!);
        }
      } catch (error: unknown) {
        host.issue("gesture", (error as Error).message);
        binding.brush.cancelConstraintPreview(binding.owner);
      } finally {
        stripDrag = null; brushGesture = null; gesturePreviewBinding = null;
        refreshBrushRect();
      }
      return;
    }
    const bindings = brushBindings(gesture.axis);
    if (cancel || !gesture.moved) {
      if (gesture.moved) for (const binding of bindings) binding.brush.cancelConstraintPreview(binding.owner);
      brushRect = gesture.originalRect;
      brushGesture = null;
      gesturePreviewBinding = null;
      return;
    }
    try {
      applyBrushRect(rect!, "preview");
      for (const binding of bindings) binding.brush.commitConstraintPreview(binding.owner);
      const edited = rootEdit(rect!);
      if (edited) markEdited(edited.binding, edited.identities, "root");
      // Keep the exact last preview geometry. Resource notifications during
      // commit are intentionally ignored while brushGesture is set; the next
      // camera/layout change will reproject the same semantic constraints.
      brushRect = rect;
    } catch (error: unknown) {
      host.issue("gesture", (error as Error).message);
      for (const binding of bindings) binding.brush.cancelConstraintPreview(binding.owner);
      brushRect = gesture.originalRect;
    } finally {
      brushGesture = null;
      gesturePreviewBinding = null;
    }
  }
  // Nearby: rows within a radius of the pointer, evaluated on the GPU as a preview
  // constraint (like hover). One update per animation frame; leaving clears it.
  let nearbyPoint: number[] | null = null, nearbyPending = false;
  function nearbyBindings() {
    const result: NearbyBinding[] = [];
    host.view.picking.scene.current?.traverse((object) => {
      const binding = host.view.marks.of(object)?.interaction;
      if (binding?.nearby) result.push(binding as NearbyBinding);
    });
    return result;
  }
  function nearbyFor(binding: NearbyBinding, point: number[]) {
    const { axis, radius, units } = binding.nearbyConfig, columns = binding.brushColumns ?? {};
    const options = binding.frameOptions ?? host.plotOptions;
    const topology = JSON.stringify(frameMappingSnapshot(options));
    const center: Record<string, number> = {}, span: Record<string, number> = {}, constant: Record<string, number> = {};
    const transform: Record<string, import("../publicTypes.js").ScaleTransformName> = {}, world: Record<string, (column: BrushColumn) => JaxArray> = {};
    for (const a of axis) {
      if (!columns[a]) continue;
      const visible = host.viewFrame?.[a as "x" | "y"], worldCenter = host.worldAt(a, point[a === "x" ? 0 : 1]);
      if (worldCenter === null) throw Error("nearby requires a completed Cartesian 2D axis frame.");
      const pixels = host.canvasSize(a);
      // A data radius is measured after the axis transform (log or sqrt), as frames scale data.
      if (units === "data") {
        // The column's units: a datetime column counts from its own origin (TODO 48.1).
        center[a] = axisValue(options, a, worldCenter) - (columns[a]!.origin ?? 0); span[a] = radius;
        transform[a] = options.get(a + "Transform") ?? "linear"; constant[a] = options.get(a + "TransformConstant") ?? 1;
      }
      else {
        // World coordinates are linear in pixels, so this radius is exact under any frame chain.
        center[a] = worldCenter;
        span[a] = Math.abs(radius * (visible![1] - visible![0]) / pixels);
        world[a] = (column: BrushColumn) => column.world(`${topology}:${a}`, (array: JaxArray) => axisWorldArray(options, a, array, column.origin ?? 0));
      }
    }
    return nearbyConstraint({ x: columns.x, y: columns.y, axis, units, center, radius: span, world, transform, constant });
  }
  function applyNearby(point: number[]) {
    const r = plotRectangle(), inside = point[0] >= r.left && point[0] <= r.right && point[1] >= r.top && point[1] <= r.bottom;
    // Marks sharing a resource and owner (one mark repeated in facet cells) set one constraint:
    // the union of each mark's own rows near the pointer in its own frame.
    const groups = new Map<BrushResource, Map<import("./viewControllerTypes.js").InteractionOwner, NearbyBinding[]>>();
    for (const binding of nearbyBindings()) {
      const key = groups.get(binding.nearby) ?? new Map();
      groups.set(binding.nearby, key.set(binding.owner, [...(key.get(binding.owner) ?? []), binding]));
    }
    let failed = "";
    for (const [resource, owners] of groups) for (const [owner, bindings] of owners) {
      if (!inside) { resource.cancelConstraintPreview(owner); continue; }
      try { resource.setConstraints(owner, [nearbyUnion(bindings.map((binding) => nearbyFor(binding, point)))], { phase: "preview", replace: true }); }
      catch (error: unknown) { failed = (error as Error).message; }
    }
    host.issue("nearby", failed);
  }
  function moveNearby(event: PointerEvent) {
    if (disposed) return;
    if (host.mode !== "2d" || host.plotOptions.get("coordinates") !== "cartesian" || event.pointerType === "touch") return;
    // Marks register nearby producers with the view; without any, skip the per-frame scene walk.
    if (!host.view.picking.nearby.size) return;
    nearbyPoint = host.localPointer(event);
    if (nearbyPending) return;
    nearbyPending = true;
    // Applied at the next frame as part of this move's change (see the brush preview above).
    const cause = currentCause();
    let done: (() => void) | undefined;
    if (host.renderer) trackPreparation(host.view, new Promise<void>((resolve) => (done = resolve)), cause);
    requestAnimationFrame(() => {
      try {
        nearbyPending = false;
        const point = nearbyPoint;
        nearbyPoint = null;
        if (point) publishWithCause(host.view, cause, () => applyNearby(point));
      } finally { done?.(); }
    });
  }
  function clearNearby() {
    nearbyPoint = null;
    if (!host.view.picking.nearby.size) return;
    for (const binding of nearbyBindings()) binding.nearby.cancelConstraintPreview(binding.owner);
  }
  function brushKey(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    if (!ownsEscape(event)) return;
    clearNearby();
    if (brushWheelBinding) {
      cancelBrushWheel(true);
      refreshBrushRect();
      event.preventDefault();
    } else if (brushGesture)
      finishBrush({ pointerId: brushGesture.pointerId, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation() }, true);
    else if (pendingBrush) {
      if (pendingBrush.controlOwner) pendingBrush.controlOwner.enabled = pendingBrush.controls;
      pendingBrush = null;
      event.preventDefault();
    } else if (lastEdited && hasConstraint(lastEdited)) {
      // Escape clears the most recently edited band; the clear controls remain for the rest.
      removeColumns(lastEdited.binding, lastEdited.identities);
      lastEdited = null;
      event.preventDefault();
    } else if (brushActive) {
      lastEdited = null;
      brushControlsDismissed = true;
      event.preventDefault();
    }
  }
  /**
   * Escape belongs to this plot while one of its gestures is in progress, while its canvas has
   * focus, or, when no plot canvas, dialog, menu, or part of this plot (settings pane, legend)
   * has focus, while the pointer is over it. Never to text fields, which own their Escape.
   */
  function ownsEscape(event: KeyboardEvent) {
    if (event.defaultPrevented) return false;
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return false;
    if (brushGesture || pendingBrush || brushWheelBinding) return true;
    const focused = document.activeElement as HTMLElement | null;
    if (focused && host.canvasHost?.contains(focused)) return true;
    if (focused && focused !== document.body && (host.plotHost?.contains(focused) ||
      focused.closest?.('[aria-label="Plot canvas"], dialog, [role="dialog"], [role="alertdialog"], [role="menu"]'))) return false;
    return host.hovered;
  }
  /** Arrow keys nudge a focused band 1 px (Shift: 10 px); Alt+Arrow moves only its trailing edge. */
  function nudgeBand(event: KeyboardEvent, band: NudgeBand) {
    const along = ({ ArrowLeft: ["x", -1], ArrowRight: ["x", 1], ArrowUp: ["y", -1], ArrowDown: ["y", 1] } as Record<string, [string, number]>)[event.key];
    if (!along || along[0] !== band.axis && band.axis !== "xy") return false;
    event.preventDefault();
    const [axis, sign] = along, step = sign * (event.shiftKey ? 10 : 1);
    try {
      if (band.strip) {
        // A strip band nudges its full interval, so a constraint reaching past the strip keeps that part.
        const next = nudgedSpan(band.span, band.strip.bounds, axis, step, event.altKey);
        if (!next) return true;
        cancelBrushWheel(false);
        applyBrushRect({ ...next, strip: band.strip }, "preview");
        band.strip.binding.brush.commitConstraintPreview(band.strip.binding.owner);
        markEdited(band.strip.binding, [band.identity!], band.key!);
      } else {
        const rect = { ...band.rect }, [lo, hi] = axis === "x" ? ["left", "right"] as const : ["top", "bottom"] as const;
        if (!event.altKey) rect[lo] += step;
        rect[hi] += step;
        if (rect[hi] <= rect[lo]) return true;
        cancelBrushWheel(false);
        applyBrushRect({ ...rect, axis: band.axis, rootAxis: band.rootAxis }, "preview");
        for (const binding of brushBindings(band.axis)) binding.brush.commitConstraintPreview(binding.owner);
        brushRect = { ...rect, axis: band.axis };
        const edited = rootEdit(brushRect);
        if (edited) markEdited(edited.binding, edited.identities, "root");
      }
    } catch (error: unknown) { host.issue("gesture", (error as Error).message); }
    refreshBrushRect();
    return true;
  }
  function removeDisplayedBrush() {
    cancelBrushWheel();
    let binding: BrushBinding | null = null;
    try { binding = primaryBrushBinding(); } catch { binding = null; }
    if (!binding) return;
    const columns = [...new Set(Object.values(binding.brushColumns ?? {}).filter(Boolean).map((column: BrushColumn | null | undefined) => column!.identity))];
    removeColumns(binding, columns);
  }
  /** Clear one strip band's constraint (its clear control, Delete, double-click). */
  function clearBand(band: StripBand) {
    cancelBrushWheel();
    removeColumns(band.binding, [band.identity]);
    if (activeBand?.identities.includes(band.identity)) activeBand = focusedBand = null;
  }
  /** "Clear current": the band last hovered, focused, or edited, else the root rectangle. */
  function clearCurrent() {
    const current = currentBand;
    if (current && current.key !== "root" && hasConstraint(current)) { cancelBrushWheel(); removeColumns(current.binding, current.identities); }
    else removeDisplayedBrush();
  }
  // Shared hover and focus: every band of the hovered or focused constraint is highlighted, and a
  // strip band shows its clear control; a focused band stays active while the pointer is elsewhere.
  let focusedBand: BandTarget | null = null;
  function bandTarget(band: StripBand | "root" | null) {
    if (band === "root") return rootBinding && rootIdentities.length ? { owner: rootBinding.owner, binding: rootBinding, identities: rootIdentities, key: "root" } : null;
    return band ? { owner: band.binding.owner, binding: band.binding, identities: [band.identity], key: band.key } : null;
  }
  function hoverBand(band: StripBand | "root" | null) {
    const target = bandTarget(band);
    if (target) currentBand = target;
    const next = target ?? focusedBand;
    if ((next?.key ?? null) !== (activeBand?.key ?? null)) activeBand = next;
  }
  function focusBand(band: StripBand | "root") {
    focusedBand = bandTarget(band);
    if (focusedBand) currentBand = activeBand = focusedBand;
  }
  function blurBand(event: FocusEvent, band: StripBand | "root") {
    if ((event.relatedTarget as HTMLElement)?.closest?.("[data-brush-controls]")) return;
    const key = bandTarget(band)?.key;
    if (focusedBand?.key === key) focusedBand = null;
    if (activeBand?.key === key) activeBand = null;
  }
  /** A strip band's clear control sits against the band (so the pointer can reach it without leaving). */
  function bandControlPlace(band: StripBand) {
    const rect = band.rect, width = host.canvasWidth || host.canvasHost?.clientWidth || 0, height = host.canvasHeight || host.canvasHost?.clientHeight || 0;
    if (band.axis === "y") {
      const top = (rect.top + rect.bottom) / 2;
      return rect.left >= 90 ? { left: rect.left, top, transform: "translate(-100%, -50%)" } : { left: rect.right, top, transform: "translateY(-50%)" };
    }
    const left = Math.max(0, Math.min(rect.left, width - 90));
    return rect.bottom + 24 <= height ? { left, top: rect.bottom, transform: undefined } : { left, top: rect.top, transform: "translateY(-100%)" };
  }
  const bandActive = (owner: object | string | undefined, identities: string[]) => Boolean(activeBand && activeBand.owner === owner && identities.some((identity) => activeBand!.identities.includes(identity)));
  $effect(() => {
    // The pointer left the canvas: hover no longer holds a band active.
    if (!host.hovered) untrack(() => { if (activeBand !== focusedBand) activeBand = focusedBand; });
  });
  let brushWheelTimer: ReturnType<typeof setTimeout> | undefined;
  let brushWheelBinding: BrushBinding | undefined, brushWheelKey: string | undefined;
  let brushWheelSpan: BrushRect | undefined, brushWheelEdited: BandEdit | null | undefined;
  function cancelBrushWheel(rollback = true) {
    clearTimeout(brushWheelTimer);
    brushWheelTimer = undefined;
    if (rollback && brushWheelBinding)
      brushWheelBinding.brush.cancelConstraintPreview(brushWheelBinding.owner);
    brushWheelBinding = undefined; brushWheelKey = undefined; brushWheelSpan = undefined; brushWheelEdited = undefined;
    // The wheel's preview band goes with it, so the real band shows the (rolled back) constraint.
    if (!brushGesture) stripDrag = null;
  }
  function cancelGestureForRootChange() {
    const gesture = brushGesture ?? pendingBrush;
    if (brushGesture && host.canvasHost?.hasPointerCapture?.(brushGesture.pointerId))
      host.canvasHost!.releasePointerCapture(brushGesture.pointerId);
    const binding = gesturePreviewBinding ?? brushGesture?.strip?.binding;
    binding?.brush?.cancelConstraintPreview(binding.owner);
    if (gesture?.controlOwner) gesture.controlOwner.enabled = gesture.controls;
    brushGesture = pendingBrush = null;
    gesturePreviewBinding = queuedBrushPreview = outsideBrushPress = null;
    stripDrag = null;
    cancelBrushWheel(true);
  }
  /** Commit a pending wheel edit now (after the wheel settles, or when another band is wheeled). */
  function commitBrushWheel() {
    const binding = brushWheelBinding, edited = brushWheelEdited;
    cancelBrushWheel(false);
    if (!binding) return;
    binding.brush.commitConstraintPreview(binding.owner);
    if (edited) markEdited(edited.binding, edited.identities, edited.key!);
  }
  function scheduleWheelCommit() {
    clearTimeout(brushWheelTimer);
    brushWheelTimer = setTimeout(() => { commitBrushWheel(); refreshBrushRect(); }, 150);
  }
  function brushWheel(event: WheelEvent) {
    if (disposed) return;
    if (event.ctrlKey || event.metaKey) return;
    if ((event.target as HTMLElement)?.closest?.("[data-brush-controls]")) return;
    host.issue("gesture");
    const point = host.localPointer(event), editable = bandAt(point);
    if (editable) {
      // Scale a strip band about the pointer along its axis; commit after the wheel settles.
      // Scaling works on the band's full interval, so a constraint reaching past the strip keeps that part.
      const { band } = editable;
      event.preventDefault(); event.stopPropagation();
      if (brushWheelBinding && brushWheelKey !== band.key) commitBrushWheel();
      const factor = Math.exp(Math.max(-1, Math.min(1, -event.deltaY * .002)));
      const [lo, hi, p] = band.axis === "x" ? ["left", "right", point[0]] as const : ["top", "bottom", point[1]] as const;
      const base = brushWheelKey === band.key && brushWheelSpan ? brushWheelSpan : band.span;
      const span = { ...base, [lo]: p + (base[lo] - p) * factor, [hi]: p + (base[hi] - p) * factor };
      const shown = bandInStrip(band.strip, band.axis, span[lo], span[hi]);
      if (!shown) return;
      try { applyBrushRect({ ...span, strip: stripOf(band) }, "preview"); } catch (error: unknown) { host.issue("gesture", (error as Error).message); return; }
      brushWheelBinding = band.binding; brushWheelKey = band.key; brushWheelSpan = span;
      brushWheelEdited = { binding: band.binding, identities: [band.identity], key: band.key };
      stripDrag = { ...shown, key: band.key };
      scheduleWheelCommit();
      return;
    }
    if (!brushRect) return;
    // Axis strips and the rest of the plot retain normal camera navigation.
    // Only the visible editable overlay owns brush-wheel scaling.
    if (!pointInBrush(point)) return;
    let binding: BrushBinding | null = null;
    try { binding = primaryBrushBinding(brushRect.axis); } catch { binding = null; }
    if (!binding) return;
    event.preventDefault(); event.stopPropagation();
    if (brushWheelBinding && brushWheelKey !== "root") commitBrushWheel();
    // Match plot-wheel direction: a zoom-in gesture enlarges the selected
    // interval, while the opposite delta shrinks it.
    const factor = Math.exp(Math.max(-1, Math.min(1, -event.deltaY * .002))), r = { ...brushRect };
    for (const dimension of brushRect.axis) {
      const lo = dimension === "x" ? "left" : "top", hi = dimension === "x" ? "right" : "bottom", p = dimension === "x" ? point[0] : point[1];
      r[lo] = p + (r[lo] - p) * factor; r[hi] = p + (r[hi] - p) * factor;
    }
    const next = normalizedBrush([r.left, r.top], [r.right, r.bottom], brushRect.axis);
    try { applyBrushRect(next, "preview"); } catch (error: unknown) { host.issue("gesture", (error as Error).message); return; }
    brushRect = next;
    brushWheelBinding = binding; brushWheelKey = "root";
    const edited = rootEdit(next);
    brushWheelEdited = edited && { ...edited, key: "root" };
    scheduleWheelCommit();
  }
  $effect(() => {
    // Marks may use named selections instead of the Data scope's default brush.
    // Observe their accepted bindings, including later mounts and replacements.
    const marks = new Map<object, BrushResource>();
    const subscriptions = new Map<BrushResource, () => void>();
    const fallback = host.brushResource;
    const refresh = () => untrack(() => {
      brushActive = [...subscriptions.keys()].some((resource) => resource.active || resource.previewActive);
      if (!brushActive && !brushGesture && !pendingBrush) {
        brushRect = null;
        stripBands = [];
        brushOtherCount = 0;
        brushOtherNames = "";
        brushControlsDismissed = true;
      }
      else refreshBrushRect();
    });
    const sync = () => {
      const resources = new Set(marks.values());
      if (fallback) resources.add(fallback);
      for (const [resource, stop] of subscriptions) if (!resources.has(resource)) {
        stop(); subscriptions.delete(resource);
      }
      for (const resource of resources) if (!subscriptions.has(resource)) {
        // subscribe immediately reports status; add the key before it does.
        subscriptions.set(resource, () => {});
        subscriptions.set(resource, resource.subscribe(refresh));
      }
      refresh();
    };
    const stop = host.view.marks.subscribe((object, binding) => {
      const resource = binding?.interaction?.brush;
      if (resource) marks.set(object, resource); else marks.delete(object);
      sync();
    });
    sync();
    return () => { stop(); for (const release of subscriptions.values()) release(); };
  });
  $effect(() => {
    const currentLayout = host.layout, currentFrame = host.viewFrame, currentStrips = stripFrames;
    if (currentLayout && currentFrame && currentStrips) untrack(refreshBrushRect);
  });
  return {
    get brushGesture() { return brushGesture; },
    get brushRect() { return brushRect; },
    get brushActive() { return brushActive; },
    get brushOtherCount() { return brushOtherCount; },
    get brushOtherNames() { return brushOtherNames; },
    get pendingBrush() { return pendingBrush; },
    get stripBands() { return stripBands; },
    get stripDrag() { return stripDrag; },
    get activeBand() { return activeBand; },
    get rootBinding() { return rootBinding; },
    get rootIdentities() { return rootIdentities; },
    get brushControlsFocused() { return brushControlsFocused; },
    get brushControlsDismissed() { return brushControlsDismissed; },
    get brushCursorState() { return brushCursorState; },
    set brushControlsFocused(value) { brushControlsFocused = value; },
    set brushControlsDismissed(value) { brushControlsDismissed = value; },
    set brushCursorState(value) { brushCursorState = value; },
    stripOf, beginBrush, moveBrush, finishBrush, brushWheel, brushKey, clearBrush, clearNearby, moveNearby, cancelGestureForRootChange, refreshBrushRect, publishStrips, bandAt, pointInBrush, clearBand, removeDisplayedBrush, nudgeBand, focusBand, blurBand, bandActive, bandControlPlace, clearCurrent,
    dispose() { disposed = true; cancelGestureForRootChange(); clearNearby(); },
  };
}
