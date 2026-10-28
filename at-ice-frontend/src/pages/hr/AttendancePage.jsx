// src/pages/hr/AttendancePage.jsx
//
// HR Attendance page. View only: records come from the Attendance Station
// kiosk (face recognition), so times are never edited here.
// Two views:
//   Daily    one date (default today). The status cards (Timed In, Late, Not
//            In Yet, On Leave) are the filters of the employee table below.
//   History  one pay period (cutoff, read-only start and end) or a from-to
//            range, newest first, with CSV and PDF export.
// Search by employee ID first (EMP-0001), then by name. The data follows the
// live feed (lib/live.js), so there is no Refresh button.
// Opened with ?view=history (e.g. from the HR Dashboard) it starts on History.

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import echo from "../../echo";
import HrLayout from "../../components/HrLayout";
import { SkeletonList } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import { fullName } from "../../lib/names";
import { payPeriodLabel } from "../../lib/payPeriod";
import { PRINT_BASE_CSS, printDocument } from "../../lib/printDocument";
import { toast } from "../../lib/toast";
import { TZ, formatDateTime, formatTime } from "../../lib/time";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";
import { KpiCard } from "../../components/Kpi";
import { Icon } from "../../components/icons";

const SearchIcon = () => <Icon name="search" size={13} />;

const token = () => localStorage.getItem("token") || "";
const headers = () => ({ Accept: "application/json", Authorization: `Bearer ${token()}` });
const todayLocal = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// "08:05:00" -> "8:05:00 AM" (seconds kept: late is counted from them)
const fmtTime = (t) => formatTime(t, { seconds: true });
const fmtHours = (h) => { const n = Number(h); return !h || Number.isNaN(n) || n === 0 ? "—" : n.toFixed(2); };
// A record's date as YYYY-MM-DD in the business time zone
const recordDay = (d) => (d ? new Date(d).toLocaleDateString("en-CA", { timeZone: TZ }) : "");
const fmtDay = (ymd) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "");
const fmtLongDate = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const capitalize = (s) => (s ? String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");

const STATUS_LABEL = { present: "Present", late: "Late", absent: "Absent", half_day: "Half Day", on_leave: "On Leave" };
const STATUS_CLASS = {
  present: "bg-emerald-100 text-emerald-600",
  late: "bg-amber-100 text-amber-600",
  absent: "bg-red-100 text-red-600",
  half_day: "bg-slate-100 text-slate-600",
  on_leave: "bg-cyan-100 text-cyan-600",
};

// Who a record belongs to: the employee record first, then the enrolled face
const workerName = (a) => fullName(a.employee) || a.face_data?.worker_name || a.worker_name || "Unknown";
const workerCode = (a) => a.employee?.employee_id || "";
const workerPk = (a) => String(a.employee_id || a.employee?.id || a.face_data?.employee_id || "");
const workerPosition = (a) => capitalize(a.employee?.position || a.face_data?.role) || "—";

// Search: employee ID first, then name. Returns 2 (ID match), 1 (name), 0 (no match).
function matchRank(q, code, name) {
  if (!q) return 1;
  if (code && code.toLowerCase().includes(q)) return 2;
  return name.toLowerCase().includes(q) ? 1 : 0;
}
function bySearch(list, q, code, name) {
  return list
    .map((x) => [x, matchRank(q, code(x), name(x))])
    .filter(([, r]) => r > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([x]) => x);
}

export default function AttendancePage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState(searchParams.get("view") === "history" ? "history" : "daily");
  const [date, setDate] = useState(todayLocal());
  const [search, setSearch] = useState("");
  const [cardFilter, setCardFilter] = useState("in"); // daily: in | late | not_in | on_leave; history: all | present | late | other
  const [records, setRecords] = useState([]);
  const [roster, setRoster] = useState(null); // { not_in: [], on_leave: [] } for the Daily view
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // History range: a cutoff (default) or a free from-to range
  const [rangeMode, setRangeMode] = useState("cutoff");
  const [period, setPeriod] = useState(null); // { start, end } of the cutoff shown
  const [from, setFrom] = useState(addDays(todayLocal(), -13));
  const [to, setTo] = useState(todayLocal());
  const range = rangeMode === "cutoff" ? period : { start: from, end: to };

  const loadPeriod = useCallback(async (day) => {
    const res = await fetch(`/api/pay-period?date=${encodeURIComponent(day)}`, { headers: headers() });
    if (res.ok) setPeriod(await res.json());
  }, []);
  useEffect(() => { if (view === "history" && !period) loadPeriod(todayLocal()); }, [view, period, loadPeriod]);

  const fetchRecords = useCallback(async () => {
    if (view === "history" && (!range?.start || !range?.end)) return;
    setLoading(true);
    setError("");
    try {
      const qs = view === "history" ? `from=${range.start}&to=${range.end}` : `date=${encodeURIComponent(date)}`;
      const res = await fetch(`/api/attendances?${qs}`, { headers: headers() });
      if (!res.ok) throw new Error(`Could not load attendance records (${res.status}).`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      if (view === "daily") {
        const rRes = await fetch(`/api/attendances/roster?date=${encodeURIComponent(date)}`, { headers: headers() });
        setRoster(rRes.ok ? await rRes.json() : null);
      } else {
        setRoster(null);
      }
    } catch (e) {
      setError(e.message || "Could not load attendance records.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [date, view, range?.start, range?.end]);

  // Real time: reload when a live notice for this page arrives (lib/live.js),
  // and when the Attendance Station broadcasts a scan (if Pusher is set up).
  const live = useLiveTick(["attendance", "leave"]);
  useEffect(() => { fetchRecords(); }, [fetchRecords, live]);
  useEffect(() => {
    echo.private("attendance").listen(".attendance.recorded", () => fetchRecords());
    return () => echo.leave("attendance");
  }, [fetchRecords]);

  const changeView = (v) => { setView(v); setCardFilter(v === "history" ? "all" : "in"); };

  const q = search.trim().toLowerCase();
  const matchedRecords = useMemo(() => bySearch(records, q, workerCode, workerName), [records, q]);
  const notIn = useMemo(() => bySearch(roster?.not_in || [], q, (e) => e.employee_id || "", (e) => e.name || ""), [roster, q]);
  const onLeave = useMemo(() => bySearch(roster?.on_leave || [], q, (e) => e.employee_id || "", (e) => e.name || ""), [roster, q]);

  const isToday = date === todayLocal();
  const late = matchedRecords.filter((a) => a.status === "late");
  const present = matchedRecords.filter((a) => a.status === "present");
  const other = matchedRecords.filter((a) => a.status !== "present" && a.status !== "late");

  // The status cards are the filters of the table
  const cards = view === "history" ? [
    { key: "all", label: "Total Recorded", value: matchedRecords.length, context: "In this range" },
    { key: "present", label: "Present", value: present.length, context: "On time" },
    { key: "late", label: "Late", value: late.length, context: "Past shift start" },
    { key: "other", label: "Other", value: other.length, context: "Absent, half day, on leave" },
  ] : [
    { key: "in", label: "Timed In", value: matchedRecords.length, context: isToday ? "Scanned in today" : "Scanned in on this date" },
    { key: "late", label: "Late", value: late.length, context: "Past shift start" },
    roster?.holiday
      ? { key: "not_in", label: "Holiday", value: "—", context: `${roster.holiday.name}: no one is absent`, tone: "text-violet-600" }
      : { key: "not_in", label: isToday ? "Not In Yet" : "Did Not Time In", value: roster ? notIn.length : "—", context: "No Time In, not on leave", tone: "text-red-600" },
    { key: "on_leave", label: "On Leave", value: roster ? onLeave.length : "—", context: "Approved leave", tone: "text-cyan-600" },
  ];

  const shown = { all: matchedRecords, in: matchedRecords, present, late, other }[cardFilter] || matchedRecords;
  const activeCard = cards.find((c) => c.key === cardFilter);

  // Export: the range shown, for one employee when the search is an exact employee ID
  const exactEmployee = useMemo(() => {
    const hit = records.find((a) => workerCode(a) && workerCode(a).toLowerCase() === q);
    return hit ? { id: workerPk(hit), code: workerCode(hit), name: workerName(hit) } : null;
  }, [records, q]);

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams({ from: range.start, to: range.end });
      if (exactEmployee) params.set("employee_id", exactEmployee.id);
      const res = await fetch(`/api/attendances/export?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error("The CSV could not be made.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-${exactEmployee ? `${exactEmployee.code}-` : ""}${range.start}-to-${range.end}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const exportPdf = () => {
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const rows = shown.map((a) => `<tr><td>${esc(workerCode(a))}</td><td>${esc(workerName(a))}</td><td>${esc(fmtDay(recordDay(a.date)))}</td><td>${esc(fmtTime(a.time_in))}</td><td>${esc(fmtTime(a.time_out))}</td><td>${esc(fmtHours(a.hours_worked))}</td><td>${esc(a.late_minutes || 0)}</td><td>${esc(STATUS_LABEL[a.status] || a.status)}</td><td>${esc(a.notes || "")}</td></tr>`).join("");
    printDocument(`<!doctype html><html><head><title>Attendance</title><style>${PRINT_BASE_CSS}
      body { font-family: Arial, sans-serif; font-size: 11px; color: #0f172a; }
      h1 { font-size: 16px; margin: 0 0 2px; } .sub { color: #475569; margin-bottom: 10px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; text-align: left; } th { background: #f1f5f9; }
    </style></head><body><div class="sheet">
      <h1>Attendance ${exactEmployee ? `· ${esc(exactEmployee.code)} ${esc(exactEmployee.name)}` : "· All employees"}</h1>
      <div class="sub">${esc(payPeriodLabel(range))} · ${shown.length} record${shown.length === 1 ? "" : "s"} · ${esc(activeCard?.label || "")} · printed ${formatDateTime(new Date())}</div>
      <table><thead><tr><th>Employee ID</th><th>Name</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>Late (min)</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows || '<tr><td colspan="9">No records.</td></tr>'}</tbody></table>
    </div></body></html>`);
  };

  const pager = usePagination(shown);

  return (
    <HrLayout pageTitle="Attendance" breadcrumb="HRIS / Attendance">
      {/* FILTERS */}
      <div className="bg-white border border-black/[0.09] rounded-xl px-[18px] py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl" role="group" aria-label="View" data-fx-tabs>
          {[["daily", "Daily"], ["history", "History log"]].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => changeView(key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer ${view === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>

        {view === "daily" ? (
          <div className="flex items-center gap-2">
            <label htmlFor="att-date" className="text-[11px] font-medium text-slate-400">Date</label>
            <input id="att-date" type="date" value={date} max={todayLocal()} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-700 focus:outline-none focus:border-cyan-400" />
            {!isToday && (
              <button onClick={() => setDate(todayLocal())} className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-500 cursor-pointer hover:border-cyan-400 hover:text-cyan-500">Today</button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Range" value={rangeMode} onChange={(e) => setRangeMode(e.target.value)} className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-700">
              <option value="cutoff">Pay period (cutoff)</option>
              <option value="range">Date range</option>
            </select>
            {rangeMode === "cutoff" ? (
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous cutoff" disabled={!period} onClick={() => loadPeriod(addDays(period.start, -1))} className="px-2 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-500 hover:border-cyan-400 cursor-pointer">‹</button>
                <span className="px-2.5 py-1.5 rounded-md bg-slate-50 border border-black/[0.06] text-xs text-slate-700 font-medium min-w-[170px] text-center" title="Start and end are fixed by the pay period">
                  {period ? payPeriodLabel(period) : "…"}
                </span>
                <button type="button" aria-label="Next cutoff" disabled={!period} onClick={() => loadPeriod(addDays(period.end, 1))} className="px-2 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-500 hover:border-cyan-400 cursor-pointer">›</button>
                <input type="date" aria-label="Go to the cutoff of a date" max={todayLocal()} onChange={(e) => e.target.value && loadPeriod(e.target.value)} className="px-2 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-500" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input type="date" aria-label="From" value={from} max={to && to < todayLocal() ? to : todayLocal()} onChange={(e) => e.target.value && setFrom(e.target.value)} className="px-2 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-700" />
                <span className="text-[11px] text-slate-400">to</span>
                <input type="date" aria-label="To" value={to} min={from} max={todayLocal()} onChange={(e) => e.target.value && setTo(e.target.value)} className="px-2 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-700" />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 px-2.5 py-1.5 border border-black/[0.09] rounded-md text-slate-400 w-full sm:w-64">
          <SearchIcon />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employee ID (EMP-0001) or name"
            aria-label="Search by employee ID or name" className="flex-1 min-w-0 text-xs text-slate-700 bg-transparent focus:outline-none" />
        </div>

        <div className="flex-1" />
        {view === "history" ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">{exactEmployee ? `Export: ${exactEmployee.code}` : "Export: all employees"}</span>
            <button type="button" onClick={exportCsv} disabled={!range} className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-600 hover:border-cyan-400 hover:text-cyan-600 cursor-pointer">CSV</button>
            <button type="button" onClick={exportPdf} disabled={!range} className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-600 hover:border-cyan-400 hover:text-cyan-600 cursor-pointer">PDF</button>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">
            {fmtLongDate(date)}
            {roster?.holiday && <span className="ml-2 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">Holiday: {roster.holiday.name}</span>}
          </div>
        )}
      </div>

      {/* STATUS CARDS = FILTERS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {cards.map((c) => {
          const look = { all: ["users", "cyan"], in: ["check", "emerald"], present: ["check", "emerald"], late: ["clock", "amber"], other: ["calendar", "violet"], not_in: ["x", "rose"], on_leave: ["calendar", "violet"] }[c.key] || ["chart", "cyan"];
          const total = cards[0]?.value;
          return (
            <KpiCard key={c.key} label={c.label} icon={look[0]} tone={look[1]} value={loading ? "…" : error ? "—" : c.value} sub={c.context}
              bar={c.key !== cards[0].key && typeof c.value === "number" && typeof total === "number" && total > 0 ? Math.min(1, c.value / total) : undefined}
              live={c.key === "in" && isToday && typeof c.value === "number" && c.value > 0}
              onClick={() => setCardFilter(c.key)} active={cardFilter === c.key} />
          );
        })}
      </div>

      {/* EMPLOYEE TABLE (follows the selected card) */}
      <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
        <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-slate-800">{activeCard?.label}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {view === "history" ? `${range ? payPeriodLabel(range) : ""} · newest first` : "Recorded by the Attendance Station. View only."}
            </div>
          </div>
        </div>

        {loading ? (
          <SkeletonList />
        ) : error ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-red-600">{error}</div>
        ) : cardFilter === "not_in" ? (
          <PeopleTable rows={notIn} empty={roster?.holiday ? `${roster.holiday.name} (holiday): working is optional and no one is marked absent or late.` : isToday ? "Everyone has timed in or is on leave." : "Everyone timed in or was on leave."}
            third="Position" thirdOf={(e) => capitalize(e.position) || "—"} />
        ) : cardFilter === "on_leave" ? (
          <PeopleTable rows={onLeave} empty="No one is on leave on this date."
            third="Leave type" thirdOf={(e) => `${capitalize(e.leave_type)} leave${e.is_half_day ? " (half day)" : ""}`} />
        ) : shown.length === 0 ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">
            {records.length === 0 ? (view === "history" ? "No attendance in this range." : isToday ? "No attendance recorded yet today." : "No attendance recorded on this date.") : "No record matches."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                  <th className="px-[18px] py-2.5 font-medium">Employee ID</th>
                  <th className="px-[18px] py-2.5 font-medium">Name</th>
                  <th className="px-[18px] py-2.5 font-medium">Position</th>
                  {view === "history" && <th className="px-[18px] py-2.5 font-medium">Date</th>}
                  <th className="px-[18px] py-2.5 font-medium">Time In</th>
                  <th className="px-[18px] py-2.5 font-medium">Time Out</th>
                  <th className="px-[18px] py-2.5 font-medium">Hours</th>
                  <th className="px-[18px] py-2.5 font-medium">Late</th>
                  <th className="px-[18px] py-2.5 font-medium">Status</th>
                  <th className="px-[18px] py-2.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map((a) => (
                  <tr key={a.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                    <td className="px-[18px] py-2.5 font-mono text-slate-600 whitespace-nowrap">{workerCode(a) || "—"}</td>
                    <td className="px-[18px] py-2.5 text-slate-800 font-medium whitespace-nowrap">{workerName(a)}</td>
                    <td className="px-[18px] py-2.5 text-slate-500 whitespace-nowrap">{workerPosition(a)}</td>
                    {view === "history" && <td className="px-[18px] py-2.5 text-slate-600 whitespace-nowrap">{fmtDay(recordDay(a.date))}</td>}
                    <td className="px-[18px] py-2.5 font-mono text-slate-700 whitespace-nowrap">{fmtTime(a.time_in)}</td>
                    <td className="px-[18px] py-2.5 font-mono text-slate-700 whitespace-nowrap">{fmtTime(a.time_out)}</td>
                    <td className="px-[18px] py-2.5 text-slate-600 font-mono">{fmtHours(a.hours_worked)}</td>
                    <td className={`px-[18px] py-2.5 font-mono ${a.late_minutes > 0 ? "text-amber-600" : "text-slate-400"}`}>{a.late_minutes > 0 ? `${a.late_minutes} min` : "—"}</td>
                    <td className="px-[18px] py-2.5">
                      {a.holiday ? (
                        <span title={a.holiday.name} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-violet-100 text-violet-700">Holiday</span>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${STATUS_CLASS[a.status] || "bg-slate-100 text-slate-500"}`}>{STATUS_LABEL[a.status] || a.status || "—"}</span>
                      )}
                    </td>
                    <td className="px-[18px] py-2.5 text-slate-500 max-w-[220px] truncate" title={a.notes || ""}>{a.notes || "—"}</td>
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

// Not In Yet and On Leave: employee ID, name and one more column. Not clickable.
function PeopleTable({ rows, empty, third, thirdOf }) {
  const pager = usePagination(rows);
  if (rows.length === 0) return <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">{empty}</div>;
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-black/[0.09]">
            <th className="px-[18px] py-2.5 font-medium min-w-[120px]">Employee ID</th>
            <th className="px-[18px] py-2.5 font-medium min-w-[160px]">Name</th>
            <th className="px-[18px] py-2.5 font-medium min-w-[140px]">{third}</th>
          </tr>
        </thead>
        <tbody>
          {pager.pageItems.map((e) => (
            <tr key={e.id} className="border-b border-black/[0.06] last:border-b-0">
              <td className="px-[18px] py-2.5 font-mono text-slate-600">{e.employee_id || "—"}</td>
              <td className="px-[18px] py-2.5 text-slate-800 font-medium">{e.name}</td>
              <td className="px-[18px] py-2.5 text-slate-600">{thirdOf(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination pager={pager} />
    </div>
  );
}
