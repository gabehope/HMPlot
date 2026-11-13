import { geoGeometry } from "../utils/geoGeometry.js";
let input;
self.onmessage = ({ data }) => {
  try {
    if ("input" in data) input = data.input;
    const result = geoGeometry(input, data.options),
      transfer = [];
    for (const family of [result.faces, result.lines, result.points])
      for (const array of Object.values(family)) transfer.push(array.buffer);
    self.postMessage({ result }, transfer);
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
