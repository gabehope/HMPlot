// Stage 15 chunk D: the `$connect` scene descriptor Python writes (python/PROTOCOL.md
// "Connections") decodes into the connect() descriptor a Svelte author would build.
import test from "node:test";
import assert from "node:assert/strict";
import { SceneResources, decodeConnect } from "../../src/lib/scene/resources.js";
import {
  endpointDescriptor, endpointPending, isConnect, sameConnect, connectVersionError, CONNECT_ORDER_ARITY_ERROR,
} from "../../src/lib/plot/utils/connections.js";

// Stand-ins for mounted handles: bound marks expose endpoint({at}) with one stable `self`,
// Facet/Partition handles endpoint(name, {at}) over their options node.
function markHandle(kind) {
  const self = { getMark: () => ({ kind }) };
  return { self, getMark: self.getMark, endpoint: ({ at } = {}) => endpointDescriptor({ handle: self, at, kind }) };
}
function scopeHandle(scopeKind) {
  const options = { scopeKind };
  return { options, endpoint: (name, { at } = {}) => endpointDescriptor({ scope: options, name, at, scopeKind }) };
}
const descriptor = (endpoints, extra = {}) => ({ version: 1, key: "id", order: null, endpoints, ...extra });

test("$connect endpoints resolve through the mounted handles' endpoint()", () => {
  const handles = { before: markHandle("Anchor"), rect: markHandle("Rect") };
  const reference = (id) => handles[id];
  const value = decodeConnect(descriptor([
    { target: { $ref: "before" }, at: null },
    { target: { $ref: "rect" }, at: "left" },
  ]), reference);
  assert.ok(isConnect(value));
  assert.equal(value.version, 1);
  assert.equal(value.key, "id");
  assert.equal(value.order, undefined);
  assert.equal(value.endpoints[0].handle, handles.before.self);
  assert.equal(value.endpoints[0].at, undefined);
  assert.equal(value.endpoints[1].at, "left");
  assert.equal(value.endpoints[1].kind, "Rect");
  // A re-derivation builds a structurally equal descriptor, so the connector does not re-run.
  assert.ok(sameConnect(value, decodeConnect(descriptor([
    { target: { $ref: "before" }, at: null }, { target: { $ref: "rect" }, at: "left" },
  ]), reference)));
});

test("a forward reference is a pending endpoint until its handle mounts", () => {
  const handles = {};
  const reference = (id) => handles[id];
  const json = descriptor([{ target: { $ref: "line-first" } }, { target: { $ref: "anchor-later" }, at: "center" }]);
  const pending = decodeConnect(json, reference);
  assert.deepEqual(pending.endpoints.map(endpointPending), [true, true]);
  assert.deepEqual(pending.endpoints.map((e) => e.ref), ["line-first", "anchor-later"]);
  assert.equal(pending.endpoints[1].at, "center");
  handles["line-first"] = markHandle("Points");
  handles["anchor-later"] = markHandle("Anchor");
  const resolved = decodeConnect(json, reference);
  assert.deepEqual(resolved.endpoints.map(endpointPending), [false, false]);
  assert.ok(!sameConnect(pending, resolved));
  // A handle without endpoint() (a kind that cannot be an endpoint) is passed as a handle, so
  // the connector reports the deferred-endpoint error for it.
  handles.line = { getMark: () => ({ kind: "Line" }) };
  const line = decodeConnect(descriptor([{ target: { $ref: "line" } }, { target: { $ref: "anchor-later" } }]), reference);
  assert.equal(line.endpoints[0].handle, handles.line);
  assert.equal(line.endpoints[0].ref, "line");
});

test("Facet and Partition selections decode through the scope handle", () => {
  const handles = {};
  const reference = (id) => handles[id];
  const json = descriptor([{ scope: { $ref: "facet" }, name: "values", at: null }], { order: "facet" });
  const pending = decodeConnect(json, reference);
  assert.ok(endpointPending(pending.endpoints[0]));
  assert.equal(pending.order, "facet");
  // facet.svelte forwards to its core, which may not be bound yet: still pending.
  handles.facet = { endpoint: () => undefined };
  assert.ok(endpointPending(decodeConnect(json, reference).endpoints[0]));
  handles.facet = scopeHandle("Facet");
  const resolved = decodeConnect(json, reference).endpoints[0];
  assert.equal(resolved.scope, handles.facet.options);
  assert.equal(resolved.name, "values");
  assert.equal(resolved.scopeKind, "Facet");
  handles.partition = scopeHandle("Partition");
  const partition = decodeConnect(descriptor([{ scope: { $ref: "partition" }, name: "tip", at: "center" }], { order: "facet" }), reference);
  assert.equal(partition.endpoints[0].scopeKind, "Partition");
  assert.equal(partition.endpoints[0].at, "center");
});

test("versions, options, and arity follow connect()", () => {
  const reference = () => markHandle("Anchor");
  assert.throws(() => decodeConnect(descriptor([{ target: { $ref: "a" } }, { target: { $ref: "b" } }], { version: 2 }), reference),
    { message: connectVersionError(2) });
  assert.equal(connectVersionError(2), "connect descriptor version 2 is newer than this library supports (1).");
  const plain = decodeConnect({ version: 1, key: null, order: null, endpoints: [{ target: { $ref: "a" } }, { target: { $ref: "b" } }] }, reference);
  assert.equal(plain.key, undefined);
  assert.equal(plain.order, undefined);
  // One endpoint without order decodes (facet order is its default; a single mark that is not
  // repeated is an error when it resolves); order="facet" still takes exactly one.
  const alone = decodeConnect(descriptor([{ target: { $ref: "a" } }]), reference);
  assert.equal(alone.endpoints.length, 1);
  assert.equal(alone.order, undefined);
  assert.throws(() => decodeConnect(descriptor([{ target: { $ref: "a" } }, { target: { $ref: "b" } }], { order: "facet" }), reference),
    { message: CONNECT_ORDER_ARITY_ERROR });
});

test("SceneResources.resolve decodes $connect inside node props", () => {
  const handles = { a: markHandle("Anchor"), b: markHandle("Anchor") };
  const props = new SceneResources().resolve({
    color: "#00c800",
    connections: { $connect: descriptor([{ target: { $ref: "a" }, at: null }, { target: { $ref: "b" }, at: null }]) },
  }, (id) => handles[id]);
  assert.equal(props.color, "#00c800");
  assert.ok(isConnect(props.connections));
  assert.deepEqual(props.connections.endpoints.map((e) => e.handle), [handles.a.self, handles.b.self]);
});
