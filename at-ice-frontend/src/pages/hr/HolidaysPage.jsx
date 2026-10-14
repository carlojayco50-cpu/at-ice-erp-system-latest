// src/pages/hr/HolidaysPage.jsx
//
// Holiday calendar (HR and Admin; R3 in docs/REVIEW-DECISIONS.md). Attendance,
// leave and payroll read holidays from here, so keep it current: holidays
// change every year and can be declared on short notice. The 2026 list is
// seeded from Proclamation No. 1006 and No. 1189 (verify against the latest).

import { useCallback, useEffect, useState } from "react";
import HrLayout from "../../components/HrLayout";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";

const token = () => localStorage.getItem("token") || "";
async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token()}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.errors ? Object.values(data.errors).flat()[0] : data?.message || `Request failed (${res.status})`);
  return data;
}

const TYPES = [
  ["REGULAR", "Regular holiday", "bg-red-50 text-red-700 border-red-200"],
  ["SPECIAL_NON_WORKING", "Special (non-working)", "bg-amber-50 text-amber-700 border-amber-200"],
  ["SPECIAL_WORKING", "Special working day", "bg-slate-50 text-slate-600 border-slate-200"],
];
const typeOf = (t) => TYPES.find(([k]) => k === t) || [t, t, "bg-slate-50 text-slate-600 border-slate-200"];
const inputCls = "px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-700 focus:outline-none focus:border-cyan-400";
const EMPTY = { date: "", name: "", type: "REGULAR", is_double: false };
const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export default function HolidaysPage({ admin = false }) {
  const Layout = admin ? AdminLayout : HrLayout;
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // id
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError("");
    api(`/api/holidays?year=${year}`).then(setData).catch((e) => setError(e.message));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(editing ? `/api/holidays/${editing}` : "/api/holidays", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) });
      toast.success(editing ? `${form.name} was updated.` : `${form.name} was added.`);
      setForm(EMPTY);
      setEditing(null);
      if (form.date.slice(0, 4) !== String(year)) setYear(Number(form.date.slice(0, 4)));
      else load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (h) => {
    if (!window.confirm(`Remove ${h.name} (${h.date})?`)) return;
    try {
      await api(`/api/holidays/${h.id}`, { method: "DELETE" });
      toast.success(`${h.name} was removed.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const years = [...new Set([...(data?.years || []), new Date().getFullYear(), new Date().getFullYear() + 1])].sort();

  return (
    <Layout pageTitle="Holidays" breadcrumb="HRIS / Holidays">
      <form onSubmit={save} className="bg-white border border-black/[0.09] rounded-xl px-[18px] py-3.5 flex flex-wrap items-end gap-3">
        <div className="text-[13px] font-semibold text-slate-800 w-full">{editing ? "Edit holiday" : "Add a holiday"}</div>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-slate-500">Date</span>
          <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></label>
        <label className="flex flex-col gap-1 flex-1 min-w-[200px]"><span className="text-[11px] text-slate-500">Name</span>
          <input required maxLength={255} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Eid'l Adha" className={inputCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-slate-500">Type</span>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
            {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 pb-1.5">
          <input type="checkbox" data-native checked={form.is_double} onChange={(e) => setForm({ ...form, is_double: e.target.checked })} /> Two holidays on this date
        </label>
        <button type="submit" disabled={busy} className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer">
          {busy ? "Saving…" : editing ? "Save" : "Add holiday"}
        </button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm(EMPTY); }} className="px-3 py-1.5 text-xs text-slate-500 cursor-pointer">Cancel</button>}
      </form>

      <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
        <div className="px-[18px] py-3 border-b border-black/[0.09] flex flex-wrap items-center gap-3">
          <div className="text-[13px] font-semibold text-slate-800">Holidays in</div>
          <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-[11px] text-slate-400">On these dates no one is marked absent or late, and leave cannot be filed. Pay follows Admin › Settings › Holiday pay.</span>
        </div>
        {!data && !error ? <SkeletonList /> : error ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-red-600">{error}</div>
        ) : data.holidays.length === 0 ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">No holidays for {year} yet. Add them from the official proclamation.</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-400 border-b border-black/[0.09]">
              <th className="px-[18px] py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Type</th><th className="px-3 py-2.5 font-medium text-right">Actions</th></tr></thead>
            <tbody>
              {data.holidays.map((h) => (
                <tr key={h.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                  <td className="px-[18px] py-2.5 whitespace-nowrap text-slate-700">{fmt(h.date)}</td>
                  <td className="px-3 py-2.5 text-slate-800 font-medium">{h.name}{h.is_double && <span className="ml-1.5 text-[9px] font-bold text-red-600">DOUBLE</span>}</td>
                  <td className="px-3 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${typeOf(h.type)[2]}`}>{typeOf(h.type)[1]}</span></td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => { setEditing(h.id); setForm({ date: h.date, name: h.name, type: h.type, is_double: !!h.is_double }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 cursor-pointer">Edit</button>
                      <button onClick={() => remove(h)} className="px-2.5 py-1 border border-red-200 rounded-md text-[11px] text-red-600 cursor-pointer">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
