// Builds the Philippine address lists used by the address dropdowns
// (src/components/AddressFields.jsx) from the PSA's PSGC data, as published
// by https://psgc.gitlab.io/api. Run it again only when the PSGC changes:
//
//   node scripts/build-psgc.mjs            (downloads the four lists)
//   node scripts/build-psgc.mjs <folder>   (uses regions.json, provinces.json,
//                                          cities-municipalities.json and
//                                          barangays.json already in <folder>)
//
// Output, served as static files by the SPA:
//   public/psgc/index.json          regions, provinces, cities/municipalities
//   public/psgc/brgy/<province>.json barangays of one province, by city code

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "psgc");
const LISTS = ["regions", "provinces", "cities-municipalities", "barangays"];

async function load(name) {
  const dir = process.argv[2];
  if (dir) return JSON.parse(await readFile(join(dir, `${name}.json`), "utf8"));
  const res = await fetch(`https://psgc.gitlab.io/api/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.json();
}

const [regions, provinces, cities, barangays] = await Promise.all(LISTS.map(load));

// Shown and saved region names, in the usual north-to-south order. A Map,
// because a plain object would sort these number-like codes.
const REGIONS = new Map([
  ["130000000", "NCR – National Capital Region"],
  ["140000000", "CAR – Cordillera Administrative Region"],
  ["010000000", "Region I – Ilocos Region"],
  ["020000000", "Region II – Cagayan Valley"],
  ["030000000", "Region III – Central Luzon"],
  ["040000000", "Region IV-A – CALABARZON"],
  ["170000000", "MIMAROPA Region"],
  ["050000000", "Region V – Bicol Region"],
  ["060000000", "Region VI – Western Visayas"],
  ["070000000", "Region VII – Central Visayas"],
  ["080000000", "Region VIII – Eastern Visayas"],
  ["090000000", "Region IX – Zamboanga Peninsula"],
  ["100000000", "Region X – Northern Mindanao"],
  ["110000000", "Region XI – Davao Region"],
  ["120000000", "Region XII – SOCCSKSARGEN"],
  ["160000000", "Region XIII – Caraga"],
  ["150000000", "BARMM – Bangsamoro Autonomous Region in Muslim Mindanao"],
]);
for (const r of regions) if (!REGIONS.has(r.code)) throw new Error(`No label for region ${r.code} ${r.name}`);

// Cities with no province in the PSGC get a stand-in one, so every level has
// a choice: NCR's cities go under "Metro Manila"; the two independent cities
// outside NCR go under the province they sit in.
const STANDIN = {
  "130000000": { code: "NCR", name: "Metro Manila" },
  "090000000": { code: "ISA", name: "Basilan" },
  "120000000": { code: "COT", name: "Maguindanao" },
};

const byName = (a, b) => a[1].localeCompare(b[1], "en");

// "City of San Jose del Monte" -> "San Jose del Monte". The plain name is what
// people write, and what the customer and branch codes are made from.
const cityName = (n) => n.replace(/^City of /, "").trim();

const out = { regions: [], provinces: [], cities: [] };
out.regions = [...REGIONS];
for (const p of provinces) out.provinces.push([p.code, p.name, p.regionCode]);

const usedStandins = new Set();
const cityProvince = {};
for (const c of cities) {
  let prov = c.provinceCode;
  if (!prov) {
    const s = STANDIN[c.regionCode];
    if (!s) throw new Error(`No province for ${c.name} (${c.regionCode})`);
    prov = s.code;
    usedStandins.add(c.regionCode);
  }
  cityProvince[c.code] = prov;
  out.cities.push([c.code, cityName(c.name), prov, c.isCity ? 1 : 0]);
}
for (const regionCode of usedStandins) {
  const s = STANDIN[regionCode];
  out.provinces.push([s.code, s.name, regionCode]);
}
out.provinces.sort(byName);
out.cities.sort(byName);

// Two places in one province with the same plain name would be ambiguous.
const seen = new Set();
for (const [, name, prov] of out.cities) {
  const key = `${prov}|${name.toLowerCase()}`;
  if (seen.has(key)) throw new Error(`Duplicate city name ${name} in ${prov}`);
  seen.add(key);
}

const brgyByProvince = {};
for (const b of barangays) {
  const city = b.cityCode || b.municipalityCode;
  const prov = cityProvince[city];
  if (!prov) throw new Error(`Barangay ${b.code} has no known city`);
  ((brgyByProvince[prov] ??= {})[city] ??= []).push([b.code, b.name]);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, "brgy"), { recursive: true });
await writeFile(join(OUT, "index.json"), JSON.stringify(out));
for (const [prov, byCity] of Object.entries(brgyByProvince)) {
  for (const list of Object.values(byCity)) list.sort(byName);
  await writeFile(join(OUT, "brgy", `${prov}.json`), JSON.stringify(byCity));
}

console.log(`psgc: ${out.regions.length} regions, ${out.provinces.length} provinces, ${out.cities.length} cities/municipalities, ${barangays.length} barangays`);
