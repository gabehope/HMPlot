/**
 * Text format="axis" (TODO 130.1): a label whose text is a view-state field of an axis (the
 * pointer, @pointer_x, or an edge of the visible domain, @view_y_min) shows that value as the
 * axis's readout writes it, finer than the ticks: what Crosshair's readouts show. "@pointer" writes
 * both of the pointer's, "x, y" (Crosshair's label beside the pointer, TODO 130.3). The value is
 * read and written on the host as the pointer moves or the view changes (utils/framePointer).
 */
import { framePointer } from "./framePointer.svelte.js";
import { literal } from "./names.js";
import { axisField } from "./viewState.js";
import { textFormat } from "./numericText.js";

/**
 * Call as a mark initializes. `kind` is the mark's kind, `props()` its props. Returns
 * `apply(values)`: the props as the mark draws them, format="axis" replaced by the formatted
 * text (a constant), any other format (a d3-format string or a %-pattern, TODO 143.6) passed to
 * the labels as how their numbers are written, and format checked; marks other than Text pass
 * through.
 * @param {string} kind @param {() => Record<string, any> | null | undefined} props
 */
export function axisText(kind, props) {
  if (kind !== "Text") return { apply: (values) => values };
  // Only a change of text or format (not of the other props) restarts the subscription.
  const reads = $derived(props()?.format === "axis" && (props()?.text === "@pointer" || axisField(props()?.text) !== null));
  const pointer = framePointer({ enabled: () => reads });
  return {
    /** @param {Record<string, any>} values */
    apply(values) {
      if (values?.format === undefined) return values;
      const { format, ...rest } = values;
      if (textFormat(format) !== "axis") return { ...rest, _textFormat: format };
      if (rest.text === "@pointer")
        return { ...rest, text: literal([pointer.format("x", pointer.x), pointer.format("y", pointer.y)].filter(Boolean).join(", ")) };
      const reading = axisField(rest.text);
      if (!reading)
        throw Error(`Text format="axis" writes an axis's value: text names @pointer_x, @pointer_y, @view_x_min, @view_x_max, @view_y_min or @view_y_max, or @pointer for both of the pointer's; received ${JSON.stringify(rest.text)}.`);
      return { ...rest, text: literal(pointer.format(reading.axis, reading.read(pointer))) };
    },
  };
}
