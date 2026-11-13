import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import { asArray } from "./data.js";
import { deviceArray } from "./deviceParams.js";
import { planProgram } from "./programs.js";
import { LABEL_PAD, labelAtlas, labelFontRevision } from "./labelAtlas.js";
import { isForeignJax } from "./foreignJax.js";

const programs = new Map();
function textFields(_plan, { codes, widths }) {
  const valid = np.logicalAnd(codes.ref.greaterEqual(0), codes.ref.less(widths.shape[0]));
  const clean = np.where(valid, codes, -1);
  return { codes: clean.ref, widths: np.take(widths, np.maximum(clean, 0).astype(np.int32), 0) };
}
const same = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/**
 * One current text payload per mark. Coordinates and paint never enter its key. Immutable
 * dictionary codes compare by identity; host values compare copied contents, including
 * in-place edits. Pending uploads and the displayed atlas each retain a separate lease.
 */
export function createLabelPayload(makeAtlas = labelAtlas, fontRevision = labelFontRevision) {
  let current;
  return {
    prepare(text, count, font, limit, pad = LABEL_PAD) {
      if (text instanceof JaxArray || isForeignJax(text))
        throw Error("Text requires host strings/numbers or dictionary-encoded GPU text; convert numeric text explicitly.");
      const dictionary = Boolean(text?.categories);
      const values = dictionary ? text.categories.map(value => value == null ? "" : String(value))
        : (Array.isArray(text) ? text : Array(count).fill(text)).map(value => value == null ? "" : String(value));
      if (!dictionary && values.length !== count) throw Error("Text length must match positions.");
      const labels = dictionary ? values : [...new Set(values)];
      const source = dictionary && (text.codes instanceof JaxArray || isForeignJax(text.codes)) ? text.codes : null;
      const reusable = !dictionary || source || Array.isArray(text.codes) ||
        ArrayBuffer.isView(text.codes) && !(text.codes instanceof DataView);
      const contents = source || !reusable ? [] : dictionary ? Array.from(text.codes) : values;
      const revision = fontRevision();
      if (reusable && current && current.count === count && current.font === font && current.limit === limit && current.pad === pad &&
          current.revision === revision && current.source === source && current.dictionary === dictionary &&
          same(current.labels, labels) && same(current.contents, contents)) return current;

      let input, atlas, fields;
      try {
        if (dictionary) input = asArray(text.codes);
        else {
          const lookup = new Map(labels.map((value, i) => [value, i]));
          input = np.array(values.map(value => lookup.get(value)));
        }
        if (input.shape.length !== 1 || input.shape[0] !== count) throw Error("Text codes must match positions.");
        atlas = makeAtlas(labels, limit, font, pad);
        fields = planProgram(programs, {}, textFields)({ codes: input.ref,
          widths: deviceArray(atlas.widths.map(width => width / 64)) });
        let users = 1;
        const next = {
          count, font, limit, pad, revision, source, dictionary, labels, contents, atlas, ...fields,
          retain() {
            if (!users) throw Error("Cannot retain a disposed Text payload.");
            users++;
            let released = false;
            return { ...next, release() { if (!released) { released = true; next.release(); } } };
          },
          release() {
            if (--users) return;
            fields.codes.dispose(); fields.widths.dispose(); atlas.release();
          },
        };
        current?.release();
        return (current = next);
      } catch (error) {
        fields?.codes.dispose(); fields?.widths.dispose(); atlas?.release();
        throw error;
      } finally { input?.dispose(); }
    },
    dispose() { current?.release(); current = undefined; },
  };
}
