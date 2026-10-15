// Philippine address lists (PSGC: region > province > city/municipality >
// barangay) for the address dropdowns, plus a matcher that turns typed or
// found names ("Caloocan City", "Brgy. 179") into the official entries.
// The lists are static files built by scripts/build-psgc.mjs and loaded once,
// on first use: the index (~120 KB) and one file per province for barangays.

const BASE = `${import.meta.env.BASE_URL}psgc`;

let indexPromise = null;
const brgyPromises = new Map();

function getJson(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Address list failed to load (${r.status})`);
    return r.json();
  });
}

// { regions, provinces, cities, ... } as objects, with lookups by code.
export function loadPsgcIndex() {
  if (!indexPromise) {
    indexPromise = getJson(`${BASE}/index.json`).then((raw) => {
      const regions = raw.regions.map(([code, name]) => ({ code, name }));
      const provinces = raw.provinces.map(([code, name, regionCode]) => ({ code, name, regionCode }));
      const cities = raw.cities.map(([code, name, provinceCode, isCity]) => ({ code, name, provinceCode, isCity: !!isCity }));
      return {
        regions,
        provinces,
        cities,
        regionByCode: new Map(regions.map((r) => [r.code, r])),
        provinceByCode: new Map(provinces.map((p) => [p.code, p])),
        cityByCode: new Map(cities.map((c) => [c.code, c])),
      };
    }).catch((err) => { indexPromise = null; throw err; });
  }
  return indexPromise;
}

// Barangays of one city: [{ code, name }].
export function loadBarangays(provinceCode, cityCode) {
  if (!brgyPromises.has(provinceCode)) {
    brgyPromises.set(provinceCode, getJson(`${BASE}/brgy/${provinceCode}.json`).catch((err) => {
      brgyPromises.delete(provinceCode);
      throw err;
    }));
  }
  return brgyPromises.get(provinceCode).then((byCity) =>
    (byCity[cityCode] || []).map(([code, name]) => ({ code, name }))
  );
}

// ---- Matching names to entries ------------------------------------------------

// Lowercase, no accents or punctuation, common abbreviations spelled out, and
// the words that only say what kind of place it is ("City of", "Brgy.") dropped.
export function normalizePlace(s) {
  return String(s || "")
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\bsto\.?(?=\s)/g, "santo")
    .replace(/\bsta\.?(?=\s)/g, "santa")
    .replace(/\bgen\.?(?=\s)/g, "general")
    .replace(/[^a-z0-9()]+/g, " ")
    .replace(/\b(city of|municipality of|city|municipality|barangay|brgy|bgy|province of|province)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The name without a note in brackets: "Adams (Pob.)" -> "adams".
const bare = (s) => normalizePlace(s).replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

// Province names people use for Metro Manila.
const PROVINCE_ALIASES = { "metro manila": "NCR", "ncr": "NCR", "national capital region": "NCR" };
// Short names people use for cities.
const CITY_ALIASES = { sjdm: "San Jose del Monte", qc: "Quezon City", dasma: "Dasmariñas", csjdm: "San Jose del Monte" };

// How a name sounds, so Filipino spelling variants match the official name:
// K and C ("Kalookan" = "Caloocan"), QU and K, PH and F, V and B, Y and I,
// Z and S, Ñ and N (normalizePlace drops the tilde), and doubled letters.
export function soundKey(s) {
  return bare(s)
    .replace(/c(?=[aou])/g, "k").replace(/ck/g, "k").replace(/qu/g, "k").replace(/c\b/g, "k")
    .replace(/ph/g, "f").replace(/v/g, "b").replace(/y/g, "i").replace(/z/g, "s")
    .replace(/h(?![aeiou])/g, "")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/ /g, "");
}

// Number of single-letter edits between two strings (stops early past `max`).
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// The one entry in `list` whose name matches `name`, or null. In order, and
// only when exactly one entry fits: the exact name, the name without brackets,
// the same sound (spelling variants such as K/C), then a small typo (one letter
// off, two for long names). So a misspelled place is saved with its official
// spelling. Numbered barangays ("179") are matched exactly only.
export function findByName(list, name) {
  const n = normalizePlace(name);
  if (!n) return null;
  const exact = list.filter((x) => normalizePlace(x.name) === n);
  if (exact.length === 1) return exact[0];
  const b = bare(name);
  const loose = list.filter((x) => bare(x.name) === b);
  if (loose.length === 1) return loose[0];
  if (loose.length > 1 || /\d/.test(b)) return null;
  const k = soundKey(name);
  if (k.length < 4) return null;
  const sounds = list.filter((x) => soundKey(x.name) === k);
  if (sounds.length) return sounds.length === 1 ? sounds[0] : null;
  const max = k.length >= 9 ? 2 : 1;
  const near = list.filter((x) => editDistance(soundKey(x.name), k, max) <= max);
  return near.length === 1 ? near[0] : null;
}

// Region, province and city entries for names, as far as they match. A city
// found without its province (e.g. a scanned ID with only "Caloocan City") is
// still found when its name is unique in the country.
export function matchPlaces(index, { region, province, city }) {
  let r = region ? findByName(index.regions, region) || index.regions.find((x) => normalizePlace(x.name).startsWith(normalizePlace(region) + " ")) || null : null;

  let p = null;
  if (province) {
    const alias = PROVINCE_ALIASES[normalizePlace(province)];
    p = alias ? index.provinceByCode.get(alias) : findByName(r ? index.provinces.filter((x) => x.regionCode === r.code) : index.provinces, province);
  }

  let c = null;
  if (city) {
    city = CITY_ALIASES[normalizePlace(city).replace(/ /g, "")] || city;
    const pool = p ? index.cities.filter((x) => x.provinceCode === p.code)
      : r ? index.cities.filter((x) => index.provinceByCode.get(x.provinceCode)?.regionCode === r.code)
      : index.cities;
    // "Quezon City" also matches the towns named Quezon; "City" picks the city.
    c = findByName(pool, city) || (/\bcity\b/i.test(city) ? findByName(pool.filter((x) => x.isCity), city) : null);
  }

  if (c && !p) p = index.provinceByCode.get(c.provinceCode);
  if (p && !r) r = index.regionByCode.get(p.regionCode);
  return { region: r, province: p, city: c };
}
