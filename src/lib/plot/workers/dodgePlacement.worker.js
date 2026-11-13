import { placeGlyphs } from "../utils/dodgePlacement.js";
self.onmessage = ({ data }) => {
  try {
    const { x, radius, group, order, padding } = data;
    const offsets = placeGlyphs(x, radius, group, order, padding);
    self.postMessage({ offsets }, [offsets.buffer]);
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
