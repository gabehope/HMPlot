<script>
  import NumericInput from "./numericInput.svelte";
  import {
    parameterProblem,
    parameterVariant,
  } from "../plot/plugins/parameters.js";
  import { isExpression, expressionText } from "../plot/utils/expressions.js";
  let { value = {}, schema, kind, grid, disabled = false, onchange } = $props();
  let error = $state("");
  const entries = $derived(
    Object.entries(schema).filter(
      ([, spec]) => !spec.when || spec.when === (grid ? "grid" : "rows"),
    ),
  );
  function change(name, next) {
    const problem = parameterProblem(
      kind,
      { [name]: schema[name] },
      { [name]: next },
    );
    error = problem;
    if (!problem) onchange({ ...value, [name]: next });
  }
  function initial(spec) {
    if (spec.default !== undefined) return spec.default;
    if (spec.type === "union") return initial(spec.variants[0]);
    if (spec.type === "select") return spec.options[0];
    if (spec.type === "boolean") return false;
    if (spec.type === "number" || spec.type === "expression")
      return spec.min ?? 0;
    if (spec.type === "array")
      return Array.from({ length: spec.minLength ?? 0 }, () =>
        initial(spec.items),
      );
    if (spec.type === "object")
      return Object.fromEntries(
        (spec.required ?? []).map((key) => [
          key,
          initial(spec.properties[key]),
        ]),
      );
    return "";
  }
  const vectorSchema = (shape) =>
    shape.length
      ? {
          type: "array",
          items: vectorSchema(shape.slice(1)),
          minLength: shape[0],
          maxLength: shape[0],
        }
      : { type: "number" };
</script>

{#snippet control(spec, current, label, update)}
  {#if isExpression(current) || (typeof current === "string" && current.startsWith("$"))}
    <input
      aria-label={label}
      disabled
      value={isExpression(current) ? expressionText(current) : current}
      title="Set by an expression or input; change its source."
    />
  {:else if spec.type === "union"}
    {@const active = parameterVariant(spec, current)}
    <select
      aria-label={`${label} type`}
      {disabled}
      value={spec.variants.indexOf(active)}
      onchange={(event) =>
        update(initial(spec.variants[+event.currentTarget.value]))}
    >
      {#each spec.variants as variant, index}<option value={index}
          >{variant.label ??
            (variant.type === "select"
              ? variant.options.map(String).join(", ")
              : variant.type)}</option
        >{/each}
    </select>
    {@render control(active, current, label, update)}
  {:else if spec.type === "array"}
    {#each current ?? [] as item, index}
      <div class="parameter">
        {@render control(spec.items, item, `${label} ${index + 1}`, (next) =>
          update(current.map((value, i) => (i === index ? next : value))),
        )}
        {#if (current?.length ?? 0) > (spec.minLength ?? 0)}<button
            {disabled}
            aria-label={`Remove ${label} ${index + 1}`}
            onclick={() => update(current.filter((_, i) => i !== index))}
            >Remove</button
          >{/if}
      </div>
    {/each}
    {#if (current?.length ?? 0) < (spec.maxLength ?? Infinity)}<button
        {disabled}
        aria-label={`Add ${label}`}
        onclick={() => update([...(current ?? []), initial(spec.items)])}
        >Add value</button
      >{/if}
  {:else if spec.type === "object"}
    {#each Object.entries(spec.properties) as [key, child]}
      <div class="parameter">
        <span>{child.label ?? key}</span>{@render control(
          child,
          current?.[key] ?? child.default,
          `${label} ${key}`,
          (next) => update({ ...current, [key]: next }),
        )}
      </div>
    {/each}
  {:else if spec.type === "vector"}
    {@render control(
      vectorSchema(spec.shape ?? [spec.length]),
      current,
      label,
      update,
    )}
  {:else if spec.type === "number" || spec.type === "expression"}
    <NumericInput
      value={current}
      {label}
      {disabled}
      spec={{ ...spec, step: spec.step ?? (spec.integer ? 1 : 0.01) }}
      slider={spec.max !== undefined || spec.sliderMax !== undefined}
      onchange={update}
    />
  {:else if spec.type === "boolean"}
    <input
      type="checkbox"
      aria-label={label}
      {disabled}
      checked={current ?? false}
      onchange={(event) => update(event.currentTarget.checked)}
    />
  {:else if spec.type === "select"}
    <select
      aria-label={label}
      {disabled}
      value={current}
      onchange={(event) =>
        update(
          spec.options.find(
            (option) => String(option) === event.currentTarget.value,
          ),
        )}
    >
      {#each spec.options as option}<option value={option}
          >{String(option)}</option
        >{/each}
    </select>
  {:else}
    <input
      aria-label={label}
      disabled={disabled ||
        (spec.type === "field" && typeof current === "object")}
      value={current ?? ""}
      onchange={(event) => update(event.currentTarget.value)}
    />
  {/if}
{/snippet}

{#each entries as [name, spec]}
  <div class="parameter">
    <span>{spec.label ?? name}</span>{@render control(
      spec,
      value[name] ?? spec.default,
      spec.label ?? name,
      (next) => change(name, next),
    )}
  </div>
{/each}
{#if error}<p role="alert">{error}</p>{/if}

<style>
  .parameter {
    display: grid;
    gap: 0.25rem;
    margin-block: 0.5rem;
  }
  input,
  select {
    min-width: 0;
    width: 100%;
  }
  input[type="checkbox"] {
    width: auto;
    justify-self: start;
  }
</style>
