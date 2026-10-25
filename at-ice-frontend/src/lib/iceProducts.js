// Ice product types (same keys as Customer Prices, delivery items and invoices).
export const ICE_PRODUCTS = [
  { value: "bags", label: "Bags (5kg)" },
  { value: "small_sack", label: "Small Sack (30kg)" },
  { value: "big_sack", label: "Big Sack (50kg)" },
];

export const iceProductLabel = (t) => ICE_PRODUCTS.find((p) => p.value === t)?.label || t;
