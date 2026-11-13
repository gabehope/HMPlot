// @ts-check
/**
 * Share one plot error surface across asynchronous data consumers: the view's diagnostics
 * (viewServices.ts). Outside every Plot there is no view, and nothing is shown.
 * @param {import("./internalTypes.js").ViewServices | null | undefined} view
 * @param {object} owner
 * @param {import("./internalTypes.js").ReportedError} message
 */
export function reportDataError(view, owner, message) {
  view?.diagnostics.report(owner, message);
}
