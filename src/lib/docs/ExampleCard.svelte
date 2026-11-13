<script>
  // A gallery card (TODO 69.19): the example's thumbnail, title and description, the whole card one
  // link to its page. The thumbnail is an image of the chart made when the site is built
  // (scripts/build_examples.py for a program pair, scripts/build-thumbnails.mjs for a gallery
  // program), never a live plot: `example.thumbnail` is its manifest record (src, srcset, width,
  // height, background). Without one, or when it fails to load, the frame shows the example's tags.
  import { base } from "$app/paths";
  import { assetURL } from "./exampleBuilds.js";

  // heading: the title's element (h2, h3, ...); eager: the image loads at once (the visible first
  // row), else lazily; sizes: the image's width on the page, for srcset.
  let { example, heading = "h2", eager = false, sizes = "(max-width: 600px) calc(100vw - 32px), 300px" } = $props();
  let failed = $state(false);
  const thumbnail = $derived(failed ? null : example.thumbnail);
</script>

<a class="card" href={`${base}/examples/${example.id}`}>
  <span class="frame" style:background={thumbnail?.background}>
    {#if thumbnail}
      <img src={assetURL(thumbnail.src)} srcset={thumbnail.srcset?.map(([src, width]) => `${assetURL(src)} ${width}w`).join(", ")}
        sizes={thumbnail.srcset ? sizes : undefined} width={thumbnail.width} height={thumbnail.height} alt=""
        loading={eager ? "eager" : "lazy"} decoding="async" onerror={() => (failed = true)} />
    {:else}
      <span class="fallback" aria-hidden="true">{(example.tags ?? []).join(" · ") || example.title}</span>
    {/if}
  </span>
  <svelte:element this={heading} class="title">{example.title}</svelte:element>
  <p>{example.description}</p>
</a>

<style>
  .card { display: block; text-decoration: none; color: inherit; min-width: 0; }
  /* One frame for every card; the image keeps its aspect inside it, on its own background. */
  .frame { display: flex; align-items: center; justify-content: center; aspect-ratio: 16 / 10; overflow: hidden;
    background: #fff; border: 1px solid #dce2e6; border-radius: 4px; box-sizing: border-box; }
  .frame img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .fallback { padding: 12px; text-align: center; font-size: 13px; color: #687582; }
  .title { font-size: 16px; line-height: 1.35; font-weight: 600; color: #215b85; margin: 10px 0 4px; }
  p { margin: 0; font-size: 14px; line-height: 1.5; color: #596976; display: -webkit-box; -webkit-box-orient: vertical;
    -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }
  .card:hover .title { text-decoration: underline; }
  .card:hover .frame { border-color: #9fb4c6; }
  .card:focus-visible { outline: 2px solid #215b85; outline-offset: 4px; border-radius: 4px; }
</style>
