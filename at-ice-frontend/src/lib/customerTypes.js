// Customer types (categories) and the chains in each, the same list as
// App\Models\Customer::TYPES and Customer::KNOWN_CHAINS on the backend. A
// customer's type picks its reference prices (CRM > Customer Prices).

export const CUSTOMER_TYPES = {
  supermarket: {
    label: "Supermarket / Mall",
    examples: "SM, Savemore, Puregold, Robinsons, Shopwise, WalterMart, Landmark, Metro, Gaisano, S&R, Ever, Super8, AllDay",
  },
  convenience_store: {
    label: "Convenience Store",
    examples: "7-Eleven, Alfamart, Ministop, Lawson, FamilyMart, Uncle John's, Dali, Puregold Jr.",
  },
  restaurant: {
    label: "Restaurant / Food",
    examples: "Jollibee, McDonald's, Chowking, Mang Inasal, Greenwich, KFC, Max's, Shakey's, Bonchon, milk tea and juice stalls",
  },
  dealer: {
    label: "Dealer / Reseller",
    examples: "Ice dealers, resellers and sari-sari stores that sell the ice again",
  },
  other: {
    label: "Other",
    examples: "Events, offices, households and anything not above",
  },
};

// Chain name => customer type. Matched to the start of a customer's name too
// ("SM Hypermarket Tungko" => SM, Supermarket / Mall).
export const KNOWN_CHAINS = {
  // Supermarket / Mall
  "SM": "supermarket", "Savemore": "supermarket", "Puregold": "supermarket", "Robinsons": "supermarket",
  "Shopwise": "supermarket", "WalterMart": "supermarket", "Landmark": "supermarket", "Metro": "supermarket",
  "Gaisano": "supermarket", "S&R": "supermarket", "Ever": "supermarket", "Super8": "supermarket",
  "AllDay": "supermarket", "Rustan's": "supermarket", "Unimart": "supermarket",
  // Convenience Store
  "7-Eleven": "convenience_store", "Alfamart": "convenience_store", "Ministop": "convenience_store",
  "Lawson": "convenience_store", "FamilyMart": "convenience_store", "Uncle John's": "convenience_store",
  "Dali": "convenience_store", "Puregold Jr.": "convenience_store",
  // Restaurant / Food
  "Jollibee": "restaurant", "McDonald's": "restaurant", "Chowking": "restaurant", "Mang Inasal": "restaurant",
  "Greenwich": "restaurant", "Red Ribbon": "restaurant", "KFC": "restaurant", "Max's": "restaurant",
  "Shakey's": "restaurant", "Bonchon": "restaurant", "Army Navy": "restaurant", "Potato Corner": "restaurant",
  "Zagu": "restaurant", "Fruitas": "restaurant", "Dunkin": "restaurant", "Goto ni Juan": "restaurant",
  "Siomai House": "restaurant", "Zarks Burger": "restaurant", "Chooks to Go": "restaurant", "Cabalen": "restaurant",
  "Giligan's": "restaurant", "Kyu Kyu Ramen": "restaurant", "Hongkong Noodles": "restaurant", "Paotsin": "restaurant",
  "Rice N Box": "restaurant", "Buko Juan": "restaurant", "Infinitea": "restaurant", "Jessie Cane": "restaurant",
  "Coco Shake": "restaurant", "Samgyeop Masarap": "restaurant", "Gong Cha": "restaurant", "Chatime": "restaurant",
  "Starbucks": "restaurant", "Yellow Cab": "restaurant", "Pizza Hut": "restaurant", "Angel's Burger": "restaurant",
  "Savory": "restaurant",
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

// Words in a name that say it is a food business (Customer::FOOD_WORDS).
const FOOD_WORDS = /\b(food|foods|kitchen|grill|grille|chicken|tea|coffee|cafe|café|bakery|bakeshop|waffles?|lemon|lemonade|float|buko|juice|shake|bibingka|lechon|bbq|barbecue|pizza|burger|ramen|noodles?|siomai|eatery|carinderia|restaurant|resto|bistro|kainan|milk ?tea|halo-?halo|avocado\w*)\b/i;

// The customer type of a chain (or of the chain a name starts with), else
// Restaurant / Food for a food word in the name, else "".
export function typeForChain(chain, name = "") {
  const c = Object.keys(KNOWN_CHAINS).find((k) => norm(k) === norm(chain)) || chainFromName(name);
  if (c) return KNOWN_CHAINS[c];
  return FOOD_WORDS.test(String(name || "")) ? "restaurant" : "";
}

export const CHAIN_NAMES = Object.keys(KNOWN_CHAINS).sort((a, b) => a.localeCompare(b));
