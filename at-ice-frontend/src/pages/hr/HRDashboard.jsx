import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import echo from "../../echo";
import { fullName } from "../../lib/names";
import HrLayout from "../../components/HrLayout";
import { toList } from "../../lib/list";
import { useLiveTick } from "../../lib/live";
import { formatTime } from "../../lib/time";
import { KpiCard, KpiGrid } from "../../components/Kpi";
import { MiniBars, QuickActions } from "../../components/Insight";


const token = () => localStorage.getItem("token") || "";

// HR-scoped endpoints only (BI routes are admin-only and would 403 for HR)
async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}
const timeOf = (t) => formatTime(t);
const dateOf = (d) => (d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—");

// All dashboard lists in one go. null = that endpoint failed (shown as "—"),
// [] = loaded but empty.
async function loadDashboard() {
  const [faces, attendances, leaves, interviews, payrolls] = await Promise.allSettled([
    getJson("/api/face-data"),
    getJson("/api/attendances"),
    getJson("/api/leave-requests"),
    getJson("/api/applicants/upcoming"),
    getJson("/api/payrolls"),
  ]);
  const pick = (r) => (r.status === "fulfilled" ? toList(r.value) : null);
  return { faces: pick(faces), attendances: pick(attendances), leaves: pick(leaves), interviews: pick(interviews), payrolls: pick(payrolls) };
}

export default function HRDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ faces: null, attendances: null, leaves: null, interviews: null, payrolls: null });

  // Refresh button and live updates: numbers change in place, no loading flash.
  const fetchAll = useCallback(() => loadDashboard().then(setData), []);

  useEffect(() => {
    let active = true;
    loadDashboard().then((d) => {
      if (!active) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  // Live refresh when someone scans in at the Attendance Station
  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["*"]);
  useEffect(() => {
    echo.private("attendance").listen(".attendance.recorded", () => fetchAll());
    return () => echo.leave("attendance");
  }, [fetchAll, live]);

  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
  const todayAttendance = (data.attendances || []).filter((a) => String(a.date || a.created_at || "").slice(0, 10) === todayStr);
  const lateToday = todayAttendance.filter((a) => a.status === "late").length;
  const pendingLeaves = (data.leaves || []).filter((l) => l.status === "pending");

  const show = (list, value) => (loading ? "…" : list === null ? "—" : value);

  const enrolled = data.faces?.length || 0;
  const cards = [
    { label: "Enrolled workers", icon: "users", tone: "cyan", value: show(data.faces, enrolled), sub: "Faces registered for attendance" },
    { label: "Timed in today", icon: "check", tone: "emerald", live: todayAttendance.length > 0, value: show(data.attendances, todayAttendance.length), sub: enrolled ? `${Math.round((todayAttendance.length / enrolled) * 100)}% of enrolled workers` : "No faces enrolled yet", bar: enrolled ? todayAttendance.length / enrolled : 0 },
    { label: "Late today", icon: "clock", tone: "amber", value: show(data.attendances, lateToday), sub: todayAttendance.length ? `${Math.round((lateToday / todayAttendance.length) * 100)}% of today's time-ins` : "Nobody timed in yet", bar: todayAttendance.length ? lateToday / todayAttendance.length : 0 },
    { label: "Leave to review", icon: "calendar", tone: "violet", value: show(data.leaves, pendingLeaves.length), sub: "Waiting for your approval" },
    { label: "Upcoming interviews", icon: "user", tone: "slate", value: show(data.interviews, data.interviews?.length), sub: "Scheduled applicants" },
  ];
  // Time-ins over the last 7 days
  const week = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toLocaleDateString("en-CA");
    return { label: d.toLocaleDateString("en-PH", { weekday: "short" }), value: (data.attendances || []).filter((a) => String(a.date || "").slice(0, 10) === key && a.time_in).length };
  });

  const workerName = (a) => fullName(a.employee) || a.face_data?.worker_name || a.faceData?.worker_name || a.worker_name || "Unknown";
  // Live Notifications: every Time In and Time Out since the last paid
  // payroll (the newest paid period end). After payday the list starts over;
  // the full record stays in Attendance > History log.
  const paidUntil = (data.payrolls || [])
    .filter((p) => p.status === "paid" && p.period_end)
    .map((p) => String(p.period_end).slice(0, 10))
    .sort()
    .pop() || "";
  const liveEvents = (data.attendances || [])
    .filter((a) => String(a.date || "").slice(0, 10) > paidUntil)
    .flatMap((a) => {
      const day = String(a.date || "").slice(0, 10);
      const list = [];
      if (a.time_in) list.push({ key: `${a.id}-in`, kind: "in", name: workerName(a), time: a.time_in, day, at: `${day} ${a.time_in}` });
      if (a.time_out) list.push({ key: `${a.id}-out`, kind: "out", name: workerName(a), time: a.time_out, day, at: `${day} ${a.time_out}` });
      return list;
    })
    .sort((x, y) => (x.at < y.at ? 1 : -1));

  const leaveName = (l) => fullName(l.employee) || l.employee?.full_name || l.employee_name || "Employee";

  const empty = (text) => <div className="px-[18px] py-6 text-center text-[12px] text-slate-400">{text}</div>;

  return (
    <HrLayout
      pageTitle="HR Dashboard"
      breadcrumb="HR Dashboard"
    >
      {/* KPI CARDS */}
      <KpiGrid cols={5}>
        {cards.map((c) => <KpiCard key={c.label} {...c} />)}
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">

        <div className="flex flex-col gap-3 min-w-0">
        {/* ATTENDANCE TODAY */}
        <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
          <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold text-slate-800">Attendance Today</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{dateOf(new Date())}</div>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">{data.attendances === null ? "—" : `${todayAttendance.length} recorded`}</span>
          </div>
          {data.attendances === null && !loading ? empty("Could not load attendance records.")
            : todayAttendance.length === 0 ? empty("No attendance recorded yet today.")
            : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                    <th className="px-[18px] py-2.5 font-medium">Worker</th>
                    <th className="px-[18px] py-2.5 font-medium">Time In</th>
                    <th className="px-[18px] py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todayAttendance.slice(0, 10).map((a) => (
                    <tr key={a.id} className="border-b border-black/[0.06] last:border-b-0">
                      <td className="px-[18px] py-2.5 text-slate-800 font-medium">{workerName(a)}</td>
                      <td className="px-[18px] py-2.5 text-slate-500 font-mono">{timeOf(a.time_in)}</td>
                      <td className="px-[18px] py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${a.status === "late" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                          {a.status || "present"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MiniBars title="Time-ins, last 7 days" subtitle="Workers who timed in at the Attendance Station" data={week} />
          <QuickActions actions={[
            { label: "Employees", hint: "Add, edit, enroll faces", icon: "users", onClick: () => navigate("/hr/employees") },
            { label: "Attendance", hint: "Today and history", icon: "clock", tone: "emerald", onClick: () => navigate("/hr/attendance") },
            { label: "Leave requests", hint: `${pendingLeaves.length} to review`, icon: "calendar", tone: "violet", onClick: () => navigate("/hr/leave-requests") },
            { label: "Timesheets", hint: "Approve the pay period", icon: "file", tone: "amber", onClick: () => navigate("/hr/timesheets") },
          ]} />
        </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-3">

          {/* LIVE NOTIFICATIONS: time in/out since the last payday */}
          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-slate-800">Live Notifications</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {paidUntil ? `Since the payroll paid up to ${dateOf(paidUntil)}` : "Time In and Time Out"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("/hr/attendance?view=history")}
                className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                History log
              </button>
            </div>
            {data.attendances === null && !loading ? empty("Could not load attendance.")
              : liveEvents.length === 0 ? empty("No Time In or Time Out since the last payday.")
              : (
                <div className="max-h-[280px] overflow-y-auto">
                  {liveEvents.slice(0, 30).map((ev, i, arr) => (
                    <div key={ev.key} className={`flex items-center gap-2.5 px-[18px] py-2.5 ${i < arr.length - 1 ? "border-b border-black/[0.06]" : ""}`}>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${ev.kind === "in" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                        {ev.kind === "in" ? "Time In" : "Time Out"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-800 truncate">{ev.name}</div>
                        <div className="text-[11px] text-slate-400">{dateOf(ev.day)} · {timeOf(ev.time)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* PENDING LEAVE */}
          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-black/[0.09] text-[13px] font-semibold text-slate-800">Pending Leave Requests</div>
            {data.leaves === null && !loading ? empty("Could not load leave requests.")
              : pendingLeaves.length === 0 ? empty("No pending leave requests.")
              : pendingLeaves.slice(0, 5).map((l, i, arr) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => navigate(`/hr/leave-requests?view=${l.id}`)}
                  className={`w-full text-left px-[18px] py-2.5 cursor-pointer hover:bg-slate-50 ${i < arr.length - 1 ? "border-b border-black/[0.06]" : ""}`}
                >
                  <div className="text-xs font-medium text-slate-800">{leaveName(l)}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    <span className="capitalize">{l.leave_type || l.type || "Leave"}</span> · {dateOf(l.start_date)}{l.end_date ? ` – ${dateOf(l.end_date)}` : ""}
                  </div>
                </button>
              ))}
          </div>

          {/* UPCOMING INTERVIEWS */}
          <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
            <div className="px-[18px] py-3.5 border-b border-black/[0.09] text-[13px] font-semibold text-slate-800">Upcoming Interviews</div>
            {data.interviews === null && !loading ? empty("Could not load interviews.")
              : (data.interviews || []).length === 0 ? empty("No upcoming interviews.")
              : data.interviews.slice(0, 5).map((a, i, arr) => (
                <div key={a.id} className={`px-[18px] py-2.5 flex items-center justify-between gap-3 ${i < arr.length - 1 ? "border-b border-black/[0.06]" : ""}`}>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-800 truncate">{a.name || a.applicant_name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">{a.position_applied || a.position || "—"}</div>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono flex-shrink-0">{dateOf(a.interview_date)}</div>
                </div>
              ))}
          </div>

          {/* QUICK ACTION */}
          <button
            onClick={() => navigate("/hr/employees")}
            className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 active:bg-cyan-700 text-white text-[13px] font-semibold rounded-xl transition-colors shadow-sm cursor-pointer"
          >
            Enroll a Worker's Face (Employees › Face)
          </button>
        </div>
      </div>
    </HrLayout>
  );
}