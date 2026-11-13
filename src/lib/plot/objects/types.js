import { TRANSFORM_NAMES } from "../utils/scaleTransforms.js";
import * as THREE from "three/webgpu";
import { reference } from "three/tsl";
import { numpy as np } from "@hmplot/jax";
import { shapeNames } from "../utils/shapes.js";
import {
  COLOR_SCALE_MAP,
  COLOR_SCALE_NAMES,
  registerColormap,
} from "../../threeExtensions/materials/colormaps.js";

const identity = (value) => value;

function labelFromName(name) {
  return String(name)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function isArrayLike(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

function isVectorLiteral(value) {
  return isArrayLike(value) && !isArrayLike(value[0]);
}

function vectorClassForDimensions(dimensions) {
  if (dimensions === 2) return THREE.Vector2;
  if (dimensions === 3) return THREE.Vector3;
  if (dimensions === 4) return THREE.Vector4;
  throw new Error(`Unsupported vector dimensions: ${dimensions}`);
}

function vectorUniformType(dimensions) {
  return dimensions === 1 ? "float" : `vec${dimensions}`;
}

function vectorFromComponents(dimensions, components) {
  const VectorClass = vectorClassForDimensions(dimensions);
  const values = Array.from(
    { length: dimensions },
    (_, index) => components[index] ?? 0,
  );
  return new VectorClass(...values);
}

function colorVectorFromValue(value) {
  if (value instanceof THREE.Vector3) return value;
  // A hollow point's fill (Points fill="transparent", TODO 64): its alpha is the shader's, and
  // three.js does not parse the name.
  if (value === "transparent") return new THREE.Vector3(0, 0, 0);
  const color = value instanceof THREE.Color ? value : new THREE.Color(value);
  return new THREE.Vector3(color.r, color.g, color.b);
}

class FieldType {
  constructor(params = {}) {
    this.isFieldType = true;
    this.defaultValue =
      params.defaultValue !== undefined
        ? params.defaultValue
        : this.defaultDefaultValue;
    this.label = params.label ?? labelFromName(this.name);
    this.targetNodes = params.targetNodes ?? this.defaultTargetNodes;
    this.transform = params.transform ?? this.defaultTransform;
    this.uiSpec = params.ui ?? null;
  }

  get name() {
    return "field";
  }

  get channels() {
    return 1;
  }

  get defaultDefaultValue() {
    return 0;
  }

  get defaultTargetNodes() {
    return [];
  }

  get defaultTransform() {
    return identity;
  }

  get canBeBuffer() {
    return true;
  }

  get uniformType() {
    return vectorUniformType(this.channels);
  }

  isUniformType(data) {
    return (
      typeof data === "number" ||
      typeof data === "string" ||
      typeof data === "boolean" ||
      data instanceof THREE.Color ||
      data instanceof THREE.Vector2 ||
      data instanceof THREE.Vector3 ||
      data instanceof THREE.Vector4
    );
  }

  getUniformData(data, stash) {
    return this.transform(data, stash);
  }

  validateShape(data) {
    return this.validateLastDimension(data, [this.channels]);
  }

  validateLastDimension(data, allowedChannels) {
    if (data.shape.length > 2) {
      throw new Error(
        `${this.name} data must have shape [N] or [N, ${allowedChannels.join(
          "|",
        )}], but got ${data.shape}`,
      );
    }

    const channels = data.shape.length <= 1 ? 1 : data.shape[1];
    if (!allowedChannels.includes(channels)) {
      throw new Error(
        `${this.name} data must have ${allowedChannels.join(" or ")} channel(s), but got shape ${data.shape}`,
      );
    }
    if (data.shape.length <= 1) data = data.reshape([-1, 1]);

    return data;
  }

  setNode(target, node) {
    for (const targetNode of this.targetNodes) {
      target[targetNode] = node;
    }
  }

  ui() {
    if (this.uiSpec === false) return {};
    if (this.uiSpec) return { label: this.label, ...this.uiSpec };
    return {};
  }

  optionDefinition() {
    return {
      defaultValue: this.defaultValue,
      spec: this.ui(),
      transform: this.transform,
    };
  }
}

class ScalarType extends FieldType {
  constructor(params = {}) {
    super(params);
    this.min = params.min;
    this.max = params.max;
    this.step = params.step;
  }

  get defaultDefaultValue() {
    return 0;
  }

  get defaultTransform() {
    return (value) => Number(value);
  }

  isUniformType(data) {
    return typeof data === "number";
  }

  ui() {
    if (this.uiSpec === false) return {};
    return {
      ui: "slider",
      label: this.label,
      min: this.min ?? 0,
      max: this.max ?? 1,
      step: this.step ?? 0.01,
      ...this.uiSpec,
    };
  }
}

class IntegerType extends ScalarType {
  get uniformType() {
    return "int";
  }

  get defaultTransform() {
    return (value) => Math.round(Number(value));
  }

  ui() {
    return {
      ...super.ui(),
      step: this.step ?? 1,
    };
  }
}

class ValueType extends ScalarType {
  constructor(params = {}) {
    super({
      min: 0,
      max: 1,
      step: 0.01,
      targetNodes: ["valueNode"],
      ...params,
    });
  }

  get name() {
    return "value";
  }
}

class OpacityType extends ScalarType {
  constructor(params = {}) {
    super({
      defaultValue: 1,
      min: 0,
      max: 1,
      step: 0.01,
      targetNodes: ["transparentNode", "opacityNode"],
      ...params,
    });
  }

  get name() {
    return "opacity";
  }
}

class WidthType extends ScalarType {
  constructor(params = {}) {
    super({
      defaultValue: 1,
      min: 0,
      max: 20,
      step: 0.1,
      targetNodes: ["widthNode", "lineWidthNode"],
      ...params,
    });
  }

  get name() {
    return "width";
  }
}

class CountType extends IntegerType {
  constructor(params = {}) {
    super({
      min: 0,
      max: 100000,
      step: 1,
      ...params,
    });
  }

  get name() {
    return "count";
  }
}

class BooleanType extends FieldType {
  constructor(params = {}) {
    super({
      defaultValue: false,
      ...params,
    });
  }

  get name() {
    return "boolean";
  }

  get canBeBuffer() {
    return false;
  }

  get uniformType() {
    return "bool";
  }

  get defaultTransform() {
    return (value) => Boolean(value);
  }

  isUniformType(data) {
    return typeof data === "boolean";
  }

  ui() {
    if (this.uiSpec === false) return {};
    return {
      ui: "checkbox",
      label: this.label,
      ...this.uiSpec,
    };
  }
}

class SelectType extends FieldType {
  constructor(params = {}) {
    super(params);
    this.options = params.options ?? [];
  }

  get uniformType() {
    return null;
  }

  get canBeBuffer() {
    return false;
  }

  isUniformType(data) {
    return typeof data === "string";
  }

  ui() {
    if (this.uiSpec === false) return {};
    return {
      ui: "select",
      label: this.label,
      options: this.options,
      ...this.uiSpec,
    };
  }
}

const warnedColormaps = new Set();

class ColormapType extends SelectType {
  constructor(params = {}) {
    super({
      defaultValue: "Viridis",
      options: COLOR_SCALE_NAMES,
      ...params,
    });
  }

  get name() {
    return "colormap";
  }

  get uniformType() {
    return "int";
  }

  // Names and custom specs ({colors, space, positions} or a color array) resolve to a
  // colormap texture row; custom maps register on first use.
  get defaultTransform() {
    return (value) => {
      if (value === "" || value == null) return COLOR_SCALE_MAP.Viridis;
      try {
        return registerColormap(value);
      } catch (error) {
        // Runs every frame while the map is drawn: warn once per message. Marks also
        // report colormap overflow as a render error (BasePlotObject.watchColormapOverflow).
        if (!warnedColormaps.has(error.message)) {
          warnedColormaps.add(error.message);
          console.warn(`${error.message} Defaulting to Viridis.`);
        }
        return COLOR_SCALE_MAP.Viridis;
      }
    };
  }
}

class ShapeType extends SelectType {
  constructor(params = {}) {
    super({ defaultValue: "circle", ...params });
    // Built-in and registered shape names, read when the list is shown.
    if (!params.options) Object.defineProperty(this, "options", { get: shapeNames, set() {}, configurable: true });
  }

  get name() {
    return "shape";
  }
}

class Shape3DType extends SelectType {
  constructor(params = {}) {
    super({
      defaultValue: "sphere",
      options: ["sphere", "cube"],
      ...params,
    });
  }

  get name() {
    return "shape";
  }
}

class TransformType extends SelectType {
  constructor(params = {}) {
    super({
      defaultValue: "linear",
      options: [...TRANSFORM_NAMES],
      ...params,
    });
  }

  get name() {
    return "transform";
  }
}

class VectorType extends FieldType {
  constructor(params = {}) {
    super(params);
    this.dimensions = params.dimensions ?? this.defaultDimensions;
    this.allowedChannels = params.allowedChannels ?? [this.dimensions];
    this.padValue = params.padValue ?? 0;
    this.repeatScalar = params.repeatScalar ?? false;
  }

  get defaultDimensions() {
    return 3;
  }

  get channels() {
    return this.dimensions;
  }

  get uniformType() {
    return vectorUniformType(this.dimensions);
  }

  isUniformType(data) {
    const VectorClass = vectorClassForDimensions(this.dimensions);
    return (
      typeof data === "number" ||
      // A flat array longer than a vector holds one value per row.
      (isVectorLiteral(data) && data.length <= this.dimensions) ||
      data instanceof VectorClass ||
      data instanceof THREE.Vector2 ||
      data instanceof THREE.Vector3 ||
      data instanceof THREE.Vector4
    );
  }

  get defaultTransform() {
    return (value) => this.toVector(value);
  }

  toVector(value) {
    const VectorClass = vectorClassForDimensions(this.dimensions);
    if (value instanceof VectorClass) return value;

    if (typeof value === "number") {
      const components = this.repeatScalar
        ? Array(this.dimensions).fill(value)
        : [value];
      return vectorFromComponents(this.dimensions, components);
    }

    if (
      value instanceof THREE.Vector2 ||
      value instanceof THREE.Vector3 ||
      value instanceof THREE.Vector4
    ) {
      return vectorFromComponents(this.dimensions, [
        value.x,
        value.y,
        value.z,
        value.w,
      ]);
    }

    if (isVectorLiteral(value)) {
      return vectorFromComponents(this.dimensions, value);
    }

    throw new Error(`Cannot transform ${value} to ${this.uniformType}`);
  }

  validateShape(data, stash = {}) {
    data = this.validateLastDimension(data, this.allowedChannels);

    if (data.shape[1] === 1 && this.dimensions > 1 && this.repeatScalar) {
      data = np.repeat(data, this.dimensions, 1);
    }

    if (data.shape[1] < this.dimensions) {
      const padChannels = this.dimensions - data.shape[1];
      data = np.pad(data, [
        [0, 0],
        [0, padChannels],
      ]);

      if (this.padValue !== 0) {
        const padValues = Array(this.dimensions).fill(0);
        for (let i = this.dimensions - padChannels; i < this.dimensions; i++) {
          padValues[i] =
            typeof this.padValue === "function"
              ? this.padValue(stash, i)
              : this.padValue;
        }
        data = data.add(np.array(padValues));
      }
    }

    return data;
  }
}

class Vector2Type extends VectorType {
  constructor(params = {}) {
    super({ dimensions: 2, ...params });
  }

  get name() {
    return "vector2";
  }
}

class Vector3Type extends VectorType {
  constructor(params = {}) {
    super({ dimensions: 3, ...params });
  }

  get name() {
    return "vector3";
  }
}

class Vector4Type extends VectorType {
  constructor(params = {}) {
    super({ dimensions: 4, ...params });
  }

  get name() {
    return "vector4";
  }
}

class PositionType extends Vector3Type {
  constructor(params = {}) {
    super({
      defaultValue: new THREE.Vector3(0, 0, 0),
      targetNodes: ["coordinatesNode", "positionNode"],
      allowedChannels: [2, 3],
      padValue: (stash) => stash?.zindex ?? 0,
      ...params,
    });
  }

  get name() {
    return "position";
  }

  getUniformData(data, stash = {}) {
    const zindex = stash?.zindex ?? 0;
    if (typeof data === "number") {
      return new THREE.Vector3(data, 0, zindex);
    }
    if (data instanceof THREE.Vector2) {
      return new THREE.Vector3(data.x, data.y, zindex);
    }
    if (isVectorLiteral(data) && data.length === 2) {
      return new THREE.Vector3(data[0], data[1], zindex);
    }
    return super.getUniformData(data, stash);
  }

  ui() {
    return this.uiSpec ? super.ui() : {};
  }
}

class SizeType extends Vector3Type {
  constructor(params = {}) {
    super({
      defaultValue: 1,
      label: "Size",
      targetNodes: ["scaleNode", "sizeNode"],
      allowedChannels: [1, 3],
      repeatScalar: true,
      min: 1,
      max: 100,
      step: 1,
      ...params,
    });
    this.min = params.min ?? 1;
    this.max = params.max ?? 100;
    this.step = params.step ?? 1;
  }

  get name() {
    return "size";
  }

  ui() {
    if (this.uiSpec === false) return {};
    return {
      ui: "slider",
      label: this.label,
      min: this.min,
      max: this.max,
      step: this.step,
      ...this.uiSpec,
    };
  }
}

class RangeType extends Vector2Type {
  constructor(params = {}) {
    super({
      defaultValue: [-1, 1],
      label: "Range",
      allowedChannels: [2],
      ...params,
    });
    this.min = params.min ?? -1;
    this.max = params.max ?? 1;
    this.step = params.step ?? 0.01;
  }

  get name() {
    return "range";
  }

  ui() {
    if (this.uiSpec === false) return {};
    return {
      ui: "interval-slider",
      label: this.label,
      min: this.min,
      max: this.max,
      step: this.step,
      ...this.uiSpec,
    };
  }
}

class BoundsType extends RangeType {
  constructor(params = {}) {
    super({
      label: "Bounds",
      ...params,
    });
  }

  get name() {
    return "bounds";
  }
}

class ColorType extends FieldType {
  constructor(params = {}) {
    super({
      defaultValue: "#ffffff",
      label: "Color",
      targetNodes: ["fillColorNode", "lineColorNode", "colorNode"],
      ...params,
    });
  }

  get name() {
    return "color";
  }

  get channels() {
    return 3;
  }

  get uniformType() {
    return "vec3";
  }

  isUniformType(data) {
    return (
      typeof data === "number" ||
      typeof data === "string" ||
      data instanceof THREE.Color ||
      data instanceof THREE.Vector3
    );
  }

  get defaultTransform() {
    return colorVectorFromValue;
  }

  validateShape(data) {
    return this.validateLastDimension(data, [3]);
  }

  ui() {
    if (this.uiSpec === false) return {};
    return {
      ui: "color",
      label: this.label,
      ...this.uiSpec,
    };
  }
}

class FillType extends FieldType {
  constructor(params = {}) {
    super({
      defaultValue: "steelblue",
      label: "Fill",
      targetNodes: ["valueNode", "fillColorNode"],
      ...params,
    });
  }

  get name() {
    return "fill";
  }

  get channels() {
    return 1;
  }

  get uniformType() {
    return "vec3";
  }

  isUniformType(data) {
    return (
      typeof data === "number" ||
      typeof data === "string" ||
      data instanceof THREE.Color
    );
  }

  getUniformData(data) {
    return colorVectorFromValue(data);
  }

  validateShape(data) {
    try {
      return this.validateLastDimension(data, [1]);
    } catch (error) {
      throw new Error(`${error.message}. Fill arrays must be N values, or N x 3 / N x 4 RGB rows; use fill={{r, g, b}} for column triples.`);
    }
  }

  setNode(target, node, highlightNode, stash, isBufferNode) {
    if (isBufferNode) {
      target.valueNode = node;
    } else {
      target.valueNode = null;
      target.fillColorNode = target.animatedOptionNodes?.get("fillColor") ?? (target.options?.has("fillColor")
        ? reference("fillColor", "vec3", target.options.transformed)
        : node);
    }
  }

  ui() {
    if (this.uiSpec === false) return {};
    return {
      ui: "color",
      label: this.label,
      ...this.uiSpec,
    };
  }
}

const TypeRegistry = {
  boolean: BooleanType,
  bounds: BoundsType,
  color: ColorType,
  colormap: ColormapType,
  count: CountType,
  fill: FillType,
  integer: IntegerType,
  opacity: OpacityType,
  position: PositionType,
  range: RangeType,
  scalar: ScalarType,
  shape: ShapeType,
  shape3d: Shape3DType,
  size: SizeType,
  transform: TransformType,
  value: ValueType,
  vector2: Vector2Type,
  vector3: Vector3Type,
  vector4: Vector4Type,
  width: WidthType,
};

function createType(type, params = {}) {
  if (type instanceof FieldType) return type;
  const TypeClass = typeof type === "string" ? TypeRegistry[type] : type;
  if (!TypeClass) throw new Error(`Unknown field type: ${type}`);
  return new TypeClass(params);
}

export {
  BooleanType,
  BoundsType,
  ColorType,
  ColormapType,
  CountType,
  FieldType,
  FillType,
  IntegerType,
  OpacityType,
  PositionType,
  RangeType,
  ScalarType,
  SelectType,
  Shape3DType,
  ShapeType,
  SizeType,
  TransformType,
  TypeRegistry,
  ValueType,
  Vector2Type,
  Vector3Type,
  Vector4Type,
  VectorType,
  WidthType,
  createType,
};
