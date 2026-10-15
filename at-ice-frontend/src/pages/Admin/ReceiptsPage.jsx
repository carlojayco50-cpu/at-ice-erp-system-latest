import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { SkeletonTableRows } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import { printReceipt } from "../../lib/printReceipt";

window.Pusher = Pusher;
const echo = new Echo({
  broadcaster: "pusher",
  key: import.meta.env.VITE_PUSHER_APP_KEY,
  cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER,
  forceTLS: true,
});

// Icons
const SearchIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const XIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const EyeIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const CheckIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>;
const BellIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;

const STATUS_STYLE = {
  unpaid:   { bg: "bg-amber-50",  text: "text-amber-700" },
  overdue:  { bg: "bg-red-50",    text: "text-red-700"   },
  paid:     { bg: "bg-green-50",  text: "text-green-700" },
};

const FILTERS = [
  { key: "all",     label: "All" },
  { key: "unpaid",  label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid",    label: "Paid" },
];

const PrintIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;

const MOP_LABELS = { cash: "Cash", gcash: "GCash", check: "Cheque", bank_transfer: "Bank Transfer" };

function token() { return localStorage.getItem("token") || ""; }
function authHeaders() {
  return { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token()}` };
}
function peso(n) { return `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`; }

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState([]);
  const [summary, setSummary]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState("all");

  const [viewing, setViewing]           = useState(null);
  const [payTarget, setPayTarget]       = useState(null);
  const [payMethod, setPayMethod]       = useState("cash");
  const [saving, setSaving]             = useState(false);

  const [liveNotice, setLiveNotice]     = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // The list and summary mark overdue receipts themselves (Receipt::markOverdue).
      const [listRes, summaryRes] = await Promise.all([
        fetch(`/api/receipts`, { headers: authHeaders() }),
        fetch(`/api/receipts/summary`, { headers: authHeaders() }),
      ]);
      if (!listRes.ok) throw new Error(`Request failed (${listRes.status})`);

      const [listData, summaryData] = await Promise.all([listRes.json(), summaryRes.json()]);
      setReceipts(Array.isArray(listData) ? listData : []);
      setSummary(summaryData);
    } catch (err) {
      setError("Couldn't load receipts. Check that the backend is running.");
      console.error("fetchAll error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["receipts", "deliveries"]);
  useEffect(() => { fetchAll(); }, [fetchAll, live]);

  // Live overdue notifications — public "payments" channel, "payment.overdue"
  // event, one broadcast per receipt from ReceiptController@overdue().
  useEffect(() => {
    const channel = echo.channel("payments");
    channel.listen(".payment.overdue", (e) => {
      setLiveNotice(e.message || `Receipt ${e.receipt_no} is overdue.`);
      fetchAll();
    });
    return () => { echo.leaveChannel("payments"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmMarkPaid() {
    if (!payTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/receipts/${payTarget.id}/paid`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ payment_method: payMethod }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Failed to mark receipt as paid.");
      setPayTarget(null);
      setPayMethod("cash");
      fetchAll();
    } catch (err) {
      setError(err.message);
      setPayTarget(null);
    } finally {
      setSaving(false);
    }
  }

  const filtered = receipts.filter((r) => {
    if (filter !== "all" && r.payment_status !== filter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const haystack = `${r.receipt_no} ${r.customer?.name ?? ""} ${r.salesman?.name ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });

  return (
    <AdminLayout pageTitle="Receipts" breadcrumb="CRM / Receipts">
      {liveNotice && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700">
          <BellIcon /> {liveNotice}
          <button onClick={() => setLiveNotice(null)} className="ml-auto text-red-400 hover:text-red-600">
            <XIcon />
          </button>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <SummaryCard label="Total Sales (Paid)" value={peso(summary.total_sales)} color="text-slate-800" />
          <SummaryCard label="Unpaid" value={peso(summary.total_unpaid)} color="text-amber-600" />
          <SummaryCard label="Overdue" value={peso(summary.total_overdue)} color="text-red-600" />
          <SummaryCard label="Total Receipts" value={summary.receipt_count} color="text-slate-800" />
        </div>
      )}

      <div className="bg-white border border-black/[0.09] rounded-xl">
        <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Receipts</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Auto-generated when a Salesman confirms a delivery. Unpaid receipts older than 15 days are marked overdue automatically.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-black/[0.09] rounded-lg px-3 py-1.5">
            <SearchIcon />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt..."
              className="bg-transparent outline-none text-[13px] text-slate-700 placeholder:text-slate-400 w-44"
            />
          </div>
        </div>

        <div className="px-[18px] pt-3 flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                filter === f.key ? "bg-cyan-500 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-[18px] mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-slate-400 text-[11px] uppercase tracking-widest">
                <th className="px-[18px] py-2.5 font-medium">Receipt No.</th>
                <th className="px-[18px] py-2.5 font-medium">Customer</th>
                <th className="px-[18px] py-2.5 font-medium">Salesman</th>
                <th className="px-[18px] py-2.5 font-medium">Amount</th>
                <th className="px-[18px] py-2.5 font-medium">Status</th>
                <th className="px-[18px] py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <SkeletonTableRows cols={6} />
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-[18px] py-8 text-center text-slate-400 text-[13px]">
                  {search || filter !== "all" ? "No receipts match your filters." : "No receipts yet."}
                </td></tr>
              )}
              {!loading && filtered.map((r) => {
                const style = STATUS_STYLE[r.payment_status] || STATUS_STYLE.unpaid;
                return (
                  <tr key={r.id} className="border-t border-black/[0.06]">
                    <td className="px-[18px] py-2.5 font-mono text-slate-700">{r.receipt_no}</td>
                    <td className="px-[18px] py-2.5 text-slate-700">{r.customer?.name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-[18px] py-2.5 text-slate-600">{r.salesman?.name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-[18px] py-2.5 font-mono text-slate-700">{peso(r.total_amount)}</td>
                    <td className="px-[18px] py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${style.bg} ${style.text}`}>
                        {r.payment_status}
                      </span>
                    </td>
                    <td className="px-[18px] py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => setViewing(r)} className="p-1.5 rounded-md border border-black/[0.09] text-slate-500 hover:bg-slate-50" title="View">
                          <EyeIcon />
                        </button>
                        <button onClick={() => printReceipt(r)} className="p-1.5 rounded-md border border-black/[0.09] text-slate-500 hover:bg-slate-50" title="Print receipt" aria-label={`Print ${r.receipt_no}`}>
                          <PrintIcon />
                        </button>
                        {r.payment_status !== "paid" && (
                          <button
                            onClick={() => { setPayTarget(r); setPayMethod("cash"); }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-black/[0.09] text-cyan-600 hover:bg-cyan-50 text-[12px]"
                          >
                            <CheckIcon /> Mark Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View receipt modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-black/[0.09] w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-black/[0.09] flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-slate-800">{viewing.receipt_no}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => printReceipt(viewing)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-black/[0.09] text-slate-600 hover:bg-slate-50 text-[12px]">
                  <PrintIcon /> Print
                </button>
                <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                  <XIcon />
                </button>
              </div>
            </div>
            <div className="p-5 flex flex-col gap-3 text-[13px]">
              <Row label="Customer" value={viewing.customer?.name || "—"} />
              <Row label="Salesman" value={viewing.salesman?.name || "—"} />
              <Row label="Delivery" value={viewing.delivery?.delivery_no || "—"} />
              <Row label="Status" value={<span className="capitalize">{viewing.payment_status}</span>} />
              {viewing.payment_status === "paid" && (
                <>
                  <Row label="Paid Via" value={MOP_LABELS[viewing.payment_method] || viewing.payment_method || "—"} />
                  <Row label="Paid At" value={viewing.paid_at ? new Date(viewing.paid_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"} />
                </>
              )}
              <div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-1.5">Items</div>
                <div className="flex flex-col gap-1.5">
                  {(viewing.items || []).map((it) => (
                    <div key={it.id} className="flex items-center justify-between bg-slate-50 border border-black/[0.09] rounded-md px-3 py-2">
                      <span className="text-slate-700 capitalize">{it.product_type?.replace("_", " ")}</span>
                      <span className="text-slate-500 font-mono text-right">
                        {it.quantity} × ₱{Number(it.unit_price).toFixed(2)} = {peso(it.line_total)}
                        {it.quantity_ordered != null && (
                          <span className={`block text-[11px] ${Number(it.quantity_ordered) === Number(it.quantity) ? "text-slate-400" : "text-amber-600 font-medium"}`}>
                            Ordered {it.quantity_ordered}, delivered {it.quantity}
                            {Number(it.quantity) < Number(it.quantity_ordered) && ` (short by ${it.quantity_ordered - it.quantity})`}
                            {Number(it.quantity) > Number(it.quantity_ordered) && ` (${it.quantity - it.quantity_ordered} over)`}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-black/[0.09] pt-3 mt-1">
                <span className="text-[13px] font-semibold text-slate-800">Total</span>
                <span className="text-[13px] font-semibold font-mono text-slate-800">{peso(viewing.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Paid modal */}
      {payTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-black/[0.09] w-full max-w-sm p-5">
            <h3 className="text-[14px] font-semibold text-slate-800 mb-1.5">Mark as paid?</h3>
            <p className="text-[12px] text-slate-500 mb-4">
              <span className="font-medium text-slate-700">{payTarget.receipt_no}</span> — {peso(payTarget.total_amount)}
            </p>
            <label className="text-[11px] text-slate-500 mb-1 block">Payment Method</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-cyan-500 mb-4"
            >
              {Object.entries(MOP_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPayTarget(null)} className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-slate-600 text-[12px]">
                Cancel
              </button>
              <button onClick={confirmMarkPaid} disabled={saving} className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium disabled:opacity-50">
                {saving ? "Saving…" : "Mark as Paid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-white border border-black/[0.09] rounded-xl px-4 py-3.5">
      <div className={`text-[18px] font-semibold font-mono ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] text-slate-400 uppercase tracking-wide flex-shrink-0">{label}</span>
      <span className="text-slate-700 text-right">{value}</span>
    </div>
  );
}