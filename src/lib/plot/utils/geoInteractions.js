import {
  interactionResource,
  interactionRows,
  responseResources,
} from "./interaction.js";
import { installMarkInteractionEvents } from "../binding/markInteractionEvents.js";
import { createMarkTooltip } from "./markTooltip.js";
import { defaultFields, tooltipSetting } from "./tooltip.js";
import { emptyBinding } from "./markBinding.js";
import { startFeedbackOpacity } from "./feedbackOpacity.js";
import { inputWriter, writerType, writerLabel, checkHoverLoop } from "./inputWriters.js";

/** Adapt feature rows to the common mark interaction controllers. Mesh instance indices
 * stay private to each draw family; shared selections and tooltips see one feature row.
 * The accepted GeoJSON frame owns this adapter and its retained feature scope.
 */
export function geoInteractions({
  scope,
  props,
  marks,
  featureIndex,
  view,
  plotDefault,
  legend,
  guideMark,
  report,
  writers = null,
}) {
  const owner = scope.identity;
  // An input a click or a hover on a feature writes (TODO 145.2): its column's value at the
  // feature's row. The component keeps the registrations (writers.hold) across preparations.
  const selectWriter = inputWriter(props.select, "GeoJSON", "select");
  const hoverWriter = inputWriter(props.hover, "GeoJSON", "hover");
  if ((selectWriter || hoverWriter) && !writers?.store)
    throw Error(`GeoJSON: ${selectWriter ? "select" : "hover"} writes the input "${(selectWriter ?? hoverWriter)?.name}", so it needs an input context around it: an InputContext, or a Python Scene.`);
  if (hoverWriter) checkHoverLoop(scope, hoverWriter, "GeoJSON");
  for (const [role, writer] of /** @type {const} */ ([["select", selectWriter], ["hover", hoverWriter]]))
    if (writer)
      writers.hold(`${role}:${writer.name}`, writers.store.share(writer.name, writers.owners[role], {
        label: writerLabel("GeoJSON", role, writer), given: writer.given, type: writerType(scope, writer, "GeoJSON", role),
      }));
  const setting = tooltipSetting(
    props.tooltip,
    plotDefault(),
    "GeoJSON.tooltip",
  );
  const hover = hoverWriter ? null : interactionResource(scope, props.hover, "hover");
  const nearest = interactionResource(scope, Boolean(setting), "nearest");
  const interaction = {
    revisions: { selection: 0, hover: 0, nearest: 0 },
    owner,
    generation: owner.generation,
    scope,
    dataScope: scope,
    hover,
    nearest,
    respond: props.respond,
    selectionOpacity: props.selectionOpacity ?? 0.25,
  };
  let alive = true,
    tooltipRevision = 0;
  const tooltips = createMarkTooltip({
    kind: "GeoJSON",
    view,
    plotDefault,
    axisMeta: () => undefined,
    shown: () => null,
    mark: () => marks.faces,
  });
  const fields = setting && (setting.fields ?? defaultFields(props, scope));
  const target = setting ? { resource: owner.tooltip, owner, scope } : null;
  const events = { ...props };
  installMarkInteractionEvents(events, {
    owner,
    scope,
    selection: null,
    hover,
    nearest,
    writers: writers && {
      select: selectWriter,
      hover: hoverWriter,
      store: writers.store,
      owners: writers.owners,
      valueAt: (event, column) => tooltips.valueAt(event, scope, column),
    },
    picksNearest: Boolean(setting),
    binding: () => (alive ? interaction : null),
    rows: async (event) =>
      (await interactionRows(scope, [event.rowIndex])).filter(
        (row) => row >= 0,
      ),
    tooltip: {
      show: async (event) => {
        const revision = ++tooltipRevision;
        try {
          const [sourceRow] = await interactionRows(scope, [event.rowIndex]);
          if (!alive || revision !== tooltipRevision) return;
          await tooltips.show(
            { ...event, ...(scope.aggregate ? {} : { sourceRow }) },
            setting,
            fields,
            scope,
            props,
            sourceRow >= 0 ? target : null,
          );
        } catch (error) {
          if (alive) report(error);
        }
      },
      leave: () => {
        tooltipRevision++;
        tooltips.hide();
      },
    },
  });
  const releases = [];
  const feedback = responseResources(interaction).length > 0;
  for (const [family, mark] of Object.entries(marks)) {
    // Geometry already uploaded this feature-index buffer. Retain it only when
    // feedback needs to expand feature membership into mesh instances.
    const index = feedback ? featureIndex(family) : null;
    const entry = { props, interaction, interactionIndex: index };
    releases.push(
      view.marks.publish(
        mark,
        emptyBinding({
          kind: "GeoJSON",
          interaction,
          pickArea: family === "faces",
          nearest: setting ? { radius: setting.radius ?? 16 } : null,
          legend: mark === guideMark ? legend : null,
          tooltip: setting
            ? { series: tooltips.series, clear: tooltips.clear }
            : null,
          retain: () => scope.retain(),
        }),
      ),
    );
    const stop = startFeedbackOpacity({ kind: "GeoJSON", mark, entry, report });
    releases.push(() => {
      stop?.();
      index?.dispose();
    });
  }
  return {
    events,
    dispose({ keepPreview = false } = {}) {
      alive = false;
      if (!keepPreview) {
        hover?.cancelPreview(owner);
        nearest?.cancelPreview(owner);
      }
      interaction.revisions.hover++;
      interaction.revisions.nearest++;
      tooltips.hide();
      releases.forEach((release) => release());
    },
  };
}
