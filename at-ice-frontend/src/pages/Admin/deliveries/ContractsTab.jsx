import { useCallback, useEffect, useState } from "react";
import { toast } from "../../../lib/toast";
import { api, todayStr, shortDate, timeOf, DAYS, daysLabel, PRODUCT_TYPES, productLabel, inputCls, labelCls, btnPrimary, btnGhost } from "./utils";
import { Modal, StorePicker, PlusIcon } from "./shared";

const CONTRACT_BADGE = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

// Contracts: one delivery schedule per customer (a whole chain such as SM, or
// one store), a date range and delivery days. Approving it makes every
// daily delivery, so nobody fills in a form each day.
export default function ContractsTab({ stores, live, onChanged }) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState(null); // { contract, action }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setContracts(await api("delivery-contracts"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, live]);

  async function act() {
    const { contract, action } = confirm;
    setBusy(true);
    try {
      const res = await api(`delivery-contracts/${contract.id}/${action}`, { method: "POST" });
      toast.success(res.message);
      setConfirm(null);
      load();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-[18px] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-slate-500 max-w-2xl">
          One schedule per customer with a date range and delivery days. Once Admin approves it, the daily deliveries are made automatically and go to each store's assigned driver (Driver Stores tab).
        </p>
        <button type="button" onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-[12px] font-medium rounded-lg flex-shrink-0">
          <PlusIcon /> New Contract
        </button>
      </div>

      <div className="overflow-x-auto lg:overflow-visible rounded-xl border border-black/[0.09]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-400 text-[11px] uppercase tracking-widest">
              <th className="px-3 py-2.5 font-medium">Contract</th>
              <th className="px-3 py-2.5 font-medium">Stores</th>
              <th className="px-3 py-2.5 font-medium">Dates</th>
              <th className="px-3 py-2.5 font-medium">Days</th>
              <th className="px-3 py-2.5 font-medium">Items per store</th>
              <th className="px-3 py-2.5 font-medium">Deliveries</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && contracts.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && contracts.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No contracts yet.</td></tr>}
            {contracts.map((c) => (
              <tr key={c.id} className="border-t border-black/[0.06] align-top">
                <td className="px-3 py-2.5">
                  <div className="text-slate-800 font-medium">{c.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{c.contract_no}{c.chain ? ` · ${c.chain}` : ""}</div>
                </td>
                <td className="px-3 py-2.5 text-slate-600" title={(c.stores || []).map((s) => s.name).join("\n")}>
                  {(c.stores || []).length}
                </td>
                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{shortDate(c.start_date)} – {shortDate(c.end_date)}</td>
                <td className="px-3 py-2.5 text-slate-600">{daysLabel(c.delivery_days)}<div className="text-[11px] text-slate-400">by {timeOf(c.delivery_time)}</div></td>
                <td className="px-3 py-2.5 text-slate-600">{(c.items || []).map((i) => `${i.quantity} × ${productLabel(i.product_type)}`).join(", ")}</td>
                <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                  {c.status === "pending" ? <span className="text-slate-400">{c.planned} to make</span> : `${c.delivered_count} / ${c.deliveries_count} delivered`}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${CONTRACT_BADGE[c.status] || ""}`}>{c.status}</span>
                  {c.approved_by && <div className="text-[11px] text-slate-400 mt-1">by {c.approved_by.name}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1.5 justify-end">
                    {c.status === "pending" && (
                      <button data-no-confirm type="button" onClick={() => setConfirm({ contract: c, action: "approve" })} className="px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[11.5px] font-medium">Approve</button>
                    )}
                    {c.status !== "cancelled" && (
                      <button data-no-confirm type="button" onClick={() => setConfirm({ contract: c, action: "cancel" })} className="px-2 py-1 rounded-md border border-black/[0.09] text-red-600 text-[11.5px] hover:bg-red-50">Cancel</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ContractForm
          stores={stores}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {confirm && (
        <Modal title={confirm.action === "approve" ? "Approve contract?" : "Cancel contract?"} onClose={() => setConfirm(null)}>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-[12.5px] text-slate-600">
              {confirm.action === "approve"
                ? <>About <b>{confirm.contract.planned}</b> deliveries for <b>{confirm.contract.name}</b> will be made now, from {shortDate(confirm.contract.start_date)} to {shortDate(confirm.contract.end_date)}, each with its store's assigned driver.</>
                : <>All of <b>{confirm.contract.name}</b>'s upcoming deliveries that have not started will be cancelled. Deliveries in transit or delivered stay.</>}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className={btnGhost}>Back</button>
              <button type="button" disabled={busy} onClick={act} className={confirm.action === "approve" ? btnPrimary : "px-3.5 py-1.5 rounded-md bg-red-500 hover:bg-red-600 text-white text-[12px] font-medium disabled:opacity-50"}>
                {busy ? "Working…" : confirm.action === "approve" ? "Approve" : "Cancel contract"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ContractForm({ stores, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "", chain: "", store_ids: [], start_date: todayStr(), end_date: "",
    delivery_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], delivery_time: "08:00",
    items: [{ product_type: "", quantity: "" }], notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(""); };
  const chains = [...new Set(stores.map((s) => s.chain).filter(Boolean))].sort();

  // Picking a chain fills in the name and every active store of that chain.
  function pickChain(chain) {
    set({
      chain,
      name: form.name || chain,
      store_ids: chain ? stores.filter((s) => s.chain === chain).map((s) => s.id) : form.store_ids,
    });
  }
  function toggleDay(day) {
    set({ delivery_days: form.delivery_days.includes(day) ? form.delivery_days.filter((d) => d !== day) : [...form.delivery_days, day] });
  }
  const preset = (n) => set({ delivery_days: DAYS.slice(0, n).map((d) => d.value) });

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Enter a name for the contract.");
    if (!form.store_ids.length) return setError("Pick at least one store.");
    if (!form.end_date || form.end_date < form.start_date) return setError("The end date must be on or after the start date.");
    if (!form.delivery_days.length) return setError("Pick at least one delivery day.");
    if (form.items.some((i) => !i.product_type || !(Number(i.quantity) >= 1))) return setError("Pick a product and a quantity of at least 1 for every item.");
    setSaving(true);
    try {
      await api("delivery-contracts", {
        method: "POST",
        body: { ...form, chain: form.chain || null, notes: form.notes || null, items: form.items.map((i) => ({ ...i, quantity: Number(i.quantity) })) },
      });
      toast.success("Contract was added. Approve it to make the deliveries.");
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New delivery contract" onClose={onClose} wide>
      <form onSubmit={save} className="p-5 flex flex-col gap-3.5" noValidate>
        {error && <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Customer chain</label>
            <select value={form.chain} onChange={(e) => pickChain(e.target.value)} className={inputCls}>
              <option value="">— Pick stores by hand —</option>
              {chains.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Contract name *</label>
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. SM September" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Stores *</label>
          <StorePicker stores={stores} value={form.store_ids} onChange={(ids) => set({ store_ids: ids })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>From *</label>
            <input type="date" min={todayStr()} value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>To *</label>
            <input type="date" min={form.start_date} value={form.end_date} onChange={(e) => set({ end_date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Deliver by *</label>
            <input type="time" value={form.delivery_time} onChange={(e) => set({ delivery_time: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Delivery days *</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {DAYS.map((d) => (
              <button key={d.value} type="button" aria-pressed={form.delivery_days.includes(d.value)} onClick={() => toggleDay(d.value)}
                className={`px-2.5 py-1 rounded-md border text-[12px] font-medium ${form.delivery_days.includes(d.value) ? "bg-cyan-500 border-cyan-500 text-white" : "bg-white border-black/[0.09] text-slate-600"}`}>
                {d.label}
              </button>
            ))}
            <span className="mx-1 text-slate-300">|</span>
            <button type="button" onClick={() => preset(7)} className="text-[11.5px] text-cyan-700 font-medium">Mon–Sun</button>
            <button type="button" onClick={() => preset(6)} className="text-[11.5px] text-cyan-700 font-medium">Mon–Sat</button>
            <button type="button" onClick={() => preset(5)} className="text-[11.5px] text-cyan-700 font-medium">Mon–Fri</button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Items per store per delivery *</label>
          <div className="flex flex-col gap-2">
            {form.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2">
                <select value={it.product_type} aria-label={`Product ${i + 1}`} onChange={(e) => set({ items: form.items.map((x, j) => (j === i ? { ...x, product_type: e.target.value } : x)) })} className={inputCls}>
                  <option value="">Select product…</option>
                  {PRODUCT_TYPES.map((p) => <option key={p.value} value={p.value} disabled={form.items.some((o, j) => j !== i && o.product_type === p.value)}>{p.label}</option>)}
                </select>
                <input type="number" min="1" placeholder="Qty" aria-label={`Quantity ${i + 1}`} value={it.quantity} onChange={(e) => set({ items: form.items.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) })} className={inputCls} />
                <button type="button" disabled={form.items.length === 1} onClick={() => set({ items: form.items.filter((_, j) => j !== i) })} className="px-2 rounded-md border border-black/[0.09] text-red-500 text-[12px] disabled:opacity-30">Remove</button>
              </div>
            ))}
          </div>
          {form.items.length < PRODUCT_TYPES.length && (
            <button type="button" onClick={() => set({ items: [...form.items, { product_type: "", quantity: "" }] })} className="mt-2 text-[12px] font-medium text-cyan-700">+ Add item</button>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5">Prices come from Customer Prices for each store. Admin can change one day's quantities later.</p>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.09]">
          <button type="button" onClick={onClose} className={btnGhost}>Close</button>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Save contract"}</button>
        </div>
      </form>
    </Modal>
  );
}
