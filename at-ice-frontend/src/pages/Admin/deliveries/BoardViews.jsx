import { useState } from "react";
import { toast } from "../../../lib/toast";
import { api, DRIVER_STATUS, storeName, timeOf, productLabel, PRODUCT_TYPES, inputCls, labelCls, btnPrimary, btnGhost } from "./utils";
import { ReassignedTag, StatusCell, Modal } from "./shared";

const OPEN = ["pending", "queued", "in_transit"];

// Driver View: a card per Driver; clicking one lists the stores they deliver
// to that day. "Queued" and "No driver" cards hold what still needs a driver.
export function DriverView({ board, loading, onView, onEdit, onCancel, onMarkOff }) {
  const [picked, setPicked] = useState(null); // driver id, "queued" or "none"
  const deliveries = board?.deliveries || [];
  const drivers = board?.drivers || [];
  const isToday = board?.date === board?.today;

  const byDriver = (id) => deliveries.filter((d) => String(d.driver_id) === String(id));
  const queued = deliveries.filter((d) => d.status === "queued");
  const noDriver = deliveries.filter((d) => !d.driver_id && d.status === "pending");

  const groups = [
    ...drivers.map((dr) => ({ key: String(dr.id), driver: dr, list: byDriver(dr.id) })),
    ...(queued.length ? [{ key: "queued", title: "Queued", hint: "Waiting for a free driver (latest order first)", list: queued }] : []),
    ...(noDriver.length ? [{ key: "none", title: "No driver", hint: "The store has no assigned driver. Edit to pick one.", list: noDriver }] : []),
  ];
  const current = groups.find((g) => g.key === String(picked)) || null;

  if (loading && !board) return <div className="p-6 text-[13px] text-slate-400">Loading…</div>;
  if (!drivers.length) return <div className="p-6 text-[13px] text-slate-400">No drivers yet. Add a Driver in HRIS &gt; Employees.</div>;

  return (
    <div className="p-[18px] flex flex-col gap-4">
      <div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
        {groups.map((g) => {
          const done = g.list.filter((d) => d.status === "delivered").length;
          const open = g.list.filter((d) => OPEN.includes(d.status)).length;
          const reassigned = g.list.filter((d) => d.reassigned_from).length;
          const st = g.driver ? DRIVER_STATUS[g.driver.status] : null;
          const active = String(picked) === g.key;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => setPicked(active ? null : g.key)}
              aria-expanded={active}
              className={`text-left rounded-xl border p-3 transition-colors bg-white ${active ? "border-cyan-500 ring-2 ring-cyan-500/40" : "border-black/[0.09] hover:border-black/20"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-slate-800 truncate">{g.driver ? g.driver.name : g.title}</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {g.driver ? [g.driver.employee_id, g.driver.vehicle_plate && `PN ${g.driver.vehicle_plate}`].filter(Boolean).join(" · ") || "Driver" : g.hint}
                  </div>
                </div>
                {st && (isToday || g.driver.status === "off") && (
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded-full border text-[10.5px] font-semibold ${st.pill}`} title={g.driver.reason || ""}>
                    {g.driver.status === "off" ? g.driver.reason || "Off" : st.label}
                  </span>
                )}
              </div>
              <div className="mt-2.5 flex items-center gap-3 text-[12px] text-slate-600">
                <span><b className="tabular-nums text-slate-800">{g.list.length}</b> stops</span>
                <span><b className="tabular-nums text-slate-800">{open}</b> open</span>
                <span><b className="tabular-nums text-slate-800">{done}</b> done</span>
              </div>
              {reassigned > 0 && (
                <div className="mt-1.5 text-[11px] font-medium text-amber-700">
                  {reassigned} {g.driver ? "reassigned to this driver" : "from a driver who is off"}
                </div>
              )}
              {g.driver && <div className="mt-1 text-[11px] text-slate-400">{g.driver.stores.length} regular {g.driver.stores.length === 1 ? "store" : "stores"}</div>}
            </button>
          );
        })}
      </div>

      {current && (
        <div className="rounded-xl border border-black/[0.09]">
          <div className="px-4 py-2.5 border-b border-black/[0.09] bg-slate-50 rounded-t-xl flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-slate-700">
              {current.driver ? `${current.driver.name}: stores to deliver` : current.title}
            </span>
            {current.driver && current.driver.status !== "off" && (
              <button type="button" onClick={() => onMarkOff(current.driver)} className="text-[11.5px] font-medium text-red-600 hover:text-red-700">
                Mark absent / on leave
              </button>
            )}
          </div>
          <DeliveryRows list={current.list} showDriver={!current.driver} onView={onView} onEdit={onEdit} onCancel={onCancel} empty="No deliveries for this driver on this day." />
        </div>
      )}
    </div>
  );
}

// Store View: one row per store with a delivery that day.
export function StoreView({ board, loading, onView, onEdit, onCancel }) {
  const [q, setQ] = useState("");
  const deliveries = board?.deliveries || [];
  const regular = {};
  (board?.drivers || []).forEach((dr) => dr.stores.forEach((s) => { regular[s.id] = dr.name; }));
  const needle = q.trim().toLowerCase();
  const list = deliveries
    .filter((d) => !needle || `${d.customer?.name || ""} ${d.customer?.branch_code || ""} ${d.customer?.chain || ""} ${d.driver?.name || ""}`.toLowerCase().includes(needle))
    .sort((a, b) => (a.customer?.name || "").localeCompare(b.customer?.name || ""));

  if (loading && !board) return <div className="p-6 text-[13px] text-slate-400">Loading…</div>;

  return (
    <div className="p-[18px] flex flex-col gap-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store, chain or driver…" aria-label="Search stores" className={`${inputCls} max-w-xs`} />
      <div className="overflow-x-auto lg:overflow-visible rounded-xl border border-black/[0.09]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-400 text-[11px] uppercase tracking-widest">
              <th className="px-3 py-2.5 font-medium">Store</th>
              <th className="px-3 py-2.5 font-medium">Due</th>
              <th className="px-3 py-2.5 font-medium">Driver</th>
              <th className="px-3 py-2.5 font-medium">Regular driver</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">{needle ? "No store matches." : "No deliveries on this day."}</td></tr>}
            {list.map((d) => (
              <tr key={d.id} className="border-t border-black/[0.06]">
                <td className="px-3 py-2.5">
                  <div className="text-slate-800">{storeName(d.customer)}</div>
                  <div className="text-[11px] text-slate-400">{[d.customer?.chain, d.contract?.contract_no, d.delivery_no].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{d.contract_id ? timeOf(d.ordered_at) : "—"}</td>
                <td className="px-3 py-2.5">
                  <div className="text-slate-700">{d.driver?.name || <span className="text-slate-300">—</span>}</div>
                  <ReassignedTag delivery={d} />
                </td>
                <td className="px-3 py-2.5 text-slate-500">{regular[d.customer_id] || "—"}</td>
                <td className="px-3 py-2.5"><StatusCell status={d.status} /></td>
                <td className="px-3 py-2.5"><RowActions d={d} onView={onView} onEdit={onEdit} onCancel={onCancel} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeliveryRows({ list, showDriver, onView, onEdit, onCancel, empty }) {
  if (!list.length) return <div className="px-4 py-6 text-center text-[13px] text-slate-400">{empty}</div>;
  return (
    <ul>
      {list.map((d) => (
        <li key={d.id} className="px-4 py-2.5 border-t first:border-t-0 border-black/[0.06] flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="min-w-[200px] flex-1">
            <div className="text-[13px] text-slate-800">{storeName(d.customer)}</div>
            <div className="text-[11px] text-slate-400">
              {[d.delivery_no, d.contract_id && timeOf(d.ordered_at) && `due ${timeOf(d.ordered_at)}`, showDriver && d.driver?.name].filter(Boolean).join(" · ")}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {(d.items || []).map((it) => `${it.quantity_ordered} × ${productLabel(it.product_type)}`).join(", ")}
            </div>
          </div>
          <ReassignedTag delivery={d} />
          <StatusCell status={d.status} />
          <RowActions d={d} onView={onView} onEdit={onEdit} onCancel={onCancel} />
        </li>
      ))}
    </ul>
  );
}

function RowActions({ d, onView, onEdit, onCancel }) {
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <button type="button" onClick={() => onView(d)} className="px-2 py-1 rounded-md border border-black/[0.09] text-[11.5px] text-slate-600 hover:bg-slate-50">View</button>
      {["pending", "queued"].includes(d.status) && (
        <button type="button" onClick={() => onEdit(d)} className="px-2 py-1 rounded-md border border-black/[0.09] text-[11.5px] text-slate-600 hover:bg-slate-50">Edit</button>
      )}
      {OPEN.includes(d.status) && (
        <button type="button" onClick={() => onCancel(d)} className="px-2 py-1 rounded-md border border-black/[0.09] text-[11.5px] text-red-600 hover:bg-red-50">Cancel</button>
      )}
    </div>
  );
}

// Admin edits a delivery that has not started: Driver, quantities, notes.
export function EditDeliveryModal({ delivery, drivers, isToday, onClose, onSaved }) {
  const [driverId, setDriverId] = useState(delivery.driver_id ? String(delivery.driver_id) : "");
  const [items, setItems] = useState((delivery.items || []).map((it) => ({ product_type: it.product_type, quantity_ordered: String(it.quantity_ordered) })));
  const [notes, setNotes] = useState(delivery.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    if (items.some((it) => !it.product_type || !(Number(it.quantity_ordered) >= 1))) {
      setError("Pick a product and a quantity of at least 1 for every item.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(`deliveries/${delivery.id}`, {
        method: "PUT",
        body: { driver_id: driverId || null, notes: notes || null, items: items.map((it) => ({ ...it, quantity_ordered: Number(it.quantity_ordered) })) },
      });
      toast.success(`Delivery ${delivery.delivery_no} was updated.`);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit ${delivery.delivery_no}`} onClose={onClose}>
      <form onSubmit={save} className="p-5 flex flex-col gap-3" noValidate>
        {error && <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">{error}</div>}
        <div className="text-[13px] text-slate-700">{storeName(delivery.customer)}</div>
        <div>
          <label className={labelCls}>Driver</label>
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputCls}>
            <option value="">No driver yet</option>
            {drivers.map((dr) => {
              const blocked = isToday && dr.status !== "available" && String(dr.id) !== String(delivery.driver_id);
              return (
                <option key={dr.id} value={dr.id} disabled={blocked}>
                  {dr.name}{isToday && dr.status ? ` (${dr.status === "off" ? dr.reason || "off" : DRIVER_STATUS[dr.status]?.label || dr.status})` : ""}
                </option>
              );
            })}
          </select>
          {isToday && <p className="text-[11px] text-slate-400 mt-1">Today only an available driver can be picked.</p>}
        </div>
        <div>
          <label className={labelCls}>Items</label>
          <div className="flex flex-col gap-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_auto] gap-2">
                <select value={it.product_type} aria-label={`Product ${i + 1}`} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, product_type: e.target.value } : x)))} className={inputCls}>
                  <option value="">Select product…</option>
                  {PRODUCT_TYPES.map((p) => <option key={p.value} value={p.value} disabled={items.some((o, j) => j !== i && o.product_type === p.value)}>{p.label}</option>)}
                </select>
                <input type="number" min="1" aria-label={`Quantity ${i + 1}`} value={it.quantity_ordered} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity_ordered: e.target.value } : x)))} className={inputCls} />
                <button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} className="px-2 rounded-md border border-black/[0.09] text-red-500 text-[12px] disabled:opacity-30">Remove</button>
              </div>
            ))}
          </div>
          {items.length < PRODUCT_TYPES.length && (
            <button type="button" onClick={() => setItems([...items, { product_type: "", quantity_ordered: "" }])} className="mt-2 text-[12px] font-medium text-cyan-700">+ Add item</button>
          )}
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.09]">
          <button type="button" onClick={onClose} className={btnGhost}>Close</button>
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

// Mark a Driver absent, on emergency leave or on a rest day. Today's
// pending deliveries are reassigned at random right away.
export function MarkOffModal({ driver, drivers, date, onClose, onSaved }) {
  const [form, setForm] = useState({ driver_id: driver ? String(driver.id) : "", date, type: "absent", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    if (!form.driver_id) { setError("Please select a driver."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await api("driver-leaves", { method: "POST", body: { ...form, reason: form.reason || null } });
      toast.success(res.message);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Driver absent or on leave" onClose={onClose}>
      <form onSubmit={save} className="p-5 flex flex-col gap-3" noValidate>
        {error && <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">{error}</div>}
        <div>
          <label className={labelCls}>Driver *</label>
          <select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })} className={inputCls}>
            <option value="">Select driver…</option>
            {drivers.map((dr) => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date *</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Type *</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
              <option value="absent">Absent</option>
              <option value="emergency">Emergency leave</option>
              <option value="rest_day">Rest day</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Reason</label>
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} />
        </div>
        <p className="text-[11.5px] text-slate-500">
          Their pending deliveries that day go at random to a driver who has timed in, is not on leave and is not in transit. If every driver is in transit, they wait in the queue (latest order first). Each affected store is told it may be delayed.
        </p>
        <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.09]">
          <button type="button" onClick={onClose} className={btnGhost}>Close</button>
          <button type="submit" disabled={saving} className="px-3.5 py-1.5 rounded-md bg-red-500 hover:bg-red-600 text-white text-[12px] font-medium disabled:opacity-50">{saving ? "Saving…" : "Mark off and reassign"}</button>
        </div>
      </form>
    </Modal>
  );
}
