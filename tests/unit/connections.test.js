import test from "node:test";
import assert from "node:assert/strict";
import {
  connect, isConnect, isEndpoint, endpointDescriptor, endpointPending, sameConnect, endpointLabel, entryLabel,
  CONNECT_VERSION, ORDERS, CONNECTION_KINDS, ENDPOINT_KINDS, COMPOUND_ENDPOINT_KINDS, ATTACHMENTS, DEFERRED_ENDPOINTS,
  attachmentNames, endpointAttachment, connectionKeyToken, matchEndpoints, matchCacheKey, slotSequence,
  compareOrdinals, endpointAncestor, connectionLayout, anchorPickingProps, isConnectionKind, isEndpointKind,
  ANCHOR_PICKING_ERROR, CONNECT_EMPTY_ERROR, CONNECT_ORDER_ARITY_ERROR, ENDPOINT_BOTH_ERROR,
  connectOptionError, connectKeyError, connectOrderError, connectVersionError, connectArgumentError,
  connectScopeArgumentError, endpointAtTypeError, endpointAtError, scopeEndpointNameError, connectKeyValueError,
  duplicateKeyError, duplicateObservationError, missingKeyColumnError, differentTablesError, noTableError,
  aggregateEndpointError, repeatedEndpointError, singleEndpointError, repeatedMountError, repetition, isRepeated,
  endpointSlots, notInFrameError, attachmentError, missingAttachmentError,
  deferredEndpointError, connectionsKindError, connectionBackedError, otherViewError, connectionsChannelError,
  sphericalConnectionsError, duplicateEndpointNameError, ambiguousFieldError,
} from "../../src/lib/plot/utils/connections.js";

// A bound mark handle: anything with getMark().
const handle = (label = "mark") => ({ getMark: () => ({ options: { presentation: { label } } }) });
const throwsText = (fn, text) => assert.throws(fn, (error) => { assert.equal(error.message, text); return true; });

test("connect builds a frozen, versioned descriptor from handles and endpoint selections", () => {
  const before = handle("Before"), after = handle("After");
  const d = connect(before, after, { key: "id" });
  assert.ok(isConnect(d));
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.endpoints) && Object.isFrozen(d.endpoints[0]));
  assert.equal(d.version, CONNECT_VERSION);
  assert.equal(d.key, "id");
  assert.equal(d.order, undefined);
  assert.equal(d.endpoints.length, 2);
  assert.ok(d.endpoints.every(isEndpoint));
  assert.equal(d.endpoints[0].handle, before);
  assert.equal(d.endpoints[1].at, undefined);
  // Three explicit endpoints; the trailing options are optional.
  assert.equal(connect(before, after, handle()).endpoints.length, 3);
  assert.equal(connect(before, after).key, undefined);
  // An endpoint selection passes through untouched.
  const left = endpointDescriptor({ handle: before, at: "left" });
  assert.equal(connect(left, after).endpoints[0], left);
  // One repeated definition alone expands by facet order: the default, or order="facet".
  const repeated = endpointDescriptor({ scope: {}, name: "values", scopeKind: "Facet" });
  const alone = connect(repeated, { key: "id" });
  assert.equal(alone.order, undefined);
  assert.equal(alone.endpoints[0].name, "values");
  const facet = connect(repeated, { key: "id", order: "facet" });
  assert.equal(facet.order, "facet");
  assert.ok(!sameConnect(alone, facet), "the descriptor keeps what was written");
  assert.deepEqual(ORDERS, ["facet"]);
});

test("unbound handles are pending endpoints, not errors", () => {
  const d = connect(undefined, null, { key: "id" });
  assert.ok(d.endpoints.every(endpointPending));
  assert.equal(endpointLabel(d.endpoints[1], 1), "endpoint 2");
  assert.equal(endpointLabel(endpointDescriptor({ ref: "anchor-3" })), "anchor-3");
  assert.equal(endpointLabel(connect(handle("Before"), handle()).endpoints[0]), "Before");
  assert.equal(entryLabel({ name: "values", label: "Anchor 1" }), "values");
  assert.equal(entryLabel({ label: "Anchor 1" }), "Anchor 1");
});

test("connect validates its arguments with exact messages", () => {
  const a = handle(), b = handle();
  throwsText(() => connect(), CONNECT_EMPTY_ERROR);
  throwsText(() => connect({ key: "id" }), CONNECT_EMPTY_ERROR);
  // One mark alone is checked when it resolves (it may be repeated by a Facet or Partition).
  assert.equal(connect(a).endpoints.length, 1);
  assert.equal(connect(undefined, { key: "id" }).endpoints.length, 1);
  throwsText(() => connect(a, b, { order: "facet" }), CONNECT_ORDER_ARITY_ERROR);
  throwsText(() => connect(a, b, { order: "row" }), connectOrderError("row"));
  assert.equal(connectOrderError("row"), 'connect: order must be "facet" or omitted, not "row".');
  throwsText(() => connect(a, b, { key: 3 }), connectKeyError(3));
  throwsText(() => connect(a, b, { key: "" }), 'connect: key must name one column (a non-empty string), not "".');
  throwsText(() => connect(a, b, { keys: "id" }), connectOptionError("keys"));
  throwsText(() => connect(a, b, { version: 2 }), connectVersionError(2));
  assert.equal(connectVersionError(2), "connect descriptor version 2 is newer than this library supports (1).");
  throwsText(() => connect(a, 42), connectArgumentError(1));
  assert.equal(connectArgumentError(1), 'connect: argument 2 is not an endpoint; pass a mark, mark.endpoint({at}), or facet.endpoint("name").');
  throwsText(() => connect({ endpoint() {}, getFrames() {} }, a), connectScopeArgumentError(0));
  throwsText(() => connect("values", a), connectArgumentError(0));
  // A version the library supports is accepted and normalized.
  assert.equal(connect(a, b, { version: 1 }).version, 1);
});

test("endpoint selections validate at, scope and name", () => {
  throwsText(() => endpointDescriptor({ handle: handle(), at: 3 }), endpointAtTypeError(3));
  throwsText(() => endpointDescriptor({ handle: handle(), at: "" }), endpointAtTypeError(""));
  throwsText(() => endpointDescriptor({ handle: handle(), scope: {}, name: "x" }), ENDPOINT_BOTH_ERROR);
  throwsText(() => endpointDescriptor({ scope: {}, scopeKind: "Partition" }), scopeEndpointNameError("Partition"));
  assert.equal(scopeEndpointNameError("Facet"), 'Facet.endpoint: pass the name of the repeated endpoint mark, e.g. facet.endpoint("values").');
  // With a known kind, at is checked against the table at once.
  throwsText(() => endpointDescriptor({ handle: handle(), kind: "Anchor", at: "left" }), endpointAtError("Anchor", "left", ["center"]));
  assert.equal(endpointAtError("Anchor", "left", ["center"]), 'Anchor.endpoint: Anchor does not offer at="left"; available: center.');
  assert.equal(endpointDescriptor({ handle: handle(), kind: "Anchor", at: "center" }).at, "center");
  const scoped = endpointDescriptor({ scope: {}, name: "values", at: "center" });
  assert.equal(scoped.scopeKind, "Facet");
  assert.equal(scoped.handle, undefined);
});

test("sameConnect compares selections, not descriptor identity", () => {
  const a = handle(), b = handle();
  assert.ok(sameConnect(connect(a, b, { key: "id" }), connect(a, b, { key: "id" })));
  assert.ok(!sameConnect(connect(a, b, { key: "id" }), connect(b, a, { key: "id" })));
  assert.ok(!sameConnect(connect(a, b, { key: "id" }), connect(a, b, { key: "k" })));
  assert.ok(!sameConnect(connect(a, b), connect(a, endpointDescriptor({ handle: b, at: "left" }))));
  assert.ok(!sameConnect(connect(a, b), null));
});

test("the attachment table covers every endpoint kind", () => {
  for (const kind of [...ENDPOINT_KINDS, ...COMPOUND_ENDPOINT_KINDS]) assert.ok(ATTACHMENTS[kind], kind);
  for (const kind of ["Anchor", "Points", "Points3D"]) {
    assert.equal(ATTACHMENTS[kind].default, "center");
    assert.deepEqual(endpointAttachment(kind).fields, [["position", [1, 1, 1]]]);
  }
  assert.equal(endpointAttachment("Text").name, "anchor");
  for (const kind of ["Rect", "Prism"]) {
    assert.deepEqual(attachmentNames(kind), ["center", "left", "right", "bottom", "top"]);
    // Prism fields hold the lower (position) and upper (extent) corners.
    assert.deepEqual(endpointAttachment(kind).fields, [["position", [0.5, 0.5, 0.5]], ["extent", [0.5, 0.5, 0.5]]]);
    assert.deepEqual(endpointAttachment(kind, "left").fields, [["position", [1, 0.5, 0.5]], ["extent", [0, 0.5, 0.5]]]);
    assert.deepEqual(endpointAttachment(kind, "top").fields, [["position", [0.5, 0, 0.5]], ["extent", [0.5, 1, 0.5]]]);
  }
  assert.deepEqual(attachmentNames("Bar"), ["center", "left", "right", "bottom", "top", "baseline", "value"]);
  assert.deepEqual(endpointAttachment("Histogram", "value"), { name: "value", compound: "value", form: { edge: [0, 1] } });
  // A template's attachments come from its declaration (TODO 130.2): Bar's value end by form.
  assert.deepEqual(endpointAttachment("Bar", "value"), { name: "value", compound: "value", form: { end: "__barValue", from: "__barBaseline" } });
  assert.deepEqual(endpointAttachment("Bar", "baseline").form, { end: "__barValue", from: "__barBaseline", opposite: true });
  // BoxPlot as a template (TODO 130.3) also takes its box's Rect edges, as Bar does.
  assert.deepEqual(attachmentNames("BoxPlot"), ["center", "left", "right", "bottom", "top", "q1", "q3", "median"]);
  // A Pie sector's corners are (angle, radius): "outer" is the middle of its outer arc, its box's
  // top (an alias since Pie is a template, TODO 130.3, which also offers the box's edges).
  assert.deepEqual(attachmentNames("Pie"), ["center", "left", "right", "bottom", "top", "outer", "inner"]);
  assert.deepEqual(endpointAttachment("Pie", "outer").fields, [["position", [0.5, 0, 0.5]], ["extent", [0.5, 1, 0.5]]]);
  for (const kind of ["Segments", "Arrows3D", "Arrows"]) {
    assert.equal(ATTACHMENTS[kind].default, null);
    assert.deepEqual(endpointAttachment(kind, "end").fields, [["end", [1, 1, 1]]]);
    throwsText(() => endpointAttachment(kind, undefined, { kind: "Line" }), missingAttachmentError("Line", kind, ["start", "end"]));
  }
  assert.equal(missingAttachmentError("Line", "Arrows3D", ["start", "end"]),
    "Line.connections: Arrows3D has no default endpoint; choose one with endpoint({at}) from: start, end.");
  throwsText(() => endpointAttachment("Points", "left", { kind: "Arrows3D" }),
    'Arrows3D.connections: Points does not offer endpoint at="left"; available: center.');
  assert.equal(attachmentError("Arrows3D", "Rect", "median", attachmentNames("Rect")),
    'Arrows3D.connections: Rect does not offer endpoint at="median"; available: center, left, right, bottom, top.');
  // Weights stay rows of three and tables stay immutable.
  for (const kind of Object.keys(ATTACHMENTS)) {
    assert.ok(Object.isFrozen(ATTACHMENTS[kind].at), kind);
    for (const spec of Object.values(ATTACHMENTS[kind].at))
      for (const [, weights] of spec.fields ?? []) assert.equal(weights.length, 3, kind);
  }
});

test("deferred endpoint kinds name what is missing and suggest Anchor", () => {
  const expected = {
    Line: "general line vertices", Area: "boundary intersections",
    ErrorBars: "boundary intersections", GeoJSON: "GeoJSON representatives",
    Surface: "surface samples", Heatmap: "solid-surface attachments",
  };
  for (const [kind, reason] of Object.entries(expected)) {
    assert.equal(DEFERRED_ENDPOINTS[kind], reason);
    throwsText(() => endpointAttachment(kind, undefined, { kind: "Line" }),
      `Line.connections: ${kind} endpoints are not supported yet (${reason}); use Anchor at the position you need.`);
    assert.ok(!ENDPOINT_KINDS.includes(kind));
  }
  assert.equal(deferredEndpointError("Arrows3D", "Lollipop"),
    "Arrows3D.connections: Lollipop endpoints are not supported yet (no attachment table); use Anchor at the position you need.");
  assert.equal(connectionBackedError("Line"), 'connect: "Line" is drawn from connections and cannot be an endpoint yet.');
});

test("kind lists: consumers, endpoints, and the channels connections replace", () => {
  assert.deepEqual(CONNECTION_KINDS, ["Line", "Segments", "Arrows3D", "Arrows"]);
  assert.ok(COMPOUND_ENDPOINT_KINDS.includes("Arrows") && !ENDPOINT_KINDS.includes("Arrows"));
  assert.ok(isConnectionKind("Arrows3D") && !isConnectionKind("Points"));
  assert.ok(isEndpointKind("Anchor") && isEndpointKind("Segments") && !isEndpointKind("Line"));
  assert.equal(connectionsKindError("Points"),
    "Points.connections: only Line, Segments, Arrows3D, and Arrows accept connections.");
  assert.equal(connectionsChannelError("Line"), "Line: connections cannot be combined with x, y, z, position, start, or end.");
  assert.equal(sphericalConnectionsError("Arrows3D"), "Arrows3D: connections are not available in 3D spherical views yet.");
});

test("key tokens keep types apart and drop missing values", () => {
  assert.equal(connectionKeyToken(1), "number:1");
  assert.equal(connectionKeyToken("1"), "string:1");
  assert.notEqual(connectionKeyToken(1), connectionKeyToken("1"));
  assert.equal(connectionKeyToken(true), "boolean:true");
  assert.equal(connectionKeyToken(null), null);
  assert.equal(connectionKeyToken(undefined), null);
  assert.equal(connectionKeyToken(NaN), null);
  assert.equal(connectionKeyToken(Infinity), null);
  throwsText(() => connectionKeyToken({}), connectKeyValueError({}));
  assert.equal(connectKeyValueError({}), "connect: key values must be strings, numbers, or booleans; got object.");
});

test("explicit keys match reordered rows, never coerce, and leave missing slots at -1", () => {
  const result = matchEndpoints([
    { label: "before", keys: ["a", "b", "c", 1] },
    { label: "after", keys: ["c", "a", "x", "1"] },
  ], { key: "id" });
  // Connections are the union by first appearance.
  assert.deepEqual(result.keys, ["string:a", "string:b", "string:c", "number:1", "string:x", "string:1"]);
  assert.deepEqual([...result.index[0]], [0, 1, 2, 3, -1, -1]);
  assert.deepEqual([...result.index[1]], [1, -1, 0, -1, 2, 3]);
  assert.equal(result.connections, 6);
  assert.equal(result.missing, 4);
  // Missing and nonfinite keys never match, even each other.
  const gaps = matchEndpoints([
    { label: "a", keys: [null, NaN, 5] },
    { label: "b", keys: [NaN, null, 5] },
  ], { key: "id" });
  assert.deepEqual(gaps.keys, ["number:5"]);
  assert.deepEqual([...gaps.index[0]], [2]);
  assert.deepEqual([...gaps.index[1]], [2]);
});

test("duplicate keys are errors, never joins", () => {
  throwsText(() => matchEndpoints([{ label: "before", keys: ["a", "b", "a"] }, { label: "after", keys: ["a"] }], { key: "id" }),
    duplicateKeyError("a", "before"));
  assert.equal(duplicateKeyError("a", "before"), 'connect: duplicate key "a" in endpoint "before"; one endpoint per key per slot.');
  assert.equal(duplicateKeyError(7, "x"), 'connect: duplicate key 7 in endpoint "x"; one endpoint per key per slot.');
  // A key column the slot does not have.
  throwsText(() => matchEndpoints([{ label: "a", keys: null, available: ["x", "y"] }, { label: "b", keys: [] }], { key: "id" }),
    'connect: endpoint "a" has no column "id"; available: x, y.');
  assert.equal(missingKeyColumnError("a", "id"), 'connect: endpoint "a" has no column "id".');
});

test("implicit matching joins one table's observations and rejects the rest", () => {
  const owner = { id: "penguins" };
  const result = matchEndpoints([
    { label: "before", owner, tokens: ["row:0", "row:1", "row:2"] },
    // A sorted and filtered view of the same table.
    { label: "after", owner, tokens: ["row:2", "row:0"] },
  ], { kind: "Arrows3D" });
  assert.deepEqual(result.keys, ["row:0", "row:1", "row:2"]);
  assert.deepEqual([...result.index[1]], [1, -1, 0]);
  throwsText(() => matchEndpoints([{ label: "a", owner, tokens: [] }, { label: "b", owner: { id: "other" }, tokens: [] }], { kind: "Arrows3D" }),
    differentTablesError("Arrows3D", "a", "b"));
  assert.equal(differentTablesError("Arrows3D", "a", "b"),
    'Arrows3D.connections: endpoints "a" and "b" come from different tables; pass key= to match them.');
  throwsText(() => matchEndpoints([{ label: "bars", owner, aggregate: true, kind: "Prism", tokens: null }, { label: "b", owner, tokens: [] }], { kind: "Line" }),
    aggregateEndpointError("Line", "bars", "Prism"));
  assert.equal(aggregateEndpointError("Line", "bars", "Prism"),
    'Line.connections: "bars" is an aggregate (Prism) whose rows have no single source observation; pass key= naming a group column. To draw a line or arc per row between two places (flight routes), Segments(start=[x0, y0], end=[x1, y1]) draws each row\'s own ends with no connection (curve= bends them; interpolation="great-circle" on a map).');
  throwsText(() => matchEndpoints([{ label: "a", owner: null, tokens: null }, { label: "b", owner, tokens: [] }], { kind: "Line" }),
    noTableError("Line", "a"));
  throwsText(() => matchEndpoints([{ label: "folded", owner, tokens: ["row:0", "row:0"] }, { label: "b", owner, tokens: [] }]),
    duplicateObservationError("folded"));
  // Tokens not published yet: pending, not an error.
  assert.deepEqual(matchEndpoints([{ label: "a", owner, tokens: null }, { label: "b", owner, tokens: [] }]), { pending: true });
});

test("matching boundary inputs: empty slots, one row, all missing", () => {
  const empty = matchEndpoints([{ label: "a", keys: [] }, { label: "b", keys: [] }], { key: "id" });
  assert.equal(empty.connections, 0);
  assert.deepEqual(empty.index.map((slot) => slot.length), [0, 0]);
  const one = matchEndpoints([{ label: "a", keys: [4] }, { label: "b", keys: [4] }], { key: "id" });
  assert.deepEqual(one.index.map((slot) => [...slot]), [[0], [0]]);
  assert.equal(one.missing, 0);
  const none = matchEndpoints([{ label: "a", keys: [1, 2] }, { label: "b", keys: [3] }], { key: "id" });
  assert.equal(none.missing, 3);
});

test("the match cache key ignores frame revisions", () => {
  const entry = (frame) => ({ definition: "Plot/Anchor 1", cell: { key: '["a",null]' }, revision: { data: 2, frame }, shown: { ownerId: "t" } });
  assert.equal(matchCacheKey([entry("f1")], { key: "id" }), matchCacheKey([entry("f2")], { key: "id" }));
  assert.notEqual(matchCacheKey([entry("f1")], { key: "id" }), matchCacheKey([entry("f1")], { key: "k" }));
  const moved = { ...entry("f1"), revision: { data: 3, frame: "f1" } };
  assert.notEqual(matchCacheKey([entry("f1")]), matchCacheKey([moved]));
});

test("slots: explicit arguments take one entry each; one repeated endpoint alone expands in cell order", () => {
  const e = (name, ordinal, key = String(ordinal)) => ({ name, definition: `Plot/*/${name}`, cell: { key, ordinal } });
  const a = { handle: handle() }, b = { handle: handle() };
  const explicit = slotSequence([a, b], [[e("before", [0])], [e("after", [0])]]);
  assert.deepEqual(explicit.slots.map((slot) => slot.label), ["before", "after"]);
  assert.equal(explicit.slots[0].endpoint, a);
  // Row-major facet cells registered out of order come back in ordinal order, with or without
  // order="facet".
  const cells = [e("values", [1, 0]), e("values", [0, 1]), e("values", [0, 0]), e("values", [1, 1])];
  for (const order of [undefined, "facet"]) {
    const facet = slotSequence([a], [cells], { order });
    assert.deepEqual(facet.slots.map((slot) => slot.entry.cell.ordinal), [[0, 0], [0, 1], [1, 0], [1, 1]]);
  }
  // A repeated endpoint among others is an error that says to pass it alone.
  throwsText(() => slotSequence([a, b], [cells, [e("after", [0])]]), repeatedEndpointError("values", 4));
  assert.equal(repeatedEndpointError("values", 4),
    'connect: "values" is repeated in 4 facet cells; pass it alone (the only endpoint) to connect the cells in facet order.');
  assert.equal(repeatedEndpointError("tip", 2, "partition"),
    'connect: "tip" is repeated in 2 Partition groups; pass it alone (the only endpoint) to connect the groups in group order.');
  assert.equal(repeatedEndpointError("tip", 4, "both"),
    'connect: "tip" is repeated in 4 facet cells and Partition groups; pass it alone (the only endpoint) to connect them in facet order.');
  throwsText(() => slotSequence([a, b], [cells, cells], { order: "facet" }), CONNECT_ORDER_ARITY_ERROR);
  // One mark that no Facet or Partition repeats has nothing to connect to, order or not; the
  // message does not mention cells it is not in.
  const single = { name: undefined, label: "Sprites 1", definition: "Plot/Frame/Sprites 1", cell: null };
  for (const order of [undefined, "facet"]) throwsText(() => slotSequence([a], [[single]], { order }), singleEndpointError("Sprites 1"));
  assert.equal(singleEndpointError("Sprites 1"),
    'connect: "Sprites 1" is a single mark, so it has nothing to connect to; pass two or more endpoints, or one mark repeated by a Facet or Partition.');
  assert.ok(!isRepeated([single]) && isRepeated(cells));
  // Two mounts of one definition in one cell (unnamed marks in repeated Frames inside a cell).
  throwsText(() => endpointSlots(a, [...cells, e("values", [0, 0])], { alone: true }), repeatedMountError("values"));
  assert.equal(repeatedMountError("values"), 'connect: "values" is mounted more than once in one facet cell; give each mount its own name.');
  assert.equal(repeatedMountError("tip", "partition"), 'connect: "tip" is mounted more than once in one Partition group; give each mount its own name.');
  // Messages name how a definition repeats: facet cells, Partition groups, or both.
  const group = (facet) => ({ cell: { key: "g", ordinal: [0], facet: facet ? { key: "c" } : null, partition: { key: "g" } } });
  assert.equal(repetition(cells), "facet");
  assert.equal(repetition([group(false)]), "partition");
  assert.equal(repetition([group(true)]), "both");
  // Pending until every endpoint has at least one mount.
  assert.deepEqual(slotSequence([a, b], [[e("before", [0])], null]), { pending: true });
  assert.deepEqual(slotSequence([a, b], [[e("before", [0])], []]), { pending: true });
  // A consumer inside one cell sees only that cell's mount of a repeated definition.
  const own = slotSequence([a, b], [cells, [e("after", [1, 1])]], { within: (entry) => entry.cell.key === "1,1" });
  assert.deepEqual(own.slots.map((slot) => slot.entry.cell.ordinal), [[1, 1], [1, 1]]);
  throwsText(() => slotSequence([a], [cells], { order: "facet", kind: "Line", within: () => false }), notInFrameError("Line", "values"));
  assert.equal(notInFrameError("Line", "values"),
    `Line.connections: endpoint "values" is not inside this Line's frame; mount the Line in a frame that contains every endpoint.`);
});

test("cell ordinals order outer cells before inner groups", () => {
  assert.ok(compareOrdinals([0], [1]) < 0);
  assert.ok(compareOrdinals([1, 0], [0, 5]) > 0);
  assert.ok(compareOrdinals([2], [2, 0]) < 0);
  assert.equal(compareOrdinals([], []), 0);
  assert.equal(compareOrdinals(undefined, []), 0);
});

test("endpoints must sit inside the consumer's frame", () => {
  const root = { frameDefinition: { parent: undefined } };
  const child = { frameDefinition: { parent: root } };
  const grandchild = { frameDefinition: { parent: child } };
  const sibling = { frameDefinition: { parent: root } };
  const otherView = { frameDefinition: { parent: undefined } };
  assert.ok(endpointAncestor(root, root));
  assert.ok(endpointAncestor(grandchild, root));
  assert.ok(endpointAncestor(grandchild, child));
  assert.ok(!endpointAncestor(child, grandchild));
  assert.ok(!endpointAncestor(sibling, child));
  assert.ok(!endpointAncestor(root, otherView));
  assert.ok(endpointAncestor(sibling, undefined));
  assert.equal(otherViewError("Arrows3D", "a"), 'Arrows3D.connections: endpoint "a" belongs to another Plot; connections stay within one Plot.');
});

test("layout: a Line path per connection with separators; segments per adjacent pair", () => {
  const index = [Int32Array.from([0, 1]), Int32Array.from([1, -1]), Int32Array.from([2, 0])];
  const path = connectionLayout("Line", index);
  assert.equal(path.kind, "path");
  assert.equal(path.rows, 7);
  assert.deepEqual([...path.slot], [0, 1, 2, -1, 0, 1, 2]);
  assert.deepEqual([...path.row], [0, 1, 2, -1, 1, -1, 0]);
  assert.deepEqual([...path.connection], [0, 0, 0, -1, 1, 1, 1]);
  // connect(a, b, c) gives two arrows per key, one head each.
  for (const kind of ["Segments", "Arrows3D", "Arrows"]) {
    const pairs = connectionLayout(kind, index);
    assert.equal(pairs.kind, "pairs");
    assert.equal(pairs.rows, 4);
    assert.deepEqual([...pairs.startSlot], [0, 1, 0, 1]);
    assert.deepEqual([...pairs.endSlot], [1, 2, 1, 2]);
    assert.deepEqual([...pairs.startRow], [0, 1, 1, -1]);
    assert.deepEqual([...pairs.endRow], [1, 2, -1, 0]);
    assert.deepEqual([...pairs.connection], [0, 0, 1, 1]);
  }
  // Boundaries: no connections, one slot, one connection.
  assert.equal(connectionLayout("Line", [new Int32Array(0), new Int32Array(0)]).rows, 0);
  assert.equal(connectionLayout("Arrows3D", [Int32Array.from([0, 1])]).rows, 0);
  assert.equal(connectionLayout("Line", [Int32Array.from([3])]).rows, 1);
  assert.equal(connectionLayout("Line", []).rows, 0);
  throwsText(() => connectionLayout("Points", index), connectionsKindError("Points"));
});

test("an Anchor rejects every picking prop", () => {
  assert.deepEqual(anchorPickingProps({ x: "a", y: "b", respond: false, select: false }), []);
  assert.deepEqual(anchorPickingProps({ select: true, hover: {}, respond: "selected", onclick() {}, onpointerenter: () => {}, onclickData: 3 }),
    ["select", "hover", "respond", "onclick", "onpointerenter"]);
  assert.equal(ANCHOR_PICKING_ERROR,
    "Anchor has no geometry to pick; put select, hover, or brush on a visible mark and connect to it.");
});

test("remaining message texts", () => {
  assert.equal(duplicateEndpointNameError("Facet", "values", 2),
    'Facet.endpoint("values"): 2 endpoint definitions are named "values"; give each a unique name.');
  assert.equal(ambiguousFieldError("Line", "color", "species"),
    `Line.color: "species" is ambiguous across the endpoints' tables; use "source.species" or "target.species".`);
});
