import {
  FieldType,
  SelectType,
  BooleanType,
  ScalarType,
  IntegerType,
} from "../objects/types.js";
import { axisDefaults, axisKey } from "./axes.js";
export function ensureAxisOptions(node) {
  for (const axis of ["x", "y", "z"])
    for (const [key, defaultValue] of Object.entries(axisDefaults)) {
      let type;
      if (key === "type")
        type = new SelectType({
          defaultValue,
          options: { Numeric: "numeric", Datetime: "datetime" },
        });
      else if (key === "grid")
        type = new SelectType({
          defaultValue,
          options: {
            Off: "off",
            Major: "major",
            "Major + minor": "major-minor",
          },
        });
      else if (key === "tickDirection")
        type = new SelectType({ defaultValue, options: { Outside: "outside", Inside: "inside", Both: "both" } });
      else if (key === "arrow")
        type = new SelectType({ defaultValue, options: { None: "none", Start: "start", End: "end", Both: "both" } });
      else if (key === "labelOverlap")
        type = new SelectType({ defaultValue, options: { "Hide overlaps": "hide", "Show all": "show" } });
      else if (key === "tickLabelAlign")
        type = new SelectType({ defaultValue, options: { Automatic: "auto", Start: "start", Middle: "middle", End: "end" } });
      else if (key === "tickLabelPlacement" || key === "titlePlacement")
        type = new SelectType({ defaultValue, options: { Outside: "outside", Inside: "inside" } });
      else if (key === "titlePosition")
        type = new SelectType({ defaultValue, options: { Start: "start", Middle: "middle", End: "end" } });
      else if (key === "titleAngle")
        type = new FieldType({ defaultValue, ui: { ui: "text" }, transform: (value) => value === "auto" ? value : Number(value) });
      else if (key === "gridDash")
        type = new FieldType({ defaultValue, ui: { ui: "dash" } });
      else if (key === "breaks")
        type = new FieldType({ defaultValue, ui: { ui: "none" } });
      else if (typeof defaultValue === "boolean")
        type = new BooleanType({ defaultValue });
      else if (key === "subdivisions" || key === "tickCount")
        type = new IntegerType({ defaultValue, min: key === "subdivisions" ? 2 : 0, step: 1 });
      else if (key === "titleFontWeight")
        type = new ScalarType({ defaultValue, min: 1, max: 1000, step: 1 });
      else if (key === "lineWidth" || key === "tickSize" || key === "gridWidth")
        type = new ScalarType({ defaultValue, min: 0, max: 6, step: 0.25 });
      else if (key === "padding")
        type = new ScalarType({ defaultValue, min: 0, max: 1, step: 0.01 });
      else if (typeof defaultValue === "number")
        type = new ScalarType({
          defaultValue,
          ...(["step", "minorStep", "tickWidth", "arrowSize", "tickLabelOffset", "titleOffset"].includes(key) ? { min: 0 } : {}),
          step: key === "timeOrigin" ? 1 : 0.1,
        });
      else type = new FieldType({ defaultValue, ui: { ui: "text" } });
      node.ensure(axisKey(axis, key), type);
    }
  node.ensure(
    "referenceRules",
    new FieldType({ defaultValue: [], ui: { ui: "rules" } }),
  );
  node.ensure(
    "referenceBands",
    new FieldType({ defaultValue: [], ui: { ui: "bands" } }),
  );
}
