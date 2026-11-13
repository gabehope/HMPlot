/** Opt-in diagnostics own shared device hooks; readers borrow snapshots, never the hooks. */
export interface DeviceCounters {
  buffers: number;
  bufferBytes: number;
  peakBufferBytes: number;
  textures: number;
  shaderModules: number;
  shaderBytes: number;
  maxShaderBytes: number;
  pipelines: number;
  writeBytes: number;
  submissions: number;
}
export interface DeviceDiagnosticError {
  kind: "gpu" | "device-lost";
  message: string;
  time: number;
}
export interface TimingSummary {
  count: number;
  p50: number;
  p95: number;
  max: number | undefined;
}
export interface DiagnosticsSnapshot {
  gpu: DeviceCounters;
  /** CPU Three.js node-builder work; independent of GPU pipeline creation counters. */
  shaders: { builds: number; firstBuilds: number; rebuilds: number; milliseconds: number; events: ShaderBuildEvent[] };
  errors: DeviceDiagnosticError[];
  lost: boolean;
  timing: Record<string, TimingSummary>;
}
export interface RendererDiagnostics {
  /** The renderer observed; a replacement renderer gets its own instrumentation. */
  readonly renderer: object;
  sample(kind: string, milliseconds?: number): void;
  pickingMaterial(object: any, source: any, material: any, objectId: number, reason: string): void;
  snapshot(): DiagnosticsSnapshot;
  dispose(): void;
}
export interface ShaderBuildEvent {
  kind: "picking-material" | "shader-build";
  frame: number;
  time: number;
  mark?: string;
  label?: string;
  objectId?: number;
  objectUuid?: string;
  beautyMaterialId?: number;
  pickingMaterialId?: number;
  sourceVersion?: number;
  materialId?: number;
  materialVersion?: number;
  pass?: string;
  reason?: string;
  build?: number;
  milliseconds?: number;
  failed?: boolean;
}
/** One lease per renderer; hooks are restored after the last device observer releases. */
export interface DeviceObservation {
  refs: number;
  counters: DeviceCounters;
  errors: DeviceDiagnosticError[];
  lost: boolean;
  release(): void;
}
