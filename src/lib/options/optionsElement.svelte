<script>
 import CategorySettings from "./categorySettings.svelte";
  import {axisCategory} from "../plot/utils/categorical.js";
  import { instanceLimit, displayMultiplier } from "../plot/utils/sampling.js";
  import { rowState } from "./inspector.js";
  import ReferenceRules from "./referenceRules.svelte";
  import ReferenceBands from "./referenceBands.svelte";
  import LightSettings from "./lightSettings.svelte";
  import PluginParameters from "./pluginParameters.svelte";
  import { resolveAxes3d } from "../plot/utils/axes3dLayout.js";
  import { axisDefaults, axisKey, validateAxis } from "../plot/utils/axes.js";
  import { formatDatetime } from "../plot/utils/datetime.js";
  import NumericInput from "./numericInput.svelte";
  import { isExpression, expressionText } from "../plot/utils/expressions.js";
  import * as d3 from "d3";
  import { colormapPreview } from "../plot/utils/colormap.js";
  let { row } = $props();
  let store = $derived(row.node.store(row.key));
  let spec = $derived.by(() => {
    if (
      /^[xy]bounds$/.test(row.key) &&
      row.node.getChildDefaults("plot")?.get(axisKey(row.key[0], "type")) ===
        "datetime"
    )
      return { ...row.spec, min: undefined, max: undefined };
    return row.spec;
  });
  let value = $derived($store);
  // Axis label rows (TODO 21): empty is automatic, and the placeholder shows the title the axis
  // has without a label (its column, or its categorical scale's label). A frame that owns the
  // dimension ignores an inherited label, so the row shows none unless it is set here.
  const titleAxis = $derived(row.key.match(/^axisLabel([XYZ])$/)?.[1].toLowerCase());
  let titleState = $state.raw({});
  $effect(() => {
    const source = titleAxis ? (row.node.parent?.axisTitleState ?? row.node.axisTitleState) : null;
    if (!source) { titleState = {}; return; }
    return source.subscribe((state) => { titleState = state ?? {}; });
  });
  const placeholder = $derived(titleAxis ? titleState[titleAxis]?.automatic || "Automatic" : undefined);
  const shownValue = $derived(titleAxis && titleState[titleAxis] && !titleState[titleAxis].inherits &&
    !row.node.values?.has(row.key) ? "" : value);
  let controlState = $derived(rowState(row));
  let disabled = $derived($controlState.disabled);
  const id = $props.id();
  let resetVersion = $state(0);
  const choices = $derived(
    Array.isArray(spec.options)
      ? spec.options.map((value) => ({ label: value, value }))
      : Object.entries(spec.options ?? {}).map(([label, value]) => ({
          label,
          value,
        })),
  );
  // A custom colormap spec ({colors, space, positions} or a color list) shows as "Custom"
  // in the select, with its own gradient.
  const CUSTOM = "__custom-colormap";
  const customColormap = $derived(row.key === "cmapIndex" && value != null && typeof value === "object");
  const preview = $derived.by(() => {
    if (row.key !== "cmapIndex") return "";
    return colormapPreview(value ?? "Viridis").gradient || "linear-gradient(to right, #fff, #fff)";
  });
  const components = $derived(
    Array.isArray(value) || ArrayBuffer.isView(value)
      ? Array.from(value)
      : (value?.toArray?.() ?? [0, 0]),
  );
  let error = $state("");
  const formatPreview = $derived.by(() => {
    if (!/^axis[XY]Format$/.test(row.key)) return "";
    const prefix = row.key.slice(0, 5),
      node = row.node;
    try {
      return node.get(prefix + "Type") === "datetime"
        ? formatDatetime(
            Date.UTC(2026, 0, 15, 13, 45),
            value,
            node.get(prefix + "Timezone"),
          )
        : d3.format(value || ".4~g")(1234.567);
    } catch {
      return "";
    }
  });
  const guides3d = $derived({style:"box", gridPlanes:[], ...row.node.get("axisThreeD"), ...(value && typeof value === "object" ? value : {})});
  function set(next) {
    try {
      const scope = row.node.parent?.has("coordinates")
        ? row.node.parent
        : row.node;
      for(const a of ['x','y','z'])if(axisCategory(scope,a) && ((row.key===a+'Transform'&&next!=='linear')||(row.key==='coordinates'&&next==='spherical')||(row.key==='axis'+a.toUpperCase()+'Type'&&next==='datetime')))throw Error('Categorical axes require Cartesian linear coordinates.');
      if (
        scope.get("coordinates") === "spherical" &&
        ((/^[xy]Transform$/.test(row.key) && next !== "linear") ||
          (/^axis[XY]Type$/.test(row.key) && next === "datetime"))
      )
        throw Error(
          "Spherical angular axes require linear numeric coordinates.",
        );
      if (row.key === "coordinates" && next === "spherical")
        for (const a of ["x", "y"])
          if (
            (scope.get(a + "Transform") ?? "linear") !== "linear" ||
            scope
              .getChildDefaults("plot")
              ?.get("axis" + a.toUpperCase() + "Type") === "datetime"
          )
            throw Error(
              "Spherical angular axes require linear numeric coordinates.",
            );
      if (
        [
          "baseRadius",
          "radialScale",
          "subdivisionTolerance",
        ].includes(row.key) &&
        (!Number.isFinite(Number(next)) ||
          Number(next) < 0 ||
          (["subdivisionTolerance"].includes(row.key) &&
            Number(next) === 0))
      )
        throw Error(
          "Enter a finite positive value (zero is allowed for base radius and radial scale).",
        );
      if (row.key === "axes3d") resolveAxes3d(next, row.node.get("axisThreeD"), scope.get("coordinates"));
      const match = /^axis([XYZ])(.+)$/.exec(row.key);
      if (match) {
        const axis = match[1].toLowerCase();
        const config = Object.fromEntries(
          Object.entries(axisDefaults).map(([key, fallback]) => [
            key,
            axisKey(axis, key) === row.key
              ? next
              : (row.node.get(axisKey(axis, key)) ?? fallback),
          ]),
        );
        validateAxis(config);
        if (
          config.type === "datetime" &&
          (row.node.parent?.get(axis + "Transform") ?? "linear") !== "linear"
        )
          throw Error("Datetime axes require a linear coordinate transform.");
      }
      if (
        /^[xy]Transform$/.test(row.key) &&
        next !== "linear" &&
        row.node.getChildDefaults("plot")?.get(axisKey(row.key[0], "type")) ===
          "datetime"
      )
        throw Error("Datetime axes require a linear coordinate transform.");
      if (["maxInstances", "overviewMaxInstances"].includes(row.key)) {
        const limit = instanceLimit(next);
        next = limit === Infinity ? null : limit;
      }
      if (["displayScale", "overviewScale"].includes(row.key))
        next = displayMultiplier(next);
      // The viewer's edit: the user layer, which exports and Python edits carry (TODO 136.7).
      store.set(next, { layer: "user" });
      error = "";
    } catch (e) {
      error = e.message;
    }
  }
  function reset() {
    row.node.clear(row.key);
    resetVersion++;
  }
  function component(index, next) {
    const result = [...components];
    result[index] = next;
    set(result);
  }
</script>

<div
  class="setting"
  class:hidden={$controlState.hidden}
  data-setting={row.path}
  data-control-id={row.id}
  class:disabled
  title={disabled ? row.help : undefined}
>
  <div class="heading">
    <label for={id}>{row.label}</label>
    {#if $controlState.canReset}<button
        class="reset"
        onclick={reset}
        disabled={!$controlState.overridden}
        aria-label={`Reset ${row.label} to inherited`}
        title={`Reset ${row.label} to inherited`}>Reset</button
      >{/if}
  </div>
  {#if spec.ui === "categories"}
    <CategorySettings {value}/>
  {:else if spec.ui === "rules"}
    <ReferenceRules {value} onchange={set} />
  {:else if spec.ui === "lights"}
    <LightSettings {value} onchange={set} />
  {:else if spec.ui === "plugin-parameters"}
    <PluginParameters {value} {disabled} schema={spec.schema} kind={spec.kind} grid={spec.grid} onchange={set} />
  {:else if spec.ui === "bands"}
    <ReferenceBands {value} onchange={set} />
  {:else if spec.ui === "checkbox"}
    <input
      {id}
      type="checkbox"
      {disabled}
      checked={value}
      onchange={(e) => set(e.currentTarget.checked)}
    />
  {:else if spec.ui === "select"}
    <select
      {id}
      {disabled}
      value={customColormap ? CUSTOM : value}
      onchange={(e) => {
        if (e.currentTarget.value === CUSTOM) return;
        set(
          choices.find((c) => String(c.value) === e.currentTarget.value)?.value,
        );
      }}
    >
      {#if customColormap}<option value={CUSTOM}>Custom</option>{/if}
      {#each choices as choice}<option value={choice.value}
          >{choice.label}</option
        >{/each}
    </select>
    {#if preview}<div class="gradient" style:background={preview}></div>{/if}
  {:else if spec.ui === "axes3d"}
    <input {id} type="checkbox" {disabled} checked={!!value} onchange={e => set(e.currentTarget.checked)} />
    {#if value}
      <select aria-label="3D guide style" {disabled} value={guides3d.style}
        onchange={e => set({...guides3d, style:e.currentTarget.value})}>
        <option value="box">Box</option><option value="triad">Triad</option>
      </select>
      <div class="guide-planes">
        {#each ["xy", "xz", "yz"] as plane}
          <label><input type="checkbox" {disabled} checked={guides3d.gridPlanes.includes(plane)}
            onchange={e => set({...guides3d, gridPlanes:e.currentTarget.checked ? [...guides3d.gridPlanes,plane] : guides3d.gridPlanes.filter(p => p !== plane)})}/>{plane.toUpperCase()} grid</label>
        {/each}
      </div>
    {/if}
  {:else if spec.ui === "dash"}
    <input {id} type="text" {disabled} value={value?.join(" ") ?? ""} placeholder="Solid"
      onchange={e => set(e.currentTarget.value.trim() ? e.currentTarget.value.trim().split(/[ ,]+/).map(Number) : [])} />
  {:else if spec.ui === "text" && isExpression(value)}
    <!-- An expression (Histogram bins={power(count("x"), 0.5)}) is shown, not edited. -->
    <input
      {id}
      type="text"
      disabled
      value={expressionText(value)}
      title="Set by an expression; change it in code."
    />
  {:else if spec.ui === "text"}
    <input
      {id}
      type="text"
      {disabled}
      value={shownValue}
      {placeholder}
      oninput={(e) => set(e.currentTarget.value)}
    />
  {:else if spec.ui === "color"}
    <div class="color">
      <input
        {id}
        type="color"
        {disabled}
        {value}
        oninput={(e) => set(e.currentTarget.value)}
      />
      <input
        {disabled}
        aria-label={`${row.label} hex value`}
        {value}
        onchange={(e) => {
          if (/^#[\da-f]{6}$/i.test(e.currentTarget.value))
            set(e.currentTarget.value);
          else e.currentTarget.value = value;
        }}
      />
    </div>
  {:else if spec.ui === "interval-slider" || spec.ui === "point"}
    <div class="pair">
      {#each components as part, index}<NumericInput
          id={index === 0 ? id : undefined}
          value={part}
          {spec}
          {disabled}
          {resetVersion}
          slider={false}
          label={`${row.label} ${spec.components?.[index] ?? (spec.ui === "point" ? ["X", "Y", "Z", "W"][index] : index === 0 ? "minimum" : "maximum")}`}
          onchange={(next) => component(index, next)}
        />{/each}
    </div>
  {:else}
    <NumericInput
      {id}
      {value}
      {spec}
      {disabled}
      {resetVersion}
      label={row.label}
      onchange={set}
    />
  {/if}
  {#if error}<span class="help" role="alert">{error}</span
    >{:else if formatPreview}<span class="help">Preview: {formatPreview}</span
    >{/if}
  {#if $controlState.canReset}<span
      class="ownership"
      title={$controlState.overridden
        ? "This target overrides its inherited value."
        : `From ${$controlState.source}`}
    >
      {$controlState.overridden ? "Set here" : `From ${$controlState.source}`}
    </span>{/if}
  {#if row.help && !["grid", "contour", "dashes"].includes(row.dependency)}<span
      class="help">{row.help}</span
    >{/if}
</div>

<style>
  .setting {
    display: grid;
    gap: 6px;
    padding: 10px 0;
  }
  .setting.hidden { display:none; }
  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  label {
    font-size: 12px;
    font-weight: 550;
  }
  .reset {
    flex: 0 0 38px;
    font: inherit;
    font-size: 10px;
    color: var(--accent);
    border: 0;
    background: none;
    padding: 0;
    cursor: pointer;
  }
  .reset:disabled {
    color: var(--muted);
    opacity: 0.45;
    cursor: default;
  }
  .ownership {
    height: 14px;
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .help {
    color: var(--muted);
    font-size: 10px;
    line-height: 1.4;
  }
  input,
  select {
    min-width: 0;
    box-sizing: border-box;
    font: inherit;
    color: inherit;
    accent-color: var(--accent);
  }
  select,
  input:not([type="checkbox"]):not([type="color"]) {
    background: var(--field);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px;
    width: 100%;
  }
  input:disabled,
  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .color {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  input[type="color"] {
    width: 36px;
    height: 30px;
    padding: 0;
    border: 0;
    background: none;
  }
  .color input:last-child {
    flex: 1;
  }
  input[type="checkbox"] {
    justify-self: start;
    width: 17px;
    height: 17px;
    margin: 0;
  }
  .gradient {
    height: 8px;
    border-radius: 4px;
  }
  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
