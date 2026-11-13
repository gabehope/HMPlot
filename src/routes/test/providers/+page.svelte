<script>
  // TODO 20.1 fixtures: Providers whose loads the spec controls (resolve, reject, delays), one
  // under a Calculate and a Plot, two sharing a load, one with a continuously changing param,
  // one mounting late under a Frame between two marks, one polling with versions, and one
  // fetching JSON (the spec routes the URL).
  import { onMount } from "svelte";
  import { Plot, Frame, Provider, Calculate, Filter, Points, InputContext, Button, input, multiply, greater } from "$lib/index";
  import Probe from "../view-state/Probe.svelte";

  const probes = {};
  const calls = { main: [], shared: [], debounced: [], order: [], polled: [], feed: [] };
  const loads = { main: [], polled: [], fetched: [], feed: [] }, errors = { main: [], fetched: [], feed: [] };
  /** A load that waits until the spec settles it: calls[label][i].resolve(value) / .reject(error). */
  const controlled = (label) => ({
    id: label,
    load({ params, signal, revision, version, refresh }) {
      const call = { params, revision, version, refresh, aborted: false, settled: false };
      signal.addEventListener("abort", () => (call.aborted = true));
      calls[label].push(call);
      return new Promise((resolve, reject) => {
        call.resolve = (value) => { call.settled = true; resolve(value); };
        call.reject = (error) => { call.settled = true; reject(error); };
      });
    },
  });
  const mainSource = controlled("main"), sharedSource = controlled("shared"), debouncedSource = controlled("debounced"), orderSource = controlled("order");
  const feedSource = controlled("feed");
  // Polling: each load takes `poll.delay` ms and returns { data, version } from `poll`.
  const poll = { delay: 30, version: "v1", values: [1, 2, 3, 4], spans: [] };
  const pollSource = {
    id: "polled",
    async load({ signal, refresh }) {
      const span = { start: performance.now(), end: undefined, refresh };
      poll.spans.push(span);
      calls.polled.push(span);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, poll.delay);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); });
      });
      span.end = performance.now();
      return { data: { x: poll.values.map((_, i) => i), v: [...poll.values] }, version: poll.version };
    },
  };

  let stream = $state("north"), feed = $state(), feedPlot = $state(), feedPoints = $state();
  let species = $state("Adelie"), sharedN = $state(1), debouncedV = $state(0), fetchName = $state("a"), pollInterval = $state(250);
  let main = $state(), mainPlot = $state(), mainPoints = $state(), sharedA = $state(), sharedB = $state(), debounced = $state(),
    orderPlot = $state(), before = $state(), late = $state(), after = $state(), polled = $state(), pollPlot = $state(), pollPoints = $state(),
    fetched = $state();
  const statuses = [];
  $effect(() => main?.subscribe((status) => statuses.push(status)));
  const staticRows = { x: [1, 2, 3], y: [1, 2, 3] };
  const domains = { x: { domain: [0, 10] }, y: { domain: [0, 10] } };
  onMount(() => {
    window.providers = {
      probes, calls, loads, errors, poll, statuses,
      setSpecies: (value) => (species = value),
      setShared: (value) => (sharedN = value),
      setDebounced: (value) => (debouncedV = value),
      setFetchName: (value) => (fetchName = value),
      setPollInterval: (value) => (pollInterval = value),
      setStream: (value) => (stream = value),
      get feed() { return feed; }, get feedPlot() { return feedPlot; }, get feedPoints() { return feedPoints; },
      get main() { return main; }, get mainPlot() { return mainPlot; }, get mainPoints() { return mainPoints; },
      get sharedA() { return sharedA; }, get sharedB() { return sharedB; }, get debounced() { return debounced; },
      get orderPlot() { return orderPlot; }, get before() { return before; }, get late() { return late; }, get after() { return after; },
      get polled() { return polled; }, get pollPlot() { return pollPlot; }, get pollPoints() { return pollPoints; },
      get fetched() { return fetched; },
    };
    return () => { delete window.providers; };
  });
</script>

<h3>Provider &gt; Calculate &gt; Plot</h3>
<section data-case="main"><InputContext>
  <Provider bind:this={main} source={mainSource} params={{ species }} key="id" debounce={100} refresh={input("reload")}
    onload={(event) => loads.main.push(event)} onerror={(event) => errors.main.push(event.error?.message ?? String(event.error))}>
    <Calculate columns={{ x2: multiply("x", 2) }}>
      <Probe name="main" {probes} column="x2" />
      <Plot bind:this={mainPlot} width={300} height={200} axes2d {...domains}>
        <Points bind:this={mainPoints} x="x" y="y" size={4} select />
      </Plot>
    </Calculate>
  </Provider>
  <!-- Each press of Refresh changes the Provider's refresh= value, which loads again. -->
  <Button name="reload" label="Refresh" />
</InputContext></section>

<h3>Two Providers, one load</h3>
<Provider bind:this={sharedA} source={sharedSource} params={{ n: sharedN }}><Probe name="sharedA" {probes} column="x" /></Provider>
<Provider bind:this={sharedB} source={sharedSource} params={{ n: sharedN }}><Probe name="sharedB" {probes} column="x" /></Provider>

<h3>A param that changes continuously (default debounce)</h3>
<Provider bind:this={debounced} source={debouncedSource} params={{ v: debouncedV }}><Probe name="debounced" {probes} column="x" /></Provider>

<h3>A Provider mounting under a Frame, between two marks</h3>
<section data-case="order">
  <Plot bind:this={orderPlot} data={staticRows} width={300} height={200} axes2d {...domains}>
    <Points bind:this={before} x="x" y="y" size={5} fill="#1f77b4" />
    <Frame x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
      <Provider source={orderSource}>
        <Filter where={greater("x", -1)}>
          <Points bind:this={late} x="x" y="y" size={5} fill="#d62728" />
        </Filter>
      </Provider>
    </Frame>
    <Points bind:this={after} x="x" y="y" size={5} fill="#2ca02c" />
  </Plot>
</section>

<h3>Polling with versions</h3>
<section data-case="polled">
  <Provider bind:this={polled} source={pollSource} refreshInterval={pollInterval} onload={(event) => loads.polled.push(event)}>
    <Probe name="polled" {probes} column="v" />
    <Plot bind:this={pollPlot} width={300} height={200} axes2d {...domains}>
      <Points bind:this={pollPoints} x="x" y="v" size={4} />
    </Plot>
  </Provider>
</section>

<h3>fetchJSON through the url prop</h3>
<section data-case="fetched">
  <!-- A JavaScript string: in a quoted attribute, Svelte would read {name} as an expression. -->
  <Provider bind:this={fetched} url={"/providers-api/{name}.json"} params={{ name: fetchName }} path="rows"
    onload={(event) => loads.fetched.push(event)} onerror={(event) => errors.fetched.push(event.error?.message)}>
    <Probe name="fetched" {probes} column="x" />
  </Provider>
</section>

<h3>An accumulating feed (TODO 127)</h3>
<section data-case="feed">
  <Provider bind:this={feed} source={feedSource} params={{ stream }} key="id" accumulate={{ maxRows: 5 }} debounce={0}
    onload={(event) => loads.feed.push(event)} onerror={(event) => errors.feed.push(event.error?.message ?? String(event.error))}>
    <Probe name="feed" {probes} column="id" />
    <Plot bind:this={feedPlot} width={300} height={200} axes2d {...domains}>
      <Points bind:this={feedPoints} x="x" y="x" size={4} select />
    </Plot>
  </Provider>
</section>
