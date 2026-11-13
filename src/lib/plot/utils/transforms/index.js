import { slice } from "../slice.js";
import { interpolate } from "../grid.js";
import { calculate } from "./calculate.js";
import { filter } from "./filter.js";
import { sort } from "./order.js";
import { sample } from "./sample.js";
import { windowTransform, normalize } from "../../../stats/definitions.js";
import { shift } from "./shift.js";
import { bin } from "./bin.js";
import { hexbin } from "./hexbin.js";
import { group, pivot } from "./group.js";
import { stack } from "./stack.js";
import { summary } from "./summary.js";
import { boxStats, boxOutliers } from "./box.js";
import { barGeometry } from "./barGeometry.js";
import { pieGeometry } from "./pieGeometry.js";
import { fold } from "./fold.js";
import { join } from "./join.js";
import { dodgeGrid } from "./dodgeGrid.js";
import { ecdf } from "./ecdf.js";
import { triangulate } from "./geometry.js";
import { fromEdges } from "./fromEdges.js";

/**
 * Built-in transforms run through the shared ownership and publication contract (runner.js).
 */
export const definitions = new Map([
  ["Calculate", calculate],
  ["Filter", filter],
  ["Sort", sort],
  ["Sample", sample],
  ["Window", windowTransform],
  ["Shift", shift],
  ["Bin", bin],
  ["Hexbin", hexbin],
  ["Group", group],
  ["GraphData", fromEdges],
  ["Join", join],
  ["Pivot", pivot],
  ["Stack", stack],
  ["Normalize", normalize],
  ["Summary", summary],
  ["BoxStats", boxStats],
  ["BoxOutliers", boxOutliers],
  ["BarGeometry", barGeometry],
  ["PieGeometry", pieGeometry],
  ["Fold", fold],
  ["Dodge", dodgeGrid],
  // The Ecdf chart's steps (internal since TODO 137.3).
  ["ECDF", ecdf],
  // Polygon's vertex rows (internal).
  ["Triangulate", triangulate],
  ["Slice", slice],
  ["Interpolate", interpolate],
]);
