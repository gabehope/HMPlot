/** Internal mounted-plot registry. Entries own no renderer resources. */
export interface InspectionSource {
  whenSettled(): Promise<void>;
  prepareLints(): Promise<unknown> | unknown;
  getTitle(): string;
  getDescription(): string;
  getDescriptionModel(): unknown;
  getDiagnostics(): {
    completedFrame: number;
    pendingPreparations: number;
    markPreparations?: number;
    transformRuns?: Record<string, number>;
    animation?: unknown;
  } | null;
  listDiagnostics(): unknown[];
}
const mounted = new Map<HTMLElement, InspectionSource>();
export function registerInspection(
  host: HTMLElement,
  source: InspectionSource,
): () => void {
  mounted.set(host, source);
  return () => {
    if (mounted.get(host) === source) mounted.delete(host);
  };
}
/** Warnings of components outside every plot (a Data that read its table slowly), for check(). */
const pageWarnings = new Map<object, string>();
export function notePageWarning(owner: object, message: string | null): void {
  if (message) pageWarnings.set(owner, message);
  else pageWarnings.delete(owner);
}
export const listPageWarnings = (): string[] => [...pageWarnings.values()];
export function inspectionSources(root: ParentNode) {
  return [...mounted].filter(([host]) => host === root || root.contains(host));
}
