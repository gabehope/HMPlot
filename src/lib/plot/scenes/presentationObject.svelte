<script>
  // A Frame's object effect (TODO 138.5; the atmosphere, a first-party plugin's): the Object3D a
  // plugin's effect of stage "object" makes, added to the plot's scene inside the Frame's Axis
  // (whose options are the Frame's) and fitted before each draw, so it follows a placed Frame.
  // It reads the effect's definition from the plugin registry (drawn once its plugin registers),
  // checks the Frame's value against its parameters and its check, and registers the object with
  // the Plot's presentation (utils/presentation.js), so SVG and PDF export the plot as one raster
  // while it shows. The minimap leaves it out: it is presentation, not data.
  import { getContext, onDestroy } from "svelte";
  import { T, useThrelte } from "@threlte/core";
  import { coordinateView } from "../utils/viewContext.js";
  import { useViewServices } from "../utils/viewServices.js";
  import { getOptionsContext } from "../utils/context.js";
  import { reportDataError } from "../utils/dataErrors.js";
  import { angularPeriod } from "../utils/coordinates.js";
  import { framePoint, framePointOperations } from "../utils/framePlacement.js";
  import { PRESENTATION_CONTEXT } from "../utils/presentation.js";
  import { checked } from "../utils/effects.js";
  import { parameterProblem, withDefaults } from "../plugins/parameters.js";
  import { plugins } from "../plugins/library.js";
  import { useReporter } from "../utils/reporter.js";

  /** `kind`: the effect's; `owner`: how messages name the keyword ("Frame: atmosphere"); `settings`: true or its parameters. */
  let { kind, owner, settings } = $props();
  const options = getOptionsContext();
  const { invalidate } = useThrelte();
  const viewServices = useViewServices();
  const presentation = getContext(PRESENTATION_CONTEXT);
  const reportOwner = {};
  // A kind no plugin registers: the Frame draws without it (a warning, as a Plot's effects).
  const reportMissing = useReporter("Frame", { severity: "warning" });
  let registered = $state(0), revision = $state(0);
  onDestroy(plugins.subscribe(() => registered++));
  const stop = options.on(() => revision++);
  const definition = $derived.by(() => {
    registered;
    const found = plugins.get("effect", kind);
    return found?.stage === "object" ? found : undefined;
  });
  // The object, made once its definition is there, and released with it.
  let instance = $state.raw(null);
  $effect(() => {
    const current = definition;
    if (!current) return;
    const made = current.object();
    const object = made.object;
    object.userData.omitOverview = true;
    object.onBeforeRender = (renderer, scene, camera) => {
      const target = renderer.getRenderTarget(), ratio = renderer.getPixelRatio();
      const width = (target?.width ?? renderer.domElement.width) / ratio, height = (target?.height ?? renderer.domElement.height) / ratio;
      const operations = framePointOperations(options, { camera, width, height });
      made.update?.({ camera, width, height, frame: {
        period: angularPeriod(options),
        point: (position) => framePoint(options, position, { operations }),
      } });
    };
    const release = presentation?.addObject(kind, object, current.export ?? "raster");
    instance = made;
    return () => {
      release?.();
      instance = null;
      made.dispose?.();
    };
  });
  let shown = $state(false);
  $effect(() => {
    revision;
    const current = definition, made = instance;
    const values = settings === true ? {} : settings;
    const form = `${owner} is true, false or { ${Object.keys(current?.parameters ?? {}).join(", ")} }`;
    const globe = options.get("coordinates") === "spherical" && coordinateView(options) === "3d" &&
      options.get("sphericalView") !== "projected";
    const problem = !current ? "" : !values || typeof values !== "object" || Array.isArray(values)
      ? `${form}; got ${JSON.stringify(values)}.`
      : (parameterProblem(kind, current.parameters ?? {}, values).replace(`${kind}: `, `${owner} `) ||
        checked(owner, current, values, { frame: { globe } }));
    reportDataError(viewServices, reportOwner, problem);
    reportMissing(current ? "" : plugins.missing("effect", kind));
    shown = !!made && !problem;
    if (shown) made.set?.(withDefaults(current.parameters ?? {}, values));
    invalidate();
  });
  onDestroy(() => { stop(); reportDataError(viewServices, reportOwner, ""); });
</script>

{#if shown && instance}<T is={instance.object} />{/if}
