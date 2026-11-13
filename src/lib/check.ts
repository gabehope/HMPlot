import { inspectionSources, listPageWarnings } from "./checking/registry.js";
import { inputWritesSettled } from "./plot/utils/inputWrites.js";
import { toDiagnostic, type Diagnostic } from "./plot/utils/diagnostics.js";

export interface InspectionOptions {
  /** Document, plot container or application subtree. Defaults to document. */
  root?: ParentNode;
  /** Total readiness/settling budget in milliseconds; defaults to 30000. */
  timeout?: number;
}
export interface PlotInspection {
  title: string;
  description: string;
  ready: boolean;
  completedFrame: number;
  pendingPreparations: number;
  model: unknown;
  animation: unknown;
  /** What the plot did to get here (2026-10-22): mark preparations and transform runs by cause. */
  work: { markPreparations: number; transformRuns: Record<string, number> };
  diagnostics: Diagnostic[];
  exportOmissions: string[];
}
export interface InspectionReport {
  schema: 1;
  ready: boolean;
  plots: PlotInspection[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  lints: Diagnostic[];
}

/** Inspect mounted Svelte plots without global hooks or renderer access.
 * Data-dependent lints can read cached GPU extents; inspection is explicit, never per frame.
 * Screenshots and application interactions belong to the caller's browser test.
 */
export async function inspect({
  root,
  timeout = 30000,
}: InspectionOptions = {}): Promise<InspectionReport> {
  if (!Number.isFinite(timeout) || timeout <= 0)
    throw Error("inspect: pass a positive finite timeout in milliseconds.");
  if (!root && typeof document === "undefined")
    throw Error(
      "inspect: call in a mounted browser application and pass its root element.",
    );
  root ??= document;
  const deadline = performance.now() + timeout;
  const remaining = () => Math.max(0, deadline - performance.now());
  const report: InspectionReport = {
    schema: 1,
    ready: false,
    plots: [],
    errors: [],
    warnings: [],
    lints: [],
  };
  const diagnostic = (code: string, message: string) =>
    toDiagnostic(message, { code, component: "Plot" })!;
  const bounded = async (work: Promise<unknown>) => {
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        work,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Error("Plot did not settle before the inspection timeout."),
              ),
            remaining(),
          );
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
  };
  // An input a click writes (TODO 145.2) commits after its value is read: wait for those first.
  await bounded(inputWritesSettled()).catch(() => {});
  let sources = inspectionSources(root);
  while (
    remaining() > 0 &&
    (!sources.length ||
      sources.some(
        ([host, source]) =>
          host.getAttribute("aria-busy") === "true" ||
          !source.getDiagnostics()?.completedFrame,
      ))
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(25, remaining())),
    );
    sources = inspectionSources(root);
  }
  // TableViews (TODO 145.4) show the rows of transforms outside any plot: wait for their reads.
  while (remaining() > 0 && root.querySelector?.('[data-hmplot-table][aria-busy="true"]'))
    await new Promise((resolve) => setTimeout(resolve, Math.min(25, remaining())));
  if (root.querySelector?.('[data-hmplot-table][aria-busy="true"]'))
    report.errors.push(diagnostic("check.timeout", "A TableView did not finish reading its rows before the inspection timeout."));
  if (!sources.length)
    report.errors.push(
      diagnostic(
        "check.no-plots",
        "No mounted HMPlot plots were found before the timeout.",
      ),
    );
  for (const [host, source] of sources) {
    const issues: Diagnostic[] = [];
    try {
      await bounded(source.whenSettled());
      await bounded(Promise.resolve(source.prepareLints()));
    } catch (error) {
      issues.push(diagnostic("check.timeout", String(error)));
    }
    const state = source.getDiagnostics();
    issues.push(
      ...source
        .listDiagnostics()
        .map((value) => toDiagnostic(value))
        .filter((value): value is Diagnostic => !!value),
    );
    const exportOmissions = host.querySelector("[data-hmplot-html]")
      ? [
          "Html attachments are omitted from plot PNG, SVG and PDF exports; browser screenshots include them.",
        ]
      : [];
    for (const message of exportOmissions)
      issues.push(
        toDiagnostic(message, {
          severity: "warning",
          code: "export.html-omitted",
          component: "Html",
        })!,
      );
    const ready =
      host.isConnected &&
      host.getAttribute("aria-busy") !== "true" &&
      !!state?.completedFrame &&
      !issues.some((issue) => issue.severity === "error");
    if (!ready && !issues.some((issue) => issue.severity === "error"))
      issues.push(
        diagnostic(
          "check.not-ready",
          "Plot has not completed its first visible draw.",
        ),
      );
    report.plots.push({
      title: source.getTitle(),
      description: source.getDescription(),
      ready,
      completedFrame: state?.completedFrame ?? 0,
      pendingPreparations: state?.pendingPreparations ?? 0,
      model: source.getDescriptionModel(),
      animation: state?.animation ?? null,
      work: {
        markPreparations: state?.markPreparations ?? 0,
        transformRuns: state?.transformRuns ?? {},
      },
      diagnostics: issues,
      exportOmissions,
    });
    for (const issue of issues)
      report[
        issue.severity === "error"
          ? "errors"
          : issue.severity === "warning"
            ? "warnings"
            : "lints"
      ].push(issue);
  }
  // Components outside a Python scene report failures as accessible alerts (for
  // example Data's rejected schema). Include these in ordinary Svelte applications,
  // including application-owned alerts, without pretending they belong to a mark.
  const alerts = [...root.querySelectorAll<HTMLElement>('[role="alert"]')];
  if (root instanceof HTMLElement && root.matches('[role="alert"]'))
    alerts.unshift(root);
  for (const alert of alerts) {
    // An alert inside a Plot is the canvas element's fallback content: never drawn, still a
    // failure (components report through componentError.svelte; this keeps any that do not).
    const fallback = Boolean(alert.closest("canvas"));
    if (
      !fallback &&
      (!alert.getClientRects().length ||
        getComputedStyle(alert).visibility === "hidden")
    )
      continue;
    const message = alert.textContent?.trim();
    if (message && !report.errors.some((error) => error.message === message))
      report.errors.push(toDiagnostic(message, { code: "check.dom-alert" })!);
  }
  // A component outside every plot reports its warnings to the page (a slow table read).
  for (const message of listPageWarnings())
    if (!report.warnings.some((entry) => entry.message === message))
      report.warnings.push(toDiagnostic(message, { severity: "warning", code: "page.warning", component: "Data" })!);
  report.ready =
    report.plots.length > 0 &&
    report.plots.every((plot) => plot.ready) &&
    !report.errors.length;
  // Detach all values; the public report can be saved verbatim as JSON.
  return JSON.parse(JSON.stringify(report));
}
