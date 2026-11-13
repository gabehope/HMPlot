import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import path from "node:path";

test("web authoring types reject unknown props and invalid event/handle assumptions", () => {
  const file = path.resolve("tests/web-type-consumer.ts");
  const source = `import type { PointsProps, TextProps, AreaProps, PlotProps, PlotHandle, FrameHandle, HtmlProps, GeoJSONProps } from '../src/lib/plot/publicTypes.js';
const point: PointsProps = { x: 'x', onclick(event) { const row: number | undefined = event.sourceRow;
  // @ts-expect-error sourceRow is an index, not a record
  event.sourceRow.value;
}};
const text: TextProps = { text: 'label', align: 'left' };
const area: AreaProps = { x: 'x', lower: 0, upper: 'high' };
const geo: GeoJSONProps = { lit: true, onclick(event) { const id: string | number | undefined = event.featureId; } };
// @ts-expect-error misspelled prop
const wrong: PointsProps = { opactiy: 0.5 };
// @ts-expect-error unknown Plot prop
const wrongPlot: PlotProps = { fakeViewport: [] };
// @ts-expect-error HTML takes scalar numeric coordinates
const wrongAnchor: HtmlProps = { x: 'column', y: 1 };
declare const plot: PlotHandle;
declare const frame: FrameHandle;
const stop: () => void = frame.subscribeScreenMapping(mapping => { if (mapping) {
  const position = mapping.project({x: 1, y: 2});
  // @ts-expect-error snapshots are immutable
  mapping.width = 2;
}});
// @ts-expect-error no invented handle method
plot.projectRows();
plot.getScreenMapping()?.unproject({x: 10, y: 20});`;
  const options = {
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options),
    original = host.getSourceFile;
  host.getSourceFile = (name, ...args) =>
    name === file
      ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
      : original.call(host, name, ...args);
  const program = ts.createProgram([file], options, host);
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((error) => error.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(
    errors.map((error) =>
      ts.flattenDiagnosticMessageText(error.messageText, "\n"),
    ),
    [],
  );
});
