/**
 * The side of its point a label sits on: `align`, or under "auto" its offset's side (an dx
 * past 4 CSS pixels to the right starts the label there, past 4 to the left ends it there;
 * otherwise it is centered), as Text's shader (objects/labels.js) places it.
 * @param {string | undefined} align @param {number} dx
 * @returns {"left" | "center" | "right"}
 */
export const labelSide = (align, dx) =>
  align === "auto" ? (dx > 4 ? "left" : dx < -4 ? "right" : "center") : align === "left" || align === "right" ? align : "center";
