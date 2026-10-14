import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import bgImage from "../assets/iceproduct.png";
import logo from "../assets/logo.png";
import PhoneInput from "../components/PhoneInput";
import AddressFields from "../components/AddressFields";
import { MOBILE_REGEX, MOBILE_MESSAGE, toStoredPhone } from "../lib/phone";
import { APPLICANT_POSITIONS } from "../lib/positions";

// Public job application form, opened by scanning the QR code that HR prints
// from HRIS > Interviews. No login. Sends POST /api/apply; the application
// shows up in HRIS > Interviews as Pending (marked "QR") with a live notice.
// The resume or CV they attach is kept private; only HR can open it.

// Resume or CV: a PDF or a Word file only, up to 5 MB (same rule as the server).
const RESUME_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const RESUME_MAX = 5 * 1024 * 1024;
const isResumeFile = (file) => /\.(pdf|docx?)$/i.test(file.name);

const labelCls = "text-[11px] font-semibold text-[var(--neu-muted)] tracking-widest uppercase";
const fieldCls = "neu-inset w-full min-h-[46px] rounded-xl px-4 py-2.5 bg-transparent text-[16px] text-slate-800 placeholder:text-[var(--neu-faint)] outline-none disabled:opacity-60";
const primaryBtn =
  "mt-1 w-full min-h-[48px] py-3 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-900 text-[16px] font-semibold rounded-xl transition-[background-color,box-shadow] duration-150 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-[5px_5px_12px_var(--neu-lo),-5px_-5px_12px_var(--neu-hi)]";

const EMPTY = {
  name: "", phone: "", email: "", position_applied: "", notes: "", website: "",
  block_lot: "", street: "", subdivision: "", barangay: "", barangay_code: "",
  city: "", province: "", region: "", postal_code: "",
};

export default function ApplyPage() {
  // Opened from an employee's referral link: /job-applications/EMP-0001
  const { referrer = "" } = useParams();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [resume, setResume] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const handleAddress = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const errs = {};
    if (form.name.trim().length < 3) errs.name = ["Enter your full name."];
    if (!MOBILE_REGEX.test(form.phone)) errs.phone = [form.phone ? MOBILE_MESSAGE : "Enter your mobile number so HR can contact you."];
    if (!form.position_applied) errs.position_applied = ["Choose the position you are applying for."];
    if (resume && resume.size > RESUME_MAX) errs.resume = ["The resume is too large. Use a file up to 5 MB."];
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      // Sent as a form with the file; blank fields are left out.
      const body = new FormData();
      for (const [k, v] of Object.entries({ ...form, phone: toStoredPhone(form.phone) })) {
        const value = String(v ?? "").trim();
        if (value) body.append(k, value);
      }
      if (referrer) body.append("referral", referrer);
      if (resume) body.append("resume", resume);
      const res = await fetch("/api/apply", { method: "POST", headers: { Accept: "application/json" }, body });
      const data = await res.json().catch(() => null);
      if (res.status === 422 && data?.errors) {
        setErrors(data.errors);
        return;
      }
      if (res.status === 413) throw new Error("The resume is too large. Use a file up to 5 MB.");
      if (res.status === 429) throw new Error("Too many applications were sent from this network. Wait a few minutes and try again.");
      if (!res.ok) throw new Error(data?.message || "The application could not be sent. Try again.");
      setSent(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const err = (k) => errors[k] && <span className="text-[12px] text-red-600">{errors[k][0]}</span>;

  return (
    <div className="relative w-full min-h-[100dvh] flex items-start justify-center overflow-y-auto">
      <div className="fixed inset-0" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-cyan-900/40" />

      <div className="relative z-10 w-full max-w-lg px-4 py-8 sm:py-10">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="brand-logo w-20 h-20 bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
            <img src={logo} alt="AT-ICE logo" className="w-full h-full object-contain p-2" />
          </div>
          <div className="text-[26px] font-semibold text-white tracking-wide leading-none mt-3">Bella Erin</div>
          <div className="text-[11px] text-cyan-400/80 tracking-[0.2em] uppercase mt-1.5">AT-ICE · We're hiring</div>
        </div>

        <div className="neu rounded-[28px] shadow-2xl shadow-black/40 bg-[var(--neu-bg)] px-5 sm:px-8 py-7 flex flex-col gap-4">
          {sent ? (
            <div className="text-center flex flex-col items-center gap-3 py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h1 className="text-[22px] font-bold text-[var(--neu-accent)]">Application sent</h1>
              <p className="text-[14px] text-[var(--neu-muted)] max-w-xs">
                Thank you, {form.name.trim().split(/\s+/)[0]}! HR received your application for <b className="text-slate-700">{form.position_applied}</b> and will contact you at +63 {form.phone} to set your interview.
              </p>
              <button type="button" onClick={() => { setForm(EMPTY); setResume(null); setSent(false); setErrors({}); }} className="text-[13px] font-medium text-[var(--neu-accent)] hover:underline cursor-pointer mt-1">
                Send another application
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <div className="text-center mb-1">
                <h1 className="text-[22px] font-bold text-[var(--neu-accent)] tracking-wide">Job application</h1>
                <p className="text-[13px] text-[var(--neu-muted)] mt-1">Fill in your details. HR will contact you to set an interview.</p>
              </div>

              <label className="flex flex-col gap-2">
                <span className={labelCls}>Full Name *</span>
                <input value={form.name} onChange={set("name")} autoComplete="name" maxLength={255} placeholder="Juan Dela Cruz" className={fieldCls} />
                {err("name")}
              </label>

              <label className="flex flex-col gap-2">
                <span className={labelCls}>Mobile Number *</span>
                <PhoneInput value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} className={fieldCls} invalid={!!form.phone && !MOBILE_REGEX.test(form.phone)} />
                {err("phone")}
              </label>

              <label className="flex flex-col gap-2">
                <span className={labelCls}>Email (optional)</span>
                <input type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} maxLength={255} placeholder="name@example.com" className={fieldCls} />
                {err("email")}
              </label>

              <label className="flex flex-col gap-2">
                <span className={labelCls}>Position *</span>
                <select value={form.position_applied} onChange={set("position_applied")} className={fieldCls}>
                  <option value="">Choose a position</option>
                  {APPLICANT_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {err("position_applied")}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`sm:col-span-2 ${labelCls}`}>Home Address (optional)</div>
                <AddressFields value={form} onChange={handleAddress} errors={errors} inputClassName={fieldCls} labelClassName="text-[12px] text-[var(--neu-muted)]" />
              </div>

              <div className="flex flex-col gap-2">
                <span className={labelCls}>Resume / CV (optional)</span>
                <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-cyan-500/40 ${resume ? "border-cyan-500/60 bg-cyan-50/40" : "border-[var(--neu-faint)]/50 hover:border-cyan-500/60"}`}>
                  <input
                    type="file"
                    accept={RESUME_ACCEPT}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      if (!isResumeFile(f)) {
                        setErrors((prev) => ({ ...prev, resume: ["Attach your resume as a PDF or a Word file (DOC, DOCX)."] }));
                        return;
                      }
                      setErrors((prev) => ({ ...prev, resume: undefined }));
                      setResume(f);
                    }}
                  />
                  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true" className="text-cyan-600 flex-shrink-0">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" /><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium text-slate-700 truncate">{resume ? resume.name : "Attach your resume or CV"}</span>
                    <span className="block text-[12px] text-[var(--neu-muted)]">{resume ? `${(resume.size / 1024 / 1024).toFixed(1)} MB · tap to change` : "PDF or Word · up to 5 MB"}</span>
                  </span>
                  {resume && (
                    <button type="button" onClick={(e) => { e.preventDefault(); setResume(null); }} className="text-[12px] font-medium text-red-600 hover:underline cursor-pointer">Remove</button>
                  )}
                </label>
                {err("resume")}
              </div>

              <label className="flex flex-col gap-2">
                <span className={labelCls}>Message to HR (optional)</span>
                <textarea value={form.notes} onChange={set("notes")} rows={3} maxLength={1000} placeholder="e.g. work experience, when you can start" className={`${fieldCls} resize-none`} />
              </label>

              {/* Left empty by people; bots fill it (spam guard) */}
              <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

              {error && <div role="alert" className="text-[13px] text-red-700 bg-red-100/70 border border-red-300/60 rounded-xl px-4 py-3 text-center">{error}</div>}
              <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Sending…" : "Send Application"}</button>
              <p className="text-[11px] text-[var(--neu-faint)] text-center">Your details are used only by Bella Erin HR for this application.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
