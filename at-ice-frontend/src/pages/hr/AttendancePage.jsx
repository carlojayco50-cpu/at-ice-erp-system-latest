// src/pages/hr/AttendancePage.jsx
//
// HR Attendance page. View only: records come from the Attendance Station
// kiosk (face recognition + fingerprint), so HR does not edit them here.
// Two views: Daily (one date, default today) and History log (every record,
// newest first). Both can be narrowed to one employee with the dropdown.
// Live refresh through the "attendance" channel (same event as HRDashboard.jsx).
// Opened with ?view=history (e.g. from the HR Dashboard) it starts on the log.
// The Daily view also lists who has not timed in yet and who is on approved
// leave that day (GET /api/attendances/roster).

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import echo from "../../echo";
import HrLayout from "../../components/HrLayout";
import { SkeletonList } from "../../components/Skeleton";
import { useLiveTick } from "../../lib/live";
import { fullName } from "../../lib/names";

const RefreshIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
const SearchIcon  = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;

const token = () => localStorage.getItem("token") || "";
const todayLocal = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

// "08:05:00" -> "8:05 AM"
const fmtTime = (t) => {
  if (!t) return "—";
  const m = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  let h = Number(m[1]);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ap}`;
};

const fmtHours = (h) => {
  const n = Number(h);
  return !h || Number.isNaN(n) || n === 0 ? "—" : n.toFixed(2);
};

// "2026-10-08" or a timestamp -> "Oct 8, 2026" (local date; a Time Out after
// midnight shows the next day because it uses the record's update time)
const fmtShortDate = (d) => {
  if (!d) return "";
  const v = String(d);
  const dt = v.includes("T") ? new Date(v) : new Date(`${v.slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const fmtLongDate = (ymd) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// "driver" -> "Driver", "half_day" -> "Half Day"
const capitalize = (s) =>
  s ? String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";

const STATUS_LABEL = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  half_day: "Half Day",
  on_leave: "On Leave",
};

const STATUS_CLASS = {
  present: "bg-emerald-100 text-emerald-600",
  late: "bg-amber-100 text-amber-600",
  absent: "bg-red-100 text-red-600",
  half_day: "bg-slate-100 text-slate-600",
  on_leave: "bg-cyan-100 text-cyan-600",
};

// Name: the employee record first, then the face data
const workerName = (a) =>
  fullName(a.employee) || a.face_data?.worker_name || a.worker_name || "Unknown";

// Which employee a record belongs to (directly or through the enrolled face)
const workerId = (a) => String(a.employee_id || a.employee?.id || a.face_data?.employee_id || "");

const workerPosition = (a) => capitalize(a.employee?.position || a.face_data?.role) || "—";

export default function AttendancePage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState(searchParams.get("view") === "history" ? "history" : "daily");
  const [date, setDate] = useState(todayLocal());
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState(""); // "" = everyone
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [roster, setRoster] = useState(null); // { not_in: [], on_leave: [] } for the Daily view
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = view === "history" ? "/api/attendances" : `/api/attendances?date=${encodeURIComponent(date)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(`Could not load attendance records (${res.status}).`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      if (view === "daily") {
        const rRes = await fetch(`/api/attendances/roster?date=${encodeURIComponent(date)}`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
        });
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
  }, [date, view]);

  // Names for the employee dropdown
  useEffect(() => {
    fetch("/api/employees", { headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setEmployees((Array.isArray(list) ? list : list?.data || []).slice().sort((a, b) => fullName(a).localeCompare(fullName(b)))))
      .catch(() => setEmployees([]));
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["attendance", "leave"]);
  useEffect(() => { fetchRecords(); }, [fetchRecords, live]);

  // Live refresh when someone scans in at the Attendance Station
  useEffect(() => {
    echo.channel("attendance").listen(".attendance.recorded", () => fetchRecords());
    return () => echo.leaveChannel("attendance");
  }, [fetchRecords]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((a) =>
      (!employeeId || workerId(a) === employeeId) &&
      (!q || workerName(a).toLowerCase().includes(q))
    );
  }, [records, search, employeeId]);

  // Roster lists narrowed by the same employee filter and search
  const rosterFilter = useCallback((list) => {
    const q = search.trim().toLowerCase();
    return (list || []).filter((e) =>
      (!employeeId || String(e.id) === employeeId) &&
      (!q || String(e.name || "").toLowerCase().includes(q))
    );
  }, [search, employeeId]);
  const notIn = useMemo(() => rosterFilter(roster?.not_in), [roster, rosterFilter]);
  const onLeave = useMemo(() => rosterFilter(roster?.on_leave), [roster, rosterFilter]);

  const counts = useMemo(() => {
    const c = { total: records.length, present: 0, late: 0, other: 0 };
    records.forEach((a) => {
      if (a.status === "present") c.present += 1;
      else if (a.status === "late") c.late += 1;
      else c.other += 1;
    });
    return c;
  }, [records]);

  const isToday = date === todayLocal();

  const cards = view === "history" ? [
    { label: "Total Recorded", value: counts.total, context: "All records" },
    { label: "Present", value: counts.present, context: "On time" },
    { label: "Late", value: counts.late, context: "Past shift start" },
    { label: "Other", value: counts.other, context: "Absent, half day, on leave" },
  ] : [
    { label: "Timed In", value: counts.total, context: isToday ? "Scanned in today" : "Scanned in on this date" },
    { label: "Late", value: counts.late, context: "Past shift start" },
    { label: isToday ? "Not In Yet" : "Did Not Time In", value: roster ? roster.not_in.length : "—", context: "No Time In, not on leave", tone: "text-red-600" },
    { label: "On Leave", value: roster ? roster.on_leave.length : "—", context: "Approved leave", tone: "text-cyan-600" },
  ];

  return (
    <HrLayout
      pageTitle="Attendance"
      breadcrumb="HRIS / Attendance"
      headerActions={
        <button
          onClick={fetchRecords}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-black/[0.09] rounded-md text-xs text-slate-500 cursor-pointer hover:border-cyan-400 hover:text-cyan-500 transition-colors"
        >
          <RefreshIcon /> Refresh
        </button>
      }
    >
      {/* FILTERS */}
      <div className="bg-white border border-black/[0.09] rounded-xl px-[18px] py-3.5 flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl" role="group" aria-label="View">
          {[["daily", "Daily"], ["history", "History log"]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer ${view === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "daily" && (
        <div className="flex items-center gap-2">
          <label htmlFor="att-date" className="text-[11px] font-medium text-slate-400">Date</label>
          <input
            id="att-date"
            type="date"
            value={date}
            max={todayLocal()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-700 focus:outline-none focus:border-cyan-400"
          />
          {!isToday && (
            <button
              onClick={() => setDate(todayLocal())}
              className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-500 cursor-pointer hover:border-cyan-400 hover:text-cyan-500 transition-colors"
            >
              Today
            </button>
          )}
        </div>
        )}

        <div className="flex items-center gap-2">
          <label htmlFor="att-employee" className="text-[11px] font-medium text-slate-400">Employee</label>
          <select
            id="att-employee"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs text-slate-700 min-w-[180px]"
          >
            <option value="">All employees</option>
            {employees.map((emp) => <option key={emp.id} value={String(emp.id)}>{fullName(emp)}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 px-2.5 py-1.5 border border-black/[0.09] rounded-md text-slate-400 w-full sm:w-64">
          <SearchIcon />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search worker name"
            className="flex-1 min-w-0 text-xs text-slate-700 bg-transparent focus:outline-none"
          />
        </div>

        <div className="flex-1" />
        <div className="text-[11px] text-slate-400">{view === "history" ? "Every Time In and Time Out, newest first" : fmtLongDate(date)}</div>
      </div>

      {/* COUNTERS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-black/[0.09] rounded-xl p-4 flex flex-col gap-1.5">
            <span className="text-[11px] font-medium tracking-[0.02em] text-slate-400">{c.label}</span>
            <div className={`text-[26px] font-semibold font-mono tracking-tight leading-none ${c.tone || "text-slate-800"}`}>
              {loading ? "…" : error ? "—" : c.value}
            </div>
            <div className="text-[11px] text-slate-400">{c.context}</div>
          </div>
        ))}
      </div>

      {/* RECORDS TABLE */}
      <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
        <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-slate-800">{view === "history" ? "Attendance History Log" : "Attendance Records"}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Recorded by the Attendance Station (face recognition and fingerprint). View only.</div>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {loading || error ? "" : `${filtered.length} of ${records.length}`}
          </span>
        </div>

        {loading ? (
          <SkeletonList />
        ) : error ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-red-600">{error}</div>
        ) : records.length === 0 ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">
            {view === "history" ? "No attendance recorded yet." : isToday ? "No attendance recorded yet today." : "No attendance recorded on this date."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">No record matches the employee or search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                  <th className="px-[18px] py-2.5 font-medium">Worker</th>
                  <th className="px-[18px] py-2.5 font-medium">Position</th>
                  <th className="px-[18px] py-2.5 font-medium">Time In</th>
                  <th className="px-[18px] py-2.5 font-medium">Time Out</th>
                  <th className="px-[18px] py-2.5 font-medium">Hours</th>
                  <th className="px-[18px] py-2.5 font-medium">Status</th>
                  <th className="px-[18px] py-2.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                    <td className="px-[18px] py-2.5 text-slate-800 font-medium whitespace-nowrap">{workerName(a)}</td>
                    <td className="px-[18px] py-2.5 text-slate-500 whitespace-nowrap">{workerPosition(a)}</td>
                    <td className="px-[18px] py-2.5 whitespace-nowrap">
                      <div className="text-slate-700 font-mono">{fmtTime(a.time_in)}</div>
                      {a.time_in && <div className="text-[10px] text-slate-400 mt-0.5">{fmtShortDate(a.date)}</div>}
                    </td>
                    <td className="px-[18px] py-2.5 whitespace-nowrap">
                      <div className="text-slate-700 font-mono">{fmtTime(a.time_out)}</div>
                      {a.time_out && <div className="text-[10px] text-slate-400 mt-0.5">{fmtShortDate(a.updated_at || a.date)}</div>}
                    </td>
                    <td className="px-[18px] py-2.5 text-slate-600 font-mono">{fmtHours(a.hours_worked)}</td>
                    <td className="px-[18px] py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${STATUS_CLASS[a.status] || "bg-slate-100 text-slate-500"}`}>
                        {STATUS_LABEL[a.status] || a.status || "—"}
                      </span>
                    </td>
                    <td className="px-[18px] py-2.5 text-slate-500 max-w-[220px] truncate" title={a.notes || ""}>{a.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* WHO IS NOT IN / ON LEAVE (Daily view) */}
      {view === "daily" && !loading && !error && roster && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <RosterCard
            title={isToday ? "Not timed in yet" : "Did not time in"}
            note="Active employees with no Time In on this date and no approved leave."
            empty={isToday ? "Everyone has timed in or is on leave." : "Everyone timed in or was on leave."}
            rows={notIn}
            badge={() => <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-600">{isToday ? "Not in yet" : "No Time In"}</span>}
          />
          <RosterCard
            title="On leave"
            note="Approved leave requests covering this date."
            empty="No one is on leave on this date."
            rows={onLeave}
            badge={(e) => (
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 text-cyan-600 whitespace-nowrap">
                {capitalize(e.leave_type)} leave{e.is_half_day ? " (half day)" : ""}
              </span>
            )}
            sub={(e) => (e.start_date && e.end_date && String(e.start_date).slice(0, 10) !== String(e.end_date).slice(0, 10)
              ? `${fmtShortDate(e.start_date)} to ${fmtShortDate(e.end_date)}`
              : "")}
          />
        </div>
      )}
    </HrLayout>
  );
}
// One of the two lists under the Daily view (not timed in / on leave)
function RosterCard({ title, note, empty, rows, badge, sub }) {
  return (
    <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
      <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-slate-800">{title}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{note}</div>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-[18px] py-6 text-center text-[12px] text-slate-400">{empty}</div>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto">
          {rows.map((e) => (
            <li key={e.id} className="px-[18px] py-2.5 border-b border-black/[0.06] last:border-b-0 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="text-slate-800 font-medium truncate">{e.name}</div>
                <div className="text-[11px] text-slate-400">{capitalize(e.position) || "—"}{sub && sub(e) ? ` · ${sub(e)}` : ""}</div>
              </div>
              {badge(e)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
