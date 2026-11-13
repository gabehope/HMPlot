// A Plot's effects (TODO 37, 138.3; out of viewCore.svelte, Stage 118.5): composited after the
// scene pass (utils/presentation.js). Its `effects` list turns on bloom and fog and adds plugins'
// effects (utils/effects.js; the sky is a first-party plugin's, TODO 138.5); fog and bloom's
// settings are the Plot's options, so the settings pane edits them.
import { setContext, onDestroy, untrack } from "svelte";
import { fromStore, type Readable } from "svelte/store";
import {
  Presentation,
  PRESENTATION_CONTEXT,
  BLOOM_PARAMETERS,
  BLOOM_DEFAULTS,
  FOG_DEFAULTS,
} from "./presentation.js";
import { readEffects } from "./effects.js";
import { plugins } from "../plugins/library.js";
import { currentSceneNode, useReporter } from "./reporter.js";
import { diagnostic } from "./diagnostics.js";
import {
  BooleanType,
  ScalarType,
  FieldType as NullableFieldType,
} from "../objects/types.js";
import { optionName } from "../plugins/parameters.js";
import type { OptionsNode } from "../../options/options.js";
import type { PlotProps } from "../publicTypes.js";

/** What the presentation reads from its Plot, current at each read. */
export interface PresentationOptionsHost {
  /** The Plot's own options ("plot"), where fog and bloom's settings live. */
  readonly localOptions: OptionsNode;
  /** Its background option: fog takes it when opaque. */
  readonly background: Readable<unknown>;
  readonly effects: PlotProps["effects"];
  readonly mode: string;
  readonly name: string | undefined;
  /** Show or clear the view's message from `source`. */
  issue(source: string, message?: string): void;
  /** Hold the plot's settle (aria-busy, whenSettled) until `work` (an effect's image) loads. */
  track(work: Promise<unknown>): void;
}

export function createPresentationOptions(host: PresentationOptionsHost) {
  const localOptions = host.localOptions;
  const presentation = new Presentation();
  setContext(PRESENTATION_CONTEXT, presentation);
  presentation.track = (work: Promise<unknown>) =>
    untrack(() => host.track(work));
  onDestroy(() => presentation.dispose());
  localOptions.ensure(
    "fog",
    new BooleanType({ defaultValue: false, label: "Fog" }),
  );
  localOptions.ensure(
    "_fogNear",
    new ScalarType({
      defaultValue: FOG_DEFAULTS.near,
      min: 0,
      max: 2000,
      step: 1,
      label: "Fog start",
    }),
  );
  localOptions.ensure(
    "_fogFar",
    new ScalarType({
      defaultValue: FOG_DEFAULTS.far,
      min: 0,
      max: 2000,
      step: 1,
      label: "Fog end",
    }),
  );
  localOptions.ensure(
    "_fogColor",
    new NullableFieldType({ defaultValue: null, ui: { ui: "text" } }),
  );
  // Bloom's parameters as the Plot's options (TODO 138.2): "_bloomStrength", "_bloomRadius".
  for (const [name, parameter] of Object.entries(BLOOM_PARAMETERS))
    localOptions.ensure(
      optionName("bloom", name),
      new ScalarType({
        defaultValue: parameter.default,
        min: parameter.min,
        max: parameter.max ?? parameter.sliderMax,
        step: parameter.step,
        label: parameter.label,
      }),
    );
  presentation.onSettings = (
    effect: string,
    values: Record<string, unknown>,
  ) => {
    for (const [name, value] of Object.entries(values))
      localOptions.set(optionName(effect, name), value);
  };
  // The ScalarType options above hold numbers.
  const scalar = (key: string) =>
    fromStore(localOptions.store(key) as Readable<number>);
  const fogStore = fromStore(localOptions.store("fog")),
    fogNearStore = scalar("_fogNear"),
    fogFarStore = scalar("_fogFar"),
    fogColorStore = fromStore(localOptions.store("_fogColor")),
    bloomStores = Object.keys(BLOOM_PARAMETERS).map(
      (name) => [name, scalar(optionName("bloom", name))] as const,
    ),
    backgroundStore = fromStore(host.background);
  const plotLabel = $derived(
    host.name ? `Plot ${JSON.stringify(host.name)}` : "the Plot",
  );
  // The effects list, read again when a plugin registers (a kind it waited on draws then).
  let registered = $state(0);
  onDestroy(plugins.subscribe(() => registered++));
  const effects = $derived.by(() => {
    registered;
    return readEffects(host.effects, plugins, undefined, {
      threeD: host.mode === "3d",
      plot: plotLabel,
    });
  });
  // A kind no plugin registers, or one that fails to build: the plot draws without it (warnings).
  // Outside a scene (a plain Svelte page) nothing collects warnings: the console shows each once.
  const inScene = currentSceneNode() !== undefined;
  const warned = new Set<string>();
  const orConsole = (report: (error: unknown) => void) => (error: unknown) => {
    if (inScene) return report(error);
    const message = (error as Error)?.message ?? String(error ?? "");
    if (message && !warned.has(message)) {
      warned.add(message);
      console.warn(message);
    }
  };
  const reportMissing = orConsole(useReporter("Plot", { severity: "warning" })),
    reportFailed = orConsole(useReporter("Plot", { severity: "warning" }));
  $effect(() => {
    const { problems, missing } = effects;
    untrack(() => {
      host.issue("effects", problems.join(" "));
      reportMissing(missing ?? "");
    });
  });
  // A listed fog or bloom sets the Plot's options when its entry changes, so the settings pane's
  // values stand until then (a plugin registering re-reads the list and changes neither). An
  // entry with a problem is left out, as if not listed. Removing `effects` resets them once.
  let appliedEffects = "";
  $effect(() => {
    const listed = host.effects !== undefined;
    const { fog, bloom } = effects;
    untrack(() => {
      const applied = listed ? JSON.stringify({ fog, bloom }) : "";
      if (applied === appliedEffects) return;
      appliedEffects = applied;
      localOptions.set("fog", !!fog);
      if (fog) {
        localOptions.set("_fogNear", fog.near);
        localOptions.set("_fogFar", fog.far);
        localOptions.set("_fogColor", fog.color ?? null);
      }
      presentation.onSettings?.("bloom", bloom ?? { ...BLOOM_DEFAULTS });
    });
  });
  $effect(() => {
    const listed = effects.plugins;
    untrack(() => presentation.setPluginEffects(listed));
  });
  let presentationRevision = $state(0);
  // An effect's image reports as it loads: count without reading there.
  const stopPresentation = presentation.subscribe(() =>
    untrack(() => presentationRevision++),
  );
  onDestroy(stopPresentation);
  $effect(() => {
    presentationRevision;
    const threeD = host.mode === "3d";
    const problems = presentation.problems();
    if (fogStore.current && !threeD)
      problems.push(
        `Plot.effects: fog needs a 3D view, and ${plotLabel} is 2D. Set type="3d" on it, or remove fog.`,
      );
    const failed = [...presentation.failures.values()];
    untrack(() => {
      host.issue("presentation", problems.join(" "));
      reportFailed(
        failed.length > 1
          ? diagnostic(
              "plugin.failed",
              failed.map((entry) => entry.message).join(" "),
              { component: "Plot", property: "effects" },
            )
          : (failed[0] ?? ""),
      );
    });
  });
  // Fog's color: its own, else the plot's background when opaque, else the theme's, else white.
  const opaqueColor = (value: unknown) => {
    if (
      typeof value !== "string" ||
      !value ||
      value === "transparent" ||
      !CSS.supports("color", value)
    )
      return null;
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe) return value;
    probe.fillStyle = value;
    const parsed = String(probe.fillStyle);
    const alpha = parsed.startsWith("rgba(")
      ? Number(parsed.slice(5, -1).split(",")[3])
      : 1;
    return alpha > 0
      ? parsed.startsWith("rgba(")
        ? `rgb(${parsed.slice(5, -1).split(",").slice(0, 3).join(",")})`
        : parsed
      : null;
  };
  // Fog as the presentation draws it: null in 2D or when off.
  const fogSettings = $derived(
    fogStore.current && host.mode === "3d"
      ? {
          near: fogNearStore.current,
          far: Math.max(fogFarStore.current, fogNearStore.current + 1e-6),
          color:
            opaqueColor(fogColorStore.current) ??
            opaqueColor(backgroundStore.current) ??
            opaqueColor(localOptions.defaults?.get?.("background")) ??
            "#ffffff",
        }
      : null,
  );
  const bloomSettings = $derived(
    Object.fromEntries(
      bloomStores.map(([name, store]) => [name, store.current]),
    ),
  );
  // The presentation's hooks read them (TODO 138.1): Interactive redraws when they change, and
  // rebuilds only when fog turns on or off.
  $effect(() => {
    const settings = fogSettings;
    untrack(() => presentation.setFog(settings));
  });
  $effect(() => {
    const settings = bloomSettings;
    untrack(() => presentation.setBloom(settings));
  });
  return presentation;
}
