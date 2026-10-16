import { useEffect, useMemo, useState } from "react";
import CustomerLayout from "../../components/CustomerLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toList } from "../../lib/list";
import { useLiveTick } from "../../lib/live";
import { formatDateTime } from "../../lib/time";

const authHeaders = () => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const fmtDate = (v) => {
  if (!v) return "Not set";
  const d = new Date(v);
  if (isNaN(d)) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const fmtDateTime = (v) => {
  if (!v) return "Not yet";
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return formatDateTime(d);
};

const STATUS_LABEL = {
  pending: "Pending",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_BADGE = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  in_transit: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelled: "bg-slate-200 text-slate-500 border-slate-300",
};

// Ice product types (same keys as Customer Prices and receipts)
const PRODUCT_LABELS = {
  bags: "Bags (5kg)",
  small_sack: "Small Sack (30kg)",
  big_sack: "Big Sack (50kg)",
};
const itemName = (it) =>
  it.product_label ||
  PRODUCT_LABELS[it.product_type] ||
  it.product_name ||
  it.product?.name ||
  "Product";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

function Badge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${STATUS_BADGE[status] || ""}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function CustomerDeliveries() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["deliveries"]);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/my-delivery-history", { headers: authHeaders() });
        if (!res.ok) throw new Error(`Could not load deliveries (${res.status})`);
        setDeliveries(toList(await res.json()));
      } catch (err) {
        setError(err.message || "Could not load your deliveries.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [live]);

  const counts = useMemo(() => {
    const c = { all: deliveries.length };
    deliveries.forEach((d) => { c[d.status] = (c[d.status] || 0) + 1; });
    return c;
  }, [deliveries]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (filter !== "all" && d.status !== filter) return false;
      if (!q) return true;
      return (
        String(d.delivery_no || "").toLowerCase().includes(q) ||
        String(d.driver_name || "").toLowerCase().includes(q)
      );
    });
  }, [deliveries, filter, search]);

  return (
    <CustomerLayout pageTitle="My Deliveries" breadcrumb="Deliveries">
      {loading ? (
        <SkeletonList card />
      ) : error ? (
        <div className="bg-red-500/[0.06] border border-red-500/20 rounded-md p-6 text-sm text-red-600">{error}</div>
      ) : (
        <>
          <div className="bg-white border border-black/[0.09] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                    filter === f.key
                      ? "bg-cyan-500/10 text-cyan-600 border-cyan-500/30 font-medium"
                      : "bg-white text-slate-500 border-black/[0.09] hover:bg-slate-50"
                  }`}
                >
                  {f.label} ({counts[f.key] || 0})
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search delivery number or driver"
              className="sm:ml-auto w-full sm:w-64 px-3 py-1.5 text-xs border border-black/[0.09] rounded-md outline-none focus:border-cyan-500"
            />
          </div>

          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            {visible.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-slate-400">
                {deliveries.length === 0 ? "No deliveries yet." : "No deliveries match your filter."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                      <th className="px-5 py-3 font-medium">Delivery No.</th>
                      <th className="px-3 py-3 font-medium">Scheduled</th>
                      <th className="px-3 py-3 font-medium hidden md:table-cell">Driver</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {visible.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{d.delivery_no}</td>
                        <td className="px-3 py-3 text-slate-600">{fmtDate(d.scheduled_date)}</td>
                        <td className="px-3 py-3 text-slate-600 hidden md:table-cell">{d.driver_name || "Not yet assigned"}</td>
                        <td className="px-3 py-3"><Badge status={d.status} /></td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => setSelected(d)}
                            className="text-cyan-600 hover:text-cyan-700 font-medium"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-xl border border-black/[0.09] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-black/[0.09] flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">{selected.delivery_no}</div>
                <div className="mt-1"><Badge status={selected.status} /></div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-2">
                &times;
              </button>
            </div>

            <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <div className="text-slate-400">Driver</div>
                <div className="text-slate-800 mt-0.5">{selected.driver_name || "Not yet assigned"}</div>
              </div>
              <div>
                <div className="text-slate-400">Confirmed by</div>
                <div className="text-slate-800 mt-0.5">{selected.confirmed_by || "Not yet confirmed"}</div>
              </div>
              <div>
                <div className="text-slate-400">Scheduled date</div>
                <div className="text-slate-800 mt-0.5">{fmtDate(selected.scheduled_date)}</div>
              </div>
              <div>
                <div className="text-slate-400">Dispatched</div>
                <div className="text-slate-800 mt-0.5">{fmtDateTime(selected.dispatched_at)}</div>
              </div>
              <div>
                <div className="text-slate-400">Delivered</div>
                <div className="text-slate-800 mt-0.5">
                  {fmtDateTime(selected.delivered_at || selected.confirmed_at)}
                </div>
              </div>
              {selected.notes && (
                <div className="col-span-2">
                  <div className="text-slate-400">Notes</div>
                  <div className="text-slate-800 mt-0.5">{selected.notes}</div>
                </div>
              )}
            </div>

            <div className="px-5 pb-5">
              <div className="text-[13px] font-semibold text-slate-800 mb-2">Items</div>
              {(selected.items || []).length === 0 ? (
                <div className="text-xs text-slate-400">No items listed.</div>
              ) : (
                <div className="border border-black/[0.09] rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 bg-slate-50">
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {selected.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-slate-800">{itemName(it)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{it.quantity_ordered}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-2 text-[11px] text-slate-400">
                Prices and amounts are shown in Receipts & Balance once your delivery is confirmed.
              </div>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}