import { BufferedField } from "../utils/proputils.js";
import { ScalarType, ColorType, FieldType } from "./types.js";
import { Vector4 } from "three/webgpu";
import { vec4, reference } from "three/tsl";
import { MISSING_COLOR } from "../utils/colormap.js";
import { outlineAlpha } from "./outlines.js";

export function setGeoOutlineTranslucent(mark, value) {
  if (mark.geoOutlineTranslucent === value) return;
  mark.geoOutlineTranslucent = value;
  mark.refreshBlend();
}
class PaintType extends FieldType {
  get channels() {
    return 4;
  }
  getUniformData(v) {
    return new Vector4(1, 1, 1, 1);
  }
}
export function installGeoAppearance(mark, lines = false) {
  mark.options.ensure(
    "missingColor",
    new ColorType({ defaultValue: MISSING_COLOR, label: "Missing values" }),
  );
  // One missing color for a feature without a value and for a missing (NaN) value: missingColor
  // when given, else the fill scale's `missing`, else the theme's (TODO 73.3). Which one is read
  // is compiled in: setting or clearing missingColor rebuilds.
  let explicit = mark.options.isExplicit("missingColor");
  // "vec3": the options hold colors as vectors (a "color" reference read them as black).
  mark.missingColorNode = () => reference(explicit || !mark.options.has("valueMissing") ? "missingColor" : "valueMissing",
    "vec3", mark.options.transformed);
  mark.unregister?.push(mark.options.on(() => {
    if (explicit === mark.options.isExplicit("missingColor")) return;
    explicit = !explicit;
    mark.build();
    mark.invalidate();
  }, "missingColor"));
  const original = mark.getColorNode.bind(mark);
  mark.getColorNode = (value) => {
    let color = original(value);
    const present = lines ? mark.geoPaintNode?.w.mod(2) : mark.geoPresentNode;
    if (present)
      color = present
        .toVarying()
        .greaterThan(0)
        .select(color, vec4(mark.missingColorNode(), color.a));
    if (lines && mark.geoPaintNode)
      color = mark.geoPaintNode.w
        .toVarying()
        .greaterThanEqual(2)
        .select(vec4(mark.geoPaintNode.rgb, color.a.mul(outlineAlpha(mark.geoOutlineOpacityNode ?? reference("outlineOpacity", "float", mark.options.transformed)))), color);
    return color;
  };
  if (lines) {
    const blended = mark.blended.bind(mark);
    mark.blended = () => blended() || !!mark.geoOutlineTranslucent;
    mark.options.ensure("outlineOpacity", new ScalarType({defaultValue:1,min:0,max:1}));
    mark.manager.registerField(new BufferedField(new ScalarType({defaultValue:1,targetNodes:["geoOutlineOpacityNode"]}),
      mark, {onDirty:()=>mark.build()}), "geoOutlineOpacity");
    mark.manager.registerField(
      new BufferedField(
        new PaintType({ targetNodes: ["geoPaintNode"] }),
        mark,
        { onDirty: () => mark.build() },
      ),
      "geoPaint",
    );
  } else {
    mark.manager.registerField(
      new BufferedField(
        new ScalarType({ targetNodes: ["geoPresentNode"] }),
        mark,
        { onDirty: () => mark.build() },
      ),
      "geoPresent",
    );
    mark.manager.registerField(
      new BufferedField(
        new ColorType({ targetNodes: ["outlineColorNode"] }),
        mark,
        { onDirty: () => mark.build() },
      ),
      "geoOutlineColor",
    );
    mark.manager.registerField(
      new BufferedField(
        new ScalarType({ targetNodes: ["outlineWidthNode"] }),
        mark,
        { onDirty: () => mark.build() },
      ),
      "geoPointOutline",
    );
  }
  mark.build();
}
