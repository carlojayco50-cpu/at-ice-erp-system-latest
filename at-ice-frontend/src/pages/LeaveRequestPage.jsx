// src/pages/LeaveRequestPage.jsx
// Leave Request page for every employee role (Checker, Salesman, Maintenance)
// and Driver. Route: /my-leave. Own requests only.
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SkeletonList } from "../components/Skeleton";
import { toast } from "../lib/toast";
import { useLiveTick } from "../lib/live";
import EmptyState from "../components/EmptyState";
import { ScopeStatusRow } from "../components/NightMode";
import MessageBubble from "../components/MessageBubble";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

// Yearly allowance per type. NOT confirmed with HR or the client yet,
// change these numbers once the real policy is known.
const ALLOWANCE = { sick: 5, emergency: 3, vacation: 3 };

const TYPE_LABEL = {
  sick: "Sick Leave",
  emergency: "Emergency Leave",
  vacation: "Vacation Leave",
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

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  Accept: "application/json",
});

const attachmentUrl = (path) =>
  path ? `${BACKEND_URL}/storage/${String(path).replace(/^\/+/, "")}` : null;

const fmtDate = (d) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

const days = (n) => {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

export default function LeaveRequestPage() {
  const navigate = useNavigate();
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();

  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [leaveType, setLeaveType] = useState("sick");
  const [halfDay, setHalfDay] = useState(false);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [reason, setReason] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/my-leave-requests", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Could not load (${res.status})`);
      setLeaves(Array.isArray(data) ? data : []);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["leave"]);
  useEffect(() => {
    load();
  }, [live]);

  // Approved days used this year, per type
  const used = useMemo(() => {
    const year = new Date().getFullYear();
    const out = { sick: 0, emergency: 0, vacation: 0 };
    leaves.forEach((l) => {
      if (l.status === "approved" && String(l.start_date).startsWith(String(year))) {
        if (out[l.leave_type] !== undefined) out[l.leave_type] += Number(l.total_days) || 0;
      }
    });
    return out;
  }, [leaves]);

  const onStartChange = (v) => {
    setStartDate(v);
    if (halfDay || endDate < v) setEndDate(v);
  };

  const onHalfDay = (v) => {
    setHalfDay(v);
    if (v) setEndDate(startDate);
  };

  const onFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFormError("");
    if (f && f.size > 5 * 1024 * 1024) {
      setFormError("File is too large. Maximum is 5MB.");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    setFormError("");
    setSuccess("");
    if (!reason.trim()) {
      setFormError("Please write the reason for your leave.");
      return;
    }
    if (startDate < todayStr()) {
      setFormError("The start date cannot be in the past.");
      return;
    }
    if (endDate < startDate) {
      setFormError("End date cannot be earlier than the start date.");
      return;
    }

    const fd = new FormData();
    fd.append("leave_type", leaveType);
    fd.append("is_half_day", halfDay ? "1" : "0");
    fd.append("start_date", startDate);
    fd.append("end_date", halfDay ? startDate : endDate);
    fd.append("reason", reason.trim());
    if (file) fd.append("attachment", file);

    setSubmitting(true);
    try {
      // No Content-Type header: the browser sets it for FormData.
      const res = await fetch("/api/my-leave-requests", {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Could not submit (${res.status})`);
      setSuccess("Leave request submitted. Waiting for HR approval.");
      toast.success("Leave request was submitted.");
      setReason("");
      setFile(null);
      setHalfDay(false);
      setStartDate(todayStr());
      setEndDate(todayStr());
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id) => {
    if (!window.confirm("Cancel this leave request?")) return;
    try {
      const res = await fetch(`/api/my-leave-requests/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not cancel.");
      toast.success("Leave request was cancelled.");
      await load();
    } catch (e) {
      setFormError(e.message);
    }
  };

  const inputCls =
    "w-full px-3 py-2.5 text-[13px] bg-slate-50 border border-black/[0.09] rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20";

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="w-full max-w-xl mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-slate-800">Leave Request</h1>
            <p className="text-[12px] text-slate-500">{user?.name || "Employee"}</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 text-[12px] font-semibold text-slate-600 bg-white border border-black/[0.09] rounded-lg hover:bg-slate-50"
          >
            Back
          </button>
        </div>
        <ScopeStatusRow className="-mt-1" />

        {/* Used days this year */}
        <div className="grid grid-cols-3 gap-2">
          {["sick", "emergency", "vacation"].map((t) => (
            <div key={t} className="bg-white border border-black/[0.09] rounded-xl p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {TYPE_LABEL[t].replace(" Leave", "")}
              </p>
              <p className="text-[18px] font-bold font-mono text-slate-800 mt-1">
                {days(Math.max(ALLOWANCE[t] - used[t], 0))}
              </p>
              <p className="text-[11px] text-slate-500">of {ALLOWANCE[t]} days left</p>
            </div>
          ))}
        </div>

        {/* New application */}
        <div className="bg-white border border-black/[0.09] rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-[14px] font-bold text-slate-800">New Leave Application</p>

          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Leave Type</label>
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={inputCls}>
              <option value="sick">Sick Leave</option>
              <option value="emergency">Emergency Leave</option>
              <option value="vacation">Vacation Leave</option>
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Duration</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, label: "Full Day (1.0)" },
                { v: true, label: "Half Day (0.5)" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => onHalfDay(o.v)}
                  className={`py-2.5 text-[13px] font-semibold rounded-lg border ${
                    halfDay === o.v
                      ? "bg-cyan-500 text-white border-cyan-500"
                      : "bg-white text-slate-600 border-black/[0.09]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[12px] font-semibold text-slate-600 mb-1">Start Date</label>
              <input type="date" value={startDate} min={todayStr()} onChange={(e) => onStartChange(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-600 mb-1">End Date</label>
              <input
                type="date"
                value={halfDay ? startDate : endDate}
                min={startDate}
                disabled={halfDay}
                onChange={(e) => setEndDate(e.target.value)}
                className={`${inputCls} disabled:opacity-60`}
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Reason</label>
            <textarea
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Write the reason for your leave."
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1">
              Supporting Document (optional, PNG, JPG or PDF, max 5MB)
            </label>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf"
              onChange={onFile}
              className="block w-full text-[12px] text-slate-600 file:mr-3 file:px-3 file:py-2 file:text-[12px] file:font-semibold file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700"
            />
            {file && <p className="text-[11px] text-slate-500 mt-1">Selected: {file.name}</p>}
          </div>

          {formError && (
            <div className="px-3 py-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {formError}
            </div>
          )}
          {success && (
            <div className="px-3 py-2 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
              {success}
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 text-[13px] font-bold uppercase tracking-wide text-white bg-cyan-500 rounded-xl hover:bg-cyan-600 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Leave Request"}
          </button>
        </div>

        {/* Past requests */}
        <div className="flex items-center justify-between mt-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Past Leave Requests</p>
          <p className="text-[11px] font-mono text-slate-400">{leaves.length} recorded</p>
        </div>

        {loading && <SkeletonList />}
        {loadError && (
          <div className="px-3 py-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {loadError}
          </div>
        )}
        {!loading && !loadError && leaves.length === 0 && (
          <EmptyState icon="calendar">No leave requests yet.</EmptyState>
        )}

        {leaves.map((l) => {
          const url = attachmentUrl(l.attachment_path);
          return (
            <div key={l.id} className="bg-white border border-black/[0.09] rounded-xl p-4 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-bold text-slate-800">
                    {TYPE_LABEL[l.leave_type] || l.leave_type}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    {l.is_half_day ? "Half Day" : `${days(l.total_days)} day${Number(l.total_days) === 1 ? "" : "s"}`}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                    STATUS_STYLE[l.status] || ""
                  }`}
                >
                  {l.status}
                </span>
              </div>
              <p className="text-[12px] text-slate-500">
                {l.start_date === l.end_date
                  ? fmtDate(l.start_date)
                  : `${fmtDate(l.start_date)} to ${fmtDate(l.end_date)}`}
              </p>
              <div className="flex flex-col gap-2.5 mt-1">
                <MessageBubble mine from="You" role="Reason" at={l.created_at}>{l.reason}</MessageBubble>
                {l.status !== "pending" && l.admin_notes && (
                  <MessageBubble from={(l.approved_by && typeof l.approved_by === "object" && l.approved_by.name) || "HR"} role="HR note" at={l.approved_at}>{l.admin_notes}</MessageBubble>
                )}
              </div>
              {l.status !== "pending" && l.approved_by_user?.name === undefined && l.approved_by && null}
              <div className="flex items-center justify-between mt-1">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-cyan-600">
                    View attachment
                  </a>
                ) : (
                  <span />
                )}
                {l.status === "pending" && (
                  <button
                    onClick={() => cancel(l.id)}
                    className="text-[12px] font-semibold text-red-600 hover:underline"
                  >
                    Cancel request
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}