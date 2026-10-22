import { useState } from "react";
import { confirmAction } from "../../lib/confirm";
import { ICE_PRODUCTS, iceProductLabel as label } from "../../lib/iceProducts";
import { PILL } from "../../lib/statusTones";
import { formatDateTime } from "../../lib/time";
import { toast } from "../../lib/toast";

// Change sacks (owner, 2026-10-22): on a delivery not yet delivered, the store
// asks for different quantities (rain, slow or fast sales) with a reason. The
// plant applies it to this one delivery or declines it with a note; the latest
// request and its answer show here (App\Support\DeliveryAdjust::requestChange).

const OPEN = ["pending", "queued", "in_transit"];
const inputCls = "w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-[13px] text-slate-700 outline-none focus:border-cyan-500/60 shadow-inner";
const headers = () => ({ Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });
const STATE = {
  pending: ["Waiting for the plant", PILL.warning],
  applied: ["Applied", PILL.success],
  declined: ["Declined", PILL.danger],
  withdrawn: ["Withdrawn", PILL.neutral],
};

const quantities = (items) => Object.fromEntries(ICE_PRODUCTS.map((p) => [p.value, (items || []).filter((i) => i.product_type === p.value).reduce((s, i) => s + Number(i.quantity_ordered || 0), 0)]));

export default function AdjustmentRequestPanel({ delivery, onChanged }) {
  const current = quantities(delivery.items);
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const req = delivery.adjustment_request;
  const canAsk = OPEN.includes(delivery.status) && req?.status !== "pending";
  const changed = ICE_PRODUCTS.filter((p) => Number(wanted[p.value] || 0) !== current[p.value]);

  if (!OPEN.includes(delivery.status) && !req) return null;

  const submit = async () => {
    if (!changed.length) return setError("Change at least one quantity.");
    if (reason.trim().length < 3) return setError("Tell the plant why, e.g. Heavy rain, slow sales.");
    // asked only once the form is filled in, so a confirmation never ends in an error
    const ok = await confirmAction({
      title: `Send the change for ${delivery.delivery_no}?`,
      message: `${changed.map((p) => `${p.label} ${current[p.value]} → ${Number(wanted[p.value] || 0)}`).join(", ")}. Nothing changes until the plant applies it.`,
      confirmLabel: "Send request",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const items = Object.fromEntries(changed.map((p) => [p.value, Number(wanted[p.value] || 0)]));
      const res = await fetch(`/api/my-deliveries/${delivery.id}/adjustment-requests`, { method: "POST", headers: headers(), body: JSON.stringify({ items, reason: reason.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error("Please wait a minute before asking again.");
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "The request could not be sent.");
      toast.success(`Change for ${delivery.delivery_no} sent. The plant will answer here.`);
      setOpen(false);
      setReason("");
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    const ok = await confirmAction({ title: "Withdraw your change request?", message: `${delivery.delivery_no} keeps the sacks it has now.`, confirmLabel: "Withdraw", danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/my-adjustment-requests/${req.id}/withdraw`, { method: "POST", headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "The request could not be withdrawn.");
      toast.success("Change request withdrawn.");
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-black/[0.08] bg-slate-50/70 p-3 flex flex-col gap-2.5">
      {req && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-slate-800">Your change request</span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATE[req.status]?.[1] || PILL.neutral}`}>{STATE[req.status]?.[0] || req.status}</span>
            <span className="ml-auto text-[11px] text-slate-400">{formatDateTime(req.created_at, { year: false })}</span>
          </div>
          <div className="text-[12px] text-slate-700">{req.items.map((i) => `${label(i.product_type)} ${i.before} → ${i.after}`).join(", ")}</div>
          <div className="text-[12px] text-slate-500">Reason: {req.reason}</div>
          {req.review_note && <div className="text-[12px] text-slate-700">Plant's note: {req.review_note}</div>}
          {req.status === "pending" && (
            <div className="flex justify-end">
              <button type="button" data-no-confirm disabled={busy} onClick={withdraw} title="Take back this request; the delivery keeps its sacks" className="px-3 py-1.5 rounded-lg border border-black/[0.09] text-[12px] text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Withdraw request</button>
            </div>
          )}
        </div>
      )}

      {canAsk && (open ? (
        <div className="flex flex-col gap-2.5">
          <div className="text-[13px] font-semibold text-slate-800">Change the sacks on this delivery</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ICE_PRODUCTS.map((p) => (
              <label key={p.value} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-600">{p.label} <span className="text-slate-400">(now {current[p.value]})</span></span>
                <input type="number" inputMode="numeric" min={0} max={500} value={wanted[p.value] ?? ""}
                  onChange={(e) => { setWanted({ ...wanted, [p.value]: e.target.value }); setError(""); }} className={inputCls} />
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-600">Reason (required)</span>
            <input value={reason} maxLength={200} onChange={(e) => { setReason(e.target.value); setError(""); }} placeholder="e.g. Heavy rain, slow sales today" className={inputCls} />
          </label>
          {error && <div className="text-[12px] text-red-600">{error}</div>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" data-no-confirm onClick={() => { setOpen(false); setWanted(current); setError(""); }} className="px-3 py-1.5 rounded-lg text-[12px] border border-black/[0.09] text-slate-600 hover:bg-slate-50 cursor-pointer">Back</button>
            <button type="button" data-no-confirm disabled={busy} onClick={submit} title="Send the change to the plant; nothing changes until they apply it" className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium cursor-pointer disabled:opacity-50">{busy ? "Sending…" : "Send request"}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto text-[12px] text-slate-700">Need fewer or more sacks on this delivery? Ask the plant before it arrives.</div>
          <button type="button" data-no-confirm onClick={() => { setWanted(current); setOpen(true); }} title="Ask to change the sacks on this delivery" className="px-3 py-1.5 rounded-lg border border-black/[0.09] text-[12px] font-medium text-slate-700 hover:bg-white cursor-pointer">Change sacks</button>
        </div>
      ))}
    </div>
  );
}
