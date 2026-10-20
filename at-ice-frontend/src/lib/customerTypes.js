// Customer types (categories) and the chains in each, the same list as
// App\Models\Customer::TYPES and Customer::KNOWN_CHAINS on the backend. A
// customer's type picks its reference prices (CRM > Customer Prices).

// The three groups of the client's reference pricing (owner, 2026-10-20).
export const CUSTOMER_TYPES = {
  dealer: {
    label: "Dealers",
    examples: "Ice dealers, resellers, sari-sari stores, small eateries and every independent store",
  },
  supermarket: {
    label: "SM Malls",
    examples: "SM, Savemore, Puregold, Robinsons and other supermarkets and malls, and big restaurant chains such as Jollibee and McDonald's",
  },
  convenience_store: {
    label: "Alfamart",
    examples: "Alfamart, 7-Eleven, Ministop, Lawson, FamilyMart and other convenience stores",
  },
};

// Chain name => customer type. Matched to the start of a customer's name too
// ("SM Hypermarket Tungko" => SM, Supermarket / Mall).
export const KNOWN_CHAINS = {
  // Supermarkets and malls: SM Malls prices
  "SM": "supermarket", "Savemore": "supermarket", "Puregold": "supermarket", "Robinsons": "supermarket",
  "Shopwise": "supermarket", "WalterMart": "supermarket", "Landmark": "supermarket", "Metro": "supermarket",
  "Gaisano": "supermarket", "S&R": "supermarket", "Ever": "supermarket", "Super8": "supermarket",
  "AllDay": "supermarket", "Rustan's": "supermarket", "Unimart": "supermarket",
  // Convenience stores: Alfamart prices
  "7-Eleven": "convenience_store", "Alfamart": "convenience_store", "Ministop": "convenience_store",
  "Lawson": "convenience_store", "FamilyMart": "convenience_store", "Uncle John's": "convenience_store",
  "Dali": "convenience_store", "Puregold Jr.": "convenience_store",
  // Big restaurant chains (corporate accounts): SM Malls prices
  "Jollibee": "supermarket", "McDonald's": "supermarket", "Chowking": "supermarket", "Mang Inasal": "supermarket",
  "Greenwich": "supermarket", "Red Ribbon": "supermarket", "KFC": "supermarket", "Max's": "supermarket",
  "Shakey's": "supermarket", "Bonchon": "supermarket", "Army Navy": "supermarket", "Potato Corner": "supermarket",
  "Zagu": "supermarket", "Fruitas": "supermarket", "Dunkin": "supermarket", "Goto ni Juan": "supermarket",
  "Siomai House": "supermarket", "Zarks Burger": "supermarket", "Chooks to Go": "supermarket", "Cabalen": "supermarket",
  "Giligan's": "supermarket", "Kyu Kyu Ramen": "supermarket", "Hongkong Noodles": "supermarket", "Paotsin": "supermarket",
  "Rice N Box": "supermarket", "Buko Juan": "supermarket", "Infinitea": "supermarket", "Jessie Cane": "supermarket",
  "Coco Shake": "supermarket", "Samgyeop Masarap": "supermarket", "Gong Cha": "supermarket", "Chatime": "supermarket",
  "Starbucks": "supermarket", "Yellow Cab": "supermarket", "Pizza Hut": "supermarket", "Angel's Burger": "supermarket",
  "Savory": "supermarket",
};

const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();

// The known chain a customer name starts with ("SM Hypermarket" => "SM"), or "".
// The longest match wins, so "Puregold Jr. Muzon" is Puregold Jr., not Puregold.
export function chainFromName(name) {
  const n = ` ${norm(name)} `;
  let best = "";
  for (const chain of Object.keys(KNOWN_CHAINS)) {
    if (n.startsWith(` ${norm(chain)} `) && chain.length > best.length) best = chain;
  }
  return best;
}

// The customer type of a chain (or of the chain a name starts with), else
// Dealers (an independent store).
export function typeForChain(chain, name = "") {
  const c = Object.keys(KNOWN_CHAINS).find((k) => norm(k) === norm(chain)) || chainFromName(name);
  return c ? KNOWN_CHAINS[c] : "dealer";
}

export const CHAIN_NAMES = Object.keys(KNOWN_CHAINS).sort((a, b) => a.localeCompare(b));
