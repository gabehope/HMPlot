export async function loadCountries(signal) {
  const r = await fetch("/data/geo/countries.json", { signal });
  if (!r.ok) throw Error("Could not load the local map.");
  return r.json();
}
