// src/pages/hr/HolidaysPage.jsx
//
// Holiday calendar (HR and Admin; R3 in docs/REVIEW-DECISIONS.md). Attendance,
// leave and payroll read holidays from here, so keep it current: holidays
// change every year and can be declared on short notice. The 2026 list is
// seeded from Proclamation No. 1006 and No. 1189 (verify against the latest).
// Adding and editing happen in a modal (the "Add holiday" button); the bar
// above the table only filters the list.

import { useCallback, useEffect, useMemo, useState } from "react";
import HrLayout from "../../components/HrLayout";
import AdminLayout from "../../components/AdminLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import DraftHint from "../../components/DraftHint";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import { confirmAction } from "../../lib/confirm";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { ActivityFeed, MiniBars, StatusBreakdown } from "../../components/Insight";
import { todayManila } from "../../lib/time";

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
const inputCls = "px-2.5 py-1.5 border border-slate-300 rounded-md text-xs text-slate-700 bg-white focus:outline-none focus:border-cyan-400";
const labelCls = "text-[10px] font-semibold uppercase tracking-wider text-slate-500";
const EMPTY = { date: "", name: "", type: "REGULAR", is_double: false };
const NO_FILTER = { q: "", month: "", date: "", type: "" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const SearchIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;

function HolidayModal({ holiday, onClose, onSaved }) {
  const editing = holiday?.id || null;
  // Unsaved inputs survive a refresh (per holiday); closing forgets them.
  const draft = useDraft(`holidays:form:${editing || "new"}`, {
    form: holiday ? { date: holiday.date, name: holiday.name, type: holiday.type, is_double: !!holiday.is_double } : EMPTY,
  });
  const { form } = draft.values;
  const setForm = draft.set.form;
  const [busy, setBusy] = useState(false);
  const { clear } = draft;
  const close = useCallback(() => { clear(); onClose(); }, [clear, onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(editing ? `/api/holidays/${editing}` : "/api/holidays", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) });
      toast.success(editing ? `${form.name} was updated.` : `${form.name} was added.`);
      draft.clear();
      onSaved(form.date);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={close}>
      <form role="dialog" aria-modal="true" aria-label={editing ? "Edit holiday" : "Add a holiday"} onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl w-full max-w-md p-5 flex flex-col gap-3.5">
        <div>
          <div className="text-[15px] font-semibold text-slate-800">{editing ? "Edit holiday" : "Add a holiday"}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Use the date and name from the official proclamation.</div>
        </div>
        <DraftHint draft={draft} onDiscard={onClose} />
        <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-600">Date</span>
          <input type="date" required autoFocus value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-600">Holiday name</span>
          <input required maxLength={255} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Eid'l Adha" className={inputCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-medium text-slate-600">Type</span>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputCls}>
            {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
          <input type="checkbox" data-native checked={form.is_double} onChange={(e) => setForm({ ...form, is_double: e.target.checked })} /> Two holidays on this date
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} className="px-3.5 py-1.5 rounded-md border border-black/[0.09] text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button type="submit" disabled={busy} className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer">
            {busy ? "Saving…" : editing ? "Save changes" : "Add holiday"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function HolidaysPage({ admin = false }) {
  const Layout = admin ? AdminLayout : HrLayout;
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  // null, "add", or the holiday being edited; reopens after a refresh
  const modalDraft = useDraft("holidays:modal", { modal: null }, { when: (v) => !!v.modal });
  const { modal } = modalDraft.values;
  const setModal = modalDraft.set.modal;
  const [filter, setFilter] = useState(NO_FILTER);

  const load = useCallback(() => {
    api(`/api/holidays?year=${year}`).then((d) => { setError(""); setData(d); }).catch((e) => setError(e.message));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const closeModal = useCallback(() => setModal(null), [setModal]);
  const saved = (date) => {
    setModal(null);
    if (date.slice(0, 4) !== String(year)) setYear(Number(date.slice(0, 4)));
    else load();
  };

  const remove = async (h) => {
    if (!(await confirmAction({ title: `Remove ${h.name}?`, message: `${h.date} will be an ordinary day again (late, absent and leave apply).`, confirmLabel: "Remove", danger: true }))) return;
    try {
      await api(`/api/holidays/${h.id}`, { method: "DELETE" });
      toast.success(`${h.name} was removed.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const years = [...new Set([...(data?.years || []), new Date().getFullYear(), new Date().getFullYear() + 1])].sort();
  const filtering = Boolean(filter.q.trim() || filter.month || filter.date || filter.type);
  const shown = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return (data?.holidays || []).filter((h) =>
      (!q || h.name.toLowerCase().includes(q))
      && (!filter.month || Number(h.date.slice(5, 7)) === Number(filter.month))
      && (!filter.date || h.date === filter.date)
      && (!filter.type || h.type === filter.type));
  }, [data, filter]);

  const pager = usePagination(shown);

  // Year summary for the KPI cards and side panels
  const all = data?.holidays || [];
  const todayStr = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
  const upcoming = all.filter((h) => h.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const daysTo = next ? Math.round((new Date(`${next.date}T00:00:00`) - new Date(`${todayStr}T00:00:00`)) / 86400000) : null;
  const countType = (t) => all.filter((h) => h.type === t).length;
  const TYPE_TONE = { REGULAR: "rose", SPECIAL_NON_WORKING: "amber", SPECIAL_WORKING: "slate" };
  const byMonth = MONTHS.map((m, i) => ({ label: m.slice(0, 3), value: all.filter((h) => Number(h.date.slice(5, 7)) === i + 1).length }));

  return (
    <Layout pageTitle="Holidays" breadcrumb="HRIS / Holidays">
      <KpiGrid cols={5}>
        <KpiCard label={`Holidays in ${year}`} icon="calendar" tone="cyan" value={all.length} sub={`${upcoming.length} still to come`} bar={all.length ? upcoming.length / all.length : 0} />
        <KpiCard label="Regular" icon="star" tone="rose" value={countType("REGULAR")} sub="Double pay when worked" onClick={() => setFilter((f) => ({ ...f, type: f.type === "REGULAR" ? "" : "REGULAR" }))} active={filter.type === "REGULAR"} />
        <KpiCard label="Special (non-working)" icon="calendar" tone="amber" value={countType("SPECIAL_NON_WORKING")} sub="Premium pay when worked" onClick={() => setFilter((f) => ({ ...f, type: f.type === "SPECIAL_NON_WORKING" ? "" : "SPECIAL_NON_WORKING" }))} active={filter.type === "SPECIAL_NON_WORKING"} />
        <KpiCard label="Special working" icon="clock" tone="slate" value={countType("SPECIAL_WORKING")} sub="Ordinary work day" onClick={() => setFilter((f) => ({ ...f, type: f.type === "SPECIAL_WORKING" ? "" : "SPECIAL_WORKING" }))} active={filter.type === "SPECIAL_WORKING"} />
        <KpiCard label="Next holiday" icon="calendar" tone="emerald" value={next ? (daysTo === 0 ? "Today" : `${daysTo} day${daysTo === 1 ? "" : "s"}`) : "—"} sub={next ? `${next.name} · ${fmt(next.date)}` : `No more holidays in ${year}`} />
      </KpiGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
      <div className="xl:col-span-8 min-w-0">
      <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
        <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-slate-800">Holiday calendar</div>
            <div className="text-[11px] text-slate-500 mt-0.5">On these dates no one is marked absent or late, and leave cannot be filed. Pay follows Admin › Settings › Holiday pay.</div>
          </div>
          <div className="flex-1" />
          <button type="button" onClick={() => setModal("add")} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold cursor-pointer">
            <span aria-hidden="true" className="text-[15px] leading-none">+</span> Add holiday
          </button>
        </div>

        <div role="search" aria-label="Find holidays" className="px-[18px] py-3 bg-slate-50 border-b border-black/[0.09] flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1"><span className={labelCls}>Year</span>
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setFilter((f) => ({ ...f, date: "" })); }} className={inputCls}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 flex-1 min-w-[180px]"><span className={labelCls}>Name</span>
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-500 focus-within:border-cyan-400">
              <SearchIcon />
              <input type="search" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Search holidays by name" className="w-full bg-transparent outline-none text-xs text-slate-700 placeholder:text-slate-500" />
            </span></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Month</span>
            <select value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })} className={`${inputCls} min-w-[140px]`}>
              <option value="">All months</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Date</span>
            <input type="date" value={filter.date} min={`${year}-01-01`} max={`${year}-12-31` < todayManila() ? `${year}-12-31` : todayManila()} onChange={(e) => setFilter({ ...filter, date: e.target.value })} className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Type</span>
            <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} className={inputCls}>
              <option value="">All types ({all.length})</option>
              {TYPES.map(([k, l]) => <option key={k} value={k}>{l} ({countType(k)})</option>)}
            </select></label>
          {filtering && <button type="button" onClick={() => setFilter(NO_FILTER)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer">Clear filters</button>}
        </div>

        {!data && !error ? <SkeletonList /> : error ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-red-600">{error}</div>
        ) : data.holidays.length === 0 ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">No holidays for {year} yet. Use Add holiday to enter them from the official proclamation.</div>
        ) : shown.length === 0 ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">No holidays match these filters.</div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-400 border-b border-black/[0.09]">
              <th className="px-[18px] py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Type</th><th className="px-3 py-2.5 font-medium text-right">Actions</th></tr></thead>
            <tbody>
              {pager.pageItems.map((h) => (
                <tr key={h.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                  <td className="px-[18px] py-2.5 whitespace-nowrap text-slate-700">{fmt(h.date)}</td>
                  <td className="px-3 py-2.5 text-slate-800 font-medium">{h.name}{h.is_double && <span className="ml-1.5 text-[9px] font-bold text-red-600">DOUBLE</span>}</td>
                  <td className="px-3 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${typeOf(h.type)[2]}`}>{typeOf(h.type)[1]}</span></td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setModal(h)} className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 cursor-pointer">Edit</button>
                      <button data-no-confirm onClick={() => remove(h)} className="px-2.5 py-1 border border-red-200 rounded-md text-[11px] text-red-600 cursor-pointer">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && shown.length > 0 && <Pagination pager={pager} label={filtering ? `holidays (filtered from ${data.holidays.length})` : "holidays"} />}
      </div>
      </div>
      <aside className="xl:col-span-4 flex flex-col gap-4 min-w-0">
        <ActivityFeed
          title="Coming up"
          items={upcoming.map((h) => ({ id: h.id, title: h.name, meta: typeOf(h.type)[1], when: fmt(h.date).replace(/, \d{4}$/, ""), tone: TYPE_TONE[h.type] || "slate", icon: "calendar" }))}
          empty={`No more holidays in ${year}.`}
          max={5}
        />
        <MiniBars title={`Holidays per month, ${year}`} data={byMonth} />
        <StatusBreakdown
          title="By type"
          items={TYPES.map(([k, l]) => ({ key: k, label: l, count: countType(k), tone: TYPE_TONE[k] }))}
          onPick={(i) => setFilter((f) => ({ ...f, type: f.type === i.key ? "" : i.key }))}
          active={filter.type}
          empty={`No holidays for ${year} yet.`}
        />
      </aside>
      </div>
      {modal &&<HolidayModal holiday={modal === "add" ? null : modal} onClose={closeModal} onSaved={saved} />}
    </Layout>
  );
}
