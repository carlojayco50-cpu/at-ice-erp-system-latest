// src/pages/LeaveRequestPage.jsx
// Leave Request page for every employee role (Checker, Salesman, Maintenance)
// and Driver. Route: /my-leave. Own requests only. HR approves or rejects them.
// Rules (docs/REVIEW-DECISIONS.md, checked again by the server):
//   EL  emergency leave, in hours, one day
//   SL  sick leave, for past days only, filed at most 1 day after returning,
//       needs leave credits and a medical certificate
//   VL  vacation leave, starting at least 14 days from today
//   Probationary staff cannot file leave. Leave is paid from credits (0.5 day
//   per pay period once regular); without credits EL and VL are unpaid.
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { SkeletonList } from "../components/Skeleton";
import { toast } from "../lib/toast";
import { useLiveTick } from "../lib/live";
import EmptyState from "../components/EmptyState";
import { ScopeStatusRow } from "../components/NightMode";
import MessageBubble from "../components/MessageBubble";
import { openProtectedFile } from "../lib/openFile";
import { useDraft } from "../lib/useDraft";
import DraftHint from "../components/DraftHint";
import FileField from "../components/FileField";
import { confirmAction } from "../lib/confirm";

const TYPE_LABEL = {
  sick: "Sick Leave (SL)",
  emergency: "Emergency Leave (EL)",
  vacation: "Vacation Leave (VL)",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
  other: "Other",
};

const STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const todayStr = () => new Date().toLocaleDateString("en-CA");
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}`, Accept: "application/json" });
const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const num = (n) => { const v = Number(n); return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ""); };

export default function LeaveRequestPage() {
  const navigate = useNavigate();
  const user = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();

  const [leaves, setLeaves] = useState([]);
  const [credits, setCredits] = useState(null); // { available, earned, used, probationary, hours_per_day, sl_filing_window_days, vl_notice_days }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // The form is kept as a draft once the employee changes something, so a
  // refresh keeps it (the attachment has to be chosen again).
  const draft = useDraft("leave:new", {
    dirty: false, leaveType: "vacation", halfDay: false, startDate: "", endDate: "", hours: "", reason: "",
  }, { when: (v) => v.dirty });
  const { leaveType, halfDay, startDate, endDate, hours, reason } = draft.values;
  const raw = draft.set;
  const touched = (set) => (v) => { raw.dirty(true); set(v); };
  const setLeaveType = touched(raw.leaveType);
  const setHalfDay = touched(raw.halfDay);
  const setStartDate = touched(raw.startDate);
  const setEndDate = touched(raw.endDate);
  const setHours = touched(raw.hours);
  const setReason = touched(raw.reason);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [lRes, cRes] = await Promise.all([
        fetch("/api/my-leave-requests", { headers: authHeaders() }),
        fetch("/api/my-leave-credits", { headers: authHeaders() }),
      ]);
      const data = await lRes.json().catch(() => ({}));
      if (!lRes.ok) throw new Error(data.message || `Could not load (${lRes.status})`);
      setLeaves(Array.isArray(data) ? data : []);
      setCredits(cRes.ok ? await cRes.json() : null);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["leave"]);
  useEffect(() => { load(); }, [load, live]);

  // Allowed dates for each type
  const today = todayStr();
  const slWindow = credits?.sl_filing_window_days ?? 1;
  const vlNotice = credits?.vl_notice_days ?? 14;
  const hoursPerDay = credits?.hours_per_day ?? 8;
  const limits = {
    sick: { min: addDays(today, -slWindow), max: addDays(today, -1) },
    vacation: { min: addDays(today, vlNotice), max: undefined },
    emergency: { min: addDays(today, -slWindow), max: undefined },
  }[leaveType];

  // Start on a valid date whenever the type changes. A date already there for
  // the same type (a restored draft, or the credits just loaded) is kept while
  // it still fits.
  const lastType = useRef(null);
  useEffect(() => {
    const first = leaveType === "sick" ? addDays(todayStr(), -1) : leaveType === "vacation" ? addDays(todayStr(), vlNotice) : todayStr();
    const sameType = lastType.current === null || lastType.current === leaveType;
    lastType.current = leaveType;
    if (sameType && startDate && (leaveType !== "vacation" || startDate >= first)) return;
    raw.startDate(first);
    raw.endDate(first);
    raw.halfDay(false);
    setFormError("");
  }, [leaveType, vlNotice, startDate, raw]);

  const length = leaveType === "emergency"
    ? (Number(hours) || 0) / hoursPerDay
    : halfDay ? 0.5 : startDate && endDate ? Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1 : 0;
  const available = credits?.available ?? 0;
  const paidHint = length <= 0 ? "" : available >= length
    ? "Paid from your leave credits once HR approves it."
    : leaveType === "sick" ? "Not enough leave credits: sick leave cannot be filed." : `Only ${num(available)} day(s) of credits: the rest will be unpaid.`;

  const submit = async () => {
    setFormError("");
    if (!reason.trim()) return setFormError("Please write the reason for your leave.");
    if (leaveType === "emergency" && !(Number(hours) > 0)) return setFormError("Enter how many hours of emergency leave.");
    if (leaveType === "sick" && !file) return setFormError("Attach your medical certificate.");
    if (leaveType === "sick" && available < length) return setFormError("Not enough leave credits for sick leave.");

    const fd = new FormData();
    fd.append("leave_type", leaveType);
    fd.append("start_date", startDate);
    if (leaveType === "emergency") {
      fd.append("hours", hours);
    } else {
      fd.append("is_half_day", halfDay ? "1" : "0");
      fd.append("end_date", halfDay ? startDate : endDate);
    }
    fd.append("reason", reason.trim());
    if (file) fd.append("attachment", file);

    setSubmitting(true);
    try {
      // No Content-Type header: the browser sets it for FormData.
      const res = await fetch("/api/my-leave-requests", { method: "POST", headers: authHeaders(), body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.errors ? Object.values(data.errors)[0][0] : data.message || `Could not submit (${res.status})`);
      toast.success(data.message || "Leave request was sent.");
      draft.clear();
      setFile(null);
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id) => {
    if (!(await confirmAction({ title: "Cancel this leave request?", message: "HR will no longer see it. You can file a new one.", confirmLabel: "Cancel request", danger: true }))) return;
    try {
      const res = await fetch(`/api/my-leave-requests/${id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not cancel.");
      toast.success("Leave request was cancelled.");
      await load();
    } catch (e) {
      setFormError(e.message);
    }
  };

  const inputCls = "w-full px-3 py-2.5 text-[13px] bg-slate-50 border border-black/[0.09] rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="w-full max-w-xl mx-auto px-4 py-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-slate-800">Leave Request</h1>
            <p className="text-[12px] text-slate-500">{user?.name || "Employee"}</p>
          </div>
          <button onClick={() => navigate(-1)} className="px-3 py-1.5 text-[12px] font-semibold text-slate-600 bg-white border border-black/[0.09] rounded-lg hover:bg-slate-50">Back</button>
        </div>
        <ScopeStatusRow className="-mt-1" />

        {/* Leave credits this year */}
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Available", credits?.available, "days of leave credits"],
            ["Earned", credits?.earned, `in ${credits?.year ?? new Date().getFullYear()} (0.5 per pay period)`],
            ["Used", credits?.used, "paid leave days"],
          ].map(([label, value, note]) => (
            <div key={label} className="bg-white border border-black/[0.09] rounded-xl p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="text-[18px] font-bold font-mono text-slate-800 mt-1">{credits ? num(value) : "—"}</p>
              <p className="text-[11px] text-slate-500">{note}</p>
            </div>
          ))}
        </div>

        {credits?.probationary ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[13px] text-amber-800">
            You are still on probation, so leave cannot be filed yet. Absences during probation are unpaid. Leave credits start once you become regular.
          </div>
        ) : (
          <div className="bg-white border border-black/[0.09] rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-[14px] font-bold text-slate-800">New Leave Application</p>
            <DraftHint draft={draft} onDiscard={() => { setFile(null); setFormError(""); }} />

            <div>
              <label htmlFor="lv-type" className="block text-[12px] font-semibold text-slate-600 mb-1">Leave Type</label>
              <select id="lv-type" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={inputCls}>
                <option value="vacation">Vacation Leave (VL): at least {vlNotice} days ahead</option>
                <option value="emergency">Emergency Leave (EL): in hours</option>
                <option value="sick">Sick Leave (SL): after you return, with a medical certificate</option>
              </select>
            </div>

            {leaveType === "emergency" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="lv-date" className="block text-[12px] font-semibold text-slate-600 mb-1">Date</label>
                  <input id="lv-date" type="date" value={startDate} min={limits.min} onChange={(e) => { setStartDate(e.target.value); setEndDate(e.target.value); }} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="lv-hours" className="block text-[12px] font-semibold text-slate-600 mb-1">Hours (up to {hoursPerDay})</label>
                  <input id="lv-hours" type="number" min="0.5" max={hoursPerDay} step="0.5" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 4" className={inputCls} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: false, label: "Full Day" }, { v: true, label: "Half Day (0.5)" }].map((o) => (
                    <button key={o.label} type="button" aria-pressed={halfDay === o.v} onClick={() => { setHalfDay(o.v); if (o.v) setEndDate(startDate); }}
                      className={`py-2.5 text-[13px] font-semibold rounded-lg border ${halfDay === o.v ? "bg-cyan-500 text-white border-cyan-500" : "bg-white text-slate-600 border-black/[0.09]"}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="lv-start" className="block text-[12px] font-semibold text-slate-600 mb-1">Start Date</label>
                    <input id="lv-start" type="date" value={startDate} min={limits.min} max={limits.max}
                      onChange={(e) => { setStartDate(e.target.value); if (halfDay || endDate < e.target.value) setEndDate(e.target.value); }} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="lv-end" className="block text-[12px] font-semibold text-slate-600 mb-1">End Date</label>
                    <input id="lv-end" type="date" value={halfDay ? startDate : endDate} min={startDate} max={limits.max} disabled={halfDay}
                      onChange={(e) => setEndDate(e.target.value)} className={`${inputCls} disabled:opacity-60`} />
                  </div>
                </div>
              </>
            )}

            {paidHint && (
              <p className={`text-[12px] px-3 py-2 rounded-lg border ${available >= length ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
                {num(length)} day{length === 1 ? "" : "s"}{leaveType === "emergency" && hours ? ` (${hours} h)` : ""}. {paidHint}
              </p>
            )}

            <div>
              <label htmlFor="lv-reason" className="block text-[12px] font-semibold text-slate-600 mb-1">Reason</label>
              <textarea id="lv-reason" rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Write the reason for your leave." className={`${inputCls} leave-textarea`} />
            </div>

            <div>
              <label htmlFor="lv-file" className="block text-[12px] font-semibold text-slate-600 mb-1">
                {leaveType === "sick" ? "Medical certificate (required, PNG, JPG or PDF, max 5MB)" : "Supporting document (optional, PNG, JPG or PDF, max 5MB)"}
              </label>
              <FileField id="lv-file" file={file} onChange={setFile} accept=".png,.jpg,.jpeg,.pdf" maxBytes={5 * 1024 * 1024}
                onError={setFormError} label="Choose a file" hint="PNG, JPG or PDF, up to 5MB" />
            </div>

            {formError && <div role="alert" className="px-3 py-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg">{formError}</div>}

            <button onClick={submit} disabled={submitting} className="w-full py-3 text-[13px] font-semibold text-white bg-cyan-500 rounded-xl hover:bg-cyan-600 disabled:opacity-60">
              {submitting ? "Submitting..." : "Submit Leave Request"}
            </button>
          </div>
        )}

        {/* Past requests */}
        <div className="flex items-center justify-between mt-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Past Leave Requests</p>
          <p className="text-[11px] font-mono text-slate-400">{leaves.length} recorded</p>
        </div>

        {loading && <SkeletonList />}
        {loadError && <div className="px-3 py-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg">{loadError}</div>}
        {!loading && !loadError && leaves.length === 0 && <EmptyState icon="calendar">No leave requests yet.</EmptyState>}

        {leaves.map((l) => (
          <div key={l.id} className="bg-white border border-black/[0.09] rounded-xl p-4 flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-bold text-slate-800">{TYPE_LABEL[l.leave_type] || l.leave_type}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                  {l.hours ? `${num(l.hours)} h` : l.is_half_day ? "Half Day" : `${num(l.total_days)} day${Number(l.total_days) === 1 ? "" : "s"}`}
                </span>
                {l.status === "approved" && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-md ${l.is_paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {l.is_paid ? "Paid" : Number(l.paid_days) > 0 ? `${num(l.paid_days)} paid, ${num(l.unpaid_days)} unpaid` : "Unpaid"}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${STATUS_STYLE[l.status] || ""}`}>{l.status}</span>
            </div>
            <p className="text-[12px] text-slate-500">{l.start_date === l.end_date ? fmtDate(l.start_date) : `${fmtDate(l.start_date)} to ${fmtDate(l.end_date)}`}</p>
            <div className="flex flex-col gap-2.5 mt-1">
              <MessageBubble mine from="You" role="Reason" at={l.created_at}>{l.reason}</MessageBubble>
              {l.status === "rejected" && l.reject_reason && (
                <MessageBubble from={(l.approved_by && typeof l.approved_by === "object" && l.approved_by.name) || "HR"} role="Reason for rejection" at={l.approved_at}>{l.reject_reason}</MessageBubble>
              )}
              {l.status !== "pending" && l.admin_notes && (
                <MessageBubble from={(l.approved_by && typeof l.approved_by === "object" && l.approved_by.name) || "HR"} role="HR remarks" at={l.approved_at}>{l.admin_notes}</MessageBubble>
              )}
            </div>
            <div className="flex items-center justify-between mt-1">
              {l.attachment_path ? (
                <button type="button" onClick={() => openProtectedFile(`/api/my-leave-requests/${l.id}/attachment`, "attachment")} className="text-[12px] font-semibold text-cyan-600 cursor-pointer">
                  View attachment
                </button>
              ) : <span />}
              {l.status === "pending" && (
                <button data-no-confirm onClick={() => cancel(l.id)} className="text-[12px] font-semibold text-red-600 hover:underline">Cancel request</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
