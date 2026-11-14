async function a(t){const o=await fetch("/data/geo/countries.json",{signal:t});if(!o.ok)throw Error("Could not load the local map.");return o.json()}export{a as l};
