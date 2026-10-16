import { useCallback, useEffect, useState } from "react";
import { toast } from "../../../lib/toast";
import { api, nextMonday, todayStr, shortDate, storeName, inputCls, labelCls, btnPrimary } from "./utils";
import { StorePicker } from "./shared";

const LEAVE_LABEL = { absent: "Absent", emergency: "Emergency leave", rest_day: "Rest day" };

// Driver Stores: Admin picks which Driver handles which stores, from a date
// (usually next week or the next pay period). The daily deliveries follow it.
// Below: Drivers marked absent, on leave or on a rest day.
export default function DriverStoresTab({ stores, drivers, live, onChanged, onMarkOff }) {
  const [assignments, setAssignments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [form, setForm] = useState({ driver_id: "", store_ids: [], effective_from: nextMonday(), effective_to: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, l] = await Promise.all([api("driver-store-assignments"), api("driver-leaves")]);
      setAssignments(a);
      setLeaves(l);
    } catch (err) {
      toast.error(err.message);
    }
  }, []);
  useEffect(() => { load(); }, [load, live]);

  // the store's driver now (or the one starting next)
  const today = todayStr();
  const currentDriver = {};
  assignments.forEach((a) => {
    const from = String(a.effective_from).slice(0, 10);
    if (from <= today || !currentDriver[a.store_id]) currentDriver[a.store_id] = a.driver?.name;
  });

  async function save(e) {
    e.preventDefault();
    if (!form.driver_id) return setError("Please select a driver.");
    if (!form.store_ids.length) return setError("Pick at least one store.");
    setSaving(true);
    setError("");
    try {
      const res = await api("driver-store-assignments", { method: "POST", body: { ...form, effective_to: form.effective_to || null } });
      toast.success(res.message);
      setForm({ ...form, store_ids: [] });
      load();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function endAssignment(a) {
    try {
      await api(`driver-store-assignments/${a.id}`, { method: "DELETE" });
      toast.success(`${a.store?.name || "Store"} was removed from ${a.driver?.name || "the driver"}.`);
      load();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removeLeave(l) {
    try {
      await api(`driver-leaves/${l.id}`, { method: "DELETE" });
      toast.success(`${l.driver?.name || "Driver"}'s leave mark was removed.`);
      load();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const byDriver = drivers.map((dr) => ({ driver: dr, list: assignments.filter((a) => String(a.driver_id) === String(dr.id)) }));

  return (
    <div className="p-[18px] grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form onSubmit={save} className="rounded-xl border border-black/[0.09] p-4 flex flex-col gap-3 self-start" noValidate>
        <div>
          <h3 className="text-[13px] font-semibold text-slate-800">Assign stores to a driver</h3>
          <p className="text-[11.5px] text-slate-500 mt-0.5">Applies to the stores' deliveries from the start date on. A delivery reassigned because of a leave keeps its new driver.</p>
        </div>
        {error && <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">{error}</div>}
        <div>
          <label className={labelCls}>Driver *</label>
          <select value={form.driver_id} onChange={(e) => { setForm({ ...form, driver_id: e.target.value }); setError(""); }} className={inputCls}>
            <option value="">Select driver…</option>
            {drivers.map((dr) => <option key={dr.id} value={dr.id}>{dr.name}{dr.employee_id ? ` · ${dr.employee_id}` : ""}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>From *</label>
            <input type="date" min={today} value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Until (optional)</label>
            <input type="date" min={form.effective_from} value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Stores *</label>
          <StorePicker stores={stores} value={form.store_ids} onChange={(ids) => { setForm({ ...form, store_ids: ids }); setError(""); }}
            note={(s) => (currentDriver[s.id] ? `now: ${currentDriver[s.id]}` : "no driver")} />
        </div>
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Assign stores"}</button>
      </form>

      <div className="flex flex-col gap-4 min-w-0">
        <div className="rounded-xl border border-black/[0.09]">
          <div className="px-4 py-2.5 border-b border-black/[0.09] bg-slate-50 rounded-t-xl text-[12.5px] font-semibold text-slate-700">Stores per driver</div>
          {byDriver.length === 0 && <div className="px-4 py-6 text-[13px] text-slate-400">No drivers yet.</div>}
          {byDriver.map(({ driver, list }) => (
            <div key={driver.id} className="px-4 py-3 border-t first:border-t-0 border-black/[0.06]">
              <div className="text-[13px] font-semibold text-slate-800">{driver.name} <span className="font-normal text-slate-400">· {list.length} {list.length === 1 ? "store" : "stores"}</span></div>
              {list.length === 0 && <div className="text-[12px] text-slate-400 mt-1">No stores assigned.</div>}
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {list.map((a) => (
                  <li key={a.id} className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md bg-slate-50 border border-black/[0.07] text-[12px] text-slate-700">
                    <span>{storeName(a.store)}</span>
                    <span className="text-[10.5px] text-slate-400">
                      {String(a.effective_from).slice(0, 10) > today ? `from ${shortDate(a.effective_from)}` : "now"}{a.effective_to ? ` to ${shortDate(a.effective_to)}` : ""}
                    </span>
                    <button type="button" onClick={() => endAssignment(a)} aria-label={`Remove ${a.store?.name}`} className="px-1 text-slate-400 hover:text-red-600">×</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-black/[0.09]">
          <div className="px-4 py-2.5 border-b border-black/[0.09] bg-slate-50 rounded-t-xl flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-slate-700">Absent, on leave or rest day</span>
            <button type="button" onClick={() => onMarkOff(null)} className="text-[11.5px] font-medium text-red-600 hover:text-red-700">+ Mark a driver off</button>
          </div>
          {leaves.length === 0 && <div className="px-4 py-6 text-[13px] text-slate-400">No driver is marked off from today on. Approved leave requests also count.</div>}
          <ul>
            {leaves.map((l) => (
              <li key={l.id} className="px-4 py-2.5 border-t first:border-t-0 border-black/[0.06] flex items-center justify-between gap-3 text-[13px]">
                <span>
                  <span className="text-slate-800">{l.driver?.name}</span>
                  <span className="text-slate-400"> · {shortDate(l.date)} · {LEAVE_LABEL[l.type] || l.type}{l.reason ? ` · ${l.reason}` : ""}</span>
                </span>
                <button type="button" onClick={() => removeLeave(l)} className="px-2 py-1 rounded-md border border-black/[0.09] text-[11.5px] text-slate-600 hover:bg-slate-50">Remove</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
