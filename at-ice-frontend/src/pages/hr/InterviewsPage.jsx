import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import HrLayout from "../../components/HrLayout";
import PhoneInput from "../../components/PhoneInput";
import { MOBILE_REGEX, MOBILE_MESSAGE, localDigits, toStoredPhone } from "../../lib/phone";
import { SkeletonList } from "../../components/Skeleton";
import { toast } from "../../lib/toast";
import { previewProtectedFile } from "../../lib/preview";
import { useLiveTick } from "../../lib/live";
import EmptyState from "../../components/EmptyState";
import AddressFields from "../../components/AddressFields";
import ScanDropZone from "../../components/ScanDropZone";
import DraftHint from "../../components/DraftHint";
import { useDraft } from "../../lib/useDraft";
import { filledFrom } from "../../lib/scanDocument";
import { fullName } from "../../lib/names";
import { APPLICANT_POSITIONS, applyUrl, isLocalTesting } from "../../lib/positions";
import { PRINT_BASE_CSS, printDocument } from "../../lib/printDocument";
import QRCode from "qrcode";
import { formatDateTime, formatTime } from "../../lib/time";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../lib/usePagination";

const SearchIcon  = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const PlusIcon    = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const XIcon       = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

const token = () => localStorage.getItem("token") || "";

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    // A FormData body (resume upload) sets its own multipart Content-Type.
    headers: {
      Accept: "application/json",
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${token()}`,
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

// Positions at Bella Erin (an older free-text value is still shown)
const POSITIONS = APPLICANT_POSITIONS;

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
  return formatDateTime(d, { tz: false });
};
const fmtDateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : formatDateTime(d);
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

const ADDRESS_KEYS = ["block_lot", "street", "subdivision", "barangay", "barangay_code", "city", "province", "region", "postal_code"];
const EMPTY_ADDRESS = Object.fromEntries(ADDRESS_KEYS.map((k) => [k, ""]));
const EMPTY_FORM = { name: "", email: "", phone: "", position_applied: "", interview_date: "", interview_minutes: "30", notes: "", resumeFile: null, removeResume: false, ...EMPTY_ADDRESS };

// Interviews take 30 or 45 minutes and may not overlap (the server checks
// too: ApplicantController@assertFreeSlot). The pending interview that
// overlaps [start, start + minutes), or null.
const INTERVIEW_MINUTES = [30, 45];
const RESUME_FILE = /.(pdf|docx?)$/i;
function interviewClash(applicants, startValue, minutes, exceptId) {
  const start = parseLocal(startValue);
  if (!start) return null;
  const end = new Date(start.getTime() + minutes * 60000);
  return applicants.find((a) => {
    if (a.id === exceptId || a.status !== "pending") return false;
    const s = parseLocal(a.interview_date);
    if (!s) return false;
    const e = new Date(s.getTime() + (a.interview_minutes || 30) * 60000);
    return s < end && e > start;
  }) || null;
}
const fmtTime = (d) => formatTime(d, { tz: false });

// "Blk 5 Lot 12, Rizal St, Brgy. Muzon, San Jose Del Monte, Bulacan"
const addressLine = (a) =>
  [a.block_lot, a.street, a.subdivision, a.barangay && `Brgy. ${a.barangay}`, a.city, a.province, a.postal_code].filter(Boolean).join(", ");

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

// QR code of the public application form (/apply). People scan it with their
// phone, fill in the form, and the application shows up here as Pending ("QR").
function ApplyQrModal({ onClose }) {
  // Blank: the general form. An employee ID: that employee's referral link.
  const [referrer, setReferrer] = useState("");
  const code = /^EMP-\d{4,}$/i.test(referrer.trim()) ? referrer.trim().toUpperCase() : "";
  const url = applyUrl(code);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the link and copy it.");
    }
  };

  const print = () => printDocument(`<!doctype html><html><head><title>Apply at Bella Erin</title><style>${PRINT_BASE_CSS}
    body { font-family: Arial, sans-serif; color: #0f172a; text-align: center; }
    .sheet { padding-top: 22mm; }
    h1 { font-size: 34px; margin: 0 0 6px; letter-spacing: 1px; }
    h2 { font-size: 18px; font-weight: normal; margin: 0 0 18px; color: #334155; }
    img { width: 110mm; max-width: 80%; height: auto; }
    .steps { font-size: 15px; margin: 16px auto 0; max-width: 140mm; line-height: 1.6; }
    .url { font-family: monospace; font-size: 14px; margin-top: 10px; color: #0e7490; }
  </style></head><body><div class="sheet">
    <h1>WE'RE HIRING</h1><h2>Bella Erin · AT-ICE Purified Ice</h2>
    <img src="${qr}" alt="QR code" />
    <div class="steps">Scan with your phone camera, fill in the form and send.<br/>HR will contact you to set your interview.</div>
    <div class="url">${url}</div>
  </div></body></html>`);

  return (
    <Modal title="Application QR Code" onClose={onClose} width="max-w-sm">
      <div className="p-5 flex flex-col items-center gap-3 text-center">
        <p className="text-[12px] text-slate-500">
          Applicants scan this with their phone to fill in the job application form. Each one shows up here as <b>Pending</b>, marked <b>QR</b>.
        </p>
        <label className="w-full flex flex-col gap-1 text-left">
          <span className="text-[11px] text-slate-500">Referral QR for an employee (optional)</span>
          <input value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="Employee ID, e.g. EMP-0001"
            className="px-2.5 py-1.5 border border-black/[0.09] rounded-md text-xs font-mono" />
          <span className="text-[10px] text-slate-400">{code ? `Applicants who use this QR are recorded as referred by ${code}. Any referral bonus is added by Admin in payroll.` : "Leave blank for the general application QR."}</span>
        </label>
        <div className="w-60 h-60 rounded-lg border border-black/[0.09] bg-white flex items-center justify-center overflow-hidden">
          {qr ? <img src={qr} alt={`QR code for ${url}`} className="w-full h-full" /> : <span className="text-[11px] text-slate-400">Making the QR code…</span>}
        </div>
        <div className="w-full flex items-center gap-2 px-2.5 py-1.5 border border-black/[0.09] rounded-md bg-slate-50">
          <span className="flex-1 min-w-0 truncate text-[11px] font-mono text-slate-600" title={url}>{url}</span>
          <button type="button" onClick={copy} className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-700 cursor-pointer">{copied ? "Copied" : "Copy link"}</button>
        </div>
        {isLocalTesting() && (
          <p className="w-full text-left text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
            Testing on this computer: the phone must be on the same Wi-Fi/network as this computer. Once the system is online, the QR uses the website's address.
          </p>
        )}
        <div className="w-full grid grid-cols-2 gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-md border border-black/[0.09] text-xs font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-600 text-center">Open form</a>
          <button type="button" onClick={print} disabled={!qr} className="px-3 py-2 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50">Print poster</button>
        </div>
      </div>
    </Modal>
  );
}

// Shows the resume or CV an applicant attached (GET applicants/{id}/resume,
// HR only) in the attachment preview: a PDF or picture is shown, a Word file
// can be downloaded from there.
async function openResume(applicant) {
  try {
    await previewProtectedFile(`/api/applicants/${applicant.id}/resume`, applicant.resume_name || "resume");
  } catch (err) {
    toast.error(err.message === "The file is missing." ? "This resume file is missing." : "The resume could not be opened.");
  }
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
  const [showQr, setShowQr] = useState(false);

  // Add / edit
  // Kept as a draft while the modal is open, so a refresh reopens it as it was
  // (the resume file itself cannot be kept and has to be attached again).
  const formDraft = useDraft("applicants:form", { editing: null, form: EMPTY_FORM }, { when: (v) => !!v.editing });
  const { editing, form } = formDraft.values; // editing: null = closed, {} = new, applicant = edit
  const { editing: setEditing, form: setForm } = formDraft.set;
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const handleAddress = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), [setForm]);
  // Name, mobile number, email and address read from a PDF or Word resume.
  // The resume itself is attached to the applicant when it is saved.
  const handleScan = (result, file) => setForm((f) => ({
    ...f,
    resumeFile: file && RESUME_FILE.test(file.name) ? file : f.resumeFile,
    ...filledFrom(result, { phone: "phone", email: "email" }),
    ...(result.person?.last_name ? { name: fullName(result.person) } : {}),
  }));

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
      interview_minutes: String(a.interview_minutes || 30),
      notes: a.notes || "",
      resumeFile: null,
      removeResume: false,
      ...Object.fromEntries(ADDRESS_KEYS.map((k) => [k, a[k] || ""])),
    });
    setFormError("");
    setEditing(a);
  };
  const isNew = editing && !editing.id;
  // Schedule can be set or changed only while the applicant is still pending
  const canEditSchedule = isNew || editing?.status === "pending";
  const scheduleChanged = !isNew && editing && (form.interview_date !== toInputValue(editing.interview_date) || Number(form.interview_minutes) !== (editing.interview_minutes || 30));
  const clash = editing && canEditSchedule && (isNew || scheduleChanged)
    ? interviewClash(applicants, form.interview_date, Number(form.interview_minutes), editing.id)
    : null;
  const interviewEnds = parseLocal(form.interview_date) && new Date(parseLocal(form.interview_date).getTime() + Number(form.interview_minutes) * 60000);

  const submitForm = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) return setFormError("Enter the applicant's name.");
    if (!form.position_applied.trim()) return setFormError("Choose the position applied for.");
    if (form.phone && !MOBILE_REGEX.test(form.phone)) return setFormError(MOBILE_MESSAGE);
    if ((isNew || scheduleChanged) && form.interview_date && form.interview_date <= nowInputValue()) {
      return setFormError("The interview date and time must be in the future.");
    }
    if (clash) {
      const s = parseLocal(clash.interview_date);
      return setFormError(`This overlaps ${clash.name}'s interview (${fmtTime(s)}–${fmtTime(new Date(s.getTime() + (clash.interview_minutes || 30) * 60000))}). Pick another time.`);
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: toStoredPhone(form.phone) || null,
      position_applied: form.position_applied.trim(),
      notes: form.notes.trim() || null,
      ...Object.fromEntries(ADDRESS_KEYS.map((k) => [k, String(form[k] || "").trim() || null])),
    };
    // Send the schedule only when it is editable, so a non-pending record is never rescheduled
    if (canEditSchedule) {
      payload.interview_date = form.interview_date || null;
      payload.interview_minutes = Number(form.interview_minutes) || 30;
    }

    // The saved resume is removed only when no new one replaces it.
    if (!isNew && form.removeResume && !form.resumeFile) payload.remove_resume = true;

    // With a resume attached the form goes as multipart (PUT is sent as POST + _method).
    const send = (url, method) => {
      if (!form.resumeFile) return api(url, { method, body: JSON.stringify(payload) });
      const body = new FormData();
      for (const [k, v] of Object.entries(payload)) if (v !== null && v !== undefined) body.append(k, v);
      body.append("resume", form.resumeFile);
      if (method !== "POST") body.append("_method", method);
      return api(url, { method: "POST", body });
    };

    setSaving(true);
    try {
      if (isNew) {
        await send("/api/applicants", "POST");
        setNotice(form.interview_date ? "Applicant added and interview scheduled." : "Applicant added.");
        toast.success("Applicant was added.");
      } else {
        await send(`/api/applicants/${editing.id}`, "PUT");
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

  const pager = usePagination(filtered);

  return (
    <HrLayout
      pageTitle="Interviews"
      breadcrumb="HRIS / Interviews"
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
            onClick={() => setShowQr(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 border border-cyan-500/50 text-cyan-700 hover:bg-cyan-50 text-xs font-semibold rounded-md cursor-pointer transition-colors"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h7M21 17v4" strokeLinecap="round" /></svg>
            Application QR
          </button>
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
                  {pager.pageItems.map((a) => {
                    const hint = scheduleHint(a);
                    return (
                      <tr key={a.id} className="border-b border-black/[0.06] last:border-b-0 hover:bg-slate-50">
                        <td className="px-[18px] py-2.5">
                          <div className="text-slate-800 font-medium whitespace-nowrap">
                            {a.name}
                            {a.resume_name && (
                              <button type="button" onClick={() => openResume(a)} title={`Open resume: ${a.resume_name}`} className="ml-1.5 align-middle px-1.5 py-px rounded bg-violet-50 border border-violet-200 text-[9px] font-bold text-violet-700 cursor-pointer hover:bg-violet-100">CV</button>
                            )}
                            {(a.possible_duplicates || []).length > 0 && (
                              <button type="button" onClick={() => setViewing(a)} title="Same name and address as another application with a different email"
                                className="ml-1.5 align-middle px-1.5 py-px rounded bg-red-50 border border-red-200 text-[9px] font-bold text-red-700 cursor-pointer">POSSIBLE DUPLICATE</button>
                            )}
                            {a.source === "qr" && <span title="Applied through the QR code form" className="ml-1.5 align-middle px-1.5 py-px rounded bg-cyan-50 border border-cyan-200 text-[9px] font-bold text-cyan-700">QR</span>}
                          </div>
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
              <Pagination pager={pager} />
            </div>
          )}
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {editing && (
        <Modal title={isNew ? "Add Applicant" : "Edit Applicant"} onClose={() => !saving && setEditing(null)}>
          <form onSubmit={submitForm} className="p-5 flex flex-col gap-3.5">
            <DraftHint draft={formDraft} />
            <ScanDropZone kind="resume" onScan={handleScan} onRemove={() => setForm((f) => ({ ...f, resumeFile: null }))} fills="name, mobile number, email and address. The resume is attached to the applicant" />
            {form.resumeFile ? (
              <div className="text-[11px] text-slate-500 -mt-1">
                Resume to attach: <span className="font-medium text-slate-700">{form.resumeFile.name}</span>
                {editing.resume_name && <> (replaces {editing.resume_name})</>}
                <button type="button" onClick={() => setForm((f) => ({ ...f, resumeFile: null }))} aria-label="Remove the resume to attach" className="ml-1.5 text-red-600 hover:underline cursor-pointer">✕ Remove</button>
              </div>
            ) : editing.resume_name ? (
              <div className="text-[11px] text-slate-500 -mt-1">
                {form.removeResume ? (
                  <>Saved resume <span className="line-through">{editing.resume_name}</span> will be removed when you save. <button type="button" onClick={() => setForm((f) => ({ ...f, removeResume: false }))} className="ml-1 text-cyan-700 hover:underline cursor-pointer">Undo</button></>
                ) : (
                  <>Saved resume: <button type="button" onClick={() => openResume(editing)} className="font-medium text-cyan-700 hover:underline cursor-pointer">{editing.resume_name}</button> <button type="button" onClick={() => setForm((f) => ({ ...f, removeResume: true }))} aria-label="Remove the saved resume" className="ml-1.5 text-red-600 hover:underline cursor-pointer">✕ Remove</button> <span className="text-slate-400">or drop a new file above to replace it.</span></>
                )}
              </div>
            ) : null}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 text-[12px] font-semibold text-slate-700">Address (optional)</div>
              <AddressFields
                value={form}
                onChange={handleAddress}
                inputClassName={`w-full min-w-0 ${inputClass} disabled:opacity-60`}
                labelClassName="text-[11px] font-medium text-slate-500"
              />
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
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="datetime-local"
                  value={form.interview_date}
                  min={canEditSchedule ? nowInputValue() : undefined}
                  disabled={!canEditSchedule}
                  onChange={(e) => setForm({ ...form, interview_date: e.target.value })}
                  className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
                />
                <select
                  aria-label="Interview length"
                  value={form.interview_minutes}
                  disabled={!canEditSchedule}
                  onChange={(e) => setForm({ ...form, interview_minutes: e.target.value })}
                  className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
                >
                  {INTERVIEW_MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
              {canEditSchedule && interviewEnds && !clash && (
                <span className="text-[10px] text-slate-400">Ends about {fmtTime(interviewEnds)}. Interviews may not overlap.</span>
              )}
              {clash && (
                <span className="text-[10px] text-red-600">
                  Overlaps {clash.name}'s interview ({fmtTime(parseLocal(clash.interview_date))}–{fmtTime(new Date(parseLocal(clash.interview_date).getTime() + (clash.interview_minutes || 30) * 60000))}). Pick another time.
                </span>
              )}
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

      {showQr && <ApplyQrModal onClose={() => setShowQr(false)} />}

      {/* DETAIL MODAL */}
      {viewing && (
        <Modal title="Applicant Details" onClose={() => setViewing(null)}>
          <div className="p-5 flex flex-col gap-2.5 text-xs">
            {[
              ["Name", viewing.name],
              ["Position Applied", viewing.position_applied],
              ["Phone", viewing.phone || "—"],
              ["Email", viewing.email || "—"],
              ["Applied Through", viewing.source === "qr" ? "QR code form (filled in by the applicant)" : "Added by HR"],
              ["Submitted", fmtDateTime(viewing.created_at)],
              ["Referred By", viewing.referred_by ? `${viewing.referred_by.employee_id} · ${[viewing.referred_by.first_name, viewing.referred_by.last_name].filter(Boolean).join(" ")}` : "—"],
              ["Possible Duplicate", (viewing.possible_duplicates || []).length === 0 ? "—" : (
                <span className="flex flex-col gap-1">
                  {viewing.possible_duplicates.map((d) => (
                    <button key={d.id} type="button" onClick={() => setViewing(applicants.find((x) => x.id === d.id) || viewing)} className="text-left text-red-700 hover:underline cursor-pointer">
                      {d.name} · {d.email || "no email"} · sent {fmtDateTime(d.created_at)} ({d.status})
                    </button>
                  ))}
                  <span className="text-[10px] text-slate-400">Same name and address with a different email. Decide which application is valid.</span>
                </span>
              )],
              ["Resume / CV", viewing.resume_name
                ? <button type="button" onClick={() => openResume(viewing)} className="text-cyan-600 hover:underline font-medium cursor-pointer text-left break-all">{viewing.resume_name}</button>
                : "—"],
              ["Address", addressLine(viewing) || "—"],
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