import test from "node:test";
import assert from "node:assert/strict";
import { installCoordinateModeDefaults } from "../../src/lib/plot/utils/coordinates.js";

function settings(parent = { coordinates: "cartesian", baseRadius: 1 }) {
  const values = new Map(), listeners = new Map();
  const emit = key => { for (const listener of listeners.get(key) ?? []) listener(values.get(key)); };
  return { values,
    get: key => values.has(key) ? values.get(key) : parent[key],
    set(key, value) { if (values.get(key) === value && values.has(key)) return;
      values.set(key, value); emit(key); },
    clear(key) { values.delete(key); emit(key); },
    on(listener, key) { let group = listeners.get(key);
      if (!group) listeners.set(key, group = new Set());
      group.add(listener); return () => group.delete(listener); },
  };
}

test("mode defaults follow Plot and Frame coordinate edits without replacing a chosen radius", () => {
  const plot = settings(), stop = installCoordinateModeDefaults(plot);
  assert.equal(plot.get("baseRadius"), 1);
  assert.equal(plot.values.has("baseRadius"), false);
  plot.set("coordinates", "polar");
  assert.equal(plot.get("baseRadius"), 0);
  plot.set("coordinates", "spherical");
  assert.equal(plot.get("baseRadius"), 1);
  plot.set("coordinates", "cartesian");
  assert.equal(plot.values.has("baseRadius"), false);
  plot.set("coordinates", "polar");
  plot.set("baseRadius", 0.4);
  plot.set("coordinates", "spherical");
  assert.equal(plot.get("baseRadius"), 0.4);
  stop();

  const child = settings({ coordinates: "polar", baseRadius: 0 });
  const stopChild = installCoordinateModeDefaults(child);
  child.set("coordinates", "spherical");
  assert.equal(child.get("baseRadius"), 1);
  stopChild();
});

test("an inherited Frame keeps its parent's explicit radius until it owns coordinates", () => {
  const parent = { coordinates: "polar", baseRadius: 2 };
  const child = settings(parent);
  child.frameDefinition = { parent };
  const stop = installCoordinateModeDefaults(child);
  assert.equal(child.get("baseRadius"), 2);
  assert.equal(child.values.has("baseRadius"), false);
  child.set("coordinates", "spherical");
  assert.equal(child.get("baseRadius"), 1);
  child.clear("coordinates");
  assert.equal(child.get("baseRadius"), 2);
  assert.equal(child.values.has("baseRadius"), false);
  stop();
});

test("geographic frames restore Cartesian ranges and preserve newly authored domains", async () => {
  const { CoordinateFrame } = await import("../../src/lib/plot/utils/coordinateFrame.ts");
  const options = settings({ coordinates: "cartesian", angleUnit: "degrees", projection: "equirectangular", xbounds: [2, 8], ybounds: [3, 9], xrange: [0, 1], yrange: [-1, 1] });
  const frame = new CoordinateFrame(options), domains = {}, ranges = {};
  const sync = () => frame.syncRanges(axis => domains[axis], axis => ranges[axis]);
  options.set("coordinates", "spherical");
  sync();
  assert.deepEqual(options.get("xbounds"), [-180, 180]);
  assert.equal(frame.collects("x"), false);
  assert.equal(frame.padding(0.1), 0);
  options.set("projection", "orthographic");
  assert.equal(frame.collects("z"), true);
  assert.equal(frame.collects("x"), false);
  options.set("coordinates", "cartesian");
  domains.x = [4, 7];
  sync();
  assert.deepEqual(options.get("xbounds"), [4, 7]);
  assert.deepEqual(options.get("ybounds"), [3, 9]);
  assert.deepEqual(options.get("xrange"), [0, 1]);
  assert.deepEqual(options.get("yrange"), [-1, 1]);
  assert.equal(frame.collects("x"), true);
  assert.equal(frame.padding(0.1), 0.1);
});

test("only a separable flat map fits its authored angular domains", async () => {
  const { CoordinateFrame } = await import("../../src/lib/plot/utils/coordinateFrame.ts");
  const options = settings({ coordinates: "spherical", angleUnit: "radians", projection: "mercator" });
  const frame = new CoordinateFrame(options);
  const domain = [Math.PI / 2, -Math.PI / 2];
  assert.deepEqual(frame.domainBox("2d", undefined, domain, undefined), [-90, -80, 90, 80]);
  assert.equal(frame.domainBox("3d", undefined, domain, undefined), null);
  assert.equal(frame.domainBox("2d", {}, domain, undefined), null);
  options.set("projection", "orthographic");
  assert.equal(frame.domainBox("2d", undefined, domain, undefined), null);
  options.set("projection", "equal-earth");
  assert.equal(frame.domainBox("2d", undefined, domain, undefined), null);
});
