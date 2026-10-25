import { useEffect, useMemo, useState } from "react";
import CustomerLayout from "../../components/CustomerLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toList } from "../../lib/list";
import { useLiveTick } from "../../lib/live";
import { formatDateTime, manilaDate, todayManila } from "../../lib/time";
import TopUpForm from "../../components/TopUpForm";
import AdjustmentRequestPanel from "./AdjustmentRequestPanel";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import FilterSelect from "../../components/FilterSelect";
import { KpiCard, KpiGrid } from "../../components/Kpi";

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
  queued: "Queued",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_BADGE = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  queued: "bg-violet-500/10 text-violet-700 border-violet-500/20",
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
  const [topUp, setTopUp] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  // "may be delayed" notices: the delivery went to another driver
  const [notices, setNotices] = useState([]);

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
    fetch("/api/my-delivery-notices", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((n) => setNotices(toList(n)))
      .catch(() => {});
  }, [live, reloadTick]);

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

  const pager = usePagination(visible);

  return (
    <CustomerLayout pageTitle="My Deliveries" breadcrumb="Deliveries">
      {notices.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          {notices.map((n) => (
            <div key={n.id} className="px-3.5 py-2.5 rounded-md bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
              {n.message}
            </div>
          ))}
        </div>
      )}
      {loading ? (
        <SkeletonList card />
      ) : error ? (
        <div className="bg-red-500/[0.06] border border-red-500/20 rounded-md p-6 text-sm text-red-600">{error}</div>
      ) : (
        <>
          <KpiGrid cols={4}>
            <KpiCard label="Deliveries" icon="truck" tone="cyan" value={counts.all || 0} sub="All your deliveries" onClick={() => setFilter("all")} active={filter === "all"} />
            <KpiCard label="Pending" icon="clock" tone="amber" value={counts.pending || 0} sub="Scheduled, not yet on the road" bar={counts.all ? (counts.pending || 0) / counts.all : 0} onClick={() => setFilter("pending")} active={filter === "pending"} />
            <KpiCard label="In transit" icon="truck" tone="cyan" value={counts.in_transit || 0} sub="On the way to you" live={(counts.in_transit || 0) > 0} bar={counts.all ? (counts.in_transit || 0) / counts.all : 0} onClick={() => setFilter("in_transit")} active={filter === "in_transit"} />
            <KpiCard label="Delivered" icon="check" tone="emerald" value={counts.delivered || 0} sub="Confirmed with a photo proof" bar={counts.all ? (counts.delivered || 0) / counts.all : 0} onClick={() => setFilter("delivered")} active={filter === "delivered"} />
          </KpiGrid>
          <div className="bg-white border border-black/[0.09] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <FilterSelect label="Status" value={filter} onChange={setFilter}
              options={FILTERS.map((f) => ({ value: f.key, label: f.label, count: counts[f.key] || 0 }))} />
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
                    {pager.pageItems.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">
                          {d.delivery_no}
                          {d.is_top_up && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border bg-cyan-50 text-cyan-800 border-cyan-200">Top-up</span>}
                        </td>
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
                <Pagination pager={pager} />
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

            {/* Fewer or more sacks on this delivery before it arrives: a request
                the plant applies or declines (AdjustmentRequestPanel.jsx) */}
            <div className="px-5 pb-3 empty:hidden">
              <AdjustmentRequestPanel
                key={`${selected.id}-${selected.adjustment_request?.id || 0}-${selected.adjustment_request?.status || ""}`}
                delivery={selected}
                onChanged={() => { setSelected(null); setReloadTick((t) => t + 1); }}
              />
            </div>

            {/* Ran out after today's delivery: an urgent top-up by a later time
                (App\Support\DeliveryAdjust::topUp); its own delivery and invoice. */}
            {selected.status !== "cancelled" && manilaDate(selected.scheduled_date) === todayManila() && (
              <div className="px-5 pb-5">
                <div className="rounded-lg border border-cyan-200 bg-cyan-50/50 p-3">
                  {topUp ? (
                    <>
                      <div className="text-[13px] font-semibold text-slate-800 mb-2">Urgent top-up for today</div>
                      <TopUpForm url={`/api/my-deliveries/${selected.id}/top-up`} onCancel={() => setTopUp(false)} onDone={() => { setTopUp(false); setSelected(null); setReloadTick((t) => t + 1); }} />
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="mr-auto text-[12px] text-slate-700">Ran out of ice? Ask for more sacks later today.</div>
                      <button type="button" data-no-confirm onClick={() => setTopUp(true)} title="Ask for another delivery today" className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium cursor-pointer">Request urgent top-up</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}