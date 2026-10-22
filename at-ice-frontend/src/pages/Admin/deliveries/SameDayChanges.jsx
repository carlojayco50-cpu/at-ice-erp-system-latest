import { useEffect, useState } from "react";
import TopUpForm from "../../../components/TopUpForm";
import { ICE_PRODUCTS, iceProductLabel as label } from "../../../lib/iceProducts";
import { formatDateTime, manilaDate, todayManila } from "../../../lib/time";
import { toast } from "../../../lib/toast";

// Same-day changes on Admin's delivery view (App\Support\DeliveryAdjust):
// add or reduce sacks on this one delivery when its store asks Admin directly
// (by sacks or %; requests the store sends from its portal are in
// AdjustmentRequests.jsx), an
// urgent top-up after one of today's deliveries, and the history of changes.
// The Driver and the Salesman get a notice; the Salesman's confirmation starts
// from the new load, so the invoice follows.

const OPEN = ["pending", "queued", "in_transit"];
const inputCls = "w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-[13px] text-slate-700 outline-none focus:border-cyan-500/60 shadow-inner";
const headers = (json) => ({ Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token")}`, ...(json ? { "Content-Type": "application/json" } : {}) });

function AdjustForm({ delivery, onDone }) {
  const [form, setForm] = useState({ mode: "reduce", by: "count", value: "", product_type: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setError(""); };

  const submit = async () => {
    if (!Number(form.value)) return setError("Enter how many sacks or what percentage.");
    if (form.reason.trim().length < 3) return setError("Write the reason, e.g. Heavy rain.");
    setBusy(true);
    try {
      const res = await fetch(`/api/deliveries/${delivery.id}/adjust`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ ...form, value: Number(form.value), product_type: form.product_type || null, reason: form.reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "The change could not be saved.");
      toast.success(`${delivery.delivery_no}: sacks ${form.mode === "add" ? "added" : "reduced"}.`);
      setForm({ ...form, value: "", reason: "" });
      onDone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-600">Change</span>
          <select value={form.mode} onChange={set("mode")} className={inputCls}><option value="reduce">Reduce</option><option value="add">Add</option></select></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-600">By</span>
          <select value={form.by} onChange={set("by")} className={inputCls}><option value="count">Sacks</option><option value="percent">Percent</option></select></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-600">{form.by === "percent" ? "Percent" : "Sacks"}</span>
          <input type="number" min={1} max={form.by === "percent" ? 100 : 1000} value={form.value} onChange={set("value")} className={inputCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-600">Product</span>
          <select value={form.product_type} onChange={set("product_type")} className={inputCls}>
            <option value="">Every product</option>
            {ICE_PRODUCTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select></label>
      </div>
      <input value={form.reason} maxLength={200} onChange={set("reason")} placeholder="Reason, e.g. Store called: heavy rain, wants less" className={inputCls} aria-label="Reason" />
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      <div className="flex justify-end">
        <button type="button" disabled={busy} onClick={submit} title="Change the sacks on this delivery; the Driver and Salesman are told" className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium cursor-pointer disabled:opacity-50">
          {busy ? "Saving…" : form.mode === "add" ? "Add sacks" : "Reduce sacks"}
        </button>
      </div>
    </div>
  );
}

export default function SameDayChanges({ delivery, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [mode, setMode] = useState("");
  const [tick, setTick] = useState(0);

  // the delivery with its top-ups and change history (reloads after a change)
  useEffect(() => {
    let stop = false;
    fetch(`/api/deliveries/${delivery.id}`, { headers: headers() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !stop && data && setDetail(data))
      .catch(() => {});
    return () => { stop = true; };
  }, [delivery.id, tick]);

  const d = detail || delivery;
  const open = OPEN.includes(d.status);
  const canTopUp = d.customer_id && d.status !== "cancelled" && manilaDate(d.scheduled_date) === todayManila();
  const done = () => { setMode(""); setTick((t) => t + 1); onChanged?.(); };

  if (!open && !canTopUp && !(detail?.adjustments || []).length && !detail?.parent) return null;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-black/[0.08] bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] text-slate-500 uppercase tracking-wide mr-auto">Same-day changes</div>
        {open && <button type="button" data-no-confirm aria-expanded={mode === "adjust"} onClick={() => setMode(mode === "adjust" ? "" : "adjust")} title="Add or reduce sacks before it is delivered" className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-black/[0.09] text-slate-700 hover:bg-white cursor-pointer">Add / reduce sacks</button>}
        {canTopUp && <button type="button" data-no-confirm aria-expanded={mode === "topup"} onClick={() => setMode(mode === "topup" ? "" : "topup")} title="Book another delivery today to this store" className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-cyan-300 text-cyan-800 bg-cyan-50 hover:bg-cyan-100 cursor-pointer">Urgent top-up</button>}
      </div>

      {detail?.is_top_up && detail?.parent && <div className="text-[12px] text-cyan-800">Urgent top-up after {detail.parent.delivery_no}.</div>}
      {(detail?.top_ups || []).length > 0 && (
        <div className="text-[12px] text-slate-600">Top-ups today: {detail.top_ups.map((t) => `${t.delivery_no} (${t.status.replace("_", " ")})`).join(", ")}</div>
      )}

      {mode === "adjust" && <AdjustForm delivery={d} onDone={done} />}
      {mode === "topup" && <TopUpForm url={`/api/deliveries/${d.id}/top-up`} onDone={done} onCancel={() => setMode("")} />}

      {(detail?.adjustments || []).length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {detail.adjustments.map((a) => (
            <li key={a.id} className="text-[12px] text-slate-600 bg-white border border-black/[0.06] rounded-md px-2.5 py-1.5">
              <span className="font-medium text-slate-800">{{ top_up: "Top-up", add: "Added", reduce: "Reduced", change: "Changed" }[a.kind] || "Changed"}</span>
              {" · "}{a.changes.map((c) => `${label(c.product_type)} ${c.before} → ${c.after}`).join(", ")}
              <div className="text-[11px] text-slate-400">{a.reason} · {a.source === "customer" ? "by the store" : a.user?.name || "Admin"} · {formatDateTime(a.created_at, { year: false })}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
