import { useEffect, useMemo, useState } from "react";
import { PAYMENT_BADGE, paymentState } from "../../lib/paymentStatus";
import CustomerLayout from "../../components/CustomerLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toList } from "../../lib/list";
import { useLiveTick } from "../../lib/live";
import { printReceipt } from "../../lib/printReceipt";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import FileField from "../../components/FileField";
import { PROOF_ACCEPT, PROOF_MAX_BYTES, PROOF_METHODS, PROOF_STATUS, openProofFile } from "../../lib/paymentProof";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";

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


const FILTERS = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

// The invoice's one payment badge (lib/paymentStatus.js): Paid only when paid.
function Badge({ receipt }) {
  const b = PAYMENT_BADGE[paymentState(receipt)];
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${b.cls}`}>
      {b.label}
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
  // The open invoice comes back after a refresh (with its payment proof draft).
  const openDraft = useDraft("receipts:open", { selectedId: null }, { when: (v) => v.selectedId != null });
  const { selectedId } = openDraft.values;
  const setSelectedId = openDraft.set.selectedId;
  const [reload, setReload] = useState(0);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["receipts"]);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/my-receipts", { headers: authHeaders() });
        if (!res.ok) throw new Error(`Could not load receipts (${res.status})`);
        setReceipts(toList(await res.json()));
      } catch (err) {
        setError(err.message || "Could not load your invoices.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [live, reload]);

  // Taken from the list, so a sent proof shows at once after the reload.
  const selected = receipts.find((r) => r.id === selectedId) || null;

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

  const pager = usePagination(visible);

  return (
    <CustomerLayout pageTitle="Invoices & Balance" breadcrumb="Billing">
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
              sub={summary.balance > 0 ? "Unpaid and overdue invoices" : "No balance"}
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
              Pay Bella Erin directly using the payment method agreed in your contract. After paying, open the invoice
              and send a photo or PDF of your bank or GCash receipt as proof. The Bella Erin office checks it and marks
              the invoice as Paid; until then it stays unpaid. This page does not accept payments.
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
                {receipts.length === 0 ? "No invoices yet." : "No invoices match your filter."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                      <th className="px-5 py-3 font-medium">Invoice No.</th>
                      <th className="px-3 py-3 font-medium hidden sm:table-cell">Date</th>
                      <th className="px-3 py-3 font-medium text-right">Amount</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.06]">
                    {pager.pageItems.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-800">{r.receipt_no}</td>
                        <td className="px-3 py-3 text-slate-600 hidden sm:table-cell">{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-3 text-slate-800 text-right">{peso(r.total_amount)}</td>
                        <td className="px-3 py-3">
                          <div className="inline-flex flex-col items-center gap-1">
                            <Badge receipt={r} />
                            {paymentState(r) === "rejected" && (
                              <button type="button" onClick={() => setSelectedId(r.id)}
                                className="px-2.5 py-0.5 rounded-full border border-red-200 bg-white text-[11px] font-semibold text-red-800 hover:bg-red-50 cursor-pointer">
                                Upload a new proof
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => setSelectedId(r.id)} className="text-cyan-600 hover:text-cyan-700 font-medium">
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
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setSelectedId(null)} />
          <div className="relative bg-white rounded-xl border border-black/[0.09] shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-black/[0.09] flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">{selected.receipt_no}</div>
                <div className="mt-1"><Badge receipt={selected} /></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => printReceipt(selected)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-black/[0.09] text-slate-600 hover:bg-slate-50 text-[12px]">
                  <PrintIcon /> Print
                </button>
                <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-700 text-lg leading-none px-2" aria-label="Close">
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
              <PaymentProofSection key={selected.id} receipt={selected} onSent={() => setReload((n) => n + 1)} />
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}
// Proof of payment for one invoice: past submissions with their status (and the
// reason when rejected), and, for an unpaid or overdue invoice with nothing
// under review, the form to send one. Sending it does not mark the invoice paid.
function PaymentProofSection({ receipt, onSent }) {
  const [file, setFile] = useState(null);
  // Method and reference survive a refresh; the file has to be chosen again.
  const draft = useDraft(`receipts:proof:${receipt.id}`, { method: "", referenceNo: "" });
  const { method, referenceNo } = draft.values;
  const { method: setMethod, referenceNo: setReferenceNo } = draft.set;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const proofs = receipt.payment_proofs || [];
  const pending = proofs.some((p) => p.status === "pending");
  const canSend = receipt.payment_status !== "paid" && !pending;
  const lastRejected = proofs[0]?.status === "rejected";

  const send = async (e) => {
    e.preventDefault();
    if (!file) { setError("Attach a photo or PDF of your payment receipt."); return; }
    setSending(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      if (method) body.append("method", method);
      if (referenceNo.trim()) body.append("reference_no", referenceNo.trim());
      const res = await fetch(`/api/my-receipts/${receipt.id}/payment-proofs`, { method: "POST", headers: authHeaders(), body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const first = data?.errors && Object.values(data.errors)[0]?.[0];
        throw new Error(first || data?.message || "Couldn't send the payment proof.");
      }
      toast.success(`Payment proof for ${receipt.receipt_no} sent. We'll check it soon.`);
      setFile(null); draft.clear();
      onSent();
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const open = (p) => openProofFile(`/api/my-payment-proofs/${p.id}/file`, p.original_name).catch((err) => toast.error(err.message));
  const field = "w-full bg-slate-50 border border-black/[0.09] rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-cyan-500";

  if (!proofs.length && receipt.payment_status === "paid") return null;

  return (
    <div className="mt-5 pt-4 border-t border-black/[0.09]">
      <div className="text-xs font-semibold text-slate-800">Payment proof</div>

      {proofs.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {proofs.map((p) => {
            const st = PROOF_STATUS[p.status] || PROOF_STATUS.pending;
            return (
              <li key={p.id} className="border border-black/[0.09] rounded-md px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>{st.label}</span>
                  <span className="text-slate-400">Sent {fmtDate(p.created_at)}</span>
                </div>
                <div className="mt-1.5 text-slate-600">
                  {[p.method_label, p.reference_no && `Ref. ${p.reference_no}`].filter(Boolean).join(" · ") || "No method or reference given"}
                </div>
                {p.status === "rejected" && p.reject_reason && (
                  <div className="mt-1.5 px-2 py-1.5 rounded bg-red-500/[0.06] text-red-600">Reason: {p.reject_reason}</div>
                )}
                <button type="button" onClick={() => open(p)} className="mt-1.5 text-cyan-600 hover:text-cyan-700 font-medium">
                  View file{p.is_pdf ? " (PDF)" : ""}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pending && (
        <p className="mt-2 text-[11px] text-slate-500">
          Your proof is being checked. The invoice stays unpaid until it is approved.
        </p>
      )}

      {canSend && (
        <form onSubmit={send} className="mt-3 flex flex-col gap-2.5">
          <p className="text-[11px] text-slate-500">
            {lastRejected ? "Send a new proof with the issue fixed." : "Already paid? Send a photo or PDF of your bank or GCash receipt."} It
            does not mark the invoice paid; the office checks it first.
          </p>
          <DraftHint draft={draft} />
          <div className="block">
            <span className="text-[11px] text-slate-500">Receipt photo or PDF<span className="text-red-500"> *</span></span>
            <FileField
              className="mt-1"
              file={file}
              onChange={setFile}
              accept={PROOF_ACCEPT}
              maxBytes={PROOF_MAX_BYTES}
              onError={setError}
              label="Choose a photo or PDF"
              hint="PNG, JPG, WEBP or PDF, up to 5 MB"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-slate-500">Method</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={`mt-1 ${field}`}>
                <option value="">Not set</option>
                {Object.entries(PROOF_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">Reference No.</span>
              <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} maxLength={100} placeholder="Optional" className={`mt-1 ${field}`} />
            </label>
          </div>
          {error && <div className="text-[11px] text-red-600">{error}</div>}
          <button type="submit" disabled={sending} className="self-end px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-medium disabled:opacity-50">
            {sending ? "Sending…" : "Send payment proof"}
          </button>
        </form>
      )}
    </div>
  );
}
