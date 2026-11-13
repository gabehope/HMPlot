<script>
  import { useViewServices } from "../utils/viewServices.js";
  import { useTask, useThrelte } from '@threlte/core';
  import { placedFrame } from '../utils/framePlacement.js';
  import { aspect3dPoint, frame3dDescriptor } from '../utils/aspect3d.js';
  import { cameraMatrixKey } from "../utils/camera.js";
  import { Vector3 } from 'three/webgpu';
  import { axisLayout, axisKey, readAxis } from '../utils/axes.js';
  import { hasAxisOverride } from '../utils/axisStyle.js';
  import { viewContextOf } from '../utils/viewContext.js';
  import { resolveAxes3d, nearFaces, axes3dGeometry } from '../utils/axes3dLayout.js';
  import { reportDataError } from '../utils/dataErrors.js';
  import { onDestroy, untrack } from 'svelte';

  let { options, active, config = true, enabledAxes = null, width, height, onframe, flat = false, titles = {} } = $props();
  const { scene, camera, renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  const styles = untrack(() => options.child('plot'));
  onDestroy(styles.on(() => invalidate()));
  $effect(() => { active; config; enabledAxes; width; height; flat; titles; invalidate(); });
  const owner = {}, vec = new Vector3();
  let cacheKey = '', displayed = false, near = [0, 0, 0];
  onDestroy(() => reportDataError(viewServices, owner, ''));
  const clear = () => { if (displayed) { displayed = false; cacheKey = ''; onframe(null); } };
  useTask(() => {
    let guides;
    try {
      const requested = config;
      guides = resolveAxes3d(flat && requested === false ? true : requested, styles.get('axisThreeD') ?? {}, options.get('coordinates'));
      if (flat && guides) guides = { ...guides, style: styles.get('axisFrame') ? 'box' : 'triad', gridPlanes: [] };
      reportDataError(viewServices, owner, '');
    } catch (error) { reportDataError(viewServices, owner, error.message); clear(); return; }
    if (!active || !guides || !camera.current || !(width > 0 && height > 0)) { clear(); return; }
    const descriptor = frame3dDescriptor(options, { local: true });
    const { surface, ranges, logicalAxes } = descriptor;
    const cam = camera.current; cam.updateMatrixWorld();
    const placement = placedFrame(options);
    const mapped = point => placement ? vec.fromArray(point).applyMatrix4(placement.matrix).toArray()
      : aspect3dPoint(options, point);
    const key = JSON.stringify([options.get('_categoryRevision'), width, height, ranges,
      descriptor.domains, descriptor.transforms, descriptor.constants,
      ['x', 'y', 'z'].map(axis => [readAxis(options, axis), hasAxisOverride(styles, axisKey(axis, 'grid'))]),
      ['axisTitles', 'axisTickLabels', 'axisFontSize', 'frameXShow', 'frameYShow', 'frameZShow', 'frameXSide', 'frameYSide'].map(key => styles.get(key)),
      !!surface, titles, guides, enabledAxes, flat, placement?.matrix.elements,
      cameraMatrixKey(cam), mapped(ranges.map(range => range[0])),
      mapped(ranges.map(range => range[1]))]);
    if (key === cacheKey) return;
    cacheKey = key; displayed = true;
    const cameraPosition = placement ? cam.getWorldPosition(vec).applyMatrix4(placement.inverse).toArray()
      : cam.getWorldPosition(vec).toArray();
    near = nearFaces(ranges, cameraPosition, near);
    if (flat) near = [Number(styles.get('frameYSide') === 'right'), Number(styles.get('frameXSide') === 'top'), 0];
    const layouts = ['x', 'y', 'z'].map((axis, index) => {
      const logical = logicalAxes[index];
      // The plot's view context goes along: the axes know they are 3D (TODO 136.17's 2D ticks).
      const source = surface ? { categoryAxes: options.categoryAxes, viewContext: viewContextOf(options), child: key => options.child(key), get: key => {
        if (key === 'coordinates') return 'cartesian';
        if (key === logical + 'range') return ranges[index];
        if (key === logical + 'bounds') return descriptor.domains[index];
        if (key === logical + 'Transform') return descriptor.transforms[index];
        if (key === logical + 'TransformConstant') return descriptor.constants[index];
        return options.get(key);
      }} : options;
      const layout = axisLayout(source, logical, [...ranges[index]].sort((a, b) => a - b), Math.max(180, Math.min(width, height) * .65));
      // Selecting a plane opts into major grids, while an authored axis grid
      // setting remains authoritative over the coordinate-aware default.
      // A copy: axisLayout's result is cached and shared (TODO 143.4).
      if (!flat && !hasAxisOverride(styles, axisKey(logical, 'grid')))
        return { ...layout, config: { ...layout.config, grid: 'major' } };
      return layout;
    });
    const geometry = axes3dGeometry(ranges, layouts, guides, { near, flat,
      logicalAxes,
      shown: logicalAxes.map(axis => (enabledAxes === null || enabledAxes['xyz'.indexOf(axis)]) &&
        styles.get('frame' + axis.toUpperCase() + 'Show') !== false),
      titles: styles.get('axisTitles') === false ? {} : Object.fromEntries(
        ['x', 'y', 'z'].map((axis, index) => [axis, titles[logicalAxes[index]]])) });
    const project = point => {
      vec.fromArray(mapped(point)).project(cam);
      return { x: (vec.x + 1) * width / 2, y: (1 - vec.y) * height / 2, visible: vec.z >= -1 && vec.z <= 1 };
    };
    const center = project(geometry.center), edges = geometry.edges.map(edge => ({ ...edge, points: edge.points.map(project) }));
    const normals = Object.fromEntries(edges.filter(edge => edge.primary).map(edge => {
      const [a, b] = edge.points, dx = (a.x + b.x) / 2 - center.x, dy = (a.y + b.y) / 2 - center.y;
      const length = Math.hypot(dx, dy) || 1;
      return [edge.axis, { x: dx / length, y: dy / length }];
    }));
    const labels = [];
    const ticks = geometry.ticks.map(tick => {
      const point = project(tick.position), normal = normals[tick.axis] ?? { x: 0, y: 1 };
      let showLabel = tick.showLabel && (tick.title || styles.get('axisTickLabels') !== false);
      if (!tick.title && showLabel) {
        if (labels.some(label => Math.hypot(label.x - point.x, label.y - point.y) < (styles.get('axisFontSize') ?? 12))) showLabel = false;
        else labels.push(point);
      }
      return { ...tick, ...point, normal, showLabel };
    });
    onframe({ edges, ticks, frame: flat && !!styles.get('axisFrame'), grids: geometry.grids.map(grid => ({ ...grid, points: grid.points.map(project) })),
      config: Object.fromEntries(layouts.map((layout, index) => ['xyz'[index], layout.config])) });
  }, { autoInvalidate: false });
</script>
