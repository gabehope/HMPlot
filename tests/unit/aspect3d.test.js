import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4 } from 'three/webgpu';
import { aspect3dMetric, aspect3dSource, aspect3dPoint, frame3dDescriptor, register3dDisplayScene } from '../../src/lib/plot/utils/aspect3d.js';
import { framePoint, framePointInverse, placementMatrix } from '../../src/lib/plot/utils/framePlacement.js';
import { buildCoordinateOperations, resolveCoordinateOperations } from '../../src/lib/plot/utils/coordinateOperations.js';
import { resolveAxes3d, nearFaces, axes3dGeometry } from '../../src/lib/plot/utils/axes3dLayout.js';

function source(overrides = {}) {
  const values = { coordinates: 'cartesian', mode: '3d', aspect: 'equal',
    xbounds: [0, 100], ybounds: [0, 50], zbounds: [0, 10],
    xrange: [-50, 50], yrange: [-50, 50], zrange: [-50, 50], ...overrides };
  // The plot's view (TODO 136.12: its view context, not an option).
  const node = { get: key => values[key], child: () => ({ get: key => values[key] }), values,
    get viewContext() { return { mode: values.mode }; } };
  return node;
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);

test('equal 3D keeps one world length per data unit without modifying authored ranges', () => {
  const options = source();
  assert.deepEqual(aspect3dMetric(options).display, [[-50, 50], [-25, 25], [-5, 5]]);
  assert.deepEqual(framePoint(options, [0, 0, 0]), [-50, -25, -5]);
  const origin = framePoint(options, [0, 0, 0]);
  for (let axis = 0; axis < 3; axis++) {
    const data = [0, 0, 0]; data[axis] = 1;
    close(framePoint(options, data)[axis] - origin[axis], 1);
  }
  const point = [20, 30, 7];
  framePointInverse(options, framePoint(options, point)).forEach((v, i) => close(v, point[i]));
  assert.deepEqual(options.get('yrange'), [-50, 50]);
  assert.equal(resolveCoordinateOperations(options).at(-1).axes.y.span, 50);
});

test('live transformed and reversed scales update the shared CPU/GPU source', () => {
  const options = source({ xbounds: [1, 1000], xTransform: 'log', ybounds: [0, 3], zbounds: [0, 3], xrange: [40, -60] });
  const display = aspect3dSource(options), before = framePoint(options, [1, 0, 0]);
  const logStep = Math.abs(framePoint(options, [Math.E, 0, 0])[0] - before[0]);
  close(logStep, framePoint(options, [1, 1, 0])[1] - before[1]);
  close(aspect3dMetric(options).center[0], -10);
  options.values.ybounds = [0, 1];
  close(display.transformed.yrange.y - display.transformed.yrange.x,
    display.get('yrange')[1] - display.get('yrange')[0]);
  options.values.aspect = 'auto';
  assert.equal(aspect3dSource(options), display);
  assert.deepEqual(aspect3dMetric(options).scale, [1, 1, 1]);
  options.values.mode = '2d';
  assert.equal(aspect3dSource(options), null);
  options.values.mode = '3d'; options.values.coordinates = 'polar';
  assert.equal(aspect3dSource(options), null);
});

test('nested inherited frames receive one root metric while explicit placement retains its size', () => {
  const root = source();
  root.frameDefinition = { parent: null, ranges: new Set(), owns: () => true };
  const child = { defaults: root, get: key => root.get(key), child: root.child,
    frameDefinition: { parent: root, ranges: new Set(), owns: () => false } };
  assert.equal(buildCoordinateOperations(child).filter(operation => operation.display).length, 1);
  assert.deepEqual(framePoint(child, [100, 50, 10]), [50, 25, 5]);
  const placement = { anchor: [50, 25, 5], size: [20, 10, 6] };
  const matrix = placementMatrix(placement, root, '3d');
  const placed = source({ xbounds: [0, 1], ybounds: [0, 1], zbounds: [0, 1], xrange: [-1, 1], yrange: [-1, 1], zrange: [-1, 1] });
  placed.frameDefinition = { parent: root, ranges: new Set(), owns: () => true, placement, matrix, inverse: new Matrix4().copy(matrix).invert() };
  assert.deepEqual(framePoint(placed, [1, 1, 1]), [10, 5, 3]);
  assert.equal(buildCoordinateOperations(placed).filter(operation => operation.display).length, 0);
});

test('surface guides, camera and marks share one root metric in the established x/height/-y basis', () => {
  const root = source();
  const values = { valueBounds: [0, 10], zScale: 100 },
    local = { defaults: root, get: key => values[key] ?? root.get(key) },
    surface = { surfaceMode: true, zScaleNode: {}, options: local }, view = { drawing: { revision: 1 } };
  const release = register3dDisplayScene(root, { traverse: visit => visit(surface) }, view);
  const descriptor = frame3dDescriptor(root);
  assert.deepEqual(descriptor.logicalAxes, ['x', 'z', 'y']);
  assert.deepEqual(descriptor.domains, [[0, 100], [0, 10], [0, 50]]);
  assert.deepEqual(aspect3dMetric(root).display, [[-50, 50], [45, 55], [25, -25]]);
  const center = aspect3dPoint(root, [0, 50, 0]);
  close(aspect3dPoint(root, [1, 50, 0])[0] - center[0], 1);
  close(aspect3dPoint(root, [0, 60, 0])[1] - center[1], 1);
  close(center[2] - aspect3dPoint(root, [0, 50, -2])[2], 1);
  values.zScale = 0; view.drawing.revision++;
  assert.deepEqual(aspect3dMetric(root).scale, [1, 1, .5]);
  assert.ok(aspect3dSource(root).get('yrange').every(Number.isFinite));
  const chart = { defaults: root, viewContext: { mode: 'chart' }, get: key => root.get(key) };
  assert.equal(aspect3dSource(chart), null);
  release();
  assert.deepEqual(frame3dDescriptor(root).logicalAxes, ['x', 'y', 'z']);
});

test('3D guide configurations validate and retain stable camera-facing choices', () => {
  assert.deepEqual(resolveAxes3d(true), { style: 'box', gridPlanes: [] });
  assert.deepEqual(resolveAxes3d({ gridPlanes: ['xy', 'xy'] }, { style: 'triad' }), { style: 'triad', gridPlanes: ['xy'] });
  assert.equal(resolveAxes3d(true, {}, 'spherical'), null);
  assert.throws(() => resolveAxes3d({ style: 'triad' }, {}, 'spherical'), /Cartesian/);
  assert.throws(() => resolveAxes3d({ gridPlanes: ['zz'] }), /gridPlanes/);
  assert.throws(() => resolveAxes3d({ style: 'sphere' }), /style/);
  const ranges = [[-50, 50], [-25, 25], [-5, 5]];
  assert.deepEqual(nearFaces(ranges, [.1, .1, .01], [1, 0, 1]), [1, 0, 1]);
  assert.deepEqual(nearFaces(ranges, [-100, 100, -50]), [0, 1, 0]);
});

test('box/triad grids share endpoints and move to the far faces', () => {
  const ranges = [[-50, 50], [-25, 25], [-5, 5]],
    layouts = ranges.map(() => ({ config: { major: true, titlePosition: 'middle' },
      major: [0, .5, 1].map(fraction => ({ fraction, label: String(fraction), showLabel: true })), minor: [] }));
  const box = axes3dGeometry(ranges, layouts, { style: 'box', gridPlanes: ['xy', 'xz'] },
    { near: [1, 1, 1], titles: { x: 'X' } });
  assert.equal(box.edges.length, 12);
  assert.equal(box.edges.filter(edge => edge.primary).length, 3);
  assert.equal(box.grids.length, 4);
  assert.ok(box.grids.filter(grid => grid.plane === 'xy').every(grid => grid.points.every(point => point[2] === -5)));
  assert.deepEqual(box.ticks.find(tick => tick.title).position, [0, 25, 5]);
  const triad = axes3dGeometry(ranges, layouts, { style: 'triad', gridPlanes: ['xy'] }, { near: [0, 0, 0] });
  assert.equal(triad.edges.length, 3);
  assert.ok(triad.edges.every(edge => edge.primary));
  assert.ok(triad.grids.every(grid => grid.points.every(point => point[2] === 5)));
  assert.equal(axes3dGeometry(ranges, layouts, {}, { shown: [false, false, false] }).edges.length, 0);
  const surface = axes3dGeometry(ranges, layouts, { gridPlanes: ['xz'] },
    { near: [1, 1, 1], logicalAxes: ['x', 'z', 'y'] });
  assert.equal(surface.grids.length, 2);
  assert.ok(surface.grids.every(grid => grid.plane === 'xz' && grid.points.every(point => point[2] === -5)));
  const off = layouts.map(layout => ({ ...layout, config: { ...layout.config, grid: 'off' } }));
  assert.equal(axes3dGeometry(ranges, off, { gridPlanes: ['xy', 'xz', 'yz'] }).grids.length, 0);
});
