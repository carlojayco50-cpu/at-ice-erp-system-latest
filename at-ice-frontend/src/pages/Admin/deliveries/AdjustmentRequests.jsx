import { useCallback, useEffect, useState } from "react";
import { confirmAction } from "../../../lib/confirm";
import { iceProductLabel as label } from "../../../lib/iceProducts";
import { useLiveTick } from "../../../lib/live";
import { formatDateTime } from "../../../lib/time";
import { toast } from "../../../lib/toast";
import { STATUS_STYLE } from "./utils";

// Store change requests (owner, 2026-10-22): a store asks in its portal to
// change the sacks on one of its deliveries not yet delivered (rain, slow or
// fast sales). Nothing changes until Admin applies the request to that one
// delivery, or declines it with a note the store sees. Shown above the
// Deliveries board only while requests wait.

const headers = (json) => ({ Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token")}`, ...(json ? { "Content-Type": "application/json" } : {}) });
const fieldCls = "w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-[13px] text-slate-700 outline-none focus:border-cyan-500/60 shadow-inner";

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: headers(true), body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "The request could not be saved.");
  return data;
}

function RequestRow({ r, onDone }) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const d = r.delivery || {};
  const status = STATUS_STYLE[d.status] || STATUS_STYLE.pending;
  const summary = r.items.map((i) => `${label(i.product_type)} ${i.before} → ${i.after}`).join(", ");

  const apply = async () => {
    const ok = await confirmAction({
      title: `Apply the change to ${d.delivery_no}?`,
      message: `${summary}. The Driver and the Salesman are told, and the Salesman confirms from the new load.`,
      confirmLabel: "Apply change",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await post(`/api/delivery-adjustment-requests/${r.id}/apply`);
      toast.success(`${d.delivery_no} changed: ${summary}.`);
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (note.trim().length < 3) return toast.error("Write why, so the store knows.");
    setBusy(true);
    try {
      await post(`/api/delivery-adjustment-requests/${r.id}/decline`, { note: note.trim() });
      toast.success(`Request for ${d.delivery_no} declined.`);
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-black/[0.08] bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold text-slate-800">{r.customer?.name || "Store"}</span>
        <span className="text-[12px] text-slate-500">{d.delivery_no}{d.driver?.name ? ` · ${d.driver.name}` : ""}</span>
        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${status.bg} ${status.text}`}>{status.label}</span>
        <span className="ml-auto text-[11px] text-slate-400">{formatDateTime(r.created_at, { year: false })}</span>
      </div>
      <div className="text-[13px] text-slate-700"><span className="font-medium">{summary}</span></div>
      <div className="text-[12px] text-slate-500">Reason: {r.reason}</div>
      {!r.delivery_open && <div className="text-[12px] text-rose-700">This delivery is already {String(d.status || "").replace("_", " ")}, so it cannot change. Decline the request with a note.</div>}
      {declining ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Why, e.g. The truck is already loaded" aria-label="Reason for declining" className={fieldCls} autoFocus />
          <div className="flex gap-2 justify-end">
            <button type="button" data-no-confirm onClick={() => { setDeclining(false); setNote(""); }} className="px-3 py-1.5 rounded-lg border border-black/[0.09] text-[12px] text-slate-600 hover:bg-slate-50 cursor-pointer">Back</button>
            <button type="button" data-no-confirm disabled={busy} onClick={decline} title="Turn the request down; the store sees your note" className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[12px] font-medium cursor-pointer disabled:opacity-50">{busy ? "Sending…" : "Send decline"}</button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button type="button" data-no-confirm onClick={() => setDeclining(true)} title="Turn the request down with a note for the store" className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-[12px] font-medium hover:bg-red-50 cursor-pointer">Decline</button>
          {r.delivery_open && (
            <button type="button" data-no-confirm disabled={busy} onClick={apply} title="Change this delivery's sacks as the store asked" className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium cursor-pointer disabled:opacity-50">{busy ? "Applying…" : "Apply change"}</button>
          )}
        </div>
      )}
    </li>
  );
}

export default function AdjustmentRequests({ onChanged }) {
  const [rows, setRows] = useState([]);
  const [tick, setTick] = useState(0);
  const live = useLiveTick(["deliveries"]);
  const load = useCallback(() => setTick((t) => t + 1), []);

  // pending requests (reloads on every live tick and after an answer); on an
  // error the panel stays as it was and the next tick tries again
  useEffect(() => {
    let stop = false;
    fetch("/api/delivery-adjustment-requests?status=pending", { headers: headers() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !stop && Array.isArray(data) && setRows(data))
      .catch(() => {});
    return () => { stop = true; };
  }, [live, tick]);

  if (!rows.length) return null;
  return (
    <section aria-label="Store change requests" className="bg-white border border-black/[0.09] rounded-xl">
      <div className="px-[18px] py-3.5 border-b border-black/[0.09]">
        <h2 className="text-[15px] font-semibold text-slate-800">Store change requests <span className="text-slate-400 font-normal">({rows.length})</span></h2>
        <p className="text-[12px] text-slate-500 mt-0.5">Stores asked to change the sacks on one of their deliveries. Apply changes only that delivery; decline tells the store why.</p>
      </div>
      <ul className="flex flex-col gap-2 p-3 bg-slate-50/70">
        {rows.map((r) => <RequestRow key={r.id} r={r} onDone={() => { load(); onChanged?.(); }} />)}
      </ul>
    </section>
  );
}
