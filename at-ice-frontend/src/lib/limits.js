import { useEffect, useState } from "react";

// The most of one product on a delivery, loading count or confirmation. The one
// value lives on the server (config/atice.php, GET /api/limits); 500 is only
// used until it arrives or when it cannot be reached.
export const DEFAULT_MAX_QUANTITY = 500;

let cached = null;

export function useMaxQuantity() {
  const [max, setMax] = useState(cached ?? DEFAULT_MAX_QUANTITY);

  useEffect(() => {
    if (cached !== null) return undefined;
    let cancelled = false;
    fetch("/api/limits", {
      headers: { Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const n = Number(data?.max_product_quantity);
        if (n > 0) {
          cached = n;
          if (!cancelled) setMax(n);
        }
      })
      .catch(() => { /* keep the default */ });
    return () => { cancelled = true; };
  }, []);

  return max;
}
