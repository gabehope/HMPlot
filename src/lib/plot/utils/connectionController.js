// @ts-check
// Connection consumers behind one controller (TODO 126.1). Owner: connections. namedMark creates
// one per mount (`createConnectionController(mount)`), beside its endpointController, and asks it
// what a connection-backed mark draws; it names no connection module. The controller:
//   reads the mark's `connections` descriptor, its options and the frame on screen;
//   resolves, matches and gathers the endpoints (connectionPrepare.js's consumer, through the
//     view's endpoint registry) and reports each state to the mount (`onState`);
//   checks a preparation's props (`check`, `resolve`), attaches the resolved rows to the prepared
//     frame (`attach`), and keeps the drawn rows on the endpoints' live positions after each
//     publish (`publish`, connectionGather.js's live gather) and once per frame (`frame`).
// Released when the mark unmounts (`release`). A kind that cannot consume connections gets a
// controller that draws nothing: `resolve` rejects its `connections` (and `check` still checks an
// Anchor's picking props).
import { tick, untrack } from "svelte";
import {
  ANCHOR_PICKING_ERROR,
  anchorPickingProps,
  CONNECTION_CHANNELS,
  isConnect,
  isConnectionKind,
  connectionsKindError,
  connectionsChannelError,
  connectionsValueError,
  connectionsSeriesError,
  sphericalConnectionsError,
  ambiguousFieldError,
} from "./connections.js";
import {
  createConnectionConsumer,
  connectionEvent,
  onGlobe,
} from "./connectionPrepare.js";
import { createLiveGather } from "./connectionGather.js";
import { endpointRegistry } from "./endpointRegistry.js";
import { expressionFields, isExpression } from "./expressions.js";
import { spherical } from "./coordinates.js";
import { NAMED_FIELDS } from "./namedData.js";

/**
 * @typedef {import("./markPlanTypes.js").ConnectionState} ConnectionState
 * @typedef {import("./markPlanTypes.js").PreparedConnection} PreparedConnection
 * @typedef {import("./internalTypes.js").PreparedMark} PreparedMark
 * @typedef {import("../binding/markInteractionEvents.js").MarkPickEvent} MarkPickEvent
 * @typedef {{ getMark?: () => any }} MarkChild
 */

/**
 * One mark mount's connection consumer.
 * @param {{
 *   kind: string,
 *   renderer: import("./internalTypes.js").PlotRenderer,
 *   view: any,
 *   options: any,
 *   frameOptions: () => any,
 *   isAlive: () => boolean,
 *   onState: (state: ConnectionState | null) => void,
 *   track: <T>(work: Promise<T>) => Promise<T>,
 *   report: (error: unknown) => void,
 *   prepared: () => unknown,
 * }} mount
 */
export function createConnectionController(mount) {
  const {
    kind,
    renderer,
    view,
    options,
    frameOptions,
    isAlive,
    onState,
    track,
    report,
  } = mount;
  const consumer = isConnectionKind(kind);
  /** @type {ReturnType<typeof createConnectionConsumer>|null} */
  let connectionConsumer = null;
  /** @type {(ReturnType<typeof createLiveGather> & {mark?: any})|null} */
  let liveGather = null;
  let stateSet = false;
  const stop = () => {
    connectionConsumer?.dispose();
    connectionConsumer = null;
    liveGather?.dispose();
    liveGather = null;
  };
  return {
    /** Whether this kind consumes connections (Line, Segments, Arrows3D, Arrows). */
    consumer,
    /**
     * The mark's `connections` changed: start, update or stop the consumer.
     * @param {unknown} descriptor
     */
    update(descriptor) {
      if (!consumer || !isConnect(descriptor)) {
        stop();
        if (stateSet) {
          stateSet = false;
          onState(null);
        }
        return;
      }
      connectionConsumer ??= createConnectionConsumer({
        kind,
        renderer,
        view,
        registry: endpointRegistry(renderer),
        frameOptions,
        options,
        onState: (/** @type {ConnectionState} */ state) => {
          if (!isAlive()) return;
          stateSet = true;
          onState(state);
        },
        track,
        settle: () => tick(),
        live: { frameChanged: () => liveGather?.frameChanged() ?? false },
      });
      connectionConsumer.update(descriptor);
    },
    /**
     * An Anchor takes no picking props: its connectors pick.
     * @param {Record<string, unknown>} props
     */
    check(props) {
      if (kind === "Anchor" && anchorPickingProps(props).length)
        throw Error(ANCHOR_PICKING_ERROR);
    },
    /**
     * What a preparation draws: undefined for a mark without `connections`, null while pending
     * (nothing resolved yet, or keep what is on screen), or the resolved rows. Throws a
     * misuse or the consumer's error. Inherited positions (a Mapping's x and y) are dropped
     * from `props`: they give way to the endpoints.
     * @param {Record<string, any>} props
     * @param {(channel: string) => boolean} explicit whether a channel was set on the mark itself
     * @param {() => ConnectionState | null} currentState the consumer's last reported state, read only
     *   once the checks pass (a misuse does not rerun on each state)
     * @returns {PreparedConnection | null | undefined}
     */
    resolve(props, explicit, currentState) {
      if (props.connections === undefined || props.connections === null)
        return undefined;
      if (!consumer) throw Error(connectionsKindError(kind));
      if (
        CONNECTION_CHANNELS.some(
          (key) => props[key] !== undefined && explicit(key),
        )
      )
        throw Error(connectionsChannelError(kind));
      if (!isConnect(props.connections))
        throw Error(connectionsValueError(kind));
      if (props.series !== undefined) throw Error(connectionsSeriesError(kind));
      if (untrack(() => spherical(options) && !onGlobe(options)))
        throw Error(sphericalConnectionsError(kind));
      const state = currentState();
      if (state?.error) throw state.error;
      if (!state?.result) return null;
      const connection = state.result;
      for (const key of CONNECTION_CHANNELS) delete props[key];
      for (const [channel, value] of Object.entries(props)) {
        if (!NAMED_FIELDS.has(channel)) continue;
        const read =
          typeof value === "string"
            ? [value]
            : isExpression(value)
              ? [...expressionFields(value)]
              : [];
        for (const field of read)
          if (connection.scope.ambiguous(field))
            throw Error(ambiguousFieldError(kind, channel, field));
      }
      return connection;
    },
    /**
     * The prepared frame holds its own references to the connection result's arrays and scope,
     * and its pointer events carry the picked connection (and, for a shared owner, the source row).
     * @param {PreparedMark} next
     * @param {PreparedConnection} connection
     */
    attach(next, connection) {
      const arrays = [
        ...Object.values(connection.props),
        ...Object.values(connection.offsets ?? {}),
        connection.interactionIndex,
        ...(connection.live?.slots ?? []).map((slot) => slot.fraction),
      ]
        .filter(Boolean)
        .map((array) => /** @type {any} */ (array).ref);
      const releaseScope = connection.scope.retain();
      next.own(
        () => {
          arrays.forEach((array) => array.dispose());
          releaseScope();
        },
        { after: true },
      );
      // On a 2D globe the endpoints arrive in its longitude and latitude and map like any
      // spherical path (great circles, cut at the horizon); elsewhere they are world points.
      next.props.positionSpace = untrack(() => onGlobe(options))
        ? undefined
        : "world";
      Object.assign(next.props, connection.offsets ?? {});
      if (connection.interactionIndex)
        next.interactionIndex = connection.interactionIndex;
      next.connections = connection;
      const withConnection = (/** @type {MarkPickEvent} */ event) => {
        const payload = connectionEvent(connection, event?.instanceId);
        if (!payload) return event;
        return {
          ...event,
          connection: payload,
          ...(connection.shared ? { rowIndex: payload.ownerRow } : {}),
        };
      };
      for (const [key, handler] of Object.entries(next.props))
        if (
          /^on(pointer|click|dblclick|contextmenu|nearest)/.test(key) &&
          typeof handler === "function"
        )
          next.props[key] = (/** @type {MarkPickEvent} */ event) =>
            handler(withConnection(event));
    },
    /**
     * Hand a published connection frame to the live gather inside the mark's upload chain, after
     * the frame's own rows were written: the gather then re-reads the endpoints' live rows, so an
     * endpoint caught mid-animation never shows its connector at the target first. Returns the
     * cancel for a frame superseded before it runs.
     * @param {PreparedMark} prepared
     * @param {MarkChild} child
     */
    publish(prepared, child) {
      let canceled = false;
      tick().then(() => {
        const mark = child.getMark?.();
        if (canceled || !isAlive() || !mark?.manager || mark.isDisposed) return;
        if (!liveGather || liveGather.mark !== mark) {
          liveGather?.dispose();
          liveGather = createLiveGather(mark, { report });
          liveGather.mark = mark;
        }
        const gather = liveGather;
        mark.manager.enqueue(
          async () => {
            if (
              canceled ||
              !isAlive() ||
              gather !== liveGather ||
              mount.prepared() !== prepared
            )
              return;
            await gather.configure(prepared.connections);
            gather.dispatch();
          },
          report,
          true,
        );
      });
      return () => {
        canceled = true;
      };
    },
    /** A 3D world-size placement moves without an option event: look once per frame. */
    frame() {
      if (liveGather?.placed) liveGather.checkPlacements();
    },
    release: stop,
  };
}
