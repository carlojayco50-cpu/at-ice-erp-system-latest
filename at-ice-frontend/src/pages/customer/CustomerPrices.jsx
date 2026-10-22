import { useEffect, useState } from "react";
import CustomerLayout from "../../components/CustomerLayout";
import { ICE_CARD, ICE_INSET } from "../../lib/company";
import { SkeletonList } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import { MiniBars, TipsWidget } from "../../components/Insight";

const authHeaders = () => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const peso = (n) =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Display only. The prices come from GET /api/my-prices and are set per
// customer by the Admin (Customer Prices page); nothing here changes them.
const PRODUCTS = [
  { key: "bags", name: "5KGS Tube Ice", label: "Bags", unit: "bag" },
  { key: "small_sack", name: "30KGS Tube Ice", label: "Small Sack", unit: "sack" },
  { key: "big_sack", name: "50KGS Tube Ice", label: "Big Sack", unit: "sack" },
];

export default function CustomerPrices() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["prices"]);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/my-prices", { headers: authHeaders() });
        if (!res.ok) throw new Error(`Could not load prices (${res.status})`);
        setData(await res.json());
      } catch (err) {
        setError(err.message || "Could not load your prices.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [live]);

  const rateLabel = `${data?.customer_name || "Your"} Contract Rate`;

  return (
    <CustomerLayout pageTitle="My Prices" breadcrumb="Billing">
      {loading ? (
        <SkeletonList card />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-sm text-red-600">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PRODUCTS.map((p) => {
              const price = data?.prices?.[p.key];
              return (
                <div key={p.key} className={`${ICE_CARD} p-6`}>
                  <div className="text-[15px] font-bold tracking-wide uppercase text-slate-800">{p.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{p.label}</div>
                  <div className={`${ICE_INSET} px-4 py-4 mt-5`}>
                    <div className="text-[11px] text-slate-500">{rateLabel}:</div>
                    {price === null || price === undefined ? (
                      <div className="text-[14px] font-medium text-slate-400 mt-2">Not set yet</div>
                    ) : (
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-[28px] font-bold font-mono text-cyan-600 leading-tight">{peso(price)}</span>
                        <span className="text-[12px] text-slate-500">/ {p.unit}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 px-1">
            Prices are set by the Bella Erin office for your account. To ask about a rate, send a Contract Rate or
            Volume Discount Review message from Contact Support.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <MiniBars
              title="Price per kilo"
              subtitle="The bigger the pack, the less each kilo costs (₱ per kg)"
              data={PRODUCTS.map((p) => {
                const price = data?.prices?.[p.key];
                const kg = { bags: 5, small_sack: 30, big_sack: 50 }[p.key];
                return { label: p.label, value: price ? Math.round((Number(price) / kg) * 100) / 100 : 0 };
              })}
            />
            <TipsWidget title="Good to know" tips={[
              { title: "Your contract rate", text: "These prices apply to every delivery to your store, and they show on each invoice.", tone: "cyan", icon: "tag" },
              { title: "Ordering more?", text: "Ask for a Volume Discount Review from Contact Support.", tone: "emerald", icon: "chart" },
              { title: "A product not priced yet", text: "The office sets it before your first delivery of that size.", tone: "amber", icon: "alert" },
            ]} />
          </div>
        </>
      )}
    </CustomerLayout>
  );
}
