import { useState } from "react";
import { STATUS_STYLE, inputCls, storeName } from "./utils";

// Small pieces of UI shared by Admin > Deliveries (helpers are in utils.js).

export function StatusCell({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span className={`inline-flex items-center justify-center min-w-[84px] px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

export function ReassignedTag({ delivery }) {
  if (!delivery?.reassigned_from) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap">
      Reassigned from {delivery.reassigned_from.name}
    </span>
  );
}

export const XIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
export const PlusIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
export const TrashIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>;

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl border border-black/[0.09] w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[88vh] overflow-y-auto`}>
        <div className="px-5 py-4 border-b border-black/[0.09] flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="text-[14px] font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><XIcon /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Checklist of stores with a search box and a chain filter. `note(store)`
// adds a small grey line (e.g. its current driver).
export function StorePicker({ stores, value, onChange, note }) {
  const [q, setQ] = useState("");
  const [chain, setChain] = useState("");
  const chains = [...new Set(stores.map((s) => s.chain).filter(Boolean))].sort();
  const needle = q.trim().toLowerCase();
  const list = stores.filter((s) => (!chain || s.chain === chain)
    && (!needle || `${s.name} ${s.branch_code || ""} ${s.city || ""}`.toLowerCase().includes(needle)));
  const picked = new Set(value.map(String));
  const allPicked = list.length > 0 && list.every((s) => picked.has(String(s.id)));

  function toggle(id) {
    const k = String(id);
    onChange(picked.has(k) ? value.filter((v) => String(v) !== k) : [...value, id]);
  }
  function toggleAll() {
    const ids = list.map((s) => s.id);
    onChange(allPicked
      ? value.filter((v) => !ids.some((id) => String(id) === String(v)))
      : [...new Set([...value, ...ids])]);
  }

  return (
    <div className="rounded-lg border border-black/[0.09]">
      <div className="p-2 flex flex-col sm:flex-row gap-2 border-b border-black/[0.07]">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store, branch, city…" aria-label="Search stores" className={inputCls} />
        <select value={chain} onChange={(e) => setChain(e.target.value)} aria-label="Filter by chain" className={`${inputCls} sm:max-w-[150px]`}>
          <option value="">All chains</option>
          {chains.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 px-3 py-1.5 border-b border-black/[0.07] text-[12px] text-slate-600 cursor-pointer">
        <input type="checkbox" checked={allPicked} onChange={toggleAll} disabled={list.length === 0} />
        Select all shown ({list.length}) · {value.length} picked
      </label>
      <ul className="max-h-56 overflow-y-auto py-1">
        {list.length === 0 && <li className="px-3 py-2 text-[12px] text-slate-400">No store matches.</li>}
        {list.map((s) => (
          <li key={s.id}>
            <label className="flex items-start gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5" checked={picked.has(String(s.id))} onChange={() => toggle(s.id)} />
              <span className="min-w-0">
                <span className="block text-slate-800 truncate">{storeName(s)}</span>
                <span className="block text-[11px] text-slate-400">{[s.chain, s.city, note?.(s)].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

