import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import HrLayout from "../../components/HrLayout";
import PhoneInput from "../../components/PhoneInput";
import { MOBILE_REGEX, MOBILE_MESSAGE, localDigits, toStoredPhone } from "../../lib/phone";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";

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

// Positions at Bella Erin (free text is still allowed)
const POSITIONS = ["Checker", "Salesman", "Maintenance", "Driver", "Guard", "Bagger", "Admin Staff"];

const STATUS_LABEL = { pending: "Pending", interviewed: "Interviewed", hired: "Hired", rejected: "Rejected" };
const STATUS_CLASS = {
  pending: "bg-amber-100 text-amber-600",
  interviewed: "bg-cyan-100 text-cyan-600",
  hired: "bg-emerald-100 text-emerald-600",
  rejected: "bg-red-100 text-red-600",
};

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "interviewed", label: "Interviewed" },
  { key: "hired", label: "Hired" },
  { key: "rejected", label: "Rejected" },
];

const parseLocal = (s) => {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T").slice(0, 19));
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtInterview = (s) => {
  const d = parseLocal(s);
  if (!d) return "Not scheduled";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const fmtDateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
// Value for <input type="datetime-local">: "2026-10-05T09:00"
const toInputValue = (s) => (s ? String(s).replace(" ", "T").slice(0, 16) : "");
const nowInputValue = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Philippine mobile number: 11 digits starting with 09

// "Mark Interviewed" is allowed only after the scheduled interview time has passed
const interviewDue = (a) => {
  const d = parseLocal(a.interview_date);
  return !!d && d <= new Date();
};
const interviewBlockReason = (a) => {
  if (!parseLocal(a.interview_date)) return "Schedule an interview first (use Edit).";
  return `Available after the interview on ${fmtInterview(a.interview_date)}.`;
};

// Small hint next to the interview time for pending applicants
const scheduleHint = (a) => {
  if (a.status !== "pending") return null;
  const d = parseLocal(a.interview_date);
  if (!d) return null;
  const now = new Date();
  if (d < now) return { text: "Past, update status", cls: "text-red-600" };
  if (isSameDay(d, now)) return { text: "Today", cls: "text-cyan-600" };
  return null;
};

const EMPTY_FORM = { name: "", email: "", phone: "", position_applied: "", interview_date: "", notes: "" };

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

export default function InterviewsPage() {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");

  // Add / edit
  const [editing, setEditing] = useState(null); // null = closed, {} = new, applicant = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Status change, view, delete
  const [statusAction, setStatusAction] = useState(null); // { applicant, status }
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [viewing, setViewing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setApplicants(toList(await api("/api/applicants")));
    } catch (e) {
      setError(e.message || "Could not load applicants.");
    } finally {
      setLoading(false);
    }
  }, []);

  // reload when a live notice for this page arrives (lib/live.js)
  const live = useLiveTick(["applicants"]);
  useEffect(() => { fetchAll(); }, [fetchAll, live]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const counts = useMemo(() => {
    const c = { all: applicants.length, pending: 0, interviewed: 0, hired: 0, rejected: 0 };
    applicants.forEach((a) => { if (c[a.status] !== undefined) c[a.status] += 1; });
    return c;
  }, [applicants]);

  const upcomingCount = useMemo(() => {
    const now = new Date();
    return applicants.filter((a) => a.status === "pending" && parseLocal(a.interview_date) && parseLocal(a.interview_date) >= now).length;
  }, [applicants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applicants.filter((a) => {
      if (tab !== "all" && a.status !== tab) return false;
      if (!q) return true;
      return (
        String(a.name || "").toLowerCase().includes(q) ||
        String(a.position_applied || "").toLowerCase().includes(q) ||
        String(a.email || "").toLowerCase().includes(q) ||
        String(a.phone || "").toLowerCase().includes(q)
      );
    });
  }, [applicants, tab, search]);

  // ---- Add / edit ----
  const openNew = () => { setForm(EMPTY_FORM); setFormError(""); setEditing({}); };
  const openEdit = (a) => {
    setForm({
      name: a.name || "",
      email: a.email || "",
      phone: localDigits(a.phone),
      position_applied: a.position_applied || "",
      interview_date: toInputValue(a.interview_date),
      notes: a.notes || "",
    });
    setFormError("");
    setEditing(a);
  };
  const isNew = editing && !editing.id;
  // Schedule can be set or changed only while the applicant is still pending
  const canEditSchedule = isNew || editing?.status === "pending";
  const scheduleChanged = !isNew && editing && form.interview_date !== toInputValue(editing.interview_date);

  const submitForm = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) return setFormError("Enter the applicant's name.");
    if (!form.position_applied.trim()) return setFormError("Choose the position applied for.");
    if (form.phone && !MOBILE_REGEX.test(form.phone)) return setFormError(MOBILE_MESSAGE);
    if ((isNew || scheduleChanged) && form.interview_date && form.interview_date <= nowInputValue()) {
      return setFormError("The interview date and time must be in the future.");
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: toStoredPhone(form.phone) || null,
      position_applied: form.position_applied.trim(),
      notes: form.notes.trim() || null,
    };
    // Send the schedule only when it is editable, so a non-pending record is never rescheduled
    if (canEditSchedule) payload.interview_date = form.interview_date || null;

    setSaving(true);
    try {
      if (isNew) {
        await api("/api/applicants", { method: "POST", body: JSON.stringify(payload) });
        setNotice(form.interview_date ? "Applicant added and interview scheduled." : "Applicant added.");
        toast.success("Applicant was added.");
      } else {
        await api(`/api/applicants/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setNotice("Applicant updated.");
      }
      setEditing(null);
      await fetchAll();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---- Quick status change ----
  const submitStatus = async () => {
    if (!statusAction) return;
    setStatusSaving(true);
    setStatusError("");
    try {
      await api(`/api/applicants/${statusAction.applicant.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusAction.status }),
      });
      if (statusAction.status === "hired") {
        // Hired: go straight to Add Employee with the applicant's details,
        // so HR finishes the employee record right away.
        toast.success(`${statusAction.applicant.name} was hired. Fill in the employee details.`);
        addAsEmployee(statusAction.applicant);
        return;
      }
      setNotice(`${statusAction.applicant.name} marked as ${STATUS_LABEL[statusAction.status]}.`);
      setStatusAction(null);
      await fetchAll();
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setStatusSaving(false);
    }
  };

  // ---- Delete ----
  const submitDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/api/applicants/${deleteTarget.id}`, { method: "DELETE" });
      setNotice("Applicant deleted.");
      toast.success("Applicant was deleted.");
      setDeleteTarget(null);
      await fetchAll();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const navigate = useNavigate();
  // Opens Employees > Add Employee filled in from the applicant
  const addAsEmployee = (applicant) => navigate("/hr/employees", { state: { fromApplicant: applicant } });
  // Hired and rejected applicants are final: their interview record is view only
  const isFinal = (a) => a.status === "hired" || a.status === "rejected";

  const openStatus = (applicant, status) => { setStatusAction({ applicant, status }); setStatusError(""); };

  const actionBtn = "px-2.5 py-1 border rounded-md text-[11px] cursor-pointer whitespace-nowrap";

  return (
    <HrLayout
      pageTitle="Interviews"
      breadcrumb="HRIS / Interviews"
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
            <div className="text-[13px] font-semibold text-slate-800">Applicants and Interviews</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {loading ? "Loading…" : `${upcomingCount} upcoming interview${upcomingCount === 1 ? "" : "s"}. Times are Philippine time.`}
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 px-2.5 py-1.5 border border-black/[0.09] rounded-md text-slate-400 w-full sm:w-60">
            <SearchIcon />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, position, contact"
              className="flex-1 min-w-0 text-xs text-slate-700 bg-transparent focus:outline-none"
            />
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-md cursor-pointer transition-colors"
          >
            <PlusIcon /> Add Applicant
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
          ) : applicants.length === 0 ? (
            <EmptyState icon="users">No applicants yet. Use Add Applicant to schedule an interview.</EmptyState>
          ) : filtered.length === 0 ? (
            <div className="px-[18px] py-8 text-center text-[12px] text-slate-400">No applicants match this filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-black/[0.09]">
                    <th className="px-[18px] py-2.5 font-medium">Applicant</th>
                    <th className="px-[18px] py-2.5 font-medium">Position</th>
                    <th className="px-[18px] py-2.5 font-medium">Interview</th>
                    <th className="px-[18px] py-2.5 font-medium">Status</th>
                    <th className="px-[18px] py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const hint = scheduleHint(a);
                    return (
                      <tr key={a.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                        <td className="px-[18px] py-2.5">
                          <div className="text-slate-800 font-medium whitespace-nowrap">{a.name}</div>
                          <div className="text-[10px] text-slate-400">{[a.phone, a.email].filter(Boolean).join(" · ") || "No contact details"}</div>
                        </td>
                        <td className="px-[18px] py-2.5 text-slate-600 whitespace-nowrap">{a.position_applied}</td>
                        <td className="px-[18px] py-2.5 whitespace-nowrap">
                          <div className={a.interview_date ? "text-slate-600" : "text-slate-400"}>{fmtInterview(a.interview_date)}</div>
                          {hint && <div className={`text-[10px] font-medium ${hint.cls}`}>{hint.text}</div>}
                        </td>
                        <td className="px-[18px] py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLASS[a.status] || "bg-slate-100 text-slate-500"}`}>
                            {STATUS_LABEL[a.status] || a.status}
                          </span>
                        </td>
                        <td className="px-[18px] py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setViewing(a)} className={`${actionBtn} border-black/[0.09] text-slate-600 hover:border-cyan-400 hover:text-cyan-500`}>View</button>
                            {!isFinal(a) && (
                              <button onClick={() => openEdit(a)} className={`${actionBtn} border-black/[0.09] text-slate-600 hover:border-cyan-400 hover:text-cyan-500`}>Edit</button>
                            )}
                            {a.status === "hired" && (
                              <button onClick={() => addAsEmployee(a)} className={`${actionBtn} border-emerald-200 text-emerald-600 hover:bg-emerald-50`} title="Open Add Employee with this applicant's details">Add as Employee</button>
                            )}
                            {a.status === "pending" && (interviewDue(a) ? (
                              <button onClick={() => openStatus(a, "interviewed")} className={`${actionBtn} border-cyan-200 text-cyan-600 hover:bg-cyan-50`}>Mark Interviewed</button>
                            ) : (
                              <button disabled title={interviewBlockReason(a)} className={`${actionBtn} border-black/[0.09] text-slate-400 bg-slate-50 cursor-not-allowed`}>Mark Interviewed</button>
                            ))}
                            {a.status === "interviewed" && (
                              <button onClick={() => openStatus(a, "hired")} className={`${actionBtn} border-emerald-200 text-emerald-600 hover:bg-emerald-50`}>Hire</button>
                            )}
                            {(a.status === "pending" || a.status === "interviewed") && (
                              <button onClick={() => openStatus(a, "rejected")} className={`${actionBtn} border-red-200 text-red-600 hover:bg-red-50`}>Reject</button>
                            )}
                            {!isFinal(a) && (
                              <button onClick={() => { setDeleteTarget(a); setDeleteError(""); }} className={`${actionBtn} border-black/[0.09] text-slate-500 hover:border-red-300 hover:text-red-500`}>Delete</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {editing && (
        <Modal title={isNew ? "Add Applicant" : "Edit Applicant"} onClose={() => !saving && setEditing(null)}>
          <form onSubmit={submitForm} className="p-5 flex flex-col gap-3.5">
            <Field label="Full Name">
              <input type="text" maxLength={255} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Juan Dela Cruz" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone (optional)">
                <PhoneInput
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  className={inputClass}
                  invalid={!!form.phone && !MOBILE_REGEX.test(form.phone)}
                />
                {form.phone && !MOBILE_REGEX.test(form.phone) && (
                  <span className="text-[10px] text-red-600">{MOBILE_MESSAGE}</span>
                )}
              </Field>
              <Field label="Email (optional)">
                <input type="email" maxLength={255} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="name@example.com" />
              </Field>
            </div>

            <Field label="Position Applied">
              {/* Pick only: no typing, so every applicant uses the same position names */}
              <select
                value={form.position_applied}
                onChange={(e) => setForm({ ...form, position_applied: e.target.value })}
                className={inputClass}
                aria-label="Position applied"
              >
                <option value="">Choose a position</option>
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                {form.position_applied && !POSITIONS.includes(form.position_applied) && (
                  <option value={form.position_applied}>{form.position_applied} (old)</option>
                )}
              </select>
            </Field>

            <Field label="Interview Date and Time (optional, Philippine time)">
              <input
                type="datetime-local"
                value={form.interview_date}
                min={canEditSchedule ? nowInputValue() : undefined}
                disabled={!canEditSchedule}
                onChange={(e) => setForm({ ...form, interview_date: e.target.value })}
                className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
              />
              {!canEditSchedule && (
                <span className="text-[10px] text-slate-400">The schedule is locked because this applicant is already {STATUS_LABEL[editing.status] || editing.status}.</span>
              )}
            </Field>

            {!isNew && (
              <Field label="Status">
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLASS[editing.status] || "bg-slate-100 text-slate-500"}`}>
                    {STATUS_LABEL[editing.status] || editing.status}
                  </span>
                  <span className="text-[10px] text-slate-400">Change the status using the action buttons in the table.</span>
                </div>
              </Field>
            )}

            <Field label="HR Notes (optional)">
              <textarea
                rows={3}
                maxLength={1000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={`${inputClass} resize-none`}
                placeholder="Referral, requirements submitted, interview remarks"
              />
            </Field>

            {formError && <div className="text-[12px] text-red-600">{formError}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditing(null)} disabled={saving} className="px-3.5 py-2 border border-black/[0.09] rounded-md text-xs text-slate-600 cursor-pointer hover:bg-slate-50 disabled:opacity-50">Close</button>
              <button type="submit" disabled={saving} className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-md cursor-pointer disabled:opacity-50">
                {saving ? "Saving…" : isNew ? "Add Applicant" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* STATUS CHANGE MODAL */}
      {statusAction && (
        <Modal title={`Mark as ${STATUS_LABEL[statusAction.status]}`} onClose={() => !statusSaving && setStatusAction(null)} width="max-w-md">
          <div className="p-5 flex flex-col gap-3.5">
            <div className="text-xs text-slate-600">
              Mark <span className="font-semibold text-slate-800">{statusAction.applicant.name}</span> ({statusAction.applicant.position_applied}) as <span className="font-semibold">{STATUS_LABEL[statusAction.status]}</span>?
            </div>
            {statusAction.status === "rejected" && (
              <div className="bg-slate-50 border border-black/[0.09] text-slate-600 text-[11px] rounded-lg px-3 py-2">
                The interview record becomes view only after this.
              </div>
            )}
            {statusAction.status === "hired" && (
              <div className="bg-cyan-50 border border-cyan-200 text-cyan-700 text-[11px] rounded-lg px-3 py-2">
                Next, the Add Employee form opens with this applicant's details so you can finish the employee record. The interview record becomes view only.
              </div>
            )}
            {statusError && <div className="text-[12px] text-red-600">{statusError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setStatusAction(null)} disabled={statusSaving} className="px-3.5 py-2 border border-black/[0.09] rounded-md text-xs text-slate-600 cursor-pointer hover:bg-slate-50 disabled:opacity-50">Close</button>
              <button
                onClick={submitStatus}
                disabled={statusSaving}
                className={`px-3.5 py-2 text-white text-xs font-semibold rounded-md cursor-pointer disabled:opacity-50 ${statusAction.status === "rejected" ? "bg-red-500 hover:bg-red-600" : statusAction.status === "hired" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-cyan-500 hover:bg-cyan-600"}`}
              >
                {statusSaving ? "Saving…" : `Mark as ${STATUS_LABEL[statusAction.status]}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRMATION */}
      {deleteTarget && (
        <Modal title="Delete Applicant" onClose={() => !deleting && setDeleteTarget(null)} width="max-w-md">
          <div className="p-5 flex flex-col gap-3.5">
            <div className="text-xs text-slate-600">
              Delete <span className="font-semibold text-slate-800">{deleteTarget.name}</span> and the interview record? This cannot be undone.
            </div>
            {deleteError && <div className="text-[12px] text-red-600">{deleteError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-3.5 py-2 border border-black/[0.09] rounded-md text-xs text-slate-600 cursor-pointer hover:bg-slate-50 disabled:opacity-50">Keep</button>
              <button onClick={submitDelete} disabled={deleting} className="px-3.5 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-md cursor-pointer disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* DETAIL MODAL */}
      {viewing && (
        <Modal title="Applicant Details" onClose={() => setViewing(null)}>
          <div className="p-5 flex flex-col gap-2.5 text-xs">
            {[
              ["Name", viewing.name],
              ["Position Applied", viewing.position_applied],
              ["Phone", viewing.phone || "—"],
              ["Email", viewing.email || "—"],
              ["Interview", fmtInterview(viewing.interview_date)],
              ["Status", STATUS_LABEL[viewing.status] || viewing.status],
              ["HR Notes", viewing.notes || "—"],
              ["Added On", fmtDateTime(viewing.created_at)],
              ["Last Updated", fmtDateTime(viewing.updated_at)],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[120px_1fr] gap-3 py-1 border-b border-black/[0.06] last:border-b-0">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-700 break-words whitespace-pre-line">{value}</span>
              </div>
            ))}
            {isFinal(viewing) && (
              <div className="text-[11px] text-slate-400 pt-1">This applicant is {STATUS_LABEL[viewing.status]}. The interview record is view only.</div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              {viewing.status === "hired" && (
                <button onClick={() => addAsEmployee(viewing)} className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-md cursor-pointer">Add as Employee</button>
              )}
              <button onClick={() => setViewing(null)} className="px-3.5 py-2 border border-black/[0.09] rounded-md text-xs text-slate-600 cursor-pointer hover:bg-slate-50">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </HrLayout>
  );
}