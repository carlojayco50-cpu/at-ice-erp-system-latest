import { useState } from "react";
import { toast } from "../lib/toast";
import { ICE_PRODUCTS } from "../lib/iceProducts";

// Urgent top-up (2026-10-22): a store that got today's delivery runs out and
// asks for more sacks by a later time (App\Support\DeliveryAdjust::topUp). The
// same form for the customer portal and Admin's delivery view; `url` is the
// endpoint (my-deliveries/{id}/top-up or deliveries/{id}/top-up).

const inputCls = "w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-[13px] text-slate-700 outline-none focus:border-cyan-500/60 shadow-inner";

// "16:00" two hours from now, rounded up to the half hour (at least 30 minutes ahead)
function defaultTime() {
  const d = new Date(Date.now() + 2 * 3600000);
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0);
  return `${String(Math.min(d.getHours(), 22)).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function TopUpForm({ url, onDone, onCancel, products = ICE_PRODUCTS }) {
  const [qty, setQty] = useState({});
  const [time, setTime] = useState(defaultTime);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const total = Object.values(qty).reduce((s, v) => s + (Number(v) || 0), 0);

  const submit = async () => {
    if (total < 1) {
      setError("Enter how many sacks you need.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const items = Object.fromEntries(Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ items, deliver_by: time, notes: notes.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error("Please wait a minute before asking again.");
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "The top-up could not be booked.");
      toast.success(`Top-up ${data.delivery_no} booked for ${time}.${data.status === "queued" ? " It goes to the next free Driver." : ""}`);
      onDone?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {products.map((p) => (
          <label key={p.value} className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">{p.label}</span>
            <input type="number" inputMode="numeric" min={0} max={1000} value={qty[p.value] ?? ""} placeholder="0"
              onChange={(e) => { setQty({ ...qty, [p.value]: e.target.value }); setError(""); }} className={inputCls} />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Deliver by (today)</span>
          <input type="time" value={time} onChange={(e) => { setTime(e.target.value); setError(""); }} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Note (optional)</span>
          <input value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Sold out by lunch" className={inputCls} />
        </label>
      </div>
      {error && <div className="text-[12px] text-red-600">{error}</div>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <button type="button" data-no-confirm onClick={onCancel} className="px-3 py-1.5 rounded-lg text-[12px] border border-black/[0.09] text-slate-600 hover:bg-slate-50 cursor-pointer">Back</button>}
        <button type="button" disabled={busy} onClick={submit} title="Book another delivery today to this store" className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium cursor-pointer disabled:opacity-50">
          {busy ? "Booking…" : `Book top-up${total ? ` (${total} sacks)` : ""}`}
        </button>
      </div>
    </div>
  );
}
