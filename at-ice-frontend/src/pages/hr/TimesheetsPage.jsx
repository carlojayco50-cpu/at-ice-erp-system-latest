// src/pages/hr/TimesheetsPage.jsx
//
// HR Timesheets (docs/REVIEW-DECISIONS.md): every active employee's attendance
// for one pay period (cutoff), worked out from the Attendance Station and
// approved leave: days present, absences, late minutes, leave. HR approves the
// timesheets once the period has ended; that makes each employee's payroll,
// which Admin then pays (Admin > Payroll). Salary is confidential, so no pay
// amounts are shown here.

import { useCallback, useEffect, useMemo, useState } from "react";
import HrLayout from "../../components/HrLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import { payPeriodLabel } from "../../lib/payPeriod";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { todayManila } from "../../lib/time";
import { Icon } from "../../components/icons";

const token = () => localStorage.getItem("token") || "";
async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token()}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.errors ? Object.values(data.errors).flat()[0] : data?.message || `Request failed (${res.status})`);
  return data;
}
const todayLocal = () => new Date().toLocaleDateString("en-CA");
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Same pay-period buttons and search as Admin > Payroll
const Chevron = ({ left }) => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><polyline points={left ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} /></svg>;
const SearchIcon = () => <Icon name="search" size={14} />;
const navBtn = "inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 cursor-pointer";
const num = (n) => { const v = Number(n); return !v ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ""); };

const STATUS = {
  not_approved: ["Not approved", "bg-slate-100 text-slate-500"],
  unpaid: ["Approved · waiting for pay", "bg-amber-100 text-amber-700"],
  paid: ["Paid", "bg-emerald-100 text-emerald-700"],
};

export default function TimesheetsPage() {
  // The previous pay period is the one usually being approved
  const [date, setDate] = useState(() => addDays(todayLocal(), -14));
  const [data, setData] = useState(null); // { period, rows }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  // Overtime is paid only for the employees ticked here (R3)
  const [otOk, setOtOk] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api(`/api/timesheets?date=${date}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [date]);
  const live = useLiveTick(["attendance", "leave", "payroll", "employees"]);
  useEffect(() => { load(); }, [load, live]);
  useEffect(() => { setSelected(new Set()); setOtOk(new Set()); }, [date]);

  const period = data?.period;
  const ended = period ? period.end < todayLocal() : false;
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.rows || [])
    .map((r) => [r, !q ? 1 : String(r.employee_id).toLowerCase().includes(q) ? 2 : r.name.toLowerCase().includes(q) ? 1 : 0])
    .filter(([, rank]) => rank > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([r]) => r), [data, q]);
  const selectable = rows.filter((r) => r.status !== "paid");

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  const approve = async () => {
    setBusy(true);
    try {
      const res = await api("/api/timesheets/approve", { method: "POST", body: JSON.stringify({ date: period.start, employee_ids: [...selected], approve_ot_ids: [...otOk].filter((id) => selected.has(id)) }) });
      toast.success(res.message);
      setSelected(new Set());
      setOtOk(new Set());
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pager = usePagination(rows);

  // Period summary (counts only, never pay amounts)
  const all = data?.rows || [];
  const statusOf = (s) => all.filter((r) => r.status === s).length;
  const absences = all.reduce((s, r) => s + Number(r.absent_days || 0), 0);
  const lateMin = all.reduce((s, r) => s + Number(r.late_minutes || 0), 0);
  const otToApprove = all.filter((r) => r.ot_pending_minutes > 0).length;
  const done = statusOf("unpaid") + statusOf("paid");

  return (
    <HrLayout pageTitle="Timesheets" breadcrumb="HRIS / Timesheets">
      <KpiGrid cols={5}>
        <KpiCard label="Employees" icon="users" tone="cyan" value={all.length} sub={period ? payPeriodLabel(period) : "This pay period"} />
        <KpiCard label="Approved" icon="check" tone="emerald" value={done} sub={`${statusOf("paid")} already paid by Admin`} bar={all.length ? done / all.length : 0} />
        <KpiCard label="Not approved" icon="clock" tone="amber" value={statusOf("not_approved")} sub={ended ? "Ready for your approval" : "Period has not ended yet"} bar={all.length ? statusOf("not_approved") / all.length : 0} live={ended && statusOf("not_approved") > 0} />
        <KpiCard label="Absences" icon="x" tone="rose" value={absences} sub={`${lateMin} late minutes in all`} />
        <KpiCard label="Overtime to approve" icon="alert" tone="violet" value={otToApprove} sub="Tick it with the timesheet to pay it" />
      </KpiGrid>

      <div className="bg-white border border-black/[0.09] rounded-xl px-[18px] py-3.5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous pay period" title="Previous pay period" disabled={!period} onClick={() => setDate(addDays(period.start, -1))} className={navBtn}><Chevron left /> Previous</button>
          <span className="px-3 py-1.5 rounded-md bg-slate-50 border border-black/[0.06] text-xs text-slate-700 font-medium min-w-[180px] text-center" title="Start and end are fixed by the pay period">
            {period ? payPeriodLabel(period) : "…"}
          </span>
          <button type="button" aria-label="Next pay period" title="Next pay period" disabled={!period} onClick={() => setDate(addDays(period.end, 1))} className={navBtn}>Next <Chevron /></button>
          <input type="date" aria-label="Go to the pay period of a date" max={todayManila()} onChange={(e) => e.target.value && setDate(e.target.value)} className="px-2 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-500" />
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-500 w-full sm:w-60">
          <SearchIcon />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employee ID or name" aria-label="Search by employee ID or name"
            className="w-full bg-transparent outline-none text-xs text-slate-800 placeholder:text-slate-500" />
        </div>
        <div className="flex-1" />
        {period && !ended && <span className="text-[11px] text-amber-600">This pay period ends {period.end}; timesheets can be approved after that.</span>}
        <button type="button" onClick={approve} disabled={!ended || selected.size === 0 || busy}
          className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer">
          {busy ? "Approving…" : `Approve ${selected.size || ""} timesheet${selected.size === 1 ? "" : "s"}`}
        </button>
      </div>

      <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
        <div className="px-[18px] py-3 border-b border-black/[0.09] text-[11px] text-slate-400">
          From the Attendance Station and approved leave. Approving makes the payroll; Admin pays it. Pay amounts are not shown here. Tick the overtime to approve it with the timesheet; overtime not approved is not paid.
        </div>
        {loading ? <SkeletonList /> : error ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">No employees in this pay period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                  <th className="px-[18px] py-2.5"><input type="checkbox" data-native aria-label="Select all" checked={allOn} disabled={!ended}
                    onChange={() => setSelected(allOn ? new Set() : new Set(selectable.map((r) => r.id)))} /></th>
                  <th className="px-3 py-2.5 font-medium">Employee ID</th>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Present</th>
                  <th className="px-3 py-2.5 font-medium">Absent</th>
                  <th className="px-3 py-2.5 font-medium">Late (min)</th>
                  <th className="px-3 py-2.5 font-medium">Paid leave</th>
                  <th className="px-3 py-2.5 font-medium">Unpaid leave</th>
                  <th className="px-3 py-2.5 font-medium">Holiday worked</th>
                  <th className="px-3 py-2.5 font-medium">Overtime</th>
                  <th className="px-3 py-2.5 font-medium">No Time Out</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map((r) => (
                  <tr key={r.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                    <td className="px-[18px] py-2.5"><input type="checkbox" data-native aria-label={`Select ${r.employee_id}`} disabled={!ended || r.status === "paid"} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">{r.employee_id}</td>
                    <td className="px-3 py-2.5 text-slate-800 font-medium whitespace-nowrap">
                      {r.name}
                      {r.employment_status === "probationary" && <span className="ml-1.5 text-[9px] font-bold text-amber-600">PROBATIONARY</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono">{num(r.days_present)}</td>
                    <td className={`px-3 py-2.5 font-mono ${r.absent_days ? "text-red-600" : ""}`}>{num(r.absent_days)}</td>
                    <td className={`px-3 py-2.5 font-mono ${r.late_minutes ? "text-amber-600" : ""}`}>{num(r.late_minutes)}</td>
                    <td className="px-3 py-2.5 font-mono">{num(r.paid_leave_days)}</td>
                    <td className="px-3 py-2.5 font-mono">{r.unpaid_leave_hours ? `${num(r.unpaid_leave_days)} d + ${num(r.unpaid_leave_hours)} h` : num(r.unpaid_leave_days)}</td>
                    <td className="px-3 py-2.5 font-mono text-violet-700">{num(r.holiday_days)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.ot_pending_minutes > 0 ? (
                        <label className="flex items-center gap-1.5 text-amber-700" title="Paid only if approved">
                          <input type="checkbox" data-native disabled={!ended || r.status === "paid"} checked={otOk.has(r.id)}
                            onChange={() => setOtOk((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                          {num(r.ot_pending_minutes / 60)} h to approve
                        </label>
                      ) : r.ot_approved_hours > 0 ? <span className="font-mono text-emerald-700">{num(r.ot_approved_hours)} h approved</span> : "—"}
                    </td>
                    <td className={`px-3 py-2.5 font-mono ${r.missing_time_out ? "text-red-600" : ""}`}>{num(r.missing_time_out)}</td>
                    <td className="px-3 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${STATUS[r.status]?.[1]}`}>{STATUS[r.status]?.[0] || r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination pager={pager} />
          </div>
        )}
      </div>
    </HrLayout>
  );
}
