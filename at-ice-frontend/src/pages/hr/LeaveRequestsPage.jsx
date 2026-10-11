import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import HrLayout from "../../components/HrLayout";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";
import MessageBubble from "../../components/MessageBubble";

const RefreshIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
const SearchIcon  = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const PlusIcon    = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const XIcon       = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

const token = () => localStorage.getItem("token") || "";

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const firstError = data?.errors ? Object.values(data.errors).flat()[0] : null;
    throw new Error(firstError || data?.message || `Request failed (${res.status}).`);
  }
  return data;
}

const toList = (d) => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);

const LEAVE_TYPES = [
  { value: "sick", label: "Sick Leave" },
  { value: "vacation", label: "Vacation Leave" },
  { value: "emergency", label: "Emergency Leave" },
  { value: "maternity", label: "Maternity Leave" },
  { value: "paternity", label: "Paternity Leave" },
  { value: "other", label: "Other" },
];
const typeLabel = (v) => LEAVE_TYPES.find((t) => t.value === v)?.label || v || "—";

const STATUS_LABEL = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
const STATUS_CLASS = {
  pending: "bg-amber-100 text-amber-600",
  approved: "bg-emerald-100 text-emerald-600",
  rejected: "bg-red-100 text-red-600",
};

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

// Employee name with fallbacks (field names differ between tables)
const empName = (e) => {
  if (!e) return "—";
  const parts = [e.first_name, e.last_name].filter(Boolean).join(" ");
  return e.name || e.full_name || parts || e.user?.name || `Employee #${e.id}`;
};
const empCode = (e) => e?.employee_code || e?.employee_no || (typeof e?.employee_id === "string" ? e.employee_id : "");

// "2026-10-01" -> "Oct 1, 2026" (parsed as local date, no timezone shift)
const fmtDate = (d) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const dt = new Date(`${s}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
const fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const daysBetween = (start, end) => {
  if (!start || !end) return 0;
  const diff = (new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000 + 1;
  return diff > 0 ? Math.round(diff) : 0;
};
// approvedBy relation is serialized under "approved_by"
const decidedBy = (l) => (l.approved_by && typeof l.approved_by === "object" ? l.approved_by.name : null) || "—";

// Attachments filed by employees are stored on the public disk
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const attachmentUrl = (p) => (p ? `${BACKEND_URL}/storage/${String(p).replace(/^\/+/, "")}` : null);

// total_days is a decimal now ("1.0"), show it as 1 or 0.5
const fmtDays = (l) => (l.is_half_day ? "0.5 (half day)" : String(Number(l.total_days)));

// Local date (Asia/Manila), not UTC, so "today" is right before 8 AM too.
const todayStr = () => new Date().toLocaleDateString("en-CA");
const emptyForm = () => ({ employee_id: "", leave_type: "sick", start_date: todayStr(), end_date: todayStr(), reason: "" });

function Modal({ title, onClose, children, width = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl border border-black/[0.09] w-full ${width} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-black/[0.09] flex items-center justify-between">
          <div className="text-[14px] font-semibold text-slate-800">{title}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"><XIcon /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "px-2.5 py-2 border border-black/[0.09] rounded-md text-xs text-slate-700 bg-white focus:outline-none focus:border-cyan-400";

export default function LeaveRequestsPage() {
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  // New request
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Approve / reject
  const [decision, setDecision] = useState(null); // { leave, status }
  const [notes, setNotes] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState("");

  // View and cancel
  const [viewing, setViewing] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leaveData, employeeData] = await Promise.all([
        api("/api/leave-requests"),
        api("/api/employees"),
      ]);
      setLeaves(toList(leaveData));
      setEmployees(toList(employeeData));
    } catch (e) {
      setError(e.message || "Could not load leave requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Opened from the HR Dashboard (?view=<id>): show that request, on the
  // Pending tab when it is still pending.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("view");
    if (!id || loading) return;
    const found = leaves.find((l) => String(l.id) === id);
    if (found) {
      setTab(found.status === "pending" ? "pending" : "all");
      setViewing(found);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, loading, leaves]);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["leave"]);
  useEffect(() => { fetchAll(); }, [fetchAll, live]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const counts = useMemo(() => {
    const c = { all: leaves.length, pending: 0, approved: 0, rejected: 0 };
    leaves.forEach((l) => { if (c[l.status] !== undefined) c[l.status] += 1; });
    return c;
  }, [leaves]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leaves.filter((l) => {
      if (tab !== "all" && l.status !== tab) return false;
      if (!q) return true;
      return (
        empName(l.employee).toLowerCase().includes(q) ||
        typeLabel(l.leave_type).toLowerCase().includes(q) ||
        String(empCode(l.employee)).toLowerCase().includes(q)
      );
    });
  }, [leaves, tab, search]);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => empName(a).localeCompare(empName(b))),
    [employees]
  );

  // ---- New request ----
  const openNew = () => { setForm(emptyForm()); setFormError(""); setShowNew(true); };

  const submitNew = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.employee_id) return setFormError("Select an employee.");
    if (!form.start_date || !form.end_date) return setFormError("Enter the start and end dates.");
    if (form.end_date < form.start_date) return setFormError("The end date cannot be before the start date.");
    if (!form.reason.trim()) return setFormError("Enter the reason for the leave.");

    setSaving(true);
    try {
      await api("/api/leave-requests", {
        method: "POST",
        body: JSON.stringify({ ...form, employee_id: Number(form.employee_id), reason: form.reason.trim() }),
      });
      setShowNew(false);
      setNotice("Leave request recorded as Pending.");
      toast.success("Leave request was added.");
      await fetchAll();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---- Approve / reject ----
  const openDecision = (leave, status) => { setDecision({ leave, status }); setNotes(""); setDecisionError(""); };

  const submitDecision = async () => {
    if (!decision) return;
    setDeciding(true);
    setDecisionError("");
    try {
      await api(`/api/leave-requests/${decision.leave.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: decision.status, admin_notes: notes.trim() || null }),
      });
      setNotice(`Leave request ${decision.status === "approved" ? "approved" : "rejected"}.`);
      setDecision(null);
      await fetchAll();
    } catch (err) {
      setDecisionError(err.message);
    } finally {
      setDeciding(false);
    }
  };

  // ---- Cancel (delete pending) ----
  const submitCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError("");
    try {
      await api(`/api/leave-requests/${cancelTarget.id}`, { method: "DELETE" });
      setNotice("Leave request cancelled.");
      toast.success("Leave request was cancelled.");
      setCancelTarget(null);
      await fetchAll();
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const formDays = daysBetween(form.start_date, form.end_date);

  return (
    <HrLayout
      pageTitle="Leave Requests"
      breadcrumb="HRIS / Leave Requests"
      headerActions={
        <button
          onClick={fetchAll}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-black/[0.09] rounded-md text-xs text-slate-500 cursor-pointer hover:border-cyan-400 hover:text-cyan-500 transition-colors"
        >
          <RefreshIcon /> Refresh
        </button>
      }
    >
      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg px-4 py-2.5">{notice}</div>
      )}

      <div className="bg-white border border-black/[0.09] rounded-xl overflow-hidden">
        {/* HEADER */}
        <div className="px-[18px] py-3.5 border-b border-black/[0.09] flex flex-wrap items-center gap-3">
          <div>
            <div className="text-[13px] font-semibold text-slate-800">Leave Requests</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Filed by employees from their own page, or encoded by HR, then approved or rejected here.</div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 px-2.5 py-1.5 border border-black/[0.09] rounded-md text-slate-400 w-full sm:w-60">
            <SearchIcon />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or type"
              className="flex-1 min-w-0 text-xs text-slate-700 bg-transparent focus:outline-none"
            />
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-md cursor-pointer transition-colors"
          >
            <PlusIcon /> New Leave Request
          </button>
        </div>

        {/* TABS */}
        <div className="px-[18px] pt-3 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
              className={`px-3 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-colors ${tab === t.key ? "bg-cyan-500 border-cyan-500 text-white" : "bg-white border-black/[0.09] text-slate-500 hover:border-cyan-400 hover:text-cyan-500"}`}
            >
              {t.label} ({loading ? "…" : counts[t.key]})
            </button>
          ))}
        </div>

        {/* TABLE */}
        <div className="mt-3 border-t border-black/[0.09]">
          {loading ? (
            <SkeletonList />
          ) : error ? (
            <div className="px-[18px] py-8 text-center text-[12px] text-red-600">{error}</div>
          ) : leaves.length === 0 ? (
            <EmptyState icon="calendar">No leave requests yet. Use New Leave Request to encode one.</EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState icon="search">No leave requests match this filter.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                    <th className="px-[18px] py-2.5 font-medium">Employee</th>
                    <th className="px-[18px] py-2.5 font-medium">Leave Type</th>
                    <th className="px-[18px] py-2.5 font-medium">Dates</th>
                    <th className="px-[18px] py-2.5 font-medium">Days</th>
                    <th className="px-[18px] py-2.5 font-medium">Status</th>
                    <th className="px-[18px] py-2.5 font-medium">Filed</th>
                    <th className="px-[18px] py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                      <td className="px-[18px] py-2.5">
                        <div className="text-slate-800 font-medium whitespace-nowrap">{empName(l.employee)}</div>
                        {empCode(l.employee) && <div className="text-[10px] text-slate-400">{empCode(l.employee)}</div>}
                      </td>
                      <td className="px-[18px] py-2.5 text-slate-600 whitespace-nowrap">{typeLabel(l.leave_type)}</td>
                      <td className="px-[18px] py-2.5 text-slate-600 whitespace-nowrap">
                        {fmtDate(l.start_date)}{l.end_date && l.end_date !== l.start_date ? ` – ${fmtDate(l.end_date)}` : ""}
                      </td>
                      <td className="px-[18px] py-2.5 text-slate-600 font-mono">{l.total_days == null ? "—" : l.is_half_day ? "0.5" : Number(l.total_days)}</td>
                      <td className="px-[18px] py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLASS[l.status] || "bg-slate-100 text-slate-500"}`}>
                          {STATUS_LABEL[l.status] || l.status}
                        </span>
                      </td>
                      <td className="px-[18px] py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                      <td className="px-[18px] py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => setViewing(l)} className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-600 cursor-pointer hover:border-cyan-400 hover:text-cyan-500">View</button>
                          {l.status === "pending" && (
                            <>
                              <button onClick={() => openDecision(l, "approved")} className="px-2.5 py-1 border border-emerald-200 rounded-md text-[11px] text-emerald-600 cursor-pointer hover:bg-emerald-50">Approve</button>
                              <button onClick={() => openDecision(l, "rejected")} className="px-2.5 py-1 border border-red-200 rounded-md text-[11px] text-red-600 cursor-pointer hover:bg-red-50">Reject</button>
                              <button onClick={() => { setCancelTarget(l); setCancelError(""); }} className="px-2.5 py-1 border border-black/[0.09] rounded-md text-[11px] text-slate-500 cursor-pointer hover:border-red-300 hover:text-red-500">Cancel</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* NEW LEAVE REQUEST MODAL */}
      {showNew && (
        <Modal title="New Leave Request" onClose={() => !saving && setShowNew(false)}>
          <form onSubmit={submitNew} className="p-5 flex flex-col gap-3.5">
            <Field label="Employee">
              <select
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                className={inputClass}
              >
                <option value="">Select an employee</option>
                {sortedEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {empName(emp)}{empCode(emp) ? ` (${empCode(emp)})` : ""}{emp.position ? `, ${emp.position}` : ""}
                  </option>
                ))}
              </select>
              {employees.length === 0 && <span className="text-[11px] text-amber-600">No employees found. Add employees in the Employees page first.</span>}
            </Field>

            <Field label="Leave Type">
              <select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })} className={inputClass}>
                {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Date">
                <input type="date" value={form.start_date} onChange={(e) => { const v = e.target.value; setForm({ ...form, start_date: v, end_date: form.end_date < v ? v : form.end_date }); }} className={inputClass} />
              </Field>
              <Field label="End Date">
                <input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputClass} />
              </Field>
            </div>
            <div className="text-[11px] text-slate-400 -mt-1">
              Total: <span className="font-semibold text-slate-600">{formDays}</span> day{formDays === 1 ? "" : "s"} (start and end dates included)
            </div>

            <Field label="Reason">
              <textarea
                rows={3}
                maxLength={500}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Reason given by the employee"
                className={`${inputClass} resize-none`}
              />
              <span className="text-[10px] text-slate-400 text-right">{form.reason.length}/500</span>
            </Field>

            {formError && <div className="text-[12px] text-red-600">{formError}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowNew(false)} disabled={saving} className="px-3.5 py-2 border border-black/[0.09] rounded-md text-xs text-slate-600 cursor-pointer hover:bg-slate-50 disabled:opacity-50">Close</button>
              <button type="submit" disabled={saving} className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-md cursor-pointer disabled:opacity-50">
                {saving ? "Saving…" : "Save as Pending"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* APPROVE / REJECT MODAL */}
      {decision && (
        <Modal
          title={decision.status === "approved" ? "Approve Leave Request" : "Reject Leave Request"}
          onClose={() => !deciding && setDecision(null)}
        >
          <div className="p-5 flex flex-col gap-3.5">
            <div className="bg-slate-50 border border-black/[0.06] rounded-lg p-3 text-xs flex flex-col gap-1">
              <div className="text-slate-800 font-semibold">{empName(decision.leave.employee)}</div>
              <div className="text-slate-600">
                {typeLabel(decision.leave.leave_type)}, {fmtDays(decision.leave)}
                {decision.leave.is_half_day ? "" : Number(decision.leave.total_days) === 1 ? " day" : " days"}
              </div>
              <div className="text-slate-500">
                {fmtDate(decision.leave.start_date)}{decision.leave.end_date !== decision.leave.start_date ? ` – ${fmtDate(decision.leave.end_date)}` : ""}
              </div>
              <MessageBubble className="mt-2" from={empName(decision.leave.employee)} role="Reason" at={decision.leave.created_at}>{decision.leave.reason}</MessageBubble>
              {decision.leave.attachment_path && (
                <a href={attachmentUrl(decision.leave.attachment_path)} target="_blank" rel="noreferrer" className="text-cyan-600 font-semibold mt-1">
                  View attachment
                </a>
              )}
            </div>

            <Field label={decision.status === "rejected" ? "HR Notes (reason for rejection, optional)" : "HR Notes (optional)"}>
              <textarea
                rows={3}
                maxLength={300}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </Field>

            {decisionError && <div className="text-[12px] text-red-600">{decisionError}</div>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setDecision(null)} disabled={deciding} className="px-3.5 py-2 border border-black/[0.09] rounded-md text-xs text-slate-600 cursor-pointer hover:bg-slate-50 disabled:opacity-50">Close</button>
              <button
                onClick={submitDecision}
                disabled={deciding}
                className={`px-3.5 py-2 text-white text-xs font-semibold rounded-md cursor-pointer disabled:opacity-50 ${decision.status === "approved" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"}`}
              >
                {deciding ? "Saving…" : decision.status === "approved" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* CANCEL CONFIRMATION */}
      {cancelTarget && (
        <Modal title="Cancel Leave Request" onClose={() => !cancelling && setCancelTarget(null)} width="max-w-md">
          <div className="p-5 flex flex-col gap-3.5">
            <div className="text-xs text-slate-600">
              Cancel the pending {typeLabel(cancelTarget.leave_type).toLowerCase()} of <span className="font-semibold text-slate-800">{empName(cancelTarget.employee)}</span> ({fmtDate(cancelTarget.start_date)})? This removes the request.
            </div>
            {cancelError && <div className="text-[12px] text-red-600">{cancelError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setCancelTarget(null)} disabled={cancelling} className="px-3.5 py-2 border border-black/[0.09] rounded-md text-xs text-slate-600 cursor-pointer hover:bg-slate-50 disabled:opacity-50">Keep</button>
              <button onClick={submitCancel} disabled={cancelling} className="px-3.5 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-md cursor-pointer disabled:opacity-50">
                {cancelling ? "Cancelling…" : "Cancel Request"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* DETAIL MODAL */}
      {viewing && (
        <Modal title="Leave Request Details" onClose={() => setViewing(null)}>
          <div className="p-5 flex flex-col gap-2.5 text-xs">
            {[
              ["Employee", `${empName(viewing.employee)}${empCode(viewing.employee) ? ` (${empCode(viewing.employee)})` : ""}`],
              ["Position", viewing.employee?.position || "—"],
              ["Leave Type", typeLabel(viewing.leave_type)],
              ["Start Date", fmtDate(viewing.start_date)],
              ["End Date", fmtDate(viewing.end_date)],
              ["Total Days", viewing.total_days == null ? "—" : fmtDays(viewing)],
              ["Attachment", viewing.attachment_path
                ? <a href={attachmentUrl(viewing.attachment_path)} target="_blank" rel="noreferrer" className="text-cyan-600 font-semibold">View attachment</a>
                : "—"],
              ["Status", STATUS_LABEL[viewing.status] || viewing.status],
              ["Filed On", fmtDateTime(viewing.created_at)],
              ["Decided By", viewing.status === "pending" ? "—" : decidedBy(viewing)],
              ["Decided On", viewing.status === "pending" ? "—" : fmtDateTime(viewing.approved_at)],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[110px_1fr] gap-3 py-1 border-b border-black/[0.06] last:border-b-0">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-700 break-words">{value}</span>
              </div>
            ))}
            <div className="flex flex-col gap-3 pt-2">
              {viewing.reason && (
                <MessageBubble from={empName(viewing.employee)} role="Reason" at={viewing.created_at}>{viewing.reason}</MessageBubble>
              )}
              {viewing.admin_notes && (
                <MessageBubble mine from={decidedBy(viewing) === "—" ? "HR" : decidedBy(viewing)} role="HR note" at={viewing.approved_at}>{viewing.admin_notes}</MessageBubble>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setViewing(null)} className="px-3.5 py-2 border border-black/[0.09] rounded-md text-xs text-slate-600 cursor-pointer hover:bg-slate-50">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </HrLayout>
  );
}