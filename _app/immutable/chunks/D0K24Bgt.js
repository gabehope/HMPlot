const e=`<script lang="ts">
  import { onMount } from "svelte";
  import { Plot, GeoJSON, Segments, Points, Legend } from "$lib";
  import { loadCountries } from "../geo/load.js";
  let { onready } = $props();
  let plot=$state<any>(), countries=$state<any>(), error=$state(''), type=$state<'2d'|'3d'>('3d'), projection=$state<'equirectangular'|'mercator'|'equal-area'>('equirectangular');
  const cities = [[-74,40.7,.025],[-.1,51.5,.025],[139.7,35.7,.025],[151.2,-33.9,.025],[-43.2,-22.9,.025],[18.4,-33.9,.025]];
  const start=[], end=[];
  for(let i=0;i<cities.length;i++) for(let j=i+1;j<cities.length;j++) {start.push(cities[i]);end.push(cities[j]);}
  $effect(()=>{if(plot)onready?.(plot)});
  onMount(()=>{const c=new AbortController();loadCountries(c.signal).then(v=>countries=v).catch(e=>{if(e.name!=='AbortError')error=e.message});return()=>c.abort()});
<\/script>
<div class="toolbar">
<label>View <select aria-label="View" bind:value={type}><option value="3d">Globe</option><option value="2d">Map</option></select></label>
<label>Projection <select aria-label="Projection" bind:value={projection}><option value="equirectangular">Equirectangular</option><option value="mercator">Mercator</option><option value="equal-area">Equal area</option></select></label>
</div>
{#if error}<p role="alert">{error}</p>{:else if countries}
<Plot bind:this={plot} responsive height={520} coordinates="spherical" type={type === "3d" ? "3d-y-up" : "2d"} {projection} overview legend>
  <GeoJSON data={countries} fill="#516b79" outlineColor="#c9d5d9" outlineWidth={0.5} label="Land"/>
  <Segments {start} {end} color="#dba35f" width={1.5} label="Routes"/>
  <Points position={cities} fill="#f5eee1" outlineColor="#30343b" outlineWidth={1} size={10} label="Cities"/>
</Plot>
{:else}<p>Loading map…</p>{/if}
<small>Natural Earth · public domain. Illustrative routes connect six cities.</small>
<style>.toolbar{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px}</style>
`;export{e as default};
