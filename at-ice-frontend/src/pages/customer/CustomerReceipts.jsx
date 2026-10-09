import { useEffect, useMemo, useState } from "react";
import CustomerLayout from "../../components/CustomerLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toList } from "../../lib/list";
import { useLiveTick } from "../../lib/live";
import { printReceipt } from "../../lib/printReceipt";

const authHeaders = () => ({
  Accept: "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const peso = (n) =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (v) => {
  if (!v) return "Not set";
  const d = new Date(v);
  if (isNaN(d)) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const PrintIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;

const PRODUCT_LABEL = {
  bags: "Bags (5kg)",
  small_sack: "Small Sack (30kg)",
  big_sack: "Big Sack (50kg)",
};

const PAY_LABEL = { paid: "Paid", unpaid: "Unpaid", overdue: "Overdue" };
const PAY_BADGE = {
  paid: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  unpaid: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  overdue: "bg-red-500/10 text-red-600 border-red-500/20",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

function Badge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${PAY_BADGE[status] || ""}`}>
      {PAY_LABEL[status] || status}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-black/[0.09] rounded-xl p-4">
      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold text-slate-800 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function CustomerReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["receipts"]);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/my-receipts", { headers: authHeaders() });
        if (!res.ok) throw new Error(`Could not load receipts (${res.status})`);
        setReceipts(toList(await res.json()));
      } catch (err) {
        setError(err.message || "Could not load your receipts.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [live]);

  const summary = useMemo(() => {
    const sum = (list) => list.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const overdue = receipts.filter((r) => r.payment_status === "overdue");
    const unpaid = receipts.filter((r) => r.payment_status === "unpaid");
    const paid = receipts.filter((r) => r.payment_status === "paid");
    return {
      balance: sum(overdue) + sum(unpaid),
      overdueAmount: sum(overdue),
      overdueCount: overdue.length,
      paidAmount: sum(paid),
      paidCount: paid.length,
    };
  }, [receipts]);

  const counts = useMemo(() => {
    const c = { all: receipts.length };
    receipts.forEach((r) => { c[r.payment_status] = (c[r.payment_status] || 0) + 1; });
    return c;
  }, [receipts]);

  const visible = receipts.filter((r) => filter === "all" || r.payment_status === filter);

  return (
    <CustomerLayout pageTitle="Receipts & Balance" breadcrumb="Billing">
      {loading ? (
        <SkeletonList card />
      ) : error ? (
        <div className="bg-red-500/[0.06] border border-red-500/20 rounded-md p-6 text-sm text-red-600">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Balance Due"
              value={peso(summary.balance)}
              sub={summary.balance > 0 ? "Unpaid and overdue receipts" : "No balance"}
            />
            <StatCard
              label="Overdue"
              value={peso(summary.overdueAmount)}
              sub={`${summary.overdueCount} receipt${summary.overdueCount === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Paid"
              value={peso(summary.paidAmount)}
              sub={`${summary.paidCount} receipt${summary.paidCount === 1 ? "" : "s"}`}
            />
          </div>

          <div className="bg-white border border-black/[0.09] rounded-xl px-5 py-4">
            <div className="text-[13px] font-semibold text-slate-800">How to pay</div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Pay Bella Erin directly using the payment method agreed in your contract. Once your payment is received,
              the Bella Erin office marks the receipt as Paid and it will update here. This page does not accept payments
              or change a receipt's status.
            </p>
            <p className="text-xs text-slate-400 mt-1.5">
              Questions about a receipt? See Contact Support in the menu.
            </p>
          </div>

          <div className="bg-white border border-black/[0.09] rounded-xl p-3 flex flex-wrap gap-1.5">
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

          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            {visible.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-slate-400">
                {receipts.length === 0 ? "No receipts yet." : "No receipts match your filter."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                      <th className="px-5 py-3 font-medium">Receipt No.</th>
                      <th className="px-3 py-3 font-medium hidden sm:table-cell">Date</th>
                      <th className="px-3 py-3 font-medium text-right">Amount</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {visible.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{r.receipt_no}</td>
                        <td className="px-3 py-3 text-slate-600 hidden sm:table-cell">{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-3 text-slate-800 text-right">{peso(r.total_amount)}</td>
                        <td className="px-3 py-3"><Badge status={r.payment_status} /></td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => setSelected(r)} className="text-cyan-600 hover:text-cyan-700 font-medium">
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
          <div className="relative bg-white rounded-xl border border-black/[0.09] shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-black/[0.09] flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">{selected.receipt_no}</div>
                <div className="mt-1"><Badge status={selected.payment_status} /></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => printReceipt(selected)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-black/[0.09] text-slate-600 hover:bg-slate-50 text-[12px]">
                  <PrintIcon /> Print
                </button>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-2" aria-label="Close">
                  &times;
                </button>
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="text-xs text-slate-400 mb-3">Issued {fmtDate(selected.created_at)}</div>
              {(selected.items || []).length === 0 ? (
                <div className="text-xs text-slate-400">No item breakdown available.</div>
              ) : (
                <div className="border border-black/[0.09] rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 bg-slate-50">
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium text-right">Qty</th>
                        <th className="px-3 py-2 font-medium text-right">Price</th>
                        <th className="px-3 py-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {selected.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-slate-800">{PRODUCT_LABEL[it.product_type] || it.product_type}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{it.quantity}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{peso(it.unit_price)}</td>
                          <td className="px-3 py-2 text-right text-slate-800">
                            {peso(it.line_total ?? Number(it.quantity || 0) * Number(it.unit_price || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-slate-500">Total</span>
                <span className="font-semibold text-slate-800">{peso(selected.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}